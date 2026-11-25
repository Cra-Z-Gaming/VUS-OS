# VUS-OS test checklist (Chromebook / Chrome)

Tick each line. Write down anything odd (what you clicked, what you expected, what happened). Push the new files to GitHub first, then reload the OS.

## 1. New in the 11.25.2026 4:46 PM update
- [ ] Open the App Store (Tools): Calculator and Clock are listed. Install both. Their icons show on the desktop / Start.
- [ ] Calculator: type `2+3*4` and press Enter (14). Try Scientific, `sin(30)` (0.5), the History button, Ctrl+C / Ctrl+V of a number.
- [ ] Clock: set a 10 second timer, switch to the Stopwatch tab, wait: the timer should still ring. Minimize the window first, it should still ring too.
- [ ] Clock: set an alarm for the next minute. It rings and a notification shows.
- [ ] Notes: make two notes, use tabs, close and reopen a tab, search the list, Ctrl+F find and replace.
- [ ] Notes: "Save to Files" makes a file on the Desktop. Change the file in Notepad: the note follows. Type in the note: the file changes.
- [ ] Notes: "Open from Files" opens a .txt or .js file from the Desktop.
- [ ] Gallery opens (it tries both repo paths now).

## 2. Always on Top and Cursor
- [ ] Pin window A, then B: B is on top. Click A: B stays on top. Unpin and pin A again: A jumps to the top.
- [ ] Settings > Cursor: Circle (change radius, color, opacity), Crosshair, a ready-made cursor, your own image. Does the drawn cursor feel laggy? The default should change nothing.
- [ ] The real cursor shows over window edges, text boxes and inside apps.
- [ ] Settings > Apps > App icons: set a custom icon on one app, then Reset.

## 3. Export and Import (Chromebook freeze check)
- [ ] Export all: the bar keeps moving, Cancel works, a file is saved.
- [ ] Import the big backup with Gentle mode ticked. The list of saved databases shows names and sizes. Untick the big ones. Does it get past 2/17 now? Use Pause / Skip / End once each.
- [ ] Run the import again: "restored earlier" shows on the finished databases.

## 4. Explorer, Terminal, languages
- [ ] Explorer: back / forward / up, type a path in the address bar (`C:\Users\Owner\Documents`), the left sidebar, New and Upload menus.
- [ ] `C:\System` opens the OS files read-only; saving one shows the "use the Virtual Machine" message.
- [ ] Terminal: `ls`, `cd Downloads`, `pwd`, right-click a .py or .js file > Run in Terminal, `execute file.js`.
- [ ] `install python` then `py -c "print(1+1)"`, a file with `input()`, Stop button on `while True: pass`, then `uninstall python`. Do `uninstall python` + `install python` once if `urllib` still says "unknown url type".
- [ ] `install javascript`, `js -c "console.log(2+2)"`, `await input("Name? ")`.
- [ ] `install git`, `git clone` of a small public repo, `git status`, `git log`.

## 5. Folder websites
- [ ] Put `index.html`, `style.css`, `script.js` in one folder. Right-click the folder > Run file contents: styles and script both work.
- [ ] Unzip a small open-source game into a folder and run it.

## 6. Virtual Machine (needs the new index.html pushed)
- [ ] Start the VM. A red "VM" badge shows in its taskbar.
- [ ] Inside the VM: `localStorage` and `indexedDB` are empty (DevTools console in the VM frame), your real saved files are not visible.
- [ ] Edit a file in `C:\System` inside the VM, Restart VM: the edit is still there. Reset to default clears it.
- [ ] Export OS, Reset, Import OS: the edits come back.

## 7. Reset and backup
- [ ] Settings > Delete all / factory reset: no errors, Downloads and Documents come back once (no duplicates).
