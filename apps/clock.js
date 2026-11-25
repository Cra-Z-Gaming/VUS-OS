// VUS-OS native app: Clock (clock + world clocks, timer, stopwatch, alarms).
// Important: the timer and the alarms only ring while this window is open (you can minimize it, but not close it).
// Contract: export default { open(root, os) } — root is the window body, os has storage/setTitle/notify.

const pad = n => String(n).padStart(2, "0");
const hms = ms => { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600); return (h ? h + ":" : "") + pad(Math.floor(s % 3600 / 60)) + ":" + pad(s % 60); };
const sw = ms => { const t = Math.floor(ms / 10), c = t % 100, s = Math.floor(t / 100) % 60, m = Math.floor(t / 6000); return pad(m) + ":" + pad(s) + "." + pad(c); };

export default {
  open(root, os) {
    const css = `
.ck{display:flex;flex-direction:column;height:100%;background:var(--el);color:var(--fg);font-family:'Segoe UI',system-ui,sans-serif;font-size:13px}
.ck button,.ck input,.ck select{font-family:inherit;font-size:13px}
.ck button{border:1px solid var(--bd);background:rgba(128,128,128,.12);color:var(--fg);padding:6px 14px;cursor:pointer;border-radius:0}
.ck button:hover{border-color:var(--ac);background:rgba(128,128,128,.22)}
.ck button.go{background:var(--ac);border-color:var(--ac);color:#fff}
.ck input,.ck select{border:1px solid var(--bd);background:transparent;color:var(--fg);padding:5px 7px;outline:0;border-radius:0}
.ck select option{background:var(--el);color:var(--fg)}
.ck input:focus,.ck select:focus{border-color:var(--ac)}
.ck-tabs{display:flex;border-bottom:1px solid var(--bd)}
.ck-tabs button{border:0;border-bottom:2px solid transparent;background:transparent;padding:9px 16px}
.ck-tabs button.on{border-bottom-color:var(--ac)}
.ck-pg{flex:1;min-height:0;overflow-y:auto;padding:16px;display:flex;flex-direction:column;align-items:center;gap:12px}
.ck-big{font:200 64px 'Segoe UI',system-ui,sans-serif;letter-spacing:1px;margin-top:8px}
.ck-sub{color:var(--mute)}
.ck-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:center}
.ck-note{color:var(--dim);font-size:12px;text-align:center;max-width:380px}
.ck-list{width:100%;max-width:460px;display:flex;flex-direction:column}
.ck-li{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid rgba(128,128,128,.25)}
.ck-li span{flex:1}.ck-li b{font-weight:500;font-size:18px}.ck-li small{color:var(--dim)}
.ck-li button{padding:3px 9px}
.ck-bar{width:100%;max-width:380px;height:6px;background:rgba(128,128,128,.25)}.ck-bar i{display:block;height:100%;background:var(--ac)}
.ck-ring{width:100%;max-width:460px;background:#e5534b;color:#fff;padding:10px 12px;display:flex;align-items:center;gap:10px;font-weight:600}
.ck-ring span{flex:1}.ck-ring[hidden]{display:none}.ck-ring button{background:#fff;color:#333;border:0}
.ck-in{width:62px;text-align:center}`;
    root.innerHTML = `<style>${css}</style><div class="ck">
<div class="ck-tabs"><button data-t="clock">Clock</button><button data-t="timer">Timer</button><button data-t="watch">Stopwatch</button><button data-t="alarm">Alarms</button></div>
<div class="ck-pg"><div class="ck-ring" hidden><span></span><button data-a="stopring">Dismiss</button></div><div class="ck-view"></div></div></div>`;

    const $ = s => root.querySelector(s), view = $(".ck-view"), ring = $(".ck-ring");
    let tab = os.storage.get("tab", "clock"), h24 = os.storage.get("h24", false);
    let zones = os.storage.get("zones", null); if (!Array.isArray(zones)) zones = ["America/New_York", "Europe/London", "Asia/Tokyo"];
    let alarms = os.storage.get("alarms", []); if (!Array.isArray(alarms)) alarms = [];
    // timer: counts to an end time (so it stays right even if the page is busy); stopwatch: adds up running time
    let tm = { total: 0, left: 0, end: 0, on: false, done: false };
    let wt = { base: 0, start: 0, on: false, laps: [] };
    const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const timeIn = (d, zone, sec) => { try { return d.toLocaleTimeString([], { timeZone: zone, hour12: !h24, hour: "numeric", minute: "2-digit", second: sec ? "2-digit" : undefined }); } catch { return "?"; } };
    const zoneName = z => z.split("/").pop().replace(/_/g, " ");

    // ---------- sound (only starts after you press something in this window, so the browser allows it) ----------
    let ctx = null, ringTimer = 0, ringMsg = "";
    const audio = () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); } catch {} };
    const beep = (f, at, len) => { if (!ctx) return; try { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, ctx.currentTime + at); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + len); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + len + 0.05); } catch {} };
    function startRing(msg) {
      ringMsg = msg; ring.hidden = false; ring.querySelector("span").textContent = msg;
      os.notify(msg, "Open the Clock window to dismiss.");
      clearInterval(ringTimer); let n = 0;
      const once = () => { beep(880, 0, 0.18); beep(880, 0.25, 0.18); beep(1175, 0.5, 0.3); if (++n > 40) stopRing(); }; // about 30 seconds, then it gives up by itself
      once(); ringTimer = setInterval(once, 750);
    }
    function stopRing() { clearInterval(ringTimer); ringTimer = 0; ring.hidden = true; ringMsg = ""; }

    // ---------- the four pages ----------
    function drawClock() {
      const d = new Date();
      view.innerHTML = `<div class="ck-big"></div><div class="ck-sub"></div><div class="ck-sub">${tz() ? "Time zone: " + tz() : ""}</div>
<div class="ck-row"><label><input type="checkbox" class="h24"> 24-hour clock</label></div>
<div class="ck-list"><div class="ck-sub" style="padding:8px 4px">World clocks</div><div class="zl"></div>
<div class="ck-row" style="padding-top:10px"><select class="zs"></select><button class="za">Add</button></div></div>`;
      view.querySelector(".h24").checked = h24;
      view.querySelector(".h24").onchange = e => { h24 = e.target.checked; os.storage.set("h24", h24); tick(); };
      const sel = view.querySelector(".zs");
      let all = []; try { all = Intl.supportedValuesOf("timeZone"); } catch {}
      if (!all.length) all = ["America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Tokyo", "Asia/Kolkata", "Australia/Sydney"];
      sel.innerHTML = all.map(z => `<option value="${z}">${z.replace(/_/g, " ")}</option>`).join("");
      view.querySelector(".za").onclick = () => { const z = sel.value; if (z && !zones.includes(z)) { zones.push(z); os.storage.set("zones", zones); drawZones(); } };
      drawZones(); tick();
    }
    function drawZones() {
      const zl = view.querySelector(".zl"); if (!zl) return; zl.innerHTML = "";
      const d = new Date();
      zones.forEach(z => {
        const r = document.createElement("div"); r.className = "ck-li";
        r.innerHTML = `<span></span><b></b><button title="Remove">×</button>`;
        r.querySelector("span").textContent = zoneName(z); r.querySelector("b").dataset.z = z; r.querySelector("b").textContent = timeIn(d, z, false);
        r.querySelector("button").onclick = () => { zones = zones.filter(x => x !== z); os.storage.set("zones", zones); drawZones(); };
        zl.appendChild(r);
      });
    }
    function drawTimer() {
      view.innerHTML = `<div class="ck-big tl"></div><div class="ck-bar"><i></i></div>
<div class="ck-row set"><input class="ck-in th" type="number" min="0" max="99" value="0"> h <input class="ck-in tmn" type="number" min="0" max="59" value="5"> min <input class="ck-in ts" type="number" min="0" max="59" value="0"> s</div>
<div class="ck-row set"><button data-p="60">1 min</button><button data-p="300">5 min</button><button data-p="600">10 min</button><button data-p="900">15 min</button><button data-p="1800">30 min</button></div>
<div class="ck-row"><button class="go" data-b="start">Start</button><button data-b="reset">Reset</button></div>
<div class="ck-note">The timer rings only while this window is open. Minimize it, don't close it.</div>`;
      view.onclick = e => {
        const p = e.target.dataset.p, b = e.target.dataset.b;
        if (p) { const s = +p; view.querySelector(".th").value = Math.floor(s / 3600); view.querySelector(".tmn").value = Math.floor(s % 3600 / 60); view.querySelector(".ts").value = s % 60; tick(); }
        if (b === "start") { audio(); timerStart(); }
        if (b === "reset") timerReset();
      };
      tick();
    }
    const timerSecs = () => Math.min(359999, (+view.querySelector(".th").value || 0) * 3600 + (+view.querySelector(".tmn").value || 0) * 60 + (+view.querySelector(".ts").value || 0));
    function timerStart() {
      if (tm.on) { tm.left = Math.max(0, tm.end - Date.now()); tm.on = false; } // Pause
      else {
        if (!tm.left || tm.done) { const s = timerSecs(); if (!s) return; tm.total = tm.left = s * 1000; tm.done = false; }
        tm.end = Date.now() + tm.left; tm.on = true;
      }
      tick();
    }
    function timerReset() { tm = { total: 0, left: 0, end: 0, on: false, done: false }; stopRing(); tick(); }
    function drawWatch() {
      view.innerHTML = `<div class="ck-big wl"></div><div class="ck-row"><button class="go" data-b="start">Start</button><button data-b="lap">Lap</button><button data-b="reset">Reset</button></div><div class="ck-list ll"></div>`;
      view.onclick = e => {
        const b = e.target.dataset.b; if (!b) return;
        const now = () => wt.base + (wt.on ? performance.now() - wt.start : 0);
        if (b === "start") { if (wt.on) { wt.base = now(); wt.on = false; } else { wt.start = performance.now(); wt.on = true; } }
        if (b === "lap" && (wt.on || wt.base)) wt.laps.unshift(now());
        if (b === "reset") wt = { base: 0, start: 0, on: false, laps: [] };
        drawLaps(); tick();
      };
      drawLaps(); tick();
    }
    function drawLaps() {
      const ll = view.querySelector(".ll"); if (!ll) return; ll.innerHTML = "";
      wt.laps.forEach((t, i) => {
        const prev = wt.laps[i + 1] || 0, r = document.createElement("div"); r.className = "ck-li";
        r.innerHTML = `<small>Lap ${wt.laps.length - i}</small><span></span><b></b>`; r.querySelector("span").textContent = "+" + sw(t - prev); r.querySelector("b").textContent = sw(t);
        ll.appendChild(r);
      });
    }
    function drawAlarm() {
      view.innerHTML = `<div class="ck-row"><input class="at" type="time" value="07:00"><input class="an" placeholder="Name (optional)" maxlength="30"><label><input type="checkbox" class="ad"> Every day</label><button class="go aa">Add alarm</button></div>
<div class="ck-list al"></div><div class="ck-note">Alarms ring only while this window is open. Minimize it, don't close it.</div>`;
      view.querySelector(".aa").onclick = () => {
        const t = view.querySelector(".at").value; if (!t) return; audio();
        alarms.push({ id: Date.now() + Math.random(), t, n: view.querySelector(".an").value.trim(), on: true, daily: view.querySelector(".ad").checked, last: "" });
        alarms.sort((a, b) => a.t.localeCompare(b.t)); os.storage.set("alarms", alarms); fillAlarms();
      };
      fillAlarms();
    }
    function fillAlarms() {
      const al = view.querySelector(".al"); if (!al) return; al.innerHTML = "";
      if (!alarms.length) { const d = document.createElement("div"); d.className = "ck-note"; d.style.padding = "12px"; d.textContent = "No alarms yet."; al.appendChild(d); return; }
      alarms.forEach(a => {
        const r = document.createElement("div"); r.className = "ck-li";
        const when = new Date(); const [hh, mm] = a.t.split(":"); when.setHours(+hh, +mm, 0, 0);
        r.innerHTML = `<input type="checkbox" title="On / off"><b></b><span><small></small></span><button title="Delete">×</button>`;
        const cb = r.querySelector("input"); cb.checked = a.on;
        r.querySelector("b").textContent = when.toLocaleTimeString([], { hour12: !h24, hour: "numeric", minute: "2-digit" });
        r.querySelector("small").textContent = (a.n ? a.n + " · " : "") + (a.daily ? "every day" : "once");
        cb.onchange = () => { a.on = cb.checked; a.last = ""; audio(); os.storage.set("alarms", alarms); };
        r.querySelector("button").onclick = () => { alarms = alarms.filter(x => x !== a); os.storage.set("alarms", alarms); fillAlarms(); };
        al.appendChild(r);
      });
    }

    // ---------- one tick, four times a second ----------
    function tick() {
      const now = new Date();
      if (tab === "clock") {
        const big = view.querySelector(".ck-big"); if (big) { big.textContent = timeIn(now, undefined, true); view.querySelector(".ck-sub").textContent = now.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" }); }
        view.querySelectorAll("b[data-z]").forEach(b => { b.textContent = timeIn(now, b.dataset.z, false); });
      }
      if (tab === "timer") {
        const left = tm.on ? Math.max(0, tm.end - Date.now()) : tm.left, big = view.querySelector(".tl"); if (!big) return;
        big.textContent = (tm.total || tm.on) ? hms(left) : hms(timerSecs() * 1000);
        view.querySelector(".ck-bar i").style.width = tm.total ? Math.max(0, Math.min(100, left / tm.total * 100)) + "%" : "0%";
        view.querySelector("[data-b=start]").textContent = tm.on ? "Pause" : (tm.left && !tm.done ? "Resume" : "Start");
        view.querySelectorAll(".set").forEach(s => { s.style.display = tm.on || (tm.left && !tm.done) ? "none" : ""; });
      }
      if (tab === "watch") {
        const wl = view.querySelector(".wl"); if (wl) { wl.textContent = sw(wt.base + (wt.on ? performance.now() - wt.start : 0)); view.querySelector("[data-b=start]").textContent = wt.on ? "Stop" : (wt.base ? "Resume" : "Start"); }
      }
      // the timer and the alarms are checked on every page, so they keep working while you look at another tab
      if (tm.on && tm.end - Date.now() <= 0) { tm.on = false; tm.left = 0; tm.done = true; startRing("Timer finished"); if (tab === "timer") tick(); }
      const key = now.getFullYear() + "-" + now.getMonth() + "-" + now.getDate() + " " + pad(now.getHours()) + ":" + pad(now.getMinutes());
      alarms.forEach(a => {
        if (!a.on || a.t !== pad(now.getHours()) + ":" + pad(now.getMinutes()) || a.last === key) return;
        a.last = key; if (!a.daily) a.on = false;
        os.storage.set("alarms", alarms); startRing(a.n ? "Alarm: " + a.n : "Alarm " + a.t); if (tab === "alarm") fillAlarms();
      });
      const running = tm.on ? "Timer " + hms(tm.end - Date.now()) + " - " : "";
      os.setTitle(running + "Clock");
    }

    function go(t) {
      tab = t; os.storage.set("tab", t); view.onclick = null;
      root.querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === t));
      ({ clock: drawClock, timer: drawTimer, watch: drawWatch, alarm: drawAlarm })[t]();
    }
    root.addEventListener("click", e => {
      const t = e.target.dataset && e.target.dataset.t; if (t) go(t);
      if (e.target.dataset && e.target.dataset.a === "stopring") stopRing();
    });
    const timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); stopRing(); try { ctx && ctx.close(); } catch {} return; }
      tick();
    }, 250);
    if (!["clock", "timer", "watch", "alarm"].includes(tab)) tab = "clock";
    go(tab);
  },
  __test: { hms, sw }
};
