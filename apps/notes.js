// VUS-OS native app: Notes (text files + code editor)
// Contract: export default { open(root, os) } — root is the window body, os has storage/setTitle/close.
export default {
  open(root, os) {
    const css = `
.nt{display:flex;height:100%;background:var(--el);color:var(--fg);font-family:'Segoe UI',system-ui,sans-serif}
.nt-side{width:180px;flex-shrink:0;border-right:1px solid var(--bd);display:flex;flex-direction:column}
.nt-new{margin:10px;padding:8px;border-radius:0;border:1px solid var(--ac);background:color-mix(in srgb,var(--ac) 25%,transparent);color:var(--ac);font-weight:600;font-size:12.5px;cursor:pointer}
.nt-list{flex:1;overflow-y:auto;padding:0 6px 6px}
.nt-item{padding:8px 10px;border-radius:0;font-size:12.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--mute)}
.nt-item:hover{background:rgba(128,128,128,.12)}
.nt-item.on{background:rgba(128,128,128,.2);color:var(--fg)}
.nt-main{flex:1;min-width:0;display:flex;flex-direction:column}
.nt-ed{flex:1;resize:none;border:0;outline:0;padding:14px;background:transparent;color:var(--fg);font:13px/1.6 'JetBrains Mono',monospace;tab-size:2;user-select:text}
.nt-bar{display:flex;gap:8px;align-items:center;padding:8px 12px;border-top:1px solid var(--bd);font-size:12px;color:var(--dim)}
.nt-bar span{flex:1}
.nt-bar button{padding:5px 10px;border-radius:0;border:1px solid var(--bd);background:transparent;color:var(--mute);font-size:12px;cursor:pointer}
.nt-bar button:hover{color:var(--fg);border-color:var(--ac)}`;

    root.innerHTML = `<style>${css}</style>
<div class="nt">
  <div class="nt-side"><button class="nt-new">+ New note</button><div class="nt-list"></div></div>
  <div class="nt-main">
    <textarea class="nt-ed" spellcheck="false" wrap="off" placeholder="Start typing..."></textarea>
    <div class="nt-bar"><span></span><button data-a="dl">Download</button><button data-a="del">Delete</button></div>
  </div>
</div>`;

    const $ = s => root.querySelector(s);
    const list = $(".nt-list"), ed = $(".nt-ed"), count = $(".nt-bar span");
    let notes = os.storage.get("notes", null) || [{ id: Date.now(), text: "Welcome to Notes\nEverything you type saves automatically." }];
    let cur = os.storage.get("current", null);
    if (!notes.some(n => n.id === cur)) cur = notes[0].id;

    const title = n => (n.text.split("\n")[0].trim() || "Untitled").slice(0, 40);
    const persist = () => { os.storage.set("notes", notes); os.storage.set("current", cur); };

    function drawList() {
      list.innerHTML = "";
      notes.forEach(n => {
        const d = document.createElement("div");
        d.className = "nt-item" + (n.id === cur ? " on" : "");
        d.textContent = title(n);
        d.onclick = () => { cur = n.id; persist(); show(); };
        list.appendChild(d);
      });
    }
    function show() {
      const n = notes.find(x => x.id === cur);
      ed.value = n.text;
      count.textContent = n.text.length.toLocaleString() + " characters";
      os.setTitle("Notes - " + title(n));
      drawList();
    }

    let t;
    ed.oninput = () => {
      const n = notes.find(x => x.id === cur);
      n.text = ed.value;
      count.textContent = n.text.length.toLocaleString() + " characters";
      clearTimeout(t);
      t = setTimeout(() => { persist(); drawList(); os.setTitle("Notes - " + title(n)); }, 300);
    };
    // Tab key inserts two spaces so it works as a code editor
    ed.onkeydown = e => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      const s = ed.selectionStart;
      ed.setRangeText("  ", s, ed.selectionEnd, "end");
      ed.dispatchEvent(new Event("input"));
    };

    $(".nt-new").onclick = () => {
      const n = { id: Date.now(), text: "" };
      notes.unshift(n); cur = n.id; persist(); show(); ed.focus();
    };
    $(".nt-bar").onclick = e => {
      const a = e.target.dataset.a;
      const n = notes.find(x => x.id === cur);
      if (a === "dl") {
        // keep your own extension if the first line looks like a filename (e.g. index.html)
        const first = title(n);
        const name = /^[\w\-. ]+\.\w{1,6}$/.test(first) ? first : first.replace(/[^\w\-. ]/g, "_") + ".txt";
        const url = URL.createObjectURL(new Blob([n.text], { type: "text/plain" }));
        const l = document.createElement("a"); l.href = url; l.download = name; l.click();
        URL.revokeObjectURL(url);
      }
      if (a === "del" && confirm("Delete this note?")) {
        notes = notes.filter(x => x.id !== cur);
        if (!notes.length) notes = [{ id: Date.now(), text: "" }];
        cur = notes[0].id; persist(); show();
      }
    };
    show();
  }
};
