# VUS-OS: notes for Claude (read this first in a new chat)

How to use this file: it lists only what is NOT done yet. When a task is finished, delete it from "To do". Update "Where things stand" at the end of each session.

## Project
- VUS-OS is a Windows-style desktop in the browser. Main file: `index.html` (repo root). Local folder: `E:\Claude\VUS OS`.
- Repo: GitHub `Cra-Z-Gaming/VUS-OS`, branch main. It is NOT served by GitHub Pages: everything is fetched from raw.githubusercontent.com, so service workers and extra same-origin files can't be relied on.
- Layout: `index.html`, `upd.txt` (update history shown in What's new), `apps/` (native apps: notes.js, gallery.js, Terminal/terminal.js), `languages/` (list.json + one .js per language).
- Native apps get `(root, os)`; `os.sys` is built in `makeOS()` in index.html (files, folders, read/write/overwrite, launch, lang* helpers).
- Keep the user's style: plain-language comments, no mobile/touch features, no Paint app, SVG icons.
- Release steps: bump `OS_VERSION` in index.html and add an entry at the top of `upd.txt`, then push.

## Where things stand
- Languages system is written: `languages/python.js` (Pyodide in a Web Worker, runtime cached in Cache Storage so it works offline), `languages/list.json`, Terminal commands `install`, `uninstall`, `languages`, `py`/`python` (file or `-c`), Stop button and Ctrl+C, and `sys.overwrite` + `sys.lang*` in index.html.
- Python programs get the current folder's text files, including those in sub-folders (named like `data/a.txt`, up to 5 levels deep); changed or new text files are saved back, and sub-folders are created when a program makes `sub/a.txt`. `sys.exit()` and `exit()` end the program cleanly. `py file.py a b` sets `sys.argv`; `py -V` shows the version; `sys.stdin` reads typed lines.
- `input()` works in Python (pauses via Pyodide JSPI, needs recent Chrome/Edge; other browsers get EOF) and in JavaScript (`await input("q")`). The Terminal sends the next typed line to the running program (`inputWait` in terminal.js) and hides command suggestions meanwhile.
- `languages/javascript.js` is written: runs `.js` files with `js file.js` or `js -c "code"` (also `-e`) in a Web Worker, no download. Programs get `console.*`, `await input()`, `fs.list/exists/read/write`, top-level await, timers. `fmt` keeps short objects on one line.
- Verified here: syntax of all files; the JavaScript runner's Node tests (including sub-folder paths); and the Python `execute()` against real Pyodide 0.26.4 in Node (20 tests: hello, argv, files, sub-folders, stale files cleared, error trace, syntax error, `sys.exit(0/2)`, `exit()`, own module import and reload, binary skipped, `input()`/stdin EOF, fresh globals, stdlib). NOT verified: running in a real browser, and `input()` with a typed line (needs JSPI, Node test only covers EOF).

## Plan in progress: C: drive, system files, VM, cleaner File Explorer (agreed with the user, Nov 2026)
The user's idea: a fake `C:` drive so it feels like a real PC, system files that can be viewed but not edited, and a VM where the system can be edited safely (close the tab = nothing real breaks; reset to default / import an OS file).

### Step 1 (code written in index.html, NOT tested in a browser yet): File Explorer cleanup + virtual drive
Done so far: new `explorer()` (back / forward / up, address bar `C:\Users\Owner\...`, one File ▾ menu for New / Upload / Export zip, no tabs; sidebar has Desktop, Downloads, Documents, Favorites, Recent, Temporary, Saved, Recycle Bin, This PC > C: > System). Downloads and Documents are real folders marked `home: true` (hidden from the Desktop, can't be deleted, renamed or moved). `C:\System` lists the repo's files (GitHub API, falls back to a fixed list) and opens them read-only. The old tab version is still in index.html as `explorerOld` (dead code, delete it). Only the new block was syntax-checked; the whole file was not (the file copy tool failed), so run a check before pushing.
Still to do for step 1: (a) test it in the browser; (b) Terminal: `ls` at the root now shows Downloads/Documents (terminal.js filters by parent only, add `&& !x.home` if they should be hidden there); (c) check export/import and backups keep `home` folders without making duplicates; (d) the old Explorer-only CSS rules (`.fxtabs`) were removed, check nothing else used them; (e) the `x.home` guard is in deleteFolder / inlineRename / moveTo, check drag and drop onto the Desktop can't move them either.
- Layout like Windows: a left sidebar (Desktop, Downloads, Documents, This PC > C:), one top bar with back / forward / up, an address path (`C:\Users\<name>\Desktop`) and a search box.
- Upload, New and Export (zip) go into dropdown buttons instead of a row of loose buttons. Remove the tabs inside the Explorer (a second Explorer window does the same job); if kept, only show the tab strip when 2+ tabs exist.
- Virtual paths: `C:\Users\<name>\Desktop`, `\Downloads`, `\Documents`. No data is moved: the user's existing root files and folders stay where they are and are shown as Desktop. Downloads and Documents are new real folders created on first use (user data, kept in export/import and backups).
- `C:\System` (or `C:\Windows`-style, name to be decided) is a READ-ONLY view of the OS's own files (index.html, upd.txt, apps/, languages/), fetched from the repo, so people can look at them. Viewing and opening as text is allowed; saving, renaming, deleting and moving are refused with a message that points to the VM (step 2).
- Keep everything working that exists today (Terminal paths, Recycle Bin, drag and drop, icons on the desktop). Terminal `cd`/`ls` keep working on the user's folders; showing `C:\Users\name\...` in the prompt is optional and later.

### Step 2 (later): the VM
- A window that runs a COPY of the OS with its own separate storage (own localStorage keys / IndexedDB names, sandboxed iframe or a separate storage prefix), so nothing in it can touch the user's real files. Closing the VM window or tab drops it.
- The VM can edit the system files (apps and language files first; the core index.html is the hard part: edit a copy and reload the VM from it).
- Buttons: Reset to default (fresh OS), Import an OS file/zip, Export the edited OS. Imported OS files are untrusted code, which is the main reason the VM must be isolated from the real storage.

### Step 3 (small, can be done any time)
- DONE, not tested in a browser: right-click a .py / .js file > "Run in Terminal" (`runInTerminal()` in index.html pushes a job onto `window.__vusTermQ` and fires the `vus-term-run` event; `takeQueue()` at the end of terminal.js runs it in the file's folder, or says to `install python` / `install javascript`). Needs the new terminal.js pushed.
- Still open: make the `execute file.py` command itself run the file (today it opens .py as text).

## To do
0. The user ran a script using `urllib` and got `urlopen error unknown url type: https`: that means the pyodide-http patch (see Known limits) was NOT active in the copy of python.js they run (the installed language file is stored locally from when they ran `install python`, so a new python.js only takes effect after it is pushed to the repo and the user runs `uninstall python` then `install python`). Tell them this; re-check once they have done it.
1. Test in the browser (Chrome/Edge): `install python` (progress shows, test run works), `py -c "print(1+1)"`, a file that writes a file and one inside a sub-folder, `py file.py a b`, `input()` with a typed line, Stop button and Ctrl+C on `while True: pass`, offline run after install, `uninstall python`. Same for JavaScript: `install javascript`, `js -c "console.log(2+2)"`, a file using `await input("Name? ")`, `fs.write` saving a file, Stop on `while(true){}`. (Done by the user so far: `py -c "print(1+1)"` printed 2.)
2. Check that Settings > Delete all / factory reset and export/import handle the new `langs` localStorage key and `lang|<id>` entries in the "code" store (not checked yet).
3. Release: bump `OS_VERSION`, add `upd.txt` entry, push `index.html`, `apps/Terminal/terminal.js`, `languages/python.js`, `languages/javascript.js`, `languages/list.json`.

## Known limits (by design for now)
- Python `input()` needs a browser that can pause WebAssembly (recent Chrome/Edge); elsewhere it ends with EOF.
- A JavaScript program stuck in a tight loop can only be ended with Stop / Ctrl+C (the worker is terminated).
- A `|` inside code splits the Terminal line; use `;` instead.
- Python `urllib` and `requests` work through `pyodide-http` (patched automatically when the code mentions them; downloads that small package once). Not tested in a real browser yet. The server must allow cross-origin requests (CORS), including the `Authorization` header, or the browser blocks the call. JavaScript uses plain `fetch`, Python can also use `pyodide.http.pyfetch`.
- Output stops at 3000 lines; files over 1 MB and non-text files are not given to programs. Programs can't delete files or folders (only create/change text files); empty folders a program makes are not saved.
