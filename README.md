# VUS-OS
Web OS version of VUS Hub, This OS combines VUS Hub apps & OS-only apps like terminal

why use VUS-OS? 
- better for those who like personalization
- everything is easily visible instead of going though tabs
- many apps launch within the OS, which is easier to manage instead of multiple real tabs on your computer
- you can multitask multiple tabs, which could be nice if you like reading chat while playing a game
- cuz its cool and is password protected (optional)
- cuz why not?

## New Features
(Requested by a TikTok user. Cursor speed is the only part not built yet.)

- **Custom app icons**: change the icon of any built-in or installed app (Settings > Apps > App icons)
- **Custom cursor**: see "Cursor options" below
- **Always on Top (Bubble windows)**: pin a small "bubble" app over another app so you can use both at once

### How Always on Top works
- Each window gets an Always on Top button (pin) in its title bar
- Turning it on puts the window on top of everything else
- If several windows are pinned, the one pinned **last** is on top (pin A then B = B above A)
- Turning it off and on again moves that window back to the top
- Uses a simple counter that goes up every time a window is pinned, so it works no matter how many times you toggle

### Cursor options
A new Cursor menu in Settings. Choose one:
- **Default**: the normal cursor. This is the default for new users
- **Circle** (custom): change the radius and fill color, the outline thickness and color, and turn the fill or the outline off
- **Crosshair** (custom): turn each line (up, down, left, right) on or off, and change thickness, length and color
- **Premade cursors**: a few popular styles (dot, arrow, pointer, and so on), drawn as SVG
- **Your own image**

Premade cursors and your own image also have a color or size setting.

The browser can't draw a circle or crosshair as the real cursor, so VUS-OS draws its own cursor on top. Default uses the real one. Inside an app's own page the normal cursor shows, and window edges and text boxes keep theirs.

**Cursor speed (not built yet):** the browser can't change how fast the real cursor moves. It would need VUS-OS to take over the mouse completely, which has side effects (for example apps inside windows would not receive the mouse), so it is left for later.

All cursor settings are saved with the other settings, so they are included in Export, Import and backups.
