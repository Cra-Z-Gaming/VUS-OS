// VUS-OS native app: Calculator (standard + scientific).
// You can click the keys or just type: numbers, + - * / ^ ( ) ! %, Enter = equals, Esc = clear.
// Nothing is run with eval: the expression is read by a small parser (see evaluate).
// Contract: export default { open(root, os) } — root is the window body, os has storage/setTitle.

// ---------- the math (kept outside the window code so it can be tested on its own) ----------
const FACT_MAX = 170; // 171! is already too big for a number
function fact(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error("Factorial needs a whole number, 0 or more");
  if (n > FACT_MAX) throw new Error("Too big");
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}
function tokens(src) {
  const s = String(src).replace(/×/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-").replace(/π/g, "pi").replace(/√/g, "sqrt").replace(/,/g, "");
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = s.slice(i); let m;
    if ((m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(rest))) { out.push({ n: parseFloat(m[0]) }); i += m[0].length; }
    else if ((m = /^[a-z]+/i.exec(rest))) { out.push({ w: m[0].toLowerCase() }); i += m[0].length; }
    else if ("+-*/^()!%".includes(c)) { out.push({ o: c }); i++; }
    else throw new Error("Unexpected " + c);
  }
  return out;
}
function evaluate(src, deg, ans) { // returns a number or throws Error with a plain message
  const t = tokens(src); let p = 0;
  const isO = c => t[p] && t[p].o === c;
  const rad = x => deg ? x * Math.PI / 180 : x, back = x => deg ? x * 180 / Math.PI : x;
  const tidy = x => Math.abs(x) < 1e-12 ? 0 : x; // sin(180 degrees) should be 0, not 1.2e-16
  const FN = {
    sin: x => tidy(Math.sin(rad(x))), cos: x => tidy(Math.cos(rad(x))), tan: x => { const c = Math.cos(rad(x)); if (Math.abs(c) < 1e-12) throw new Error("tan is not defined here"); return tidy(Math.sin(rad(x)) / c); },
    asin: x => { if (x < -1 || x > 1) throw new Error("asin needs -1 to 1"); return back(Math.asin(x)); }, acos: x => { if (x < -1 || x > 1) throw new Error("acos needs -1 to 1"); return back(Math.acos(x)); }, atan: x => back(Math.atan(x)),
    ln: x => { if (x <= 0) throw new Error("ln needs a number above 0"); return Math.log(x); }, log: x => { if (x <= 0) throw new Error("log needs a number above 0"); return Math.log10(x); },
    sqrt: x => { if (x < 0) throw new Error("No square root of a negative number"); return Math.sqrt(x); }, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp, fact
  };
  function expr() { let v = term(); while (t[p] && (t[p].o === "+" || t[p].o === "-")) { const o = t[p++].o, r = term(); v = o === "+" ? v + r : v - r; } return v; }
  function term() {
    let v = unary();
    for (;;) {
      const x = t[p]; if (!x) break;
      if (x.o === "*" || x.o === "/") { p++; const r = unary(); if (x.o === "/" && r === 0) throw new Error("Can't divide by zero"); v = x.o === "*" ? v * r : v / r; }
      else if (x.n !== undefined || x.w || x.o === "(") v *= unary(); // 2π, 3(4+1), 2sin(30)
      else break;
    }
    return v;
  }
  function unary() { if (isO("-")) { p++; return -unary(); } if (isO("+")) { p++; return unary(); } return power(); }
  function power() { const b = post(); if (isO("^")) { p++; return Math.pow(b, unary()); } return b; }
  function post() { let v = prim(); for (;;) { if (isO("!")) { p++; v = fact(v); } else if (isO("%")) { p++; v /= 100; } else break; } return v; }
  function close() { if (isO(")")) p++; else if (p < t.length) throw new Error("Missing )"); } // a ")" missing at the very end is added for you
  function prim() {
    const x = t[p++]; if (!x) throw new Error("Incomplete expression");
    if (x.n !== undefined) return x.n;
    if (x.o === "(") { const v = expr(); close(); return v; }
    if (x.w) {
      if (x.w === "pi") return Math.PI; if (x.w === "e") return Math.E;
      if (x.w === "ans") return ans || 0;
      const f = FN[x.w]; if (!f) throw new Error("Unknown word: " + x.w);
      let a; if (isO("(")) { p++; a = expr(); close(); } else a = unary();
      return f(a);
    }
    throw new Error("Unexpected " + x.o);
  }
  const v = expr();
  if (p < t.length) throw new Error("Unexpected " + (t[p].o || t[p].w || t[p].n));
  if (Number.isNaN(v)) throw new Error("Not a number");
  if (!Number.isFinite(v)) throw new Error("Too big");
  return v;
}
const show = v => String(parseFloat(v.toPrecision(12))); // 0.1 + 0.2 shows 0.3

// ---------- the window ----------
export default {
  open(root, os) {
    const css = `
.cl{display:flex;flex-direction:column;height:100%;background:var(--el);color:var(--fg);font-family:'Segoe UI',system-ui,sans-serif;font-size:13px}
.cl button{font-family:inherit;border:1px solid var(--bd);background:rgba(128,128,128,.12);color:var(--fg);cursor:pointer;border-radius:0}
.cl button:hover{border-color:var(--ac);background:rgba(128,128,128,.22)}
.cl-top{display:flex;gap:6px;padding:8px;align-items:center;border-bottom:1px solid var(--bd)}
.cl-top button{padding:4px 10px;font-size:12px}.cl-top button.on{background:var(--ac);border-color:var(--ac);color:#fff}.cl-top .sp{flex:1}
.cl-disp{padding:10px 12px 6px}
.cl-in{width:100%;box-sizing:border-box;border:0;outline:0;background:transparent;color:var(--fg);font:300 28px 'Segoe UI',system-ui,sans-serif;text-align:right;padding:4px 0}
.cl-res{height:22px;text-align:right;color:var(--dim);font-size:15px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cl-res.err{color:#e5534b}
.cl-body{flex:1;min-height:0;display:flex}
.cl-keys{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;padding:8px}
.cl-g{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;flex:1;min-height:0}
.cl-g.sci{flex:0 0 auto;grid-auto-rows:34px}
.cl-g button{font-size:16px;min-height:34px}.cl-g.sci button{font-size:13px}
.cl-g button.op{background:rgba(128,128,128,.22)}.cl-g button.eq{background:var(--ac);border-color:var(--ac);color:#fff;grid-column:1/-1}
.cl-hist{width:170px;flex-shrink:0;border-left:1px solid var(--bd);display:flex;flex-direction:column}
.cl-hist[hidden]{display:none}
.cl-hl{flex:1;overflow-y:auto;padding:6px}
.cl-hi{padding:6px;cursor:pointer;text-align:right;border-bottom:1px solid rgba(128,128,128,.2)}
.cl-hi:hover{background:rgba(128,128,128,.15)}.cl-hi small{display:block;color:var(--dim);font-size:11px;overflow:hidden;text-overflow:ellipsis}.cl-hi b{font-size:15px;font-weight:500}
.cl-hn{padding:12px;color:var(--dim);font-size:12px}
.cl-hist>button{margin:6px;padding:5px;font-size:12px}`;
    const STD = [["C", "clear", "op"], ["⌫", "back", "op"], ["%", "%", "op"], ["÷", "÷", "op"], ["7"], ["8"], ["9"], ["×", "×", "op"], ["4"], ["5"], ["6"], ["−", "−", "op"], ["1"], ["2"], ["3"], ["+", "+", "op"], ["(", "(", "op"], ["0"], [".", "."], [")", ")", "op"], ["=", "eq", "eq"]];
    const SCI = [["sin", "sin("], ["cos", "cos("], ["tan", "tan("], ["π", "π"], ["asin", "asin("], ["acos", "acos("], ["atan", "atan("], ["e", "e"], ["ln", "ln("], ["log", "log("], ["√", "√("], ["xʸ", "^"], ["x²", "^2"], ["n!", "!"], ["|x|", "abs("], ["Ans", "Ans"]];
    const btn = ([l, k, c]) => `<button data-k="${(k || l).replace(/"/g, "&quot;")}" class="${c || ""}">${l}</button>`;
    root.innerHTML = `<style>${css}</style><div class="cl">
<div class="cl-top"><button data-m="std">Standard</button><button data-m="sci">Scientific</button><span class="sp"></span><button data-a="deg" title="Angle unit for sin, cos, tan"></button><button data-a="hist">History</button></div>
<div class="cl-disp"><input class="cl-in" spellcheck="false" autocomplete="off" placeholder="0"><div class="cl-res"></div></div>
<div class="cl-body"><div class="cl-keys"><div class="cl-g sci">${SCI.map(btn).join("")}</div><div class="cl-g">${STD.map(btn).join("")}</div></div>
<div class="cl-hist" hidden><div class="cl-hl"></div><button data-a="clrh">Clear history</button></div></div></div>`;

    const $ = s => root.querySelector(s);
    const inp = $(".cl-in"), res = $(".cl-res"), sci = $(".cl-g.sci"), hist = $(".cl-hist"), hl = $(".cl-hl");
    let mode = os.storage.get("mode", "std"), deg = os.storage.get("deg", true), history = os.storage.get("hist", []), ans = os.storage.get("ans", 0), fresh = false;
    if (!Array.isArray(history)) history = [];

    const drawTop = () => {
      root.querySelectorAll("[data-m]").forEach(b => b.classList.toggle("on", b.dataset.m === mode));
      sci.style.display = mode === "sci" ? "" : "none";
      $("[data-a=deg]").textContent = deg ? "Deg" : "Rad";
      $("[data-a=deg]").style.display = mode === "sci" ? "" : "none";
    };
    const drawHist = () => {
      hl.innerHTML = "";
      if (!history.length) { const d = document.createElement("div"); d.className = "cl-hn"; d.textContent = "Your calculations show up here."; hl.appendChild(d); return; }
      history.forEach(h => {
        const d = document.createElement("div"); d.className = "cl-hi"; d.title = "Click to use this answer";
        const s = document.createElement("small"); s.textContent = h.e + " ="; const b = document.createElement("b"); b.textContent = h.r;
        d.append(s, b); d.onclick = () => put(h.r); hl.appendChild(d);
      });
    };
    const preview = () => { // live answer under the box (errors stay quiet while you are still typing)
      res.className = "cl-res"; res.textContent = "";
      const s = inp.value.trim(); if (!s) return;
      try { const v = show(evaluate(s, deg, ans)); if (v !== s.replace(/\s/g, "")) res.textContent = "= " + v; } catch {}
    };
    function put(text) { // type at the cursor; after an "=", a number starts fresh and an operator continues from the answer
      if (fresh && /^[\d.(a-zπ√]/i.test(text)) inp.value = "";
      fresh = false;
      const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? s;
      inp.setRangeText(text, s, e, "end"); inp.focus(); preview();
    }
    function equals() {
      const s = inp.value.trim(); if (!s) return;
      try {
        const v = evaluate(s, deg, ans), r = show(v);
        history.unshift({ e: s, r }); history = history.slice(0, 50); ans = v;
        os.storage.set("hist", history); os.storage.set("ans", ans);
        inp.value = r; fresh = true; res.className = "cl-res"; res.textContent = ""; drawHist();
      } catch (err) { res.className = "cl-res err"; res.textContent = err.message; }
    }
    root.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.m) { mode = b.dataset.m; os.storage.set("mode", mode); drawTop(); inp.focus(); return; }
      if (b.dataset.a === "deg") { deg = !deg; os.storage.set("deg", deg); drawTop(); preview(); inp.focus(); return; }
      if (b.dataset.a === "hist") { hist.hidden = !hist.hidden; inp.focus(); return; }
      if (b.dataset.a === "clrh") { history = []; os.storage.set("hist", history); drawHist(); return; }
      const k = b.dataset.k; if (k === undefined) return;
      if (k === "clear") { inp.value = ""; fresh = false; preview(); inp.focus(); }
      else if (k === "back") { if (fresh) { inp.value = ""; fresh = false; } else { const s = inp.selectionStart; if (inp.selectionEnd > s) inp.setRangeText("", s, inp.selectionEnd, "end"); else if (s > 0) inp.setRangeText("", s - 1, s, "end"); } preview(); inp.focus(); }
      else if (k === "eq") equals();
      else put(k);
    });
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === "=") { e.preventDefault(); equals(); }
      else if (e.key === "Escape") { inp.value = ""; fresh = false; preview(); }
      else if (fresh && e.key.length === 1 && /[\d.(a-zπ]/i.test(e.key) && !e.ctrlKey && !e.metaKey) { inp.value = ""; fresh = false; }
      else if (e.key.length === 1) fresh = false; // an operator after "=" keeps the answer
    });
    inp.addEventListener("input", preview);
    os.setTitle("Calculator");
    drawTop(); drawHist(); inp.focus();
  },
  __test: { evaluate, show }
};
