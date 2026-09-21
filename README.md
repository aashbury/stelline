# Stelline

A native screensaver manager for [Omarchy](https://omarchy.org) 4 (Quattro).

Stelline keeps Omarchy's own screensaver as the default and adds to it — your
branding redrawn in the theme's colours, a digital clock, nothing at all, or
**your own**: whatever you copied, pictures, a folder
of them, a video clip, some text, or a description, turned into ASCII art in your theme's colours (or
shown as they are). A grid of tiles, one click to choose, and a rule per tile —
at night, on battery, with a theme — for when each one plays. Timings, a
shuffle, and a quiet corner card that tells you what arrived while you were
away and whether an agent is waiting for you. Until you choose otherwise,
what plays is the stock screensaver, untouched.

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
glyph, same hotkey. **Put the old one back**, under Shortcuts, restores the list exactly.

Requires Omarchy 4.x. Stelline's id is `io.github.aashbury.stelline`.

## Use

The panel is ordered by how often you touch a thing: the master switch and
**Stay awake** at the top, then the two timings, then the gallery, then the
rows you set once (Rules, While you're away, Shortcuts) collapsed to one line
each. A gallery past four rows keeps four and ends in a **Show all** tile.

| Where | Action | Effect |
|---|---|---|
| bar icon | left-click | open the panel |
| bar icon | right-click | toggle Stay awake (the coffee cup) |
| bar icon | middle-click | preview the current saver |
| panel | click a tile | make it the usual saver (with Shuffle on: check it in) |
| panel | ⚙ on a tile | when it plays, how it looks, delete; for Wordmark and Original also the artwork |
| panel | 󰅶 Stay awake | the coffee cup — top of the panel, same as Super+Ctrl+I |
| panel | ▶ on a tile | preview it |
| panel | the **Add** tile | a new saver from the clipboard, pictures, a folder, a clip, text or a description |
| saver | any key, click, wheel or pointer movement | dismiss |
| saver | `→` or `n` | next saver in the rotation |

Keyboard in the panel: `h`/`j`/`k`/`l` or arrows move (through the grid too),
`Enter` activates, `h`/`l` also step a slider, `p` previews the tile under the
cursor, `g` opens it, `n` adds, `s` toggles Shuffle, `x`
deletes (twice for a saver, once for a rule), `Esc` closes. Fields inside
editors take the mouse.

A hotkey, if you want one, goes in `~/.config/hypr/bindings.lua`:

```lua
o.bind("SUPER + CTRL + S", "Screensaver", "omarchy-shell stelline preview")
```

Shortcuts can also point *System › Screensaver* (`Super+Esc`) at
Stelline. That edits `~/.config/omarchy/extensions/omarchy-menu.jsonc` by
inserting two marked lines before the final brace; it refuses to touch a file
that does not parse, and the toggle removes exactly those lines again.

## Savers

| | |
|---|---|
| **Original** | Omarchy's own screensaver, exactly as it ships and the default: `ttfx` in your terminal, cycling through its 37 effects at random. Choose a subset in ⚙ — with a choice, Stelline starts the terminal itself running a copy of Omarchy's loop with `--include-effects`; without, it runs the stock launcher untouched. Its ⚙ also has the same three artwork edits as *Style › Screensaver* (a picture, the text, back to the logo). |
| **Wordmark** | A word you type — **Text** in its ⚙, `stelline` to begin with — drawn by Stelline instead of `ttfx`: whole-pixel cells in the theme's foreground colour, with one of **fourteen animations of Stelline's own** every few seconds — `decrypt`, `rain`, `beams`, `scatter`, `wipe`, `typewriter`, `reveal`, `pulse`, and six that assemble the art rather than fade it in: `scanline` (a bright bar sweeps down), `grid` (a lattice snaps in, then fills), `shockwave` (an expanding ring), `slit` (opens from one column and widens), `glitch` (bands tear sideways and lock back), `dust` (particles drift in and converge). They are not Omarchy's 37 — those run only inside `ttfx`, so only the Original has them. What you get instead is the cost: almost nothing, against several cores. Clear the field and it shows Omarchy's shared artwork instead, the same file the Original plays. |
| **Clock** | Seven-segment digits built from block characters, the colon blinking in the accent, the date in small wide-tracked capitals beneath. Repaints only when the text changes. |
| **Blank** | Black. Exists so a battery rule has somewhere free to point. |

It is a screensaver, so it does not settle and stop: an animation plays, the
art rests for **Rest between** seconds (four by default, `0` for never still),
and the next one starts — landing a few pixels off the last, which is the
burn-in drift as well. A cycle costs about a tenth of a core while it runs and
nothing while it rests.

Colours are the theme's, never invented: settled art in the foreground colour,
the glyphs still in flight in the accent, and `pulse` breathing between the
two. Plenty of Omarchy themes set the accent *to* the foreground, which would
leave the motion one flat colour — on those the muted tone stands in, so an
animation always reads as an animation. The font is the shell's monospace font.

**A saver's settings follow its type**, so two savers of the same kind are
configured the same way whether they shipped with Stelline or you made them.
A **wordmark** — the built-in one, or anything you make from *Add › Some text*
— has a **Text** field: type a different word and it is redrawn. **Pictures**
get a fit and a crossfade, an **animation** gets a frame rate, the **Original**
gets Omarchy's effects. Nothing is hardcoded; the built-in wordmark is simply
defaulted to `Stelline` so there is something to look at on day one.

**Which animations play** is one control in a saver's ⚙, for Stelline's
fourteen and Omarchy's thirty-seven alike: **Everything**, or a mood —
**Calm** (quiet reveals), **Neon** (decode and CRT), **Kinetic** (motion and
particles). A mood is just a set of effects, so *Choose individually* under it
opens the full list and ticking your own is still there; the moods together
are exactly the whole list, and nothing extra is stored either way.

### Your own

The **Add** tile makes a saver from:

| From | You pick | Becomes |
|---|---|---|
| **Paste** | nothing — it takes what you copied: a screenshot, a picture file, or a folder. Offered only when the clipboard holds one | ASCII art in theme colours, exactly as the rows below |
| **Pictures** | one or more files (the desktop file chooser) | ASCII art in theme colours, one piece per picture, played as a slideshow with the effects above — or the pictures as they are, crossfading |
| **A folder of pictures** | a folder | the same, and a folder shown as-is is read live: drop a picture in, it joins |
| **A video or GIF** | one file | an ASCII animation, frame by frame (the first 20 s at 10 fps) — or the clip as it is, as an animated picture |
| **Some text** | you type it | big letters as block art — a wordmark of your own, with the same **Text** field in its ⚙ afterwards |
| **A description** | you describe it | ASCII art, still or an animation loop, drawn by your **default coding agent** (`omarchy default agent` — Claude Code, Codex, Gemini, OpenCode, Copilot, Crush, Pi, Oh My Pi or Grok), each in its one-shot mode with tools off or read-only where it has such a switch. Claude Code if no default is set; the Claude API with `ANTHROPIC_API_KEY` as a last resort. Shown only when one of those is there. |

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
{ "name": "Acme Co.", "kind": "ascii", "pieces": ["001.txt", "002.txt"], "play": "slideshow",
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
service cannot do that). The switch at the top of the panel *is* Omarchy's own
screensaver toggle — the same flag as *Trigger › Toggle › Screensaver* and
`omarchy toggle screensaver` — so the two never disagree: off means no idle
screensaver, lock left alone, previews still work, as in stock.

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

So a clip for the evenings and a set of company logos for the working day is
two tiles: give the clip a night rule from 17:00 to 08:30 and click the logos.

One rule per tile; when two tiles' rules hold at once, the older rule wins.
The Rules row lists every rule in that order, together with any rule that
only changes the timings (say, a shorter screensaver on battery) — those are
added there. Nothing in the package is anyone's content: the built-ins draw
your own branding file, the clock, rain, or nothing; every other saver is one
you made. Nothing ships enabled, so a fresh install behaves exactly like
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
omarchy-shell stelline set64 shuffleFrom "$(printf '["clock","blank"]' | base64 -w0)"
```

Defaults:

```json
{ "saver": "terminal", "shuffle": false, "shuffleFrom": ["wordmark", "clock"],
  "screensaverEnabled": true, "lockEnabled": true,
  "savers": { "wordmark": { "effect": "cycle", "effects": [], "holdSec": 15, "background": "theme" },
              "clock": { "format": "HH:mm", "showDate": true, "showSeconds": false },
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
<id>`, `rescan`, `pick <images|folder|video>`, `cancelAdd`, `finishSetup`, `undoSetup`,
`setMenuEntry <on|off>`, `branding <image|text|reset>` (the artwork edits),
`simulateIdle`, `simulateLock [dry-run|off|real]`,
`reloadCard`, `ping`.

```sh
omarchy-shell stelline import64 "$(printf '%s' '{"source":"text","text":"Acme Co.","style":"ascii"}' | base64 -w0)"
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
- A described saver needs a default coding agent (`omarchy default agent`),
  Claude Code, or `ANTHROPIC_API_KEY`; the Add card hides the option otherwise
  and names who it will ask. The agent is asked at low effort where it takes
  that switch (at the default a model deliberates over the grid spec for
  minutes); an animation takes a minute or two. The art is read between marker
  lines the prompt asks for, so an agent's own chatter cannot end up in a
  frame. What comes back is only as good as the model's drawing that day.
- Pinned-effect terminal launching on more than one monitor follows the stock
  launcher's sequence but has only been tested on one.
- Disabling the plugin leaves a harmless `{ "id": "omarchy.idle" }` entry in the
  bar layout (Omarchy writes it when restoring a clone; it renders nothing).
  `omarchy plugin enable` turns it back into Stelline's entry; after a real
  uninstall remove it by hand if you like:
  `jq 'del(.bar.layout[][] | select(type=="object" and .id=="omarchy.idle"))' ~/.config/omarchy/shell.json | sponge ~/.config/omarchy/shell.json`

## Uninstall

```sh
# in the panel: Shortcuts › Put the old one back   (or: omarchy-shell stelline undoSetup)
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
