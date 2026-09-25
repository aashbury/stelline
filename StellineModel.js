// Pure JavaScript for the Stelline plugin: settings shape, the saver
// registry, and the rules ("situations") evaluator. No QML types in here, so
// every function runs under `node --test tests/*.test.js` as well as inside
// the shell.

var PLUGIN_ID = "io.github.aashbury.stelline"

// Static saver metadata. The picker reads this list; savers are only
// instantiated by the overlay when they are actually shown.
// The stock saver first; the Wordmark is what a fresh install plays.
// `meta` is the line under the name on a tile with no rule to report, so it
// has to fit a tile: about twenty characters. The Wordmark draws its text:
// the word "stelline" is Stelline's own hand-drawn art (`fallbackArt`), any
// other word is drawn by the wordmark script. The Original always shows the
// branding file, since that is what it plays.
var DEFAULT_SAVER = "wordmark"

// What plays when the chosen saver cannot: the default, or the Original if
// the default has been deleted — the Original is the one tile that stays.
function fallbackSaver(cfg) {
  var hidden = cfg && Array.isArray(cfg.hidden) ? cfg.hidden : []
  return hidden.indexOf(DEFAULT_SAVER) === -1 ? DEFAULT_SAVER : "terminal"
}
var SAVERS = [
  // Nothing here is special: each is an instance of a type anyone can add
  // (text, empty), with its defaults in defaults().savers, and each can be
  // deleted (hidden) like anything else. Only the Original is fixed — it is
  // Omarchy's own launcher, not a Stelline saver. `about` is the sentence
  // under the name when a tile is open.
  { id: "terminal", name: "Original", type: "original", glyph: "󰆍", meta: "Omarchy's own", file: "", thumb: "savers/Wordmark.qml", kind: "external",
    about: "Omarchy's own screensaver, untouched: your text with Omarchy's 37 animations, in a terminal. The full stock experience; it uses several CPU cores while it runs." },
  { id: "wordmark", name: "Wordmark", type: "text", glyph: "󰊄", meta: "drawn by Stelline", file: "savers/Wordmark.qml", fallbackArt: "savers/stelline.txt", kind: "native",
    about: "The same text, drawn by Stelline: theme colours, animations of its own, almost no CPU. Omarchy's animations only play in the Original." },
  { id: "clock",    name: "Clock",    type: "empty", glyph: "󰥔", meta: "time and date", file: "savers/Blank.qml",  kind: "native",
    about: "An empty screen with the clock in the middle: seven-segment digits, the date beneath." },
  { id: "blank",    name: "Blank",    type: "empty", glyph: "󰹏", meta: "black, saves power", file: "savers/Blank.qml",  kind: "native",
    about: "An empty screen, black. Give it to a battery rule, or put something on top of it." }
]
// The glyphs the two empties use, for the ones you add.
var GLYPHS = { clock: SAVERS[2].glyph, empty: SAVERS[3].glyph }

// Every saver the user can pick: the built-ins, then their own (imported
// pictures, clips, text and generated art — "series"). User savers are
// passed in explicitly: QML gives each importer of this file its own copy,
// so module state would not be shared between the service and the panel.
function allSavers(userSavers, hidden) {
  var list = SAVERS.concat(Array.isArray(userSavers) ? userSavers : [])
  if (!Array.isArray(hidden) || hidden.length === 0) return list
  return list.filter(function(s) { return hidden.indexOf(s.id) === -1 })
}

function saverById(id, userSavers) {
  var list = allSavers(userSavers)
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]
  return null
}


// What kind of thing a saver is, which is what decides how it is configured:
// two savers of the same type get the same settings, whether they shipped
// with Stelline or you made one. text (a typed word), pictures, art, animation,
// empty (nothing of its own — for the widgets), original (Omarchy's launcher).
function saverType(saver) {
  if (!isPlainObject(saver)) return ""
  if (typeof saver.type === "string" && saver.type !== "") return saver.type
  if (saver.kind === "external") return "original"
  var series = isPlainObject(saver.series) ? saver.series : {}
  var source = isPlainObject(series.source) ? series.source : {}
  if (series.kind === "empty") return "empty"
  if (source.type === "text") return "text"
  if (series.kind === "image") return "pictures"
  return series.play === "animation" ? "animation" : "art"
}

// What a wordmark says. The setting wins, then whatever it was made from,
// then Stelline's own name for the built-in one — a default, not a hardcoding:
// type over it and it is yours.
var DEFAULT_WORDMARK = "stelline"

function wordmarkText(saver, settings) {
  if (isPlainObject(settings) && typeof settings.text === "string") return settings.text
  var series = saver && isPlainObject(saver.series) ? saver.series : null
  var source = series && isPlainObject(series.source) ? series.source : null
  if (source && typeof source.text === "string") return source.text
  return saver && saver.id === "wordmark" ? DEFAULT_WORDMARK : ""
}

function isNativeSaver(s) {
  return !!s && (s.kind === "native" || s.kind === "series")
}

// The savers the overlay may step through with Right / `n`: the shuffle set
// when shuffle is on, otherwise every native saver. Terminal is never in the
// rotation — it lives in its own window. Savers still importing are skipped.
// Every saver the shuffle could play: native, finished, not hidden. "Select
// all" ticks exactly these.
function shufflable(cfg, userSavers) {
  return allSavers(userSavers, cfg && cfg.hidden).filter(function(s) { return isNativeSaver(s) && !(s.series && s.series.importing) }).map(function(s) { return s.id })
}

// How long the shuffle stays on one saver before moving on while the screen
// is idle, in seconds; 0 is only when it starts, as it always was.
function shuffleEvery(cfg) {
  var n = Math.round(Number(cfg && cfg.shuffleEvery))
  return isFinite(n) && n > 0 ? Math.max(30, n) : 0
}

function rotation(cfg, userSavers) {
  var natives = shufflable(cfg, userSavers)
  if (cfg && cfg.shuffle && Array.isArray(cfg.shuffleFrom)) {
    var picked = cfg.shuffleFrom.filter(function(id) { return natives.indexOf(id) !== -1 })
    if (picked.length) return picked
  }
  return natives
}

function nextSaver(cfg, current, userSavers) {
  var ids = rotation(cfg, userSavers)
  // Every native saver deleted: there is nothing to step to, so stay put.
  if (ids.length === 0) return current
  var at = ids.indexOf(current)
  return ids[(at + 1) % ids.length]
}

function defaults() {
  return {
    saver: DEFAULT_SAVER,
    shuffle: false,
    shuffleFrom: ["wordmark", "clock"],
    shuffleEvery: 0,
    screensaverEnabled: true,
    lockEnabled: true,
    // Hold the saver and the lock off while the active window is fullscreen
    // (a game that never asks). Off: a fullscreen editor left alone should
    // still lock.
    holdFullscreen: false,
    savers: {
      // A default, not a hardcoding: type over the text and it is yours. Every
      // animation is on out of the box, because that is the thing to look at.
      wordmark: { text: DEFAULT_WORDMARK, effect: "cycle", effects: [], holdSec: 4, background: "theme" },
      // Two empties: one with the clock in the middle, one black.
      clock: { background: "theme", widgets: { clock: { on: true, place: "centre" } } },
      blank: { background: "black" },
      terminal: { effects: [] }
    },
    hidden: [],
    situations: [],
    card: { enabled: true, corner: "bottom-right", detail: "counts", showAgent: true, maxApps: 4 },
    // A described saver: the agent's own model unless one is named here, at
    // this effort. Low answers in half a minute; high may take minutes.
    describe: { model: "", effort: "medium" },
    integration: { menuEntry: false },
    setup: { done: false, indicatorsItemsBefore: null }
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
  // No default to coerce against (a knob newer than the defaults, a widget on
  // a shipped tile, a record that is empty until something is remembered):
  // the value is kept as it is, not turned into a string.
  if (fallback === undefined || fallback === null) return value
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
  if (isPlainObject(fallback)) {
    // Objects merge all the way down, so a partial (a hand-edited widget,
    // one knob written by an older version) keeps the rest of its defaults.
    if (!isPlainObject(value)) return fallback
    var out = cloneJson(fallback)
    for (var k in value) out[k] = k in out ? coerce(value[k], out[k]) : cloneJson(value[k])
    return out
  }
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
  // back to the default — but only once the user savers are known.
  if (!saverById(out.saver, userSavers)) out.saver = fallbackSaver(out)
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

// The same three moods Stelline's own effects offer, over Omarchy's 37 —
// `orbittingvolley` tells nobody anything, and seven rows of chips is the
// most overwhelming control in the panel. Every effect belongs to exactly
// one mood, so the sets stay a partition and "all of them" is the union.
var TTFX_MOODS = {
  calm:    ["colorshift", "expand", "highlight", "middleout", "pour", "print", "slice", "slide", "sweep", "waves", "wipe"],
  neon:    ["binarypath", "decrypt", "errorcorrect", "laseretch", "matrix", "overflow", "rain", "randomsequence", "synthgrid", "vhstape"],
  kinetic: ["beams", "blackhole", "bouncyballs", "bubbles", "burn", "crumble", "fireworks", "orbittingvolley", "rings", "scattered", "smoke", "spotlights", "spray", "swarm", "thunderstorm", "unstable"]
}

// Which mood a pinned list is, if any: "" when nothing is pinned (every
// effect plays), a mood key when the list is exactly that set, or "custom"
// when someone has picked their own. The pinned array stays the only stored
// value — a mood is just a set of it — so nothing needs migrating and an
// unknown name in an old config still just drops out.
function moodOf(pinned, moods) {
  var list = Array.isArray(pinned) ? pinned.slice().sort() : []
  if (list.length === 0) return ""
  for (var key in moods) {
    var want = moods[key].slice().sort()
    if (want.length !== list.length) continue
    var same = true
    for (var i = 0; i < want.length; i++) if (want[i] !== list[i]) { same = false; break }
    if (same) return key
  }
  return "custom"
}

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
  },
  // At a desk: an external monitor is driving the session. Nothing to
  // configure — it is either plugged in or it is not.
  docked: function(c, ctx) {
    return ctx.docked === true
  }
}

// Docked the way Omarchy's own clamshell logic sees it: any active output
// that is not the laptop's own panel. Reactive off the compositor's screen
// list, so no polling and no process.
function isDocked(screenNames) {
  if (!Array.isArray(screenNames)) return false
  for (var i = 0; i < screenNames.length; i++) {
    if (!/^(eDP|LVDS|DSI)-/i.test(String(screenNames[i] || ""))) return true
  }
  return false
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

function hasTiming(v) { return v !== undefined && v !== null && v !== "" }

// Every enabled rule that fits applies at once: the saver comes from the
// first that names one, each timing from the first that sets it. A saver
// rule and a timings rule for the same moment therefore never fight; order
// only matters between two rules that set the same thing. Null when nothing
// applies.
function activeSituation(list, ctx) {
  if (!Array.isArray(list)) return null
  var hits = []
  for (var i = 0; i < list.length; i++) if (situationMatches(list[i], ctx)) hits.push(list[i])
  if (hits.length === 0) return null
  if (hits.length === 1) return hits[0]
  var merged = { id: hits.map(function(s) { return s.id }).join("+"), enabled: true, when: {} }
  for (var j = 0; j < hits.length; j++) {
    var s = hits[j]
    for (var k in s.when) if (!(k in merged.when)) merged.when[k] = s.when[k]
    if (s.saver && !merged.saver) merged.saver = s.saver
    if (hasTiming(s.screensaver) && !hasTiming(merged.screensaver)) merged.screensaver = s.screensaver
    // "Never lock" is a promise, so it beats any number another rule sets.
    if (s.lock === "never") merged.lock = "never"
    else if (hasTiming(s.lock) && !hasTiming(merged.lock)) merged.lock = s.lock
  }
  return merged
}

function conditionLabel(key, c) {
  if (key === "battery") {
    var b = c && c.below
    return b !== undefined && b !== null && Number(b) < 100 ? "Battery below " + Number(b) + "%" : "On battery"
  }
  if (key === "night") return "Night " + ((c && c.from) || "?") + "–" + ((c && c.to) || "?")
  if (key === "theme") return c && c.name ? "Theme " + c.name : "Theme not chosen"
  if (key === "docked") return "Docked"
  return key
}

// Every condition of a rule, joined — they all have to hold.
function situationLabel(s) {
  if (!isPlainObject(s) || !isPlainObject(s.when)) return ""
  var keys = Object.keys(s.when)
  if (keys.length === 0) return ""
  return keys.map(function(k) { return conditionLabel(k, s.when[k]) }).join(" · ")
}

// The one docked rule most people want — "at the desk, never lock" — as a
// switch rather than a rule to compose: a timings-only rule whose only
// condition is docked and whose only effect is never locking. It lives in
// the same list as every other rule, so per-saver docked rules stay possible.
function dockedNoLockIndex(situations) {
  if (!Array.isArray(situations)) return -1
  for (var i = 0; i < situations.length; i++) {
    var s = situations[i]
    if (!isPlainObject(s) || !isPlainObject(s.when)) continue
    var keys = Object.keys(s.when)
    if (keys.length !== 1 || keys[0] !== "docked") continue
    if (s.saver) continue
    if (s.lock !== "never") continue
    if (hasTiming(s.screensaver)) continue
    return i
  }
  return -1
}

function dockedNoLock(situations) {
  var at = dockedNoLockIndex(situations)
  return at !== -1 && situations[at].enabled === true
}

function setDockedNoLock(situations, on) {
  var list = Array.isArray(situations) ? cloneJson(situations) : []
  var at = dockedNoLockIndex(list)
  if (on) {
    if (at === -1) list.push({ id: "docked-no-lock", enabled: true, when: { docked: {} }, lock: "never" })
    else list[at].enabled = true
  } else if (at !== -1) {
    list.splice(at, 1)
  }
  return list
}

// A rule that only changes the timings in one situation — no saver, one
// condition — is what a switch under the sliders stands for. Matched by
// shape, like the docked one, so a hand-written rule counts too.
function timingsRuleIndex(situations, key) {
  if (!Array.isArray(situations)) return -1
  for (var i = 0; i < situations.length; i++) {
    var s = situations[i]
    if (!isPlainObject(s) || !isPlainObject(s.when)) continue
    var keys = Object.keys(s.when)
    if (keys.length !== 1 || keys[0] !== key) continue
    if (s.saver) continue
    return i
  }
  return -1
}

function timingsRule(situations, key) {
  var at = timingsRuleIndex(situations, key)
  return at === -1 ? null : situations[at]
}

// Switching one on that does not exist yet starts it with shorter timings,
// so the switch visibly does something; off removes it.
function setTimingsRule(situations, key, on, ctx) {
  var list = Array.isArray(situations) ? cloneJson(situations) : []
  var at = timingsRuleIndex(list, key)
  if (on) {
    if (at === -1) {
      var s = { id: key + "-timings", enabled: true, when: {}, screensaver: 90, lock: 180 }
      s.when[key] = defaultCondition(key, ctx)
      list.push(s)
    } else list[at].enabled = true
  } else if (at !== -1) {
    list.splice(at, 1)
  }
  return list
}

function mmss(seconds) {
  var n = Math.max(0, Math.round(Number(seconds) || 0))
  var m = Math.floor(n / 60), r = n % 60
  return m + ":" + (r < 10 ? "0" : "") + r
}

// The Timings row, folded: the two times, then only the exceptions that are
// switched on, so a default setup reads as one short line.
function timingsSummary(o) {
  var t = o || {}
  // With the lock off, the exceptions that only ever skip the lock say nothing.
  var locks = t.lockOn !== false
  var parts = [t.screensaverOn === false ? "screensaver off" : mmss(t.screensaver), locks ? "lock " + mmss(t.lock) : "no lock"]
  if (t.battery) parts.push("on battery " + mmss(t.battery.screensaver) + (locks && t.battery.lock === "never" ? ", no lock" : ""))
  if (t.dockedNoLock && locks) parts.push("no lock docked")
  if (t.holdFullscreen) parts.push("not over fullscreen")
  return parts.join(" · ")
}

// ---- status card ------------------------------------------------------------

// Omarchy mirrors every toast to a one-line JSON file, and moves it into
// history/ when it leaves the screen. Group what is worth knowing about by
// app: live toasts always count, history only since `sinceMs`. Every app is
// kept — the card shows the first few and counts the rest — and `maxApps`,
// when given, cuts the list.
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
    if (!g) g = groups[app] = { app: app, count: 0, urgency: 0, glyph: "", appIcon: "", latestSummary: "", latestBody: "", latestTs: 0 }
    g.count += 1
    g.urgency = Math.max(g.urgency, Number(n.urgency) || 0)
    if (ts >= g.latestTs) {
      g.latestTs = ts
      g.latestSummary = String(n.summary || "")
      g.latestBody = String(n.body || "").replace(/\s+/g, " ").trim()
      if (n.glyph) g.glyph = String(n.glyph)
      if (n.appIcon) g.appIcon = String(n.appIcon)
    }
  }
  var out = Object.keys(groups).map(function(k) { return groups[k] })
  out.sort(function(a, b) { return (b.urgency - a.urgency) || (b.latestTs - a.latestTs) })
  return Number(maxApps) > 0 ? out.slice(0, Number(maxApps)) : out
}

// A glyph for a group of notifications, so the card says at a glance what
// kind they are. The sender's own glyph first (Omarchy's toasts carry one),
// then what its name or icon name says it is, then a bell. Glyphs rather than
// the apps' own icons: they take the theme's colour like everything else on
// the screen, and a missing icon never leaves a hole.
var APP_GLYPHS = [
  [/mail|thunderbird|evolution|geary|outlook|proton/, "󰇮"],
  [/slack|discord|signal|telegram|whatsapp|element|matrix|teams|zoom|messag|chat|beeper/, "󰭹"],
  [/calendar|gnome-calendar|reminder|todo|task/, "󰃭"],
  [/firefox|chrom|brave|browser|zen|vivaldi|edge|web/, "󰖟"],
  [/spotify|music|player|mpv|vlc|audio|podcast/, "󰝚"],
  [/download|transmission|torrent/, "󰇚"],
  [/update|pacman|yay|paru|flatpak|package/, "󰚰"],
  [/battery|power|upower/, "󰁹"],
  [/screenshot|screen ?shot|grim|hyprshot|satty|record/, "󰹑"],
  [/claude|codex|gemini|opencode|copilot|crush|agent|ai\b/, "󰚩"],
  [/github|gitlab|\bgit\b/, "󰊢"],
  [/ghostty|alacritty|kitty|foot|terminal|wezterm/, "󰆍"],
  [/bluetooth/, "󰂯"],
  [/wifi|network|nm-applet/, "󰖩"],
  [/volume|pulse|pipewire/, "󰕾"]
]
function appGlyph(group) {
  var g = isPlainObject(group) ? group : {}
  if (g.glyph) return String(g.glyph)
  var name = (String(g.app || "") + " " + String(g.appIcon || "")).toLowerCase()
  for (var i = 0; i < APP_GLYPHS.length; i++) if (APP_GLYPHS[i][0].test(name)) return APP_GLYPHS[i][1]
  return "󰂚"
}

// The card's last line, for what did not fit: "+ 3 more from Slack",
// "+ 12 more from 5 other apps".
function moreLine(rest) {
  var list = Array.isArray(rest) ? rest : []
  if (list.length === 0) return ""
  var n = totalCount(list)
  return "+ " + n + " more from " + (list.length === 1 ? list[0].app : list.length + " other apps")
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

// Dots to braille, in awk, one byte at a time: a plain PGM on stdin, each
// dot lit where its grey beats the matrix the figures are dithered with,
// two across and four down to a cell. Needs nothing beyond awk.
var BRAILLE_PACK = [
  "function byte(n) { printf \"%c\", n }",
  "{ for (i = 1; i <= NF; i++) v[n++] = $i }",
  "END {",
  "  W = v[1]; H = v[2]; M = v[3]",
  "  split(\"0 8 2 10 12 4 14 6 3 11 1 9 15 7 13 5\", B, \" \")",
  "  split(\"1 2 4 64 8 16 32 128\", BIT, \" \")",
  "  for (r = 0; r < H; r += 4) {",
  "    for (c = 0; c < W; c += 2) {",
  "      code = 0",
  "      for (dx = 0; dx < 2; dx++) for (dy = 0; dy < 4; dy++) {",
  "        x = c + dx; y = r + dy",
  "        if (x >= W || y >= H) continue",
  "        g = v[4 + y * W + x] / M",
  "        if (g > 0 && B[(y % 4) * 4 + (x % 4) + 1] / 16 < g) code += BIT[dx * 4 + dy + 1]",
  "      }",
  "      cells[c / 2] = code",
  "    }",
  "    last = -1; for (k = 0; k < W / 2; k++) if (cells[k]) last = k",
  "    for (k = 0; k <= last; k++) {",
  "      if (!cells[k]) { printf \" \"; continue }",
  "      byte(226); byte(160 + int(cells[k] / 64)); byte(128 + cells[k] % 64)",
  "    }",
  "    printf \"\\n\"",
  "  }",
  "}"
].join("\n")

// A word into a wordmark, drawn the way Stelline's own name is
// (art/wordmark.js) but from whatever font is there: the letters slanted
// forward, their tops lit and their fronts in the dense tone, an extrusion
// falling down and to the right in the sparse tone, an ink line round every
// letter, scanlines across the faces. The picture is brought down to the dot
// grid, each dot made one of the four tones, then dithered through the same
// matrix the figures use and packed into braille — by awk, one byte at a
// time, so it needs nothing the Add card does not already. Used whenever a
// wordmark's text changes; Stelline's own name is drawn by hand instead.
var WORDMARK_DEPTH = 9, WORDMARK_INK = 9
function wordmarkScript(text, outPath) {
  var q = shellQuote
  return [
    "set -u",
    "text=" + q(String(text || "").trim()),
    "[[ -n $text ]] || exit 1",
    "out=" + q(String(outPath)),
    "dir=$(dirname \"$out\"); mkdir -p \"$dir\" || exit 1",
    "tmp=$(mktemp -d); trap 'rm -rf \"$tmp\"' EXIT",
    // the heaviest upright sans there is: black before bold, never mono
    "fonts=$(magick -list font 2>/dev/null | awk '/^ *Font: /{print $2}' | grep -viE 'mono|italic|oblique|serif|cjk' || true); font=''",
    "for weight in Black ExtraBold Heavy Bold; do font=$(grep -m1 -iE -- \"-$weight\\$\" <<<\"$fonts\" || true); [[ -n $font ]] && break; done",
    // the letters, white on black, slanted forward, with room for the depth
    // The text goes in on stdin, so a word starting with @ is a word and
    // not a file to read; % doubled, so it is not a format escape.
    "printf %s \"${text//%/%%}\" | magick -background black -fill white ${font:+-font \"$font\"} -pointsize 240 label:@- -trim +repage " +
      "-bordercolor black -border 60 -shear 12x0 -trim +repage -bordercolor black -border 90 \"$tmp/m.png\" || exit 1",
    "read -r w h < <(magick identify -format '%w %h\\n' \"$tmp/m.png\"); [[ -n ${h:-} ]] || exit 1",
    // the extrusion: the letters stepped down and to the right
    "cp \"$tmp/m.png\" \"$tmp/x.png\"",
    "for (( i = 1; i <= " + WORDMARK_DEPTH + "; i++ )); do magick \"$tmp/x.png\" \\( \"$tmp/m.png\" -geometry +$((i * 3))+$((i * 4)) \\) -compose Lighten -composite \"$tmp/x.png\" || exit 1; done",
    // the ink line round the faces, cut out of the extrusion
    "magick \"$tmp/m.png\" -morphology Dilate Disk:" + WORDMARK_INK + " \"$tmp/o.png\" || exit 1",
    "magick \"$tmp/x.png\" \\( \"$tmp/o.png\" -negate \\) -compose Multiply -composite -evaluate Multiply 0.25 \"$tmp/xs.png\" || exit 1",
    // the faces: lit above the split, dense below, scanlines across
    "split=$(( 90 + (h - 180) * 46 / 100 )); lines=''",
    "for (( y = 20; y < h; y += 42 )); do lines+=\"rectangle 0,$y $w,$((y + 6)) \"; done",
    "magick -size ${w}x${h} 'xc:gray(56%)' -fill white -draw \"rectangle 0,0 $w,$split\" -fill black -draw \"$lines\" \"$tmp/t.png\" || exit 1",
    "magick \"$tmp/m.png\" \"$tmp/t.png\" -compose Multiply -composite \"$tmp/f.png\" || exit 1",
    "magick \"$tmp/xs.png\" \"$tmp/f.png\" -compose Lighten -composite -trim +repage \"$tmp/all.png\" || exit 1",
    // down to the dot grid, four tones, dithered and packed into braille
    "magick \"$tmp/all.png\" -filter Box -resize " + (ASCII_COLUMNS * 2) + "x" + (40 * 4) + " " +
      "-fx 'u < 0.125 ? 0 : (u < 0.4 ? 0.25 : (u < 0.78 ? 0.56 : 1))' -depth 8 -compress none pgm:- | " +
      "LC_ALL=C awk " + q(BRAILLE_PACK) + " > \"$tmp/art.txt\" || exit 1",
    "[[ -s $tmp/art.txt ]] || exit 1",
    "mv \"$tmp/art.txt\" \"$out\""
  ].join("\n")
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
    ours.setup = { done: true, indicatorsItemsBefore: prev.done === true ? rememberedItems(prev.indicatorsItemsBefore) : before }
    changed = true
  }
  return changed
}

// The remembered indicator list. An earlier version stored it as one
// comma-joined string; that is read back as the list it was.
function rememberedItems(v) {
  if (Array.isArray(v)) return v.length ? v : null
  if (typeof v !== "string" || v.trim() === "") return null
  var items = v.split(",").map(function(x) { return x.trim() }).filter(function(x) { return x !== "" })
  return items.length ? items : null
}

function applyUndoSetup(config, pluginId) {
  var ours = findEntry(config, pluginId)
  if (!ours || !isPlainObject(ours.setup) || ours.setup.done !== true) return false
  var before = rememberedItems(ours.setup.indicatorsItemsBefore)
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
  ours.setup = { done: false, indicatorsItemsBefore: null }
  return true
}

// ---- inhibitors asked for over D-Bus -------------------------------------------
//
// Browsers, players and Steam ask the desktop not to start the screensaver
// through org.freedesktop.ScreenSaver (Inhibit/UnInhibit with a cookie);
// Wayland-native players use the idle-inhibit protocol, which the idle
// monitor honours by itself. Nothing on a stock Omarchy owns the D-Bus
// name, so the requests went nowhere. This program, run by the service,
// owns it and prints one JSON line whenever the set of holders changes:
//   {"inhibitors":[{"app":"Firefox","reason":"video-playing"}]}
// plus {"owner":true|false} as the name comes and goes, and {"lock":true}
// when something asks for the lock. A holder that disconnects without
// UnInhibit (a crash, a closed tab) is dropped. It leaves with the shell.
function screenSaverBusScript() {
  return [
    "import json, os, signal, sys",
    "try:",
    "    import gi",
    "    gi.require_version('Gio', '2.0'); gi.require_version('GLib', '2.0')",
    "    from gi.repository import Gio, GLib",
    "except Exception as e:",
    "    print(json.dumps({'error': 'needs python-gobject: ' + str(e)}), flush=True); sys.exit(2)",
    "XML = ('<node><interface name=\"org.freedesktop.ScreenSaver\">'",
    "  '<method name=\"Inhibit\"><arg type=\"s\" name=\"application_name\" direction=\"in\"/><arg type=\"s\" name=\"reason_for_inhibit\" direction=\"in\"/><arg type=\"u\" name=\"cookie\" direction=\"out\"/></method>'",
    "  '<method name=\"UnInhibit\"><arg type=\"u\" name=\"cookie\" direction=\"in\"/></method>'",
    "  '<method name=\"GetActive\"><arg type=\"b\" direction=\"out\"/></method>'",
    "  '<method name=\"GetActiveTime\"><arg type=\"u\" direction=\"out\"/></method>'",
    "  '<method name=\"GetSessionIdleTime\"><arg type=\"u\" direction=\"out\"/></method>'",
    "  '<method name=\"SetActive\"><arg type=\"b\" name=\"e\" direction=\"in\"/><arg type=\"b\" direction=\"out\"/></method>'",
    "  '<method name=\"SimulateUserActivity\"/><method name=\"Lock\"/>'",
    "  '<method name=\"Throttle\"><arg type=\"s\" direction=\"in\"/><arg type=\"s\" direction=\"in\"/><arg type=\"u\" direction=\"out\"/></method>'",
    "  '<method name=\"UnThrottle\"><arg type=\"u\" direction=\"in\"/></method>'",
    "  '</interface></node>')",
    "held = {}",
    "watches = {}",
    "counter = [0]",
    "def emit():",
    "    print(json.dumps({'inhibitors': [{'app': a, 'reason': r} for (_, a, r) in held.values()]}), flush=True)",
    "def gone(sender):",
    "    for c in [c for c, v in held.items() if v[0] == sender]:",
    "        del held[c]",
    "    w = watches.pop(sender, None)",
    "    if w: Gio.bus_unwatch_name(w)",
    "    emit()",
    "def call(conn, sender, path, iface, method, params, inv):",
    "    if method == 'Inhibit':",
    "        app, reason = params.unpack()",
    "        counter[0] += 1",
    "        held[counter[0]] = (sender, str(app), str(reason))",
    "        if sender not in watches:",
    "            watches[sender] = Gio.bus_watch_name_on_connection(conn, sender, Gio.BusNameWatcherFlags.NONE, None, lambda c, n: gone(n))",
    "        inv.return_value(GLib.Variant('(u)', (counter[0],)))",
    "        emit()",
    "    elif method == 'UnInhibit':",
    "        (cookie,) = params.unpack()",
    "        if held.pop(cookie, None) is not None: emit()",
    "        inv.return_value(None)",
    "    elif method == 'Lock':",
    "        print(json.dumps({'lock': True}), flush=True); inv.return_value(None)",
    "    elif method in ('GetActive', 'SetActive'): inv.return_value(GLib.Variant('(b)', (False,)))",
    "    elif method in ('GetActiveTime', 'GetSessionIdleTime', 'Throttle'): inv.return_value(GLib.Variant('(u)', (0,)))",
    "    else: inv.return_value(None)",
    "info = Gio.DBusNodeInfo.new_for_xml(XML)",
    "def acquired_bus(conn, name):",
    "    for path in ('/org/freedesktop/ScreenSaver', '/ScreenSaver'):",
    "        conn.register_object(path, info.interfaces[0], call, None, None)",
    "Gio.bus_own_name(Gio.BusType.SESSION, 'org.freedesktop.ScreenSaver', Gio.BusNameOwnerFlags.NONE, acquired_bus,",
    "    lambda c, n: print(json.dumps({'owner': True}), flush=True),",
    "    lambda c, n: print(json.dumps({'owner': False}), flush=True))",
    "loop = GLib.MainLoop()",
    "parent = os.getppid()",
    "def alive():",
    "    if os.getppid() != parent: loop.quit()",
    "    return True",
    "GLib.timeout_add_seconds(5, alive)",
    "signal.signal(signal.SIGTERM, lambda *a: loop.quit())",
    "loop.run()"
  ].join("\n")
}

// One line from the program above, or null for anything else.
function parseBusLine(line) {
  var t = String(line || "").trim()
  if (t === "" || t.charAt(0) !== "{") return null
  try { var j = JSON.parse(t); return isPlainObject(j) ? j : null } catch (e) { return null }
}

// The holders, as the hero line says them: "Firefox — video playing", and
// how many more when several hold it at once.
function inhibitorLabel(list) {
  var l = Array.isArray(list) ? list : []
  if (!l.length) return ""
  var app = String(l[0].app || "").trim() || "an app"
  var why = String(l[0].reason || "").trim().replace(/[-_]+/g, " ").toLowerCase()
  var s = app + (why !== "" ? " — " + why : "")
  if (s.length > 44) s = s.substring(0, 43) + "…"
  return l.length > 1 ? s + ", +" + (l.length - 1) : s
}

// hyprctl activewindow -j: 2 is fullscreen (1 is only maximised).
function isFullscreen(json) {
  try { var j = JSON.parse(String(json || "")); return isPlainObject(j) && Number(j.fullscreen) === 2 } catch (e) { return false }
}

// Base64 to text, read as UTF-8. Qt.atob gives one character per byte (and
// is deprecated for strings), so a name with an accent came through wrong.
// Null when the input is not base64 at all.
function fromBase64(s) {
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
  var str = String(s === undefined || s === null ? "" : s).replace(/[\s=]/g, "")
  if (/[^A-Za-z0-9+\/]/.test(str)) return null
  var bytes = []
  for (var i = 0; i < str.length; i += 4) {
    var n = 0, k = 0
    for (var j = 0; j < 4 && i + j < str.length; j++) { n = (n << 6) | alphabet.indexOf(str.charAt(i + j)); k++ }
    n <<= (4 - k) * 6
    if (k > 1) bytes.push((n >> 16) & 255)
    if (k > 2) bytes.push((n >> 8) & 255)
    if (k > 3) bytes.push(n & 255)
  }
  var out = "", p = 0
  while (p < bytes.length) {
    var b = bytes[p++]
    var extra = b < 128 ? 0 : (b < 224 ? 1 : (b < 240 ? 2 : 3))
    var cp = extra === 0 ? b : (extra === 1 ? b & 31 : (extra === 2 ? b & 15 : b & 7))
    for (var e = 0; e < extra && p < bytes.length; e++) cp = (cp << 6) | (bytes[p++] & 63)
    out += String.fromCodePoint(cp)
  }
  return out
}

// Omarchy's effect ids run words together; the chips say them apart.
var EFFECT_LABELS = { binarypath: "binary path", blackhole: "black hole", bouncyballs: "bouncy balls", colorshift: "colour shift", errorcorrect: "error correct", laseretch: "laser etch", middleout: "middle out", orbittingvolley: "orbiting volley", randomsequence: "random sequence", synthgrid: "synth grid", vhstape: "VHS tape" }
function effectLabel(id) { return EFFECT_LABELS[id] || String(id || "") }

// What an import's error means, for the tile: the common ones in plain
// words, anything else as the tool said it, one line.
function importFailureText(error) {
  var e = String(error || "").trim().split("\n")[0]
  if (e === "") return "it did not finish"
  if (/not logged in|\/login|\b401\b|unauthori[sz]ed|authentication/i.test(e)) return "the agent isn't signed in"
  if (/rate.?limit|quota|\b429\b|usage limit|over.*limit|too many requests/i.test(e)) return "the agent is over its limit"
  if (/timed? ?out/i.test(e)) return "it took too long and was stopped"
  if (/no art in it/i.test(e)) return "the agent answered without any art"
  return e.length > 90 ? e.substring(0, 89) + "…" : e
}

// ---- menu override (jsonc) ------------------------------------------------------

var MENU_MARKER = "// stelline: System > Screensaver opens Stelline (Finish setup)"
// With the plugin gone (removed without Put the old one back, or the shell
// not up yet) the entry falls through to the stock launcher, so System ›
// Screensaver never goes dead.
var MENU_ENTRY = '"system.screensaver": {"action": "omarchy-shell stelline show || omarchy-launch-screensaver force"},'
// What an earlier version wrote; still taken out when the override goes.
var MENU_ENTRY_OLD = '"system.screensaver": {"action": "omarchy-shell stelline show"},'

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
    return t !== MENU_MARKER && t !== MENU_ENTRY && t !== MENU_ENTRY_OLD
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

// Stock's timeouts when shell.json names none: the screensaver at 2:30, the
// lock at 5:00.
var DEFAULT_TIMEOUTS = { screensaver: 150, lock: 300 }

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
  var screensaver = s && isFinite(Number(s.screensaver)) && hasTiming(s.screensaver)
    ? Math.max(0, Math.floor(Number(s.screensaver)))
    : secondsFromConfig(idleBlock.screensaver, DEFAULT_TIMEOUTS.screensaver)
  var lockRaw = s && hasTiming(s.lock) ? s.lock : secondsFromConfig(idleBlock.lock, DEFAULT_TIMEOUTS.lock)
  var never = lockRaw === "never" || c.lockEnabled === false
  var lock = never ? NEVER_SECONDS : Math.max(0, Math.floor(Number(lockRaw)))
  if (!isFinite(lock)) lock = secondsFromConfig(idleBlock.lock, DEFAULT_TIMEOUTS.lock)
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
  if (!c.shuffle) return ready(c.saver) ? c.saver : fallbackSaver(c)
  var ids = rotation(c, userSavers)
  if (ids.length === 0) return fallbackSaver(c)
  var pool = ids.filter(function(id) { return id !== last })
  if (pool.length === 0) pool = ids
  var r = typeof random === "number" ? random : Math.random()
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))]
}

// The shuffle as a bag: every saver in the set comes up once, in a random
// order, before any comes round again. `bag` is what is left of this round;
// it is trimmed to the set as it is now (ticked since, untick since), and
// refilled when empty — the first of a new round never the one just shown.
// Hands back the pick and the bag to keep.
function drawFromBag(ids, bag, last, random) {
  var set = Array.isArray(ids) ? ids : []
  if (set.length === 0) return { id: last || "", bag: [] }
  var rnd = typeof random === "function" ? random : Math.random
  var left = (Array.isArray(bag) ? bag : []).filter(function(id) { return set.indexOf(id) !== -1 })
  if (left.length === 0) left = set.slice()
  // Never the one just shown, if there is anything else to show; it stays in
  // the bag for later in the round.
  var choices = left.filter(function(id) { return id !== last })
  if (choices.length === 0) choices = left
  var id = choices[Math.min(choices.length - 1, Math.floor(rnd() * choices.length))]
  left.splice(left.indexOf(id), 1)
  return { id: id, bag: left }
}

// ---- widgets ------------------------------------------------------------------
//
// What sits on top of any saver: a clock, what arrived while you were away,
// the coding agent's state. Each is on or off and sits in the tile's corner
// (where they stack, in one fixed order) or in the middle, large. The corner
// is one choice per tile. Defaults come from the old global card settings,
// so nothing anyone had set is lost.
var WIDGETS = ["clock", "notifications", "agent"]
// The one corner an older config set for the whole card, still read so it
// keeps meaning what it meant.
var CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"]
// Where a widget sits: one of the four corners, or the middle of the screen,
// where it is drawn large. Every widget picks its own spot; two in the same
// one stack, in this list's order.
var PLACES = ["top-left", "top-right", "bottom-left", "bottom-right", "centre"]

function placeLabel(place) {
  if (place === "centre") return "Middle"
  var p = String(place).split("-")
  if (p.length !== 2) return ""
  return p[0].charAt(0).toUpperCase() + p[0].slice(1) + " " + p[1]
}

function widgetDefaults(cfg) {
  var card = cfg && isPlainObject(cfg.card) ? cfg.card : {}
  return {
    clock: { on: false, place: "corner", format: "HH:mm", showDate: true, showSeconds: false },
    notifications: { on: card.enabled !== false, place: "corner", detail: typeof card.detail === "string" ? card.detail : "counts" },
    // Which figure the agent is drawn as. The shapes on offer live with the
    // drawings, in savers/Robot.js; nothing stored here means the usual one,
    // and a shape from a later version falls back to it.
    // `detail`: "titles" (the default) says which agent, whether it needs
    // you, and what each session is on (its title, or the project folder);
    // "state" leaves the last out.
    agent: { on: card.showAgent !== false, place: "corner", figure: "", detail: "titles" }
  }
}

// "true" is as good as true: the knobs written over IPC arrive as text.
function boolish(value, fallback) {
  if (typeof value === "boolean") return value
  if (value === "true") return true
  if (value === "false") return false
  return fallback
}

function widgetsOf(settings, cfg) {
  var out = widgetDefaults(cfg)
  var s = isPlainObject(settings) ? settings : {}
  // A clock's knobs from before it was a widget still count — and a saver
  // that carries them was showing a clock, so it still shows one. Anything
  // stored under `widgets` below is a later answer and wins, so a clock
  // that has since been switched off stays off.
  if (typeof s.format === "string") { out.clock.format = s.format; out.clock.on = true }
  if (s.showDate !== undefined) { out.clock.showDate = boolish(s.showDate, out.clock.showDate); out.clock.on = true }
  if (s.showSeconds !== undefined) { out.clock.showSeconds = boolish(s.showSeconds, out.clock.showSeconds); out.clock.on = true }
  var w = isPlainObject(s.widgets) ? s.widgets : {}
  for (var i = 0; i < WIDGETS.length; i++) {
    var key = WIDGETS[i]
    if (isPlainObject(w[key]))
      for (var leaf in w[key]) out[key][leaf] = out[key][leaf] === undefined ? w[key][leaf] : coerce(w[key][leaf], out[key][leaf])
    // "corner" is what was stored before each widget picked its own spot,
    // and it is still the default: it means this tile's corner.
    if (PLACES.indexOf(out[key].place) === -1) out[key].place = cornerOf(settings, cfg)
  }
  // Two ways each to say how much: notifications as counts or with titles
  // ("bodies", once a third way, now reads as titles), an agent with or
  // without what it is on.
  out.notifications.detail = out.notifications.detail === "counts" ? "counts" : "summaries"
  out.agent.detail = out.agent.detail === "state" ? "state" : "titles"
  return out
}

function cornerOf(settings, cfg) {
  var s = isPlainObject(settings) ? settings : {}
  if (CORNERS.indexOf(s.corner) !== -1) return s.corner
  var card = cfg && isPlainObject(cfg.card) ? cfg.card : {}
  return CORNERS.indexOf(card.corner) !== -1 ? card.corner : "bottom-right"
}

// The patch for one widget's knobs: everything stored stays, the given
// leaves change. Hands back the whole `widgets` object, which is what the
// settings writer replaces.
function patchWidget(settings, key, patch) {
  var s = isPlainObject(settings) ? cloneJson(settings) : {}
  var w = isPlainObject(s.widgets) ? s.widgets : {}
  var cur = isPlainObject(w[key]) ? w[key] : {}
  for (var k in patch) cur[k] = patch[k]
  w[key] = cur
  return { widgets: w }
}

// ---- the coding agent -------------------------------------------------------------
//
// What the agent widget knows comes from one probe, run while a saver is up.
// Claude Code keeps a registry of its own running sessions (one file per
// process, with a status it maintains itself), so those are read exactly.
// Every other agent is a running process: whether it has done anything in the
// last few seconds says working or waiting. Nothing here talks to an agent.
var AGENT_STATES = ["needs", "error", "working", "waiting", "idle"]

function agentProbeScript() {
  return [
    "import json, os, re, glob, time",
    "home = os.path.expanduser('~')",
    "run = os.environ.get('XDG_RUNTIME_DIR') or '/tmp'",
    "memo = run + '/stelline-agents.json'",
    "try:",
    "    prev = json.load(open(memo))",
    "except Exception:",
    "    prev = {}",
    "out = []",
    "ticks = {}",
    "cdir = os.environ.get('CLAUDE_CONFIG_DIR') or home + '/.claude'",
    "for p in glob.glob(cdir + '/sessions/*.json'):",
    "    try:",
    "        r = json.load(open(p))",
    "    except Exception:",
    "        continue",
    "    pid = r.get('pid')",
    "    if not isinstance(pid, int) or not os.path.exists('/proc/%d' % pid): continue",
    "    if r.get('kind') not in (None, 'interactive'): continue",
    "    cwd = str(r.get('cwd') or '')",
    "    sid = str(r.get('sessionId') or '')",
    "    title = ''",
    "    last = ''",
    "    tpath = cdir + '/projects/' + re.sub(r'[^A-Za-z0-9]', '-', cwd) + '/' + sid + '.jsonl'",
    "    try:",
    "        with open(tpath, 'rb') as fh:",
    "            fh.seek(0, 2); size = fh.tell(); fh.seek(max(0, size - 240000))",
    "            lines = fh.read().decode('utf-8', 'replace').split('\\n')",
    "        for line in lines:",
    "            if '\"aiTitle\"' not in line and '\"stop_reason\"' not in line and '\"type\":\"user\"' not in line: continue",
    "            try:",
    "                d = json.loads(line)",
    "            except Exception:",
    "                continue",
    "            t = d.get('type')",
    "            if t == 'ai-title' and d.get('aiTitle'): title = str(d['aiTitle'])",
    "            elif t == 'assistant':",
    "                sr = (d.get('message') or {}).get('stop_reason')",
    "                if sr in ('end_turn', 'tool_use'): last = sr",
    "            elif t == 'user':",
    "                c = (d.get('message') or {}).get('content')",
    "                if isinstance(c, str) or (isinstance(c, list) and c and isinstance(c[0], dict) and c[0].get('type') == 'text'): last = 'user'",
    "    except Exception:",
    "        pass",
    "    out.append({'agent': 'claude', 'pid': pid, 'session': sid, 'project': os.path.basename(cwd) or cwd, 'title': title,",
    "                'status': str(r.get('status') or ''), 'waitingFor': str(r.get('waitingFor') or ''), 'last': last,",
    "                'statusAt': r.get('statusUpdatedAt') or 0, 'startedAt': r.get('startedAt') or 0})",
    "others = ['codex', 'gemini', 'opencode', 'pi', 'omp', 'crush', 'copilot', 'grok']",
    "for d in os.listdir('/proc'):",
    "    if not d.isdigit(): continue",
    "    try:",
    "        comm = open('/proc/%s/comm' % d).read().strip()",
    "        if comm not in others: continue",
    "        st = open('/proc/%s/stat' % d).read().rsplit(')', 1)[1].split()",
    "        cpu = int(st[11]) + int(st[12])",
    "        cwd = os.readlink('/proc/%s/cwd' % d)",
    "    except Exception:",
    "        continue",
    "    ticks[d] = cpu",
    "    busy = d not in prev or cpu - int(prev.get(d, 0)) >= 2",
    "    out.append({'agent': comm, 'pid': int(d), 'session': '', 'project': os.path.basename(cwd) or cwd, 'title': '',",
    "                'status': 'busy' if busy else 'idle', 'waitingFor': '', 'last': '', 'statusAt': 0, 'startedAt': 0})",
    "try:",
    "    json.dump(ticks, open(memo, 'w'))",
    "except Exception:",
    "    pass",
    "print(json.dumps({'sessions': out}))"
  ].join("\n")
}

// One session's state, from what the probe saw. Claude's own status wins;
// what it is waiting for tells "needs you" from "finished, waiting".
function agentSessionState(s) {
  if (!isPlainObject(s)) return "idle"
  var status = String(s.status || "")
  var waiting = String(s.waitingFor || "")
  if (status === "busy" || status === "running") return "working"
  if (/permission|approv|question|input|confirm|choice|answer/i.test(waiting)) return "needs"
  if (status === "idle" || status === "") {
    if (s.last === "tool_use" || s.last === "user") return status === "" ? "working" : "waiting"
    return "waiting"
  }
  if (/error|fail|crash/i.test(status)) return "error"
  return "working"
}

function agentUrgency(state) { var at = AGENT_STATES.indexOf(state); return at === -1 ? AGENT_STATES.length : at }

function agentStateLabel(state) {
  if (state === "needs") return "needs you"
  if (state === "working") return "working"
  if (state === "waiting") return "waiting for you"
  if (state === "error") return "hit an error"
  return "idle"
}

// What the probe printed, as sessions with a state each, most pressing first.
function parseAgentProbe(text) {
  var parsed
  try { parsed = JSON.parse(String(text || "")) } catch (e) { return [] }
  var list = parsed && Array.isArray(parsed.sessions) ? parsed.sessions : []
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (!isPlainObject(list[i])) continue
    var s = cloneJson(list[i])
    s.state = agentSessionState(s)
    s.name = agentName(String(s.agent || ""))
    out.push(s)
  }
  out.sort(function(a, b) { return agentUrgency(a.state) - agentUrgency(b.state) || Number(b.statusAt || 0) - Number(a.statusAt || 0) })
  return out
}

// The one line under the robot: what the most pressing session is up to, and
// how many others there are.
// What a session is on — its title, or the project folder — only when the
// tile asks for it ("titles", the default); "state" names the agent and nothing more.
function agentSessionWhat(s, detail) {
  if (detail !== "titles" || !s) return ""
  return s.title ? String(s.title) : (s.project ? String(s.project) : "")
}
function agentSummary(sessions, detail) {
  var list = Array.isArray(sessions) ? sessions : []
  if (list.length === 0) return { state: "idle", count: 0, line: "" }
  var top = list[0]
  var what = agentSessionWhat(top, detail)
  var line = String(top.name || agentName(String(top.agent || "")))
  if (what !== "") line += " · " + what
  if (list.length > 1) {
    var needs = list.filter(function(s) { return s.state === "needs" || s.state === "error" }).length
    line += " · " + list.length + " sessions" + (needs > 1 ? ", " + needs + " need you" : "")
  }
  return { state: top.state, count: list.length, line: line }
}

// ---- user savers ("series") ----------------------------------------------------

// Where the user's own screensavers live, one folder each with a saver.json
// beside the pieces it plays. A folder is a self-contained bundle: copy it to
// another machine and it works there.
var USER_SAVERS_SUBDIR = ".config/omarchy/stelline/savers"

var IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"]
var VIDEO_EXTENSIONS = ["mp4", "mov", "mkv", "webm", "avi", "m4v", "gif"]

// The bash that lists a folder's pictures, sorted, one path a line. `dir`
// is shell text, quoted or a variable.
function findPicturesBash(dir) {
  var names = IMAGE_EXTENSIONS.map(function(e) { return "-iname '*." + e + "'" }).join(" -o ")
  return "find " + dir + " -maxdepth 1 -type f \\( " + names + " \\) 2>/dev/null | sort"
}

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

// Block characters as the braille cell that holds the same dots. Two dots
// span a cell's width and four its height, which is exactly what a block
// glyph divides into, so the swap is lossless and the art keeps its size.
//
// This is how an animation ends up made of dots like everything else. A
// still is painted by AsciiArt, which draws blocks on the dot grid itself;
// an animation is swapped frame by frame as text, because repainting a
// canvas every frame costs three times as much, and text draws whatever
// glyph it is given. So the glyph is changed instead.
var DOT_BITS = [[1, 2, 4, 64], [8, 16, 32, 128]]
var SHADE_ORDER = [[0, 0], [1, 2], [1, 0], [0, 2], [0, 1], [1, 3], [1, 1], [0, 3]]

function brailleOf(pairs) {
  var code = 0
  for (var i = 0; i < pairs.length; i++) code |= DOT_BITS[pairs[i][0]][pairs[i][1]]
  return code === 0 ? " " : String.fromCharCode(0x2800 + code)
}

function boxDots(c0, c1, r0, r1) {
  var out = []
  for (var c = c0; c < c1; c++) for (var r = r0; r < r1; r++) out.push([c, r])
  return out
}

var BLOCK_DOTS = (function () {
  var m = {}
  m["\u2588"] = boxDots(0, 2, 0, 4)
  m["\u2580"] = boxDots(0, 2, 0, 2)
  m["\u2584"] = boxDots(0, 2, 2, 4)
  m["\u258c"] = boxDots(0, 1, 0, 4)
  m["\u2590"] = boxDots(1, 2, 0, 4)
  m["\u2598"] = boxDots(0, 1, 0, 2)
  m["\u259d"] = boxDots(1, 2, 0, 2)
  m["\u2596"] = boxDots(0, 1, 2, 4)
  m["\u2597"] = boxDots(1, 2, 2, 4)
  m["\u259a"] = boxDots(0, 1, 0, 2).concat(boxDots(1, 2, 2, 4))
  m["\u259e"] = boxDots(1, 2, 0, 2).concat(boxDots(0, 1, 2, 4))
  m["\u2599"] = boxDots(0, 1, 0, 2).concat(boxDots(0, 2, 2, 4))
  m["\u259b"] = boxDots(0, 2, 0, 2).concat(boxDots(0, 1, 2, 4))
  m["\u259c"] = boxDots(0, 2, 0, 2).concat(boxDots(1, 2, 2, 4))
  m["\u259f"] = boxDots(1, 2, 0, 2).concat(boxDots(0, 2, 2, 4))
  // the eighths, to the nearest dot
  for (var i = 1; i <= 7; i++) {
    m[String.fromCharCode(0x2580 + i)] = boxDots(0, 2, 4 - Math.max(1, Math.round(i / 2)), 4)
    m[String.fromCharCode(0x2590 - i)] = boxDots(0, Math.max(1, Math.round(i / 4)), 0, 4)
  }
  // the three shades, as how many of the eight are lit
  var shades = { "\u2591": 2, "\u2592": 4, "\u2593": 6 }
  for (var sh in shades) m[sh] = SHADE_ORDER.slice(0, shades[sh])
  var out = {}
  for (var k in m) out[k] = brailleOf(m[k])
  return out
})()

function blocksToBraille(text) {
  var t = String(text || "")
  var out = ""
  for (var i = 0; i < t.length; i++) {
    var ch = t.charAt(i)
    out += BLOCK_DOTS[ch] !== undefined ? BLOCK_DOTS[ch] : ch
  }
  return out
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
  if (j.kind === "empty") {
    var src = isPlainObject(j.source) ? j.source : {}
    var isClock = src.type === "clock"
    return {
      id: id,
      name: typeof j.name === "string" && j.name.trim() !== "" ? j.name.trim() : (isClock ? "Clock" : "Empty"),
      glyph: isClock ? GLYPHS.clock : GLYPHS.empty,
      meta: isClock ? "time and date" : "empty screen",
      file: "savers/Blank.qml",
      kind: "series",
      type: "empty",
      series: { dir: row.dir, kind: "empty", pieces: [], play: "slideshow", fps: 10, dwellSec: 12, frameCount: 0,
        importing: j.importing === true, error: typeof j.error === "string" ? j.error : "", thumbArt: "", thumbImage: "", source: src }
    }
  }
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
  var described = isPlainObject(j.source) && j.source.type === "prompt"
  var meta
  if (importing) meta = described ? "drawing…" : "converting…"
  else if (error === "stopped") meta = "stopped"
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
    "  if [[ -n $folder && -d $folder ]]; then folderFiles=$(" + findPicturesBash("\"$folder\"") + " | jq -R . | jq -sc .); fi",
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

// ---- the colours of a state --------------------------------------------------------
//
// The theme's colors.toml names its colours (`red = "#a77467"`); the shell
// only passes on a few of them. These are the ones a state is shown in.
function parseThemeColors(text) {
  var out = {}
  String(text || "").split("\n").forEach(function(line) {
    var m = /^\s*([a-z_]+)\s*=\s*"(#[0-9a-fA-F]{6,8})"/.exec(line)
    if (m) out[m[1]] = m[2]
  })
  return out
}

// What an agent's state is shown in. Working is the theme's accent; wanting
// you is yellow — it is stopped until you look; finished and waiting is
// green — ready; an error is red; standby is muted. A theme without a named
// colour falls back to a plain one of that hue.
var STATE_HUES = { needs: ["yellow", "#e0af68"], waiting: ["green", "#9ece6a"], error: ["red", ""] }
function stateColor(state, colors, fallbacks) {
  var c = isPlainObject(colors) ? colors : {}
  var f = isPlainObject(fallbacks) ? fallbacks : {}
  if (state === "working") return f.accent || "#7aa2f7"
  if (state === "idle") return f.muted || "#707880"
  var hue = STATE_HUES[state]
  if (!hue) return f.foreground || "#cacccc"
  return c[hue[0]] || (state === "error" && f.urgent ? f.urgent : hue[1] || "#f7768e")
}

// ---- import -----------------------------------------------------------------------

// What the panel collects before Create. `source`: images | folder | video |
// text | prompt | clock | empty (the last two have nothing to convert).
// `style`: ascii (theme-coloured text art) | image (the pictures as they are).
function importDefaults() {
  return { id: "", name: "", source: "", paths: [], words: "", text: "", prompt: "", style: "ascii", fps: 10, seconds: 20, animated: true, order: "shuffle", detail: DEFAULT_DETAIL }
}

// ---- the composer ----------------------------------------------------------
//
// One card: pick a kind, and it asks only for what that kind needs. Words
// are drawn as a title card; pictures and clips are converted; a description
// goes to the agent, with pictures to draw from where it can look at them.

// Where "Describe it" goes, as the service probes it: "agent:<id>" or "api".
// Which of those can be handed a picture along with the words.
var SEES_PICTURES = ["agent:claude", "api"]
function seesPictures(ai) { return SEES_PICTURES.indexOf(String(ai || "")) !== -1 }

// A list of picked or pasted paths, sorted into what the card holds: a
// folder, one clip, or pictures. A lone GIF is a clip (it may move); among
// pictures it is a picture (its first frame).
function classifyPaths(paths) {
  var list = Array.isArray(paths) ? paths.filter(function(p) { return typeof p === "string" && p !== "" }) : []
  var dirs = list.filter(function(p) { return p.charAt(p.length - 1) === "/" && p.length > 1 })
  var files = list.filter(function(p) { return dirs.indexOf(p) === -1 })
  if (dirs.length > 0) return { source: "folder", paths: [dirs[0].replace(/\/+$/, "")] }
  if (files.length === 0) return null
  if (files.length === 1 && (isVideoPath(files[0]) || extensionOf(files[0]) === "gif")) return { source: "video", paths: files }
  var pictures = files.filter(isImagePath)
  if (pictures.length === 0) {
    var clips = files.filter(isVideoPath)
    return clips.length ? { source: "video", paths: [clips[0]] } : null
  }
  return { source: "images", paths: pictures }
}

// How many pictures a description can be drawn from.
var DESCRIBE_PICTURES = 4

// Something new attached to the draft. A folder or a clip stands alone;
// pictures join pictures already there. What was attached decides the kind,
// except on a card already for pictures or a description: there a lone GIF
// is a picture, and a description takes pictures and nothing else.
function attach(draft, found) {
  var d = isPlainObject(draft) ? cloneJson(draft) : importDefaults()
  if (!found || !found.source) return d
  if (found.source === "video" && (d.kind === "pictures" || d.kind === "describe") && extensionOf(found.paths[0]) === "gif")
    found = { source: "images", paths: found.paths }
  if (d.kind === "describe") {
    if (found.source !== "images") return d
  } else d.kind = found.source === "video" ? "clip" : "pictures"
  if (found.source === "images" && d.source === "images") {
    var have = Array.isArray(d.paths) ? d.paths.slice() : []
    for (var i = 0; i < found.paths.length; i++) if (have.indexOf(found.paths[i]) === -1) have.push(found.paths[i])
    d.paths = have
  } else {
    d.source = found.source
    d.paths = found.paths.slice()
  }
  if (d.kind === "describe") d.paths = d.paths.slice(0, DESCRIBE_PICTURES)
  return d
}

// Another kind picked on the card: what is attached stays only if the new
// kind can use it — pictures carry over between Pictures and Describe (as
// many as a description takes, and only for an agent that can look at
// them); a clip only suits Clip.
function chooseKind(draft, kind, ai) {
  var d = isPlainObject(draft) ? cloneJson(draft) : importDefaults()
  d.kind = kind
  var keep = d.source === "" || !Array.isArray(d.paths) || d.paths.length === 0
    || (kind === "pictures" && (d.source === "images" || d.source === "folder"))
    || (kind === "describe" && d.source === "images" && seesPictures(ai))
    || (kind === "clip" && d.source === "video")
  if (!keep) { d.source = ""; d.paths = [] }
  else if (kind === "describe" && Array.isArray(d.paths)) d.paths = d.paths.slice(0, DESCRIBE_PICTURES)
  return d
}

// The attachment taken off again: the draft goes back to words alone.
function detach(draft) {
  var d = isPlainObject(draft) ? cloneJson(draft) : importDefaults()
  d.source = ""
  d.paths = []
  return d
}

function attachmentLabel(draft, stageDir) {
  if (!isPlainObject(draft) || !draft.source || !Array.isArray(draft.paths) || draft.paths.length === 0) return ""
  if (draft.source === "folder") return baseName(draft.paths[0])
  if (draft.source === "video") return baseName(draft.paths[0])
  if (draft.paths.length !== 1) return draft.paths.length + " pictures"
  return stageDir && draft.paths[0].indexOf(stageDir) === 0 ? "pasted picture" : baseName(draft.paths[0])
}

// Pictures, one or many, from a pick or a folder, can move or sit still in
// either style: a dot matrix lights up or breathes, a picture pushes in
// slowly or holds. A clip already moves, so it is not asked.
function canMove(mode) {
  return mode === "pictures" || mode === "folder"
}
// More than one picture can come round in turn or shuffled.
function canOrder(draft, mode) {
  return mode === "folder" || (mode === "pictures" && Array.isArray(draft.paths) && draft.paths.length > 1)
}

// One picture taken off the card; the last one gone leaves words alone.
function removePicture(draft, path) {
  var d = isPlainObject(draft) ? cloneJson(draft) : importDefaults()
  d.paths = (Array.isArray(d.paths) ? d.paths : []).filter(function(p) { return p !== path })
  if (d.paths.length === 0) d.source = ""
  return d
}

// What can be made, one card each at the top of Add: every kind a shipped
// saver is, and a couple more. `kind` on the draft is the one picked.
var ADD_KINDS = [
  { id: "describe", name: "Describe it", glyph: "󰏫", hint: "your agent draws it" },
  { id: "words", name: "Words", glyph: "󰊄", hint: "big, styled letters" },
  { id: "pictures", name: "Pictures", glyph: "󰋩", hint: "one, or several" },
  { id: "clip", name: "A clip", glyph: "󰕧", hint: "a video or a GIF" },
  { id: "clock", name: "Clock", glyph: "󰥔", hint: "the time, large" },
  { id: "blank", name: "Blank", glyph: "󰝤", hint: "for widgets on top" }
]

// What the card would make of what it holds, for the kind picked: "" while
// something that kind needs is still missing.
function composeMode(draft, ai) {
  if (!isPlainObject(draft) || !draft.kind) return ""
  var words = String(draft.words || "").trim()
  var paths = Array.isArray(draft.paths) ? draft.paths : []
  var pictures = paths.length > 0 && (draft.source === "images" || draft.source === "folder")
  switch (draft.kind) {
  case "describe":
    if (!ai || !words) return ""
    return pictures && draft.source === "images" && seesPictures(ai) ? "describe-pictures" : "describe"
  case "words": return words ? "letters" : ""
  case "pictures": return pictures ? (draft.source === "folder" ? "folder" : "pictures") : ""
  case "clip": return paths.length > 0 && draft.source === "video" ? "clip" : ""
  case "clock": return "clock"
  case "blank": return "blank"
  }
  return ""
}

// A tile's name from a description: the first clause, cut at a word before
// it runs long.
function shortName(text) {
  var first = String(text || "").split(/[,.;:\n]/)[0].trim()
  if (first.length <= 40) return first
  var cut = first.lastIndexOf(" ", 40)
  return (cut > 12 ? first.substring(0, cut) : first.substring(0, 40)).trim()
}

// The import spec the card hands the service. `stageDir` is where pasted
// bytes land, so a pasted picture is not named after its temporary file.
function composeSpec(draft, ai, stageDir) {
  var mode = composeMode(draft, ai)
  if (mode === "") return null
  var spec = importDefaults()
  var words = String(draft.words || "").trim()
  var paths = Array.isArray(draft.paths) ? draft.paths.slice() : []
  if (mode === "describe" || mode === "describe-pictures") {
    spec.source = "prompt"
    spec.prompt = words
    spec.animated = draft.animated !== false
    spec.name = shortName(words)
    if (mode === "describe-pictures") spec.paths = paths.slice(0, 4)
    return spec
  }
  if (mode === "letters") {
    spec.source = "text"
    spec.text = words
    spec.name = words
    return spec
  }
  if (mode === "clock" || mode === "blank") {
    spec.source = mode === "clock" ? "clock" : "empty"
    spec.name = shortName(words)
    return spec
  }
  spec.source = draft.source
  spec.paths = paths
  spec.style = draft.style === "image" ? "image" : "ascii"
  // Pictures move or sit still, and several come round shuffled or in turn;
  // the service turns both into the saver's own settings.
  if (canMove(mode)) spec.animated = draft.animated !== false
  if (spec.style === "ascii") spec.detail = detailLevel(draft.detail)
  else delete spec.detail
  if (canOrder(draft, mode)) spec.order = draft.order === "sequence" ? "sequence" : "shuffle"
  else delete spec.order
  var pasted = stageDir && paths.length === 1 && paths[0].indexOf(stageDir) === 0
  spec.name = words ? shortName(words) : (pasted ? "Pasted picture" : suggestName(paths, "New saver"))
  return spec
}

// Transcoder geometry: braille cells are 2×4 pixels, so 160×64 cells is a
// 320×256 source — plenty for a screen, cheap to paint.
var ASCII_COLUMNS = 160
var ASCII_ROWS = 64

function isEmptySource(source) { return source === "clock" || source === "empty" }

function metaJson(spec, extra) {
  var j = { name: spec.name, kind: isEmptySource(spec.source) ? "empty" : (spec.style === "image" ? "image" : "ascii"), source: { type: spec.source }, created: Math.floor(Date.now() / 1000) }
  var converted = spec.source === "images" || spec.source === "folder" || spec.source === "video"
  if (converted) j.source.paths = spec.paths
  // How much detail the dots were drawn with, so it can be changed later.
  if (converted && spec.style !== "image") j.source.detail = detailLevel(spec.detail)
  if (spec.source === "text") j.source.text = spec.text
  if (spec.source === "prompt") { j.source.prompt = spec.prompt; j.source.animated = spec.animated !== false; if (Array.isArray(spec.paths) && spec.paths.length) j.source.paths = spec.paths }
  for (var k in (extra || {})) j[k] = extra[k]
  return JSON.stringify(j)
}

// The prompt for a described saver: frames separated by a marker line, so the
// answer parses without depending on any one model's formatting habits.
var FRAME_MARKER = "---FRAME---"
var ART_BEGIN = "===ART==="
var ART_END = "===END==="

// The standing rules, the same for every request: what the art is for and
// how it has to be built. Claude Code and the API take it as the system
// prompt; the other agents get it at the top of the message. A file of the
// owner's own — the house style — is added under it when it exists.
var STYLE_FILE_SUBPATH = ".config/omarchy/stelline/style.md"
var DESCRIBE_EFFORTS = ["low", "medium", "high"]

function aiSystem() {
  return [
    "You draw ASCII art for a screensaver. What you draw fills a screen: one colour on a plain background, scaled up several times, seen from across a room. No captions, titles or lettering unless the subject asks for words.",
    "Grid: you are given the exact width and height. Use all of it — the subject spanning most of the grid, centred, a column or two of margin. Pad every line with spaces to the full width.",
    "Tone: ░▒▓█ is a ramp from faint to solid. Model form with all four, not outlines alone: light where it catches the light, solid in the mass, the mid tones for everything turning between. ▀▄▌▐ place half cells for an edge that falls between rows or columns. Braille (⠁…⣿) packs eight dots into a cell and is the finest tool you have: reach for it when the subject needs fine structure. Keep to one family within a piece so the texture stays even.",
    "How much detail: when nothing is asked for, draw bold shapes that read from across a room. When the subject asks for detail, realism, proportion or a likeness, spend the whole grid on it — model the form with the tone ramp, hold the proportions true, and put the detail where it carries the likeness.",
    "Every character must be one column wide: no fullwidth or wide characters, no emoji, no tabs, no colour or escape codes.",
    "Animation: every frame the same width and height, every line padded to the full width. Small changes from frame to frame; what does not move stays identical, character for character; the last frame leads back into the first, so the loop is seamless.",
    "Answer with the art alone, between the marker lines asked for: no title, no explanation, no code fences."
  ].join("\n")
}

// A likeness or fine work asked for in the subject's own words. The rules
// tell the model to spend the grid on it; the plan gives it the room.
var DETAIL_WORDS = /\b(detail(ed|s)?|realistic|photo ?realistic|lifelike|true to|exactly|likeness|accurate|proportion(s|al)?|intricate|fine|precise|faithful|real)\b/i
function wantsDetail(text) { return DETAIL_WORDS.test(String(text || "")) }

// How big, and how many. Resolution and frame count trade against each
// other: the whole answer has to arrive in one reply, so a still can be
// four times the size of a frame of a long loop. Detail buys room by
// spending frames — six good frames beat twelve coarse ones.
function artPlan(spec) {
  var detailed = wantsDetail(spec && spec.prompt)
  var animated = !spec || spec.animated !== false
  if (!animated) return { columns: detailed ? 160 : 120, rows: detailed ? 46 : 36, frames: 1, detailed: detailed }
  return detailed
    ? { columns: 120, rows: 38, frames: 6, detailed: true }
    : { columns: 80, rows: 28, frames: 10, detailed: false }
}

// The one request. `previous` is the earlier description when this is a
// change to a drawing already made: the drawing itself is appended by the
// script, between markers of its own.
var PREVIOUS_BEGIN = "===PREVIOUS==="
var PREVIOUS_END = "===END PREVIOUS==="

function aiPrompt(description, plan, pictures, previous) {
  var p = plan && plan.columns ? plan : artPlan({ prompt: description, animated: false })
  var n = Math.max(1, Math.min(60, Math.round(Number(p.frames) || 1)))
  var pics = Array.isArray(pictures) ? pictures.filter(function(q) { return typeof q === "string" && q !== "" }) : []
  var lines = [
    "Subject: " + String(description || "").trim(),
    "Grid: exactly " + p.columns + " columns by " + p.rows + " lines.",
    pics.length
      ? "The " + (pics.length === 1 ? "picture is" : "pictures are") + " at " + pics.join(", ") + ": look first, then draw what " + (pics.length === 1 ? "it shows" : "they show") + ", the way the subject asks."
      : "",
    previous !== undefined && previous !== null
      ? "You drew this subject before, described then as: " + String(previous).trim() + ". That drawing follows, between " + PREVIOUS_BEGIN + " and " + PREVIOUS_END + ". Keep what is right about it and change it to match the subject as described now."
      : "",
    n > 1
      ? "Produce " + n + " frames of a looping animation, separated by a line containing only " + FRAME_MARKER + "."
      : "Produce one piece.",
    "Put a line containing only " + ART_BEGIN + " before the art and a line containing only " + ART_END + " after it."
  ]
  return lines.filter(function(l) { return l !== "" }).join("\n")
}

// Which agent answers, the same way the described savers pick one.
// One Stelline knows how to ask (AGENTS) and that is installed; Claude
// Code if the default is neither. The service's probe runs the same lines.
function agentPickBash() {
  return [
    "agent=$(omarchy-default-agent 2>/dev/null || true)",
    "case $agent in " + Object.keys(AGENTS).join("|") + ") command -v \"$agent\" >/dev/null 2>&1 || agent='' ;; *) agent='' ;; esac",
    "[[ -z $agent ]] && command -v claude >/dev/null 2>&1 && agent=claude"
  ].join("\n")
}

// Who answers "Describe it", for the card: "agent:<id>", "api" with only an
// API key, or "none".
function aiProbeScript() {
  return agentPickBash() + "\nif [[ -n $agent ]]; then echo \"agent:$agent\"; elif [[ -n ${ANTHROPIC_API_KEY:-} ]]; then echo api; else echo none; fi"
}

// What a described saver is drawn with, from the settings: the agent's own
// model unless one is named, at a known effort.
function describeSettings(cfg) {
  var d = cfg && isPlainObject(cfg.describe) ? cfg.describe : {}
  var effort = String(d.effort || "").toLowerCase()
  return { model: String(d.model || "").trim(), effort: DESCRIBE_EFFORTS.indexOf(effort) === -1 ? "medium" : effort }
}

// The coding agents Omarchy knows, by the names they go by — what the agent
// widget calls a running one.
var AGENT_NAMES = {
  claude: "Claude Code", codex: "Codex", gemini: "Gemini", opencode: "OpenCode",
  copilot: "GitHub Copilot", crush: "Crush", pi: "Pi", omp: "Oh My Pi", grok: "Grok"
}

function agentName(id) {
  return AGENT_NAMES[id] || String(id || "")
}

// The ones "Describe it" may ask: only those that can be run with no tools
// at all. A description is untrusted text — typed, pasted, or read out of an
// attached picture — and an agent that can run commands or read files can be
// talked into doing so with the user's permissions, and into sending what it
// read to its provider. Each was tested with a description that tells it to
// read a file and run a command; these did neither:
//   Claude Code  --tools '' (only Read with pictures attached, and it runs in
//                the pictures' folder, outside which Read is refused)
//   Copilot      no tool available, shell and write denied as well
//   Pi, Oh My Pi --no-tools
// Not asked, because their one-shot modes keep tools: OpenCode (--pure leaves
// its shell; its plan agent still runs read-only commands), Codex, Gemini and
// Grok (read-only modes, which still read files), Crush (no switch at all).
// With one of those as the default, Claude Code answers if installed, then the
// API. `$model` and `$effort` come from the settings; Claude Code alone takes
// the standing rules as its system prompt (in place of its own, which is
// about code), the others get them at the top of the message.
var AGENTS = {
  claude:  { argv: "claude -p \"$prompt\" --output-format text --tools \"$tools\" --no-session-persistence --effort \"$effort\" ${model:+--model \"$model\"} --system-prompt \"$system\"" },
  copilot: { argv: "copilot -p \"$prompt\" --output-format text --available-tools none --deny-tool shell --deny-tool write" },
  pi:      { argv: "pi -p --no-tools --no-session --no-context-files \"$prompt\"" },
  omp:     { argv: "omp -p --no-tools --no-session \"$prompt\"" }
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
  "  [[ $p == *.@(" + IMAGE_EXTENSIONS.concat(VIDEO_EXTENSIONS.filter(function(e) { return IMAGE_EXTENSIONS.indexOf(e) === -1 })).join("|") + ") ]] || return 1",
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
// runtime directory, one file per paste, cleared when a new Add starts.
function clipboardPasteScript(stageDir) {
  return ["set -u", "shopt -s extglob nocasematch",
    "stage=" + shellQuote(stageDir),
    "mkdir -p \"$stage\" || exit 1"].concat(CLIPBOARD_BASH, [
    "if [[ -n $pick ]]; then",
    "  ext=${pick#image/}; [[ $ext == jpeg ]] && ext=jpg",
    "  out=$stage/pasted-$(date +%s%N).$ext",
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

// A braille dot is not square. Two dots span a cell's width and four its
// height, and a monospace cell is far taller than it is wide, so a dot is
// about a tenth taller than it is wide. Convert a picture straight onto that
// grid and it comes out stretched upward by the same tenth. The fix is to
// widen the picture by that much before it is sampled, so the dots map back
// to the right shape on screen.
var DOT_STRETCH = 1.0977

function dotStretch(cellAspect) {
  var a = Number(cellAspect)
  if (!isFinite(a) || a <= 0.1 || a >= 1) return DOT_STRETCH
  return 1 / (2 * a)
}

// How much of a picture's shading the dots keep, from 0 to 4. At 0 it is
// one cut, lit or not, which makes bold shapes and loses what is in the
// shadows; above that the picture is dithered the way the figures are,
// keeping more tones at each step, and the top two lift the local contrast
// so faces and texture survive.
var DETAIL_NAMES = ["bold", "simple", "balanced", "fine", "finest"]
// How much of the screen a picture or a piece of art may take: S, M, L or
// XL (stored as "full"), each a box centred on the screen that the picture
// fits inside whole (never stretched), or Fill, which covers the screen and
// crops what runs past its edges. The corner widgets sit on top where they
// meet. `fit: "cover"` is how Fill was stored before.
// Unset, each keeps what it always did: a picture Full, art in dots L.
var PICTURE_SIZES = ["s", "m", "l", "full", "fill"]
var SIZE_BOXES = {
  image: { s: [0.4, 0.4], m: [0.6, 0.6], l: [0.8, 0.8], full: [1, 1], fill: [1, 1] },
  // Art keeps a margin even at Full: an arrival throws dots in from past the
  // edge of the art.
  ascii: { s: [0.4, 0.38], m: [0.6, 0.56], l: [0.8, 0.75], full: [0.95, 0.9], fill: [1, 1] }
}
function pictureSize(settings, kind) {
  var s = isPlainObject(settings) ? settings : {}
  // Words: S to XL like art (never Fill, which would cut letters off). Unset,
  // the key is "" and a word fits between the corner widgets, centred.
  if (kind === "text") {
    var t = ["s", "m", "l", "full"].indexOf(String(s.size)) !== -1 ? String(s.size) : ""
    if (t === "") return { key: "", w: 0, h: 0, crop: false }
    var tb = SIZE_BOXES.ascii[t]
    return { key: t, w: tb[0], h: tb[1], crop: false }
  }
  var image = kind === "image"
  var key = PICTURE_SIZES.indexOf(String(s.size)) !== -1 ? String(s.size)
    : (image && s.fit === "cover" ? "fill" : (image ? "full" : "l"))
  var box = SIZE_BOXES[image ? "image" : "ascii"][key]
  return { key: key, w: box[0], h: box[1], crop: key === "fill" }
}

var DEFAULT_DETAIL = 2
function detailLevel(v) {
  var n = Math.round(Number(v))
  return isFinite(n) && n >= 0 && n <= 4 ? n : DEFAULT_DETAIL
}
function detailName(v) { return DETAIL_NAMES[detailLevel(v)] }

// `dots_art src out cols rows flags detail`: a prepared picture into
// braille, fitted inside cols × rows cells. `flags` are prep's — --invert
// when the light parts are the subject, --alpha when its shape is — plus
// --no-trim for a clip's frames, which must all keep the same framing.
function dotsArtBash() {
  return [
    "dots_art() {",
    "  local src=$1 out=$2 cols=$3 rows=$4 flags=$5 detail=$6 tones gray='-colorspace Gray -negate' look='' trim='-trim +repage'",
    "  [[ $flags == *--invert* ]] && gray='-colorspace Gray'",
    "  [[ $flags == *--alpha* ]] && gray='-alpha extract'",
    "  [[ $flags == *--no-trim* ]] && trim=''",
    "  case $detail in 0) tones='-threshold 50%' ;; 1) tones='-posterize 3' ;; 2) tones='-posterize 5' ;; 3) tones='-posterize 9' ;; *) tones='-posterize 17' ;; esac",
    "  (( detail >= 3 )) && look='-clahe 25x25%+128+' && look+=$(( detail == 3 ? 2 : 3 ))",
    "  [[ $flags == *--alpha* ]] || gray=\"-background black -alpha remove -alpha off $gray\"",
    "  magick \"$src\" $gray $look $trim -filter Box -resize \"$((cols * 2))x$((rows * 4))\" $tones -depth 8 -compress none pgm:- 2>/dev/null | " +
      "LC_ALL=C awk " + shellQuote(BRAILLE_PACK) + " > \"$out\"",
    "  [[ -s $out ]]",
    "}"
  ].join("\n")
}

// A picture made ready for the dots, on a copy no wider than 800 pixels (a
// wallpaper is several thousand), widened by the dot's stretch. What the
// subject is has to be guessed: a picture that is nearly all opaque is
// flattened and, if it is mostly dark, its light parts are the subject
// (--invert); one with real transparency is a logo, and its shape is the
// subject (--alpha). Sets `prep_path` and `prep_flags` for dots_art.
function prepBash(stretch) {
  var k = (Math.round(dotStretch(stretch) * 10000) / 100).toFixed(2)
  return [
  "prep() {",
  "  prep_path=$1; prep_flags=''; local a m",
  "  magick \"${1//%/%%}[0]\" -auto-orient -resize '800x800>' -resize '" + k + "%x100%' \"$2\" 2>/dev/null || return 0",
  "  prep_path=$2",
  "  a=$(magick \"$2\" -alpha extract -format '%[fx:mean]' info: 2>/dev/null || echo 1)",
  "  if awk -v a=\"$a\" 'BEGIN { exit !(a > 0.9) }'; then",
  "    magick \"$2\" -background black -alpha remove -alpha off \"$2\" 2>/dev/null",
  "    m=$(magick \"$2\" -colorspace Gray -format '%[fx:mean]' info: 2>/dev/null || echo 1)",
  "    prep_flags=$(awk -v m=\"$m\" 'BEGIN { print (m < 0.45) ? \"--invert\" : \"\" }')",
  "  else prep_flags=--alpha",
  "  fi",
  "}"
  ].join("\n")
}

// The first picture of what is attached, converted the way the import will
// convert it, for the card to show before Create: a folder's first picture,
// a clip's frame at one second. Prints `image<TAB>path` (the picture as it
// is, or the clip's frame) and then the art; when it cannot, says why on
// stderr in a few words the card shows. Frames get a name of their own each
// time: an image cache keyed on the path would show the last clip.
function previewScript(stageDir, cellAspect, detail) {
  return ["set -u", "shopt -s nocasematch", prepBash(cellAspect), dotsArtBash(),
    "die() { printf '%s\\n' \"$1\" >&2; exit 1; }",
    "command -v magick >/dev/null 2>&1 || die 'needs ImageMagick (magick)'",
    "stage=" + shellQuote(stageDir),
    "mkdir -p \"$stage\" || die 'no room to make a preview'",
    "rm -f \"$stage\"/frame-*.png",
    "src=$1; extra=''",
    "if [[ -d $src ]]; then src=$(" + findPicturesBash("\"$src\"") + " | head -n1); [[ -n $src ]] || die 'no pictures in that folder'; fi",
    "[[ -f $src ]] || die 'it is not there any more'",
    "img=$src; frame=$stage/frame-$(date +%s%N).png",
    "case $src in",
    "  *.mp4|*.mov|*.mkv|*.webm|*.avi|*.m4v)",
    "    command -v ffmpeg >/dev/null 2>&1 || die 'needs ffmpeg for clips'",
    "    ffmpeg -v error -y -ss 1 -i \"$src\" -frames:v 1 \"$frame\" 2>/dev/null || ffmpeg -v error -y -i \"$src\" -frames:v 1 \"$frame\" 2>/dev/null || die 'the clip could not be read'",
    "    img=$frame; extra=--no-trim ;;",
    "  *.gif) magick \"${src//%/%%}[0]\" \"$frame\" 2>/dev/null && img=$frame ;;",
    "esac",
    "prep \"$img\" \"$stage/prep.png\"",
    "dots_art \"$prep_path\" \"$stage/preview.txt\" " + ASCII_COLUMNS + " " + ASCII_ROWS + " \"$prep_flags $extra\" " + detailLevel(detail) + " || die 'it could not be converted'",
    "printf 'image\\t%s\\n' \"$img\"",
    "cat \"$stage/preview.txt\""
  ].join("\n")
}

// `kind<TAB>path` lines back into { source, paths } for the Add card: a folder
// is a folder, a lone clip is a clip, anything else is pictures.
function parseClipboard(text) {
  var rows = String(text || "").split("\n")
  var list = []
  for (var i = 0; i < rows.length; i++) {
    var at = rows[i].indexOf("\t")
    if (at === -1) continue
    var kind = rows[i].substring(0, at)
    var path = rows[i].substring(at + 1).replace(/\s+$/, "")
    if (path === "") continue
    if (kind === "dir") list.push(path.replace(/\/+$/, "") + "/")
    else if (kind === "file") list.push(path)
  }
  return classifyPaths(list)
}

// What the chooser answered, as a draft attachment: a folder chooser's
// one line is a folder, anything else is sorted by what the files are.
function parsePicked(kind, paths) {
  var list = Array.isArray(paths) ? paths.slice() : []
  if (kind === "folder") return list.length ? { source: "folder", paths: [list[0].replace(/\/+$/, "")] } : null
  return classifyPaths(list)
}

// An import the shell took down with it (a restart or a crash part-way)
// leaves its saver.json saying it is still being made. Given those folders,
// this marks each one stopped, so the tile offers Try again instead of
// waiting for nothing.
function orphanStampBash() {
  return "command -v jq >/dev/null 2>&1 || exit 0; for d in \"$@\"; do f=\"$d/saver.json\"; [[ -f $f ]] || continue; " +
    "jq -c 'del(.importing) | .error=\"stopped\"' \"$f\" > \"$f.tmp\" 2>/dev/null && mv -f \"$f.tmp\" \"$f\" || rm -f \"$f.tmp\"; done; " +
    "[[ -n ${1:-} ]] && touch \"$(dirname \"$1\")/.stamp\"; exit 0"
}

// The bash that builds one saver, written by the service to a file and run
// in the background. Everything lands under `dir`; saver.json is written
// first with importing:true (the tile appears at once) and rewritten at the
// end with the pieces, or with an error the panel shows.
function importScript(spec, rootDir, stageDir) {
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
    // A tile deleted while this ran has nowhere to write and nothing to say.
    // The reason goes into saver.json as data, never spliced into the JSON
    // text: an agent's error line can carry quotes. Without jq (the first
    // thing checked) the reason is that.
    "fail() { [[ -d $dir ]] || { rm -rf \"$tmp\"; exit 1; }; if command -v jq >/dev/null 2>&1; then jq -c --arg e \"$1\" '.error=$e' <<<" + q(metaJson(spec, {})) + " > \"$dir/saver.json\"; else printf %s " + q(metaJson(spec, { error: "needs jq" })) + " > \"$dir/saver.json\"; fi; touch \"$root/.stamp\"; omarchy-notification-send -g " + q("󰀦") + " " + q("Stelline") + " \"$1\" >/dev/null 2>&1 || true; rm -rf \"$tmp\"; exit 1; }",
    "trap 'rm -rf \"$tmp\"' EXIT",
    // What this kind needs, said plainly rather than blamed on the file.
    "need() { command -v \"$1\" >/dev/null 2>&1 || fail \"needs $2\"; }",
    "need jq jq",
    prepBash(spec.cellAspect),
    "printf %s " + q(metaJson(spec, { importing: true })) + " > \"$dir/saver.json\"",
    "touch \"$root/.stamp\"",
    "cols=" + ASCII_COLUMNS + "; rows=" + ASCII_ROWS
  ]
  var finish = function(extraJq) {
    return "jq -c " + (extraJq || ".") + " <<<" + q(metaJson(spec, {})) + " > \"$dir/saver.json\" || fail 'could not write saver.json'"
  }
  var listTxt = "pieces=$(ls -1 \"$dir\"/*.txt 2>/dev/null | xargs -rn1 basename | jq -R . | jq -sc .); [[ $pieces != '[]' ]] || fail 'nothing could be converted'"
  var paths = (spec.paths || []).map(q).join(" ")
  // A folder and a clip are one path each; only it may stand in command position.
  var first = q(String(Array.isArray(spec.paths) && spec.paths.length ? spec.paths[0] : ""))
  var style = spec.style === "image" ? "image" : "ascii"
  // A pasted picture lives in the runtime directory, gone at logout: it is
  // copied into the saver, and saver.json names the copy.
  var keep = function(arr) {
    return stageDir ? "for i in \"${!" + arr + "[@]}\"; do f=${" + arr + "[$i]}; if [[ $f == " + q(stageDir) + "/* ]]; then cp -f \"$f\" \"$dir/\" && " + arr + "[$i]=\"$dir/$(basename \"$f\")\"; fi; done" : ":"
  }
  var srcJson = function(arr) { return "srcjson=$(printf '%s\\n' \"${" + arr + "[@]}\" | jq -R . | jq -sc .)" }

  if (spec.source === "images" || spec.source === "folder") {
    lines.push("srcs=()")
    if (spec.source === "folder") {
      lines.push("while IFS= read -r f; do srcs+=(\"$f\"); done < <(" + findPicturesBash(first) + ")")
    } else {
      lines.push("for f in " + paths + "; do [[ -f $f ]] && srcs+=(\"$f\"); done")
    }
    lines.push("(( ${#srcs[@]} > 0 )) || fail 'no pictures found'")
    if (spec.source === "images") lines.push(keep("srcs"), srcJson("srcs"))
    else lines.push("srcjson=" + q(JSON.stringify(spec.paths || [])))
    if (style === "image") {
      if (spec.source === "folder") lines.push(finish("--arg folder " + first + " '.folder=$folder'"))
      else lines.push(finish("--argjson srcs \"$srcjson\" '.pieces=$srcs | .source.paths=$srcs'"))
    } else {
      lines.push(
        "need magick 'ImageMagick (magick)'",
        dotsArtBash(),
        // drawn again: the old pieces go first, or a folder that has lost a
        // picture keeps showing it
        "rm -f \"$dir\"/[0-9][0-9][0-9].txt",
        "i=0",
        "for f in \"${srcs[@]}\"; do",
        "  i=$((i+1)); n=$(printf %03d \"$i\")",
        "  prep \"$f\" \"$tmp/prep.png\"",
        "  dots_art \"$prep_path\" \"$dir/$n.txt\" \"$cols\" \"$rows\" \"$prep_flags\" " + detailLevel(spec.detail) + " || echo \"skipped $f\" >&2",
        "done",
        listTxt,
        finish("--argjson pieces \"$pieces\" --argjson srcs \"$srcjson\" '.pieces=$pieces | .play=\"slideshow\" | .source.paths=$srcs'")
      )
    }
  } else if (spec.source === "video") {
    var fps = Math.max(2, Math.min(24, Math.round(Number(spec.fps) || 10)))
    var secs = Math.max(1, Math.min(120, Math.round(Number(spec.seconds) || 20)))
    lines.push("src=" + first, "[[ -f $src ]] || fail 'clip not found'", "need ffmpeg ffmpeg")
    if (style === "image") {
      lines.push(
        "ffmpeg -v error -y -i \"$src\" -t " + secs + " -vf \"fps=" + Math.min(fps, 15) + ",scale=960:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3\" \"$dir/clip.gif\" || fail 'ffmpeg could not read the clip'",
        finish("'.pieces=[\"clip.gif\"] | .play=\"animation\"'")
      )
    } else {
      lines.push(
        // Every frame the way the preview drew the first: widened by the
        // dot's stretch, the subject judged once from the first frame, the
        // same detail, and no trimming, so the framing holds still.
        "need magick 'ImageMagick (magick)'",
        dotsArtBash(),
        "ffmpeg -v error -y -i \"$src\" -t " + secs + " -vf \"fps=" + fps + ",scale=$((cols*2)):-2:flags=area,scale=trunc(iw*" + dotStretch(spec.cellAspect).toFixed(4) + "/2)*2:ih\" \"$tmp/f%05d.png\" || fail 'ffmpeg could not read the clip'",
        "shopt -s nullglob; frames=(\"$tmp\"/f*.png); (( ${#frames[@]} > 0 )) || fail 'no frames in that clip'",
        "prep \"${frames[0]}\" \"$tmp/prep.png\"; flags=\"$prep_flags --no-trim\"",
        ": > \"$dir/frames.txt\"",
        "for f in \"${frames[@]}\"; do",
        "  dots_art \"$f\" \"$tmp/frame.txt\" \"$cols\" \"$rows\" \"$flags\" " + detailLevel(spec.detail) + " || continue",
        "  cat \"$tmp/frame.txt\" >> \"$dir/frames.txt\"; printf '\\f' >> \"$dir/frames.txt\"",
        "done",
        "[[ -s \"$dir/frames.txt\" ]] || fail 'the frames could not be converted'",
        finish("'.pieces=[\"frames.txt\"] | .play=\"animation\" | .fps=" + fps + "'")
      )
    }
  } else if (spec.source === "text") {
    // Drawn the same way a wordmark's text is, so a word made here looks
    // like one typed into the wordmark's own settings.
    lines.push(
      "need magick 'ImageMagick (magick)'",
      "( " + wordmarkScript(String(spec.text || ""), dir + "/001.txt").split("\n").join("\n  ") + "\n) || fail 'could not draw the text'",
      finish("'.pieces=[\"001.txt\"] | .play=\"slideshow\"'")
    )
  } else if (spec.source === "prompt") {
    var plan = artPlan(spec)
    var frames = plan.frames
    var pics = (spec.paths || []).filter(function(p) { return typeof p === "string" && p !== "" }).slice(0, 4)
    var chosen = describeSettings({ describe: { model: spec.model, effort: spec.effort } })
    var change = spec.previous === true
    // The pictures go to the agent as they are, numbered, in a folder of
    // their own: the agents that can look at a picture are pointed at it.
    var picNames = pics.map(function(p, i) { return (i + 1) + "-" + baseName(p) })
    lines.push(
      "prompt=" + q(aiPrompt(spec.prompt, plan, picNames, change ? String(spec.previousPrompt || spec.prompt) : undefined)),
      "system=" + q(aiSystem()),
      "style=\"$HOME/" + STYLE_FILE_SUBPATH + "\"",
      "[[ -f $style ]] && system=\"$system\"$'\\n\\nHouse style, from the owner of this screen:\\n'\"$(cat \"$style\")\"",
      "model=" + q(chosen.model) + "; effort=" + q(chosen.effort),
      // A change starts from the drawing there is: it goes with the words,
      // frames marked the way the answer's will be.
      change ? "prev=''; [[ -f \"$dir/frames.txt\" ]] && prev=$(awk 'BEGIN { RS=\"\\f\" } NR > 1 { printf \"" + FRAME_MARKER + "\\n\" } { printf \"%s\", $0 }' \"$dir/frames.txt\")" : "prev=''",
      "[[ -n $prev ]] && prompt=\"$prompt\"$'\\n" + PREVIOUS_BEGIN + "\\n'\"$prev\"$'\\n" + PREVIOUS_END + "'",
      // The pictures the words start from, in the shape each agent takes.
      "imgs=()",
      pics.length ? "for f in " + pics.map(q).join(" ") + "; do [[ -f $f ]] && imgs+=(\"$f\"); done" : ":",
      keep("imgs"),
      "tools=''",
      pics.length ? "mkdir -p \"$tmp/pics\"" : ":",
      pics.length ? "apics=(); for i in \"${!imgs[@]}\"; do n=\"$((i+1))-$(basename \"${imgs[$i]}\")\"; cp -f \"${imgs[$i]}\" \"$tmp/pics/$n\" 2>/dev/null && apics+=(\"$tmp/pics/$n\"); done" : "apics=()",
      // Claude Code may Read, and runs in the pictures' folder: outside it,
      // Read is refused.
      "if (( ${#apics[@]} )); then tools=Read; cd \"$tmp/pics\" || true; fi",
      // The first line that explains itself (sign-in, limits, errors), else the tail.
      "reason() { local r; r=$(grep -m1 -iE 'unauthori|not logged|log ?in|sign ?in|limit|quota|denied|error' \"$1\" 2>/dev/null | sed -E 's/^(ERROR|error)[: ]*//' | cut -c1-160); [[ -n $r ]] || r=$(tail -c 160 \"$1\" 2>/dev/null | tr -s '\\n ' ' '); printf %s \"$r\"; }",
      "out=''; why=''",
      // The system's default agent first; Claude Code if none is set; the
      // API with a key as the last resort.
      agentPickBash(),
      // An agent with no system prompt of its own reads the rules first; the
      // API, if it comes to that, takes them apart again.
      "ask=$prompt",
      "[[ -n $agent && $agent != claude ]] && prompt=\"$system\"$'\\n\\n'\"$prompt\""
    )
    lines = lines.concat(agentCase())
    lines.push(
      // The API gets the pictures as image blocks: PNG, bounded, base64 from
      // files, since a picture is far bigger than an argument may be.
      "if [[ -z $out && -n ${ANTHROPIC_API_KEY:-} ]]; then",
      "  jq -n --arg p \"$ask\" '[{type:\"text\", text:$p}]' > \"$tmp/parts.json\"",
      "  i=0; for f in \"${imgs[@]}\"; do i=$((i+1)); magick \"${f//%/%%}[0]\" -resize '1568x1568>' \"$tmp/img$i.png\" 2>/dev/null || continue; base64 -w0 \"$tmp/img$i.png\" > \"$tmp/img$i.b64\"; jq --rawfile d \"$tmp/img$i.b64\" '[{type:\"image\", source:{type:\"base64\", media_type:\"image/png\", data:$d}}] + .' \"$tmp/parts.json\" > \"$tmp/parts2.json\" && mv \"$tmp/parts2.json\" \"$tmp/parts.json\"; done",
      "  jq -n --slurpfile c \"$tmp/parts.json\" --arg m \"${model:-claude-opus-5}\" --arg e \"$effort\" --arg s \"$system\" '{model:$m, max_tokens:64000, output_config:{effort:$e}, fallbacks:\"default\", system:$s, messages:[{role:\"user\", content:$c[0]}]}' > \"$tmp/body.json\"",
      "  resp=$(curl -s --max-time 600 https://api.anthropic.com/v1/messages -H 'content-type: application/json' -H \"x-api-key: $ANTHROPIC_API_KEY\" -H 'anthropic-version: 2023-06-01' -H 'anthropic-beta: server-side-fallback-2026-07-01' -d @\"$tmp/body.json\") || resp=''",
      "  [[ $(jq -r '.stop_reason // empty' <<<\"$resp\" 2>/dev/null) == refusal ]] && fail 'the model declined that description'",
      "  out=$(jq -r '[.content[]? | select(.type==\"text\") | .text] | join(\"\\n\")' <<<\"$resp\" 2>/dev/null) || out=''",
      "fi",
      "[[ -n $out ]] || fail \"no model answered${why:+ — $why}\"",
      // Keep what sits between the markers (the whole answer if the model
      // skipped them), drop code fences, turn frame markers into form feeds.
      "art=$(printf '%s\\n' \"$out\" | awk -v b=" + ART_BEGIN + " -v e=" + ART_END + " '$0==b{on=1; found=1; next} $0==e{on=0} on{print}'); [[ -n $art ]] || art=$out",
      "printf '%s\\n' \"$art\" | sed -e '/^```/d' -e 's/^" + FRAME_MARKER + "$/\\f/' > \"$dir/frames.txt\"",
      "[[ $(tr -d '\\f[:space:]' < \"$dir/frames.txt\" | wc -c) -gt 20 ]] || fail \"the answer had no art in it${agent:+ ($agent)}\"",
      (pics.length ? srcJson("imgs") : ":"),
      finish((pics.length ? "--argjson srcs \"$srcjson\" " : "") + "'.pieces=[\"frames.txt\"] | .play=" + (frames > 1 ? "\"animation\" | .fps=6" : "\"slideshow\"") + (pics.length ? " | .source.paths=$srcs" : "") + "'")
    )
  } else if (isEmptySource(spec.source)) {
    // Nothing to convert: the folder holds only its saver.json, and what
    // shows is whatever is put on top of the empty screen.
    lines.push(finish("."))
  } else {
    lines.push("fail 'unknown source'")
  }
  lines.push("touch \"$root/.stamp\"")
  if (!isEmptySource(spec.source)) lines.push(notify("󱄄", String(spec.name || id) + " is ready"))
  lines.push("exit 0", "")
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
var RULE_KEYS = ["night", "battery", "theme", "docked"]

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
  // docked, and anything else: a condition with nothing to set.
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
    // What plays is the rotation, not the ticks: with nothing ticked the
    // shuffle is every saver, and every tile says so.
    var inSet = rotation(c, userSavers).indexOf(saverId) !== -1
    return ruleText !== "" ? ruleText : (inSet ? "in the shuffle" : "")
  }
  if (c.saver === saverId) return ruleText !== "" ? "usually · " + ruleText : "usually plays"
  return ruleText
}

// What is going to play, as the panel should name it: the rule's saver when
// one is in force, "shuffle" when the shuffle is on (which saver is not
// knowable), and otherwise the chosen one. The preview and the hero both
// read this, so they cannot disagree with the screensaver.
function playingName(cfg, situation, userSavers) {
  var c = cfg || defaults()
  if (isPlainObject(situation) && situation.saver) {
    var ruled = saverById(situation.saver, userSavers)
    if (ruled) return ruled.name
  }
  if (c.shuffle) return "shuffle"
  var chosen = saverById(c.saver, userSavers) || SAVERS[0]
  return chosen.name
}

// A failed import keeps what it was asked for in its saver.json, so it can
// be asked for again under the same id — the tile stays where it is and
// the retry writes over it. The saver's settings were written the first
// time and stay as they are; the dots are drawn at the detail it recorded.
function retrySpec(saver) {
  var src = saver && saver.series && isPlainObject(saver.series.source) ? saver.series.source : null
  if (!src || !saver.series.error || typeof src.type !== "string" || src.type === "") return null
  var spec = importDefaults()
  spec.source = src.type
  spec.name = saver.name
  spec.retryOf = saver.id
  spec.style = saver.series.kind === "image" ? "image" : "ascii"
  if (Array.isArray(src.paths)) spec.paths = src.paths.slice()
  if (typeof src.text === "string") spec.text = src.text
  if (typeof src.prompt === "string") { spec.prompt = src.prompt; spec.animated = src.animated !== false }
  if (src.detail !== undefined) spec.detail = detailLevel(src.detail)
  delete spec.order
  spec.keepSettings = true
  if ((src.type === "images" || src.type === "folder" || src.type === "video") && spec.paths.length === 0) return null
  if (src.type === "text" && !spec.text) return null
  if (src.type === "prompt" && !spec.prompt) return null
  return spec
}

// The detail a dot-matrix picture or clip saver was drawn with: what it
// recorded, or bold for one made before detail was a choice — that is how
// it was drawn. -1 for anything that has no such choice.
function savedDetail(saver) {
  var series = saver && saver.series
  var src = series && isPlainObject(series.source) ? series.source : null
  if (!src || series.kind !== "ascii" || (src.type !== "images" && src.type !== "folder" && src.type !== "video")) return -1
  return src.detail === undefined ? 0 : detailLevel(src.detail)
}

// The same pictures or clip converted again at another level of detail, under the
// same tile. Only the dots are redone; the saver's settings stay.
function redetailSpec(saver, detail) {
  if (savedDetail(saver) < 0) return null
  var src = saver.series.source
  var paths = Array.isArray(src.paths) ? src.paths.slice() : []
  if (paths.length === 0) return null
  var spec = importDefaults()
  spec.source = src.type
  spec.name = saver.name
  spec.retryOf = saver.id
  spec.style = "ascii"
  spec.paths = paths
  spec.detail = detailLevel(detail)
  spec.keepSettings = true
  return spec
}

// A described saver drawn again from new words, under the same tile, from
// the same pictures if it had any. Failed or not.
function redescribeSpec(saver, words, animated, fromPrevious) {
  var src = saver && saver.series && isPlainObject(saver.series.source) ? saver.series.source : null
  var text = String(words || "").trim()
  if (!src || src.type !== "prompt" || text === "") return null
  var spec = importDefaults()
  spec.source = "prompt"
  spec.prompt = text
  spec.animated = animated !== false
  // A change needs a drawing to change: one that is there, and finished.
  if (fromPrevious && !saver.series.error && !saver.series.importing && Array.isArray(saver.series.pieces) && saver.series.pieces.length > 0) {
    spec.previous = true
    spec.previousPrompt = String(src.prompt || "")
  }
  spec.name = saver.name && String(saver.name).trim() !== "" && shortName(String(src.prompt || "")) !== saver.name ? saver.name : shortName(text)
  spec.retryOf = saver.id
  if (Array.isArray(src.paths)) spec.paths = src.paths.slice()
  return spec
}

// The one grid every frame of an animation is laid on: as wide as the
// widest frame, as tall as the tallest, so a frame a line shorter than the
// next does not make the whole picture breathe.
function frameGrid(frames) {
  var columns = 0, rows = 0
  var list = Array.isArray(frames) ? frames : []
  for (var i = 0; i < list.length; i++) {
    var lines = String(list[i] || "").replace(/\s+$/, "").split("\n")
    rows = Math.max(rows, lines.length)
    for (var k = 0; k < lines.length; k++) columns = Math.max(columns, lines[k].length)
  }
  return { columns: columns, rows: rows }
}

// A shipped tile is deleted by hiding it: nothing on disk to remove, and
// Add can always make another of the same type.
function hideSaver(cfg, saverId) {
  var patch = forgetSaver(cfg, saverId)
  var hidden = Array.isArray(cfg && cfg.hidden) ? cfg.hidden.slice() : []
  if (hidden.indexOf(saverId) === -1) hidden.push(saverId)
  patch.hidden = hidden
  return patch
}

// Drop every reference to a saver that is going away.
function forgetSaver(cfg, saverId) {
  var c = cloneJson(cfg)
  var patch = {}
  if (c.saver === saverId) patch.saver = saverId === DEFAULT_SAVER ? "terminal" : fallbackSaver(c)
  if (Array.isArray(c.shuffleFrom) && c.shuffleFrom.indexOf(saverId) !== -1) patch.shuffleFrom = c.shuffleFrom.filter(function(id) { return id !== saverId })
  if (Array.isArray(c.situations) && c.situations.some(function(s) { return isPlainObject(s) && s.saver === saverId })) {
    patch.situations = c.situations.map(function(s) {
      if (!isPlainObject(s) || s.saver !== saverId) return s
      var t = cloneJson(s); delete t.saver
      return t
    }).filter(function(s) {
      // A rule that only switched savers has nothing left to do.
      return s.saver || hasTiming(s.screensaver) || hasTiming(s.lock)
    })
  }
  if (isPlainObject(c.savers) && saverId in c.savers) { patch.savers = cloneJson(c.savers); delete patch.savers[saverId] }
  return patch
}

if (typeof module !== "undefined") {
  module.exports = {
  timingsSummary: timingsSummary,
  shufflable: shufflable, shuffleEvery: shuffleEvery,
  pictureSize: pictureSize,
  appGlyph: appGlyph, moreLine: moreLine,
  effectLabel: effectLabel, importFailureText: importFailureText,
  agentSessionWhat: agentSessionWhat,
  screenSaverBusScript: screenSaverBusScript, parseBusLine: parseBusLine, inhibitorLabel: inhibitorLabel, isFullscreen: isFullscreen,
  fromBase64: fromBase64,
  orphanStampBash: orphanStampBash,
    PLUGIN_ID: PLUGIN_ID,
    SAVERS: SAVERS,
    saverById: saverById,
    rotation: rotation,
    nextSaver: nextSaver,
    defaults: defaults,
    isPlainObject: isPlainObject,
    cloneJson: cloneJson,
    findEntry: findEntry,
    mergeSettings: mergeSettings,
    fullSettings: fullSettings,
    secondsFromConfig: secondsFromConfig,
    NEVER_SECONDS: NEVER_SECONDS,
    DEFAULT_TIMEOUTS: DEFAULT_TIMEOUTS,
    effectiveTimeouts: effectiveTimeouts,
    firstTimeout: firstTimeout,
    pickSaver: pickSaver,
    drawFromBag: drawFromBag,
    DEFAULT_SAVER: DEFAULT_SAVER,
    TTFX_EFFECTS: TTFX_EFFECTS,
    TTFX_MOODS: TTFX_MOODS,
    moodOf: moodOf,
    hhmm: hhmm,
    inWindow: inWindow,
    situationMatches: situationMatches,
    activeSituation: activeSituation,
    situationLabel: situationLabel,
    hasTiming: hasTiming,
    timingsRuleIndex: timingsRuleIndex,
    timingsRule: timingsRule,
    setTimingsRule: setTimingsRule,
    GLYPHS: GLYPHS,
    hideSaver: hideSaver,
    boolish: boolish,
    widgetsOf: widgetsOf,
    PLACES: PLACES,
    placeLabel: placeLabel,
    cornerOf: cornerOf,
    patchWidget: patchWidget,
    metaJson: metaJson,
    agentProbeScript: agentProbeScript,
    agentSessionState: agentSessionState,
    agentStateLabel: agentStateLabel,
    parseAgentProbe: parseAgentProbe,
    agentSummary: agentSummary,
    mmss: mmss,
    digest: digest,
    terminalLoop: terminalLoop,
    terminalArgv: terminalArgv,
    shellQuote: shellQuote,
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
    saverType: saverType,
    wordmarkText: wordmarkText,
    wordmarkScript: wordmarkScript,
    DEFAULT_WORDMARK: DEFAULT_WORDMARK,
    USER_SAVERS_SUBDIR: USER_SAVERS_SUBDIR,
    IMAGE_EXTENSIONS: IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS: VIDEO_EXTENSIONS,
    extensionOf: extensionOf,
    isImagePath: isImagePath,
    isVideoPath: isVideoPath,
    slugify: slugify,
    uniqueId: uniqueId,
    suggestName: suggestName,
    splitFrames: splitFrames,
    blocksToBraille: blocksToBraille,
    userSaverFromScan: userSaverFromScan,
    parseScan: parseScan,
    scanScript: scanScript,
    importDefaults: importDefaults,
    ASCII_COLUMNS: ASCII_COLUMNS,
    ASCII_ROWS: ASCII_ROWS,
    AGENTS: AGENTS,
    agentName: agentName,
    aiPrompt: aiPrompt,
    aiSystem: aiSystem,
    artPlan: artPlan,
    wantsDetail: wantsDetail,
    describeSettings: describeSettings,
    clipboardProbeScript: clipboardProbeScript,
    clipboardPasteScript: clipboardPasteScript,
    parseClipboard: parseClipboard,
    parsePicked: parsePicked,
    previewScript: previewScript,
    dotStretch: dotStretch,
    DOT_STRETCH: DOT_STRETCH,
    classifyPaths: classifyPaths,
    attach: attach,
    detach: detach,
    attachmentLabel: attachmentLabel,
    seesPictures: seesPictures,
    DESCRIBE_PICTURES: DESCRIBE_PICTURES,
    chooseKind: chooseKind,
    findPicturesBash: findPicturesBash,
    aiProbeScript: aiProbeScript,
    composeMode: composeMode,
    canMove: canMove,
    savedDetail: savedDetail,
    redetailSpec: redetailSpec,
    parseThemeColors: parseThemeColors,
    stateColor: stateColor,
    DEFAULT_DETAIL: DEFAULT_DETAIL,
    detailLevel: detailLevel,
    detailName: detailName,
    ADD_KINDS: ADD_KINDS,
    canOrder: canOrder,
    removePicture: removePicture,
    composeSpec: composeSpec,
    shortName: shortName,
    redescribeSpec: redescribeSpec,
    frameGrid: frameGrid,
    importScript: importScript,
    deleteScript: deleteScript,
    RULE_KEYS: RULE_KEYS,
    isDocked: isDocked,
    dockedNoLock: dockedNoLock,
    setDockedNoLock: setDockedNoLock,
    ruleFor: ruleFor,
    ruleHas: ruleHas,
    defaultCondition: defaultCondition,
    setRuleCondition: setRuleCondition,
    patchRuleCondition: patchRuleCondition,
    playsLabel: playsLabel,
    playingName: playingName,
    retrySpec: retrySpec,
    forgetSaver: forgetSaver
  }
}
