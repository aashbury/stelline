# Stelline

A native screensaver manager for [Omarchy](https://omarchy.org) 4 (Quattro).

Stelline draws the screensaver inside the Omarchy shell — your branding in the
theme's colours with the effects the stock saver is known for, a clock, digital
rain, nothing at all, or **your own**: pictures, a folder of them, a video clip,
some text, or a description, turned into ASCII art in your theme's colours (or
shown as they are). A grid of tiles, one click to choose, and a rule per tile —
at night, on battery, with a theme — for when each one plays. Timings, a
shuffle, and a quiet corner card that tells you what arrived while you were
away and whether an agent is waiting for you. The stock terminal screensaver
stays available, with the `ttfx` effects you pin.

![Stelline](preview.png)

It replaces Omarchy's built-in idle service (`omarchy.idle`) the sanctioned
way — the manifest declares it a clone — and keeps the stock timeline verbatim:
`idle.screensaver` and `idle.lock` in `shell.json`, the lock, wake, inhibitors,
Stay awake (`Super+Ctrl+I`), `omarchy toggle screensaver`, and dismissing the
saver cancelling a pending lock. Removing the plugin puts the built-in back.

Pure QML. No installer, no sudo, no services, nothing outside the plugin
directory except what the panel tells you it writes.

## Why

Omarchy's screensaver is a terminal emulator running `ttfx`. It only exits on a
keypress inside its own terminal, saturates several cores on HiDPI, renders
behind pinned windows, races on multi-monitor setups, and there is no way to
keep the screensaver but skip the lock. Stelline is a layer-shell surface on
every monitor: any key, click, wheel or deliberate pointer movement dismisses
it, it sits above pinned windows, it costs a few percent of a core, and each
stage has its own switch.

## Install

```sh
omarchy plugin add https://github.com/aashbury/stelline.git --enable
omarchy restart shell
```

The restart is needed once: the shell loads the new service before it lets go
of the stock one, and until then `omarchy-shell idle status` still answers
from the stock service. The panel offers a **Restart shell** button while that
is the case.

Then click the new icon in the bar and press **Finish setup**. Omarchy's
coffee-cup indicator watches the stock idle service, so under Stelline it can
never light up or respond; Finish setup removes it from the indicators list
(remembering what was there) and Stelline's own icon takes over the job — same
glyph, same hotkey. **Undo setup** in Advanced restores the list exactly.

Requires Omarchy 4.x. Stelline's id is `io.github.aashbury.stelline`.

## Use

| Where | Action | Effect |
|---|---|---|
| bar icon | left-click | open the panel |
| bar icon | right-click | toggle Stay awake (the coffee cup) |
| bar icon | middle-click | preview the current saver |
| panel | click a tile | make it the usual saver (with Shuffle on: check it in) |
| panel | ⚙ on a tile | when it plays, how it looks, delete |
| panel | ▶ on a tile | preview it |
| panel | the **Add** tile | a new saver from pictures, a folder, a clip, text or a description |
| saver | any key, click, wheel or pointer movement | dismiss |
| saver | `→` or `n` | next saver in the rotation |

Keyboard in the panel: `h`/`j`/`k`/`l` or arrows move (through the grid too),
`Enter` activates, `h`/`l` also step a slider, `p` previews the tile under the
cursor, `g` opens it, `n` adds, `s` toggles Shuffle, `a` opens Advanced, `x`
deletes (twice for a saver, once for a rule), `Esc` closes. Fields inside
editors take the mouse.

A hotkey, if you want one, goes in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + CTRL + S", "Screensaver", "omarchy-shell stelline preview")
```

Advanced › Integration can also point *System › Screensaver* (`Super+Esc`) at
Stelline. That edits `~/.config/omarchy/extensions/omarchy-menu.jsonc` by
inserting two marked lines before the final brace; it refuses to touch a file
that does not parse, and the toggle removes exactly those lines again.

## Savers

| | |
|---|---|
| **Wordmark** | `~/.config/omarchy/branding/screensaver.txt` — the same art the stock screensaver shows, set through *Style › Screensaver* — drawn as whole-pixel cells in the theme's foreground colour, with an entrance effect drawn at random every few seconds (pin some in ⚙): `decrypt`, `rain`, `beams`, `scatter`, `wipe`, `typewriter`, `reveal`, `pulse`. Edits show up live. |
| **Clock** | Time and date in the terminal font; repaints once a minute unless you turn seconds on. |
| **Matrix rain** | Heads in the foreground colour, trails in the accent; density, frame rate and glyph set are settings. Frame rate halves on battery. |
| **Blank** | Black. Exists so a battery rule has somewhere free to point. |
| **Terminal** | The stock `ttfx` screensaver in your terminal. Pin any subset of its 37 effects in ⚙ — with pins, Stelline starts the terminal itself running a copy of Omarchy's loop with `--include-effects`; without, it runs the stock launcher untouched. |

Every saver drifts a few pixels every half minute. Colours follow the theme
live; the font is the shell's monospace font.

### Your own

The **Add** tile makes a saver from:

| From | You pick | Becomes |
|---|---|---|
| **Pictures** | one or more files (the desktop file chooser) | ASCII art in theme colours, one piece per picture, played as a slideshow with the effects above — or the pictures as they are, crossfading |
| **A folder of pictures** | a folder | the same, and a folder shown as-is is read live: drop a picture in, it joins |
| **A video or GIF** | one file | an ASCII animation, frame by frame (the first 20 s at 10 fps) — or the clip as it is, as an animated picture |
| **Some text** | you type it | big letters as block art — a wordmark of your own |
| **A description** | you describe it | ASCII art, still or an animation loop, drawn by a model: Claude Code on this machine if it is installed, else the Claude API with `ANTHROPIC_API_KEY`. Shown only when one of those is there. |

Imports run in the background — the tile appears at once and fills in; a
notification says when it is ready — one after another. ASCII conversion is
Omarchy's own `omarchy-transcode-ascii` (braille for pictures, block for text),
frames come from `ffmpeg`, letters from ImageMagick; all of them ship with
Omarchy. Line art, logos and silhouettes convert well; busy photographs are
better shown as they are.

Each saver is a folder under `~/.config/omarchy/stelline/savers/<id>/` holding
a `saver.json` and its pieces — `001.txt`, `002.txt`… for ASCII pieces, a
`frames.txt` with frames separated by form feeds for an animation, `clip.gif`
for a clip, or nothing but paths for pictures shown as they are. A folder is a
self-contained bundle: copy it to another machine, it works there; edit the
text by hand, it shows. Delete in ⚙ removes the folder and every rule and
setting that named it; pictures shown as-is are never touched.

```json
{ "name": "Robot Inc.", "kind": "ascii", "pieces": ["001.txt", "002.txt"], "play": "slideshow",
  "source": { "type": "images", "paths": ["/home/you/Pictures/logo.svg", "…"] } }
```

`kind` is `ascii` or `image`; `play` is `slideshow` or `animation` (with `fps`);
`folder` instead of `pieces` means "every picture in that folder, live". The
per-saver knobs — dwell, speed, effects, order, fit, motion, background — live
with the plugin's other settings, not in the folder.

## Timings and stages

The sliders write `idle.screensaver` and `idle.lock` in
`~/.config/omarchy/shell.json` — the same keys the stock service reads, so
nothing forks. Both are seconds from the moment you went idle. The lock switch
is Stelline's own: off keeps the screensaver and never locks on idle (the stock
service cannot do that). The hero toggle turns the screensaver stage off while
leaving the lock alone. `omarchy toggle screensaver` is honoured for the idle
screensaver and ignored by previews, as in stock.

## When a saver plays

Click a tile: that is the usual saver, the one that plays when nothing else
applies. Open a tile's ⚙ and switch on the conditions under **Plays** to give it
a rule; all the conditions of one rule have to hold, and each shows its own
fields once it is on. A rule can also change the timings while it holds.

| Condition | Holds when |
|---|---|
| At night | the clock is inside a window, wrapping midnight |
| On battery | unplugged, optionally only below a percentage |
| With a theme | `~/.local/state/omarchy/current/theme.name` equals the chosen slug |

So the dancing clip 17:00–08:30 and the company suite the rest of the day is
two tiles: give the clip a night rule from 17:00 to 08:30 and click the suite.

One rule per tile; when two tiles' rules hold at once, the older rule wins.
Advanced › Rules lists every rule in that order, together with any rule that
only changes the timings (say, a shorter screensaver on battery) — those are
added there. Nothing ships enabled, so a fresh install behaves exactly like
stock. Unknown condition types never match, so a rule written by a newer
version is inert on an older one.

## Status card

A small card in a corner of the saver: how many notifications arrived since you
went idle, from which apps (counts by default; summaries or bodies are opt-in —
it is an unattended screen), and one line of agent state read from
`~/.local/state/omarchy/agent-ambient` (`working`, `needs`, `done`, `error` —
the convention several agent plugins already write). Hidden while Do Not
Disturb is on, and when there is nothing to say. It reads Omarchy's own
notification mirror under `~/.local/state/omarchy/notifications/`; it never
talks to the notification daemon.

## Settings

Everything lives inline on the plugin's entry in `shell.json`, Omarchy-style.
The panel writes it; `omarchy-shell stelline get <key>` reads it. Scalars can be
set with `omarchy-shell stelline set <key> <json>`; anything with a comma has to
be base64 (Quickshell's IPC splits arguments on commas):

```sh
omarchy-shell stelline set saver '"clock"'
omarchy-shell stelline set64 shuffleFrom "$(printf '["clock","matrix"]' | base64 -w0)"
```

Defaults:

```json
{ "saver": "wordmark", "shuffle": false, "shuffleFrom": ["wordmark", "clock", "matrix"],
  "screensaverEnabled": true, "lockEnabled": true,
  "savers": { "wordmark": { "effect": "cycle", "effects": [], "holdSec": 15, "background": "theme" },
              "clock": { "format": "HH:mm", "showDate": true, "showSeconds": false },
              "matrix": { "density": 0.6, "fps": 15, "glyphs": "katakana" },
              "blank": {}, "terminal": { "effects": [] } },
  "situations": [], "card": { "enabled": true, "corner": "bottom-right", "detail": "counts", "showAgent": true, "maxApps": 4 },
  "integration": { "menuEntry": false } }
```

A user saver's knobs sit under `savers.<id>`: `play`, `dwellSec`, `fps`,
`effects`, `order` (`sequence`/`shuffle`), `fit` (`contain`/`cover`), `motion`
(`none`/`zoom`), `background`. `effects` empty means all of them.

## IPC

`omarchy-shell stelline <method>`: `status`, `preview [saver]`, `show`, `hide`,
`next`, `mini [saver]` / `hideMini` (a small corner preview that takes no
focus), `list`, `get`, `set`, `set64`, `setSaver`, `toggleShuffle`,
`setStage <screensaver|lock> <on|off>`, `setTimeout <stage> <seconds>`,
`toggleStayAwake`, `setRule <saver> <night|battery|theme> <on|off>`,
`import64 <base64 json>` (the spec the Add card builds: `source`
`images|folder|video|text|prompt`, `paths`, `text`, `prompt`, `style`
`ascii|image`, `name`, `fps`, `seconds`, `animated`, `frames`), `deleteSaver
<id>`, `rescan`, `pick <images|folder|video>`, `finishSetup`, `undoSetup`,
`setMenuEntry <on|off>`, `simulateIdle`, `simulateLock [dry-run|off|real]`,
`reloadCard`, `ping`.

```sh
omarchy-shell stelline import64 "$(printf '%s' '{"source":"text","text":"Robot Inc.","style":"ascii"}' | base64 -w0)"
```

`omarchy-shell idle status|enable|disable|toggle` keep working exactly as with
the stock service; `status` reports `"clone": "stelline"`.

## Known limits

- *Style › Screensaver* edits still open the stock terminal preview afterwards
  (`omarchy-branding-screensaver` calls the launcher itself). The art shows
  up in Stelline's Wordmark live; use the panel's Preview to see it.
- Fields inside editors are mouse-driven; rows and tiles are keyboard-navigable.
- Converting a clip to ASCII runs the stock transcoder once per frame: about a
  minute for 20 seconds of video. It runs in the background.
- A described saver needs Claude Code (`claude` on the PATH) or
  `ANTHROPIC_API_KEY`; the Add card hides the option otherwise. The model is
  asked at low effort on purpose (at the default it deliberates over the grid
  for minutes); an animation takes a minute or two. What comes back is only as
  good as the model's drawing that day.
- Pinned-effect terminal launching on more than one monitor follows the stock
  launcher's sequence but has only been tested on one.
- Disabling the plugin leaves a harmless `{ "id": "omarchy.idle" }` entry in the
  bar layout (Omarchy writes it when restoring a clone; it renders nothing).
  `omarchy plugin enable` turns it back into Stelline's entry; after a real
  uninstall remove it by hand if you like:
  `jq 'del(.bar.layout[][] | select(type=="object" and .id=="omarchy.idle"))' ~/.config/omarchy/shell.json | sponge ~/.config/omarchy/shell.json`

## Uninstall

```sh
# in the panel: Advanced › Undo setup   (or: omarchy-shell stelline undoSetup)
omarchy plugin remove io.github.aashbury.stelline
omarchy restart shell
```

Removing re-enables the built-in idle service. Your `idle.screensaver` /
`idle.lock` values stay as you left them.

## Dev loop

```sh
git clone https://github.com/aashbury/stelline.git ~/Work/aashbury/stelline
ln -s ~/Work/aashbury/stelline ~/.config/omarchy/plugins/io.github.aashbury.stelline
omarchy plugin enable io.github.aashbury.stelline --section center
omarchy restart shell
```

The service is `keepLoaded`, so every QML edit needs `omarchy restart shell`.
Logic lives in `StellineModel.js`, which runs under Node: `node --test
tests/*.test.js`. `omarchy plugin validate .` runs the shell's manifest checks.
`omarchy-shell stelline mini clock` shows a saver in a corner without taking
over the screen; `journalctl --user -t omarchy-shell -f` shows every idle
event. Renderer experiments go in a second Quickshell instance (a folder with
`Commons`, `Ui` and `savers` symlinked, and a `shell.qml` that loads one
component) so a runaway paint loop cannot take the bar down with it.

## Licence

MIT. The idle service and the terminal loop are derived from Omarchy's own
(MIT). Stelline is named for Ana Stelline, who makes the memories.
