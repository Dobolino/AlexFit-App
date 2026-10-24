const http = require("node:http"),
  fs = require("node:fs/promises"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  port = Number(process.env.PORT) || 8778;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
};
http
  .createServer(async (req, res) => {
    try {
      const relative =
        decodeURIComponent(new URL(req.url, "http://localhost").pathname).slice(
          1,
        ) || "index.html";
      const file = path.resolve(root, relative);
      if (
        !file.startsWith(root + path.sep) ||
        relative.split(/[\\/]/).some((part) => part.startsWith(".")) ||
        relative.startsWith("node_modules/")
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await fs.readFile(file);
      res.writeHead(200, {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch (e) {
      res.writeHead(404);
      res.end("Datei nicht gefunden");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log("AlexFit: http://127.0.0.1:" + port),
  );
