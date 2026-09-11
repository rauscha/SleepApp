// Drive headless Chromium over the DevTools protocol using Node's built-in
// WebSocket — no playwright package, nothing added to the repo.
const BASE = process.argv[2] || 'http://127.0.0.1:8931/index.html';
const PORT = 9331;

const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
const { webSocketDebuggerUrl } = await res.json();
const ws = new WebSocket(webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
    ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
  });

await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
};

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url: BASE }, sessionId);
await new Promise((r) => setTimeout(r, 1500));

const out = await send('Runtime.evaluate', {
  expression: 'window.__run().then(r => JSON.stringify(r))',
  awaitPromise: true,
  returnByValue: true,
  timeout: 120000,
}, sessionId);

if (out.exceptionDetails) {
  console.error('PAGE ERROR', JSON.stringify(out.exceptionDetails, null, 2));
  process.exit(1);
}
console.log(out.result.value);
ws.close();
process.exit(0);
