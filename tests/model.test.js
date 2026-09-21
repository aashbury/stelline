const test = require("node:test")
const assert = require("node:assert/strict")
const M = require("../StellineModel.js")

test("defaults pick the wordmark with no rules at all", () => {
  const d = M.defaults()
  assert.equal(d.saver, "wordmark")
  assert.deepEqual(d.situations, [])
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
  assert.deepEqual(M.rotation(M.defaults(), list), ["wordmark", "clock", "matrix", "blank", "acme-co", "clip", "dance", "photos"])
  assert.equal(M.mergeSettings({ saver: "acme-co" }, list).saver, "acme-co")
  assert.equal(M.mergeSettings({ saver: "acme-co" }).saver, "wordmark")
  assert.equal(M.mergeSettings({ savers: { "acme-co": { dwellSec: 5 } } }).savers["acme-co"].dwellSec, 5)
  // an importing saver is never picked
  assert.equal(M.pickSaver(M.mergeSettings({ saver: "half" }, list), null, "", 0, list), "wordmark")
  assert.equal(M.pickSaver(M.defaults(), { saver: "half" }, "", 0, list), "wordmark")
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
  const stale = [{ id: "x", enabled: false, when: { theme: { name: "hackerman" }, battery: {} }, saver: "matrix" }]
  assert.ok(!M.ruleHas(stale[0], "theme"))
  const on = M.setRuleCondition(stale, "matrix", "night", true, ctx)
  assert.deepEqual(Object.keys(on[0].when), ["night"])
  assert.equal(on[0].enabled, true)
  // second saver's rule appends after the first
  const two = M.setRuleCondition(list.concat(on), "blank", "battery", true, ctx)
  assert.equal(two[1].saver, "blank")
  // labels
  const cfg = M.mergeSettings({ saver: "blank", situations: on })
  assert.equal(M.playsLabel(cfg, "blank"), "usually plays")
  assert.equal(M.playsLabel(cfg, "matrix"), "night 22:00–07:00")
  assert.equal(M.playsLabel(cfg, "clock"), "")
  const both = M.mergeSettings({ saver: "matrix", situations: on })
  assert.equal(M.playsLabel(both, "matrix"), "usually · night 22:00–07:00")
  const sh = M.mergeSettings({ shuffle: true, shuffleFrom: ["clock"], situations: on })
  assert.equal(M.playsLabel(sh, "clock"), "in the shuffle")
  assert.equal(M.playsLabel(sh, "blank"), "")
  // forgetting a saver clears every reference
  const fake = [{ id: "dance", name: "Dance", kind: "series", file: "savers/Series.qml", series: {} }]
  const patch = M.forgetSaver(M.mergeSettings({ saver: "dance", shuffleFrom: ["dance", "clock"], situations: [{ id: "r", enabled: true, when: { night: {} }, saver: "dance" }, { id: "t", enabled: true, when: { battery: {} }, saver: "dance", screensaver: 60 }], savers: { dance: { fps: 3 } } }, fake), "dance")
  assert.equal(patch.saver, "wordmark")
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
