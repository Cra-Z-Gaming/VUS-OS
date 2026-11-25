// VUS-OS native app: Notes (quick notes + code editor).
// Notes save by themselves. New: tabs, search, find and replace, and a note can be linked to a real file in Files
// (Open from Files / Save to Files); a linked note keeps its file up to date as you type.
// Contract: export default { open(root, os) } — root is the window body, os has storage/setTitle/close/notify/sys.
export default {
  open(root, os) {
    const css = `
.nt{position:relative;display:flex;height:100%;background:var(--el);color:var(--fg);font-family:'Segoe UI',system-ui,sans-serif}
.nt button,.nt input{font-family:inherit}
.nt-side{width:190px;flex-shrink:0;border-right:1px solid var(--bd);display:flex;flex-direction:column}
.nt-new{margin:10px 10px 6px;padding:8px;border-radius:0;border:1px solid var(--ac);background:color-mix(in srgb,var(--ac) 25%,transparent);color:var(--ac);font-weight:600;font-size:12.5px;cursor:pointer}
.nt-q{margin:0 10px 8px;padding:6px 8px;border:1px solid var(--bd);background:transparent;color:var(--fg);font-size:12.5px;outline:0}
.nt-q:focus{border-color:var(--ac)}
.nt-list{flex:1;overflow-y:auto;padding:0 6px 6px}
.nt-item{padding:8px 10px;border-radius:0;font-size:12.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--mute)}
.nt-item:hover{background:rgba(128,128,128,.12)}
.nt-item.on{background:rgba(128,128,128,.2);color:var(--fg)}
.nt-none{padding:10px;font-size:12px;color:var(--dim)}
.nt-main{flex:1;min-width:0;display:flex;flex-direction:column}
.nt-tabs{display:flex;overflow-x:auto;border-bottom:1px solid var(--bd);flex-shrink:0}
.nt-tab{display:flex;align-items:center;gap:6px;padding:6px 8px 6px 12px;font-size:12px;color:var(--mute);cursor:pointer;white-space:nowrap;border-right:1px solid var(--bd);max-width:180px}
.nt-tab span{overflow:hidden;text-overflow:ellipsis}
.nt-tab:hover{background:rgba(128,128,128,.12)}
.nt-tab.on{background:rgba(128,128,128,.2);color:var(--fg)}
.nt-tab b{font-weight:400;padding:0 4px;opacity:.6}.nt-tab b:hover{opacity:1;background:rgba(128,128,128,.3)}
.nt-tab i{font-style:normal;font-size:10px;color:var(--ac)}
.nt-find{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid var(--bd);font-size:12px}
.nt-find[hidden]{display:none}
.nt-find input[type=text]{width:130px;padding:4px 6px;border:1px solid var(--bd);background:transparent;color:var(--fg);outline:0}
.nt-find input[type=text]:focus{border-color:var(--ac)}
.nt-find label{display:flex;gap:4px;align-items:center;color:var(--mute)}
.nt-find em{font-style:normal;color:var(--dim);min-width:70px}
.nt-ed{flex:1;resize:none;border:0;outline:0;padding:14px;background:transparent;color:var(--fg);font:13px/1.6 'JetBrains Mono',monospace;tab-size:2;user-select:text}
.nt-bar{display:flex;gap:8px;align-items:center;padding:8px 12px;border-top:1px solid var(--bd);font-size:12px;color:var(--dim);flex-wrap:wrap}
.nt-bar span{flex:1;min-width:120px}
.nt button.nb{padding:5px 10px;border-radius:0;border:1px solid var(--bd);background:transparent;color:var(--mute);font-size:12px;cursor:pointer}
.nt button.nb:hover{color:var(--fg);border-color:var(--ac)}
.nt-ov{position:absolute;inset:0;z-index:9;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}
.nt-box{background:var(--el);border:1px solid var(--bd);padding:14px;width:340px;max-width:92%;max-height:86%;display:flex;flex-direction:column;gap:8px}
.nt-box .nt-pick{overflow-y:auto;flex:1;min-height:80px}
.nt-box .nt-item{display:flex;justify-content:space-between;gap:10px}
.nt-box .nt-item small{color:var(--dim);flex-shrink:0}`;

    root.innerHTML = `<style>${css}</style>
<div class="nt">
  <div class="nt-side"><button class="nt-new">+ New note</button><input class="nt-q" placeholder="Search notes" autocomplete="off"><div class="nt-list"></div></div>
  <div class="nt-main">
    <div class="nt-tabs"></div>
    <div class="nt-find" hidden>
      <input type="text" class="nt-f" placeholder="Find" autocomplete="off"><input type="text" class="nt-r" placeholder="Replace with" autocomplete="off">
      <label><input type="checkbox" class="nt-c"> Match case</label>
      <button class="nb" data-f="prev">Prev</button><button class="nb" data-f="next">Next</button><button class="nb" data-f="rep">Replace</button><button class="nb" data-f="all">Replace all</button><button class="nb" data-f="x">Close</button><em></em>
    </div>
    <textarea class="nt-ed" spellcheck="false" wrap="off" placeholder="Start typing..."></textarea>
    <div class="nt-bar"><span></span><button class="nb" data-a="open">Open from Files</button><button class="nb" data-a="save">Save to Files</button><button class="nb" data-a="find">Find</button><button class="nb" data-a="dl">Download</button><button class="nb" data-a="del">Delete</button></div>
  </div>
</div>`;

    const $ = s => root.querySelector(s);
    const list = $(".nt-list"), ed = $(".nt-ed"), count = $(".nt-bar span"), tabsEl = $(".nt-tabs"), search = $(".nt-q");
    const fbar = $(".nt-find"), fIn = $(".nt-f"), rIn = $(".nt-r"), mcase = $(".nt-c"), fInfo = $(".nt-find em");

    let notes = os.storage.get("notes", null) || [{ id: Date.now(), text: "Welcome to Notes\nEverything you type saves automatically." }];
    let cur = os.storage.get("current", null);
    if (!notes.some(n => n.id === cur)) cur = notes[0].id;
    let tabs = (os.storage.get("tabs", null) || []).filter(id => notes.some(n => n.id === id));
    if (!tabs.includes(cur)) tabs.push(cur);
    let msg = "", msgTimer = 0, q = "";

    const get = id => notes.find(n => n.id === id);
    const title = n => (n.text.split("\n")[0].trim() || "Untitled").slice(0, 40);
    const persist = () => { os.storage.set("notes", notes); os.storage.set("current", cur); os.storage.set("tabs", tabs); };
    const say = t => { msg = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => { msg = ""; info(); }, 4000); info(); };
    const fileOf = n => n.fid && os.sys.files().find(f => f.id === n.fid); // the linked file, if it still exists
    const info = () => {
      const n = get(cur), words = (n.text.match(/\S+/g) || []).length, f = fileOf(n);
      count.textContent = msg || (n.text.length.toLocaleString() + " characters · " + words.toLocaleString() + " words" + (f ? " · linked to " + f.name : ""));
    };

    function drawList() {
      list.innerHTML = "";
      const t = q.toLowerCase(), shown = notes.filter(n => !t || n.text.toLowerCase().includes(t));
      shown.forEach(n => {
        const d = document.createElement("div");
        d.className = "nt-item" + (n.id === cur ? " on" : "");
        d.textContent = title(n);
        d.onclick = () => openNote(n.id);
        list.appendChild(d);
      });
      if (!shown.length) { const d = document.createElement("div"); d.className = "nt-none"; d.textContent = "No notes match."; list.appendChild(d); }
    }
    function drawTabs() {
      tabsEl.innerHTML = "";
      tabs.forEach(id => {
        const n = get(id); if (!n) return;
        const d = document.createElement("div"); d.className = "nt-tab" + (id === cur ? " on" : "");
        const s = document.createElement("span"); s.textContent = title(n); d.appendChild(s);
        if (n.fid) { const l = document.createElement("i"); l.textContent = "file"; l.title = "Linked to a file in Files"; d.appendChild(l); }
        const x = document.createElement("b"); x.textContent = "×"; x.title = "Close tab (the note is kept)"; x.onclick = e => { e.stopPropagation(); closeTab(id); }; d.appendChild(x);
        d.onclick = () => openNote(id);
        d.onauxclick = e => { if (e.button === 1) closeTab(id); };
        tabsEl.appendChild(d);
      });
    }
    let token = 0;
    function show() {
      const n = get(cur);
      ed.value = n.text;
      os.setTitle("Notes - " + title(n));
      info(); drawList(); drawTabs(); findCount();
      syncFromFile(n);
    }
    async function syncFromFile(n) { // a linked note follows its file if the file was changed somewhere else (File Explorer, Notepad)
      if (!n.fid) return;
      const my = ++token;
      try {
        const f = fileOf(n);
        if (!f) { n.fid = null; persist(); drawTabs(); say("The linked file is gone, so this note is not linked any more."); return; }
        const t = await os.sys.read(n.fid);
        if (my !== token || cur !== n.id || t === null || t === n.text || ed.value !== n.text || pendingSave) return;
        n.text = t; ed.value = t; persist(); info(); drawList(); drawTabs();
      } catch {}
    }
    function openNote(id) {
      if (!get(id)) return;
      if (!tabs.includes(id)) tabs.push(id);
      cur = id; persist(); show();
    }
    function closeTab(id) {
      const i = tabs.indexOf(id); if (i < 0) return;
      tabs.splice(i, 1);
      if (!tabs.length) tabs.push(notes.find(n => n.id !== id) ? notes.find(n => n.id !== id).id : id);
      if (cur === id) cur = tabs[Math.min(i, tabs.length - 1)];
      persist(); show();
    }

    // typing: the note saves after a short pause, and a linked note also saves its file
    let t, pendingSave = false;
    const changed = () => {
      const n = get(cur); n.text = ed.value; pendingSave = true;
      info(); clearTimeout(t);
      t = setTimeout(async () => {
        persist(); drawList(); drawTabs(); os.setTitle("Notes - " + title(n));
        if (n.fid) {
          try { if (!(await os.sys.overwrite(n.fid, n.text))) { n.fid = null; persist(); drawTabs(); say("The linked file is gone, so this note is not linked any more."); } }
          catch { say("Couldn't save the linked file."); }
        }
        pendingSave = false;
      }, 300);
    };
    ed.oninput = changed;
    // Tab key inserts two spaces so it works as a code editor
    ed.onkeydown = e => {
      if (e.key === "F3") { e.preventDefault(); step(e.shiftKey ? -1 : 1); return; }
      if (e.key !== "Tab") return;
      e.preventDefault();
      const s = ed.selectionStart;
      ed.setRangeText("  ", s, ed.selectionEnd, "end");
      ed.dispatchEvent(new Event("input"));
    };

    // ---------- find and replace ----------
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = () => fIn.value ? new RegExp(esc(fIn.value), mcase.checked ? "g" : "gi") : null;
    function findCount() {
      if (fbar.hidden) return;
      const r = re(); if (!r) { fInfo.textContent = ""; return; }
      const c = (ed.value.match(r) || []).length;
      fInfo.textContent = c === 1 ? "1 match" : c + " matches";
    }
    function step(dir) { // select the next or previous match, wrapping around
      const r = re(); if (!r) { fIn.focus(); return; }
      const text = ed.value, hits = [];
      let m; while ((m = r.exec(text))) { hits.push(m.index); if (!m[0].length) r.lastIndex++; }
      if (!hits.length) { fInfo.textContent = "No matches"; return; }
      const len = fIn.value.length;
      let at;
      if (dir > 0) at = hits.find(i => i >= ed.selectionEnd);
      else at = [...hits].reverse().find(i => i + len <= ed.selectionStart);
      if (at === undefined) at = dir > 0 ? hits[0] : hits[hits.length - 1];
      ed.focus(); ed.setSelectionRange(at, at + len);
      const line = text.slice(0, at).split("\n").length - 1; // keep the match in view
      ed.scrollTop = Math.max(0, line * 20.8 - ed.clientHeight / 2);
      findCount();
    }
    function replaceOne() {
      const r = re(); if (!r) return;
      const sel = ed.value.slice(ed.selectionStart, ed.selectionEnd);
      if (sel && (mcase.checked ? sel === fIn.value : sel.toLowerCase() === fIn.value.toLowerCase())) {
        ed.setRangeText(rIn.value, ed.selectionStart, ed.selectionEnd, "end"); changed();
      }
      step(1);
    }
    function replaceAll() {
      const r = re(); if (!r) return;
      const c = (ed.value.match(r) || []).length; if (!c) { fInfo.textContent = "No matches"; return; }
      ed.value = ed.value.replace(r, () => rIn.value); changed(); findCount();
      fInfo.textContent = "Replaced " + c;
    }
    function openFind(sel) {
      fbar.hidden = false;
      const s = ed.value.slice(ed.selectionStart, ed.selectionEnd);
      if (s && !s.includes("\n")) fIn.value = s;
      fIn.focus(); fIn.select(); findCount();
    }
    const closeFind = () => { fbar.hidden = true; ed.focus(); };
    fIn.oninput = findCount; mcase.onchange = findCount;
    fIn.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); } else if (e.key === "Escape") closeFind(); };
    rIn.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); replaceOne(); } else if (e.key === "Escape") closeFind(); };
    fbar.onclick = e => {
      const a = e.target.dataset.f; if (!a) return;
      if (a === "next") step(1); else if (a === "prev") step(-1); else if (a === "rep") replaceOne(); else if (a === "all") replaceAll(); else closeFind();
    };
    root.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "h")) { e.preventDefault(); openFind(); } });

    // ---------- files ----------
    const fileName = n => { const first = title(n); return /^[\w\-. ]+\.\w{1,6}$/.test(first) ? first : (first.replace(/[^\w\-. ]/g, "_") || "note") + ".txt"; };
    async function saveToFiles() {
      const n = get(cur);
      try {
        if (n.fid && fileOf(n)) { await os.sys.overwrite(n.fid, n.text); return say("Saved to " + fileOf(n).name); }
        const before = new Set(os.sys.files().map(f => f.id));
        if (!(await os.sys.write(fileName(n), n.text))) return say("Couldn't save the file (storage may be full).");
        const f = os.sys.files().find(x => !before.has(x.id));
        if (f) { n.fid = f.id; persist(); drawTabs(); os.notify("Saved to Files", f.name + " is on your Desktop. This note stays linked to it."); say("Saved as " + f.name + " (linked)"); info(); }
      } catch { say("Couldn't save the file."); }
    }
    function modal(inner) {
      const o = document.createElement("div"); o.className = "nt-ov";
      o.innerHTML = `<div class="nt-box">${inner}</div>`;
      $(".nt").appendChild(o);
      o.onclick = e => { if (e.target === o) o.remove(); };
      o.onkeydown = e => { if (e.key === "Escape") { e.stopPropagation(); o.remove(); } };
      return o;
    }
    function openFromFiles() {
      const TEXT = /\.(txt|md|markdown|js|mjs|json|html?|css|csv|tsv|xml|log|ini|cfg|ya?ml|py|vsh|sh|bat|c|h|cpp|java|ts|sql)$/i, MAX = 2097152;
      const all = os.sys.files().filter(f => TEXT.test(f.name)), files = all.filter(f => (f.size || 0) <= MAX).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const hidden = all.length - files.length;
      const o = modal(`<b>Open from Files</b><input class="nt-q" placeholder="Search files" autocomplete="off" style="margin:0"><div class="nt-pick"></div><div class="nt-none">${hidden ? hidden + " bigger file" + (hidden > 1 ? "s" : "") + " (over 2 MB) hidden. " : ""}The note stays linked to the file: changes are saved to both.</div><div style="text-align:right"><button class="nb">Cancel</button></div>`);
      const pick = o.querySelector(".nt-pick"), box = o.querySelector(".nt-q");
      const draw = () => {
        const t = box.value.toLowerCase(), rows = files.filter(f => f.name.toLowerCase().includes(t));
        pick.innerHTML = "";
        rows.forEach(f => {
          const d = document.createElement("div"); d.className = "nt-item";
          const a = document.createElement("span"); a.textContent = f.name; const b = document.createElement("small"); b.textContent = f.size ? (f.size < 1024 ? f.size + " B" : (f.size / 1024).toFixed(1) + " KB") : "";
          d.append(a, b);
          d.onclick = async () => {
            const have = notes.find(n => n.fid === f.id);
            if (have) { o.remove(); return openNote(have.id); }
            let text; try { text = await os.sys.read(f.id); } catch {}
            if (text === null || text === undefined) return say("Couldn't read " + f.name);
            const n = { id: Date.now(), text, fid: f.id };
            notes.unshift(n); o.remove(); openNote(n.id);
          };
          pick.appendChild(d);
        });
        if (!rows.length) { const d = document.createElement("div"); d.className = "nt-none"; d.textContent = files.length ? "No files match." : "No text files yet. Right-click the desktop to create or upload one."; pick.appendChild(d); }
      };
      box.oninput = draw; o.querySelector("button").onclick = () => o.remove(); draw(); box.focus();
    }

    $(".nt-new").onclick = () => {
      const n = { id: Date.now(), text: "" };
      notes.unshift(n); openNote(n.id); ed.focus();
    };
    search.oninput = () => { q = search.value.trim(); drawList(); };
    $(".nt-bar").onclick = e => {
      const a = e.target.dataset.a;
      const n = get(cur);
      if (a === "open") openFromFiles();
      if (a === "save") saveToFiles();
      if (a === "find") openFind();
      if (a === "dl") {
        // keep your own extension if the first line looks like a filename (e.g. index.html)
        const url = URL.createObjectURL(new Blob([n.text], { type: "text/plain" }));
        const l = document.createElement("a"); l.href = url; l.download = fileName(n); l.click();
        URL.revokeObjectURL(url);
      }
      if (a === "del" && confirm(n.fid ? "Delete this note? The linked file in Files is kept." : "Delete this note?")) {
        notes = notes.filter(x => x.id !== cur);
        tabs = tabs.filter(x => x !== cur);
        if (!notes.length) notes = [{ id: Date.now(), text: "" }];
        if (!tabs.length) tabs = [notes[0].id];
        cur = tabs[0]; persist(); show();
      }
    };
    show();
  }
};
