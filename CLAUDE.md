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

## To do
1. Test in the browser (Chrome/Edge): `install python` (progress shows, test run works), `py -c "print(1+1)"`, a file that writes a file and one inside a sub-folder, `py file.py a b`, `input()` with a typed line, Stop button and Ctrl+C on `while True: pass`, offline run after install, `uninstall python`. Same for JavaScript: `install javascript`, `js -c "console.log(2+2)"`, a file using `await input("Name? ")`, `fs.write` saving a file, Stop on `while(true){}`.
2. Check that Settings > Delete all / factory reset and export/import handle the new `langs` localStorage key and `lang|<id>` entries in the "code" store (not checked yet).
3. Release: bump `OS_VERSION`, add `upd.txt` entry, push `index.html`, `apps/Terminal/terminal.js`, `languages/python.js`, `languages/javascript.js`, `languages/list.json`.

## Known limits (by design for now)
- Python `input()` needs a browser that can pause WebAssembly (recent Chrome/Edge); elsewhere it ends with EOF.
- A JavaScript program stuck in a tight loop can only be ended with Stop / Ctrl+C (the worker is terminated).
- A `|` inside code splits the Terminal line; use `;` instead.
- Output stops at 3000 lines; files over 1 MB and non-text files are not given to programs. Programs can't delete files or folders (only create/change text files); empty folders a program makes are not saved.
