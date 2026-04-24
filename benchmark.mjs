import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const html = readFileSync(new URL("./index.html", import.meta.url));
const br = readFileSync(new URL("./index.html.br", import.meta.url));

const server = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-encoding": "br",
      "cache-control": "public, max-age=31536000, immutable",
      "content-length": br.length,
    });
    res.end(br);
    return;
  }
  res.writeHead(404).end();
});

server.listen(0, "127.0.0.1");
await once(server, "listening");
const localUrl = `http://127.0.0.1:${server.address().port}/`;

async function launch() {
  const child = spawn(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=/tmp/abe-speed-chrome-${Date.now()}-${Math.random()}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let endpoint = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", chunk => {
    const match = chunk.match(/DevTools listening on (ws:\/\/.*)/);
    if (match) endpoint = match[1].trim();
  });
  for (let i = 0; i < 100 && !endpoint; i++) await new Promise(r => setTimeout(r, 50));
  if (!endpoint) throw new Error("Chrome DevTools endpoint not found");
  return { child, endpoint };
}

async function cdp(endpoint) {
  const tabs = await fetch(endpoint.replace("ws://", "http://").replace(/\/devtools\/browser\/.*/, "/json/new"), { method: "PUT" }).then(r => r.json());
  const ws = new WebSocket(tabs.webSocketDebuggerUrl);
  await once(ws, "open");
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
    for (const listener of listeners) listener(msg);
  };
  const send = (method, params = {}) => new Promise(resolve => {
    const callId = ++id;
    pending.set(callId, resolve);
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  return { ws, send, onEvent: listener => listeners.add(listener) };
}

async function measure(url) {
  const { child, endpoint } = await launch();
  const { ws, send, onEvent } = await cdp(endpoint);
  let requests = 0;
  let encoded = 0;
  onEvent(msg => {
    if (msg.method === "Network.responseReceived") requests++;
    if (msg.method === "Network.loadingFinished") encoded += msg.params.encodedDataLength || 0;
  });
  await send("Network.enable");
  await send("Page.enable");
  const loaded = new Promise(resolve => {
    onEvent(msg => {
      if (msg.method === "Page.loadEventFired") resolve();
    });
  });
  const started = performance.now();
  await send("Page.navigate", { url });
  await loaded;
  const wall = performance.now() - started;
  const timing = await send("Runtime.evaluate", {
    returnByValue: true,
    expression: `JSON.stringify({
      domContentLoaded: performance.getEntriesByType("navigation")[0].domContentLoadedEventEnd,
      load: performance.getEntriesByType("navigation")[0].loadEventEnd,
      fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
      transfer: performance.getEntriesByType("resource").reduce((n,e)=>n+e.transferSize, performance.getEntriesByType("navigation")[0].transferSize)
    })`,
  });
  ws.close();
  child.kill();
  return { url, wall: Math.round(wall * 10) / 10, requests, encoded, ...JSON.parse(timing.result.result.value) };
}

const targets = [
  "https://abehiroshi.la.coocan.jp/",
  localUrl,
];
for (const url of targets) {
  const runs = [];
  for (let i = 0; i < 5; i++) runs.push(await measure(url));
  runs.sort((a, b) => a.load - b.load);
  console.log(JSON.stringify({ bestOf5: runs[0], all: runs }, null, 2));
}
server.close();
