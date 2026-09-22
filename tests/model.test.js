const test = require("node:test")
const assert = require("node:assert/strict")
const M = require("../StellineModel.js")

test("defaults pick the wordmark with no rules at all", () => {
  const d = M.defaults()
  assert.equal(d.saver, "terminal")
  assert.deepEqual(d.situations, [])
})

test("findEntry walks bar layout sections and plugins[]", () => {
  const cfg = { bar: { layout: { left: [], center: [{ id: M.PLUGIN_ID, saver: "clock" }], right: [] } }, plugins: [] }
  assert.equal(M.findEntry(cfg, M.PLUGIN_ID).saver, "clock")
  assert.equal(M.findEntry({ plugins: [M.PLUGIN_ID] }, M.PLUGIN_ID).id, M.PLUGIN_ID)
  assert.equal(M.findEntry({ plugins: [{ id: "other" }] }, M.PLUGIN_ID), null)
})

test("mergeSettings coerces strings from `omarchy bar set` and merges per-saver objects all the way down", () => {
  const cfg = M.mergeSettings({ saver: "clock", shuffle: "true", savers: { wordmark: { holdSec: "6" }, clock: { widgets: { clock: { on: "true", showSeconds: "true" } } } } })
  assert.equal(cfg.saver, "clock")
  assert.equal(cfg.shuffle, true)
  assert.equal(cfg.savers.wordmark.holdSec, 6)
  assert.equal(cfg.savers.wordmark.background, "theme")
  // a partial widget keeps the shipped tile's defaults around it
  assert.equal(cfg.savers.clock.background, "theme")
  assert.equal(cfg.savers.clock.widgets.clock.place, "centre")
  assert.equal(cfg.savers.clock.widgets.clock.on, true)
  assert.equal(M.widgetsOf(cfg.savers.clock, cfg).clock.showSeconds, true)
  // a knob the defaults know nothing about stays what it is — a widget on the
  // Wordmark used to come back as "[object Object]"
  const wm = M.mergeSettings({ savers: { wordmark: { widgets: { clock: { on: true, place: "corner" } }, corner: "top-left" } } })
  assert.equal(wm.savers.wordmark.widgets.clock.place, "corner")
  assert.equal(M.widgetsOf(wm.savers.wordmark, wm).clock.on, true)
  assert.equal(M.cornerOf(wm.savers.wordmark, wm), "top-left")
})

test("mergeSettings falls back to wordmark for an unknown saver", () => {
  assert.equal(M.mergeSettings({ saver: "nope" }).saver, "terminal")
})

test("fullSettings applies a patch and always carries the id", () => {
  const full = M.fullSettings(M.defaults(), { saver: "blank" })
  assert.equal(full.id, M.PLUGIN_ID)
  assert.equal(full.saver, "blank")
  assert.equal(full.lockEnabled, true)
})

test("rotation is every native saver, or the shuffle set when shuffle is on", () => {
  assert.deepEqual(M.rotation(M.defaults()), ["wordmark", "clock", "blank"])
  assert.deepEqual(M.rotation(M.mergeSettings({ shuffle: true, shuffleFrom: ["clock", "terminal", "nope"] })), ["clock"])
  assert.equal(M.nextSaver(M.defaults(), "blank"), "wordmark")
  assert.equal(M.nextSaver(M.defaults(), "unknown"), "wordmark")
  assert.equal(M.saverFile("clock"), "savers/Blank.qml")
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
  assert.equal(M.pickSaver(d, null, "terminal", 0), "terminal")
  const sh = M.mergeSettings({ shuffle: true, shuffleFrom: ["clock", "blank"] })
  assert.equal(M.pickSaver(sh, null, "clock", 0.99), "blank")
  assert.equal(M.pickSaver(sh, null, "blank", 0.0), "clock")
  const one = M.mergeSettings({ shuffle: true, shuffleFrom: ["clock"] })
  assert.equal(M.pickSaver(one, null, "clock", 0.5), "clock")
})

test("situations: battery, night (wrapping midnight) and theme; every fit applies, the first names the saver; unknown keys never match", () => {
  const ctx = { onBattery: true, batteryPercent: 42, minuteOfDay: 23 * 60, themeName: "hackerman" }
  const list = [
    { id: "a", enabled: false, when: { battery: {} }, saver: "blank" },
    { id: "b", enabled: true, when: { battery: { below: 30 } }, saver: "blank" },
    { id: "c", enabled: true, when: { night: { from: "22:00", to: "07:00" } }, saver: "clock" },
    { id: "d", enabled: true, when: { theme: { name: "Hackerman" } }, saver: "blank" }
  ]
  // night and theme both hold: one merged situation, the saver from the earlier rule
  assert.equal(M.activeSituation(list, ctx).id, "c+d")
  assert.equal(M.activeSituation(list, ctx).saver, "clock")
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
  assert.equal(M.situationEffect({ saver: "blank", screensaver: 90, lock: 180 }), "Blank · screensaver 1:30 · lock 3:00")
  assert.equal(M.situationEffect({ saver: "clock" }), "Clock")
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

// ---- user savers ----

const scanRow = (dir, json, extra) => JSON.stringify({ dir, json, files: ["saver.json", "001.txt", "002.txt"], folderFiles: [], thumb: "", ...(extra || {}) })

test("parseScan turns saver folders into picker entries and rejects bad ids", () => {
  const root = "/home/x/.config/omarchy/stelline/savers"
  const nd = [
    scanRow(root + "/acme-co", { name: "Acme Co.", kind: "ascii", pieces: ["001.txt", "002.txt"], play: "slideshow" }, { thumb: "AB\nCD\f" + "EF" }),
    scanRow(root + "/dance", { name: "Dance", kind: "ascii", pieces: ["frames.txt"], play: "animation", fps: 12 }, { thumb: "x\n\fy" }),
    scanRow(root + "/photos", { name: "Photos", kind: "image", folder: "/home/x/Pictures" }, { folderFiles: ["/home/x/Pictures/a.jpg", "/home/x/Pictures/notes.txt", "/home/x/Pictures/b.png"] }),
    scanRow(root + "/clip", { name: "Clip", kind: "image", pieces: ["clip.gif"] }),
    scanRow(root + "/half", { name: "Half", kind: "ascii", importing: true }),
    scanRow(root + "/wordmark", { name: "Nope" }),
    scanRow(root + "/Bad Id", { name: "Nope" }),
    "garbage"
  ].join("\n")
  const list = M.parseScan(nd)
  assert.deepEqual(list.map((s) => s.id), ["acme-co", "clip", "dance", "half", "photos"])
  const acme = list.find((s) => s.id === "acme-co")
  assert.equal(acme.kind, "series")
  assert.equal(acme.file, "savers/Series.qml")
  assert.deepEqual(acme.series.pieces, [root + "/acme-co/001.txt", root + "/acme-co/002.txt"])
  assert.equal(acme.series.thumbArt, "AB\nCD")
  assert.equal(acme.meta, "2 ASCII pieces")
  const dance = list.find((s) => s.id === "dance")
  assert.equal(dance.series.play, "animation")
  assert.equal(dance.series.fps, 12)
  assert.equal(dance.meta, "ASCII animation")
  const photos = list.find((s) => s.id === "photos")
  assert.deepEqual(photos.series.pieces, ["/home/x/Pictures/a.jpg", "/home/x/Pictures/b.png"])
  assert.equal(photos.series.thumbImage, "/home/x/Pictures/a.jpg")
  assert.equal(photos.meta, "2 pictures")
  assert.equal(list.find((s) => s.id === "clip").meta, "animated picture")
  assert.ok(list.find((s) => s.id === "half").series.importing)
  // the registry sees them
  assert.equal(M.saverById("acme-co", list).name, "Acme Co.")
  assert.equal(M.saverFile("acme-co", list), "savers/Series.qml")
  assert.equal(M.saverById("acme-co"), null)
  assert.deepEqual(M.rotation(M.defaults(), list), ["wordmark", "clock", "blank", "acme-co", "clip", "dance", "photos"])
  assert.equal(M.mergeSettings({ saver: "acme-co" }, list).saver, "acme-co")
  assert.equal(M.mergeSettings({ saver: "acme-co" }).saver, "terminal")
  assert.equal(M.mergeSettings({ savers: { "acme-co": { dwellSec: 5 } } }).savers["acme-co"].dwellSec, 5)
  // an importing saver is never picked
  assert.equal(M.pickSaver(M.mergeSettings({ saver: "half" }, list), null, "", 0, list), "terminal")
  assert.equal(M.pickSaver(M.defaults(), { saver: "half" }, "", 0, list), "terminal")
  assert.equal(M.pickSaver(M.defaults(), { saver: "dance" }, "", 0, list), "dance")
})

test("names, ids and frames", () => {
  assert.equal(M.slugify("Acme Co. (2026)"), "acme-co-2026")
  assert.equal(M.slugify("Clock"), "clock-2")
  assert.equal(M.slugify("   "), "saver")
  assert.equal(M.uniqueId("dance", ["dance", "dance-2"]), "dance-3")
  assert.equal(M.suggestName(["/home/x/Pictures/robot_inc-logo.png"]), "Robot Inc Logo")
  assert.equal(M.suggestName(["/home/x/Pictures/Robot Inc/a.png", "/home/x/Pictures/Robot Inc/b.png"]), "Robot Inc")
  assert.equal(M.suggestName(["/home/x/Videos/wife-dancing"]), "Wife Dancing")
  assert.equal(M.suggestName([], "New"), "New")
  assert.deepEqual(M.splitFrames("a\n\fb\n\n\f\f  \fc"), ["a", "b", "c"])
  assert.ok(M.isImagePath("/x/y.JPG"))
  assert.ok(!M.isImagePath("/x/y.txt"))
  assert.ok(M.isVideoPath("/x/y.mp4"))
  assert.ok(!M.isVideoPath("/x/y.gif"))
})

test("import scripts: each source produces a self-contained bash pipeline", () => {
  const root = "/home/x/.config/omarchy/stelline/savers"
  const base = { ...M.importDefaults(), id: "acme-co", name: "Acme Co." }
  const imgs = M.importScript({ ...base, source: "images", paths: ["/p/a.png", "/p/it's.png"] }, root)
  assert.match(imgs, /^#!\/bin\/bash/)
  assert.match(imgs, /omarchy-transcode-ascii "\$f" "\$dir\/\$n\.txt" --width "\$cols" --height "\$rows" --mode braille/)
  assert.match(imgs, /'\/p\/it'\\''s\.png'/)
  assert.match(imgs, /"importing":true/)
  assert.match(imgs, /\.play="slideshow"/)
  const asIs = M.importScript({ ...base, source: "folder", paths: ["/p/Robot Inc"], style: "image" }, root)
  assert.match(asIs, /'\.folder=\$folder'/)
  assert.doesNotMatch(asIs, /transcode/)
  const vid = M.importScript({ ...base, source: "video", paths: ["/v/dance.mp4"], fps: 12, seconds: 15 }, root)
  assert.match(vid, /ffmpeg -v error -y -i "\$src" -t 15 -vf "fps=12/)
  assert.match(vid, /--no-trim/)
  assert.match(vid, /\.play="animation" \| \.fps=12/)
  const gif = M.importScript({ ...base, source: "video", paths: ["/v/dance.mp4"], style: "image" }, root)
  assert.match(gif, /palettegen/)
  assert.match(gif, /\.pieces=\["clip\.gif"\]/)
  const txt = M.importScript({ ...base, source: "text", text: "Acme Co." }, root)
  assert.match(txt, /label:"\$text"/)
  assert.match(txt, /--mode block/)
  const ai = M.importScript({ ...base, source: "prompt", prompt: "a robot waving", animated: true, frames: 8 }, root)
  assert.match(ai, /agent=\$\(omarchy-default-agent/)
  assert.match(ai, /reason\(\) \{ local r; r=\$\(grep -m1 -iE 'unauthori/)
  assert.match(ai, /claude\) out=\$\(\{ timeout 600 env -u CLAUDECODE claude -p "\$prompt" --output-format text --tools '' --no-session-persistence --effort low; \} 2>"\$tmp\/err" <\/dev\/null\)/)
  assert.match(ai, /codex\) out=.*codex exec --skip-git-repo-check/)
  assert.match(ai, /gemini\) out=.*--approval-mode plan/)
  for (const id of Object.keys(M.AGENTS)) assert.match(ai, new RegExp("^  " + id + "\\) ", "m"))
  assert.match(ai, /awk -v b====ART=== -v e====END===/)
  assert.match(ai, /output_config:\{effort:"low"\}/)
  assert.match(M.aiPrompt("x", 1), /===ART===[\s\S]*===END===/)
  assert.equal(M.agentName("omp"), "Oh My Pi")
  assert.equal(M.agentName("nope"), "nope")
  assert.match(ai, /no model answered\$\{why:\+/)
  assert.match(ai, /claude-opus-5/)
  assert.match(ai, /server-side-fallback-2026-07-01/)
  assert.match(ai, /\.fps=6/)
  assert.match(M.aiPrompt("a robot waving", 8), /Produce 8 frames/)
  assert.match(M.aiPrompt("a robot", 1), /Produce one piece/)
  assert.equal(M.deleteScript("acme-co", root), "d='/home/x/.config/omarchy/stelline/savers/acme-co'; root='/home/x/.config/omarchy/stelline/savers'; [[ -d $d && $d == \"$root\"/* ]] && rm -rf -- \"$d\"; touch \"$root/.stamp\"")
  assert.equal(M.deleteScript("../etc", root), null)
  assert.equal(M.deleteScript("", root), null)
  assert.match(M.scanScript(root), /saver\.json/)
})

test("rules: one per saver, conditions AND together, last one off removes it, labels read naturally", () => {
  const ctx = { themeName: "nord" }
  let list = M.setRuleCondition([], "dance", "night", true, ctx)
  assert.equal(list.length, 1)
  assert.deepEqual(list[0], { id: "rule-dance", enabled: true, when: { night: { from: "22:00", to: "07:00" } }, saver: "dance" })
  list = M.setRuleCondition(list, "dance", "battery", true, ctx)
  assert.deepEqual(Object.keys(list[0].when), ["night", "battery"])
  assert.ok(M.ruleHas(list[0], "battery"))
  list = M.patchRuleCondition(list, "dance", "night", { from: "17:00", to: "08:30" })
  assert.equal(M.situationLabel(list[0]), "Night 17:00–08:30 · On battery")
  list = M.setRuleCondition(list, "dance", "night", false, ctx)
  assert.deepEqual(Object.keys(list[0].when), ["battery"])
  list = M.setRuleCondition(list, "dance", "battery", false, ctx)
  assert.deepEqual(list, [])
  // a disabled rule left over from Advanced reads as no conditions; enabling one starts clean
  const stale = [{ id: "x", enabled: false, when: { theme: { name: "hackerman" }, battery: {} }, saver: "clock" }]
  assert.ok(!M.ruleHas(stale[0], "theme"))
  const on = M.setRuleCondition(stale, "clock", "night", true, ctx)
  assert.deepEqual(Object.keys(on[0].when), ["night"])
  assert.equal(on[0].enabled, true)
  // second saver's rule appends after the first
  const two = M.setRuleCondition(list.concat(on), "blank", "battery", true, ctx)
  assert.equal(two[1].saver, "blank")
  // labels
  const cfg = M.mergeSettings({ saver: "blank", situations: on })
  assert.equal(M.playsLabel(cfg, "blank"), "usually plays")
  assert.equal(M.playsLabel(cfg, "clock"), "night 22:00–07:00")
  assert.equal(M.playsLabel(cfg, "wordmark"), "")
  const both = M.mergeSettings({ saver: "clock", situations: on })
  assert.equal(M.playsLabel(both, "clock"), "usually · night 22:00–07:00")
  const sh = M.mergeSettings({ shuffle: true, shuffleFrom: ["wordmark"], situations: on })
  assert.equal(M.playsLabel(sh, "wordmark"), "in the shuffle")
  assert.equal(M.playsLabel(sh, "blank"), "")
  // forgetting a saver clears every reference
  const fake = [{ id: "dance", name: "Dance", kind: "series", file: "savers/Series.qml", series: {} }]
  const patch = M.forgetSaver(M.mergeSettings({ saver: "dance", shuffleFrom: ["dance", "clock"], situations: [{ id: "r", enabled: true, when: { night: {} }, saver: "dance" }, { id: "t", enabled: true, when: { battery: {} }, saver: "dance", screensaver: 60 }], savers: { dance: { fps: 3 } } }, fake), "dance")
  assert.equal(patch.saver, "terminal")
  assert.deepEqual(patch.shuffleFrom, ["clock"])
  assert.deepEqual(patch.situations, [{ id: "t", enabled: true, when: { battery: {} }, screensaver: 60 }])
  assert.equal(patch.savers.dance, undefined)
})

test("parseClipboard sorts what was pasted into a source", () => {
  assert.deepEqual(M.parseClipboard("file\t/a/b.png\nfile\t/a/c.jpg"), { source: "images", paths: ["/a/b.png", "/a/c.jpg"] })
  assert.deepEqual(M.parseClipboard("dir\t/home/x/pics"), { source: "folder", paths: ["/home/x/pics"] })
  assert.deepEqual(M.parseClipboard("file\t/a/clip.mp4"), { source: "video", paths: ["/a/clip.mp4"] })
  // A folder wins over loose files, and a GIF stays a picture among pictures.
  assert.deepEqual(M.parseClipboard("file\t/a/b.png\ndir\t/d"), { source: "folder", paths: ["/d"] })
  assert.equal(M.parseClipboard(""), null)
  assert.equal(M.parseClipboard("nonsense"), null)
})

test("the clipboard scripts are one self-contained bash script each", () => {
  const probe = M.clipboardProbeScript()
  assert.match(probe, /wl-paste --list-types/)
  assert.match(probe, /echo paths/)
  const paste = M.clipboardPasteScript("/run/user/1000/stelline-paste")
  assert.match(paste, /rm -rf -- "\$stage"/)
  assert.match(paste, /'\/run\/user\/1000\/stelline-paste'/)
  // Nothing outside the staging folder is ever removed.
  assert.equal(paste.split("rm -rf").length - 1, 1)
})

test("saverType decides how a saver is configured; shipped tiles are instances of types anyone can add", () => {
  const byId = id => M.SAVERS.find(s => s.id === id)
  assert.equal(M.saverType(byId("terminal")), "original")
  assert.equal(M.saverType(byId("wordmark")), "text")
  assert.equal(M.saverType(byId("clock")), "empty")
  assert.equal(M.saverType(byId("blank")), "empty")
  assert.equal(M.saverType({ id: "e", kind: "series", series: { kind: "empty", source: { type: "clock" } } }), "empty")
  const series = (kind, source, play) => ({ id: "x", kind: "series", series: { kind, play, source } })
  // made from typed text, so it is a wordmark and gets a Text field like the built-in
  assert.equal(M.saverType(series("ascii", { type: "text", text: "Acme" })), "text")
  assert.equal(M.saverType(series("image", { type: "images" })), "pictures")
  assert.equal(M.saverType(series("ascii", { type: "video" }, "animation")), "animation")
  assert.equal(M.saverType(series("ascii", { type: "images" })), "art")
  assert.equal(M.saverType(null), "")
})

test("a wordmark's word: the setting, then what it was made from, then the default", () => {
  const builtin = M.SAVERS.find(s => s.id === "wordmark")
  assert.equal(M.wordmarkText(builtin, {}), M.DEFAULT_WORDMARK)
  assert.equal(M.wordmarkText(builtin, { text: "Acme" }), "Acme")
  // cleared on purpose is not "unset": it means the shared Omarchy artwork
  assert.equal(M.wordmarkText(builtin, { text: "" }), "")
  const made = { id: "a", kind: "series", series: { kind: "ascii", source: { type: "text", text: "Acme" } } }
  assert.equal(M.wordmarkText(made, {}), "Acme")
  assert.equal(M.wordmarkText(made, { text: "Kubaicle" }), "Kubaicle")
  assert.equal(M.wordmarkText({ id: "p", kind: "series", series: {} }, {}), "")
})

test("wordmarkScript draws a word and refuses an empty one", () => {
  const sh = M.wordmarkScript("Acme Co.", "/home/you/art.txt")
  assert.match(sh, /label:"\$text"/)
  assert.match(sh, /omarchy-transcode-ascii/)
  assert.match(sh, /'\/home\/you\/art\.txt'/)
  // nothing is written until the art exists, so a failed run leaves the old art
  assert.match(sh, /\[\[ -s \$tmp\/art\.txt \]\] \|\| exit 1\nmv /)
  assert.match(M.wordmarkScript("  ", "/tmp/x"), /\[\[ -n \$text \]\] \|\| exit 1/)
  // a word with a quote in it cannot break out of the script
  assert.match(M.wordmarkScript("it's", "/tmp/x"), /text='it'\\''s'/)
})

test("docked: an external output makes the rule hold, the laptop panel alone does not", () => {
  assert.equal(M.isDocked(["eDP-1"]), false)
  assert.equal(M.isDocked(["eDP-1", "DP-1"]), true)
  assert.equal(M.isDocked(["DP-1"]), true)          // clamshell: the panel is off
  assert.equal(M.isDocked(["HDMI-A-1"]), true)
  assert.equal(M.isDocked(["LVDS-1", "DSI-1"]), false)
  assert.equal(M.isDocked([]), false)
  assert.equal(M.isDocked(null), false)
  const rule = { id: "d", enabled: true, when: { docked: {} }, lock: "never" }
  assert.equal(M.situationMatches(rule, { docked: true }), true)
  assert.equal(M.situationMatches(rule, { docked: false }), false)
  assert.equal(M.situationMatches(rule, {}), false)
  // it reads as one word, needs nothing set, and is a rule key like the others
  assert.equal(M.situationLabel(rule), "Docked")
  assert.deepEqual(M.defaultCondition("docked", {}), {})
  assert.ok(M.RULE_KEYS.includes("docked"))
  // the tile switch can turn it on for a saver, and a docked rule ANDs with the rest
  const on = M.setRuleCondition([], "clock", "docked", true, { docked: true })
  assert.deepEqual(on[0].when, { docked: {} })
  const both = M.setRuleCondition(on, "clock", "battery", true, { docked: true })
  assert.equal(M.situationMatches(both[0], { docked: true, onBattery: true, batteryPercent: 50 }), true)
  assert.equal(M.situationMatches(both[0], { docked: true, onBattery: false }), false)
  // and the timings a docked rule carries are honoured: never lock at the desk
  const eff = M.effectiveTimeouts({ screensaver: 30, lock: 300 }, M.mergeSettings({ situations: [rule] }), rule)
  assert.equal(eff.lockEnabled, false)
})

test("never-lock-while-docked is a switch over an ordinary rule", () => {
  const off = M.setDockedNoLock([], true)
  assert.deepEqual(off, [{ id: "docked-no-lock", enabled: true, when: { docked: {} }, lock: "never" }])
  assert.equal(M.dockedNoLock(off), true)
  // idempotent on, and a disabled copy is switched back on rather than duplicated
  assert.equal(M.setDockedNoLock(off, true).length, 1)
  const disabled = M.cloneJson(off); disabled[0].enabled = false
  assert.equal(M.dockedNoLock(disabled), false)
  assert.equal(M.setDockedNoLock(disabled, true)[0].enabled, true)
  // off removes exactly that rule and leaves the rest alone
  const others = [{ id: "n", enabled: true, when: { night: { from: "22:00", to: "07:00" } }, saver: "clock" }]
  assert.deepEqual(M.setDockedNoLock(others.concat(off), false), others)
  // a per-saver docked rule, or a docked rule that also changes the screensaver, is not the switch
  assert.equal(M.dockedNoLock([{ id: "x", enabled: true, when: { docked: {} }, saver: "clock", lock: "never" }]), false)
  assert.equal(M.dockedNoLock([{ id: "y", enabled: true, when: { docked: {} }, lock: "never", screensaver: 90 }]), false)
  // it reads as a sentence everywhere it is shown
  assert.equal(M.situationEffect(off[0]), "never locks")
  assert.equal(M.situationEffect({ screensaver: 90, lock: 180 }), "screensaver 1:30 · lock 3:00")
  assert.equal(M.situationEffect({ screensaver: 90 }), "screensaver 1:30")
  // and the effective timeline drops the lock while it applies
  const cfg = M.mergeSettings({ situations: off })
  const eff = M.effectiveTimeouts({ screensaver: 30, lock: 300 }, cfg, M.activeSituation(cfg.situations, { docked: true }))
  assert.equal(eff.lockEnabled, false)
  assert.equal(eff.screensaver, 30)
})

test("a rule's subject is the saver it belongs to; a timings-only rule has none", () => {
  const list = [{ id: "dance", name: "Dancing", glyph: "󰊄", kind: "series", series: {} }]
  const saverRule = { id: "a", enabled: true, when: { night: { from: "22:00", to: "07:00" } }, saver: "dance" }
  const timingsRule = { id: "b", enabled: true, when: { docked: {} }, lock: "never" }
  assert.equal(M.ruleSaver(saverRule, list).name, "Dancing")
  assert.equal(M.ruleSaver(timingsRule, list), null)
  assert.equal(M.ruleSaver({ saver: "gone" }, list), null)      // a deleted saver has no subject
  assert.equal(M.ruleSaver(null, list), null)
  // the row's second line: the condition, plus only what it changes
  assert.equal(M.situationTimings(saverRule), "")
  assert.equal(M.situationTimings(timingsRule), "never locks")
  assert.equal(M.situationTimings({ screensaver: 90, lock: 180 }), "screensaver 1:30 · lock 3:00")
  assert.equal(M.situationTimings({}), "")
  // and the older one-line form still names the saver, for the hero and TIMINGS
  assert.equal(M.situationEffect(saverRule, list), "Dancing")
  assert.equal(M.situationEffect({ saver: "dance", lock: "never" }, list), "Dancing · never locks")
})

test("every rule that fits applies: the saver from the first that names one, each timing from the first that sets it, never-lock wins", () => {
  const list = [
    { id: "night-clock", enabled: true, when: { night: { from: "22:00", to: "07:00" } }, saver: "clock" },
    { id: "battery-timings", enabled: true, when: { battery: {} }, screensaver: 90, lock: 180 },
    { id: "docked-no-lock", enabled: true, when: { docked: {} }, lock: "never" }
  ]
  const at = M.activeSituation(list, { onBattery: true, batteryPercent: 50, minuteOfDay: 23 * 60, docked: true })
  assert.equal(at.saver, "clock")
  assert.equal(at.screensaver, 90)
  assert.equal(at.lock, "never")
  assert.deepEqual(Object.keys(at.when).sort(), ["battery", "docked", "night"])
  assert.equal(M.situationLabel(at), "Night 22:00–07:00 · On battery · Docked")
  // the merged timeline honours all of it
  const eff = M.effectiveTimeouts({ screensaver: 300, lock: 600 }, M.mergeSettings({ situations: list }), at)
  assert.equal(eff.screensaver, 90)
  assert.equal(eff.lockEnabled, false)
  // one match comes back as itself, untouched
  assert.equal(M.activeSituation(list, { onBattery: false, minuteOfDay: 12 * 60, docked: true }), list[2])
})

test("a timings-only rule is a switch under the sliders", () => {
  const on = M.setTimingsRule([], "battery", true, {})
  assert.deepEqual(on, [{ id: "battery-timings", enabled: true, when: { battery: { below: 100 } }, screensaver: 90, lock: 180 }])
  assert.equal(M.timingsRule(on, "battery"), on[0])
  assert.equal(M.timingsRuleIndex(on, "docked"), -1)
  // a saver's battery rule is not the switch
  assert.equal(M.timingsRule([{ id: "x", enabled: true, when: { battery: {} }, saver: "clock" }], "battery"), null)
  // a switched-off copy is switched back on rather than duplicated; off removes it
  const off = M.cloneJson(on); off[0].enabled = false
  assert.equal(M.setTimingsRule(off, "battery", true).length, 1)
  assert.equal(M.setTimingsRule(off, "battery", true)[0].enabled, true)
  assert.deepEqual(M.setTimingsRule(on, "battery", false), [])
  assert.equal(M.hasTiming(90), true)
  assert.equal(M.hasTiming(""), false)
  assert.equal(M.hasTiming(null), false)
})

test("widgets: defaults from the old card settings, a tile's own on top, old clock knobs still count", () => {
  const cfg = M.mergeSettings({ card: { enabled: false, detail: "bodies", corner: "top-left" } })
  const d = M.widgetsOf({}, cfg)
  assert.equal(d.notifications.on, false)
  assert.equal(d.notifications.detail, "bodies")
  assert.equal(d.agent.on, true)
  assert.equal(d.clock.on, false)
  assert.equal(M.cornerOf({}, cfg), "top-left")
  assert.equal(M.cornerOf({ corner: "bottom-left" }, cfg), "bottom-left")
  assert.equal(M.cornerOf({ corner: "nowhere" }, M.defaults()), "bottom-right")
  // every widget resolves to one of the five spots: "corner" (what was stored
  // before, and still the default) means this tile's corner
  assert.equal(d.notifications.place, "top-left")
  assert.equal(M.widgetsOf({ widgets: { agent: { place: "top-right" } } }, cfg).agent.place, "top-right")
  assert.equal(M.widgetsOf({ widgets: { agent: { place: "nowhere" } } }, M.defaults()).agent.place, "bottom-right")
  assert.equal(M.placeLabel("bottom-left"), "Bottom left")
  assert.equal(M.placeLabel("centre"), "Middle")
  const w = M.widgetsOf({ format: "h:mm AP", showSeconds: true, widgets: { clock: { on: true, place: "centre" }, agent: { on: "false" } } }, cfg)
  assert.equal(w.clock.on, true)
  assert.equal(w.clock.place, "centre")
  assert.equal(w.clock.format, "h:mm AP")
  assert.equal(w.clock.showSeconds, true)
  assert.equal(w.agent.on, false)
  // the shipped Clock is an empty with the clock in the middle
  const clock = M.widgetsOf(M.defaults().savers.clock, M.defaults())
  assert.equal(clock.clock.on, true)
  assert.equal(clock.clock.place, "centre")
  assert.equal(M.widgetsOf(M.defaults().savers.blank, M.defaults()).clock.on, false)
  // one widget's knobs change, the rest stays
  const patch = M.patchWidget({ widgets: { clock: { on: true, place: "corner" }, agent: { on: false } } }, "clock", { place: "centre" })
  assert.deepEqual(patch, { widgets: { clock: { on: true, place: "centre" }, agent: { on: false } } })
  assert.deepEqual(M.patchWidget({}, "agent", { on: true }), { widgets: { agent: { on: true } } })
})

test("a shipped tile is deleted by hiding it, and hidden tiles leave every list", () => {
  const cfg = M.mergeSettings({ saver: "clock", shuffleFrom: ["clock", "blank"], savers: { clock: { background: "black" } } })
  const patch = M.hideSaver(cfg, "clock")
  assert.deepEqual(patch.hidden, ["clock"])
  assert.equal(patch.saver, "terminal")
  assert.deepEqual(patch.shuffleFrom, ["blank"])
  assert.equal(patch.savers.clock, undefined)
  const hidden = M.mergeSettings({ hidden: ["clock", "wordmark"] })
  assert.deepEqual(M.allSavers([], hidden.hidden).map(s => s.id), ["terminal", "blank"])
  assert.deepEqual(M.rotation(hidden), ["blank"])
  // idempotent
  assert.deepEqual(M.hideSaver(hidden, "clock").hidden, ["clock", "wordmark"])
})

test("a clock or an empty screen is a saver with nothing to convert", () => {
  const root = "/home/you/.config/omarchy/stelline/savers"
  const base = { ...M.importDefaults(), id: "clock-2", name: "Clock" }
  const script = M.importScript({ ...base, source: "clock" }, root)
  assert.match(script, /"kind":"empty"/)
  assert.match(script, /"type":"clock"/)
  assert.doesNotMatch(script, /is ready/)
  assert.doesNotMatch(script, /transcode/)
  const row = { dir: root + "/clock-2", files: ["saver.json"], json: JSON.parse(M.metaJson({ ...base, source: "clock" }, {})) }
  const s = M.userSaverFromScan(row)
  assert.equal(M.saverType(s), "empty")
  assert.equal(s.file, "savers/Blank.qml")
  assert.equal(s.name, "Clock")
  assert.equal(s.glyph, M.GLYPHS.clock)
  const e = M.userSaverFromScan({ dir: root + "/empty", files: ["saver.json"], json: JSON.parse(M.metaJson({ ...base, name: "", source: "empty" }, {})) })
  assert.equal(e.name, "Empty")
  assert.equal(e.meta, "empty screen")
})

test("agent sessions: Claude's own status wins, waitingFor tells needs from waiting, others go by activity", () => {
  const st = (s) => M.agentSessionState(s)
  assert.equal(st({ agent: "claude", status: "busy" }), "working")
  assert.equal(st({ agent: "claude", status: "idle", last: "end_turn" }), "waiting")
  assert.equal(st({ agent: "claude", status: "idle", waitingFor: "permission" }), "needs")
  assert.equal(st({ agent: "claude", status: "idle", waitingFor: "user_input" }), "needs")
  assert.equal(st({ agent: "claude", status: "", last: "tool_use" }), "working")
  assert.equal(st({ agent: "claude", status: "error" }), "error")
  assert.equal(st({ agent: "codex", status: "busy" }), "working")
  assert.equal(st({ agent: "codex", status: "idle" }), "waiting")
  assert.equal(st(null), "idle")
  // the probe's answer becomes sessions, most pressing first, named
  const probe = JSON.stringify({ sessions: [
    { agent: "codex", pid: 2, project: "acme", status: "busy" },
    { agent: "claude", pid: 1, project: "acme", title: "Fix the login form", status: "idle", waitingFor: "permission", statusAt: 5 },
    { agent: "claude", pid: 3, project: "docs", status: "busy", statusAt: 9 }
  ] })
  const list = M.parseAgentProbe(probe)
  assert.deepEqual(list.map(s => s.state), ["needs", "working", "working"])
  assert.equal(list[0].name, "Claude Code")
  assert.equal(list[1].pid, 3)
  assert.equal(list[2].name, "Codex")
  const sum = M.agentSummary(list)
  assert.equal(sum.state, "needs")
  assert.equal(sum.count, 3)
  assert.equal(sum.line, "Claude Code · Fix the login form · 3 sessions")
  assert.equal(M.agentSummary([{ agent: "gemini", project: "site", state: "working" }]).line, "Gemini · site")
  assert.deepEqual(M.agentSummary([]), { state: "idle", count: 0, line: "" })
  assert.deepEqual(M.parseAgentProbe("nonsense"), [])
  assert.equal(M.agentStateLabel("needs"), "needs you")
  // the probe is one python program that prints one JSON object
  const script = M.agentProbeScript()
  assert.match(script, /sessions\/\*\.json/)
  assert.match(script, /print\(json\.dumps/)
})

test("a clock that predates the widgets keeps showing, and the knobs count whether they are text or not", () => {
  // What an older Stelline left behind: clock knobs on the tile, no widgets
  // block at all. The tile was a clock, so it still is.
  const old = { background: "theme", format: "HH:mm", showDate: "true", showSeconds: "false" }
  const upgraded = M.widgetsOf(old, {}).clock
  assert.equal(upgraded.on, true)
  assert.equal(upgraded.showDate, true)
  assert.equal(upgraded.showSeconds, false)
  // Text from the IPC path reads as the boolean it means.
  assert.equal(M.widgetsOf({ format: "HH:mm", showSeconds: "true" }, {}).clock.showSeconds, true)
  assert.equal(M.boolish("false", true), false)
  assert.equal(M.boolish(null, true), true)
  // Switched off by hand is a later answer, and it wins.
  const off = { widgets: { clock: { on: false, place: "centre" } }, format: "HH:mm", showDate: "true" }
  assert.equal(M.widgetsOf(off, {}).clock.on, false)
  // A saver that never had a clock does not grow one.
  assert.equal(M.widgetsOf({ background: "black" }, {}).clock.on, false)
})
