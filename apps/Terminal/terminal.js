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
</style><div class="trm"><div class="tb"><span>VUS Terminal</span><button data-a="out">Hide output</button><button data-a="clr">Clear</button></div><div class="to"></div><div class="tln"><span class="pr"></span><div class="tw"><div class="gh"></div><input class="tin" spellcheck="false" autocomplete="off" autocapitalize="off"></div></div><div class="sg"></div></div>`;
    const $ = s => root.querySelector(s), out = $(".to"), inp = $(".tin"), gh = $(".gh"), sg = $(".sg");
    let cwd = null, last = "", hist = [], hi = 0, cands = [];
    const folders = () => sys.folders(), files = () => sys.files();
    const here = () => ({ f: folders().filter(x => (x.parent || null) === cwd), n: files().filter(x => (x.parent || null) === cwd) });
    const pathOf = id => { const p = []; for (let d = id; d;) { const f = folders().find(x => x.id === d); if (!f) break; p.unshift(f.name); d = f.parent; } return ["Desktop", ...p].join("/"); };
    const prompt = () => { $(".tln .pr").textContent = pathOf(cwd) + ">"; };
    const print = (t, cls = "") => { const d = document.createElement("div"); d.className = cls; d.textContent = t; out.appendChild(d); out.scrollTop = out.scrollHeight; return d; };
    const find = (n, pool) => pool.find(x => x.name.toLowerCase() === n.toLowerCase());
    const rank = (list, q) => { // best match first: starts with, then a word starts with, then contains
      q = q.toLowerCase(); const sc = n => { n = n.toLowerCase(); return n.startsWith(q) ? 0 : n.split(/[\s._-]+/).some(w => w.startsWith(q)) ? 1 : n.includes(q) ? 2 : 9; };
      return list.map(x => [sc(x.name), x]).filter(p => p[0] < 9).sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).map(p => p[1]);
    };
    const bubble = (title, text) => { // code bubble with Copy and Show more
      const b = document.createElement("div"); b.className = "cb";
      b.innerHTML = `<div class="cbh"><span></span><button data-c="copy">Copy</button><button data-c="more">Show more</button></div><pre class="sm"></pre>`;
      b.querySelector("span").textContent = `${title} (${text.length.toLocaleString()} characters)`;
      const pre = b.querySelector("pre"); pre.textContent = text;
      if (text.split("\n").length < 12) b.querySelector("[data-c=more]").remove();
      b.onclick = async e => {
        const c = e.target.dataset.c;
        if (c === "copy") { try { await navigator.clipboard.writeText(text); } catch { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); } e.target.textContent = "Copied"; setTimeout(() => e.target.textContent = "Copy", 1500); }
        else if (c === "more") { pre.classList.toggle("sm"); e.target.textContent = pre.classList.contains("sm") ? "Show more" : "Show less"; }
      };
      out.appendChild(b); out.scrollTop = out.scrollHeight;
    };
    const targets = () => [...sys.apps().map(a => ({ name: a.name, kind: "app", run: () => sys.launch(a) })), ...folders().map(f => ({ name: f.name, kind: "folder", run: () => sys.open("folder", f.id) })), ...files().map(f => ({ name: f.name, kind: "file", run: () => sys.open("file", f.id) }))];
    const cmds = {
      help: () => print("ls                 list this folder\ncd <folder|..|/>   change folder\ncat <file>         show a file in a code bubble\nedit <file>        open a file in Notepad\nmkdir <name>       new folder\nrm <name>          move to the Recycle Bin\nfetch <link>       show text from a link (raw GitHub works)\nsave <name>        save the last fetched text as a file here\nexecute <name>     open an app, file or folder (Tab completes)\ntheme dark|light   lock   sleep   notify <text>   clear   exit"),
      clear: () => { out.innerHTML = ""; },
      ls: () => { const h = here(); if (!h.f.length && !h.n.length) return print("(empty)", "dim"); h.f.forEach(f => print(f.name + "/", "dir")); h.n.forEach(f => print(f.name)); },
      cd: a => { if (!a || a === "/") cwd = null; else if (a === "..") { const f = folders().find(x => x.id === cwd); cwd = f ? f.parent || null : null; } else { const f = find(a, here().f); if (!f) return print(`No folder named "${a}" here.`, "err"); cwd = f.id; } prompt(); },
      cat: async a => { const f = find(a, here().n); if (!f) return print(`No file named "${a}" here.`, "err"); bubble(f.name, (await sys.read(f.id)) ?? ""); },
      edit: a => { const f = find(a, here().n); if (!f) return print(`No file named "${a}" here.`, "err"); sys.edit(f.id); },
      mkdir: a => { if (!a) return print("Usage: mkdir <name>", "err"); sys.mkdir(a, cwd); print(`Created ${a}/`); },
      rm: async a => { const f = find(a, here().n), d = find(a, here().f); if (!f && !d) return print(`Nothing named "${a}" here.`, "err"); await sys.remove(f ? "file" : "folder", (f || d).id); print(`Moved ${a} to the Recycle Bin.`); },
      fetch: async a => {
        if (!/^https?:\/\//i.test(a)) return print("Usage: fetch <link starting with http>", "err");
        print("Fetching...", "dim");
        try { const r = await fetch(a); if (!r.ok) return print(`Failed: ${r.status} ${r.statusText}`, "err"); last = await r.text(); bubble(a.replace(/^https?:\/\//, ""), last); }
        catch { print("Could not fetch that link (blocked, offline, or the site does not allow it).", "err"); }
      },
      save: async a => { if (!last) return print("Nothing to save. Run fetch first.", "err"); if (!a) return print("Usage: save <file name>", "err"); await sys.write(a, last, cwd); print(`Saved ${a}`); },
      execute: a => { const t = targets(), m = find(a, t) || rank(t, a)[0]; if (!m) return print(`Nothing found for "${a}".`, "err"); m.run(); print(`Opened ${m.name}`); },
      theme: a => { if (a !== "dark" && a !== "light") return print("Usage: theme dark|light", "err"); sys.theme(a); },
      lock: () => sys.lock(), sleep: () => sys.sleep(),
      notify: a => os.notify("Terminal", a || "Hello"),
      exit: () => os.close()
    };
    cmds.open = cmds.execute;
    const pool = { execute: targets, open: targets, cd: () => here().f.map(x => ({ name: x.name, kind: "folder" })), cat: () => here().n.map(x => ({ name: x.name, kind: "file" })), edit: () => here().n.map(x => ({ name: x.name, kind: "file" })), rm: () => [...here().f.map(x => ({ name: x.name, kind: "folder" })), ...here().n.map(x => ({ name: x.name, kind: "file" }))], theme: () => ["dark", "light"].map(name => ({ name, kind: "" })) };
    const esc = s => s.replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const suggest = () => { // ghost text for the best match (Tab accepts it); the others are clickable
      const v = inp.value, sp = v.indexOf(" "); let list = [], typed = v, pre = "";
      if (sp < 0) list = v ? rank(Object.keys(cmds).filter(n => n !== "open").map(name => ({ name, kind: "command" })), v) : [];
      else { const p = pool[v.slice(0, sp).toLowerCase()]; if (p) { pre = v.slice(0, sp + 1); typed = v.slice(sp + 1).replace(/^\s+/, ""); list = rank(p(), typed); } }
      cands = list.slice(0, 6).map(x => ({ ...x, full: pre + x.name }));
      const b = cands[0], ghost = b && typed && b.name.toLowerCase().startsWith(typed.toLowerCase()) ? b.full.slice(v.length) : "";
      gh.innerHTML = `<span>${esc(v)}</span><i>${esc(ghost)}</i>`;
      sg.innerHTML = cands.map((c, i) => `<div data-i="${i}" class="${i ? "" : "b"}">${esc(c.name)}<small>${c.kind}</small></div>`).join("");
    };
    sg.onclick = e => { const d = e.target.closest("[data-i]"); if (d) { inp.value = cands[+d.dataset.i].full; inp.focus(); suggest(); } };
    inp.oninput = suggest;
    inp.onkeydown = async e => {
      if (e.key === "Tab") { e.preventDefault(); if (cands[0]) { inp.value = cands[0].full + (inp.value.includes(" ") ? "" : " "); suggest(); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (hi > 0) inp.value = hist[--hi]; suggest(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); hi = Math.min(hist.length, hi + 1); inp.value = hist[hi] || ""; suggest(); }
      else if (e.key === "Enter") {
        const line = inp.value.trim(); inp.value = ""; suggest(); if (!line) return;
        hist.push(line); hi = hist.length;
        const d = print(""), pr = document.createElement("span"); pr.className = "pr"; pr.textContent = $(".tln .pr").textContent; d.append(pr, line);
        const c0 = line.split(/\s+/)[0], fn = cmds[c0.toLowerCase()];
        if (!fn) return print(`'${c0}' is not a command. Type help.`, "err");
        try { await fn(line.slice(c0.length).trim()); } catch (err) { print("Error: " + err.message, "err"); }
      }
    };
    $(".tb").onclick = e => { const a = e.target.dataset.a; if (a === "out") { const h = $(".trm").classList.toggle("noout"); e.target.textContent = h ? "Show output" : "Hide output"; } else if (a === "clr") out.innerHTML = ""; };
    $(".trm").onclick = e => { if (!e.target.closest("button,.cb,.sg") && !getSelection().toString()) inp.focus(); };
    print("VUS Terminal. Type help for commands.", "dim"); prompt(); inp.focus();
  }
};
