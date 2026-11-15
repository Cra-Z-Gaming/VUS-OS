// VUS-OS language: JavaScript, run in a Web Worker (so a stuck program can be stopped, and it can't touch the OS page).
// Installed from the Terminal with:  install javascript     Run with:  js file.js   or   js -c "console.log(1 + 1)"
// A language file is an ES module whose default export is { id, name, version, runtime, install(h), uninstall(), run(o) }.
// Nothing is downloaded: the browser already has JavaScript, "install" just adds the commands.
//
// What your program can use:
//   console.log / info / debug (normal output), console.error / warn (red output)
//   await input("Your name? ")      waits for a line typed in the Terminal (empty = Ctrl+C stops everything)
//   fs.list()  fs.exists(name)  fs.read(name)  fs.write(name, text)    the files in the current Terminal folder
//   await works at the top level, and setTimeout / setInterval keep the program running until they finish.

// ---------- these functions run inside the worker (and are tested on their own) ----------

function fmt(a) { // how console.log shows a value
  if (typeof a === "string") return a;
  if (a instanceof Error) return a.stack || String(a);
  if (typeof a === "function") return String(a);
  if (a && typeof a === "object") { try { const rep = (k, v) => typeof v === "bigint" ? v + "n" : v, s = JSON.stringify(a, rep); return s.length <= 80 ? s : JSON.stringify(a, rep, 2); } catch (e) { return String(a); } }
  return String(a);
}

async function execute(m, post, ask) { // m = { code, name, files: [{name, text}] }. Returns { ok, changed, skipped }
  const files = {}, before = {};
  for (const f of m.files || []) { files[f.name] = f.text; before[f.name] = f.text; }
  const say = type => (...a) => post(type, a.map(fmt).join(" "));
  const cons = { log: say("out"), info: say("out"), debug: say("out"), error: say("err"), warn: say("err") };
  const fs = {
    list: () => Object.keys(files),
    exists: n => n in files,
    read: n => { if (!(n in files)) throw new Error('No file named "' + n + '" in this folder.'); return files[n]; },
    write: (n, t) => { if (typeof n !== "string" || !n || /\\/.test(n) || n[0] === "/" || !n.split("/").every(s => s && s !== "." && s !== "..")) throw new Error("Bad file name."); files[n] = String(t); } // "data/a.txt" goes in a sub-folder (made if needed)
  };
  const timers = new Set(); // the program ends when its timers are done
  const setT = (f, ms, ...a) => { const id = setTimeout(() => { timers.delete(id); try { const r = f(...a); if (r && r.catch) r.catch(report); } catch (e) { report(e); } }, ms); timers.add(id); return id; };
  const setI = (f, ms, ...a) => { const id = setInterval(() => { try { const r = f(...a); if (r && r.catch) r.catch(report); } catch (e) { report(e); } }, ms); timers.add(id); return id; };
  const clr = id => { timers.delete(id); clearTimeout(id); clearInterval(id); };
  let ok = true;
  const report = e => { // the line number is shifted by the 2 lines the function wrapper adds
    ok = false;
    const msg = e && e.name ? e.name + ": " + e.message : String(e), at = String((e && e.stack) || "").match(/<anonymous>:(\d+):(\d+)/);
    post("err", msg + (at ? "\n  at " + (m.name || "<string>") + " line " + Math.max(1, +at[1] - 2) : ""));
  };
  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction("console", "fs", "input", "setTimeout", "setInterval", "clearTimeout", "clearInterval", m.code)(cons, fs, p => ask(String(p === undefined ? "" : p)), setT, setI, clr, clr);
    while (timers.size) await new Promise(r => setTimeout(r, 20));
  } catch (e) { report(e); }
  timers.forEach(id => { clearTimeout(id); clearInterval(id); });
  const changed = [];
  for (const n of Object.keys(files)) if (before[n] === undefined || before[n] !== files[n]) changed.push({ name: n, text: files[n] });
  return { ok, changed, skipped: [] };
}

function workerMain() {
  let pend = null;
  const post = (type, text) => postMessage({ type, text });
  const ask = p => new Promise(r => { pend = r; post("input", p); }).then(t => { if (t === null || t === undefined) throw new Error("EOF: no input was given"); return t; });
  self.onmessage = async e => {
    const m = e.data;
    if (m.type === "stdin") { if (pend) { const r = pend; pend = null; r(m.text); } return; }
    try { const r = await execute(m, post, ask); postMessage({ type: "done", ok: r.ok, changed: r.changed, skipped: r.skipped }); }
    catch (err) { postMessage({ type: "done", ok: false, changed: [], skipped: [], error: String((err && err.message) || err) }); }
  };
}

const WORKER_SRC = [fmt, execute].map(f => f.toString()).join("\n") + "\n(" + workerMain.toString() + ")();";

// ---------- the main-thread side ----------

let worker = null, busy = false;
function killWorker() { if (worker) { worker.terminate(); URL.revokeObjectURL(worker.url); worker = null; } }

function run(o) { // o = { code, name, files, print, printErr, status, input }. Returns { done: Promise, stop() }
  if (busy) return { done: Promise.resolve({ ok: false, changed: [], skipped: [], error: "JavaScript is already running a program. Wait for it, or stop it first." }), stop() {} };
  busy = true;
  let resolve; const done = new Promise(r => resolve = r);
  const finish = m => { if (!busy) return; busy = false; killWorker(); resolve(m); }; // every run gets a fresh worker, so nothing is left over from the last program
  const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
  const w = worker = new Worker(url); w.url = url;
  w.onmessage = e => {
    const m = e.data;
    if (m.type === "out") o.print(m.text);
    else if (m.type === "err") o.printErr(m.text);
    else if (m.type === "input") Promise.resolve(o.input ? o.input(m.text) : null).then(t => w.postMessage({ type: "stdin", text: t }), () => w.postMessage({ type: "stdin", text: null }));
    else if (m.type === "done") finish(m);
  };
  w.onerror = ev => finish({ ok: false, changed: [], skipped: [], error: "The program stopped unexpectedly" + (ev && ev.message ? ": " + ev.message : "") + "." });
  w.postMessage({ code: o.code, name: o.name || "<string>", files: o.files || [] });
  return { done, stop() { finish({ ok: false, stopped: true, changed: [], skipped: [] }); } };
}

export default {
  id: "javascript", name: "JavaScript", version: "1", runtime: "browser",

  async install(h) { // returns "installed" or "current"
    h.status("Testing JavaScript...");
    const out = [], r = await run({ code: "console.log(6 * 7)", name: "test", files: [], print: t => out.push(t), printErr: t => out.push("error: " + t), status: () => {} }).done;
    h.status("");
    if (!(r.ok && out.join("").trim() === "42")) h.say("Warning: the test run failed: " + (r.error || out.join(" ") || "no answer"));
    return "installed";
  },

  async uninstall() { killWorker(); busy = false; },

  run,
  __test: { execute, fmt }
};
