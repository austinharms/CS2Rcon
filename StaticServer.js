const http = require("http");
const path = require("path");
const fs = require("fs");

const FILE_TYPE_MAP = Object.freeze({
    txt: "text/plain; charset=utf-8",
    json: "text/json; charset=utf-8",
    html: "text/html; charset=utf-8",
    js: "application/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    png: "image/png",
});

const getFileContentType = (file) => {
    const arr = file.split(".");
    const fileType = arr[arr.length - 1];
    return FILE_TYPE_MAP[fileType] || FILE_TYPE_MAP.txt;
};

const StaticServer = function (port, wwwRoot, defaultFile, ...files) {
    this.wwwRoot = wwwRoot;
    this.port = port;
    this.files = files.map(f => f.toLowerCase());
    this.defaultFile = defaultFile.toLowerCase();
    this.server = http.createServer(this._requestCallback.bind(this));
};

StaticServer.prototype._requestCallback = function (req, res) {
    try {
        const url = decodeURI(req.url || "").replace(/^(\/)/, "").toLowerCase();
        const file = path.join(this.wwwRoot, this.files.find(f => f == url) || this.defaultFile);
        const stat = fs.statSync(file);
        fs.createReadStream(file).pipe(res);
        res.writeHead(200, {
            "content-length": stat.size,
            "content-type": getFileContentType(file),
        });
    } catch (e) {
        try {
            res.writeHead(500, {
                "content-length": 12,
                "content-type": "text/plain; charset=utf-8",
            });
            res.end("Server Error");
        } catch (e) { }
        console.error("Failed to serve file request:", e);
    }
};

StaticServer.prototype.start = function () {
    const self = this;
    return new Promise((a, r) => {
        self.server.once("error", r);
        self.server.listen(self.port, a);
    });
};

StaticServer.prototype.stop = function () {
    this.server.close();
};

StaticServer.prototype.waitForExit = function () {
    const self = this;
    return new Promise(a => self.server.once("close", a));
};

module.exports = StaticServer;
