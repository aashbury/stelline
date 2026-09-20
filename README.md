# Stelline

A native screensaver manager for [Omarchy](https://omarchy.org) 4 (Quattro).

Stelline draws the screensaver inside the Omarchy shell — your branding in the
theme's colours, a clock, digital rain, or nothing at all — with a picker, a
shuffle, timings, rules for battery, night-time and theme, and a quiet corner
card that tells you what arrived while you were away and whether an agent is
waiting for you. The stock terminal screensaver stays available, with the
`ttfx` effects you pin.

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
| panel | click a saver | make it the one |
| panel | ⚙ on a saver | its settings |
| panel | ▶ on a saver | preview it |
| saver | any key, click, wheel or pointer movement | dismiss |
| saver | `→` or `n` | next saver in the rotation |

Keyboard in the panel: `j`/`k` or arrows move, `Enter` activates, `h`/`l` step
a slider, `p` previews the saver under the cursor, `g` opens its settings,
`s` toggles Shuffle, `a` opens Advanced, `x` deletes the situation under the
cursor, `Esc` closes. Fields inside editors take the mouse.

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
| **Wordmark** | `~/.config/omarchy/branding/screensaver.txt` — the same art the stock screensaver shows, set through *Style › Screensaver* — drawn as whole-pixel cells in the theme's foreground colour, with `reveal`, `typewriter` and `pulse` effects (`cycle` rotates them). Edits show up live. |
| **Clock** | Time and date in the terminal font; repaints once a minute unless you turn seconds on. |
| **Matrix rain** | Heads in the foreground colour, trails in the accent; density, frame rate and glyph set are settings. Frame rate halves on battery. |
| **Blank** | Black. Exists so a battery rule has somewhere free to point. |
| **Terminal** | The stock `ttfx` screensaver in your terminal. Pin any subset of its 37 effects in ⚙ — with pins, Stelline starts the terminal itself running a copy of Omarchy's loop with `--include-effects`; without, it runs the stock launcher untouched. |

Every saver drifts a few pixels every half minute. Colours follow the theme
live; the font is the shell's monospace font.

## Timings and stages

The sliders write `idle.screensaver` and `idle.lock` in
`~/.config/omarchy/shell.json` — the same keys the stock service reads, so
nothing forks. Both are seconds from the moment you went idle. The lock switch
is Stelline's own: off keeps the screensaver and never locks on idle (the stock
service cannot do that). The hero toggle turns the screensaver stage off while
leaving the lock alone. `omarchy toggle screensaver` is honoured for the idle
screensaver and ignored by previews, as in stock.

## Situations

Rules, first enabled match wins. Each can override the saver, the screensaver
timeout, and the lock timeout (or never lock).

| Condition | Matches when |
|---|---|
| On battery | unplugged, optionally only below a percentage |
| Night | the clock is inside a window, wrapping midnight |
| Theme | `~/.local/state/omarchy/current/theme.name` equals the chosen slug |

Three examples ship **disabled** so a fresh install behaves exactly like stock.
Unknown condition types never match, so a rule written by a newer version is
inert on an older one.

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
  "savers": { "wordmark": { "effect": "cycle", "effects": ["reveal", "typewriter", "pulse"], "holdSec": 15, "background": "theme" },
              "clock": { "format": "HH:mm", "showDate": true, "showSeconds": false },
              "matrix": { "density": 0.6, "fps": 15, "glyphs": "katakana" },
              "blank": {}, "terminal": { "effects": [] } },
  "situations": [], "card": { "enabled": true, "corner": "bottom-right", "detail": "counts", "showAgent": true, "maxApps": 4 },
  "integration": { "menuEntry": false } }
```

## IPC

`omarchy-shell stelline <method>`: `status`, `preview [saver]`, `show`, `hide`,
`next`, `mini [saver]` / `hideMini` (a small corner preview that takes no
focus), `list`, `get`, `set`, `set64`, `setSaver`, `toggleShuffle`,
`setStage <screensaver|lock> <on|off>`, `setTimeout <stage> <seconds>`,
`toggleStayAwake`, `finishSetup`, `undoSetup`, `setMenuEntry <on|off>`,
`simulateIdle`, `simulateLock [dry-run|off|real]`, `reloadCard`, `ping`.

`omarchy-shell idle status|enable|disable|toggle` keep working exactly as with
the stock service; `status` reports `"clone": "stelline"`.

## Known limits

- *Style › Screensaver* edits still open the stock terminal preview afterwards
  (`omarchy-branding-screensaver` calls the launcher itself). The art shows
  up in Stelline's Wordmark live; use the panel's Preview to see it.
- Fields inside situation and saver editors are mouse-driven; rows are keyboard-navigable.
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
event.

## Licence

MIT. The idle service and the terminal loop are derived from Omarchy's own
(MIT). Stelline is named for Ana Stelline, who makes the memories.
