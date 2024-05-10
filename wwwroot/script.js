const contentBlockerDOM = document.querySelector("#content-blocker");
const commandOutputDOM = document.querySelector("#cmd-output");
const variableDisplayList = {};
let socket = null;

const commandSubmitHandler = (e) => {
    e.preventDefault();
    try {
        const inputs = Array.from(e.target.querySelectorAll(".command-value")).map(v => v.value || "");
        const command = inputs.reduce((acc, val) => acc + " " + val, "");
        socket.send(JSON.stringify({ type: "command", id: 0, command }));
    } catch (e) {
        console.error("Failed to submit command:", e);
        commandOutputDOM.innerText = "Failed to send command";
    }
};

const socketMessageHandler = (e) => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
        case "status":
            if (msg.connected) {
                contentBlockerDOM.hidden = true;
            } else {
                contentBlockerDOM.hidden = false;
            }

            Object.keys(msg.serverVariables).forEach(key => {
                (variableDisplayList[key] || []).forEach(elm => elm.innerText = msg.serverVariables[key]);
            });
            break;
        case "result":
            commandOutputDOM.innerText = `${msg.error?"ERROR":""} CMD: ${msg.command}, Result: ${msg.result === ""?"OK":msg.result}`;
            break;
        default:
            console.warn("Received unknown message type:", msg.type);
            break;
    }
};

const createSocket = () => {
    contentBlockerDOM.hidden = false;
    if (socket !== null) {
        socket.close();
        socket = null;
    }

    const socketAddress = new URL(window.location);
    socketAddress.protocol = "ws";
    socket = new WebSocket(socketAddress.href);
    socket.onopen = () => { contentBlockerDOM.hidden = true; }
    socket.onmessage = socketMessageHandler;
    socket.onclose = () => { createSocket(); }
};

const addVariableDisplay = (display) => {
    const variable = display.dataset.var;
    if (variableDisplayList[variable] === undefined) {
        variableDisplayList[variable] = [];
    }

    variableDisplayList[variable].push(display);
};

document.querySelectorAll(".command-form").forEach(form => form.onsubmit = commandSubmitHandler);
document.querySelectorAll(".variable-display").forEach(addVariableDisplay);
createSocket();
