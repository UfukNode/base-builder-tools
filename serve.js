"use strict";

const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const host = "127.0.0.1";
const port = Number.parseInt(process.env.PORT || process.argv[2] || "5173", 10);
const root = __dirname;
const safeRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
    const filePath = path.normalize(path.join(root, decodeURIComponent(pathname)));

    if (filePath !== root && !filePath.startsWith(safeRoot)) {
      send(response, 403, "Forbidden");
      return;
    }

    const extension = path.extname(filePath);
    const body = await fs.readFile(filePath);
    send(response, 200, body, contentTypes[extension] || "application/octet-stream");
  } catch (error) {
    if (error.code === "ENOENT") {
      send(response, 404, "Not found");
      return;
    }

    send(response, 500, "Server error");
  }
});

server.listen(port, host, () => {
  console.log(`Base Builder Tools running at http://${host}:${port}`);
});
