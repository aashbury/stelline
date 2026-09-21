// Pure JavaScript for the Stelline plugin: settings shape, the saver
// registry, and the rules ("situations") evaluator. No QML types in here, so
// every function runs under `node --test tests/` as well as inside the shell.

var PLUGIN_ID = "io.github.aashbury.stelline"

// Static saver metadata. The picker reads this list; savers are only
// instantiated by the overlay when they are actually shown.
var SAVERS = [
  // `meta` is the line under the name on a tile with no rule to report, so
  // it has to fit a tile: about twenty characters.
  { id: "wordmark", name: "Wordmark", glyph: "󰊄", meta: "your art, redrawn", file: "savers/Wordmark.qml", kind: "native" },
  { id: "clock",    name: "Clock",    glyph: "󰥔", meta: "time and date", file: "savers/Clock.qml",    kind: "native" },
  { id: "matrix",   name: "Matrix rain", glyph: "󰘨", meta: "falling glyphs", file: "savers/Matrix.qml", kind: "native" },
  { id: "blank",    name: "Blank",    glyph: "󰹏", meta: "black, saves power", file: "savers/Blank.qml",  kind: "native" },
  { id: "terminal", name: "Original", glyph: "󰆍", meta: "Omarchy's own", file: "", thumb: "savers/Wordmark.qml", kind: "external" }
]

// Every saver the user can pick: the built-ins, then their own (imported
// pictures, clips, text and generated art — "series"). User savers are
// passed in explicitly: QML gives each importer of this file its own copy,
// so module state would not be shared between the service and the panel.
function allSavers(userSavers) {
  return SAVERS.concat(Array.isArray(userSavers) ? userSavers : [])
}

function saverById(id, userSavers) {
  var list = allSavers(userSavers)
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return null
}

function saverFile(id, userSavers) {
  var s = saverById(id, userSavers)
  return s ? s.file : ""
}

function isNativeSaver(s) {
  return !!s && (s.kind === "native" || s.kind === "series")
}

// The savers the overlay may step through with Right / `n`: the shuffle set
// when shuffle is on, otherwise every native saver. Terminal is never in the
// rotation — it lives in its own window. Savers still importing are skipped.
function rotation(cfg, userSavers) {
  var natives = allSavers(userSavers).filter(function(s) { return isNativeSaver(s) && !(s.series && s.series.importing) }).map(function(s) { return s.id })
  if (cfg && cfg.shuffle && Array.isArray(cfg.shuffleFrom)) {
    var picked = cfg.shuffleFrom.filter(function(id) { return natives.indexOf(id) !== -1 })
    if (picked.length) return picked
  }
  return natives
}

function nextSaver(cfg, current, userSavers) {
  var ids = rotation(cfg, userSavers)
  var at = ids.indexOf(current)
  return ids[(at + 1) % ids.length]
}

function defaults() {
  return {
    saver: "wordmark",
    shuffle: false,
    shuffleFrom: ["wordmark", "clock", "matrix"],
    screensaverEnabled: true,
    lockEnabled: true,
    savers: {
      wordmark: { effect: "cycle", effects: ["reveal", "typewriter", "pulse"], holdSec: 15, background: "theme" },
      clock: { format: "HH:mm", showDate: true, showSeconds: false },
      matrix: { density: 0.6, fps: 15, glyphs: "katakana" },
      blank: {},
      terminal: { effects: [] }
    },
    situations: [],
    card: { enabled: true, corner: "bottom-right", detail: "counts", showAgent: true, maxApps: 4 },
    integration: { menuEntry: false },
    setup: { done: false, version: 0, indicatorsItemsBefore: null }
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

function cloneJson(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v))
}

// The widget's inline entry in shell.json: `bar.layout.<section>[i]` with our
// id, or (if the widget was taken off the bar) a `plugins[]` entry. Entries can
// also be bare id strings, which carry no settings.
function findEntry(config, id) {
  if (!isPlainObject(config)) return null
  var key = String(id || PLUGIN_ID)
  if (isPlainObject(config.bar) && isPlainObject(config.bar.layout)) {
    var sections = ["left", "center", "right"]
    for (var s = 0; s < sections.length; s++) {
      var list = config.bar.layout[sections[s]]
      if (!Array.isArray(list)) continue
      for (var i = 0; i < list.length; i++) {
        var entry = list[i]
        if (isPlainObject(entry) && String(entry.id) === key) return entry
        if (typeof entry === "string" && entry === key) return { id: key }
      }
    }
  }
  if (Array.isArray(config.plugins)) {
    for (var p = 0; p < config.plugins.length; p++) {
      var pe = config.plugins[p]
      if (isPlainObject(pe) && String(pe.id) === key) return pe
      if (typeof pe === "string" && pe === key) return { id: key }
    }
  }
  return null
}

// `omarchy bar set` without --json writes strings, so scalars are coerced
// against the default's type.
function coerce(value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof fallback === "boolean") {
    if (typeof value === "boolean") return value
    var s = String(value).trim().toLowerCase()
    return s === "true" || s === "1" || s === "yes" || s === "on"
  }
  if (typeof fallback === "number") {
    var n = Number(value)
    return isFinite(n) ? n : fallback
  }
  if (Array.isArray(fallback)) return Array.isArray(value) ? value : fallback
  if (isPlainObject(fallback)) return isPlainObject(value) ? value : fallback
  return String(value)
}

// Deep merge of an entry onto the defaults: objects merge one level down
// (per-saver settings), arrays replace, scalars coerce.
function mergeSettings(entry, userSavers) {
  var out = defaults()
  var src = isPlainObject(entry) ? entry : {}
  for (var key in out) {
    if (!(key in src)) continue
    var fallback = out[key]
    if (isPlainObject(fallback) && isPlainObject(src[key]) && key !== "setup") {
      for (var sub in src[key]) {
        var subFallback = fallback[sub]
        if (isPlainObject(subFallback) && isPlainObject(src[key][sub])) {
          var merged = cloneJson(subFallback)
          for (var leaf in src[key][sub]) merged[leaf] = coerce(src[key][sub][leaf], subFallback[leaf])
          fallback[sub] = merged
        } else if (subFallback === undefined && key === "savers" && isPlainObject(src[key][sub])) {
          // A user saver's knobs: no static default to coerce against.
          fallback[sub] = cloneJson(src[key][sub])
        } else {
          fallback[sub] = coerce(src[key][sub], subFallback)
        }
      }
    } else {
      out[key] = coerce(src[key], fallback)
    }
  }
  // An unknown default saver (typo, or a user saver deleted from disk) falls
  // back to the wordmark — but only once the user savers are known.
  if (!saverById(out.saver, userSavers)) out.saver = "wordmark"
  return out
}

// The full inline entry to hand to shell.updateEntryInline, which replaces the
// entry wholesale: current merged settings with `patch` applied on top.
function fullSettings(cfg, patch) {
  var next = cloneJson(cfg)
  var p = isPlainObject(patch) ? patch : {}
  for (var key in p) next[key] = cloneJson(p[key])
  next.id = PLUGIN_ID
  return next
}

// ttfx 0.3.2's effects, for the terminal passthrough's pin list.
var TTFX_EFFECTS = [
  "beams", "binarypath", "blackhole", "bouncyballs", "bubbles", "burn", "colorshift", "crumble",
  "decrypt", "errorcorrect", "expand", "fireworks", "highlight", "laseretch", "matrix", "middleout",
  "orbittingvolley", "overflow", "pour", "print", "rain", "randomsequence", "rings", "scattered",
  "slice", "slide", "smoke", "spotlights", "spray", "swarm", "sweep", "synthgrid", "thunderstorm",
  "unstable", "vhstape", "waves", "wipe"
]

// ---- situations -----------------------------------------------------------

function hhmm(text) {
  var m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text || ""))
  if (!m) return -1
  var h = Number(m[1]), mi = Number(m[2])
  if (h > 23 || mi > 59) return -1
  return h * 60 + mi
}

// Minute-of-day inside [from, to), wrapping midnight when to <= from.
function inWindow(minute, from, to) {
  if (from < 0 || to < 0) return false
  if (from === to) return true
  if (from < to) return minute >= from && minute < to
  return minute >= from || minute < to
}

// Each condition gets its own config object and the live context; unknown
// condition types never match, so an entry written by a newer version is
// inert on an older one.
var CONDITIONS = {
  battery: function(c, ctx) {
    if (!ctx.onBattery) return false
    if (c && c.below !== undefined && c.below !== null && c.below !== "") {
      var below = Number(c.below)
      if (!isFinite(below)) return false
      return ctx.batteryPercent >= 0 && ctx.batteryPercent < below
    }
    return true
  },
  night: function(c, ctx) {
    return inWindow(ctx.minuteOfDay, hhmm(c && c.from), hhmm(c && c.to))
  },
  theme: function(c, ctx) {
    var want = c && c.name ? String(c.name).trim().toLowerCase() : ""
    var have = ctx.themeName ? String(ctx.themeName).trim().toLowerCase() : ""
    return want !== "" && want === have
  }
}

function situationMatches(s, ctx) {
  if (!isPlainObject(s) || s.enabled !== true || !isPlainObject(s.when)) return false
  var keys = Object.keys(s.when)
  if (keys.length === 0) return false
  for (var i = 0; i < keys.length; i++) {
    var test = CONDITIONS[keys[i]]
    if (typeof test !== "function") return false
    if (!test(s.when[keys[i]], ctx || {})) return false
  }
  return true
}

// First enabled match wins; null when nothing applies.
function activeSituation(list, ctx) {
  if (!Array.isArray(list)) return null
  for (var i = 0; i < list.length; i++) if (situationMatches(list[i], ctx)) return list[i]
  return null
}

function conditionLabel(key, c) {
  if (key === "battery") {
    var b = c && c.below
    return b !== undefined && b !== null && Number(b) < 100 ? "Battery below " + Number(b) + "%" : "On battery"
  }
  if (key === "night") return "Night " + ((c && c.from) || "?") + "–" + ((c && c.to) || "?")
  if (key === "theme") return "Theme " + ((c && c.name) || "?")
  return key
}

// Every condition of a rule, joined — they all have to hold.
function situationLabel(s) {
  if (!isPlainObject(s) || !isPlainObject(s.when)) return ""
  var keys = Object.keys(s.when)
  if (keys.length === 0) return ""
  return keys.map(function(k) { return conditionLabel(k, s.when[k]) }).join(" · ")
}

function situationEffect(s, userSavers) {
  if (!isPlainObject(s)) return ""
  var parts = []
  var saver = s.saver ? saverById(s.saver, userSavers) : null
  if (saver) parts.push(saver.name)
  var hasScr = s.screensaver !== undefined && s.screensaver !== null && s.screensaver !== ""
  var hasLock = s.lock !== undefined && s.lock !== null && s.lock !== ""
  if (hasScr || hasLock) {
    var scr = hasScr ? mmss(s.screensaver) : "—"
    var lock = hasLock ? (s.lock === "never" ? "never" : mmss(s.lock)) : "—"
    parts.push(scr + " / " + lock)
  }
  return parts.join(" · ")
}

function mmss(seconds) {
  var n = Math.max(0, Math.round(Number(seconds) || 0))
  var m = Math.floor(n / 60), r = n % 60
  return m + ":" + (r < 10 ? "0" : "") + r
}

// ---- status card ------------------------------------------------------------

// Omarchy mirrors every toast to a one-line JSON file, and moves it into
// history/ when it leaves the screen. Group what is worth knowing about by
// app: live toasts always count, history only since `sinceMs`.
function digest(ndjson, sinceMs, maxApps) {
  var groups = {}
  var lines = String(ndjson || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (line === "") continue
    var n
    try { n = JSON.parse(line) } catch (e) { continue }
    if (!isPlainObject(n)) continue
    var ts = Number(n.timestamp) || 0
    if (n.__history === true && ts < (Number(sinceMs) || 0)) continue
    var app = displayAppName(n.app)
    var g = groups[app]
    if (!g) g = groups[app] = { app: app, count: 0, urgency: 0, glyph: "", latestSummary: "", latestBody: "", latestTs: 0 }
    g.count += 1
    g.urgency = Math.max(g.urgency, Number(n.urgency) || 0)
    if (ts >= g.latestTs) {
      g.latestTs = ts
      g.latestSummary = String(n.summary || "")
      g.latestBody = String(n.body || "").replace(/\s+/g, " ").trim()
      if (n.glyph) g.glyph = String(n.glyph)
    }
  }
  var out = Object.keys(groups).map(function(k) { return groups[k] })
  out.sort(function(a, b) { return (b.urgency - a.urgency) || (b.latestTs - a.latestTs) })
  var cap = Number(maxApps) > 0 ? Number(maxApps) : 4
  return out.slice(0, cap)
}

// Omarchy's own toasts arrive under an internal sender name.
function displayAppName(app) {
  var a = String(app || "").trim()
  if (a === "" || a === "unknown") return "unknown"
  if (a === "omarchy-action" || a === "omarchy") return "Omarchy"
  return a
}

function totalCount(groups) {
  var n = 0
  for (var i = 0; i < (groups || []).length; i++) n += groups[i].count
  return n
}

// ---- terminal passthrough -----------------------------------------------------

// The stock omarchy-screensaver loop, with the pinned effects passed to ttfx.
// Runs inside the terminal window; the window keeps the stock class so the
// idle service's tracking and omarchy-system-lock's cleanup apply unchanged.
// exit_screensaver drops its own traps first: the stock script re-enters on
// the SIGHUP its own pkill sends it, until bash overflows (upstream #8386).
function terminalLoop(effects) {
  var pinned = (Array.isArray(effects) ? effects : []).filter(function(e) { return TTFX_EFFECTS.indexOf(e) !== -1 })
  var include = pinned.length ? " --include-effects " + pinned.join(" ") : ""
  return [
    "#!/bin/bash",
    "# Generated by Stelline from Omarchy's omarchy-screensaver; do not edit.",
    "screensaver_in_focus() { hyprctl activewindow -j | jq -e '.class == \"org.omarchy.screensaver\"' >/dev/null 2>&1; }",
    "exit_screensaver() {",
    "  trap - SIGINT SIGTERM SIGHUP SIGQUIT",
    "  hyprctl eval 'hl.config({ cursor = { invisible = false } })' &>/dev/null || hyprctl keyword cursor:invisible false &>/dev/null || true",
    "  pkill -x ttfx 2>/dev/null",
    "  pkill -f '[o]rg.omarchy.screensaver' 2>/dev/null",
    "  exit 0",
    "}",
    "trap exit_screensaver SIGINT SIGTERM SIGHUP SIGQUIT",
    "printf '\\033]11;rgb:00/00/00\\007'",
    "hyprctl eval 'hl.config({ cursor = { invisible = true } })' &>/dev/null || hyprctl keyword cursor:invisible true &>/dev/null",
    "tty=$(tty 2>/dev/null)",
    "deadline=$((SECONDS + 2))",
    "while ((SECONDS < deadline)) && [[ $(stty size 2>/dev/null) == \"24 80\" ]]; do sleep 0.02; done",
    "while true; do",
    "  ttfx -i ~/.config/omarchy/branding/screensaver.txt --frame-rate 120 --canvas-width 0 --canvas-height 0 --reuse-canvas --anchor-canvas c --anchor-text c --random-effect" + include + " --no-eol --no-restore-cursor &",
    "  while pgrep -t \"${tty#/dev/}\" -x ttfx >/dev/null; do",
    "    if read -n1 -t 1 || ! screensaver_in_focus; then exit_screensaver; fi",
    "  done",
    "done",
    ""
  ].join("\n")
}

// The stock launcher's per-terminal argv, running our loop instead of
// omarchy-screensaver. `terminalId` is what `xdg-terminal-exec --print-id` says.
function terminalArgv(terminalId, omarchyPath, loopPath) {
  var id = String(terminalId || "").toLowerCase()
  var base = String(omarchyPath || "/usr/share/omarchy")
  if (id.indexOf("alacritty") !== -1) return ["alacritty", "--class=org.omarchy.screensaver", "--config-file", base + "/default/alacritty/screensaver.toml", "-e", "bash", loopPath]
  if (id.indexOf("ghostty") !== -1) return ["ghostty", "--class=org.omarchy.screensaver", "--config-file=" + base + "/default/ghostty/screensaver", "--font-size=18", "-e", "bash", loopPath]
  if (id.indexOf("foot") !== -1) return ["foot", "--app-id=org.omarchy.screensaver", "--config=" + base + "/default/foot/screensaver.ini", "bash", loopPath]
  if (id.indexOf("kitty") !== -1) return ["kitty", "--class=org.omarchy.screensaver", "--override", "font_size=18", "--override", "window_padding_width=0", "-e", "bash", loopPath]
  return null
}

function shellQuote(arg) {
  return "'" + String(arg).replace(/'/g, "'\\''") + "'"
}

// ---- finish setup --------------------------------------------------------------

var DEFAULT_INDICATOR_ITEMS = ["Dictation", "ScreenRecording", "Reminder", "NightLight", "Dnd", "StayAwake"]

function indicatorEntryId(item) {
  if (typeof item === "string") return item
  return isPlainObject(item) && item.id !== undefined ? String(item.id) : ""
}

function stayAwakeIndicatorShown(config) {
  if (!isPlainObject(config) || !isPlainObject(config.bar) || !isPlainObject(config.bar.layout)) return false
  var sections = ["left", "center", "right"]
  for (var s = 0; s < sections.length; s++) {
    var list = config.bar.layout[sections[s]]
    if (!Array.isArray(list)) continue
    for (var i = 0; i < list.length; i++) {
      var entry = list[i]
      var id = typeof entry === "string" ? entry : (isPlainObject(entry) ? String(entry.id || "") : "")
      if (id !== "omarchy.indicators") continue
      var items = isPlainObject(entry) && Array.isArray(entry.items) && entry.items.length ? entry.items : DEFAULT_INDICATOR_ITEMS
      for (var k = 0; k < items.length; k++) if (indicatorEntryId(items[k]) === "StayAwake") return true
    }
  }
  return false
}

// Mutates `config` in place: removes StayAwake from every indicators entry and
// records what was there on the plugin entry. Returns true when anything changed.
function applyFinishSetup(config, pluginId) {
  if (!isPlainObject(config) || !isPlainObject(config.bar) || !isPlainObject(config.bar.layout)) return false
  var before = null, changed = false
  var sections = ["left", "center", "right"]
  for (var s = 0; s < sections.length; s++) {
    var list = config.bar.layout[sections[s]]
    if (!Array.isArray(list)) continue
    for (var i = 0; i < list.length; i++) {
      var entry = list[i]
      var id = typeof entry === "string" ? entry : (isPlainObject(entry) ? String(entry.id || "") : "")
      if (id !== "omarchy.indicators") continue
      if (typeof entry === "string") { entry = { id: id }; list[i] = entry }
      var had = Array.isArray(entry.items) && entry.items.length ? entry.items : null
      if (before === null) before = had ? cloneJson(had) : null
      var source = had || DEFAULT_INDICATOR_ITEMS
      var next = source.filter(function(item) { return indicatorEntryId(item) !== "StayAwake" })
      if (next.length !== source.length || !had) { entry.items = next; changed = true }
    }
  }
  var ours = findEntry(config, pluginId)
  if (ours && ours !== null) {
    var prev = isPlainObject(ours.setup) ? ours.setup : {}
    ours.setup = { done: true, version: 1, indicatorsItemsBefore: prev.done === true ? prev.indicatorsItemsBefore : before }
    changed = true
  }
  return changed
}

function applyUndoSetup(config, pluginId) {
  var ours = findEntry(config, pluginId)
  if (!ours || !isPlainObject(ours.setup) || ours.setup.done !== true) return false
  var before = ours.setup.indicatorsItemsBefore
  var sections = ["left", "center", "right"]
  for (var s = 0; s < sections.length; s++) {
    var list = config.bar.layout[sections[s]]
    if (!Array.isArray(list)) continue
    for (var i = 0; i < list.length; i++) {
      var entry = list[i]
      if (!isPlainObject(entry) || String(entry.id || "") !== "omarchy.indicators") continue
      if (Array.isArray(before) && before.length) entry.items = cloneJson(before)
      else delete entry.items
    }
  }
  ours.setup = { done: false, version: 0, indicatorsItemsBefore: null }
  return true
}

// ---- menu override (jsonc) ------------------------------------------------------

var MENU_MARKER = "// stelline: System > Screensaver opens Stelline (Finish setup)"
var MENU_ENTRY = '"system.screensaver": {"action": "omarchy-shell stelline show"},'

// Omarchy's reader strips whole-line // comments and trailing commas; mirror it.
function jsoncParse(text) {
  var lines = String(text || "").split("\n").filter(function(line) { return !/^\s*\/\//.test(line) })
  var body = lines.join("\n").replace(/,(\s*[}\]])/g, "$1")
  return JSON.parse(body)
}

function menuHasOverride(text) {
  return String(text || "").indexOf(MENU_MARKER) !== -1
}

// Insert the marker and entry before the final closing brace. Returns the new
// text, or null when the file does not parse before or after (so a bad edit
// can never blank out the user's other entries).
function menuInsertOverride(text) {
  var src = String(text || "")
  if (menuHasOverride(src)) return src
  var trimmed = src.trim()
  if (trimmed === "") trimmed = "{\n}"
  try { jsoncParse(trimmed) } catch (e) { return null }
  var close = trimmed.lastIndexOf("}")
  if (close === -1) return null
  var head = trimmed.substring(0, close).replace(/\s+$/, "")
  var next = head + "\n  " + MENU_MARKER + "\n  " + MENU_ENTRY + "\n}\n"
  try { var parsed = jsoncParse(next); if (!parsed["system.screensaver"]) return null } catch (e2) { return null }
  return next
}

function menuRemoveOverride(text) {
  var src = String(text || "")
  if (!menuHasOverride(src)) return src
  var lines = src.split("\n").filter(function(line) {
    var t = line.trim()
    return t !== MENU_MARKER && t !== MENU_ENTRY
  })
  var next = lines.join("\n")
  try { jsoncParse(next) } catch (e) { return null }
  return next
}

function secondsFromConfig(value, fallback) {
  var n = Number(value)
  if (!isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

// A lock that never fires still needs a number for the timer maths; this is
// under Timer's 32-bit millisecond ceiling and is never actually scheduled.
var NEVER_SECONDS = 2147483

// The timeouts and stage switches in force right now: shell.json's top-level
// idle block, the plugin's own switches, and whatever the active situation
// overrides. Lock is "never" when the switch is off or the situation says so.
function effectiveTimeouts(idle, cfg, situation) {
  var idleBlock = isPlainObject(idle) ? idle : {}
  var c = cfg || defaults()
  var s = isPlainObject(situation) ? situation : null
  var screensaver = s && isFinite(Number(s.screensaver)) && s.screensaver !== null && s.screensaver !== ""
    ? Math.max(0, Math.floor(Number(s.screensaver)))
    : secondsFromConfig(idleBlock.screensaver, 150)
  var lockRaw = s && s.lock !== undefined && s.lock !== null && s.lock !== "" ? s.lock : secondsFromConfig(idleBlock.lock, 300)
  var never = lockRaw === "never" || c.lockEnabled === false
  var lock = never ? NEVER_SECONDS : Math.max(0, Math.floor(Number(lockRaw)))
  if (!isFinite(lock)) lock = secondsFromConfig(idleBlock.lock, 300)
  return {
    screensaver: screensaver,
    lock: lock,
    screensaverEnabled: c.screensaverEnabled !== false,
    lockEnabled: !never
  }
}

// The IdleMonitor arms at the earliest enabled stage.
function firstTimeout(eff) {
  var candidates = []
  if (eff.screensaverEnabled) candidates.push(eff.screensaver)
  if (eff.lockEnabled) candidates.push(eff.lock)
  if (candidates.length === 0) return NEVER_SECONDS
  return Math.min.apply(null, candidates)
}

// Which saver comes up for this activation. A situation override wins; with
// shuffle on, a random member of the rotation other than the last one shown.
function pickSaver(cfg, situation, last, random, userSavers) {
  var c = cfg || defaults()
  var ready = function(id) { var s = saverById(id, userSavers); return !!s && !(s.series && s.series.importing) }
  if (isPlainObject(situation) && situation.saver && ready(situation.saver)) return situation.saver
  if (!c.shuffle) return ready(c.saver) ? c.saver : "wordmark"
  var ids = rotation(c, userSavers)
  var pool = ids.filter(function(id) { return id !== last })
  if (pool.length === 0) pool = ids
  var r = typeof random === "number" ? random : Math.random()
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))]
}

// ---- user savers ("series") ----------------------------------------------------

// Where the user's own screensavers live, one folder each with a saver.json
// beside the pieces it plays. A folder is a self-contained bundle: copy it to
// another machine and it works there.
var USER_SAVERS_SUBDIR = ".config/omarchy/stelline/savers"

var IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"]
var VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "webm", "avi", "m4v", "gif"]

function extensionOf(path) {
  var m = /\.([A-Za-z0-9]+)$/.exec(String(path || ""))
  return m ? m[1].toLowerCase() : ""
}

function isImagePath(path) { return IMAGE_EXTENSIONS.indexOf(extensionOf(path)) !== -1 }
function isVideoPath(path) { return VIDEO_EXTENSIONS.indexOf(extensionOf(path)) !== -1 && extensionOf(path) !== "gif" }

function baseName(path) {
  var s = String(path || "").replace(/\/+$/, "")
  var at = s.lastIndexOf("/")
  return at === -1 ? s : s.substring(at + 1)
}

function stripExtension(name) {
  return String(name || "").replace(/\.[A-Za-z0-9]+$/, "")
}

// "Acme Co. (2026)" → "acme-co-2026". Built-in ids are reserved.
function slugify(name) {
  var s = String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  if (s === "") s = "saver"
  if (SAVERS.some(function(b) { return b.id === s })) s = s + "-2"
  return s
}

function uniqueId(base, existingIds) {
  var taken = Array.isArray(existingIds) ? existingIds : []
  if (taken.indexOf(base) === -1) return base
  for (var n = 2; n < 1000; n++) if (taken.indexOf(base + "-" + n) === -1) return base + "-" + n
  return base + "-" + Date.now().toString(36)
}

// A name for what was picked: the folder's name, the single file's name, or
// the common folder of several files.
function suggestName(paths, fallback) {
  var list = Array.isArray(paths) ? paths : []
  if (list.length === 0) return fallback || "New saver"
  var raw = list.length === 1 ? stripExtension(baseName(list[0])) : baseName(list[0].substring(0, list[0].lastIndexOf("/")))
  var words = raw.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
  if (words === "") return fallback || "New saver"
  return words.split(" ").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1) }).join(" ")
}

// Frames inside one piece file are separated by form feeds.
function splitFrames(text) {
  var parts = String(text || "").split("\f")
  var out = []
  for (var i = 0; i < parts.length; i++) {
    var t = parts[i].replace(/^\n+/, "").replace(/\s+$/, "")
    if (t !== "") out.push(t)
  }
  return out
}

// One scanner line → a picker entry, or null when the folder is not a saver.
// `row` is what the scan script emits: { dir, json, files, folderFiles, thumb }.
function userSaverFromScan(row) {
  if (!isPlainObject(row) || !isPlainObject(row.json) || typeof row.dir !== "string") return null
  var j = row.json
  var id = baseName(row.dir)
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || SAVERS.some(function(b) { return b.id === id })) return null
  var kind = j.kind === "image" ? "image" : "ascii"
  var files = Array.isArray(row.files) ? row.files : []
  var pieces = []
  if (kind === "image" && typeof j.folder === "string" && j.folder !== "") {
    pieces = (Array.isArray(row.folderFiles) ? row.folderFiles : []).filter(isImagePath)
  } else if (Array.isArray(j.pieces)) {
    for (var i = 0; i < j.pieces.length; i++) {
      var pc = String(j.pieces[i] || "")
      if (pc === "") continue
      pieces.push(pc.charAt(0) === "/" ? pc : row.dir + "/" + pc)
    }
  } else if (kind === "ascii") {
    pieces = files.filter(function(f) { return /\.txt$/.test(f) }).sort().map(function(f) { return row.dir + "/" + f })
  }
  var frames = kind === "ascii" ? splitFrames(row.thumb) : []
  var frameCount = kind === "image" ? pieces.length : Math.max(1, Number(row.frameCount) || pieces.length)
  var name = typeof j.name === "string" && j.name.trim() !== "" ? j.name.trim() : suggestName([row.dir])
  var importing = j.importing === true
  var error = typeof j.error === "string" ? j.error : ""
  var play = j.play === "animation" ? "animation" : "slideshow"
  var meta
  if (importing) meta = "importing…"
  else if (error !== "") meta = "import failed"
  else if (kind === "image") meta = pieces.length === 1 ? (extensionOf(pieces[0]) === "gif" ? "animated picture" : "one picture") : pieces.length + " pictures"
  else if (play === "animation") meta = "ASCII animation"
  else meta = pieces.length === 1 ? "ASCII art" : pieces.length + " ASCII pieces"
  return {
    id: id,
    name: name,
    glyph: kind === "image" ? "󰋩" : (play === "animation" ? "󰕧" : "󰊄"),
    meta: meta,
    file: "savers/Series.qml",
    kind: "series",
    series: {
      dir: row.dir,
      kind: kind,
      pieces: pieces,
      play: play,
      fps: isFinite(Number(j.fps)) && Number(j.fps) > 0 ? Number(j.fps) : 10,
      dwellSec: isFinite(Number(j.dwellSec)) && Number(j.dwellSec) > 0 ? Number(j.dwellSec) : 12,
      frameCount: frameCount,
      importing: importing,
      error: error,
      thumbArt: frames.length ? frames[0] : "",
      thumbImage: kind === "image" && pieces.length ? pieces[0] : "",
      source: isPlainObject(j.source) ? j.source : {}
    }
  }
}

function parseScan(ndjson) {
  var out = []
  var lines = String(ndjson || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim()
    if (line === "") continue
    var row
    try { row = JSON.parse(line) } catch (e) { continue }
    var s = userSaverFromScan(row)
    if (s) out.push(s)
  }
  out.sort(function(a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0) })
  return out
}

// The bash that lists every user saver as one JSON line each. `files` and a
// folder's pictures come along so the panel never has to touch the disk.
function scanScript(rootDir) {
  var root = shellQuote(rootDir)
  return [
    "root=" + root,
    "shopt -s nullglob",
    "for d in \"$root\"/*/; do",
    "  d=${d%/}; f=\"$d/saver.json\"; [[ -f $f ]] || continue",
    "  files=$(ls -1 \"$d\" 2>/dev/null | jq -R . | jq -sc .)",
    "  folder=$(jq -r '.folder // empty' \"$f\" 2>/dev/null)",
    "  folderFiles='[]'",
    "  if [[ -n $folder && -d $folder ]]; then folderFiles=$(find \"$folder\" -maxdepth 1 -type f \\( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' -o -iname '*.svg' -o -iname '*.bmp' -o -iname '*.avif' \\) 2>/dev/null | sort | jq -R . | jq -sc .); fi",
    "  thumb=''; frameCount=0",
    "  if [[ $(jq -r '.kind // \"ascii\"' \"$f\") != image ]]; then",
    "    first=$(jq -r '.pieces[0] // empty' \"$f\" 2>/dev/null); [[ -n $first ]] || first=$(ls -1 \"$d\"/*.txt 2>/dev/null | head -n1)",
    "    [[ $first == /* ]] || first=\"$d/$first\"",
    "    [[ -f $first ]] && thumb=$(head -c 12000 \"$first\")",
    "    frameCount=$(for t in \"$d\"/*.txt; do cat \"$t\" 2>/dev/null; printf '\\f'; done | awk 'BEGIN{RS=\"\\f\"} /[^[:space:]]/{n++} END{print n+0}')",
    "  fi",
    "  jq -c --arg dir \"$d\" --argjson files \"$files\" --argjson folderFiles \"$folderFiles\" --arg thumb \"$thumb\" --argjson frameCount \"${frameCount:-0}\" '{dir:$dir, files:$files, folderFiles:$folderFiles, thumb:$thumb, frameCount:$frameCount, json:.}' \"$f\" 2>/dev/null || echo \"{\\\"dir\\\":$(jq -Rn --arg d \"$d\" '$d'),\\\"json\\\":{\\\"error\\\":\\\"saver.json does not parse\\\"}}\"",
    "done",
    ""
  ].join("\n")
}

// ---- import -----------------------------------------------------------------------

// What the panel collects before Create. `source`: images | folder | video | text | prompt.
// `style`: ascii (theme-coloured text art) | image (the pictures as they are).
function importDefaults() {
  return { id: "", name: "", source: "images", paths: [], text: "", prompt: "", style: "ascii", fps: 10, seconds: 20, animated: true, frames: 12 }
}

// Transcoder geometry: braille cells are 2×4 pixels, so 160×64 cells is a
// 320×256 source — plenty for a screen, cheap to paint.
var ASCII_COLUMNS = 160
var ASCII_ROWS = 64

function metaJson(spec, extra) {
  var j = { name: spec.name, kind: spec.style === "image" ? "image" : "ascii", source: { type: spec.source }, created: Math.floor(Date.now() / 1000) }
  if (spec.source === "images" || spec.source === "video") j.source.paths = spec.paths
  if (spec.source === "folder") j.source.paths = spec.paths
  if (spec.source === "text") j.source.text = spec.text
  if (spec.source === "prompt") j.source.prompt = spec.prompt
  for (var k in (extra || {})) j[k] = extra[k]
  return JSON.stringify(j)
}

// The prompt for a described saver: frames separated by a marker line, so the
// answer parses without depending on any one model's formatting habits.
var FRAME_MARKER = "---FRAME---"
var ART_BEGIN = "===ART==="
var ART_END = "===END==="

function aiPrompt(description, frames) {
  var n = Math.max(1, Math.min(60, Math.round(Number(frames) || 1)))
  var lines = [
    "Make ASCII art for a screensaver. Subject: " + String(description || "").trim(),
    "",
    n > 1
      ? "Produce " + n + " frames of a looping animation. Every frame must be the same size: the same number of lines, every line padded with spaces to the same width, so the frames line up when swapped in place."
      : "Produce one piece.",
    "Use a monospace grid about 60 columns wide and 20 to 28 lines tall. Plain ASCII characters, and Unicode block (█▀▄▌▐░▒▓) and braille (⠁…⣿) characters are all fine; use what draws the subject best.",
    n > 1 ? "Separate frames with a line containing only " + FRAME_MARKER + "." : "",
    "Put a line containing only " + ART_BEGIN + " before the art and a line containing only " + ART_END + " after it. Nothing else: no title, no explanation, no code fences, no tool use — just draw it."
  ]
  return lines.filter(function(l) { return l !== undefined }).join("\n")
}

// Omarchy's default coding agent (`omarchy default agent <name>`), each in
// its one-shot mode with tools off or read-only where the CLI has a switch
// for it. Low effort where it can be asked for: at the default the model
// deliberates over the grid spec for minutes. The answer goes to stdout —
// or to a file for codex, which is quieter that way.
var AGENTS = {
  claude:   { name: "Claude Code",    argv: "claude -p \"$prompt\" --output-format text --tools '' --no-session-persistence --effort low" },
  codex:    { name: "Codex",          argv: "codex exec --skip-git-repo-check --ephemeral -s read-only -c model_reasoning_effort=low -o \"$tmp/last.txt\" \"$prompt\" >/dev/null && cat \"$tmp/last.txt\"" },
  gemini:   { name: "Gemini",         argv: "gemini -p \"$prompt\" -o text --approval-mode plan" },
  opencode: { name: "OpenCode",       argv: "opencode run --pure \"$prompt\"" },
  copilot:  { name: "GitHub Copilot", argv: "copilot -p \"$prompt\" --output-format text" },
  crush:    { name: "Crush",          argv: "crush run -q \"$prompt\"" },
  pi:       { name: "Pi",             argv: "pi -p --no-tools --no-session --no-context-files \"$prompt\"" },
  omp:      { name: "Oh My Pi",       argv: "omp -p --no-tools --no-session \"$prompt\"" },
  grok:     { name: "Grok",           argv: "grok -p \"$prompt\" --permission-mode plan" }
}

function agentName(id) {
  return AGENTS[id] ? AGENTS[id].name : String(id || "")
}

// The bash `case` that runs whichever agent is the default.
function agentCase() {
  var out = ["case \"$agent\" in"]
  for (var id in AGENTS) out.push("  " + id + ") out=$({ timeout 600 env -u CLAUDECODE " + AGENTS[id].argv + "; } 2>\"$tmp/err\" </dev/null) || { out=''; why=$(reason \"$tmp/err\"); } ;;")
  out.push("  *) agent='' ;;", "esac")
  return out
}

// ---- the clipboard ---------------------------------------------------------
//
// A picture on the clipboard is the shortest way to a screensaver: copy a
// screenshot, or copy a file in the file manager, and paste. Two scripts share
// one body — one answers whether there is anything to paste, so the button
// only appears when it would work; the other lands it on disk and prints what
// it found as `kind<TAB>path` lines, the shape the file chooser already returns.
var CLIPBOARD_BASH = [
  "types=$(wl-paste --list-types 2>/dev/null)",
  "pick=$(printf '%s\\n' \"$types\" | grep -m1 -E '^image/(png|jpeg|webp|bmp|tiff|avif)$' || true)",
  "list=''",
  "if [[ -z $pick ]]; then",
  "  if printf '%s\\n' \"$types\" | grep -qx 'text/uri-list'; then list=$(wl-paste --no-newline --type text/uri-list 2>/dev/null | head -n 40)",
  "  elif printf '%s\\n' \"$types\" | grep -q '^text/plain'; then list=$(wl-paste --no-newline 2>/dev/null | head -n 4)",
  "  fi",
  "fi",
  // file:// URIs, percent escapes and a leading ~ all become a real path.
  "unesc() {",
  "  local p=$1",
  "  p=${p%$'\\r'}",
  "  if [[ $p == file://* ]]; then p=${p#file://}; p=$(printf '%b' \"${p//%/\\\\x}\"); fi",
  "  if [[ $p == '~'* ]]; then p=$HOME${p#'~'}; fi",
  "  printf '%s' \"$p\"",
  "}",
  "usable() {",
  "  local p; p=$(unesc \"$1\")",
  "  [[ -d $p ]] && { printf 'dir\\t%s\\n' \"$p\"; return 0; }",
  "  [[ -f $p ]] || return 1",
  "  [[ $p == *.@(png|jpg|jpeg|webp|gif|svg|bmp|avif|mp4|mov|mkv|webm|avi|m4v) ]] || return 1",
  "  printf 'file\\t%s\\n' \"$p\"",
  "}"
]

function clipboardProbeScript() {
  return ["set -u", "shopt -s extglob nocasematch"].concat(CLIPBOARD_BASH, [
    "if [[ -n $pick ]]; then echo image; exit 0; fi",
    "found=0",
    "while IFS= read -r line; do [[ -n $line ]] && usable \"$line\" >/dev/null && { found=1; break; }; done <<< \"$list\"",
    "[[ $found == 1 ]] && echo paths || echo none"
  ]).join("\n")
}

// Pasted bytes need a file of their own; they go in a staging folder under the
// runtime directory, wiped on each paste so they never pile up.
function clipboardPasteScript(stageDir) {
  return ["set -u", "shopt -s extglob nocasematch",
    "stage=" + shellQuote(stageDir),
    "rm -rf -- \"$stage\"; mkdir -p \"$stage\" || exit 1"].concat(CLIPBOARD_BASH, [
    "if [[ -n $pick ]]; then",
    "  ext=${pick#image/}; [[ $ext == jpeg ]] && ext=jpg",
    "  out=$stage/pasted.$ext",
    "  wl-paste --no-newline --type \"$pick\" > \"$out\" 2>/dev/null || exit 1",
    "  [[ -s $out ]] || exit 1",
    "  printf 'file\\t%s\\n' \"$out\"",
    "  exit 0",
    "fi",
    "n=0",
    "while IFS= read -r line; do [[ -n $line ]] && usable \"$line\" && n=$((n+1)); done <<< \"$list\"",
    "[[ $n -gt 0 ]]"
  ]).join("\n")
}

// `kind<TAB>path` lines back into { source, paths } for the Add card: a folder
// is a folder, a lone clip is a clip, anything else is pictures.
function parseClipboard(text) {
  var rows = String(text || "").split("\n")
  var dirs = [], files = []
  for (var i = 0; i < rows.length; i++) {
    var at = rows[i].indexOf("\t")
    if (at === -1) continue
    var kind = rows[i].substring(0, at)
    var path = rows[i].substring(at + 1).replace(/\s+$/, "")
    if (path === "") continue
    if (kind === "dir") dirs.push(path)
    else if (kind === "file") files.push(path)
  }
  if (dirs.length > 0) return { source: "folder", paths: [dirs[0]] }
  if (files.length === 0) return null
  var pictures = files.filter(isImagePath)
  if (pictures.length === 0) return { source: "video", paths: [files[0]] }
  if (pictures.length === 1 && isVideoPath(pictures[0])) return { source: "video", paths: pictures }
  return { source: "images", paths: pictures }
}

// The bash that builds one saver, written by the service to a file and run
// in the background. Everything lands under `dir`; saver.json is written
// first with importing:true (the tile appears at once) and rewritten at the
// end with the pieces, or with an error the panel shows.
function importScript(spec, rootDir) {
  var id = String(spec.id)
  var dir = rootDir + "/" + id
  var q = shellQuote
  var notify = function(glyph, text) { return "omarchy-notification-send -g " + q(glyph) + " " + q("Stelline") + " " + q(text) + " >/dev/null 2>&1 || true" }
  var lines = [
    "#!/bin/bash",
    "# Generated by Stelline for one import; safe to delete.",
    "set -u",
    "root=" + q(rootDir),
    "dir=" + q(dir),
    "mkdir -p \"$dir\" || exit 1",
    "tmp=$(mktemp -d)",
    "fail() { printf %s " + q(metaJson(spec, { error: "__MSG__" })).replace("__MSG__", "'\"$1\"'") + " > \"$dir/saver.json\"; touch \"$root/.stamp\"; " + notify("󰀦", "__MSG__").replace("__MSG__", "'\"$1\"'") + "; rm -rf \"$tmp\"; exit 1; }",
    "trap 'rm -rf \"$tmp\"' EXIT",
    "printf %s " + q(metaJson(spec, { importing: true })) + " > \"$dir/saver.json\"",
    "touch \"$root/.stamp\"",
    "cols=" + ASCII_COLUMNS + "; rows=" + ASCII_ROWS
  ]
  var finish = function(extraJq) {
    return "jq -c " + (extraJq || ".") + " <<<" + q(metaJson(spec, {})) + " > \"$dir/saver.json\" || fail 'could not write saver.json'"
  }
  var listTxt = "pieces=$(ls -1 \"$dir\"/*.txt 2>/dev/null | xargs -rn1 basename | jq -R . | jq -sc .); [[ $pieces != '[]' ]] || fail 'nothing could be converted'"
  var paths = (spec.paths || []).map(q).join(" ")
  var style = spec.style === "image" ? "image" : "ascii"

  if (spec.source === "images" || spec.source === "folder") {
    lines.push("srcs=()")
    if (spec.source === "folder") {
      lines.push("while IFS= read -r f; do srcs+=(\"$f\"); done < <(find " + paths + " -maxdepth 1 -type f \\( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' -o -iname '*.svg' -o -iname '*.bmp' -o -iname '*.avif' \\) 2>/dev/null | sort)")
    } else {
      lines.push("for f in " + paths + "; do [[ -f $f ]] && srcs+=(\"$f\"); done")
    }
    lines.push("(( ${#srcs[@]} > 0 )) || fail 'no pictures found'")
    if (style === "image") {
      if (spec.source === "folder") lines.push(finish("--arg folder " + paths + " '.folder=$folder'"))
      else lines.push("pieces=$(printf '%s\\n' \"${srcs[@]}\" | jq -R . | jq -sc .)", finish("--argjson pieces \"$pieces\" '.pieces=$pieces'"))
    } else {
      lines.push(
        "i=0",
        "for f in \"${srcs[@]}\"; do",
        "  i=$((i+1)); n=$(printf %03d \"$i\")",
        "  if [[ ${f,,} == *.gif ]]; then magick \"$f[0]\" \"$tmp/$n.png\" 2>/dev/null && f=\"$tmp/$n.png\"; fi",
        "  omarchy-transcode-ascii \"$f\" \"$dir/$n.txt\" --width \"$cols\" --height \"$rows\" --mode braille >/dev/null 2>&1 || echo \"skipped $f\" >&2",
        "done",
        listTxt,
        finish("--argjson pieces \"$pieces\" '.pieces=$pieces | .play=\"slideshow\"'")
      )
    }
  } else if (spec.source === "video") {
    var fps = Math.max(2, Math.min(24, Math.round(Number(spec.fps) || 10)))
    var secs = Math.max(1, Math.min(120, Math.round(Number(spec.seconds) || 20)))
    lines.push("src=" + paths, "[[ -f $src ]] || fail 'clip not found'")
    if (style === "image") {
      lines.push(
        "ffmpeg -v error -y -i \"$src\" -t " + secs + " -vf \"fps=" + Math.min(fps, 15) + ",scale=960:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3\" \"$dir/clip.gif\" || fail 'ffmpeg could not read the clip'",
        finish("'.pieces=[\"clip.gif\"] | .play=\"animation\"'")
      )
    } else {
      lines.push(
        "ffmpeg -v error -y -i \"$src\" -t " + secs + " -vf \"fps=" + fps + ",scale=$((cols*2)):-2:flags=area\" \"$tmp/f%05d.png\" || fail 'ffmpeg could not read the clip'",
        "shopt -s nullglob; frames=(\"$tmp\"/f*.png); (( ${#frames[@]} > 0 )) || fail 'no frames in that clip'",
        ": > \"$dir/frames.txt\"",
        "for f in \"${frames[@]}\"; do",
        "  omarchy-transcode-ascii \"$f\" \"$tmp/frame.txt\" --width \"$cols\" --height \"$rows\" --mode braille --no-trim >/dev/null 2>&1 || continue",
        "  cat \"$tmp/frame.txt\" >> \"$dir/frames.txt\"; printf '\\f' >> \"$dir/frames.txt\"",
        "done",
        "[[ -s \"$dir/frames.txt\" ]] || fail 'the frames could not be converted'",
        finish("'.pieces=[\"frames.txt\"] | .play=\"animation\" | .fps=" + fps + "'")
      )
    }
  } else if (spec.source === "text") {
    lines.push(
      "text=" + q(String(spec.text || "").trim()),
      "[[ -n $text ]] || fail 'no text given'",
      // Black on white: the transcoder treats dark pixels as the subject.
      "font=$(magick -list font 2>/dev/null | awk '/^ *Font: /{print $2}' | grep -m1 -iE 'ExtraBold|Black|Heavy|Bold' || true)",
      "magick -background white -fill black ${font:+-font \"$font\"} -pointsize 220 label:\"$text\" \"$tmp/text.png\" 2>/dev/null || fail 'could not draw the text'",
      "omarchy-transcode-ascii \"$tmp/text.png\" \"$dir/001.txt\" --width \"$cols\" --height 40 --mode block >/dev/null 2>&1 || fail 'could not convert the text'",
      finish("'.pieces=[\"001.txt\"] | .play=\"slideshow\"'")
    )
  } else if (spec.source === "prompt") {
    var frames = spec.animated ? Math.max(2, Math.min(60, Math.round(Number(spec.frames) || 12))) : 1
    lines.push(
      "prompt=" + q(aiPrompt(spec.prompt, frames)),
      // The first line that explains itself (sign-in, limits, errors), else the tail.
      "reason() { local r; r=$(grep -m1 -iE 'unauthori|not logged|log ?in|sign ?in|limit|quota|denied|error' \"$1\" 2>/dev/null | sed -E 's/^(ERROR|error)[: ]*//' | cut -c1-160); [[ -n $r ]] || r=$(tail -c 160 \"$1\" 2>/dev/null | tr -s '\\n ' ' '); printf %s \"$r\"; }",
      "out=''; why=''",
      // The system's default agent first; Claude Code if none is set; the
      // API with a key as the last resort.
      "agent=$(omarchy-default-agent 2>/dev/null || true)",
      "[[ -n $agent ]] && command -v \"$agent\" >/dev/null 2>&1 || agent=''",
      "[[ -z $agent ]] && command -v claude >/dev/null 2>&1 && agent=claude"
    )
    lines = lines.concat(agentCase())
    lines.push(
      "if [[ -z $out && -n ${ANTHROPIC_API_KEY:-} ]]; then",
      "  body=$(jq -n --arg p \"$prompt\" '{model:\"claude-opus-5\", max_tokens:16000, output_config:{effort:\"low\"}, fallbacks:\"default\", messages:[{role:\"user\", content:$p}]}')",
      "  resp=$(curl -s --max-time 600 https://api.anthropic.com/v1/messages -H 'content-type: application/json' -H \"x-api-key: $ANTHROPIC_API_KEY\" -H 'anthropic-version: 2023-06-01' -H 'anthropic-beta: server-side-fallback-2026-07-01' -d \"$body\") || resp=''",
      "  [[ $(jq -r '.stop_reason // empty' <<<\"$resp\" 2>/dev/null) == refusal ]] && fail 'the model declined that description'",
      "  out=$(jq -r '[.content[]? | select(.type==\"text\") | .text] | join(\"\\n\")' <<<\"$resp\" 2>/dev/null) || out=''",
      "fi",
      "[[ -n $out ]] || fail \"no model answered${why:+ — $why}\"",
      // Keep what sits between the markers (the whole answer if the model
      // skipped them), drop code fences, turn frame markers into form feeds.
      "art=$(printf '%s\\n' \"$out\" | awk -v b=" + ART_BEGIN + " -v e=" + ART_END + " '$0==b{on=1; found=1; next} $0==e{on=0} on{print}'); [[ -n $art ]] || art=$out",
      "printf '%s\\n' \"$art\" | sed -e '/^```/d' -e 's/^" + FRAME_MARKER + "$/\\f/' > \"$dir/frames.txt\"",
      "[[ $(tr -d '\\f[:space:]' < \"$dir/frames.txt\" | wc -c) -gt 20 ]] || fail \"the answer had no art in it${agent:+ ($agent)}\"",
      finish("'.pieces=[\"frames.txt\"] | .play=" + (frames > 1 ? "\"animation\" | .fps=6" : "\"slideshow\"") + "'")
    )
  } else {
    lines.push("fail 'unknown source'")
  }
  lines.push("touch \"$root/.stamp\"", notify("󱄄", String(spec.name || id) + " is ready"), "exit 0", "")
  return lines.join("\n")
}

// Remove one user saver's folder. The path is rebuilt from the id here, never
// taken from the caller, so nothing outside the savers root can be named.
function deleteScript(id, rootDir) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(id))) return null
  var dir = rootDir + "/" + id
  return "d=" + shellQuote(dir) + "; root=" + shellQuote(rootDir) + "; [[ -d $d && $d == \"$root\"/* ]] && rm -rf -- \"$d\"; touch \"$root/.stamp\""
}

// ---- per-saver rules ------------------------------------------------------------------

// The tile view of situations: a saver has at most one rule, the first
// situation that points at it. Its conditions AND together.
var RULE_KEYS = ["night", "battery", "theme"]

function ruleIndexFor(situations, saverId) {
  if (!Array.isArray(situations)) return -1
  for (var i = 0; i < situations.length; i++) if (isPlainObject(situations[i]) && situations[i].saver === saverId) return i
  return -1
}

function ruleFor(situations, saverId) {
  var at = ruleIndexFor(situations, saverId)
  return at === -1 ? null : situations[at]
}

function ruleHas(rule, key) {
  return isPlainObject(rule) && rule.enabled === true && isPlainObject(rule.when) && key in rule.when
}

function defaultCondition(key, ctx) {
  if (key === "night") return { from: "22:00", to: "07:00" }
  if (key === "battery") return { below: 100 }
  if (key === "theme") return { name: ctx && ctx.themeName ? String(ctx.themeName) : "" }
  return {}
}

// Turn one condition on or off for a saver. Turning the last one off removes
// the rule; turning one on for a saver without a rule appends one (later
// rules yield to earlier ones — first match wins).
function setRuleCondition(situations, saverId, key, on, ctx) {
  var list = Array.isArray(situations) ? cloneJson(situations) : []
  var at = ruleIndexFor(list, saverId)
  if (on) {
    if (at === -1) {
      list.push({ id: "rule-" + saverId, enabled: true, when: {}, saver: saverId })
      at = list.length - 1
    }
    var s = list[at]
    if (s.enabled !== true) { s.when = {}; s.enabled = true }
    if (!isPlainObject(s.when)) s.when = {}
    if (!(key in s.when)) s.when[key] = defaultCondition(key, ctx)
  } else {
    if (at === -1) return list
    var r = list[at]
    if (isPlainObject(r.when)) delete r.when[key]
    if (!isPlainObject(r.when) || Object.keys(r.when).length === 0) list.splice(at, 1)
  }
  return list
}

function patchRuleCondition(situations, saverId, key, patch) {
  var list = Array.isArray(situations) ? cloneJson(situations) : []
  var at = ruleIndexFor(list, saverId)
  if (at === -1) return list
  var s = list[at]
  if (!isPlainObject(s.when)) s.when = {}
  var c = isPlainObject(s.when[key]) ? s.when[key] : {}
  for (var k in patch) c[k] = patch[k]
  s.when[key] = c
  return list
}

// What a tile says under its name.
function playsLabel(cfg, saverId, userSavers) {
  var c = cfg || defaults()
  var rule = ruleFor(c.situations, saverId)
  var ruleText = rule && rule.enabled === true ? situationLabel(rule).toLowerCase() : ""
  if (c.shuffle) {
    var inSet = Array.isArray(c.shuffleFrom) && c.shuffleFrom.indexOf(saverId) !== -1
    return ruleText !== "" ? ruleText : (inSet ? "in the shuffle" : "")
  }
  if (c.saver === saverId) return ruleText !== "" ? "usually · " + ruleText : "usually plays"
  return ruleText
}

// Drop every reference to a saver that is going away.
function forgetSaver(cfg, saverId) {
  var c = cloneJson(cfg)
  var patch = {}
  if (c.saver === saverId) patch.saver = "wordmark"
  if (Array.isArray(c.shuffleFrom) && c.shuffleFrom.indexOf(saverId) !== -1) patch.shuffleFrom = c.shuffleFrom.filter(function(id) { return id !== saverId })
  if (Array.isArray(c.situations) && c.situations.some(function(s) { return isPlainObject(s) && s.saver === saverId })) {
    patch.situations = c.situations.map(function(s) {
      if (!isPlainObject(s) || s.saver !== saverId) return s
      var t = cloneJson(s); delete t.saver
      return t
    }).filter(function(s) {
      // A rule that only switched savers has nothing left to do.
      var hasScr = s.screensaver !== undefined && s.screensaver !== null && s.screensaver !== ""
      var hasLock = s.lock !== undefined && s.lock !== null && s.lock !== ""
      return s.saver || hasScr || hasLock
    })
  }
  if (isPlainObject(c.savers) && saverId in c.savers) { patch.savers = cloneJson(c.savers); delete patch.savers[saverId] }
  return patch
}

if (typeof module !== "undefined") {
  module.exports = {
    PLUGIN_ID: PLUGIN_ID,
    SAVERS: SAVERS,
    saverById: saverById,
    saverFile: saverFile,
    rotation: rotation,
    nextSaver: nextSaver,
    defaults: defaults,
    isPlainObject: isPlainObject,
    cloneJson: cloneJson,
    findEntry: findEntry,
    coerce: coerce,
    mergeSettings: mergeSettings,
    fullSettings: fullSettings,
    secondsFromConfig: secondsFromConfig,
    NEVER_SECONDS: NEVER_SECONDS,
    effectiveTimeouts: effectiveTimeouts,
    firstTimeout: firstTimeout,
    pickSaver: pickSaver,
    TTFX_EFFECTS: TTFX_EFFECTS,
    hhmm: hhmm,
    inWindow: inWindow,
    situationMatches: situationMatches,
    activeSituation: activeSituation,
    situationLabel: situationLabel,
    situationEffect: situationEffect,
    mmss: mmss,
    digest: digest,
    displayAppName: displayAppName,
    terminalLoop: terminalLoop,
    terminalArgv: terminalArgv,
    shellQuote: shellQuote,
    DEFAULT_INDICATOR_ITEMS: DEFAULT_INDICATOR_ITEMS,
    stayAwakeIndicatorShown: stayAwakeIndicatorShown,
    applyFinishSetup: applyFinishSetup,
    applyUndoSetup: applyUndoSetup,
    MENU_MARKER: MENU_MARKER,
    jsoncParse: jsoncParse,
    menuHasOverride: menuHasOverride,
    menuInsertOverride: menuInsertOverride,
    menuRemoveOverride: menuRemoveOverride,
    totalCount: totalCount,
    allSavers: allSavers,
    isNativeSaver: isNativeSaver,
    conditionLabel: conditionLabel,
    USER_SAVERS_SUBDIR: USER_SAVERS_SUBDIR,
    IMAGE_EXTENSIONS: IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS: VIDEO_EXTENSIONS,
    extensionOf: extensionOf,
    isImagePath: isImagePath,
    isVideoPath: isVideoPath,
    baseName: baseName,
    slugify: slugify,
    uniqueId: uniqueId,
    suggestName: suggestName,
    splitFrames: splitFrames,
    userSaverFromScan: userSaverFromScan,
    parseScan: parseScan,
    scanScript: scanScript,
    importDefaults: importDefaults,
    ASCII_COLUMNS: ASCII_COLUMNS,
    ASCII_ROWS: ASCII_ROWS,
    FRAME_MARKER: FRAME_MARKER,
    ART_BEGIN: ART_BEGIN,
    ART_END: ART_END,
    AGENTS: AGENTS,
    agentName: agentName,
    aiPrompt: aiPrompt,
    clipboardProbeScript: clipboardProbeScript,
    clipboardPasteScript: clipboardPasteScript,
    parseClipboard: parseClipboard,
    importScript: importScript,
    deleteScript: deleteScript,
    RULE_KEYS: RULE_KEYS,
    ruleIndexFor: ruleIndexFor,
    ruleFor: ruleFor,
    ruleHas: ruleHas,
    defaultCondition: defaultCondition,
    setRuleCondition: setRuleCondition,
    patchRuleCondition: patchRuleCondition,
    playsLabel: playsLabel,
    forgetSaver: forgetSaver
  }
}
