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
  assert.match(imgs, /dots_art "\$prep_path" "\$dir\/\$n\.txt" "\$cols" "\$rows" "\$prep_flags" 2/)
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
  // drawn like a wordmark: in tones, packed to braille, not transcoded
  assert.match(txt, /LC_ALL=C awk/)
  assert.doesNotMatch(txt, /--mode block/)
  const ai = M.importScript({ ...base, source: "prompt", prompt: "a robot waving", animated: true, frames: 8 }, root)
  assert.match(ai, /agent=\$\(omarchy-default-agent/)
  assert.match(ai, /reason\(\) \{ local r; r=\$\(grep -m1 -iE 'unauthori/)
  assert.match(ai, /claude\) out=\$\(\{ timeout 600 env -u CLAUDECODE claude -p "\$prompt" --output-format text --tools "\$tools" --no-session-persistence --effort "\$effort" \$\{model:\+--model "\$model"\} --system-prompt "\$system"; \} 2>"\$tmp\/err" <\/dev\/null\)/)
  assert.match(ai, /codex\) out=.*codex exec --skip-git-repo-check/)
  assert.match(ai, /gemini\) out=.*--approval-mode plan/)
  for (const id of Object.keys(M.AGENTS)) assert.match(ai, new RegExp("^  " + id + "\\) ", "m"))
  assert.match(ai, /awk -v b====ART=== -v e====END===/)
    assert.match(ai, /output_config:\{effort:\$e\}/)
  assert.match(M.aiPrompt("x", { columns: 80, rows: 28, frames: 1 }), /===ART===[\s\S]*===END===/)
  assert.equal(M.agentName("omp"), "Oh My Pi")
  assert.equal(M.agentName("nope"), "nope")
  assert.match(ai, /no model answered\$\{why:\+/)
  assert.match(ai, /claude-opus-5/)
  assert.match(ai, /server-side-fallback-2026-07-01/)
  assert.match(ai, /\.fps=6/)
  assert.match(M.aiPrompt("a robot waving", { columns: 80, rows: 28, frames: 8 }), /Produce 8 frames/)
  assert.match(M.aiPrompt("a robot", { columns: 80, rows: 28, frames: 1 }), /Produce one piece/)
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
  assert.match(paste, /mkdir -p "\$stage"/)
  assert.match(paste, /pasted-\$\(date \+%s%N\)/)
  assert.match(paste, /'\/run\/user\/1000\/stelline-paste'/)
  // Nothing outside the staging folder is ever removed.
  assert.equal(paste.split("rm -rf").length - 1, 0)
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
  // drawn in tones and packed into braille here, not transcoded to blocks
  assert.match(sh, /-shear 12x0/)
  assert.match(sh, /LC_ALL=C awk/)
  assert.doesNotMatch(sh, /omarchy-transcode-ascii/)
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

test("with every native saver gone, next stays put and idle falls back to the Original", () => {
  const gone = Object.assign(M.defaults(), { hidden: ["wordmark", "clock", "blank"] })
  assert.equal(M.nextSaver(gone, "wordmark", []), "wordmark")
  assert.equal(M.pickSaver(Object.assign(gone, { shuffle: true }), null, "", 0.5, []), "terminal")
})

test("a shuffle with nothing ticked is every saver, and every tile says so", () => {
  const cfg = Object.assign(M.defaults(), { shuffle: true, shuffleFrom: [] })
  for (const id of ["wordmark", "clock", "blank"]) assert.equal(M.playsLabel(cfg, id, []), "in the shuffle")
  assert.equal(M.playsLabel(cfg, "terminal", []), "")
  const some = Object.assign(M.defaults(), { shuffle: true, shuffleFrom: ["blank"] })
  assert.equal(M.playsLabel(some, "blank", []), "in the shuffle")
  assert.equal(M.playsLabel(some, "wordmark", []), "")
})

test("the panel names what will play: the rule's saver, the shuffle, or the chosen one", () => {
  const cfg = Object.assign(M.defaults(), { saver: "wordmark" })
  assert.equal(M.playingName(cfg, null, []), "Wordmark")
  assert.equal(M.playingName(Object.assign({}, cfg, { shuffle: true, shuffleFrom: ["blank"] }), null, []), "shuffle")
  assert.equal(M.playingName(cfg, { saver: "blank" }, []), "Blank")
  assert.equal(M.playingName(cfg, { saver: "no-such" }, []), "Wordmark")
})

test("a theme rule with no theme says so", () => {
  assert.equal(M.situationLabel({ when: { theme: { name: "" } }, enabled: true }), "Theme not chosen")
  assert.equal(M.situationLabel({ when: { theme: { name: "Tokyo Night" } }, enabled: true }), "Theme Tokyo Night")
})

test("a failed import can be asked for again from what it remembers", () => {
  const failed = { id: "logo", name: "Logo", kind: "series", series: { kind: "image", error: "no such file", source: { type: "images", paths: ["/tmp/a.png", "/tmp/b.png"] } } }
  const spec = M.retrySpec(failed)
  assert.equal(spec.retryOf, "logo")
  assert.equal(spec.source, "images")
  assert.equal(spec.style, "image")
  assert.deepEqual(spec.paths, ["/tmp/a.png", "/tmp/b.png"])
  assert.equal(spec.name, "Logo")
  const described = { id: "cat", name: "Cat", kind: "series", series: { kind: "ascii", error: "timed out", source: { type: "prompt", prompt: "a cat", animated: false } } }
  assert.equal(M.retrySpec(described).prompt, "a cat")
  assert.equal(M.retrySpec(described).animated, false)
  // nothing to retry: not failed, or nothing remembered
  assert.equal(M.retrySpec({ id: "ok", name: "Ok", series: { kind: "ascii", error: "", source: { type: "text", text: "hi" } } }), null)
  assert.equal(M.retrySpec({ id: "x", name: "X", series: { kind: "ascii", error: "boom", source: {} } }), null)
  // and the meta a described saver writes now carries the animation choice
  const meta = JSON.parse(M.metaJson({ name: "Cat", source: "prompt", prompt: "a cat", animated: false, style: "ascii" }))
  assert.equal(meta.source.animated, false)
})

// ---- the composer ----

test("classifyPaths sorts what was picked or pasted into a folder, a clip or pictures", () => {
  assert.deepEqual(M.classifyPaths(["/p/holiday/"]), { source: "folder", paths: ["/p/holiday"] })
  assert.deepEqual(M.classifyPaths(["/p/a.png", "/p/holiday/"]), { source: "folder", paths: ["/p/holiday"] })
  assert.deepEqual(M.classifyPaths(["/p/clip.mp4"]), { source: "video", paths: ["/p/clip.mp4"] })
  // a lone GIF may move; among pictures it is a picture
  assert.deepEqual(M.classifyPaths(["/p/dance.gif"]), { source: "video", paths: ["/p/dance.gif"] })
  assert.deepEqual(M.classifyPaths(["/p/a.png", "/p/dance.gif"]), { source: "images", paths: ["/p/a.png", "/p/dance.gif"] })
  assert.deepEqual(M.classifyPaths(["/p/a.mp4", "/p/b.mov"]), { source: "video", paths: ["/p/a.mp4"] })
  assert.deepEqual(M.classifyPaths(["/p/a.png", "/p/b.mp4"]), { source: "images", paths: ["/p/a.png"] })
  assert.equal(M.classifyPaths([]), null)
  assert.equal(M.classifyPaths(["/p/notes.txt"]), null)
  assert.deepEqual(M.parsePicked("folder", ["/p/holiday/"]), { source: "folder", paths: ["/p/holiday"] })
  assert.deepEqual(M.parsePicked("media", ["/p/a.png", "/p/b.jpg"]), { source: "images", paths: ["/p/a.png", "/p/b.jpg"] })
  assert.equal(M.parsePicked("folder", []), null)
})

test("attach joins pictures to pictures, and a folder or a clip stands alone; detach clears", () => {
  let d = M.attach(M.importDefaults(), { source: "images", paths: ["/p/a.png"] })
  d = M.attach(d, { source: "images", paths: ["/p/a.png", "/p/b.png"] })
  assert.deepEqual(d.paths, ["/p/a.png", "/p/b.png"])
  d = M.attach(d, { source: "video", paths: ["/p/c.mp4"] })
  assert.equal(d.source, "video")
  assert.deepEqual(d.paths, ["/p/c.mp4"])
  d = M.attach(d, { source: "folder", paths: ["/p/holiday"] })
  assert.equal(M.attachmentLabel(d), "holiday")
  assert.equal(M.attach(d, null).source, "folder")
  d = M.detach(d)
  assert.equal(d.source, "")
  assert.deepEqual(d.paths, [])
  assert.equal(M.attachmentLabel(d), "")
  assert.equal(M.attachmentLabel({ source: "images", paths: ["/p/a.png", "/p/b.png"] }), "2 pictures")
  assert.equal(M.attachmentLabel({ source: "images", paths: ["/p/a.png"] }), "a.png")
  assert.equal(M.attachmentLabel({ source: "images", paths: ["/run/u/stelline-paste/pasted-1.png"] }, "/run/u/stelline-paste"), "pasted picture")
})

test("composeMode: what the card makes follows from what it holds", () => {
  const empty = M.importDefaults()
  assert.equal(M.composeMode(empty, "agent:claude"), "")
  assert.equal(M.composeMode({ ...empty, words: "a robot" }, "agent:claude"), "describe")
  assert.equal(M.composeMode({ ...empty, words: "a robot" }, ""), "letters")
  assert.equal(M.composeMode({ ...empty, words: "a robot", letters: true }, "agent:claude"), "letters")
  const pics = { ...empty, source: "images", paths: ["/p/a.png"] }
  assert.equal(M.composeMode(pics, "agent:claude"), "pictures")
  // words with a picture are a prompt, for an agent that can look at one
  assert.equal(M.composeMode({ ...pics, words: "make it snow" }, "agent:claude"), "describe-pictures")
  // with no agent, or one that cannot be handed a picture, the words name it
  assert.equal(M.composeMode({ ...pics, words: "make it snow" }, ""), "pictures")
  assert.equal(M.composeMode({ ...pics, words: "make it snow" }, "agent:pi"), "pictures")
  // no words: the picture is converted as it is
  assert.equal(M.composeMode({ ...pics, drawn: true }, "agent:claude"), "pictures")
  // pictures, one or many, either style, can move or sit still; a clip is not asked
  assert.equal(M.canMove(pics, "pictures"), true)
  assert.equal(M.canMove({ ...pics, paths: ["/p/a.png", "/p/b.png"] }, "pictures"), true)
  assert.equal(M.canMove({ ...pics, style: "image" }, "pictures"), true)
  assert.equal(M.canMove(pics, "folder"), true)
  assert.equal(M.canMove(pics, "clip"), false)
  // only more than one picture has an order to choose
  assert.equal(M.canOrder(pics, "pictures"), false)
  assert.equal(M.canOrder({ ...pics, paths: ["/p/a.png", "/p/b.png"] }, "pictures"), true)
  assert.equal(M.canOrder(pics, "folder"), true)
  assert.equal(M.composeMode({ ...empty, source: "folder", paths: ["/p/h"], words: "x" }, "agent:claude"), "folder")
  assert.equal(M.composeMode({ ...empty, source: "video", paths: ["/p/c.mp4"] }, "agent:claude"), "clip")
  assert.equal(M.seesPictures("agent:codex"), true)
  assert.equal(M.seesPictures("agent:pi"), false)
})

test("composeSpec builds the import from the card", () => {
  const empty = M.importDefaults()
  const d = M.composeSpec({ ...empty, words: "a lighthouse in a storm, at night", animated: false }, "agent:claude")
  assert.equal(d.source, "prompt")
  assert.equal(d.prompt, "a lighthouse in a storm, at night")
  assert.equal(d.animated, false)
  assert.equal(d.name, "a lighthouse in a storm")
  const l = M.composeSpec({ ...empty, words: "Acme Co." }, "")
  assert.equal(l.source, "text")
  assert.equal(l.text, "Acme Co.")
  assert.equal(l.name, "Acme Co.")
  const p = M.composeSpec({ ...empty, source: "images", paths: ["/p/holiday/a.png", "/p/holiday/b.png"], style: "image" }, "")
  assert.equal(p.source, "images")
  assert.equal(p.style, "image")
  assert.equal(p.name, "Holiday")
  assert.equal(M.composeSpec({ ...empty, source: "images", paths: ["/p/a.png"], words: "The cat" }, "agent:crush").name, "The cat")
  assert.equal(M.composeSpec({ ...empty, source: "images", paths: ["/run/u/stelline-paste/pasted-1.png"] }, "", "/run/u/stelline-paste").name, "Pasted picture")
  assert.equal(M.composeSpec(empty, "agent:claude"), null)
})

test("shortName is the first clause, cut at a word before it runs long", () => {
  assert.equal(M.shortName("a robot waving hello, pixel-art style"), "a robot waving hello")
  assert.equal(M.shortName("a lonely lighthouse on a cliff at night with rain lashing the rocks"), "a lonely lighthouse on a cliff at night")
  assert.equal(M.shortName("   "), "")
  assert.equal(M.shortName("one\ntwo"), "one")
})

test("redescribeSpec draws again under the same tile, from the same pictures", () => {
  const saver = { id: "waving-robot", name: "a robot waving", series: { error: "", source: { type: "prompt", prompt: "a robot waving", animated: true, paths: ["/p/a.png"] } } }
  const spec = M.redescribeSpec(saver, "a robot bowing", false)
  assert.equal(spec.retryOf, "waving-robot")
  assert.equal(spec.prompt, "a robot bowing")
  assert.equal(spec.animated, false)
  assert.equal(spec.name, "a robot bowing")
  assert.deepEqual(spec.paths, ["/p/a.png"])
  // a name given by hand stays
  assert.equal(M.redescribeSpec({ ...saver, name: "Morty" }, "a dog", true).name, "Morty")
  assert.equal(M.redescribeSpec(saver, "   ", true), null)
  assert.equal(M.redescribeSpec({ id: "x", series: { source: { type: "text", text: "hi" } } }, "words", true), null)
})

test("frameGrid is the widest and tallest of every frame", () => {
  assert.deepEqual(M.frameGrid(["ab\ncd", "abcde\n", "a\nb\nc"]), { columns: 5, rows: 3 })
  assert.deepEqual(M.frameGrid([]), { columns: 0, rows: 0 })
})

test("a described saver remembers its pictures, and the script hands them to the model", () => {
  const spec = { ...M.importDefaults(), id: "snow", name: "snow", source: "prompt", prompt: "make it snow", animated: true, paths: ["/p/a.png"] }
  const j = JSON.parse(M.metaJson(spec, {}))
  assert.deepEqual(j.source.paths, ["/p/a.png"])
  const script = M.importScript(spec, "/home/u/savers", "/run/u/stelline-paste")
  assert.ok(script.includes("tools=Read"))
  assert.ok(script.includes("imgargs+=(-i"))
  // the agent only reads inside its own folder, so it is given a copy there
  assert.ok(script.includes("The picture is at 1-a.png"))
  assert.ok(script.includes("apics+="))
  assert.ok(script.includes('cd "$tmp/pics"'))
  // nothing is converted and handed over as a starting point any more
  assert.ok(!script.includes("===BASE==="))
  assert.ok(script.includes('media_type:"image/png"'))
  assert.ok(script.includes(".source.paths=$srcs"))
  // pasted pictures are copied into the saver: the stage does not outlive the session
  assert.ok(script.includes("cp -f"))
  assert.ok(script.includes("[[ -d $dir ]] ||"))
  const plain = M.importScript({ ...spec, paths: [] }, "/home/u/savers")
  assert.ok(!plain.includes("===BASE==="))
  assert.ok(plain.includes("tools=''"))
  const pics = M.importScript({ ...M.importDefaults(), id: "p", name: "p", source: "images", style: "image", paths: ["/run/u/stelline-paste/pasted-1.png"] }, "/home/u/savers", "/run/u/stelline-paste")
  assert.ok(pics.includes("cp -f"))
  assert.ok(pics.includes(".pieces=$srcs | .source.paths=$srcs"))
})

test("the preview script converts the first picture the way the import would", () => {
  const s = M.previewScript("/run/u/stelline-preview")
  assert.ok(s.includes("omarchy-transcode-ascii"))
  assert.ok(s.includes(" " + M.ASCII_COLUMNS + " " + M.ASCII_ROWS + " "))
  assert.ok(s.includes("ffmpeg"))
  assert.ok(s.includes("printf 'image\\t%s\\n'"))
  // a screenshot is flattened and a dark picture inverted before the transcoder sees it
  assert.ok(s.includes("prep() {"))
  assert.ok(s.includes('dots_art "$prep_path"'))
  // several pictures still go through prep one by one
  const pics = M.importScript({ ...M.importDefaults(), id: "p", name: "p", source: "images", paths: ["/p/a.png", "/p/b.png"] }, "/home/u/savers")
  assert.ok(pics.includes('prep "$f" "$tmp/prep.png"'))
  assert.ok(pics.includes("$prep_flags"))
})

test("an unfinished tile says what is happening to it", () => {
  const root = "/home/u/savers"
  const base = { ...M.importDefaults(), name: "x", source: "prompt", prompt: "a cat", animated: true }
  const drawing = M.userSaverFromScan({ dir: root + "/x", files: ["saver.json"], json: JSON.parse(M.metaJson(base, { importing: true })) })
  assert.equal(drawing.meta, "drawing…")
  const converting = M.userSaverFromScan({ dir: root + "/y", files: ["saver.json"], json: JSON.parse(M.metaJson({ ...base, source: "images", paths: ["/p/a.png"] }, { importing: true })) })
  assert.equal(converting.meta, "converting…")
  const stopped = M.userSaverFromScan({ dir: root + "/z", files: ["saver.json"], json: JSON.parse(M.metaJson(base, { error: "stopped" })) })
  assert.equal(stopped.meta, "stopped")
  assert.equal(stopped.series.error, "stopped")
})

// ---- describing: the standing rules, the settings, a change ----

test("the standing rules are the system prompt; the request stays short", () => {
  const sys = M.aiSystem()
  assert.match(sys, /fills a screen/)
  assert.match(sys, /given the exact width and height/)
  assert.match(sys, /░▒▓█/)
  assert.match(sys, /braille/i)
  assert.match(sys, /asks for detail, realism, proportion or a likeness/)
  assert.match(sys, /one column wide/)
  assert.match(sys, /last frame leads back into the first/)
  const req = M.aiPrompt("a lighthouse", M.artPlan({ prompt: "a lighthouse", animated: true }), [])
  assert.match(req, /^Subject: a lighthouse\n/)
  assert.match(req, /Grid: exactly 80 columns by 28 lines\./)
  assert.ok(!req.includes("ramp"))
  assert.match(req, /Produce 10 frames[^\n]*---FRAME---/)
  // a picture named in the request is something to look at, not a base
  const withPic = M.aiPrompt("a dancer", M.artPlan({ prompt: "a dancer", animated: true }), ["/p/a.png"])
  assert.match(withPic, /Grid: exactly/)
  assert.ok(!withPic.includes("===BASE==="))
  assert.match(withPic, /look first, then draw what it shows/)
  const change = M.aiPrompt("a taller lighthouse", M.artPlan({ prompt: "x", animated: true }), [], "a lighthouse")
  assert.match(change, /described then as: a lighthouse\./)
  assert.match(change, /===PREVIOUS===/)
  assert.ok(!M.aiPrompt("x", { columns: 80, rows: 28, frames: 1 }, []).includes("PREVIOUS"))
})

test("describeSettings: the agent's own model unless named, at a known effort", () => {
  assert.deepEqual(M.describeSettings(M.defaults()), { model: "", effort: "medium" })
  assert.deepEqual(M.describeSettings({ describe: { model: " sonnet ", effort: "HIGH" } }), { model: "sonnet", effort: "high" })
  assert.deepEqual(M.describeSettings({ describe: { effort: "xhigh" } }), { model: "", effort: "medium" })
  assert.deepEqual(M.describeSettings({}), { model: "", effort: "medium" })
  const cfg = M.mergeSettings({ describe: { effort: "low" } })
  assert.equal(cfg.describe.effort, "low")
  assert.equal(cfg.describe.model, "")
})

test("the script draws with the chosen model and effort, the rules as the system prompt, and the house style", () => {
  const spec = { ...M.importDefaults(), id: "lh", name: "lh", source: "prompt", prompt: "a lighthouse", animated: true, model: "sonnet", effort: "high" }
  const s = M.importScript(spec, "/home/u/savers")
  assert.ok(s.includes("model='sonnet'; effort='high'"))
  assert.ok(s.includes('--effort "$effort" ${model:+--model "$model"} --system-prompt "$system"'))
  assert.ok(s.includes('model_reasoning_effort="$effort"'))
  assert.ok(s.includes('style="$HOME/.config/omarchy/stelline/style.md"'))
  assert.ok(s.includes("House style, from the owner of this screen"))
  assert.ok(s.includes('[[ -n $agent && $agent != claude ]] && prompt="$system"'))
  assert.ok(s.includes('--arg m "${model:-claude-opus-5}" --arg e "$effort" --arg s "$system"'))
  assert.ok(s.includes("system:$s"))
  // no settings: the agent's own model, medium
  const plain = M.importScript({ ...spec, model: undefined, effort: undefined }, "/home/u/savers")
  assert.ok(plain.includes("model=''; effort='medium'"))
  assert.ok(plain.includes("prev=''\n"))
  assert.ok(!plain.includes("RS="))
})

test("a change starts from the drawing there is; nothing to change means a fresh draw", () => {
  const saver = { id: "lh", name: "a lighthouse", series: { error: "", importing: false, pieces: ["/home/u/savers/lh/frames.txt"], source: { type: "prompt", prompt: "a lighthouse", animated: true } } }
  const change = M.redescribeSpec(saver, "a lighthouse, taller", true, true)
  assert.equal(change.previous, true)
  assert.equal(change.previousPrompt, "a lighthouse")
  const s = M.importScript({ ...change, id: "lh" }, "/home/u/savers")
  assert.ok(s.includes('RS="\\f"'))
  assert.ok(s.includes("===PREVIOUS==="))
  assert.ok(s.includes("described then as: a lighthouse."))
  assert.equal(M.redescribeSpec(saver, "x", true, false).previous, undefined)
  assert.equal(M.redescribeSpec({ ...saver, series: { ...saver.series, error: "stopped" } }, "x", true, true).previous, undefined)
  assert.equal(M.redescribeSpec({ ...saver, series: { ...saver.series, pieces: [] } }, "x", true, true).previous, undefined)
})

test("artPlan trades frames for resolution, and detail buys room", () => {
  const plain = M.artPlan({ prompt: "a jellyfish drifting", animated: true })
  const detailed = M.artPlan({ prompt: "a detailed dancer, true to her figure", animated: true })
  assert.deepEqual(plain, { columns: 80, rows: 28, frames: 10, detailed: false })
  assert.deepEqual(detailed, { columns: 120, rows: 38, frames: 6, detailed: true })
  // a still spends nothing on frames, so it gets the whole canvas
  assert.deepEqual(M.artPlan({ prompt: "a jellyfish", animated: false }), { columns: 120, rows: 36, frames: 1, detailed: false })
  assert.deepEqual(M.artPlan({ prompt: "a portrait, exactly like the photo", animated: false }), { columns: 160, rows: 46, frames: 1, detailed: true })
  // the old fixed grid was smaller than every one of these
  assert.ok(plain.columns * plain.rows > 60 * 28)
})

test("wantsDetail reads the subject's own words", () => {
  for (const yes of ["a detailed dragon", "realistic waves", "true to her figure", "exactly like this", "keep the proportions", "a lifelike portrait", "near real"])
    assert.equal(M.wantsDetail(yes), true, yes)
  for (const no of ["a jellyfish drifting", "a robot waving hello", "snow falling on a roof", ""])
    assert.equal(M.wantsDetail(no), false, no)
})


test("several pictures and folders are left alone", () => {
  const two = M.importScript({ ...M.importDefaults(), id: "t", name: "T", source: "images", paths: ["/p/a.png", "/p/b.png"], style: "ascii" }, "/home/u/savers")
  assert.ok(!two.includes("ask_subject"))
  assert.ok(!two.includes("subject_art"))
  assert.ok(two.includes('.play="slideshow"'))
  const folder = M.importScript({ ...M.importDefaults(), id: "f", name: "F", source: "folder", paths: ["/p/h"], style: "ascii" }, "/home/u/savers")
  assert.ok(!folder.includes("ask_subject"))
})

test("moving or a still is the saver's own effect setting, not a different saver", () => {
  const draft = { ...M.importDefaults(), source: "images", paths: ["/p/a.png"], style: "ascii" }
  assert.equal(M.composeSpec({ ...draft, animated: true }, "").animated, true)
  assert.equal(M.composeSpec({ ...draft, animated: false }, "").animated, false)
  // both are the same import; only the setting written afterwards differs
  const moving = M.importScript({ ...M.composeSpec({ ...draft, animated: true }, ""), id: "a", name: "A" }, "/home/u/savers")
  const still = M.importScript({ ...M.composeSpec({ ...draft, animated: false }, ""), id: "a", name: "A" }, "/home/u/savers")
  assert.equal(moving, still)
  // nothing about motion survives on disk
  const j = JSON.parse(M.metaJson({ ...draft, id: "a", name: "A", motion: "sway" }, {}))
  assert.equal(j.motion, undefined)
  assert.equal(M.retrySpec({ id: "a", name: "A", series: { error: "x", kind: "ascii", source: { type: "images", paths: ["/p/a.png"], motion: "sway" } } }).motion, undefined)
})

test("a picture is widened before conversion, because a braille dot is not square", () => {
  // two dots span a cell's width and four its height, so with a cell 0.4555
  // as wide as it is tall a dot is about a tenth taller than it is wide
  assert.equal(M.dotStretch(0.4555).toFixed(4), "1.0977")
  assert.equal(M.dotStretch(0.5), 1)
  // nonsense, or nothing measured, falls back to the shipped font's figure
  for (const bad of [0, -1, 2, "x", undefined, null]) assert.equal(M.dotStretch(bad), M.DOT_STRETCH)
  // and the conversion applies it, so the dots map back to the right shape
  const s = M.importScript({ ...M.importDefaults(), id: "a", name: "A", source: "images", paths: ["/p/a.png"], style: "ascii", cellAspect: 0.4555 }, "/home/u/savers")
  assert.match(s, /-resize '109\.77%x100%'/)
  // every conversion goes through the same prep, so clips and folders match
  const clip = M.importScript({ ...M.importDefaults(), id: "b", name: "B", source: "video", paths: ["/p/c.mp4"], cellAspect: 0.4555 }, "/home/u/savers")
  assert.match(clip, /-resize '109\.77%x100%'/)
  // as does the thumbnail on the Add card, or it would disagree with the tile
  assert.match(M.previewScript("/run/u/p", 0.4555), /-resize '109\.77%x100%'/)
})

test("block characters become the braille cell holding the same dots", () => {
  // two dots across and four down is exactly what a block glyph divides into
  assert.equal(M.blocksToBraille("█"), "⣿")
  assert.equal(M.blocksToBraille("▀"), "⠛")
  assert.equal(M.blocksToBraille("▄"), "⣤")
  assert.equal(M.blocksToBraille("▌"), "⡇")
  assert.equal(M.blocksToBraille("▐"), "⢸")
  // the shades become how many of the eight are lit, in order
  const shades = [...M.blocksToBraille("░▒▓")].map(c => {
    let n = 0, b = c.codePointAt(0) - 0x2800
    while (b) { n += b & 1; b >>= 1 }
    return n
  })
  assert.deepEqual(shades, [2, 4, 6])
  // the art keeps its size, so a grid built from it still lines up
  const art = "█▀▄▌▐░▒▓"
  assert.equal([...M.blocksToBraille(art)].length, [...art].length)
  // and everything that is not a block is left exactly as it was
  assert.equal(M.blocksToBraille("ab ⣿·|\n─"), "ab ⣿·|\n─")
  assert.equal(M.blocksToBraille(""), "")
  assert.equal(M.blocksToBraille(null), "")
})

test("pictures carry motion and order into the spec, and come off one at a time", () => {
  const two = { ...M.importDefaults(), source: "images", paths: ["/p/a.png", "/p/b.png"], style: "image", animated: false }
  const spec = M.composeSpec(two, "", "")
  assert.equal(spec.animated, false)
  assert.equal(spec.order, "shuffle")
  assert.equal(M.composeSpec({ ...two, order: "sequence" }, "", "").order, "sequence")
  // one picture has no order to carry
  assert.equal(M.composeSpec({ ...two, paths: ["/p/a.png"] }, "", "").order, undefined)
  const one = M.removePicture(two, "/p/a.png")
  assert.deepEqual(one.paths, ["/p/b.png"])
  assert.equal(one.source, "images")
  assert.equal(M.removePicture(one, "/p/b.png").source, "")
})

test("a picture is converted as it is: no agent is asked, nothing is cropped", () => {
  const sh = M.importScript({ id: "x", source: "images", paths: ["/p/a.png"], style: "ascii", name: "A" }, "/r", "/s")
  assert.doesNotMatch(sh, /subject|crop/)
  assert.match(sh, /dots_art "\$prep_path"/)
})

test("detail: bold is the transcoder's one cut, the rest are dithered", () => {
  assert.equal(M.detailLevel(undefined), M.DEFAULT_DETAIL)
  assert.equal(M.detailLevel(9), M.DEFAULT_DETAIL)
  assert.equal(M.detailName(0), "bold")
  assert.equal(M.detailName(4), "finest")
  // the preview and the import convert at the same level
  const pv = M.previewScript("/run/u/p", 1, 0)
  assert.match(pv, /dots_art "\$prep_path" "\$stage\/preview\.txt" 160 64 "\$prep_flags" 0/)
  const d = { ...M.importDefaults(), source: "images", paths: ["/p/a.png"], detail: 4 }
  assert.equal(M.composeSpec(d, "", "").detail, 4)
  assert.equal(M.composeSpec({ ...d, style: "image" }, "", "").detail, undefined)
  const sh = M.importScript({ ...M.composeSpec(d, "", ""), id: "x" }, "/r", "/s")
  assert.match(sh, /"\$prep_flags" 4 \|\| echo/)
  // above bold it is dithered and packed here, not transcoded
  assert.match(sh, /-posterize "\$tones"/)
  assert.match(sh, /LC_ALL=C awk/)
})

test("words with pictures ask the agent to draw from them", () => {
  const d = { ...M.importDefaults(), source: "images", paths: ["/p/a.png", "/p/b.png"], words: "the dog, snowing", animated: false }
  const spec = M.composeSpec(d, "agent:claude", "")
  assert.equal(spec.source, "prompt")
  assert.equal(spec.prompt, "the dog, snowing")
  assert.deepEqual(spec.paths, ["/p/a.png", "/p/b.png"])
  assert.equal(spec.animated, false)
  assert.equal(spec.name, "the dog")
})

test("the kind picked on Add decides what is made", () => {
  const d = M.importDefaults()
  assert.equal(M.ADD_KINDS.map(k => k.id).join(","), "describe,words,pictures,clip,clock,blank")
  // describing needs an agent and words
  assert.equal(M.composeMode({ ...d, kind: "describe", words: "a cat" }, ""), "")
  assert.equal(M.composeMode({ ...d, kind: "describe", words: "a cat" }, "agent:claude"), "describe")
  assert.equal(M.composeMode({ ...d, kind: "describe", words: "a cat", source: "images", paths: ["/p/a.png"] }, "agent:claude"), "describe-pictures")
  // words need words; pictures need pictures; a clip needs a clip
  assert.equal(M.composeMode({ ...d, kind: "words" }, ""), "")
  assert.equal(M.composeMode({ ...d, kind: "words", words: "Acme" }, "agent:claude"), "letters")
  assert.equal(M.composeMode({ ...d, kind: "pictures", words: "Holiday" }, ""), "")
  assert.equal(M.composeMode({ ...d, kind: "pictures", source: "folder", paths: ["/p/h"] }, ""), "folder")
  assert.equal(M.composeMode({ ...d, kind: "clip", source: "video", paths: ["/p/c.mp4"] }, ""), "clip")
  // a clock and a blank screen are ready at once, and take a name
  assert.equal(M.composeMode({ ...d, kind: "clock" }, ""), "clock")
  const blank = M.composeSpec({ ...d, kind: "blank", words: "Desk" }, "", "")
  assert.equal(blank.source, "empty")
  assert.equal(blank.name, "Desk")
  // what is attached picks the kind, except pictures for a description
  assert.equal(M.attach({ ...d, kind: "words" }, { source: "images", paths: ["/p/a.png"] }).kind, "pictures")
  assert.equal(M.attach({ ...d, kind: "describe" }, { source: "images", paths: ["/p/a.png"] }).kind, "describe")
  assert.equal(M.attach({ ...d, kind: "describe" }, { source: "video", paths: ["/p/c.mp4"] }).kind, "clip")
})

test("each state has its own colour, from the theme where it names one", () => {
  const colors = M.parseThemeColors('mode = "dark"\nred = "#a77467"\nyellow = "#79885e"\ngreen = "#81a27d"\n# a comment\n')
  assert.deepEqual(colors, { red: "#a77467", yellow: "#79885e", green: "#81a27d" })
  const f = { accent: "#9aaad3", muted: "#626369", urgent: "#ff0000", foreground: "#fff" }
  assert.equal(M.stateColor("working", colors, f), "#9aaad3")
  assert.equal(M.stateColor("needs", colors, f), "#79885e")
  assert.equal(M.stateColor("waiting", colors, f), "#81a27d")
  assert.equal(M.stateColor("error", colors, f), "#a77467")
  assert.equal(M.stateColor("idle", colors, f), "#626369")
  // a theme that names none still gets the hues
  assert.equal(M.stateColor("needs", {}, f), "#e0af68")
  assert.equal(M.stateColor("error", {}, f), "#ff0000")
})

test("a dot-matrix picture saver keeps its detail and can be drawn again at another", () => {
  const made = (source, kind) => ({ id: "p", name: "P", series: { kind: kind || "ascii", source } })
  // what it was drawn with; bold for one from before detail was a choice
  assert.equal(M.savedDetail(made({ type: "images", paths: ["/p/a.png"], detail: 3 })), 3)
  assert.equal(M.savedDetail(made({ type: "folder", paths: ["/p/h"] })), 0)
  // nothing else has the choice
  assert.equal(M.savedDetail(made({ type: "images", paths: ["/p/a.png"] }, "image")), -1)
  assert.equal(M.savedDetail(made({ type: "text", text: "x" })), -1)
  const spec = M.redetailSpec(made({ type: "images", paths: ["/p/a.png", "/p/b.png"], detail: 1 }), 4)
  assert.equal(spec.retryOf, "p")
  assert.equal(spec.detail, 4)
  assert.equal(spec.keepSettings, true)
  assert.deepEqual(spec.paths, ["/p/a.png", "/p/b.png"])
  // the saver records the level it was drawn at
  assert.equal(JSON.parse(M.metaJson({ ...spec, id: "p" }, {})).source.detail, 4)
  // and the old pieces go before the new ones are drawn
  assert.match(M.importScript({ ...spec, id: "p" }, "/r", "/s"), /rm -f "\$dir"\/\[0-9\]\[0-9\]\[0-9\]\.txt/)
})
