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

async function execute(py, m, post, ask) { // m = { code, name, files: [{name, text}] }. ask(prompt) = waits for a line typed in the Terminal. Returns { ok, changed, skipped }
  const FS = py.FS, dir = "/home/pyodide", before = {};
  const okPath = p => typeof p === "string" && p && !/\\/.test(p) && p[0] !== "/" && p.split("/").every(s => s && s !== "." && s !== ".."); // names like "data/a.txt" are folders inside the current folder
  const wipe = d => { for (const n of FS.readdir(d)) { if (n === "." || n === "..") continue; const p = d + "/" + n; try { if (FS.isDir(FS.stat(p).mode)) { wipe(p); FS.rmdir(p); } else FS.unlink(p); } catch (e) { /* leave what can't be removed */ } } };
  wipe(dir);
  for (const f of m.files || []) { if (!okPath(f.name)) continue; let d = dir; for (const s of f.name.split("/").slice(0, -1)) { d += "/" + s; try { FS.mkdir(d); } catch (e) { /* already there */ } } before[f.name] = f.text; FS.writeFile(dir + "/" + f.name, f.text); }
  FS.chdir(dir);
  // the folder's own .py files can be imported, and edited ones are loaded again instead of an old copy
  py.runPython("import sys, builtins\nclass _VUSExit(BaseException): pass\ndef _vus_exit(code=None): raise _VUSExit(code)\nsys.exit = builtins.exit = builtins.quit = _vus_exit\nif '/home/pyodide' not in sys.path: sys.path.insert(0, '/home/pyodide')\nfor _k in [k for k, v in list(sys.modules.items()) if str(getattr(v, '__file__', '') or '').startswith('/home/pyodide')]: del sys.modules[_k]");
  py.globals.set("_vus_argv", JSON.stringify([m.name && m.name !== "<string>" ? m.name : "-c"].concat(m.args || []))); // py file.py a b  ->  sys.argv == ["file.py", "a", "b"]
  py.runPython("import sys, json\nsys.argv = json.loads(_vus_argv)\ndel _vus_argv");
  if (ask && py._module && py._module.jspiSupported) { // input() pauses Python until the Terminal sends a line (needs a browser that can pause WebAssembly, e.g. recent Chrome/Edge)
    py.globals.set("_vus_ask", ask);
    py.runPython("import builtins\ntry:\n    from pyodide.ffi import run_sync\nexcept ImportError:\n    run_sync = None\nif run_sync:\n    def _vus_input(prompt=''):\n        try:\n            r = run_sync(_vus_ask(str(prompt)))\n        except RuntimeError:\n            raise EOFError('input() is not available in this browser')\n        if r is None:\n            raise EOFError('EOF when reading a line')\n        return r\n    builtins.input = _vus_input\nclass _VUSStdin:\n    def readline(self, size=-1):\n        try:\n            return input() + '\\n'\n        except EOFError:\n            return ''\n    def read(self, size=-1):\n        out = []\n        while True:\n            l = self.readline()\n            if not l: break\n            out.append(l)\n        return ''.join(out)\n    def __iter__(self): return self\n    def __next__(self):\n        l = self.readline()\n        if not l: raise StopIteration\n        return l\n    def isatty(self): return False\n    def fileno(self): return 0\nif run_sync:\n    sys.stdin = _VUSStdin()");
  }
  try { await py.loadPackagesFromImports(m.code, { messageCallback: s => post("status", s), errorCallback: s => post("err", s) }); } catch (e) { /* if a package can't load, the import error shows when the code runs */ }
  if (/\b(urllib|requests|http\.client)\b/.test(m.code + "\n" + (m.files || []).filter(f => /\.py$/i.test(f.name)).map(f => f.text).join("\n"))) { // urllib and requests can't open sockets in a browser: pyodide-http sends them through the browser's own networking instead
    try { await py.loadPackage("pyodide-http", { messageCallback: s => post("status", s), errorCallback: s => post("err", s) }); py.runPython("import pyodide_http\npyodide_http.patch_all()"); } catch (e) { /* offline or not available: the program then shows its own network error */ }
  }
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
  const scan = (d, pre) => { // every text file under the folder, including inside sub-folders (names like "data/a.txt")
    for (const n of FS.readdir(d)) {
      if (n === "." || n === ".." || n === "__pycache__") continue;
      const p = d + "/" + n, rel = pre + n; let st; try { st = FS.stat(p); } catch (e) { continue; }
      if (FS.isDir(st.mode)) { scan(p, rel + "/"); continue; }
      if (!FS.isFile(st.mode)) continue;
      let text; try { text = new TextDecoder("utf-8", { fatal: true }).decode(FS.readFile(p)); } catch (e) { if (before[rel] === undefined) skipped.push(rel); continue; }
      if (before[rel] === undefined || before[rel] !== text) changed.push({ name: rel, text });
    }
  };
  scan(dir, "");
  return { ok, changed, skipped };
}

function workerMain() { // the whole Python world lives in this worker, so a stuck program can be stopped by ending the worker
  let py = null, base = "", cacheName = "", pend = null;
  const post = (type, text) => postMessage({ type, text });
  const ask = p => new Promise(r => { pend = r; post("input", p); });
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
    py.setStdin({ stdin: () => undefined }); // fallback when the browser can't pause Python: input() then ends with EOF
  }
  self.onmessage = async e => {
    const m = e.data;
    if (m.type === "stdin") { if (pend) { const r = pend; pend = null; r(m.text); } return; } // a line typed for input()
    try {
      base = m.base; cacheName = m.cache;
      await boot();
      const r = await execute(py, m, post, ask);
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
    else if (m.type === "input") Promise.resolve(o.input ? o.input(m.text) : null).then(t => w.postMessage({ type: "stdin", text: t }), () => w.postMessage({ type: "stdin", text: null }));
    else if (m.type === "done") { idleTimer = setTimeout(killWorker, 60000); finish(m); } // the worker stays ready for a minute so the next run starts fast
  };
  w.onerror = ev => { killWorker(); finish({ ok: false, changed: [], skipped: [], error: "Python stopped unexpectedly" + (ev && ev.message ? ": " + ev.message : "") + "." }); };
  w.postMessage({ code: o.code, name: o.name || "<string>", files: o.files || [], args: o.args || [], base: BASE, cache: CACHE });
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
