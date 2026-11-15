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
- Python programs get the current folder's text files; changed or new text files are saved back. `sys.exit()` and `exit()` end the program cleanly.
- Verified here: syntax of all three files. NOT verified: running in a real browser, and the Pyodide tests after the `sys.exit` fix.

## To do
1. Re-run the Python tests against real Pyodide (needs network + `npm i pyodide`): hello, read/write files, error trace, syntax error, `sys.exit(0)`, `sys.exit(2)`, `exit()`, import own module, edited module reloads, stale files cleared, binary file skipped, `input()` gives EOF, stdlib, fresh globals each run.
2. Test in the browser: `install python` (progress shows, test run works), `py -c "print(1+1)"`, a file that writes a file, Stop button and Ctrl+C on `while True: pass`, offline run after install, `uninstall python`.
3. Check that Settings > Delete all / factory reset and export/import handle the new `langs` localStorage key and `lang|<id>` entries in the "code" store (not checked yet).
4. Release: bump `OS_VERSION`, add `upd.txt` entry, push `index.html`, `apps/Terminal/terminal.js`, `languages/python.js`, `languages/list.json`.

## Known limits (by design for now)
- `input()` is not supported (sees empty input).
- A `|` inside code splits the Terminal line; use `;` instead.
- Output stops at 3000 lines; files over 1 MB and non-text files are not given to programs.
