// VUS Gallery: photos, videos and music from your Files (native app, uses os.sys).
export default {
  open(root, os) {
    const sys = os.sys;
    root.innerHTML = `<style>
.gal{position:relative;display:flex;flex-direction:column;width:100%;height:100%;font-size:13px}
.gal button{background:rgba(128,128,128,.2);border:1px solid rgba(128,128,128,.5);color:inherit;padding:4px 12px;cursor:pointer;font:inherit}.gal button:hover{background:rgba(128,128,128,.35)}.gal button.on{background:var(--ac);border-color:var(--ac);color:#fff}
.gt{display:flex;gap:6px;padding:8px;align-items:center;background:rgba(128,128,128,.14)}.gtabs{display:flex;gap:4px;flex:1;flex-wrap:wrap}
.gq{width:150px;height:28px;padding:0 8px;border:1px solid rgba(128,128,128,.5);background:rgba(128,128,128,.1);color:inherit;outline:0}.gq:focus{border-color:var(--ac)}
.gg{flex:1;overflow:auto;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;align-content:start}
.gi{position:relative;aspect-ratio:1;background:rgba(128,128,128,.18);overflow:hidden;cursor:pointer}.gi img,.gi video{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.gi:hover,.gi.cur{outline:2px solid var(--ac)}.gi.au{background:linear-gradient(135deg,#7b4397,#dc2430)}
.gi .nm{position:absolute;left:0;right:0;bottom:0;padding:3px 6px;font-size:11px;background:rgba(0,0,0,.6);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gi .ic{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:34px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.7);pointer-events:none}
.gempty{grid-column:1/-1;text-align:center;opacity:.6;padding:40px}
.gp{display:none;align-items:center;gap:8px;padding:6px 8px;background:rgba(128,128,128,.14)}.gp.show{display:flex}.gp span{width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gp audio{flex:1;height:32px;min-width:0}
.gv{display:none;position:absolute;inset:0;background:rgba(0,0,0,.93);color:#fff;flex-direction:column;z-index:5;outline:0}.gv.show{display:flex}
.gvt{display:flex;gap:6px;align-items:center;padding:8px;flex-wrap:wrap}.gvt span{flex:1;min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gvb{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:0 8px 8px}.gvb img,.gvb video{max-width:100%;max-height:100%;object-fit:contain}
</style><div class="gal"><div class="gt"><div class="gtabs"></div><input class="gq" placeholder="Search" autocomplete="off"><button data-a="refresh" title="Refresh">↻</button></div><div class="gg"></div><div class="gp"><button data-a="pprev">⏮</button><button data-a="pnext">⏭</button><span></span><audio controls></audio></div><div class="gv" tabindex="0"><div class="gvt"><span></span><button data-v="prev">◀</button><button data-v="next">▶</button><button data-v="slide">Slideshow</button><button data-v="bg">Set as background</button><button data-v="close">✕</button></div><div class="gvb"></div></div></div>`;
    const $ = s => root.querySelector(s), grid = $(".gg"), gv = $(".gv"), gvb = $(".gvb"), gp = $(".gp"), audio = $("audio");
    const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", flac: "audio/flac", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
    const TABS = [["all", "All"], ["image", "Photos"], ["video", "Videos"], ["audio", "Music"]];
    let items = [], tab = "all", q = "", sig = "", vlist = [], vi = 0, slide = null, queue = [], qi = 0, curAudio = "";
    const urls = new Map(), byId = id => items.find(f => f.id === id);
    const url = async f => { // blob URL, made once per file (and fixed up when a file was saved without a type)
      if (urls.has(f.id)) return urls.get(f.id);
      const b = await sys.blob(f.id); if (!b) return "";
      const u = URL.createObjectURL(b.type ? b : new Blob([b], { type: MIME[f.name.split(".").pop().toLowerCase()] || "" })); urls.set(f.id, u); return u;
    };
    const scan = () => { items = sys.files().filter(f => ["image", "audio", "video"].includes(sys.kind(f.name))).map(f => ({ ...f, k: sys.kind(f.name) })).sort((a, b) => (b.mod || 0) - (a.mod || 0)); sig = items.map(f => f.id + f.name).join("|"); };
    const shown = () => items.filter(f => (tab === "all" || f.k === tab) && f.name.toLowerCase().includes(q));
    const io = new IntersectionObserver(es => es.forEach(async e => { // thumbnails load only when they scroll into view
      if (!e.isIntersecting) return; io.unobserve(e.target);
      const f = byId(e.target.dataset.id), m = e.target.querySelector(".mm"); if (!f || !m) return;
      const u = await url(f); m.src = f.k === "video" ? u + "#t=0.5" : u;
    }), { root: grid });
    const draw = () => {
      $(".gtabs").innerHTML = TABS.map(([k, l]) => `<button data-t="${k}" class="${k === tab ? "on" : ""}">${l} (${k === "all" ? items.length : items.filter(f => f.k === k).length})</button>`).join("");
      const list = shown();
      grid.innerHTML = list.length ? list.map(f => `<div class="gi ${f.k === "audio" ? "au" : ""} ${f.id === curAudio ? "cur" : ""}" data-id="${f.id}">${f.k === "image" ? '<img class="mm" alt="">' : f.k === "video" ? '<video class="mm" muted preload="metadata"></video><div class="ic">▶</div>' : '<div class="ic">♪</div>'}<div class="nm">${esc(f.name)}</div></div>`).join("") : '<div class="gempty">No photos, videos or music here yet.<br>Add files in File Explorer and they show up automatically.</div>';
      grid.querySelectorAll(".gi:not(.au)").forEach(el => io.observe(el));
    };
    const refresh = () => { scan(); draw(); };
    // photo and video viewer
    const showV = async () => {
      const f = vlist[vi]; if (!f) return;
      const u = await url(f);
      $(".gvt span").textContent = `${f.name}  (${vi + 1} / ${vlist.length})`;
      gvb.innerHTML = f.k === "video" ? `<video controls autoplay src="${u}"></video>` : `<img src="${u}" alt="">`;
      gv.querySelector("[data-v=bg]").style.display = gv.querySelector("[data-v=slide]").style.display = f.k === "image" ? "" : "none";
    };
    const stopSlide = () => { clearInterval(slide); slide = null; gv.querySelector("[data-v=slide]").textContent = "Slideshow"; };
    const step = d => { vi = (vi + d + vlist.length) % vlist.length; showV(); };
    const closeV = () => { stopSlide(); gv.classList.remove("show"); gvb.innerHTML = ""; };
    // music: plays in the bar at the bottom, keeps going while you browse, then moves to the next song
    const playAudio = async id => {
      queue = shown().filter(f => f.k === "audio").map(f => f.id); qi = Math.max(0, queue.indexOf(id)); curAudio = id;
      const f = byId(id); if (!f) return;
      audio.src = await url(f); audio.play().catch(() => {}); $(".gp span").textContent = f.name; gp.classList.add("show");
      grid.querySelectorAll(".gi").forEach(el => el.classList.toggle("cur", el.dataset.id === id));
    };
    const stepAudio = d => { if (queue.length) playAudio(queue[(qi + d + queue.length) % queue.length]); };
    audio.onended = () => stepAudio(1);
    grid.onclick = e => {
      const el = e.target.closest(".gi"); if (!el) return; const f = byId(el.dataset.id); if (!f) return;
      if (f.k === "audio") return playAudio(f.id);
      vlist = shown().filter(x => x.k !== "audio"); vi = Math.max(0, vlist.findIndex(x => x.id === f.id));
      gv.classList.add("show"); gv.focus(); showV();
    };
    $(".gt").onclick = e => { const t = e.target.closest("[data-t]"); if (t) { tab = t.dataset.t; draw(); } else if (e.target.dataset.a === "refresh") refresh(); };
    $(".gq").oninput = e => { q = e.target.value.trim().toLowerCase(); draw(); };
    gp.onclick = e => { const a = e.target.dataset.a; if (a === "pprev") stepAudio(-1); else if (a === "pnext") stepAudio(1); };
    gv.onclick = e => {
      const a = e.target.dataset.v; if (!a) return;
      if (a === "close") closeV(); else if (a === "prev") step(-1); else if (a === "next") step(1);
      else if (a === "slide") { if (slide) return stopSlide(); slide = setInterval(() => step(1), 4000); e.target.textContent = "Stop"; }
      else if (a === "bg") { const f = vlist[vi]; sys.setBackground(f.id); os.notify("Background set", f.name); }
    };
    gv.onkeydown = e => { if (e.key === "ArrowRight") step(1); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "Escape") closeV(); };
    const timer = setInterval(() => { // notices new files, and cleans up after the window is closed
      if (!root.isConnected) { clearInterval(timer); stopSlide(); audio.pause(); urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); io.disconnect(); return; }
      const old = sig; scan(); if (sig !== old) draw();
    }, 2000);
    os.setTitle("Gallery"); refresh();
  }
};
