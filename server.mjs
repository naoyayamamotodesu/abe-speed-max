import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const html = readFileSync(new URL("./index.html", import.meta.url));
const br = readFileSync(new URL("./index.html.br", import.meta.url));
const gz = readFileSync(new URL("./index.html.gz", import.meta.url));
const port = Number(process.env.PORT || 4173);
const etag = `"${createHash("sha256").update(html).digest("base64url")}"`;

createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(204, { "cache-control": "no-store" }).end();
    return;
  }
  if (req.url !== "/") {
    res.writeHead(404).end();
    return;
  }
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, {
      etag,
      "cache-control": "public, max-age=31536000, immutable",
      vary: "Accept-Encoding",
    }).end();
    return;
  }
  const accept = req.headers["accept-encoding"] || "";
  const brotli = accept.includes("br");
  const gzip = !brotli && accept.includes("gzip");
  const body = brotli ? br : gzip ? gz : html;
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=31536000, immutable",
    etag,
    vary: "Accept-Encoding",
    "x-content-type-options": "nosniff",
    "content-length": body.length,
    ...(brotli ? { "content-encoding": "br" } : gzip ? { "content-encoding": "gzip" } : {}),
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(body);
}).listen(port, "127.0.0.1", () => {
  console.log(`Abe speed max: http://127.0.0.1:${port}/`);
});
