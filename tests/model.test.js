const test = require("node:test")
const assert = require("node:assert/strict")
const M = require("../StellineModel.js")

test("defaults pick the wordmark and leave every situation disabled", () => {
  const d = M.defaults()
  assert.equal(d.saver, "wordmark")
  assert.equal(d.situations.length, 3)
  assert.ok(d.situations.every((s) => s.enabled === false))
})

test("findEntry walks bar layout sections and plugins[]", () => {
  const cfg = { bar: { layout: { left: [], center: [{ id: M.PLUGIN_ID, saver: "clock" }], right: [] } }, plugins: [] }
  assert.equal(M.findEntry(cfg, M.PLUGIN_ID).saver, "clock")
  assert.equal(M.findEntry({ plugins: [M.PLUGIN_ID] }, M.PLUGIN_ID).id, M.PLUGIN_ID)
  assert.equal(M.findEntry({ plugins: [{ id: "other" }] }, M.PLUGIN_ID), null)
})

test("mergeSettings coerces strings from `omarchy bar set` and merges per-saver objects", () => {
  const cfg = M.mergeSettings({ saver: "matrix", shuffle: "true", savers: { matrix: { fps: "12" } } })
  assert.equal(cfg.saver, "matrix")
  assert.equal(cfg.shuffle, true)
  assert.equal(cfg.savers.matrix.fps, 12)
  assert.equal(cfg.savers.matrix.density, 0.6)
  assert.equal(cfg.savers.clock.format, "HH:mm")
})

test("mergeSettings falls back to wordmark for an unknown saver", () => {
  assert.equal(M.mergeSettings({ saver: "nope" }).saver, "wordmark")
})

test("fullSettings applies a patch and always carries the id", () => {
  const full = M.fullSettings(M.defaults(), { saver: "blank" })
  assert.equal(full.id, M.PLUGIN_ID)
  assert.equal(full.saver, "blank")
  assert.equal(full.lockEnabled, true)
})

test("rotation is every native saver, or the shuffle set when shuffle is on", () => {
  assert.deepEqual(M.rotation(M.defaults()), ["wordmark", "clock", "matrix", "blank"])
  assert.deepEqual(M.rotation(M.mergeSettings({ shuffle: true, shuffleFrom: ["clock", "terminal", "nope"] })), ["clock"])
  assert.equal(M.nextSaver(M.defaults(), "blank"), "wordmark")
  assert.equal(M.nextSaver(M.defaults(), "unknown"), "wordmark")
  assert.equal(M.saverFile("clock"), "savers/Clock.qml")
  assert.equal(M.saverFile("terminal"), "")
})

test("effectiveTimeouts reads shell.json, honours the lock switch and situation overrides", () => {
  const d = M.defaults()
  assert.deepEqual(M.effectiveTimeouts({ screensaver: 150, lock: 300 }, d, null),
    { screensaver: 150, lock: 300, screensaverEnabled: true, lockEnabled: true })
  assert.deepEqual(M.effectiveTimeouts({}, d, null).screensaver, 150)
  const noLock = M.effectiveTimeouts({ screensaver: 10, lock: 40 }, M.mergeSettings({ lockEnabled: false }), null)
  assert.equal(noLock.lockEnabled, false)
  assert.equal(noLock.lock, M.NEVER_SECONDS)
  const sit = M.effectiveTimeouts({ screensaver: 150, lock: 300 }, d, { screensaver: 90, lock: "never" })
  assert.equal(sit.screensaver, 90)
  assert.equal(sit.lockEnabled, false)
  assert.equal(M.firstTimeout(sit), 90)
  assert.equal(M.firstTimeout(M.effectiveTimeouts({ screensaver: 300, lock: 60 }, d, null)), 60)
  const off = M.effectiveTimeouts({}, M.mergeSettings({ screensaverEnabled: false, lockEnabled: false }), null)
  assert.equal(M.firstTimeout(off), M.NEVER_SECONDS)
})

test("pickSaver: situation wins, then the chosen saver, then a shuffle that avoids repeats", () => {
  const d = M.defaults()
  assert.equal(M.pickSaver(d, { saver: "blank" }, "wordmark", 0), "blank")
  assert.equal(M.pickSaver(d, null, "wordmark", 0), "wordmark")
  const sh = M.mergeSettings({ shuffle: true, shuffleFrom: ["clock", "matrix"] })
  assert.equal(M.pickSaver(sh, null, "clock", 0.99), "matrix")
  assert.equal(M.pickSaver(sh, null, "matrix", 0.0), "clock")
  const one = M.mergeSettings({ shuffle: true, shuffleFrom: ["clock"] })
  assert.equal(M.pickSaver(one, null, "clock", 0.5), "clock")
})

test("situations: battery, night (wrapping midnight) and theme; first enabled match wins; unknown keys never match", () => {
  const ctx = { onBattery: true, batteryPercent: 42, minuteOfDay: 23 * 60, themeName: "hackerman" }
  const list = [
    { id: "a", enabled: false, when: { battery: {} }, saver: "blank" },
    { id: "b", enabled: true, when: { battery: { below: 30 } }, saver: "blank" },
    { id: "c", enabled: true, when: { night: { from: "22:00", to: "07:00" } }, saver: "clock" },
    { id: "d", enabled: true, when: { theme: { name: "Hackerman" } }, saver: "matrix" }
  ]
  assert.equal(M.activeSituation(list, ctx).id, "c")
  assert.equal(M.activeSituation(list, { ...ctx, minuteOfDay: 12 * 60 }).id, "d")
  assert.equal(M.activeSituation(list, { ...ctx, minuteOfDay: 12 * 60, themeName: "nord", batteryPercent: 10 }).id, "b")
  assert.equal(M.activeSituation(list, { onBattery: false, minuteOfDay: 12 * 60, themeName: "nord" }), null)
  assert.equal(M.activeSituation([{ id: "x", enabled: true, when: { weather: { is: "rain" } } }], ctx), null)
  assert.equal(M.activeSituation([{ id: "y", enabled: true, when: {} }], ctx), null)
  assert.ok(M.inWindow(2 * 60, M.hhmm("22:00"), M.hhmm("07:00")))
  assert.ok(!M.inWindow(12 * 60, M.hhmm("22:00"), M.hhmm("07:00")))
  assert.equal(M.hhmm("25:00"), -1)
  assert.equal(M.situationLabel(list[1]), "Battery below 30%")
  assert.equal(M.situationLabel(list[2]), "Night 22:00–07:00")
  assert.equal(M.situationEffect({ saver: "blank", screensaver: 90, lock: 180 }), "Blank · 1:30 / 3:00")
  assert.equal(M.situationEffect({ saver: "clock" }), "Clock · keep timings")
  assert.equal(M.TTFX_EFFECTS.length, 37)
})

test("digest groups notifications by app, keeps old history out, sorts by urgency then recency", () => {
  const lines = [
    JSON.stringify({ app: "Signal", summary: "Alice", body: "lunch?", urgency: 1, timestamp: 2000, glyph: "" }),
    JSON.stringify({ app: "Signal", summary: "Bob", body: "ok", urgency: 1, timestamp: 3000 }),
    JSON.stringify({ app: "omarchy-action", summary: "Time to recharge!", body: "Battery is down to 10%", urgency: 2, timestamp: 1000, glyph: "󱐋" }),
    JSON.stringify({ app: "Mail", summary: "old", urgency: 1, timestamp: 100, __history: true }),
    "not json"
  ].join("\n")
  const g = M.digest(lines, 500, 4)
  assert.deepEqual(g.map((x) => x.app), ["Omarchy", "Signal"])
  assert.equal(g[1].count, 2)
  assert.equal(g[1].latestSummary, "Bob")
  assert.equal(M.totalCount(g), 3)
  assert.equal(M.digest(lines, 0, 1).length, 1)
})

test("terminalLoop pins only real effects and drops its traps before pkill", () => {
  const loop = M.terminalLoop(["matrix", "bogus", "decrypt"])
  assert.match(loop, /--include-effects matrix decrypt --no-eol/)
  assert.match(loop, /trap - SIGINT SIGTERM SIGHUP SIGQUIT/)
  assert.doesNotMatch(M.terminalLoop([]), /--include-effects/)
  assert.equal(M.terminalArgv("org.alacritty.Alacritty", "/usr/share/omarchy", "/run/x.sh")[0], "alacritty")
  assert.equal(M.terminalArgv("foot", "/usr/share/omarchy", "/run/x.sh").indexOf("-e"), -1)
  assert.equal(M.terminalArgv("wezterm", "/usr/share/omarchy", "/run/x.sh"), null)
  assert.equal(M.shellQuote("it's"), "'it'\\''s'")
})

test("finish setup removes StayAwake from the indicators, remembers the list, and undo restores it exactly", () => {
  const mk = (items) => ({ bar: { layout: { left: [], center: [{ id: "omarchy.indicators", ...(items ? { items } : {}) }, { id: M.PLUGIN_ID }], right: [] } }, plugins: [] })
  const c1 = mk(["ScreenRecording", "Reminder", "NightLight", "Dnd", "StayAwake"])
  assert.ok(M.stayAwakeIndicatorShown(c1))
  assert.ok(M.applyFinishSetup(c1, M.PLUGIN_ID))
  assert.deepEqual(c1.bar.layout.center[0].items, ["ScreenRecording", "Reminder", "NightLight", "Dnd"])
  assert.deepEqual(M.findEntry(c1, M.PLUGIN_ID).setup, { done: true, version: 1, indicatorsItemsBefore: ["ScreenRecording", "Reminder", "NightLight", "Dnd", "StayAwake"] })
  assert.ok(!M.stayAwakeIndicatorShown(c1))
  assert.ok(M.applyUndoSetup(c1, M.PLUGIN_ID))
  assert.deepEqual(c1.bar.layout.center[0].items, ["ScreenRecording", "Reminder", "NightLight", "Dnd", "StayAwake"])
  // absent items = the six defaults; undo deletes the key again
  const c2 = mk(null)
  assert.ok(M.stayAwakeIndicatorShown(c2))
  M.applyFinishSetup(c2, M.PLUGIN_ID)
  assert.deepEqual(c2.bar.layout.center[0].items, ["Dictation", "ScreenRecording", "Reminder", "NightLight", "Dnd"])
  assert.equal(M.findEntry(c2, M.PLUGIN_ID).setup.indicatorsItemsBefore, null)
  M.applyUndoSetup(c2, M.PLUGIN_ID)
  assert.equal(c2.bar.layout.center[0].items, undefined)
})

test("menu override inserts before the final brace, survives a comment-only template, refuses a broken file, and removes cleanly", () => {
  const template = "// Omarchy menu extensions\n// \"setup.x\": {\"label\": \"X\"}\n{\n}\n"
  const out = M.menuInsertOverride(template)
  assert.ok(out.includes(M.MENU_MARKER))
  assert.equal(M.jsoncParse(out)["system.screensaver"].action, "omarchy-shell stelline show")
  const withUser = '{\n  "setup.custom": {"label": "Mine", "action": "true"},\n}\n'
  const out2 = M.menuInsertOverride(withUser)
  const parsed = M.jsoncParse(out2)
  assert.equal(parsed["setup.custom"].label, "Mine")
  assert.ok(parsed["system.screensaver"])
  assert.equal(M.menuInsertOverride(out2), out2)
  assert.equal(M.menuInsertOverride('{ "broken": '), null)
  assert.equal(M.menuInsertOverride(""), M.menuInsertOverride("{}"))
  const back = M.menuRemoveOverride(out2)
  assert.ok(!M.menuHasOverride(back))
  assert.equal(M.jsoncParse(back)["system.screensaver"], undefined)
})
