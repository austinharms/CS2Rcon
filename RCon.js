const net = require("net");

const EMPTY_BUFFER = Buffer.from([]);

const PACKET_TYPE = Object.freeze({
    SERVERDATA_AUTH: 3,
    SERVERDATA_AUTH_RESPONSE: 2,
    SERVERDATA_EXECCOMMAND: 2,
    SERVERDATA_RESPONSE_VALUE: 0,
});

const toErrorMessage = (e, defaultMsg = "Error") => {
    console.log(e);
    let msg = (e || {}).message || defaultMsg;
    if (typeof (e) === "string") {
        msg = e;
    }

    return msg;
};

const parseRConPacket = (packetBuffer) => {
    try {
        if (packetBuffer.byteLength < 14) {
            throw new Error("Packet too small");
        }

        const size = packetBuffer.readInt32LE(0);
        if (packetBuffer.byteLength - 4 !== size) {
            throw new Error("Packet size and header size not equal");
        }

        if (packetBuffer.readInt8(size + 3) !== 0 || packetBuffer.readInt8(size + 2) !== 0) {
            throw new Error("Packet was not null null terminated");
        }

        return {
            size,
            id: packetBuffer.readInt32LE(4),
            type: packetBuffer.readInt32LE(8),
            body: Buffer.copyBytesFrom(packetBuffer, 12, size - 10)
        };
    } catch (e) {
        console.error("Failed to parse packet:", e);
        return null;
    }
};

const createRConPacket = (id, type, body) => {
    try {
        const bodyBuffer = Buffer.from(body, "ascii");
        const size = bodyBuffer.byteLength + 10;
        const header = Buffer.copyBytesFrom(Int32Array.from([size, id, type]));
        const footer = Uint8Array.from([0, 0]);
        return Buffer.concat([header, bodyBuffer, footer]);
    } catch (e) {
        console.error("Failed to create RCon packet:", e);
        return null;
    }
};

const createRConSocket = async (address, port, password) => {
    let socket = null;
    try {
        socket = new net.Socket();
        await new Promise((a, r) => {
            socket.once("error", r);
            socket.once("connect", a);
            socket.connect(port, address);
        });
        const loginPacket = createRConPacket(0, PACKET_TYPE.SERVERDATA_AUTH, password);
        const responsePacket = new Promise((a, r) => {
            socket.once("data", buffer => a(parseRConPacket(buffer)));
            socket.once("error", r);
            socket.once("close", r);
        });
        await new Promise((a, r) => socket.write(loginPacket, e => e ? r(e) : a()));
        const response = await responsePacket;
        if (response.id !== 0) {
            throw new Error("Bad Password");
        }

        return socket;
    } catch (e) {
        if (socket) {
            socket.destroy();
        }

        throw toErrorMessage(e, "Failed to Create Socket");
    }
};

const RCon = function (address, port, password) {
    this.address = address;
    this.port = port;
    this._password = password;
    this._socket = null;
    this._commandQueue = [];
    this._activeCommand = null;
    this._commandCounter = 1;
};

RCon.prototype._socketDataCallback = function (buffer) {
    if (this._activeCommand === null) {
        console.warn("Received socket data when no command was active");
        return;
    }

    const cmd = this._activeCommand;
    try {
        cmd.buffer = Buffer.concat([cmd.buffer, buffer]);
        const packetSize = cmd.buffer.readInt32LE();
        if (cmd.buffer.byteLength >= packetSize) {
            const packet = parseRConPacket(cmd.buffer);
            if (packet === null) {
                cmd.reject("Failed to Parse Response");
            } else if (packet.id !== cmd.id) {
                cmd.reject("Received Incorrect Response")
            } else {
                cmd.accept(packet.body);
            }
        }
    } catch (e) {
        cmd.reject(toErrorMessage(e, "Error Parsing Response"));
    }
};

RCon.prototype._processQueue = function () {
    if (this._activeCommand !== null || this._commandQueue.length === 0) {
        return;
    }

    const self = this;
    const cmd = this._commandQueue.shift();
    this._activeCommand = cmd;
    if (!this.connected()) {
        cmd.reject("Socket Disconnected");
    } else {
        try {
            setTimeout(() => cmd.reject("Response Timeout"), 5000);
            const commandPacket = createRConPacket(cmd.id, PACKET_TYPE.SERVERDATA_EXECCOMMAND, cmd.command);
            new Promise((a, r) => self._socket.write(commandPacket, e => e ? r(e) : a())).catch(e => cmd.reject(toErrorMessage(e, "Error Sending Command")));
        } catch (e) {
            cmd.reject(toErrorMessage(e, "Error Processing Command"));
        }
    }
};

RCon.prototype.connected = function () {
    return this._socket && this._socket.readyState == "open";
};

RCon.prototype.connect = async function () {
    if (this.connected()) {
        return true;
    }

    this.disconnect();
    try {
        this._socket = await createRConSocket(this.address, this.port, this._password);
        this._socket.once("error", this.disconnect.bind(this));
        this._socket.once("close", this.disconnect.bind(this));
        this._socket.on("data", this._socketDataCallback.bind(this));
        return true;
    } catch (e) {
        this._socket = null;
        throw toErrorMessage(e, "Failed to Create Socket");
    }
};

RCon.prototype.disconnect = function (msg) {
    if (this._socket) {
        this._socket.destroy();
        this._socket = null;
    }

    if (this._activeCommand !== null) {
        this._activeCommand.reject(toErrorMessage(msg, "Socket Disconnected"));
    }
};

RCon.prototype.send = async function (command) {
    const cmdObject = { command, buffer: EMPTY_BUFFER, id: this._commandCounter++ };
    if (this._commandCounter > 2000000) {
        this._commandCounter = 1;
    }

    cmdObject.promise = new Promise((a, r) => { cmdObject.accept = a; cmdObject.reject = r; });
    this._commandQueue.push(cmdObject);
    this._processQueue();
    const result = await cmdObject.promise.then(buffer => ({ ok: true, response: buffer.toString("ascii") })).catch(response => ({ ok: false, response }));
    if (this._activeCommand == cmdObject) {
        this._activeCommand = null;
        this._processQueue();
    }

    if (result.ok) {
        return result.response;
    } else {
        throw result.response;
    }
};

module.exports = RCon;
