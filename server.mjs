import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url));
const br = readFileSync(new URL("./index.html.br", import.meta.url));
const gz = readFileSync(new URL("./index.html.gz", import.meta.url));
const port = Number(process.env.PORT || 4173);

createServer((req, res) => {
  if (req.url !== "/") {
    res.writeHead(404).end();
    return;
  }
  const accept = req.headers["accept-encoding"] || "";
  const brotli = accept.includes("br");
  const gzip = !brotli && accept.includes("gzip");
  const body = brotli ? br : gzip ? gz : html;
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "public, max-age=31536000, immutable",
    "content-length": body.length,
    ...(brotli ? { "content-encoding": "br" } : gzip ? { "content-encoding": "gzip" } : {}),
  });
  res.end(body);
}).listen(port, "127.0.0.1", () => {
  console.log(`Abe speed max: http://127.0.0.1:${port}/`);
});
