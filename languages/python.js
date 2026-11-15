// VUS-OS language: Python 3, running inside this browser tab with Pyodide (Python compiled to WebAssembly).
// Installed from the Terminal with:  install python     Run with:  py file.py   or   py -c "print(1 + 1)"
// A language file is an ES module whose default export is { id, name, version, runtime, install(h), uninstall(), run(o) }.
// The Terminal downloads this file, keeps it in VUS-OS storage and calls it. Only the one-time download uses the internet.

const PY_VERSION = "0.26.4"; // change this to move to a newer Pyodide (the Terminal then re-downloads the runtime on the next install)
const BASE = "https://cdn.jsdelivr.net/pyodide/v" + PY_VERSION + "/full/";
const CACHE = "vus-python-" + PY_VERSION; // the downloaded runtime lives in the browser's Cache Storage under this name
const FILES = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const TYPES = { js: "text/javascript", wasm: "application/wasm", zip: "application/zip", json: "application/json" };

// ---------- these two functions run inside the worker (and are tested on their own) ----------

function cleanTrace(msg, name) { // hides Pyodide's own internal lines from an error and names the script properly
  const out = [], ls = String(msg).split("\n");
  for (let i = 0; i < ls.length; i++) {
    if (/^\s*File "\/lib\/python[^"]*"/.test(ls[i]) && /_pyodide|pyodide\//.test(ls[i])) { while (i + 1 < ls.length && /^\s{4}/.test(ls[i + 1])) i++; continue; }
    out.push(ls[i]);
  }
  return out.join("\n").replace(/File "<exec>"/g, 'File "' + (name || "<string>") + '"').trim();
}

async function execute(py, m, post) { // m = { code, name, files: [{name, text}] }. Returns { ok, changed, skipped }
  const FS = py.FS, dir = "/home/pyodide", before = {};
  for (const n of FS.readdir(dir)) { if (n === "." || n === "..") continue; try { FS.unlink(dir + "/" + n); } catch (e) { /* folders stay */ } }
  for (const f of m.files || []) { if (!f.name || /[\/\\]/.test(f.name)) continue; before[f.name] = f.text; FS.writeFile(dir + "/" + f.name, f.text); }
  FS.chdir(dir);
  // the folder's own .py files can be imported, and edited ones are loaded again instead of an old copy
  py.runPython("import sys, builtins\nclass _VUSExit(BaseException): pass\ndef _vus_exit(code=None): raise _VUSExit(code)\nsys.exit = builtins.exit = builtins.quit = _vus_exit\nif '/home/pyodide' not in sys.path: sys.path.insert(0, '/home/pyodide')\nfor _k in [k for k, v in list(sys.modules.items()) if str(getattr(v, '__file__', '') or '').startswith('/home/pyodide')]: del sys.modules[_k]");
  try { await py.loadPackagesFromImports(m.code, { messageCallback: s => post("status", s), errorCallback: s => post("err", s) }); } catch (e) { /* if a package can't load, the import error shows when the code runs */ }
  post("status", "");
  let ok = true;
  const g = py.globals.get("dict")();
  g.set("__name__", "__main__"); g.set("__file__", m.name || "<string>");
  try { await py.runPythonAsync(m.code, { globals: g }); }
  catch (e) {
    const t = String((e && e.message) || e);
    const ex = t.match(/(^|\n)(_VUSExit|SystemExit)(: (\w+))?\s*$/); // sys.exit() and exit() end the program, they are not errors
    if (ex) { if (ex[4] && ex[4] !== "0" && ex[4] !== "None") { ok = false; post("err", "Exited with code " + ex[4]); } }
    else { ok = false; post("err", cleanTrace(t, m.name)); }
  }
  finally { g.destroy(); }
  const changed = [], skipped = [];
  for (const n of FS.readdir(dir)) {
    if (n === "." || n === "..") continue;
    const p = dir + "/" + n; let st; try { st = FS.stat(p); } catch (e) { continue; }
    if (!FS.isFile(st.mode)) continue;
    let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(FS.readFile(p)); } catch (e) { if (before[n] === undefined) skipped.push(n); continue; }
    if (before[n] === undefined || before[n] !== text) changed.push({ name: n, text });
  }
  return { ok, changed, skipped };
}

function workerMain() { // the whole Python world lives in this worker, so a stuck program can be stopped by ending the worker
  let py = null, base = "", cacheName = "";
  const post = (type, text) => postMessage({ type, text });
  const origFetch = self.fetch.bind(self), origImport = self.importScripts.bind(self), urlMap = {};
  self.fetch = async (input, init) => { // files from the saved runtime come from Cache Storage (so Python works offline); new ones are saved as they download
    const url = typeof input === "string" ? input : input.url;
    try {
      const c = await caches.open(cacheName), hit = await c.match(url);
      if (hit) return hit;
      const res = await origFetch(input, init);
      if (res.ok && url.startsWith(base) && !(init && init.method && init.method !== "GET")) c.put(url, res.clone()).catch(() => {});
      return res;
    } catch (e) { return origFetch(input, init); }
  };
  async function boot() {
    if (py) return;
    post("status", "Starting Python...");
    for (const f of ["pyodide.js", "pyodide.asm.js"]) {
      const r = await self.fetch(base + f);
      if (!r.ok) throw new Error("Could not load " + f + " (" + r.status + "). Try: install python");
      urlMap[base + f] = URL.createObjectURL(new Blob([await r.text()], { type: "text/javascript" }));
    }
    self.importScripts = (...u) => origImport(...u.map(x => urlMap[x] || x));
    self.importScripts(urlMap[base + "pyodide.js"]);
    py = await self.loadPyodide({ indexURL: base });
    py.setStdout({ batched: s => post("out", s) });
    py.setStderr({ batched: s => post("err", s) });
    py.setStdin({ stdin: () => undefined }); // input() isn't supported yet, it just sees an empty input
  }
  self.onmessage = async e => {
    const m = e.data;
    try {
      base = m.base; cacheName = m.cache;
      await boot();
      const r = await execute(py, m, post);
      postMessage({ type: "done", ok: r.ok, changed: r.changed, skipped: r.skipped });
    } catch (err) {
      postMessage({ type: "done", ok: false, changed: [], skipped: [], error: String((err && err.message) || err) });
    }
  };
}

const WORKER_SRC = [cleanTrace, execute].map(f => f.toString()).join("\n") + "\n(" + workerMain.toString() + ")();";

// ---------- the main-thread side ----------

let worker = null, idleTimer = null, busy = false;
function killWorker() { if (worker) { worker.terminate(); URL.revokeObjectURL(worker.url); worker = null; } }
function getWorker() {
  if (!worker) { const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })); worker = new Worker(url); worker.url = url; }
  return worker;
}

function run(o) { // o = { code, name, files, print, printErr, status }. Returns { done: Promise, stop() }
  if (busy) return { done: Promise.resolve({ ok: false, changed: [], skipped: [], error: "Python is already running a program. Wait for it, or stop it first." }), stop() {} };
  busy = true; clearTimeout(idleTimer);
  let resolve; const done = new Promise(r => resolve = r), w = getWorker();
  const finish = m => { if (!busy) return; busy = false; resolve(m); };
  w.onmessage = e => {
    const m = e.data;
    if (m.type === "out") o.print(m.text);
    else if (m.type === "err") o.printErr(m.text);
    else if (m.type === "status") o.status(m.text);
    else if (m.type === "done") { idleTimer = setTimeout(killWorker, 60000); finish(m); } // the worker stays ready for a minute so the next run starts fast
  };
  w.onerror = ev => { killWorker(); finish({ ok: false, changed: [], skipped: [], error: "Python stopped unexpectedly" + (ev && ev.message ? ": " + ev.message : "") + "." }); };
  w.postMessage({ code: o.code, name: o.name || "<string>", files: o.files || [], base: BASE, cache: CACHE });
  return { done, stop() { killWorker(); finish({ ok: false, stopped: true, changed: [], skipped: [] }); } };
}

const mb = n => (n / 1048576).toFixed(1) + " MB";

async function selfTest() { // runs one tiny program so a broken download shows up right at install time
  const out = [], h = run({ code: "print(6 * 7)", name: "test", files: [], print: t => out.push(t), printErr: t => out.push("error: " + t), status: () => {} });
  const r = await h.done; killWorker();
  return r.ok && out.join("").trim() === "42" ? null : (r.error || out.join(" ") || "no answer");
}

export default {
  id: "python", name: "Python", version: "1", runtime: "pyodide-" + PY_VERSION,

  async install(h) { // h = { say(text), status(text) }. Returns "installed" or "current" (nothing new was needed)
    for (const n of await caches.keys()) if (n.startsWith("vus-python-") && n !== CACHE) await caches.delete(n); // an older runtime is replaced
    const cache = await caches.open(CACHE), missing = [];
    for (const f of FILES) if (!(await cache.match(BASE + f))) missing.push(f);
    if (!missing.length) return "current";
    for (let i = 0; i < missing.length; i++) {
      const f = missing[i], r = await fetch(BASE + f), len = +r.headers.get("content-length") || 0, parts = []; let have = 0;
      if (!r.ok) throw new Error(`Couldn't download ${f} (${r.status} ${r.statusText}).`);
      if (r.body) {
        const rd = r.body.getReader();
        for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); have += value.length; h.status(`Downloading ${f} (${i + 1} of ${missing.length}): ${mb(have)}${len >= have ? " of " + mb(len) : ""}`); }
      } else parts.push(new Uint8Array(await r.arrayBuffer()));
      await cache.put(BASE + f, new Response(new Blob(parts), { headers: { "content-type": TYPES[f.split(".").pop()] || "application/octet-stream" } }));
    }
    h.status("Testing Python...");
    const bad = await selfTest();
    h.status(bad ? "" : "Test run worked.");
    if (bad) h.say("Warning: the test run failed: " + bad);
    return "installed";
  },

  async uninstall() {
    killWorker();
    for (const n of await caches.keys()) if (n.startsWith("vus-python-")) await caches.delete(n);
  },

  run,
  __test: { execute, cleanTrace }
};
