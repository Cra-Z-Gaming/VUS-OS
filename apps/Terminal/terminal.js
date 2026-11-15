// VUS Terminal: a small command line for VUS-OS (native app, uses os.sys from the OS).
export default {
  open(root, os) {
    const sys = os.sys;
    root.innerHTML = `<style>
.trm{display:flex;flex-direction:column;width:100%;height:100%;background:#0c0c0c;color:#ccc;font:13px/1.5 Consolas,"Courier New",monospace}
.trm button{background:#333;border:1px solid #555;color:#eee;padding:2px 10px;cursor:pointer;font:inherit;font-size:12px}.trm button:hover{background:#444}
.trm .tb{display:flex;gap:6px;align-items:center;padding:4px 8px;background:#1f1f1f;font-size:12px}.trm .tb span{flex:1}
.trm .to{flex:1;overflow:auto;padding:8px 10px;white-space:pre-wrap;word-break:break-word}.trm.noout .to{display:none}
.trm .dim{color:#777}.trm .err{color:#f48771}.trm .dir{color:#6cb6ff}.trm .pr{color:#4ec9b0;margin-right:8px;white-space:pre}
.trm .tln{display:flex;padding:2px 10px}.trm .tw{position:relative;flex:1}
.trm .gh{position:absolute;inset:0;pointer-events:none;white-space:pre}.trm .gh span{visibility:hidden}.trm .gh i{font-style:normal;color:#666}
.trm .tin{position:relative;width:100%;background:transparent;border:0;outline:0;color:#fff;font:inherit;padding:0}
.trm .sg{padding:0 10px 8px;display:flex;flex-direction:column}.trm .sg div{padding:2px 8px;color:#aaa;cursor:pointer}.trm .sg div.b{color:#fff;background:#262626}.trm .sg div:hover{background:#333}.trm .sg small{color:#777;margin-left:8px}
.trm .cb{margin:6px 0;border:1px solid #333;background:#141414;white-space:normal}.trm .cbh{display:flex;gap:6px;align-items:center;padding:4px 8px;background:#1f1f1f;font-size:12px}
.trm .cbh span{flex:1;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.trm .cb pre{margin:0;padding:8px;overflow:auto;white-space:pre;color:#d4d4d4}.trm .cb pre.sm{max-height:220px}
</style><div class="trm"><div class="tb"><span>VUS Terminal</span><button data-a="stop" style="display:none">Stop</button><button data-a="out">Hide output</button><button data-a="clr">Clear</button></div><div class="to"></div><div class="tln"><span class="pr"></span><div class="tw"><div class="gh"></div><input class="tin" spellcheck="false" autocomplete="off" autocapitalize="off"></div></div><div class="sg"></div></div>`;
    const $ = s => root.querySelector(s), out = $(".to"), inp = $(".tin"), gh = $(".gh"), sg = $(".sg");
    let cwd = null, last = "", hist = [], hi = 0, cands = [], aliases = {};
    let cur = null, lastText = "", busy = false; // cur = the current prompt line's group: its element and the output text it produced
    const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const folders = () => sys.folders(), files = () => sys.files();
    const here = () => ({ f: folders().filter(x => (x.parent || null) === cwd), n: files().filter(x => (x.parent || null) === cwd) });
    const pathOf = id => { const p = []; for (let d = id; d;) { const f = folders().find(x => x.id === d); if (!f) break; p.unshift(f.name); d = f.parent; } return ["Desktop", ...p].join("/"); };
    const prompt = () => { $(".tln .pr").textContent = pathOf(cwd) + ">"; };
    const mount = () => cur ? cur.el : out;
    const print = (t, cls = "", rec = true) => { const d = document.createElement("div"); d.className = cls; d.textContent = t; mount().appendChild(d); if (cur && rec) cur.text.push(t); out.scrollTop = out.scrollHeight; return d; };
    const find = (n, pool) => pool.find(x => x.name.toLowerCase() === n.toLowerCase());
    const parseArgs = a => (a.match(/"[^"]*"|\S+/g) || []).map(x => x.replace(/^"|"$/g, "")); // "quoted names" stay in one piece
    const resolveDir = p => { // "/" = Desktop, .. = up, names go down; undefined = not found
      let d = p.startsWith("/") ? null : cwd;
      for (const part of p.split("/").filter(Boolean)) {
        if (part === "..") { const f = folders().find(x => x.id === d); d = f ? f.parent || null : null; }
        else { const f = folders().find(x => (x.parent || null) === d && x.name.toLowerCase() === part.toLowerCase()); if (!f) return undefined; d = f.id; }
      }
      return d;
    };
    const rank = (list, q) => { // best match first: starts with, then a word starts with, then contains
      q = q.toLowerCase(); const sc = n => { n = n.toLowerCase(); return n.startsWith(q) ? 0 : n.split(/[\s._-]+/).some(w => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : 9; };
      return list.map(x => [sc(x.name), x]).filter(p => p[0] < 9).sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(p => p[1]);
    };
    const toClip = async t => { try { await navigator.clipboard.writeText(t); } catch { const x = document.createElement("textarea"); x.value = t; document.body.appendChild(x); x.select(); document.execCommand("copy"); x.remove(); } };
    const bubble = (title, text) => { // code bubble with Copy and Show more
      const b = document.createElement("div"); b.className = "cb";
      b.innerHTML = `<div class="cbh"><span></span><button data-c="copy">Copy</button><button data-c="more">Show more</button></div><pre class="sm"></pre>`;
      b.querySelector("span").textContent = `${title} (${text.length.toLocaleString()} characters)`;
      const pre = b.querySelector("pre"); pre.textContent = text;
      if (text.split("\n").length < 12) b.querySelector("[data-c=more]").remove();
      b.onclick = async e => {
        const c = e.target.dataset.c;
        if (c === "copy") { await toClip(text); e.target.textContent = "Copied"; setTimeout(() => e.target.textContent = "Copy", 1500); }
        else if (c === "more") { pre.classList.toggle("sm"); e.target.textContent = pre.classList.contains("sm") ? "Show more" : "Show less"; }
      };
      mount().appendChild(b); if (cur) cur.text.push(text); out.scrollTop = out.scrollHeight;
    };

    // What execute/open can reach. In a folder: only that folder. On the Desktop: apps plus Desktop items. With a leading \ : everything.
    const targets = glob => {
      const fl = glob ? folders() : here().f, fi = glob ? files() : here().n;
      return [...(glob || cwd === null ? sys.apps().map(a => ({ name: a.name, kind: "app", run: () => sys.launch(a) })) : []),
        ...fl.map(f => ({ name: f.name, kind: glob ? "folder · " + pathOf(f.parent || null) : "folder", run: () => sys.open("folder", f.id) })),
        ...fi.map(f => ({ name: f.name, kind: glob ? "file · " + pathOf(f.parent || null) : "file", run: () => sys.open("file", f.id) }))];
    };

    // Every command, grouped by alias, with one example each. Used by the "commands" window and by suggestions.
    const CMDS = [
      { n: ["help"], d: "Short list of the main commands.", ex: "help" },
      { n: ["commands"], d: "Open this window with every command.", ex: "commands" },
      { n: ["ls"], d: "List what is in the current folder.", ex: "ls" },
      { n: ["cd"], d: "Change folder. .. goes up one, / goes back to Desktop.", ex: "cd Projects" },
      { n: ["cat"], d: "Show a file's text in a code bubble.", ex: "cat notes.txt" },
      { n: ["edit"], d: "Open a file in Notepad.", ex: "edit notes.txt" },
      { n: ["mkdir"], d: "Make a new folder here.", ex: "mkdir Projects" },
      { n: ["rm"], d: "Move a file or folder here to the Recycle Bin.", ex: "rm old.txt" },
      { n: ["execute", "open"], d: "Open an app, file or folder. Only looks in the current folder (apps count as the Desktop). Start the name with \\ to search everywhere.", ex: "execute \\Notes" },
      { n: ["kill"], d: "Force-close an open program when closing it normally doesn't work. Only open programs are suggested.", ex: "kill notes" },
      { n: ["fetch"], d: "Show the text at a link (raw GitHub links work).", ex: "fetch https://example.com/a.txt" },
      { n: ["save"], d: "Save the last fetched text as a file here.", ex: "save a.txt" },
      { n: ["copy"], d: "Copy the latest output to the clipboard. With | it copies every output from that line.", ex: "ls | copy" },
      { n: ["paste"], d: "Paste the clipboard into the input line. The browser may ask for permission.", ex: "paste" },
      { n: ["ver", "version"], d: "Show the version you are running and the latest one. Add notify to also pop up a notification.", ex: "ver notify" },
      { n: ["sys-upd", "system-update"], d: "Download the latest VUS-OS and load it in this tab. Open windows come back. Add force to reinstall.", ex: "sys-upd" },
      { n: ["theme"], d: "Switch between dark and light.", ex: "theme dark" },
      { n: ["lock"], d: "Lock the screen (needs a password in Settings).", ex: "lock" },
      { n: ["sleep"], d: "Black out the screen until you click or press a key.", ex: "sleep" },
      { n: ["notify"], d: "Show a notification.", ex: "notify Hello" },
      { n: ["clear"], d: "Clear the screen.", ex: "clear" },
      { n: ["exit"], d: "Close the terminal.", ex: "exit" },
      { n: ["cp"], d: "Copy a file or folder here into another folder. Use \"quotes\" for names with spaces.", ex: "cp notes.txt Projects" },
      { n: ["mv"], d: "Move a file or folder into another folder (.. is up one, / is Desktop).", ex: "mv notes.txt .." },
      { n: ["rename"], d: "Rename a file or folder here.", ex: "rename \"old name.txt\" new.txt" },
      { n: ["find"], d: "Search names in every folder and show where each match is.", ex: "find notes" },
      { n: ["run"], d: "Run a .vsh shortcut by path and show what it printed. Works from any folder.", ex: "run Projects/start.vsh" },
      { n: ["echo"], d: "Print some text. Handy between | commands.", ex: "echo Hello" },
      { n: ["wait"], d: "Pause for up to 60 seconds. Handy between | commands.", ex: "execute Notes | wait 2 | execute Gallery" },
      { n: ["history"], d: "Show the commands you typed in this window.", ex: "history" },
      { n: ["restart"], d: "Close everything and restart VUS-OS without reloading the page.", ex: "restart" },
      { n: ["pwd"], d: "Show which folder you are in.", ex: "pwd" },
      { n: ["touch"], d: "Make an empty file here. Does nothing if it already exists.", ex: "touch notes.txt" },
      { n: ["tree"], d: "Show a folder and everything inside it as an indented list. Without a name it shows the current folder.", ex: "tree Projects" },
      { n: ["grep"], d: "Search the text inside files for a word. Give a file name to search just that file, or leave it out to search every file here.", ex: "grep hello notes.txt" },
      { n: ["date", "time"], d: "Show today's date and the time.", ex: "date" },
      { n: ["whoami"], d: "Show who is signed in and which VUS-OS version this is.", ex: "whoami" },
      { n: ["alias"], d: "Make your own short name for a command. Lasts until this Terminal window is closed. alias on its own lists them, alias -d name removes one. A shortcut can't contain |.", ex: "alias ll ls" },
      { n: ["languages", "lang"], d: "List the languages you can install and which ones are installed.", ex: "languages" },
      { n: ["install"], d: "Download and install a language. After the one-time download it works offline.", ex: "install python" },
      { n: ["uninstall"], d: "Remove an installed language and its downloaded files.", ex: "uninstall python" },
      { n: ["py", "python"], d: "Run a Python file from this folder, or one line with -c (needs: install python). The files in this folder can be read, written and imported. Ctrl+C or the Stop button ends a running program. Use ; instead of | inside code.", ex: "py hello.py" },
      { n: ["|"], d: "Run several commands in one line, one after another.", ex: "ls | cat notes.txt | copy" },
      { n: ["\\"], d: "In execute, search everywhere instead of only this folder.", ex: "execute \\Notes" }
    ];
    const CMDNAMES = CMDS.flatMap(c => c.n).filter(n => /^[a-z]/i.test(n));
    const listApp = { builtin: 1, single: 1, name: "Terminal commands", icon: "svg:terminal", color: "amber", w: 580, h: 520, open(r) {
      r.innerHTML = `<style>.cw{display:flex;flex-direction:column;height:100%;background:var(--el);color:var(--fg);font-size:13px}.cs{margin:10px 16px 0;padding:6px 8px;border:1px solid var(--bd);background:rgba(128,128,128,.15);color:inherit;font:inherit;outline:0;user-select:text}.cs:focus{border-color:var(--ac)}.cl{flex:1;overflow:auto;padding:10px 16px}.cc{border:1px solid var(--bd);background:var(--card);padding:10px 12px;margin-bottom:8px}.cc b{font:600 14px Consolas,monospace}.cc p{margin:4px 0 6px;color:var(--mute);font-size:12px}.cc code{display:block;font:12px Consolas,monospace;padding:4px 8px;background:rgba(128,128,128,.2)}.cn{color:var(--mute);padding:12px 0}</style><div class="cw"><input class="cs" placeholder="Search commands..." autocomplete="off" spellcheck="false"><div class="cl"></div></div>`;
      const list = r.querySelector(".cl"), q = r.querySelector(".cs");
      const draw = () => { // matches in the name come first, then ones that only match the description or example
        const t = q.value.toLowerCase().trim();
        const score = c => !t ? 0 : c.n.some(n => n.toLowerCase().startsWith(t)) ? 0 : c.n.some(n => n.toLowerCase().includes(t)) ? 1 : (c.d + " " + c.ex).toLowerCase().includes(t) ? 2 : 9;
        const rows = CMDS.map(c => [score(c), c]).filter(p => p[0] < 9).sort((x, y) => x[0] - y[0]).map(p => p[1]);
        list.innerHTML = rows.length ? rows.map(c => `<div class="cc"><b>${esc(c.n.join(" / "))}</b><p>${esc(c.d)}</p><code>${esc(c.ex)}</code></div>`).join("") : '<div class="cn">No matching commands.</div>';
      };
      q.oninput = draw; draw(); q.focus();
    } };

    // ---------- languages: install python, then py file.py (the language file comes from the OS repo's languages/ folder) ----------
    const LANG_OK = !!sys.langs; // older VUS-OS versions don't have the language helpers yet
    let langList = null, runH = null, statusEl = null; const mods = {};
    const getList = async () => { if (langList) return langList; const r = await fetch(sys.langBase() + "list.json", { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); return langList = await r.json(); };
    if (LANG_OK) getList().catch(() => {});
    const installedLangs = () => LANG_OK ? sys.langs() : {};
    const loadLang = async id => {
      if (mods[id]) return mods[id];
      const code = await sys.langCode(id); if (!code) throw new Error(`${id} is no longer saved. Run: install ${id}`);
      return mods[id] = (await import(URL.createObjectURL(new Blob([code], { type: "text/javascript" })))).default;
    };
    const setStatus = t => { if (!t) { if (statusEl) { statusEl.remove(); statusEl = null; } return; } if (!statusEl) statusEl = print("", "dim", false); statusEl.textContent = t; out.scrollTop = out.scrollHeight; };
    const showStop = on => { $("[data-a=stop]").style.display = on ? "" : "none"; };
    const stopRun = () => { if (!runH) return; const h = runH; runH = null; h.stop(); print("Stopped.", "err", false); };
    os.guard(() => { stopRun(); return true; }); // closing the window ends a running program (guard must return true to allow closing)
    const langFn = c => { const all = installedLangs(), id = Object.keys(all).find(k => (all[k].cmds || []).includes(c)); return id ? a => runLang(id, a) : undefined; };
    const runLang = async (id, a) => {
      if (runH) return print("A program is already running. Press Ctrl+C or Stop first.", "err");
      const mod = await loadLang(id); let code, name;
      if (/^-c(\s|$)/.test(a)) { code = a.replace(/^-c\s*/, "").replace(/^"([\s\S]*)"$/, "$1"); name = "<string>"; if (!code) return print('Usage: py -c "print(1 + 1)"', "err"); }
      else {
        const n = parseArgs(a)[0]; if (!n) return print("Usage: py <file>   or   py -c \"code\"", "err");
        const f = find(n, here().n); if (!f) return print(`No file named "${n}" here.`, "err");
        code = await sys.read(f.id); name = f.name;
      }
      const files = []; let total = 0;
      for (const f of here().n) { // the folder's text files are given to the program (so it can read, write and import them)
        if ((f.size || 0) > 1048576 || files.length >= 200 || total > 5242880) continue;
        let t; try { t = await sys.read(f.id); } catch { continue; }
        if (typeof t === "string" && !t.includes("\u0000")) { files.push({ name: f.name, text: t }); total += t.length; }
      }
      let lines = 0; const MAX = 3000;
      const h = mod.run({ code, name, files,
        print: t => { if (lines++ < MAX) print(t || " "); else if (lines === MAX + 1) { print(`Output limit (${MAX} lines) reached, stopping the program.`, "err"); stopRun(); } },
        printErr: t => { if (lines++ < MAX) print(t || " ", "err"); },
        status: setStatus });
      runH = h; showStop(true);
      const r = await h.done;
      if (runH === h) runH = null; showStop(false); setStatus("");
      if (r.stopped) return;
      if (r.error) print(r.error, "err");
      for (const c of r.changed || []) {
        const ex = find(c.name, here().n);
        if (ex) { await sys.overwrite(ex.id, c.text); print(`Updated ${c.name}`, "dim"); } else { await sys.write(c.name, c.text, cwd); print(`Created ${c.name}`, "dim"); }
      }
      if (r.skipped && r.skipped.length) print(`Not saved (not text files): ${r.skipped.join(", ")}`, "dim");
    };

    const cmds = {
      help: () => print("commands           open a window with every command and an example\nls                 list this folder\ncd <folder|..|/>   change folder\ncat <file>         show a file in a code bubble\nedit <file>        open a file in Notepad\nmkdir <name>       new folder\nrm <name>          move to the Recycle Bin\nexecute <name>     open an app, file or folder here (\\name searches everywhere)\nkill <name>        force-close an open program\nfetch <link>       show text from a link (raw GitHub works)\nsave <name>        save the last fetched text as a file here\ncopy / paste       copy the latest output / paste the clipboard into the input\nver                show the version and the latest one\nsys-upd            update VUS-OS in this tab\ncmd1 | cmd2        run several commands in one line\ncp / mv / rename   copy, move or rename a file or folder here\nfind <text>        search names in every folder\nrun <path>         run a .vsh shortcut and show its output\necho / wait / history / restart\npwd / touch / tree      where you are, new empty file, folder outline\ngrep <text> [file] search inside files\ndate / whoami      date and time, who and which version\nalias <name> <cmd> your own short command\ninstall / languages  add a language like Python, then: py file.py\ntheme dark|light   lock   sleep   notify <text>   clear   exit"),
      commands: () => { sys.launch(listApp); },
      clear: () => { out.innerHTML = ""; if (cur) { cur.el = document.createElement("div"); out.appendChild(cur.el); } },
      ls: () => { const h = here(); if (!h.f.length && !h.n.length) return print("(empty)", "dim"); h.f.forEach(f => print(f.name + "/", "dir")); h.n.forEach(f => print(f.name)); },
      cd: a => { if (!a || a === "/") cwd = null; else if (a === "..") { const f = folders().find(x => x.id === cwd); cwd = f ? f.parent || null : null; } else { const f = find(a, here().f); if (!f) return print(`No folder named "${a}" here.`, "err"); cwd = f.id; } prompt(); },
      cat: async a => { const f = find(a, here().n); if (!f) return print(`No file named "${a}" here.`, "err"); bubble(f.name, (await sys.read(f.id)) ?? ""); },
      edit: a => { const f = find(a, here().n); if (!f) return print(`No file named "${a}" here.`, "err"); sys.edit(f.id); },
      mkdir: a => { if (!a) return print("Usage: mkdir <name>", "err"); sys.mkdir(a, cwd); print(`Created ${a}/`); },
      rm: async a => { const f = find(a, here().n), d = find(a, here().f); if (!f && !d) return print(`Nothing named "${a}" here.`, "err"); await sys.remove(f ? "file" : "folder", (f || d).id); print(`Moved ${a} to the Recycle Bin.`); },
      execute: a => {
        const glob = a.startsWith("\\"); if (glob) a = a.slice(1).trim();
        if (!a) return print("Usage: execute <name>   (start with \\ to search everywhere)", "err");
        const t = targets(glob), m = find(a, t) || rank(t, a)[0];
        if (!m) return print(`Nothing found for "${a}"${glob ? "." : " here. Start with \\ to search everywhere."}`, "err");
        m.run(); print(`Opened ${m.name}`);
      },
      kill: a => {
        const w = sys.windows();
        if (!a) return w.length ? w.forEach(x => print(x.name)) : print("No open programs.", "dim");
        const m = find(a, w) || rank(w, a)[0]; if (!m) return print(`No open program matches "${a}".`, "err");
        sys.kill(m.id); print(`Closed ${m.name}`);
      },
      fetch: async a => {
        if (!/^https?:\/\//i.test(a)) return print("Usage: fetch <link starting with http>", "err");
        print("Fetching...", "dim", false);
        try { const r = await fetch(a); if (!r.ok) return print(`Failed: ${r.status} ${r.statusText}`, "err"); last = await r.text(); bubble(a.replace(/^https?:\/\//, ""), last); }
        catch { print("Could not fetch that link (blocked, offline, or the site does not allow it).", "err"); }
      },
      save: async a => { if (!last) return print("Nothing to save. Run fetch first.", "err"); if (!a) return print("Usage: save <file name>", "err"); await sys.write(a, last, cwd); print(`Saved ${a}`); },
      copy: async () => { const t = cur && cur.text.length ? cur.text.join("\n") : lastText; if (!t) return print("Nothing to copy yet.", "err", false); await toClip(t); print("Copied.", "dim", false); },
      paste: async () => {
        try { inp.value = (await navigator.clipboard.readText()).replace(/\s*\r?\n\s*/g, " ").trim(); print("Pasted into the input.", "dim", false); }
        catch { print("Couldn't read the clipboard. Allow clipboard access if the browser asks, then try again.", "err", false); }
      },
      ver: async a => {
        print("Version-" + sys.version()); const l = await sys.latest();
        print("Latest-" + (l || "unknown (couldn't reach the update file)"));
        if (l && l !== sys.version()) print("Run sys-upd to update.", "dim", false);
        if (a.toLowerCase() === "notify") os.notify("VUS-OS version", `Version-${sys.version()} · Latest-${l || "unknown"}`);
      },
      "sys-upd": async a => { print("Checking for updates...", "dim", false); const m = await sys.update(a.toLowerCase() === "force"); if (m) print(m); },
      theme: a => { if (a !== "dark" && a !== "light") return print("Usage: theme dark|light", "err"); sys.theme(a); },
      lock: () => sys.lock(), sleep: () => sys.sleep(),
      notify: a => os.notify("Terminal", a || "Hello"),
      echo: a => print(a),
      wait: async a => { const s = Math.min(60, Math.max(0, parseFloat(a) || 0)); await new Promise(r => setTimeout(r, s * 1000)); print(`Waited ${s} s`, "dim", false); },
      history: () => hist.length ? hist.forEach((h, i) => print(`${i + 1}  ${h}`)) : print("(no history yet)", "dim"),
      restart: () => sys.restart(),
      find: a => {
        if (!a) return print("Usage: find <text>", "err");
        const all = [...folders().map(f => ({ name: f.name, path: pathOf(f.parent || null) + "/" + f.name + "/" })), ...files().map(f => ({ name: f.name, path: pathOf(f.parent || null) + "/" + f.name }))];
        const hit = rank(all, a); if (!hit.length) return print(`Nothing found for "${a}".`, "dim");
        hit.slice(0, 50).forEach(x => print(x.path)); if (hit.length > 50) print(`...and ${hit.length - 50} more`, "dim");
      },
      cp: async a => {
        const [n, d] = parseArgs(a); if (!n || !d) return print('Usage: cp <name> <folder>   (use "quotes" for names with spaces)', "err");
        const f = find(n, here().n), o = find(n, here().f), t = resolveDir(d);
        if (!f && !o) return print(`Nothing named "${n}" here.`, "err"); if (t === undefined) return print(`No folder "${d}".`, "err");
        await sys.copy(f ? "file" : "folder", (f || o).id, t); print(`Copied ${n} to ${pathOf(t)}`);
      },
      mv: async a => {
        const [n, d] = parseArgs(a); if (!n || !d) return print('Usage: mv <name> <folder>   (use "quotes" for names with spaces)', "err");
        const f = find(n, here().n), o = find(n, here().f), t = resolveDir(d);
        if (!f && !o) return print(`Nothing named "${n}" here.`, "err"); if (t === undefined) return print(`No folder "${d}".`, "err");
        await sys.move(f ? "file" : "folder", (f || o).id, t); print(`Moved ${n} to ${pathOf(t)}`);
      },
      rename: async a => {
        const [n, nn] = parseArgs(a); if (!n || !nn) return print('Usage: rename <name> <new name>   (use "quotes" for names with spaces)', "err");
        const f = find(n, here().n), o = find(n, here().f); if (!f && !o) return print(`Nothing named "${n}" here.`, "err");
        await sys.rename(f ? "file" : "folder", (f || o).id, nn); print(`Renamed ${n} to ${nn}`);
      },
      run: async a => {
        const p = a.replace(/^"|"$/g, ""), i = p.lastIndexOf("/"), dir = i < 0 ? cwd : resolveDir(i === 0 ? "/" : p.slice(0, i)), nm = p.slice(i + 1);
        if (dir === undefined) return print(`No folder "${p.slice(0, i)}".`, "err");
        const f = files().find(x => (x.parent || null) === dir && x.name.toLowerCase() === nm.toLowerCase());
        if (!f || !/\.vsh$/i.test(f.name)) return print(`No .vsh shortcut at "${p}".`, "err");
        const o = await sys.run(f.id);
        if (typeof o !== "string") print("That shortcut is already running.", "err"); else if (o) print(o); else print("Done.", "dim", false);
      },
      pwd: () => print(pathOf(cwd)),
      touch: async a => {
        const n = parseArgs(a)[0]; if (!n) return print('Usage: touch <name>   (use "quotes" for names with spaces)', "err");
        if (find(n, here().n)) return print(`${n} already exists.`, "dim");
        if (find(n, here().f)) return print(`There is already a folder named "${n}" here.`, "err");
        await sys.write(n, "", cwd); print(`Created ${n}`);
      },
      tree: a => {
        const n = parseArgs(a)[0]; let root = cwd;
        if (n) { root = resolveDir(n); if (root === undefined) return print(`No folder "${n}".`, "err"); }
        let lines = 0; const MAX = 300;
        const walk = (id, pad) => {
          const fo = folders().filter(x => (x.parent || null) === id).sort((x, y) => x.name.localeCompare(y.name));
          const fi = files().filter(x => (x.parent || null) === id).sort((x, y) => x.name.localeCompare(y.name));
          for (const f of fo) { if (lines++ >= MAX) return; print(pad + f.name + "/", "dir"); walk(f.id, pad + "  "); }
          for (const f of fi) { if (lines++ >= MAX) return; print(pad + f.name); }
        };
        print(pathOf(root) + "/", "dir"); walk(root, "  ");
        if (lines >= MAX) print(`...stopped after ${MAX} lines`, "dim");
        else if (!lines) print("(empty)", "dim");
      },
      grep: async a => {
        const [q, fn] = parseArgs(a); if (!q) return print('Usage: grep <text> [file]   (use "quotes" for text with spaces)', "err");
        let pool2 = here().n;
        if (fn) { const f = find(fn, here().n); if (!f) return print(`No file named "${fn}" here.`, "err"); pool2 = [f]; }
        const needle = q.toLowerCase(); let hits = 0, skipped = 0; const MAX = 50;
        for (const f of pool2) {
          if ((f.size || 0) > 2 * 1024 * 1024) { skipped++; continue; } // big files are skipped so the tab stays quick
          let t; try { t = await sys.read(f.id); } catch { continue; }
          if (typeof t !== "string" || t.includes("\u0000")) { if (fn) print(`${f.name} is not a text file.`, "err"); continue; }
          const ls = t.split(/\r?\n/);
          for (let i = 0; i < ls.length; i++) {
            if (!ls[i].toLowerCase().includes(needle)) continue;
            if (hits++ >= MAX) break;
            print(`${f.name}:${i + 1}: ${ls[i].trim().slice(0, 160)}`);
          }
          if (hits > MAX) break;
        }
        if (hits > MAX) print(`...showing the first ${MAX} matches`, "dim");
        else if (!hits) print(`Nothing found for "${q}".`, "dim");
        if (skipped) print(`Skipped ${skipped} file${skipped === 1 ? "" : "s"} over 2 MB.`, "dim");
      },
      date: () => { const d = new Date(); print(d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) + "  " + d.toLocaleTimeString()); },
      whoami: () => print((sessionStorage.getItem("vos_guest") === "1" ? "Guest (temporary, nothing is kept)" : "Owner") + " · VUS-OS " + sys.version()),
      alias: a => {
        if (!a) { const k = Object.keys(aliases); return k.length ? k.forEach(n => print(`${n} = ${aliases[n]}`)) : print("(no aliases yet. Try: alias ll ls)", "dim"); }
        const p = a.split(/\s+/);
        if (p[0] === "-d") { const n = (p[1] || "").toLowerCase(); if (!aliases[n]) return print(`No alias named "${p[1] || ""}".`, "err"); delete aliases[n]; return print(`Removed ${n}`); }
        const n = p[0].toLowerCase(), v = a.slice(p[0].length).trim();
        if (!v) return print(aliases[n] ? `${n} = ${aliases[n]}` : `No alias named "${p[0]}".`, aliases[n] ? "" : "err");
        if (!/^[a-z][\w-]*$/.test(n)) return print("An alias name must start with a letter and use only letters, numbers, - or _.", "err");
        if (cmds[n]) return print(`"${n}" is already a command, pick another name.`, "err");
        if (v.includes("|")) return print("An alias can't contain |. Make one alias per command.", "err");
        aliases[n] = v; print(`${n} = ${v}`);
      },
      exit: () => { stopRun(); os.close(); },
      languages: async () => {
        if (!LANG_OK) return print("This needs a newer VUS-OS. Run sys-upd first.", "err");
        let list; try { list = await getList(); } catch { return print("Couldn't load the language list (offline?).", "err"); }
        const have = installedLangs();
        Object.keys(list).forEach(id => print(`${id}  ${list[id].name}  ${have[id] ? "(installed)" : "(" + (list[id].size || "not installed") + ")"}  ${list[id].desc || ""}`));
        print("Install one with: install <name>", "dim", false);
      },
      install: async a => {
        if (!LANG_OK) return print("This needs a newer VUS-OS. Run sys-upd first.", "err");
        let list; try { list = await getList(); } catch { return print("Couldn't load the language list (offline?).", "err"); }
        const id = (a || "").toLowerCase().trim(), e = list[id];
        if (!e) return print((id ? `No language named "${a}". ` : "Usage: install <language>. ") + "Available: " + Object.keys(list).join(", "), "err");
        print(`${e.name}${e.size ? " (" + e.size + ")" : ""}`, "dim", false);
        let code; try { const r = await fetch(sys.langBase() + e.file, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); code = await r.text(); } catch (x) { return print("Couldn't download the language file (" + x.message + ").", "err"); }
        let mod; try { mod = (await import(URL.createObjectURL(new Blob([code], { type: "text/javascript" })))).default; } catch (x) { return print("The language file is broken: " + x.message, "err"); }
        try {
          const res = await mod.install({ say: t => print(t), status: setStatus }); setStatus("");
          if (!(await sys.langSave(id, code, { name: e.name, version: mod.version, cmds: e.cmds, date: Date.now() }))) return print("Couldn't save the language (browser storage may be full).", "err");
          mods[id] = mod;
          print(res === "current" ? `${e.name} is installed and up to date.` : `${e.name} installed.`); if (e.example) print("Try: " + e.example, "dim");
        } catch (x) { setStatus(""); print("Install failed: " + x.message, "err"); }
      },
      uninstall: async a => {
        const id = (a || "").toLowerCase().trim();
        if (!LANG_OK || !installedLangs()[id]) return print(`"${a || ""}" isn't installed.`, "err");
        stopRun(); try { await (await loadLang(id)).uninstall(); } catch { /* still remove it below */ }
        await sys.langDrop(id); delete mods[id]; print(`Removed ${id}.`);
      }
    };
    cmds.time = cmds.date; cmds.open = cmds.execute; cmds.version = cmds.ver; cmds["system-update"] = cmds["sys-upd"];
    const pool = { run: () => here().n.filter(x => /\.vsh$/i.test(x.name)).map(x => ({ name: x.name, kind: "shortcut" })), cd: () => here().f.map(x => ({ name: x.name, kind: "folder" })), cat: () => here().n.map(x => ({ name: x.name, kind: "file" })), edit: () => here().n.map(x => ({ name: x.name, kind: "file" })), rm: () => [...here().f.map(x => ({ name: x.name, kind: "folder" })), ...here().n.map(x => ({ name: x.name, kind: "file" }))], tree: () => here().f.map(x => ({ name: x.name, kind: "folder" })), touch: () => [], theme: () => ["dark", "light"].map(name => ({ name, kind: "" })), kill: () => sys.windows().map(w => ({ name: w.name, kind: "open" })) };
    pool.py = pool.python = () => here().n.filter(x => /\.py$/i.test(x.name)).map(x => ({ name: x.name, kind: "python" }));
    pool.install = () => Object.keys(langList || {}).map(name => ({ name, kind: "language" }));
    pool.uninstall = () => Object.keys(installedLangs()).map(name => ({ name, kind: "installed" }));
    cmds.lang = cmds.languages;
    const segOf = v => v.slice(v.lastIndexOf("|") + 1).trim();
    const suggest = () => { // works on the part after the last |; ghost text for the best match (Tab accepts it); the others are clickable
      const v = inp.value, bar = v.lastIndexOf("|"), seg = v.slice(bar + 1), lead = seg.match(/^\s*/)[0], base = v.slice(0, bar + 1) + lead, s = seg.slice(lead.length), sp = s.indexOf(" ");
      let list = [], typed = s, pre = base;
      if (sp < 0) list = s ? rank(CMDNAMES.map(name => ({ name, kind: "command" })), s) : [];
      else {
        const c = s.slice(0, sp).toLowerCase(); pre = base + s.slice(0, sp + 1); typed = s.slice(sp + 1).replace(/^\s+/, "");
        if (c === "execute" || c === "open") { const g = typed.startsWith("\\"); if (g) { pre += "\\"; typed = typed.slice(1); } list = rank(targets(g), typed); }
        else if (c === "cp" || c === "mv" || c === "rename") {
          const m = typed.match(/^("[^"]*"|\S+)\s+(.*)$/);
          if (m && c !== "rename") { pre += m[1] + " "; typed = m[2]; list = rank(pool.cd(), typed); } // second word: a folder
          else if (!m) { typed = typed.replace(/^"/, ""); list = rank(pool.rm().map(x => ({ ...x, quote: 1 })), typed); } // first word: a file or folder here
        }
        else if (pool[c]) list = rank(pool[c](), typed);
      }
      cands = list.slice(0, 6).map(x => ({ ...x, full: pre + (x.quote && /\s/.test(x.name) ? `"${x.name}"` : x.name) }));
      const b = cands[0], ghost = b && typed && b.name.toLowerCase().startsWith(typed.toLowerCase()) && b.full.toLowerCase().startsWith(v.toLowerCase()) ? b.full.slice(v.length) : "";
      gh.innerHTML = `<span>${esc(v)}</span><i>${esc(ghost)}</i>`;
      sg.innerHTML = cands.map((c, i) => `<div data-i="${i}" class="${i ? "" : "b"}">${esc(c.name)}<small>${esc(c.kind)}</small></div>`).join("");
    };
    sg.onclick = e => { const d = e.target.closest("[data-i]"); if (d) { inp.value = cands[+d.dataset.i].full; inp.focus(); suggest(); } };
    inp.oninput = suggest;
    inp.onkeydown = async e => {
      if (e.ctrlKey && e.key.toLowerCase() === "c" && runH && !getSelection().toString()) { e.preventDefault(); stopRun(); return; } // Ctrl+C stops a running program
      if (e.key === "Tab") { e.preventDefault(); if (cands[0]) { inp.value = cands[0].full + (segOf(inp.value).includes(" ") ? "" : " "); suggest(); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (hi > 0) inp.value = hist[--hi]; suggest(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(hist.length, hi + 1); inp.value = hist[hi] || ""; suggest(); }
      else if (e.key === "Enter") {
        const line = inp.value.trim(); if (busy) return; inp.value = ""; suggest(); if (!line) return;
        hist.push(line); hi = hist.length; busy = true;
        const g = document.createElement("div"); out.appendChild(g); cur = { el: g, text: [] }; // everything this line prints is grouped, so copy can take it all
        const d = print("", "", false), pr = document.createElement("span"); pr.className = "pr"; pr.textContent = $(".tln .pr").textContent; d.append(pr, line);
        const segs = line.split("|").map(x => x.trim()).filter(Boolean);
        for (const sgm of segs) {
          let c0 = sgm.split(/\s+/)[0], body = sgm;
          if (!cmds[c0.toLowerCase()] && aliases[c0.toLowerCase()]) { body = aliases[c0.toLowerCase()] + sgm.slice(c0.length); c0 = body.split(/\s+/)[0]; } // your own alias, swapped for the real command
          const fn = cmds[c0.toLowerCase()] || langFn(c0.toLowerCase());
          if (!fn) {
            const lg = langList && Object.keys(langList).find(k => (langList[k].cmds || []).includes(c0.toLowerCase()));
            print(lg ? `${langList[lg].name} isn't installed. Run: install ${lg}` : `'${c0}' is not a command. Type help.`, "err"); continue;
          }
          try { await fn(body.slice(c0.length).trim()); } catch (err) { print("Error: " + err.message, "err"); }
        }
        if (cur.text.length && !segs.every(x => /^(copy|paste)(\s|$)/i.test(x))) lastText = cur.text.join("\n"); // copy/paste lines don't replace what copy would copy
        busy = false; suggest();
      }
    };
    $(".tb").onclick = e => { const a = e.target.dataset.a; if (a === "out") { const h = $(".trm").classList.toggle("noout"); e.target.textContent = h ? "Show output" : "Hide output"; } else if (a === "clr") out.innerHTML = ""; else if (a === "stop") stopRun(); };
    $(".trm").onclick = e => { if (!e.target.closest("button,.cb,.sg") && !getSelection().toString()) inp.focus(); };
    print("VUS Terminal. Type help for commands, or commands for the full list.", "dim"); prompt(); inp.focus();
  }
};
