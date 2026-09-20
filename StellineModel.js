// Pure JavaScript for the Stelline plugin: settings shape, the saver
// registry, and the rules ("situations") evaluator. No QML types in here, so
// every function runs under `node --test tests/` as well as inside the shell.

var PLUGIN_ID = "io.github.aashbury.stelline"

// Static saver metadata. The picker reads this list; savers are only
// instantiated by the overlay when they are actually shown.
var SAVERS = [
  { id: "wordmark", name: "Wordmark", glyph: "󰊄", meta: "your branding, theme colours", file: "savers/Wordmark.qml", kind: "native" },
  { id: "clock",    name: "Clock",    glyph: "󰥔", meta: "big monospace time and date", file: "savers/Clock.qml",    kind: "native" },
  { id: "matrix",   name: "Matrix rain", glyph: "󰘨", meta: "falling glyphs in theme colours", file: "savers/Matrix.qml", kind: "native" },
  { id: "blank",    name: "Blank",    glyph: "󰹏", meta: "black — for battery", file: "savers/Blank.qml",  kind: "native" },
  { id: "terminal", name: "Terminal", glyph: "",  meta: "stock ttfx in a terminal", file: "",                   kind: "external" }
]

function saverById(id) {
  for (var i = 0; i < SAVERS.length; i++) if (SAVERS[i].id === id) return SAVERS[i]
  return null
}

function saverFile(id) {
  var s = saverById(id)
  return s ? s.file : ""
}

// The savers the overlay may step through with Right / `n`: the shuffle set
// when shuffle is on, otherwise every native saver. Terminal is never in the
// rotation — it lives in its own window.
function rotation(cfg) {
  var natives = SAVERS.filter(function(s) { return s.kind === "native" }).map(function(s) { return s.id })
  if (cfg && cfg.shuffle && Array.isArray(cfg.shuffleFrom)) {
    var picked = cfg.shuffleFrom.filter(function(id) { return natives.indexOf(id) !== -1 })
    if (picked.length) return picked
  }
  return natives
}

function nextSaver(cfg, current) {
  var ids = rotation(cfg)
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
    situations: [
      { id: "on-battery", enabled: false, when: { battery: { below: 100 } }, saver: "blank", screensaver: 90, lock: 180 },
      { id: "night", enabled: false, when: { night: { from: "22:00", to: "07:00" } }, saver: "clock" },
      { id: "theme", enabled: false, when: { theme: { name: "hackerman" } }, saver: "matrix" }
    ],
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
function mergeSettings(entry) {
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
        } else {
          fallback[sub] = coerce(src[key][sub], subFallback)
        }
      }
    } else {
      out[key] = coerce(src[key], fallback)
    }
  }
  if (!saverById(out.saver)) out.saver = "wordmark"
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

function situationLabel(s) {
  if (!isPlainObject(s) || !isPlainObject(s.when)) return ""
  if (s.when.battery) {
    var b = s.when.battery.below
    return b !== undefined && b !== null && Number(b) < 100 ? "Battery below " + Number(b) + "%" : "On battery"
  }
  if (s.when.night) return "Night " + (s.when.night.from || "?") + "–" + (s.when.night.to || "?")
  if (s.when.theme) return "Theme " + (s.when.theme.name || "?")
  return Object.keys(s.when).join(", ")
}

function situationEffect(s) {
  if (!isPlainObject(s)) return ""
  var parts = []
  var saver = s.saver ? saverById(s.saver) : null
  if (saver) parts.push(saver.name)
  var hasScr = s.screensaver !== undefined && s.screensaver !== null && s.screensaver !== ""
  var hasLock = s.lock !== undefined && s.lock !== null && s.lock !== ""
  if (hasScr || hasLock) {
    var scr = hasScr ? mmss(s.screensaver) : "—"
    var lock = hasLock ? (s.lock === "never" ? "never" : mmss(s.lock)) : "—"
    parts.push(scr + " / " + lock)
  } else if (parts.length) {
    parts.push("keep timings")
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
function pickSaver(cfg, situation, last, random) {
  var c = cfg || defaults()
  if (isPlainObject(situation) && situation.saver && saverById(situation.saver)) return situation.saver
  if (!c.shuffle) return saverById(c.saver) ? c.saver : "wordmark"
  var ids = rotation(c)
  var pool = ids.filter(function(id) { return id !== last })
  if (pool.length === 0) pool = ids
  var r = typeof random === "number" ? random : Math.random()
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))]
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
    totalCount: totalCount
  }
}
