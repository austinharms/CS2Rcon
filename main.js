const RCon = require("./RCon");
const StaticServer = require("./StaticServer");
const ws = require("ws");
const path = require("path");

// Defaults args
const cli_args = {
    port: "27015",
    password: "0",
    address: "127.0.0.1",
    webport: "8080"
};

// Parse command line args
let active_arg = null;
process.argv.slice(2).forEach(arg => {
    if (arg.startsWith("-")) {
        active_arg = arg.substring(1);
        cli_args[active_arg] = ""
    } else if (active_arg) {
        // Preserve spaces if not the first arg added
        cli_args[active_arg] += (cli_args[active_arg] === ""?"":" ") + arg;
    }
});

const rcon = new RCon(cli_args.address, parseInt(cli_args.port), cli_args.password);
const webserver = new StaticServer(parseInt(cli_args.webport), path.join(__dirname, "wwwroot"), "index.html", "script.js", "style.css");
const websocket = new ws.WebSocketServer({ server: webserver.server });
const serverVariableValues = {};
// List of polled server variables
const serverVariables = [
    "sv_cheats",
    "bot_chatter",
    "bot_zombie",
    "bot_quota",
    "bot_difficulty",
    "mp_buy_anywhere",
    "mp_buytime",
    "mp_maxmoney",
    "mp_startmoney",
    "mp_afterroundmoney",
    "ammo_grenade_limit_breachcharge",
    "ammo_grenade_limit_bumpmine",
    "ammo_grenade_limit_default",
    "ammo_grenade_limit_flashbang",
    "ammo_grenade_limit_snowballs",
    "ammo_grenade_limit_total",
    "ammo_grenade_limit_tripwirefire",
    "game_mode",
    "game_type",
    "sv_skirmish_id",
    "sv_game_mode_flags",
    "mp_autokick",
    "mp_suicide_penalty",
    "ai_disabled",
];

const pollVariables = async () => {
    try {
        if (!rcon.connected()) {
            console.log("Reconnecting RCon");
            await rcon.connect()
        }

        // Create command to poll variables
        const cmd = serverVariables.reduce((acc, cur) => acc + ";" + cur, "");
        const res = await rcon.send(cmd);
        // Parse the results, expected format: key = value pairs are split by newlines
        res.split("\n").map(v => v.split(" = ")).reduce((acc, [key, value]) => { acc[key] = value; return acc; }, serverVariableValues);
    } catch (e) {
        console.error("Failed to poll server variables:", e);
    }

    try {
        // Send new values to all connected clients
        const status = JSON.stringify({ type: "status", connected: rcon.connected(), serverVariables: serverVariableValues });
        websocket.clients.forEach(client => client.send(status));
    } catch (e) {
        console.error("Failed to send status update");
    }

    setTimeout(pollVariables, 1000);
};

// Process request from connected clients
const socketCommandCallback = async function (data) {
    try {
        const request = JSON.parse(data);
        if (request.type !== "command" || !request.command) {
            return;
        }

        if (!rcon.connected()) {
            console.log("Reconnecting RCon");
            await rcon.connect()
        }

        // Execute the command and parse the results
        const result = await rcon.send(request.command)
            .then(res => ({ type: "result", id: request.id || null, command: request.command, result: res, error: false }))
            .catch(err => ({ type: "result", id: request.id || null, command: request.command, result: err, error: true }));
        // Send the results to the requesting client only
        this.send(JSON.stringify(result));
    } catch (e) {
        console.error("Failed process command:", e);
    }
};

(async () => {
    await rcon.connect();
    console.log("RCon Connected:", rcon.address, ":", rcon.port);
    await pollVariables();
    websocket.on("connection", c => c.on("message", socketCommandCallback));
    await webserver.start();
    console.log("Server Ready:", webserver.port);
    await webserver.waitForExit();
    console.log("Server Closed");
    rcon.disconnect();
    console.log("RCon disconnected");
})();

