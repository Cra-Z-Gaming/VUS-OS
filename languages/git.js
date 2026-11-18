// VUS-OS language: Git, a small git for the Terminal that works in the browser through GitHub's web API.
// Installed from the Terminal with:  install git     Then:  git clone https://github.com/user/repo
// Nothing is downloaded: the browser already has everything, "install" just adds the git command.
// A language file is an ES module whose default export is { id, name, version, runtime, install(h), uninstall(), run(o) }.
// This one has native: true, so the Terminal does not look for a file name: it hands over the typed words (o.args), the
// current folder (o.cwd) and the OS functions (o.sys) and git does its own reading and writing.
//
// How it works (browsers can't speak the real git protocol, so this is a "mini git"):
//  - A repository is a folder that holds a ".git" folder. Inside it: state.json (branches, commits, staged files) and
//    objects/ (the content of files you staged, kept until pushed).
//  - clone: asks GitHub for the file list (1 request) and downloads the files from raw.githubusercontent.com.
//  - commits are saved locally. push sends them to GitHub with its web API (blobs, trees, commits, refs). pull / fetch read it back.
//  - Not supported: merges (use pull --rebase), stash, tags, submodules, other hosts than github.com.
//  - Private repos and push need a personal access token: git config --global token <token>  (or git asks and keeps it until the Terminal closes).

const API = "https://api.github.com", RAW = "https://raw.githubusercontent.com";
const MAX_FILE = 50 * 1048576, MAX_FILES = 4000, EMPTY_BLOB = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = u8 => Array.from(u8, x => x.toString(16).padStart(2, "0")).join("");
const short = s => String(s || "").slice(0, 7);
const tick = () => new Promise(r => setTimeout(r, 0));
class GitError extends Error {}
let sessionToken = "", memStore = {}; // the token typed during this session; used only when the Terminal gives no storage

// ---------- SHA-1 (git names every file by the SHA-1 of its content) ----------
function sha1Fallback(u8) { // used only where crypto.subtle is missing (pages that aren't https)
  const len = u8.length, total = (((len + 8) >>> 6) + 1) << 6, buf = new Uint8Array(total); buf.set(u8); buf[len] = 0x80;
  const dv = new DataView(buf.buffer); dv.setUint32(total - 4, (len * 8) >>> 0); dv.setUint32(total - 8, Math.floor(len / 0x20000000));
  let h0 = 0x67452301, h1 = 0xEFCDAB89 | 0, h2 = 0x98BADCFE | 0, h3 = 0x10325476, h4 = 0xC3D2E1F0 | 0; const w = new Int32Array(80), rol = (x, n) => (x << n) | (x >>> (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(o + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f, k;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; } else if (i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; } else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC | 0; } else { f = b ^ c ^ d; k = 0xCA62C1D6 | 0; }
      const t = (rol(a, 5) + f + e + k + w[i]) | 0; e = d; d = c; c = rol(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  const out = new Uint8Array(20), ov = new DataView(out.buffer); [h0, h1, h2, h3, h4].forEach((h, i) => ov.setInt32(i * 4, h)); return out;
}
async function sha1hex(u8) { try { if (globalThis.crypto && crypto.subtle) return hex(new Uint8Array(await crypto.subtle.digest("SHA-1", u8))); } catch { /* use the fallback */ } return hex(sha1Fallback(u8)); }
async function blobSha(bytes) { const h = enc.encode("blob " + bytes.length + "\0"), all = new Uint8Array(h.length + bytes.length); all.set(h); all.set(bytes, h.length); return sha1hex(all); }
const toB64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const isBinary = u8 => u8.subarray(0, 8000).includes(0);

async function pool(items, n, fn, check) { // runs fn on every item, n at a time; the first error stops it
  let i = 0, err = null; const out = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length && !err) { const k = i++; try { if (check) check(); out[k] = await fn(items[k], k); } catch (e) { err = err || e; } }
  }));
  if (err) throw err; return out;
}

// ---------- small text helpers ----------
function parseUrl(s) { // https://github.com/o/r(.git), git@github.com:o/r.git or o/r
  s = String(s || "").trim(); let m;
  if ((m = s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com[\/:]([^\/\s]+)\/([^\/\s#?]+?)(?:\.git)?(?:[\/#?].*)?$/i)) || (m = s.match(/^git@github\.com:([^\/\s]+)\/([^\/\s]+?)(?:\.git)?$/i)) || (m = s.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/))) return { owner: m[1], repo: m[2] };
  return null;
}
const encPath = p => p.split("/").map(encodeURIComponent).join("/");
function ignoreFn(text) { // .gitignore: *, ?, **, a trailing / for folders, a leading / to anchor, ! to bring a path back
  const rules = [];
  for (let line of String(text || "").split(/\r?\n/)) {
    line = line.replace(/\s+$/, ""); if (!line || line[0] === "#") continue;
    let neg = false, dirOnly = false; if (line[0] === "!") { neg = true; line = line.slice(1); }
    if (line.endsWith("/")) { dirOnly = true; line = line.slice(0, -1); }
    const anchored = line.includes("/"); if (line[0] === "/") line = line.slice(1); if (!line) continue;
    let re = "";
    for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === "*") { if (line[i + 1] === "*") { re += ".*"; i++; if (line[i + 1] === "/") i++; } else re += "[^/]*"; } else if (c === "?") re += "[^/]"; else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&"); }
    try { rules.push({ neg, re: new RegExp((anchored ? "^" : "^(?:.*/)?") + re + (dirOnly ? "/.*$" : "(?:/.*)?$")) }); } catch { /* a pattern the browser can't read is skipped */ }
  }
  return p => { let ig = false; for (const r of rules) if (r.re.test(p)) ig = !r.neg; return ig; };
}
function specMatcher(spec) { // a path or folder, or a pattern like *.js
  if (spec === "") return () => true;
  if (/[*?]/.test(spec)) { const re = new RegExp("^" + spec.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "(?:/.*)?$"); return p => re.test(p); }
  return p => p === spec || p.startsWith(spec + "/");
}

// ---------- diff (Myers) ----------
function myersOps(A, B) { // "=" "-" "+" for two arrays of lines, or null when they differ too much
  const N = A.length, M = B.length; if (!N && !M) return []; if (!N) return B.map(() => "+"); if (!M) return A.map(() => "-");
  const MAX = N + M, LIM = Math.min(MAX, 2500), off = MAX + 1, V = new Int32Array(2 * MAX + 3), trace = []; let D = -1;
  outer: for (let d = 0; d <= LIM; d++) {
    trace.push(V.slice(off - d - 1, off + d + 2)); // the state before this round, kept for walking back
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1, y = x - k;
      while (x < N && y < M && A[x] === B[y]) { x++; y++; }
      V[off + k] = x; if (x >= N && y >= M) { D = d; break outer; }
    }
  }
  if (D < 0) return null;
  let x = N, y = M; const ops = [];
  for (let d = D; d > 0; d--) {
    const S = trace[d], get = kk => S[kk + d + 1], k = x - y, down = (k === -d || (k !== d && get(k - 1) < get(k + 1))), pk = down ? k + 1 : k - 1, px = get(pk), py = px - pk, ex = down ? px : px + 1;
    while (x > ex) { ops.push("="); x--; y--; }
    ops.push(down ? "+" : "-"); x = px; y = py;
  }
  while (x > 0 && y > 0) { ops.push("="); x--; y--; }
  return ops.reverse();
}
const splitLines = t => t.match(/[^\n]*\n|[^\n]+$/g) || []; // every line keeps its \n, so a missing final newline counts as a difference
function unifiedDiff(path, aBytes, bBytes, opt = {}) { // aBytes / bBytes: Uint8Array, or null when the file doesn't exist on that side
  const head = [`diff --git a/${path} b/${path}`];
  if (!aBytes) head.push("new file mode 100644"); else if (!bBytes) head.push("deleted file mode 100644");
  if ((aBytes && isBinary(aBytes)) || (bBytes && isBinary(bBytes))) return head.concat(`Binary files ${aBytes ? "a/" + path : "/dev/null"} and ${bBytes ? "b/" + path : "/dev/null"} differ`).join("\n");
  const a = splitLines(aBytes ? dec.decode(aBytes) : ""), b = splitLines(bBytes ? dec.decode(bBytes) : "");
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0; while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const mid = myersOps(a.slice(s, a.length - e), b.slice(s, b.length - e));
  const ops = [...Array(s).fill("="), ...(mid || [...Array(a.length - s - e).fill("-"), ...Array(b.length - s - e).fill("+")]), ...Array(e).fill("=")];
  if (!ops.some(t => t !== "=")) return "";
  const items = []; let ai = 0, bi = 0; for (const t of ops) { items.push({ t, ai, bi }); if (t !== "+") ai++; if (t !== "-") bi++; }
  const C = 3, hunks = []; let cur = null;
  items.forEach((it, i) => { if (it.t === "=") return; const lo = Math.max(0, i - C), hi = Math.min(items.length - 1, i + C); if (cur && lo <= cur.hi + 1) cur.hi = hi; else { cur = { lo, hi }; hunks.push(cur); } });
  const out = [...head, "--- " + (aBytes ? "a/" + path : "/dev/null"), "+++ " + (bBytes ? "b/" + path : "/dev/null")];
  for (const h of hunks) {
    const part = items.slice(h.lo, h.hi + 1), ac = part.filter(x => x.t !== "+").length, bc = part.filter(x => x.t !== "-").length;
    out.push(`@@ -${ac ? part[0].ai + 1 : part[0].ai},${ac} +${bc ? part[0].bi + 1 : part[0].bi},${bc} @@`);
    for (const it of part) { const line = it.t === "+" ? b[it.bi] : a[it.ai]; out.push((it.t === "=" ? " " : it.t) + line.replace(/\n$/, "")); if (!line.endsWith("\n")) out.push("\\ No newline at end of file"); }
  }
  return out.join("\n");
}

// ---------- the OS side: folders and files ----------
function fsLayer(sys) {
  const L = {
    index() { const kids = new Map(), files = new Map(), add = (m, k, v) => { const l = m.get(k); if (l) l.push(v); else m.set(k, [v]); }; for (const f of sys.folders()) add(kids, f.parent || null, f); for (const f of sys.files()) add(files, f.parent || null, f); return { kids, files }; },
    folder: id => sys.folders().find(f => f.id === id) || null,
    child(parent, name) { const n = name.toLowerCase(); return sys.folders().find(f => (f.parent || null) === (parent || null) && f.name.toLowerCase() === n) || null; },
    childFiles(parent) { return sys.files().filter(f => (f.parent || null) === (parent || null)); },
    walk(root) { // every file under root as "a/b.txt" -> meta; the repo's own .git folder is left out
      const ix = L.index(), out = new Map();
      const rec = (id, pre, top) => { for (const f of ix.files.get(id) || []) out.set(pre + f.name, f); for (const d of ix.kids.get(id) || []) { if (top && d.name.toLowerCase() === ".git") continue; rec(d.id, pre + d.name + "/", false); } };
      rec(root, "", true); return out;
    },
    async bytes(id) { const b = await sys.blob(id); return b ? new Uint8Array(await b.arrayBuffer()) : null; },
    async put(list, parent) { const e = await sys.putFiles(list, parent || null); if (e) throw new GitError(e); },
    rm: (ids, hard) => sys.removeFiles(ids, hard)
  };
  return L;
}

// ---------- GitHub's web API ----------
function makeApi(R) {
  return async function gh(method, path, body, opt = {}) {
    const h = { Accept: opt.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json" }, tok = R.token(); if (tok) h.Authorization = "Bearer " + tok; if (body) h["Content-Type"] = "application/json";
    let r;
    try { r = await fetch(API + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined, signal: R.signal }); }
    catch (e) { if (R.cancelled()) throw new GitError("Stopped."); throw new GitError("Couldn't reach GitHub (offline, or the browser blocked the request)."); }
    if (r.ok) { if (opt.raw) return new Uint8Array(await r.arrayBuffer()); return r.status === 204 ? null : r.json(); }
    let msg = ""; try { msg = (await r.json()).message || ""; } catch { /* no body */ }
    let text;
    if (r.status === 401) text = "GitHub says the token is wrong or has expired. Set a new one: git config --global token <token>";
    else if (r.status === 403 && r.headers.get("x-ratelimit-remaining") === "0") { const t = +r.headers.get("x-ratelimit-reset"); text = "GitHub's request limit is used up" + (t ? " (it resets at " + new Date(t * 1000).toLocaleTimeString() + ")" : "") + ". A token raises the limit a lot: git config --global token <token>"; }
    else if (r.status === 403) text = "GitHub refused (403): " + (msg || "the token may not have permission. It needs the repo scope, or Contents: Read and write for this repository.");
    else if (r.status === 404) text = "GitHub can't find that (404)" + (tok ? ". Check the name, and that the token can see this repository." : ". If the repository is private, set a token first: git config --global token <token>");
    else text = "GitHub says (" + r.status + "): " + (msg || r.statusText);
    const e = new GitError(text); e.status = r.status; e.api = msg; throw e;
  };
}

// ---------- repository state ----------
// state = { v, remote: {name, owner, repo, private}|null, branch, branches: {name: sha}, commits: {sha: commit}, remotes: {"origin/main": sha}, index: {path: blobsha|null}, cache: {path: [size, mod, sha]}, modes: {path: mode} }
// commit = { sha, parents, message, author: {name, email}, time, remote: true|undefined, tree: full {path: blobsha} (some remote ones), d: changes since parents[0] {path: blobsha|null} (the others), treeSha }
const newState = () => ({ v: 1, remote: null, branch: "main", branches: {}, commits: {}, remotes: {}, index: {}, cache: {}, modes: {} });
const headSha = R => R.st.branches[R.st.branch] || null;
function chain(R, head) { // the commits made here and not pushed yet (newest first), and the remote commit they sit on
  const local = []; let sha = head;
  while (sha) { const c = R.st.commits[sha]; if (!c || c.remote) break; local.push(c); sha = c.parents[0]; }
  return { local, base: sha || null };
}
const applyDelta = (t, d) => { const r = { ...t }; for (const p in d) { if (d[p] === null) delete r[p]; else r[p] = d[p]; } return r; };
const changedPaths = (a, b) => { const out = []; for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[p] !== b[p]) out.push(p); return out.sort(); };
const remoteUrl = R => `https://github.com/${R.st.remote.owner}/${R.st.remote.repo}`;
function needRemote(R) { if (!R.st.remote) throw new GitError("No remote is set. Add one with: git remote add origin https://github.com/user/repo"); return R.st.remote; }
const apiBase = R => { const m = (R.st && R.st.remote) || R.rem; return `/repos/${m.owner}/${m.repo}`; }; // during clone there is no state yet, only R.rem

async function commitMeta(R, sha) { // makes sure we know a remote commit (message, parents, tree id)
  const c = R.st.commits[sha]; if (c && c.treeSha) return c;
  const j = await R.gh("GET", apiBase(R) + "/git/commits/" + sha);
  const nc = { ...(c || {}), sha, parents: j.parents.map(p => p.sha), message: j.message, author: { name: j.author && j.author.name, email: j.author && j.author.email }, time: Date.parse(j.author && j.author.date) || 0, treeSha: j.tree.sha, remote: true };
  R.st.commits[sha] = nc; R.dirty = true; return nc;
}
async function treeOf(R, sha) { // every file of a commit as {path: blobsha}
  if (!sha) return {};
  const c = R.st.commits[sha];
  if (c && c.tree) return c.tree;
  if (c && c.d) return applyDelta(await treeOf(R, c.parents[0]), c.d);
  const m = await commitMeta(R, sha);
  const tr = await R.gh("GET", apiBase(R) + "/git/trees/" + m.treeSha + "?recursive=1");
  if (tr.truncated) R.err("Warning: GitHub could only list part of this very large repository.");
  const t = {}; for (const e of tr.tree) if (e.type === "blob") { t[e.path] = e.sha; if (e.mode !== "100644") R.st.modes[e.path] = e.mode; }
  m.tree = t; R.dirty = true; return t;
}
async function saveState(R) { // state.json and any new staged objects go into the repo's .git folder
  const list = [{ path: ".git/state.json", blob: new Blob([JSON.stringify(R.st)]) }, ...R.pending.map(x => ({ path: ".git/objects/" + x.sha, blob: x.blob }))];
  R.pending = []; R.pendMap.clear(); R.dirty = false;
  await R.fs.put(list, R.root);
  const g = R.fs.child(R.root, ".git"), o = g && R.fs.child(g.id, "objects"); R.objIds = new Map(o ? R.fs.childFiles(o.id).map(f => [f.name, f.id]) : []);
}
function baseCtx(env, o, cwd) {
  const R = { o, sys: o.sys, fs: fsLayer(o.sys), cwd: cwd || null, root: null, st: null, rem: null, pending: [], pendMap: new Map(), objIds: new Map(), dirty: false, wmap: new Map(), cwdRel: "",
    out: t => o.print(String(t)), err: t => o.printErr(String(t)), status: t => o.status && o.status(t), input: p => o.input(p), signal: env.signal, cancelled: env.cancelled,
    check() { if (env.cancelled()) throw new GitError("Stopped."); },
    token() { return sessionToken || store(o, "gitToken"); } };
  R.gh = makeApi(R); return R;
}
const store = (o, k, v) => { const s = o.storage || { get: (a, d) => (a in memStore ? memStore[a] : d), set: (a, b) => { memStore[a] = b; } }; if (v === undefined) return s.get(k, "") || ""; s.set(k, v); };
async function openRepo(env, o) { // finds the repo that holds the current folder (this folder or any folder above it)
  const R = baseCtx(env, o, o.cwd); const trail = [];
  for (let d = o.cwd; d;) { const g = R.fs.child(d, ".git"); if (g) { R.root = d; R.gitId = g.id; break; } const f = R.fs.folder(d); if (!f) break; trail.unshift(f.name); d = f.parent || null; }
  if (!R.root) return null;
  const sf = R.fs.childFiles(R.gitId).find(f => f.name === "state.json"), o2 = R.fs.child(R.gitId, "objects");
  if (!sf) throw new GitError("This folder has a .git folder, but no state.json in it. It wasn't made by this git, so it can't be used here.");
  try { R.st = JSON.parse(dec.decode(await R.fs.bytes(sf.id))); } catch { throw new GitError(".git/state.json is damaged and can't be read."); }
  if (!R.st || R.st.v !== 1) throw new GitError(".git/state.json is from another version of git.");
  R.st.modes = R.st.modes || {}; R.st.cache = R.st.cache || {};
  R.objIds = new Map(o2 ? R.fs.childFiles(o2.id).map(f => [f.name, f.id]) : []);
  R.cwdRel = trail.join("/"); return R;
}
function relPath(R, s) { // a path typed in the current folder -> path from the repo's top folder (null when it points outside)
  const parts = s.startsWith("/") || s.startsWith("\\") ? [] : R.cwdRel.split("/").filter(Boolean);
  for (const seg of s.split(/[\\/]/)) { if (!seg || seg === ".") continue; if (seg === "..") { if (!parts.length) return null; parts.pop(); } else parts.push(seg); }
  return parts.join("/");
}
function matcherFor(R, specs) { const ms = specs.map(s => { const r = relPath(R, s); if (r === null) throw new GitError(`'${s}' is outside the repository.`); return specMatcher(r); }); return p => ms.some(m => m(p)); }

// ---------- reading file content: staged copies, files already here, or GitHub ----------
async function fetchBlob(R, b) { // b = { sha, path, commit }: raw.githubusercontent.com first (no request limit), GitHub's blob API when that fails
  const rem = R.st && R.st.remote || R.rem; let bytes = null;
  if (!rem.private && b.commit && b.path) {
    try { const r = await fetch(`${RAW}/${rem.owner}/${rem.repo}/${b.commit}/${encPath(b.path)}`, { signal: R.signal }); if (r.ok) bytes = new Uint8Array(await r.arrayBuffer()); } catch (e) { if (R.cancelled()) throw new GitError("Stopped."); }
    if (bytes && (await blobSha(bytes)) !== b.sha) bytes = null; // not the file we asked for (for example a Git LFS pointer)
  }
  return bytes || R.gh("GET", `${apiBase(R)}/git/blobs/${b.sha}`, null, { raw: true });
}
async function blobBytes(R, sha, path, commit) {
  if (R.pendMap.has(sha)) return new Uint8Array(await R.pendMap.get(sha).arrayBuffer());
  const id = R.objIds.get(sha); if (id) { const b = await R.fs.bytes(id); if (b) return b; }
  const w = R.wmap.get(sha); if (w) { const b = await R.fs.bytes(w.id); if (b) return b; }
  if (sha === EMPTY_BLOB) return new Uint8Array(0);
  if (!R.st.remote && !R.rem) throw new GitError(`The content of ${path || sha} isn't saved here.`);
  return fetchBlob(R, { sha, path, commit });
}
async function stageBlob(R, sha, meta) { // keep a copy of a staged file, so changing it later doesn't change what is committed
  if (R.objIds.has(sha) || R.pendMap.has(sha)) return;
  const b = new Blob([await R.fs.bytes(meta.id)]); R.pending.push({ sha, blob: b }); R.pendMap.set(sha, b);
}

// ---------- working tree ----------
async function workState(R, only) { // every file in the repo with its git hash; the hash is remembered while size and time stay the same
  const W = R.fs.walk(R.root), cache = R.st.cache, want = only ? new Set(only) : null; let n = 0; R.wmap = new Map();
  for (const [p, m] of W) {
    if (want && !want.has(p)) continue;
    const c = cache[p];
    if (c && m.mod != null && c[0] === m.size && c[1] === m.mod) m.sha = c[2];
    else if ((m.size || 0) > MAX_FILE) m.sha = null;
    else {
      const b = await R.fs.bytes(m.id); m.sha = b ? await blobSha(b) : null;
      if (m.sha && m.mod != null) { cache[p] = [m.size, m.mod, m.sha]; R.dirty = true; }
      if (++n % 25 === 0) { R.check(); R.status("Looking at files... " + n); await tick(); }
    }
    if (m.sha) R.wmap.set(m.sha, m);
  }
  if (!only) for (const p of Object.keys(cache)) if (!W.has(p)) { delete cache[p]; R.dirty = true; }
  return W;
}
async function ignoreOf(R, W) { const g = W.get(".gitignore"); return ignoreFn(g ? dec.decode(await R.fs.bytes(g.id)) : ""); }
async function statusInfo(R) {
  const T = await treeOf(R, headSha(R)), I = R.st.index, X = applyDelta(T, I), W = await workState(R), staged = [], unstaged = [], untr = [];
  for (const p of Object.keys(I).sort()) staged.push([p, I[p] === null ? "deleted" : T[p] === undefined ? "new file" : "modified"]);
  for (const p of Object.keys(X).sort()) { const w = W.get(p); if (!w) unstaged.push([p, "deleted"]); else if (w.sha !== X[p]) unstaged.push([p, "modified"]); }
  const ig = await ignoreOf(R, W);
  for (const p of [...W.keys()].sort()) if (!(p in X) && !ig(p)) untr.push(p);
  return { T, I, X, W, staged, unstaged, untr, ig };
}
function collapseUntracked(list, X) { // a folder with nothing tracked in it is shown as one line, like git does
  const dirs = new Set(); for (const p of Object.keys(X)) { const s = p.split("/"); for (let i = 1; i < s.length; i++) dirs.add(s.slice(0, i).join("/")); }
  const out = new Set();
  for (const p of list) { const s = p.split("/"); let shown = p; for (let i = 1; i < s.length; i++) { const d = s.slice(0, i).join("/"); if (!dirs.has(d)) { shown = d + "/"; break; } } out.add(shown); }
  return [...out];
}
function pushIndex(R, p, sha, T) { if (sha === null) { if (T[p] !== undefined) R.st.index[p] = null; else delete R.st.index[p]; } else if (T[p] === sha) delete R.st.index[p]; else R.st.index[p] = sha; R.dirty = true; }

// writes a new set of files into the working folder: refuses when the change would overwrite something you edited
async function applyTree(R, curT, newT, commit) {
  const paths = changedPaths(curT, newT); if (!paths.length) return [];
  const W = await workState(R, paths), bad = [];
  for (const p of paths) {
    const w = W.get(p), c = curT[p], n = newT[p];
    if (p in R.st.index) { bad.push(p); continue; }
    if (c !== undefined) { if (!w) { if (n !== undefined) bad.push(p); } else if (w.sha !== c && w.sha !== n) bad.push(p); }
    else if (w && n !== undefined && w.sha !== n) bad.push(p);
  }
  if (bad.length) throw new GitError("Your local changes to these files would be overwritten:\n" + bad.slice(0, 20).map(p => "\t" + p).join("\n") + (bad.length > 20 ? `\n\t...and ${bad.length - 20} more` : "") + "\nCommit them, or throw them away with: git restore <file>");
  await writeFiles(R, paths.filter(p => newT[p] !== undefined && !(W.get(p) && W.get(p).sha === newT[p])), newT, commit);
  const gone = paths.filter(p => newT[p] === undefined && W.get(p)).map(p => W.get(p).id); if (gone.length) await R.fs.rm(gone, false);
  for (const p of paths) if (newT[p] === undefined) delete R.st.cache[p];
  R.dirty = true; return paths;
}
async function writeFiles(R, paths, tree, commit) { // downloads (or finds) each file and saves it in the folder, a few at a time
  let i = 0, done = 0;
  while (i < paths.length) {
    const chunk = []; let bytes = 0; while (i < paths.length && chunk.length < 40 && bytes < 20e6) { chunk.push(paths[i]); i++; bytes += 1e5; }
    const data = await pool(chunk, 6, p => blobBytes(R, tree[p], p, commit), R.check);
    await R.fs.put(chunk.map((p, k) => ({ path: p, blob: new Blob([data[k]]) })), R.root);
    done += chunk.length; R.status(`Writing files... ${done}/${paths.length}`);
    const W = R.fs.walk(R.root); chunk.forEach(p => { const m = W.get(p); if (m && m.mod != null) R.st.cache[p] = [m.size, m.mod, tree[p]]; });
  }
}

// ---------- commands ----------
async function cmdClone(env, o, args) {
  let branch = null; const pos = [];
  for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === "-b" || a === "--branch") branch = args[++i]; else if (a === "--depth") i++; else if (!a.startsWith("-")) pos.push(a); }
  const u = parseUrl(pos[0]); if (!u) throw new GitError("Usage: git clone <https://github.com/user/repo> [folder]   [-b branch]");
  const name = (pos[1] || u.repo).replace(/[\\\/:*?"<>|]/g, "").trim(); if (!name) throw new GitError("That folder name isn't allowed.");
  const R = baseCtx(env, o, o.cwd); R.rem = { name: "origin", owner: u.owner, repo: u.repo, private: false };
  if (R.fs.child(o.cwd, name)) throw new GitError(`A folder named '${name}' already exists here.`);
  R.out(`Cloning ${u.owner}/${u.repo}...`);
  const info = await R.gh("GET", apiBase(R)); R.rem.private = !!info.private; branch = branch || info.default_branch || "main";
  let b = null; try { b = await R.gh("GET", `${apiBase(R)}/branches/${encodeURIComponent(branch)}`); } catch (e) { if (e.status !== 404) throw e; }
  let entries = [], skipped = 0, tr = null;
  if (b) {
    tr = await R.gh("GET", `${apiBase(R)}/git/trees/${b.commit.commit.tree.sha}?recursive=1`);
    entries = tr.tree.filter(e => e.type === "blob"); skipped = tr.tree.filter(e => e.type === "commit").length;
    if (entries.length > MAX_FILES) throw new GitError(`This repository has ${entries.length} files. The limit here is ${MAX_FILES}, because the browser has to store them all.`);
  } else { const list = await R.gh("GET", `${apiBase(R)}/branches?per_page=1`); if (list.length) throw new GitError(`The branch '${branch}' doesn't exist on GitHub.`); }
  const before = new Set(R.sys.folders().map(f => f.id)); R.sys.mkdir(name, o.cwd || null);
  const made = R.sys.folders().find(f => !before.has(f.id)); if (!made) throw new GitError("Couldn't make the folder.");
  R.root = made.id; R.st = newState(); R.st.branch = branch; R.st.remote = { ...R.rem };
  if (b) {
    const tree = {}; for (const e of entries) { tree[e.path] = e.sha; if (e.mode !== "100644") R.st.modes[e.path] = e.mode; }
    await writeFiles(R, entries.map(e => e.path), tree, b.commit.sha);
    const ca = b.commit.commit.author || {};
    R.st.commits[b.commit.sha] = { sha: b.commit.sha, parents: b.commit.parents.map(p => p.sha), message: b.commit.commit.message, author: { name: ca.name, email: ca.email }, time: Date.parse(ca.date) || 0, tree, treeSha: b.commit.commit.tree.sha, remote: true };
    R.st.branches[branch] = b.commit.sha; R.st.remotes["origin/" + branch] = b.commit.sha;
  } else R.out("You appear to have cloned an empty repository.");
  await saveState(R);
  R.out(`Done: ${entries.length} file${entries.length === 1 ? "" : "s"} in '${name}'.` + (skipped ? ` (${skipped} submodule${skipped === 1 ? "" : "s"} skipped.)` : "") + `\nGo there with: cd ${name}`);
}
async function cmdInit(env, o) {
  if (!o.cwd) throw new GitError("Open a folder first (mkdir myproject, cd myproject), then run git init there. The Desktop itself can't be a repository.");
  const R = baseCtx(env, o, o.cwd);
  if (R.fs.child(o.cwd, ".git")) return R.out("Reinitialized existing Git repository.");
  R.root = o.cwd; R.st = newState(); await saveState(R); R.out("Initialized an empty Git repository. Add a GitHub repository with: git remote add origin https://github.com/user/repo");
}
async function cmdStatus(R) {
  const s = await statusInfo(R), st = R.st, lines = [`On branch ${st.branch}`], head = headSha(R);
  if (!head) lines.push("", "No commits yet");
  const rem = st.remote, up = rem && st.remotes[rem.name + "/" + st.branch];
  if (up && head) { const n = chain(R, head).local.length; lines.push(n ? `Your branch is ahead of '${rem.name}/${st.branch}' by ${n} commit${n === 1 ? "" : "s"}.\n  (use "git push" to publish your local commits)` : `Your branch is up to date with '${rem.name}/${st.branch}'.`); }
  if (s.staged.length) lines.push("", "Changes to be committed:", ...s.staged.map(([p, k]) => `\t${(k + ":").padEnd(12)}${p}`));
  if (s.unstaged.length) lines.push("", "Changes not staged for commit:", '  (use "git add <file>" to stage, "git restore <file>" to throw the change away)', ...s.unstaged.map(([p, k]) => `\t${(k + ":").padEnd(12)}${p}`));
  if (s.untr.length) lines.push("", "Untracked files:", '  (use "git add <file>" to start tracking)', ...collapseUntracked(s.untr, s.X).map(p => "\t" + p));
  if (!s.staged.length && !s.unstaged.length && !s.untr.length) lines.push(head ? "nothing to commit, working tree clean" : "nothing to commit (create or copy files and use git add)");
  else if (!s.staged.length) lines.push("", 'no changes added to commit (use "git add" and/or "git commit -a")');
  R.out(lines.join("\n"));
}
async function cmdAdd(R, args) {
  const all = args.includes("-A") || args.includes("--all"), upd = args.includes("-u") || args.includes("--update"), specs = args.filter(a => !a.startsWith("-"));
  if (!all && !upd && !specs.length) throw new GitError("Nothing specified, nothing added. Try: git add .   or   git add <file>");
  const s = await statusInfo(R), match = all || (upd && !specs.length) ? () => true : matcherFor(R, specs.length ? specs : ["."]); let n = 0, skippedIgnored = 0, big = 0;
  for (const [p, m] of s.W) {
    if (!match(p)) continue;
    if (upd && !(p in s.X)) continue;
    if (!(p in s.X) && s.ig(p)) { skippedIgnored++; continue; }
    if (m.sha === null || m.sha === undefined) { big++; continue; }
    if (s.X[p] === m.sha) continue;
    await stageBlob(R, m.sha, m); pushIndex(R, p, m.sha, s.T); n++;
  }
  for (const p of Object.keys(s.X)) if (!s.W.has(p) && match(p)) { pushIndex(R, p, null, s.T); n++; }
  if (big) R.err(`${big} file${big === 1 ? " is" : "s are"} over 50 MB and can't be added here.`);
  if (skippedIgnored && specs.length) R.err(`${skippedIgnored} file${skippedIgnored === 1 ? " was" : "s were"} left out because of .gitignore.`);
  R.dirty = true; if (!n && specs.length && !skippedIgnored && !big) R.err("Nothing to add (no matching changes).");
}
async function cmdRm(R, args) {
  const cached = args.includes("--cached"), specs = args.filter(a => !a.startsWith("-")); if (!specs.length) throw new GitError("Usage: git rm [--cached] <file>");
  const s = await statusInfo(R), match = matcherFor(R, specs), ids = []; let n = 0;
  for (const p of Object.keys(s.X)) if (match(p)) { pushIndex(R, p, null, s.T); n++; if (!cached && s.W.get(p)) ids.push(s.W.get(p).id); }
  if (!n) throw new GitError("No tracked file matches that.");
  if (ids.length) await R.fs.rm(ids, false); R.out(`rm ${n} file${n === 1 ? "" : "s"}`);
}
async function cmdRestore(R, args, mode) { // restore <file> = file from the staged copy; --staged = unstage; reset --hard = everything back to the last commit
  const staged = args.includes("--staged") || args.includes("-S"), specs = args.filter(a => !a.startsWith("-"));
  if (!specs.length) throw new GitError("Say which file: git restore <file>   (or git restore --staged <file>)");
  const T = await treeOf(R, headSha(R)), match = matcherFor(R, specs);
  if (staged) { let n = 0; for (const p of Object.keys(R.st.index)) if (match(p)) { delete R.st.index[p]; n++; } R.dirty = true; if (!n) R.err("Nothing was staged for that."); return; }
  const X = applyDelta(T, R.st.index), W = await workState(R), fix = Object.keys(X).filter(p => match(p) && (!W.get(p) || W.get(p).sha !== X[p]));
  if (!fix.length) { R.err("Nothing to restore."); return; }
  await writeFiles(R, fix, X, chain(R, headSha(R)).base); R.dirty = true; R.out(`Restored ${fix.length} file${fix.length === 1 ? "" : "s"}.`);
}
async function cmdReset(R, args) {
  if (args.includes("--hard")) {
    const T = await treeOf(R, headSha(R)); R.st.index = {}; const W = await workState(R), fix = Object.keys(T).filter(p => !W.get(p) || W.get(p).sha !== T[p]);
    await writeFiles(R, fix, T, chain(R, headSha(R)).base); R.dirty = true; return R.out(`HEAD is at ${short(headSha(R))}. ${fix.length} file${fix.length === 1 ? "" : "s"} restored. (Files git doesn't track were left alone.)`);
  }
  const specs = args.filter(a => !a.startsWith("-")); const match = specs.length ? matcherFor(R, specs) : () => true;
  for (const p of Object.keys(R.st.index)) if (match(p)) delete R.st.index[p]; R.dirty = true; R.out("Unstaged changes kept in your files.");
}
async function cmdCommit(R, args, o) {
  let msg = [], auto = false;
  for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === "-m" || a === "--message") msg.push(args[++i] || ""); else if (a === "-a" || a === "--all") auto = true; else if (a === "-am" || a === "-ma") { auto = true; msg.push(args[++i] || ""); } else if (a === "--amend") throw new GitError("--amend isn't supported here."); }
  const message = msg.join("\n\n").trim(); if (!message) throw new GitError('Add a message: git commit -m "what you changed"');
  if (auto) { const s = await statusInfo(R); for (const [p, k] of s.unstaged) { if (k === "deleted") pushIndex(R, p, null, s.T); else { const m = s.W.get(p); if (m.sha) { await stageBlob(R, m.sha, m); pushIndex(R, p, m.sha, s.T); } } } }
  const d = { ...R.st.index }; if (!Object.keys(d).length) throw new GitError("Nothing to commit. Use git add <file> first (or git commit -a for files git already tracks).");
  const head = headSha(R), name = store(o, "gitUserName") || "VUS-OS User", email = store(o, "gitUserEmail") || "vus-os@users.noreply.github.com";
  const sha = await sha1hex(enc.encode("commit\0" + Date.now() + Math.random() + message + JSON.stringify(d)));
  R.st.commits[sha] = { sha, parents: head ? [head] : [], message, author: { name, email }, time: Date.now(), d };
  R.st.branches[R.st.branch] = sha; R.st.index = {}; R.dirty = true;
  const n = Object.keys(d).length; R.out(`[${R.st.branch}${head ? "" : " (root-commit)"} ${short(sha)}] ${message.split("\n")[0]}\n ${n} file${n === 1 ? "" : "s"} changed`);
}
async function cmdDiff(R, args) {
  const staged = args.includes("--staged") || args.includes("--cached"), specs = args.filter(a => !a.startsWith("-")), match = specs.length ? matcherFor(R, specs) : () => true;
  const T = await treeOf(R, headSha(R)), X = applyDelta(T, R.st.index), base = chain(R, headSha(R)).base, outLines = [];
  const get = async (sha, p) => sha === undefined || sha === null ? null : blobBytes(R, sha, p, base);
  if (staged) { for (const p of Object.keys(R.st.index).sort()) if (match(p)) { const t = unifiedDiff(p, await get(T[p], p), await get(R.st.index[p], p)); if (t) outLines.push(t); } }
  else {
    const W = await workState(R);
    for (const p of Object.keys(X).sort()) { if (!match(p)) continue; const w = W.get(p); if (w && w.sha === X[p]) continue; const nb = w ? await R.fs.bytes(w.id) : null; const t = unifiedDiff(p, await get(X[p], p), nb); if (t) outLines.push(t); }
  }
  if (!outLines.length) return;
  let text = outLines.join("\n"); const all = text.split("\n"); if (all.length > 3000) text = all.slice(0, 3000).join("\n") + `\n...stopped after 3000 lines (${all.length - 3000} more)`; R.out(text);
}
function decorations(R) { // sha -> names shown next to it in the log
  const d = new Map(), add = (sha, t) => { if (!sha) return; if (!d.has(sha)) d.set(sha, []); d.get(sha).push(t); };
  const head = headSha(R); if (head) add(head, "HEAD -> " + R.st.branch);
  for (const b in R.st.branches) if (b !== R.st.branch) add(R.st.branches[b], b);
  for (const r in R.st.remotes) add(R.st.remotes[r], r);
  return d;
}
async function cmdLog(R, args) {
  let n = 20, one = false;
  for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === "--oneline") one = true; else if (a === "-n") n = +args[++i] || 20; else if (/^-\d+$/.test(a)) n = +a.slice(1); else if (/^-n\d+$/.test(a)) n = +a.slice(2); }
  const head = headSha(R); if (!head) throw new GitError(`Your current branch '${R.st.branch}' has no commits yet.`);
  const dec2 = decorations(R), { local, base } = chain(R, head), list = [...local];
  if (list.length < n && base) {
    const rest = n - list.length, seen = new Set();
    if (R.st.remote) { const j = await R.gh("GET", `${apiBase(R)}/commits?sha=${base}&per_page=${Math.min(100, rest)}`); for (const x of j) { if (seen.has(x.sha)) continue; seen.add(x.sha); const c = R.st.commits[x.sha] || {}; list.push({ ...c, sha: x.sha, message: x.commit.message, author: { name: x.commit.author && x.commit.author.name, email: x.commit.author && x.commit.author.email }, time: Date.parse(x.commit.author && x.commit.author.date) || 0, remote: true }); } }
    else { const c = R.st.commits[base]; if (c) list.push(c); }
  }
  const text = list.slice(0, n).map(c => { const dn = dec2.get(c.sha), first = String(c.message || "").split("\n")[0];
    if (one) return `${short(c.sha)}${dn ? " (" + dn.join(", ") + ")" : ""} ${first}`;
    return `commit ${c.sha}${dn ? " (" + dn.join(", ") + ")" : ""}\nAuthor: ${(c.author && c.author.name) || "unknown"} <${(c.author && c.author.email) || ""}>\nDate:   ${new Date(c.time).toString()}\n\n` + String(c.message || "").split("\n").map(l => "    " + l).join("\n") + "\n"; }).join(one ? "\n" : "\n");
  R.out(text);
}
async function cmdBranch(R, args) {
  const del = args.includes("-d") || args.includes("-D"), rem = args.includes("-r"), all = args.includes("-a"), pos = args.filter(a => !a.startsWith("-"));
  if (del) { for (const b of pos) { if (b === R.st.branch) throw new GitError(`Can't delete the branch '${b}' because you are on it.`); if (!R.st.branches[b]) throw new GitError(`No branch named '${b}'.`); delete R.st.branches[b]; R.out(`Deleted branch ${b}.`); } R.dirty = true; return; }
  if (pos.length) { if (R.st.branches[pos[0]]) throw new GitError(`A branch named '${pos[0]}' already exists.`); const start = pos[1] ? await resolveRef(R, pos[1]) : headSha(R); if (!start) throw new GitError("Make a commit first."); R.st.branches[pos[0]] = start; R.dirty = true; return; }
  const rows = []; if (!rem) for (const b of Object.keys(R.st.branches).sort()) rows.push((b === R.st.branch ? "* " : "  ") + b);
  if (rem || all) for (const r of Object.keys(R.st.remotes).sort()) rows.push("  remotes/" + r);
  if (!Object.keys(R.st.branches).includes(R.st.branch) && !rem) rows.unshift("* " + R.st.branch);
  R.out(rows.join("\n") || "(no branches)");
}
async function resolveRef(R, name) { // a branch, a remote branch like origin/main, or a commit id (at least 7 characters)
  if (R.st.branches[name]) return R.st.branches[name]; if (R.st.remotes[name]) return R.st.remotes[name];
  if (/^[0-9a-f]{7,40}$/i.test(name)) { const hit = Object.keys(R.st.commits).find(s => s.startsWith(name.toLowerCase())); if (hit) return hit; }
  return null;
}
async function cmdCheckout(R, args, isSwitch) {
  let create = false; const pos = [];
  for (let i = 0; i < args.length; i++) { const a = args[i]; if (a === "-b" || a === "-c" || a === "--create") create = true; else if (a === "--") { pos.push("--", ...args.slice(i + 1)); break; } else if (!a.startsWith("-")) pos.push(a); }
  const dd = pos.indexOf("--");
  if (dd >= 0 || (!isSwitch && !create && pos.length && !R.st.branches[pos[0]] && !R.st.remotes[(R.st.remote ? R.st.remote.name : "origin") + "/" + pos[0]] && !(await resolveRef(R, pos[0])))) return cmdRestore(R, dd >= 0 ? pos.slice(dd + 1) : pos); // git checkout -- file, or a file name
  const name = pos[0]; if (!name) throw new GitError("Say which branch: git checkout <branch>   (or git checkout -b <new branch>)");
  const rname = R.st.remote ? R.st.remote.name + "/" + name : null; let target;
  if (create) { if (R.st.branches[name]) throw new GitError(`A branch named '${name}' already exists.`); target = pos[1] ? await resolveRef(R, pos[1]) : headSha(R); if (!target && pos[1]) throw new GitError(`'${pos[1]}' isn't a branch or commit.`); }
  else if (R.st.branches[name]) { if (name === R.st.branch) return R.out(`Already on '${name}'`); target = R.st.branches[name]; }
  else if (rname && R.st.remotes[rname]) target = R.st.remotes[rname];
  else throw new GitError(`'${name}' isn't a branch here. (If it is on GitHub, run git fetch first.)`);
  if (Object.keys(R.st.index).length) throw new GitError("You have staged changes. Commit them first, or unstage them with: git restore --staged .");
  const curT = await treeOf(R, headSha(R)), newT = target ? await treeOf(R, target) : {};
  await applyTree(R, curT, newT, target && chain(R, target).base);
  if (!R.st.branches[name]) R.st.branches[name] = target; R.st.branch = name; R.dirty = true;
  R.out(create ? `Switched to a new branch '${name}'` : `Switched to branch '${name}'`);
}
async function cmdRemote(R, args) {
  const sub = args[0], rem = R.st.remote;
  if (!sub || sub === "-v" || sub === "--verbose") return R.out(!rem ? "" : sub ? `${rem.name}\t${remoteUrl(R)} (fetch)\n${rem.name}\t${remoteUrl(R)} (push)` : rem.name);
  if (sub === "add" || sub === "set-url") {
    const name = args[1], u = parseUrl(args[2]); if (!name || !u) throw new GitError(`Usage: git remote ${sub} <name> <https://github.com/user/repo>`);
    if (sub === "add" && rem) throw new GitError(`A remote is already set ('${rem.name}'). This git supports one remote. Change it with: git remote set-url ${rem.name} <url>`);
    if (sub === "set-url" && (!rem || rem.name !== name)) throw new GitError(`No remote named '${name}'.`);
    R.st.remote = { name, owner: u.owner, repo: u.repo, private: false }; R.dirty = true; return;
  }
  if (sub === "remove" || sub === "rm") { if (!rem || rem.name !== args[1]) throw new GitError(`No remote named '${args[1] || ""}'.`); for (const r of Object.keys(R.st.remotes)) delete R.st.remotes[r]; R.st.remote = null; R.dirty = true; return; }
  throw new GitError("Usage: git remote [-v] | add <name> <url> | set-url <name> <url> | remove <name>");
}
async function doFetch(R, quiet) { // updates what we know about the branches on GitHub
  const rem = needRemote(R), found = {};
  try {
    const info = await R.gh("GET", apiBase(R)); rem.private = !!info.private;
    for (let page = 1; page <= 10; page++) { const list = await R.gh("GET", `${apiBase(R)}/branches?per_page=100&page=${page}`); for (const b of list) found[rem.name + "/" + b.name] = b.commit.sha; if (list.length < 100) break; }
  } catch (e) { if (e.status === 409) { /* an empty repository has no branches */ } else throw e; }
  const lines = [];
  for (const r of Object.keys(found)) { const old = R.st.remotes[r]; if (!old) lines.push(` * [new branch]      ${r.slice(rem.name.length + 1)} -> ${r}`); else if (old !== found[r]) lines.push(`   ${short(old)}..${short(found[r])}  ${r.slice(rem.name.length + 1)} -> ${r}`); }
  for (const r of Object.keys(R.st.remotes)) if (!(r in found)) { delete R.st.remotes[r]; lines.push(` - [deleted]         ${r}`); }
  R.st.remotes = found; R.dirty = true;
  if (!quiet) R.out(lines.length ? `From ${remoteUrl(R)}\n` + lines.join("\n") : "Everything up to date.");
}
async function cmdPull(R, args) {
  const rebase = args.includes("--rebase") || args.includes("-r"), rem = needRemote(R);
  await doFetch(R, true);
  const branch = R.st.branch, tip = R.st.remotes[rem.name + "/" + branch], head = headSha(R);
  if (!tip) throw new GitError(`There is no branch '${branch}' on GitHub yet. Publish it with: git push`);
  const { local, base } = chain(R, head);
  if (tip === base) return R.out(local.length ? "Already up to date. (You have commits to push.)" : "Already up to date.");
  if (head && !base) throw new GitError("This branch started on your computer (git init), so it has no common history with GitHub. Clone the repository instead.");
  if (base) { const c = await R.gh("GET", `${apiBase(R)}/compare/${base}...${tip}?per_page=1`); if (c.status !== "ahead") throw new GitError("The branch on GitHub was rewritten (a force push), so it can't be pulled. Check it out again with git checkout -b <new name> " + rem.name + "/" + branch + "."); }
  const baseT = base ? await treeOf(R, base) : {}, newT = await treeOf(R, tip);
  if (!local.length) { // fast-forward
    const paths = await applyTree(R, baseT, newT, tip);
    R.st.branches[branch] = tip; R.dirty = true;
    return R.out(`Updating ${short(base)}..${short(tip)}\nFast-forward: ${paths.length} file${paths.length === 1 ? "" : "s"} changed`);
  }
  if (!rebase) throw new GitError(`Your branch has ${local.length} commit${local.length === 1 ? "" : "s"} that GitHub doesn't have, and GitHub has new commits too. Merging isn't supported here. Put your commits on top of the new ones with: git pull --rebase`);
  const remoteChanged = new Set(changedPaths(baseT, newT)), conflicts = new Set(), ordered = local.slice().reverse();
  for (const c of ordered) for (const p of Object.keys(c.d)) if (remoteChanged.has(p) && (c.d[p] === null ? newT[p] !== undefined : c.d[p] !== newT[p])) conflicts.add(p);
  if (conflicts.size) throw new GitError("These files were changed both by you and on GitHub, and can't be combined automatically:\n" + [...conflicts].map(p => "\t" + p).join("\n") + "\nNothing was changed. Save your version under another name, git restore the file, and pull again.");
  let finalT = { ...newT }; for (const c of ordered) finalT = applyDelta(finalT, c.d);
  await applyTree(R, await treeOf(R, head), finalT, tip);
  const map = {}; let prev = tip;
  for (const c of ordered) { const sha = await sha1hex(enc.encode("rebase\0" + c.sha + prev + Date.now())); R.st.commits[sha] = { ...c, sha, parents: [prev] }; map[c.sha] = sha; prev = sha; }
  for (const c of ordered) delete R.st.commits[c.sha];
  for (const k in R.st.branches) if (map[R.st.branches[k]]) R.st.branches[k] = map[R.st.branches[k]];
  for (const k in R.st.commits) R.st.commits[k].parents = R.st.commits[k].parents.map(p => map[p] || p);
  R.dirty = true; R.out(`Successfully rebased: your ${ordered.length} commit${ordered.length === 1 ? "" : "s"} now sit on top of ${short(tip)}.`);
}
async function needToken(R) {
  let t = R.token(); if (t) return t;
  R.out("Pushing needs a GitHub personal access token. Make one at https://github.com/settings/tokens (classic token with the repo scope, or a fine-grained token with Contents: Read and write for this repository).\nIt is shown while you type. It is kept only until the Terminal closes; to keep it: git config --global token <token>");
  t = String(await R.input("Token: ")).trim(); if (!t) throw new GitError("No token given."); sessionToken = t; return t;
}
async function cmdPush(R, args) {
  const rem = needRemote(R); let pos = args.filter(a => !a.startsWith("-")); if (pos[0] === rem.name) pos.shift();
  const branch = (pos[0] || R.st.branch).split(":")[0], head = R.st.branches[branch]; if (!head) throw new GitError(`'${branch}' isn't a branch here, or it has no commits yet.`);
  const { local, base } = chain(R, head); if (!local.length) return R.out("Everything up-to-date");
  await needToken(R);
  let tip = null; try { tip = (await R.gh("GET", `${apiBase(R)}/git/ref/heads/${encPath(branch)}`)).object.sha; } catch (e) { if (e.status !== 404 && e.status !== 409) throw e; }
  if (tip) {
    if (!base) throw new GitError("Rejected: your history and GitHub's have nothing in common. (A repository made with git init can only be pushed to an empty GitHub repository.)");
    if (tip !== base) throw new GitError("Rejected: GitHub has commits you don't have. Get them first with: git pull --rebase   and push again.");
  } else if (!base) {
    const list = await R.gh("GET", `${apiBase(R)}/branches?per_page=1`).catch(e => { if (e.status === 409) return []; throw e; });
    if (list.length) throw new GitError("Rejected: this branch has no common history with GitHub's. Clone the repository and make your commits there.");
    return pushToEmpty(R, branch, head);
  }
  const ordered = local.slice().reverse(), baseMeta = await commitMeta(R, base), have = new Set(Object.values(await treeOf(R, base))), uploaded = new Set(), made = [];
  let cur = base, curTree = baseMeta.treeSha;
  for (const c of ordered) {
    R.check(); const entries = [], need = new Set();
    for (const [p, sha] of Object.entries(c.d)) { entries.push({ path: p, mode: R.st.modes[p] || "100644", type: "blob", sha }); if (sha !== null && !have.has(sha) && !uploaded.has(sha)) need.add(sha); }
    let n = 0; const total = need.size;
    await pool([...need], 4, async sha => { const bytes = await blobBytes(R, sha, null, null); const r = await R.gh("POST", apiBase(R) + "/git/blobs", { content: toB64(bytes), encoding: "base64" }); uploaded.add(sha); R.status(`Uploading files... ${++n}/${total}`); return r; }, R.check);
    const tr = await R.gh("POST", apiBase(R) + "/git/trees", { base_tree: curTree, tree: entries });
    const body = { message: c.message, tree: tr.sha, parents: [cur] }, nm = store(R.o, "gitUserName"), em = store(R.o, "gitUserEmail"); if (nm && em) body.author = { name: nm, email: em, date: new Date(c.time).toISOString() };
    const nc = await R.gh("POST", apiBase(R) + "/git/commits", body);
    made.push({ old: c.sha, sha: nc.sha, c, treeSha: tr.sha, parent: cur }); cur = nc.sha; curTree = tr.sha;
  }
  try { if (tip) await R.gh("PATCH", `${apiBase(R)}/git/refs/heads/${encPath(branch)}`, { sha: cur, force: false }); else await R.gh("POST", apiBase(R) + "/git/refs", { ref: "refs/heads/" + branch, sha: cur }); }
  catch (e) { if (e.status === 422) throw new GitError("Rejected: GitHub moved on while pushing. Pull first, then push again."); throw e; }
  const map = {}; for (const m of made) { map[m.old] = m.sha; R.st.commits[m.sha] = { ...m.c, sha: m.sha, parents: [m.parent], treeSha: m.treeSha, remote: true }; }
  for (const m of made) delete R.st.commits[m.old];
  for (const k in R.st.branches) if (map[R.st.branches[k]]) R.st.branches[k] = map[R.st.branches[k]];
  for (const k in R.st.commits) R.st.commits[k].parents = R.st.commits[k].parents.map(p => map[p] || p);
  R.st.remotes[rem.name + "/" + branch] = cur; R.dirty = true;
  R.out(`To ${remoteUrl(R)}\n${tip ? "   " + short(tip) + ".." + short(cur) : " * [new branch]"}  ${branch} -> ${branch}`);
}
async function pushToEmpty(R, branch, head) { // GitHub can't take the git API on an empty repository, so the first commit goes up file by file
  const tree = await treeOf(R, head), paths = Object.keys(tree).sort(), msg = (R.st.commits[head].message || "Initial commit").split("\n")[0], rem = R.st.remote;
  if (!paths.length) throw new GitError("The commit has no files to upload.");
  R.out("This GitHub repository is empty, so the files go up one by one (GitHub requires that for the first commit; its history will have one commit per file).");
  for (let i = 0; i < paths.length; i++) {
    R.check(); R.status(`Uploading files... ${i + 1}/${paths.length}`);
    await R.gh("PUT", `${apiBase(R)}/contents/${encPath(paths[i])}`, { message: i ? "Add " + paths[i] : msg, content: toB64(await blobBytes(R, tree[paths[i]], paths[i], null)) });
  }
  const info = await R.gh("GET", apiBase(R)), rb = info.default_branch || branch, b = await R.gh("GET", `${apiBase(R)}/branches/${encodeURIComponent(rb)}`);
  const ca = b.commit.commit.author || {};
  for (const k of Object.keys(R.st.commits)) if (!R.st.commits[k].remote) delete R.st.commits[k];
  R.st.commits[b.commit.sha] = { sha: b.commit.sha, parents: b.commit.parents.map(p => p.sha), message: b.commit.commit.message, author: { name: ca.name, email: ca.email }, time: Date.parse(ca.date) || 0, tree, treeSha: b.commit.commit.tree.sha, remote: true };
  delete R.st.branches[branch]; R.st.branches[rb] = b.commit.sha; if (R.st.branch === branch) R.st.branch = rb; R.st.remotes[rem.name + "/" + rb] = b.commit.sha; R.dirty = true;
  R.out(`To ${remoteUrl(R)}\n * [new branch]  ${rb}` + (rb !== branch ? `  (your branch '${branch}' is now called '${rb}', like GitHub's)` : ""));
}
function cmdConfig(o, args, out) { // user.name, user.email and the GitHub token are kept for every repository
  const flags = args.filter(a => a.startsWith("-")), pos = args.filter(a => !a.startsWith("-")), keys = { "user.name": "gitUserName", "user.email": "gitUserEmail", token: "gitToken", "github.token": "gitToken" };
  if (flags.includes("--list") || flags.includes("-l") || !pos.length) { return out(["user.name=" + store(o, "gitUserName"), "user.email=" + store(o, "gitUserEmail"), "token=" + (store(o, "gitToken") ? "(saved)" : "(none)")].join("\n")); }
  const k = keys[pos[0]]; if (!k) throw new GitError("Known settings: user.name, user.email, token (git config [--global] <name> <value>, or --unset)");
  if (flags.includes("--unset")) { store(o, k, ""); if (k === "gitToken") sessionToken = ""; return; }
  if (pos.length === 1) return out(k === "gitToken" ? (store(o, k) ? "(saved)" : "") : store(o, k));
  store(o, k, pos.slice(1).join(" ")); if (k === "gitToken") { sessionToken = ""; out("Token saved on this device in this browser's storage (not encrypted). Remove it with: git config --global --unset token"); }
}
function cmdLsFiles(R, s) { R.out(Object.keys(s.X).sort().join("\n")); }

const HELP = `git (mini git for VUS-OS, through the GitHub web API)
  git clone <url> [folder] [-b branch]   download a GitHub repository
  git init                               start a repository in this folder
  git status | add <file|.> | rm | restore [--staged] <file> | reset [--hard]
  git commit -m "message" [-a]           save a commit here
  git diff [--staged] [file] | log [-n 10] [--oneline] | ls-files
  git branch [name] | checkout [-b] <branch> | switch <branch>
  git remote [-v] | add origin <url>     git fetch | pull [--rebase] | push
  git config user.name "Name" | user.email "me@x.com" | --global token <github token>
Pushing and private repositories need a GitHub personal access token. Merges, stash and tags aren't supported.`;

async function main(o, env) {
  const args = (o.args || []).slice(), cmd = args.shift(), out = t => o.print(String(t));
  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") return out(HELP);
  if (cmd === "--version" || cmd === "version" || cmd === "-v") return out("git version 2.0 (VUS-OS mini git)");
  if (cmd === "clone") return cmdClone(env, o, args);
  if (cmd === "init") return cmdInit(env, o);
  if (cmd === "config") return cmdConfig(o, args, out);
  const R = await openRepo(env, o);
  if (!R) throw new GitError("This isn't a git repository (no .git folder here or above). Use git clone <url>, or git init.");
  switch (cmd) {
    case "status": await cmdStatus(R); break;
    case "add": await cmdAdd(R, args); break;
    case "rm": await cmdRm(R, args); break;
    case "restore": await cmdRestore(R, args); break;
    case "reset": await cmdReset(R, args); break;
    case "commit": await cmdCommit(R, args, o); break;
    case "diff": await cmdDiff(R, args); break;
    case "log": await cmdLog(R, args); break;
    case "branch": await cmdBranch(R, args); break;
    case "checkout": await cmdCheckout(R, args, false); break;
    case "switch": await cmdCheckout(R, args, true); break;
    case "remote": await cmdRemote(R, args); break;
    case "fetch": await doFetch(R, false); break;
    case "pull": await cmdPull(R, args); break;
    case "push": await cmdPush(R, args); break;
    case "ls-files": cmdLsFiles(R, await statusInfo(R)); break;
    default: throw new GitError(`'${cmd}' isn't a git command this version knows. Type: git help`);
  }
  if (R.dirty || R.pending.length) await saveState(R);
}

export default {
  id: "git", name: "Git", version: "1", runtime: "browser", native: true,
  async install(h) { // returns "installed"
    h.status("Testing git...");
    const sha = await blobSha(new Uint8Array(0)); h.status("");
    if (sha !== EMPTY_BLOB) h.say("Warning: the SHA-1 test failed, so git may not work in this browser.");
    h.say("Git is ready. Make a folder and clone into it, for example:  git clone https://github.com/user/repo\nPushing needs a GitHub token: git config --global token <token>");
    return "installed";
  },
  async uninstall() { sessionToken = ""; },
  run(o) { // o = { args, cwd, sys, storage, print, printErr, status, input }
    let cancelled = false, finish; const ctl = new AbortController(), done = new Promise(r => { finish = r; });
    main(o, { cancelled: () => cancelled, signal: ctl.signal }).then(() => finish({ ok: true, changed: [], skipped: [] }), e => {
      if (!cancelled) o.printErr(e instanceof GitError ? "git: " + e.message : "git crashed: " + ((e && e.message) || e));
      finish({ ok: false, changed: [], skipped: [], stopped: cancelled });
    });
    return { done, stop() { cancelled = true; ctl.abort(); finish({ ok: false, stopped: true, changed: [], skipped: [] }); } };
  },
  __test: { sha1Fallback, blobSha, parseUrl, ignoreFn, specMatcher, myersOps, unifiedDiff, main, sha1hex, GitError }
};
