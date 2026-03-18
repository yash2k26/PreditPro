import { Worker } from "worker_threads";

console.log("--- Test: .mjs shim with tsx/esm/api register ---");
const w = new Worker(new URL("./src/workers/test-shim.mjs", import.meta.url));
w.on("message", (msg) => { console.log("OK:", msg); process.exit(0); });
w.on("error", (err) => { console.error("FAIL:", err.message); process.exit(1); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(1); }, 5000);
