import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Services.UPower
import Quickshell.Wayland
import "IdleModel.js" as IdleModel
import "StellineModel.js" as M

// Stelline: a clone of Omarchy's idle service (omarchy.idle). The idle →
// screensaver → lock timeline, stay-awake handling, and the "idle" IPC target
// are kept verbatim from the stock service; only what is drawn at the
// screensaver stage changes.
Item {
  id: root

  // Injected by omarchy-shell (the service loader).
  property var shell: null
  property var manifest: null
  property var pluginRegistry: null

  readonly property string pluginId: M.PLUGIN_ID
  readonly property string pluginVersion: manifest && manifest.version ? String(manifest.version) : ""

  // Settings: the bar widget relays its injected inline entry; before the bar
  // mounts (or with the widget off the bar) the entry is read from shell.json.
  property var barSettings: null
  readonly property var configEntry: M.findEntry(shell && shell.shellConfig ? shell.shellConfig : null, pluginId)
  // shell.shellConfig is updated in memory on every write, so it is the
  // fresher source; the bar's relayed copy only fills in if the host ever
  // stops exposing the config.
  readonly property var cfg: M.mergeSettings(configEntry || barSettings, userSavers)

  // The native screensaver surface (Saver.qml). `overlayReason` records why
  // it is up: "idle" dismissals cancel the idle cycle, previews do not.
  property bool overlayVisible: false
  property string overlaySaver: ""
  property string overlayReason: ""
  property string lastSaver: ""
  property bool miniVisible: false
  property string miniSaver: ""

  // ---- user savers ("series") ----
  // One folder each under ~/.config/omarchy/stelline/savers, scanned into the
  // picker; rescanned when the folder changes (imports touch a .stamp there).
  readonly property string userSaversDir: home + "/" + M.USER_SAVERS_SUBDIR
  property var userSavers: []
  readonly property var userSaverIds: userSavers.map(function(s) { return s.id })
  property bool scanAgain: false
  function rescan() { scanDebounce.restart() }
  Timer {
    id: scanDebounce
    interval: 250
    onTriggered: { if (scanner.running) root.scanAgain = true; else scanner.running = true }
  }
  Process {
    id: scanner
    command: ["bash", "-c", M.scanScript(root.userSaversDir)]
    stdout: StdioCollector {
      onStreamFinished: {
        var next = M.parseScan(String(text || ""))
        root.userSavers = next
        root.logEvent("savers-scanned", next.length + " user saver" + (next.length === 1 ? "" : "s"))
      }
    }
    onExited: if (root.scanAgain) { root.scanAgain = false; scanDebounce.restart() }
  }
  FileView {
    id: userDirWatcher
    path: root.userSaversDir
    watchChanges: true
    printErrors: false
    onFileChanged: root.rescan()
  }
  Process {
    id: userDirSetup
    command: ["bash", "-c", "mkdir -p " + M.shellQuote(root.userSaversDir)]
    onExited: { userDirWatcher.reload(); root.rescan() }
  }

  // ---- import ----
  // Imports run one at a time in the background as generated bash; the tile
  // shows up at once (saver.json is written first) and fills in when done.
  property var importQueue: []
  property var importingIds: []
  readonly property string runtimeDir: Quickshell.env("XDG_RUNTIME_DIR") || "/tmp"
  // The panel's in-progress "Add": kept here so it survives the panel closing
  // while the file chooser is up.
  property var importDraft: null

  function importSaver(spec) {
    if (!M.isPlainObject(spec)) return "bad-spec"
    var next = M.cloneJson(spec)
    var name = String(next.name || "").trim()
    if (name === "") name = M.suggestName(next.paths, next.source === "text" ? String(next.text || "").trim() : (next.source === "prompt" ? "Described" : "New saver"))
    next.name = name
    var taken = root.userSaverIds.concat(root.importQueue.map(function(q) { return q.id })).concat(root.importingIds)
    next.id = M.uniqueId(M.slugify(name), taken)
    root.importQueue = root.importQueue.concat([next])
    root.importDraft = null
    runNextImport()
    return next.id
  }

  function runNextImport() {
    if (importer.running || root.importQueue.length === 0) return
    var spec = root.importQueue[0]
    root.importQueue = root.importQueue.slice(1)
    var script = M.importScript(spec, root.userSaversDir)
    var path = root.runtimeDir + "/stelline-import-" + spec.id + ".sh"
    root.importingIds = root.importingIds.concat([spec.id])
    importer.currentId = spec.id
    importer.command = ["bash", "-lc",
      "mkdir -p " + M.shellQuote(root.userSaversDir) + " && printf %s " + M.shellQuote(script) + " > " + M.shellQuote(path)
      + " && chmod 700 " + M.shellQuote(path) + " && bash " + M.shellQuote(path) + "; rc=$?; rm -f " + M.shellQuote(path) + "; exit $rc"]
    logEvent("import-start", spec.id + " " + spec.source + "/" + spec.style)
    importer.running = true
  }

  Process {
    id: importer
    property string currentId: ""
    stderr: SplitParser { onRead: function(line) { root.logEvent("import", importer.currentId + ": " + String(line).trim()) } }
    onExited: function(exitCode) {
      root.logEvent("import-exit", importer.currentId + " exitCode=" + exitCode)
      var done = importer.currentId
      root.importingIds = root.importingIds.filter(function(i) { return i !== done })
      root.rescan()
      root.runNextImport()
    }
  }

  // Remove a user saver: its folder goes, and every setting that named it.
  function deleteSaver(id) {
    var s = M.saverById(id, root.userSavers)
    if (!s || s.kind !== "series") return "unknown-saver"
    var script = M.deleteScript(id, root.userSaversDir)
    if (!script) return "bad-id"
    if (root.overlayVisible && root.overlaySaver === id) hideScreensaver("deleted")
    if (root.miniVisible && root.miniSaver === id) root.miniVisible = false
    var patch = M.forgetSaver(root.cfg, id)
    if (Object.keys(patch).length) writeSettings(patch)
    // One at a time: runProcess skips a busy process, so deleting several in
    // a row would drop all but the first.
    root.deleteQueue = root.deleteQueue.concat([{ id: id, script: script }])
    runNextDelete()
    return "ok"
  }
  property var deleteQueue: []
  function runNextDelete() {
    if (deleter.running || root.deleteQueue.length === 0) return
    var job = root.deleteQueue[0]
    root.deleteQueue = root.deleteQueue.slice(1)
    runProcess(deleter, "delete-saver " + job.id, job.script)
  }
  Process { id: deleter; onExited: { root.rescan(); root.runNextDelete() } }

  // Per-saver rules: the tile's "plays when" conditions.
  function setRuleCondition(saverId, key, on) {
    return writeSettings({ situations: M.setRuleCondition(root.cfg.situations, saverId, key, !!on, root.situationContext) })
  }
  function patchRuleCondition(saverId, key, patch) {
    return writeSettings({ situations: M.patchRuleCondition(root.cfg.situations, saverId, key, patch) })
  }

  // The desktop file chooser (a portal dialog, so the panel loses focus and
  // closes); when it answers, the draft gets the paths and the panel is
  // summoned back to finish.
  property string pickKind: ""
  property var pickedPaths: []
  function pickFiles(kind) {
    if (picker.running) return "busy"
    // Scripted (`omarchy-shell stelline pick images`): open an Add for it.
    if (!M.isPlainObject(root.importDraft)) { var d = M.importDefaults(); d.step = "picking"; root.importDraft = d }
    var argv = ["omarchy-file-select", "--title"]
    if (kind === "folder") argv = argv.concat(["Pick a folder of pictures", "--directory"])
    else if (kind === "video") argv = argv.concat(["Pick a video or GIF", "--extensions", M.VIDEO_EXTENSIONS.join(" ")])
    else argv = argv.concat(["Pick pictures", "--multiple", "--extensions", M.IMAGE_EXTENSIONS.join(" ")])
    root.pickKind = kind
    root.pickedPaths = []
    picker.command = argv
    picker.running = true
    logEvent("pick-start", kind)
    return "ok"
  }
  Process {
    id: picker
    stdout: SplitParser { onRead: function(line) { var t = String(line).trim(); if (t !== "") root.pickedPaths = root.pickedPaths.concat([t]) } }
    onExited: function(exitCode) {
      root.logEvent("pick-exit", root.pickKind + " exitCode=" + exitCode + " picked=" + root.pickedPaths.length)
      // Only while the Add card is still open: a cancelled Add ignores a late answer.
      if (exitCode === 0 && root.pickedPaths.length > 0 && M.isPlainObject(root.importDraft)) {
        var draft = M.cloneJson(root.importDraft)
        draft.source = root.pickKind === "folder" ? "folder" : (root.pickKind === "video" ? "video" : "images")
        draft.paths = root.pickedPaths.slice()
        if (!draft.name || draft.nameAuto !== false) { draft.name = M.suggestName(draft.paths, "New saver"); draft.nameAuto = true }
        draft.step = "confirm"
        root.importDraft = draft
        root.summonPanel()
      }
      root.pickKind = ""
    }
  }
  function summonPanel() { Quickshell.execDetached(["omarchy-shell", "shell", "summon", root.pluginId, "{}"]) }

  // ---- wordmarks -----------------------------------------------------------
  //
  // A wordmark is a saver whose content is a word you typed, so changing it is
  // typing a different word. The text is the setting; the block art beside it
  // is a cache, rebuilt whenever the text changes. A built-in one caches here;
  // one of your own caches in its own folder, so the folder stays portable.
  readonly property string wordmarkDir: home + "/.config/omarchy/stelline/wordmarks"
  property var renderingWordmarks: []

  function wordmarkArtPath(id) {
    var saver = M.saverById(id, root.userSavers)
    if (saver && saver.series && saver.series.dir) {
      var pieces = saver.series.pieces || []
      return pieces.length ? String(pieces[0]) : saver.series.dir + "/001.txt"
    }
    return root.wordmarkDir + "/" + id + ".txt"
  }

  function writeSaverSetting(id, patch) {
    var savers = M.cloneJson(root.cfg.savers)
    var current = savers[id] || {}
    for (var k in patch) current[k] = patch[k]
    savers[id] = current
    return writeSettings({ savers: savers })
  }

  // Empty text is not a failure: a built-in wordmark falls back to the shared
  // Omarchy artwork, which is what the Original plays.
  function setWordmarkText(id, text) {
    var saver = M.saverById(id, root.userSavers)
    if (!saver || M.saverType(saver) !== "wordmark") return "not-a-wordmark"
    var want = String(text === undefined || text === null ? "" : text)
    if (!writeSaverSetting(id, { text: want })) return "failed"
    if (want.trim() === "") return "ok"
    renderWordmark(id, want)
    return "ok"
  }

  function renderWordmark(id, text) {
    if (root.renderingWordmarks.indexOf(id) !== -1) return
    root.renderingWordmarks = root.renderingWordmarks.concat([id])
    var path = root.runtimeDir + "/stelline-wordmark-" + id + ".sh"
    wordmarkWriter.pending = { id: id, path: path }
    runProcess(wordmarkWriter, "wordmark-write " + id,
      "printf %s " + M.shellQuote(M.wordmarkScript(text, root.wordmarkArtPath(id))) + " > " + M.shellQuote(path))
  }
  Process {
    id: wordmarkWriter
    property var pending: null
    onExited: function(exitCode) {
      var job = wordmarkWriter.pending
      wordmarkWriter.pending = null
      if (exitCode !== 0 || !job) { root.finishWordmark(job ? job.id : "") ; return }
      wordmarkRunner.jobId = job.id
      root.runProcess(wordmarkRunner, "wordmark " + job.id, "bash " + M.shellQuote(job.path) + "; rm -f " + M.shellQuote(job.path))
    }
  }
  Process {
    id: wordmarkRunner
    property string jobId: ""
    onExited: function(exitCode) {
      root.logEvent("wordmark", wordmarkRunner.jobId + " exitCode=" + exitCode)
      // A saver of your own keeps its art in its folder; nudge the scan so the
      // tile and the screensaver pick the new art up.
      root.rescan()
      root.finishWordmark(wordmarkRunner.jobId)
    }
  }
  function finishWordmark(id) {
    root.renderingWordmarks = root.renderingWordmarks.filter(function(i) { return i !== id })
  }

  // The clipboard as a source. `clipboardHas` is "image" (bytes), "paths"
  // (files or a folder) or "" — the Add card only offers Paste when there is
  // something to paste, so the button never disappoints.
  property string clipboardHas: ""
  readonly property string pasteStageDir: runtimeDir + "/stelline-paste"
  function refreshClipboard() {
    if (clipProbe.running) return
    clipProbe.command = ["bash", "-c", M.clipboardProbeScript()]
    clipProbe.running = true
  }
  Process {
    id: clipProbe
    stdout: SplitParser { onRead: function(line) { var t = String(line).trim(); root.clipboardHas = (t === "image" || t === "paths") ? t : "" } }
    onExited: function(exitCode) { if (exitCode !== 0) root.clipboardHas = "" }
  }

  property var pastedRows: []
  function pasteClipboard() {
    if (paster.running) return "busy"
    if (!M.isPlainObject(root.importDraft)) { var d = M.importDefaults(); d.step = "start"; root.importDraft = d }
    root.pastedRows = []
    paster.command = ["bash", "-c", M.clipboardPasteScript(root.pasteStageDir)]
    paster.running = true
    logEvent("paste-start", "")
    return "ok"
  }
  Process {
    id: paster
    stdout: SplitParser { onRead: function(line) { if (String(line).trim() !== "") root.pastedRows = root.pastedRows.concat([String(line)]) } }
    onExited: function(exitCode) {
      var found = exitCode === 0 ? M.parseClipboard(root.pastedRows.join("\n")) : null
      root.logEvent("paste-exit", "exitCode=" + exitCode + " rows=" + root.pastedRows.length)
      if (!found || !M.isPlainObject(root.importDraft)) { root.clipboardHas = ""; return }
      var draft = M.cloneJson(root.importDraft)
      draft.source = found.source
      draft.paths = found.paths
      if (!draft.name || draft.nameAuto !== false) {
        // Pasted bytes land on a file called pasted.png; that is no name.
        draft.name = found.paths[0].indexOf(root.pasteStageDir) === 0 ? "Pasted picture" : M.suggestName(draft.paths, "New saver")
        draft.nameAuto = true
      }
      draft.step = "confirm"
      root.importDraft = draft
    }
  }


  // The screensaver artwork (~/.config/omarchy/branding/screensaver.txt) — the
  // same file Style › Screensaver edits, shown by Wordmark and the Original.
  // The same three edits as the stock menu, without its forced terminal preview:
  // Wordmark shows the change live.
  readonly property string brandingPath: home + "/.config/omarchy/branding/screensaver.txt"
  function brandingImage() {
    if (brandingProcess.running) return "busy"
    runProcess(brandingProcess, "branding-image", "f=$(omarchy-file-select --title " + M.shellQuote("Pick a PNG or SVG for the screensaver") + " --extensions 'png svg') && omarchy-transcode-ascii \"$f\" " + M.shellQuote(root.brandingPath))
    return "ok"
  }
  function brandingText() {
    Quickshell.execDetached(["omarchy-launch-editor", root.brandingPath])
    return "ok"
  }
  function brandingReset() {
    if (brandingProcess.running) return "busy"
    runProcess(brandingProcess, "branding-reset", "cp " + M.shellQuote(root.omarchyPath + "/logo.txt") + " " + M.shellQuote(root.brandingPath))
    return "ok"
  }
  Process { id: brandingProcess; onExited: function(exitCode) { root.logEvent("process-exit", "branding exitCode=" + exitCode) } }

  // Who answers "Describe it": Omarchy's default coding agent (`omarchy
  // default agent`) when one is set and installed, else Claude Code, else the
  // API with a key. "" when nothing is there. Re-probed whenever the panel opens.
  property string aiProvider: ""
  function refreshAi() { if (!aiProbe.running) aiProbe.running = true }
  Process {
    id: aiProbe
    command: ["bash", "-lc", "a=$(omarchy-default-agent 2>/dev/null || true); if [[ -n $a ]] && command -v \"$a\" >/dev/null 2>&1; then echo \"agent:$a\"; elif command -v claude >/dev/null 2>&1; then echo agent:claude; elif [[ -n ${ANTHROPIC_API_KEY:-} ]]; then echo api; else echo none; fi"]
    stdout: SplitParser { onRead: function(line) { var t = String(line).trim(); root.aiProvider = t === "none" ? "" : t } }
  }

  readonly property string home: Quickshell.env("HOME")
  // Injected by the shell when it knows better; the env is the fallback.
  property string omarchyPath: Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy"
  readonly property string stayAwakeStateDir: home + "/.local/state/omarchy/indicators"
  readonly property string stayAwakeStatePath: stayAwakeStateDir + "/stay-awake"
  readonly property int defaultScreensaverSeconds: 150
  readonly property int defaultLockSeconds: 300
  readonly property var idleConfig: shell && shell.shellConfig && shell.shellConfig.idle ? shell.shellConfig.idle : ({})
  // Stelline: the effective timeline. Stock reads two numbers; here the
  // plugin's stage switches and the active situation are folded in. shell.json's
  // idle.screensaver / idle.lock remain the source of truth for the numbers.
  // Situation inputs: power, the clock, the theme. Evaluated live, so a rule
  // that changes the timeouts re-arms the monitor the moment it applies.
  readonly property bool onBattery: UPower.onBattery === true
  readonly property real batteryPercent: UPower.displayDevice && UPower.displayDevice.ready && UPower.displayDevice.isPresent
    ? UPower.displayDevice.percentage * 100 : -1
  property int minuteOfDay: -1
  property string themeName: ""
  // Docked: an external monitor is one of the compositor's active outputs.
  // Follows Quickshell.screens, so plugging in or unplugging re-evaluates
  // every rule at once.
  readonly property var screenNames: {
    var names = []
    for (var i = 0; i < Quickshell.screens.length; i++) names.push(String(Quickshell.screens[i].name))
    return names
  }
  readonly property bool docked: M.isDocked(screenNames)
  onDockedChanged: logEvent("docked", docked ? "external monitor active" : "laptop panel only")
  readonly property var situationContext: ({ onBattery: onBattery, batteryPercent: batteryPercent, minuteOfDay: minuteOfDay, themeName: themeName, docked: docked })
  readonly property var situation: M.activeSituation(cfg.situations, situationContext)
  onSituationChanged: logEvent("situation", situation ? situation.id : "none")

  function tickMinute() {
    var now = new Date()
    var m = now.getHours() * 60 + now.getMinutes()
    if (m !== root.minuteOfDay) root.minuteOfDay = m
  }
  Timer {
    interval: 20000
    repeat: true
    running: true
    triggeredOnStart: true
    onTriggered: root.tickMinute()
  }
  FileView {
    path: root.home + "/.local/state/omarchy/current/theme.name"
    watchChanges: true
    printErrors: false
    onLoaded: root.themeName = String(text()).trim()
    onFileChanged: reload()
  }
  readonly property var effective: M.effectiveTimeouts(idleConfig, cfg, situation)
  readonly property int screensaverTimeoutSeconds: effective.screensaver
  readonly property int lockTimeoutSeconds: effective.lock
  readonly property bool screensaverStageEnabled: effective.screensaverEnabled
  readonly property bool lockStageEnabled: effective.lockEnabled
  readonly property int firstIdleTimeoutSeconds: M.firstTimeout(effective)
  readonly property int screensaverDelaySeconds: Math.max(0, screensaverTimeoutSeconds - firstIdleTimeoutSeconds)
  readonly property int lockDelaySeconds: Math.max(0, lockTimeoutSeconds - firstIdleTimeoutSeconds)
  readonly property bool idleEnabled: stayAwakeStateLoaded && !stayAwake && (screensaverStageEnabled || lockStageEnabled)

  // Changing the timeout of a live IdleMonitor does not re-register the
  // ext-idle-notify timer (upstream #8038); bounce `enabled` so it does.
  property bool rearming: false
  onFirstIdleTimeoutSecondsChanged: {
    root.rearming = true
    rearmTimer.restart()
  }
  Timer {
    id: rearmTimer
    interval: 0
    onTriggered: {
      root.rearming = false
      logEvent("idle-monitor-rearmed", "timeout=" + root.firstIdleTimeoutSeconds)
    }
  }

  // The stock screensaver-off toggle (`omarchy toggle screensaver`): honoured
  // for the idle screensaver, ignored by previews. Same flag-file shape as
  // stay-awake.
  readonly property string togglesDir: home + "/.local/state/omarchy/toggles"
  property bool screensaverOff: false

  // Session lock: the stock lock service's reactive `locked` when it is loaded,
  // otherwise (a lock-explorer style clone in its place) a short poll while it
  // matters. A locked session never gets a screensaver, and a lock that lands
  // while one is up takes it down.
  readonly property var lockSvc: shell && typeof shell.serviceFor === "function" ? shell.serviceFor("omarchy.lock") : null
  property bool lockedPolled: false
  readonly property bool locked: lockSvc ? lockSvc.locked === true : lockedPolled
  readonly property string lockSource: lockSvc ? "service" : "poll"
  onLockedChanged: if (locked && root.overlayVisible) {
    root.overlayVisible = false
    root.overlayReason = ""
    logEvent("overlay-hide", "session-locked")
  }

  // Status card inputs. DND and the agent file are watched always (tiny);
  // the notification files are digested only while a saver is up.
  readonly property string notificationsDir: home + "/.local/state/omarchy/notifications"
  property bool dnd: false
  property string agentState: ""
  property var cardGroups: []
  readonly property bool cardEnabled: cfg.card && cfg.card.enabled !== false
  readonly property bool cardVisible: cardEnabled && !dnd
    && (cardGroups.length > 0 || (cfg.card.showAgent !== false && agentState !== "" && agentState !== "idle"))
  readonly property bool anySaverShown: overlayVisible || miniVisible

  function refreshCard() {
    if (!cardEnabled || dnd) { root.cardGroups = []; return }
    if (!cardProbe.running) cardProbe.running = true
  }
  onAnySaverShownChanged: if (anySaverShown) refreshCard()
  onDndChanged: refreshCard()

  FileView {
    path: root.home + "/.local/state/omarchy/notifications.json"
    watchChanges: true
    printErrors: false
    onLoaded: {
      var v = false
      try { v = JSON.parse(text()).dnd === true } catch (e) { v = false }
      if (v !== root.dnd) root.dnd = v
    }
    onFileChanged: reload()
    onLoadFailed: root.dnd = false
  }

  FileView {
    path: root.home + "/.local/state/omarchy/agent-ambient"
    watchChanges: true
    printErrors: false
    onLoaded: root.agentState = String(text()).trim().toLowerCase()
    onFileChanged: reload()
    onLoadFailed: root.agentState = ""
  }

  FileView {
    path: root.notificationsDir
    watchChanges: true
    printErrors: false
    onFileChanged: cardDebounce.restart()
  }
  Timer {
    id: cardDebounce
    interval: 300
    onTriggered: if (root.anySaverShown) root.refreshCard()
  }
  Timer {
    interval: 60000
    repeat: true
    running: root.anySaverShown
    onTriggered: root.refreshCard()
  }

  Process {
    id: cardProbe
    command: ["bash", "-c",
      'd="$HOME/.local/state/omarchy/notifications"; shopt -s nullglob; ' +
      'for f in "$d"/*.json; do cat "$f"; echo; done; ' +
      'for f in "$d"/history/*.json; do sed \'s/^{/{"__history":true,/\' "$f"; echo; done']
    stdout: StdioCollector {
      onStreamFinished: {
        // Idle savers show what arrived since you left; previews show the last half hour.
        var since = root.overlayReason === "idle" ? root.idleStartedAtMs : Date.now() - 30 * 60 * 1000
        root.cardGroups = M.digest(String(text || ""), since, root.cfg.card && root.cfg.card.maxApps)
      }
    }
  }

  // Finish setup: retire the stock StayAwake indicator (it binds to the stock
  // idle service and is dead under any clone — this icon does its job now),
  // remembering what was there so Undo can put it back exactly.
  readonly property bool stayAwakeIndicatorShown: M.stayAwakeIndicatorShown(shell && shell.shellConfig ? shell.shellConfig : null)
  readonly property bool setupDone: cfg.setup && cfg.setup.done === true
  readonly property bool setupPending: !setupDone || stayAwakeIndicatorShown

  function finishSetup() {
    if (!shell || typeof shell.mutateShellConfig !== "function") return "failed"
    var changed = false
    shell.mutateShellConfig(function(config) { changed = M.applyFinishSetup(config, root.pluginId) })
    logEvent("finish-setup", changed ? "applied" : "nothing to do")
    return changed ? "ok" : "nothing-to-do"
  }

  function undoSetup() {
    if (!shell || typeof shell.mutateShellConfig !== "function") return "failed"
    var changed = false
    shell.mutateShellConfig(function(config) { changed = M.applyUndoSetup(config, root.pluginId) })
    if (root.cfg.integration && root.cfg.integration.menuEntry) setMenuEntry(false)
    logEvent("undo-setup", changed ? "restored" : "nothing to do")
    return changed ? "ok" : "nothing-to-do"
  }

  // Until the shell restarts after enabling, the stock service still answers
  // the `idle` IPC target; the panel offers a restart while that is so.
  property bool staleIdleOwner: false
  function probeIpcOwner() { if (!ipcOwnerProbe.running) ipcOwnerProbe.running = true }
  Process {
    id: ipcOwnerProbe
    command: ["bash", "-c", "omarchy-shell idle status 2>/dev/null | jq -r '.clone // \"none\"'"]
    stdout: SplitParser { onRead: function(line) { root.staleIdleOwner = String(line).trim() !== "stelline" } }
  }

  // Menu override: System > Screensaver (Super+Esc) opens Stelline. Edits the
  // user's extensions file textually, never through a JSON round-trip, and
  // refuses to touch a file that does not parse.
  readonly property string menuPath: home + "/.config/omarchy/extensions/omarchy-menu.jsonc"
  property string menuText: ""
  property bool menuTextLoaded: false
  FileView {
    id: menuFile
    path: root.menuPath
    watchChanges: true
    printErrors: false
    onLoaded: { root.menuText = text(); root.menuTextLoaded = true }
    onFileChanged: reload()
    onLoadFailed: { root.menuText = ""; root.menuTextLoaded = true }
  }
  readonly property bool menuOverrideActive: M.menuHasOverride(menuText)
  function setMenuEntry(on) {
    var next = on ? M.menuInsertOverride(root.menuText) : M.menuRemoveOverride(root.menuText)
    if (next === null) { logEvent("menu-override", "refused: file does not parse"); return "unparseable" }
    if (next === root.menuText) { writeSettings({ integration: { menuEntry: !!on } }); return "ok" }
    runProcess(menuWriter, "menu-override", "mkdir -p " + M.shellQuote(root.home + "/.config/omarchy/extensions") + " && printf %s " + M.shellQuote(next) + " > " + M.shellQuote(root.menuPath))
    writeSettings({ integration: { menuEntry: !!on } })
    return "ok"
  }
  Process { id: menuWriter; onExited: function(exitCode) { logEvent("process-exit", "menu-override exitCode=" + exitCode) } }

  // Set from IPC for testing the timeline without locking yourself out.
  property bool lockDryRun: false
  property bool simulatedIdle: false
  property double idleStartedAtMs: 0
  readonly property string screensaverClass: "org.omarchy.screensaver"

  property bool stayAwake: false
  property bool stayAwakeStateLoaded: false
  property bool hasPendingStayAwakePersist: false
  property bool pendingStayAwakePersist: false
  property bool idledThisCycle: false
  property bool screensaverStartedThisCycle: false
  property string lastEvent: "starting"
  property string lastEventAt: ""
  property var screensaverWindows: ({})
  property int screensaverWindowCount: 0

  function secondsFromConfig(value, fallback) {
    return IdleModel.secondsFromConfig(value, fallback)
  }

  function nowIso() {
    return new Date().toISOString()
  }

  function logEvent(event, details) {
    var suffix = details === undefined || details === null || details === "" ? "" : ": " + String(details)
    root.lastEventAt = nowIso()
    root.lastEvent = event + suffix
    console.log("omarchy idle " + root.lastEventAt + " " + root.lastEvent)
  }

  function runProcess(process, label, command) {
    if (process.running) {
      logEvent("process-skip", label + " already running")
      return false
    }
    logEvent("process-start", label + " " + command)
    process.command = ["bash", "-lc", command]
    process.running = true
    return true
  }

  function launchScreensaver() {
    root.screensaverStartedThisCycle = true
    screensaverLaunchGraceTimer.restart()
    if (root.locked) { logEvent("screensaver-skip", "session locked"); return }
    if (root.screensaverOff) { logEvent("screensaver-skip", "screensaver-off toggle"); return }
    var id = M.pickSaver(root.cfg, root.situation, root.lastSaver, undefined, root.userSavers)
    if (id === "terminal") { startTerminalSaver(false); return }
    showOverlay(id, "idle")
  }

  // The stock terminal saver needs focus: Omarchy's own loop exits after a
  // second without it, and a window that opens while our panel — a layer
  // surface holding the keyboard — is up comes up floating at 700×500,
  // unfocused, and dies: the "small clipped window". The stock menu never
  // hits this because it closes before its action runs. So the panel closes
  // first, and the launch waits a beat for the surface to go.
  signal panelCloseRequested()
  property bool terminalForce: false
  function startTerminalSaver(force) {
    root.terminalForce = !!force
    root.panelCloseRequested()
    terminalStart.restart()
  }
  Timer {
    id: terminalStart
    interval: 250
    onTriggered: root.launchTerminal(root.terminalForce)
  }

  // The stock terminal saver. With no effects pinned this is the stock
  // launcher, verbatim. With pins, the stock launcher cannot take effect
  // arguments, so the same terminal is started here running a generated copy
  // of omarchy-screensaver — same window class, so tracking, dismissal and
  // omarchy-system-lock's cleanup are unchanged.
  readonly property string terminalLoopPath: (Quickshell.env("XDG_RUNTIME_DIR") || "/tmp") + "/stelline-terminal-saver.sh"
  property string terminalId: ""
  property var terminalPendingScreens: []
  property string terminalFocusedMonitor: ""

  function launchTerminal(force) {
    var effects = root.cfg.savers && root.cfg.savers.terminal ? root.cfg.savers.terminal.effects : []
    if (!Array.isArray(effects) || effects.length === 0 || root.terminalId === "") {
      // `force` is a preview: it bypasses the screensaver-off toggle the way
      // the stock menu entry does.
      runProcess(screensaverProcess, "screensaver", force ? "omarchy-launch-screensaver force"
        : "[[ $(omarchy-shell lock isLocked 2>/dev/null) == \"true\" ]] || omarchy-launch-screensaver")
      return
    }
    var argv = M.terminalArgv(root.terminalId, root.omarchyPath || "/usr/share/omarchy", root.terminalLoopPath)
    if (!argv) {
      logEvent("terminal-skip", "unsupported terminal " + root.terminalId)
      runProcess(screensaverProcess, "screensaver", "omarchy-launch-screensaver")
      return
    }
    var quoted = argv.map(M.shellQuote).join(" ")
    var screens = []
    for (var i = 0; i < Quickshell.screens.length; i++) screens.push(String(Quickshell.screens[i].name))
    root.terminalPendingScreens = screens
    // Write the loop, remember the focused monitor, then spawn per monitor the
    // way the stock launcher does: focus it, exec, wait for the window.
    runProcess(terminalWriter, "terminal-loop", "printf %s " + M.shellQuote(M.terminalLoop(effects)) + " > " + M.shellQuote(root.terminalLoopPath)
      + " && chmod 700 " + M.shellQuote(root.terminalLoopPath)
      + " && hyprctl monitors -j | jq -r '.[] | select(.focused) | .name'")
    root.terminalCommand = quoted
  }
  property string terminalCommand: ""

  function spawnNextTerminal() {
    if (root.terminalPendingScreens.length === 0) {
      if (root.terminalFocusedMonitor !== "") runProcess(terminalFocusProcess, "terminal-refocus", "hyprctl dispatch " + M.shellQuote("hl.dsp.focus({ monitor = \"" + root.terminalFocusedMonitor + "\" })") + " >/dev/null 2>&1 || hyprctl dispatch focusmonitor " + M.shellQuote(root.terminalFocusedMonitor))
      return
    }
    var name = root.terminalPendingScreens[0]
    root.terminalPendingScreens = root.terminalPendingScreens.slice(1)
    var focus = "hyprctl dispatch " + M.shellQuote("hl.dsp.focus({ monitor = \"" + name + "\" })") + " >/dev/null 2>&1 || hyprctl dispatch focusmonitor " + M.shellQuote(name)
    var exec = "hyprctl dispatch " + M.shellQuote("hl.dsp.exec_cmd([[" + root.terminalCommand + "]])") + " >/dev/null 2>&1 || hyprctl dispatch exec -- bash -lc " + M.shellQuote(root.terminalCommand)
    runProcess(terminalSpawnProcess, "terminal-spawn " + name, focus + "; " + exec)
    terminalSpawnDeadline.restart()
  }

  Process {
    id: terminalWriter
    stdout: SplitParser { onRead: function(line) { root.terminalFocusedMonitor = String(line).trim() } }
    onExited: function(exitCode) {
      if (exitCode !== 0) { logEvent("terminal-loop-failed", "exit " + exitCode); runProcess(screensaverProcess, "screensaver", "omarchy-launch-screensaver"); return }
      root.spawnNextTerminal()
    }
  }
  Process { id: terminalSpawnProcess; onExited: function(exitCode) { logEvent("process-exit", "terminal-spawn exitCode=" + exitCode) } }
  Process { id: terminalFocusProcess }
  Process { id: killProcess }
  Timer {
    id: terminalSpawnDeadline
    interval: 5000
    onTriggered: { logEvent("terminal-spawn", "window deadline passed, moving on"); root.spawnNextTerminal() }
  }
  Process {
    id: terminalIdProbe
    command: ["xdg-terminal-exec", "--print-id"]
    stdout: SplitParser { onRead: function(line) { root.terminalId = String(line).trim() } }
  }

  function showOverlay(id, reason) {
    var saver = M.saverById(id, root.userSavers)
    if (!saver) return "unknown-saver"
    if (saver.series && saver.series.importing) return "importing"
    if (!M.isNativeSaver(saver)) {
      startTerminalSaver(true)
      return "ok"
    }
    root.overlaySaver = id
    root.lastSaver = id
    root.overlayReason = reason || "preview"
    root.overlayVisible = true
    logEvent("overlay-show", id + " " + root.overlayReason)
    return "ok"
  }

  // Every dismissal of the native surface funnels through here. A saver that
  // came up for idle counts as the screensaver: dismissing it is activity and
  // cancels the pending lock, exactly as the stock terminal saver does.
  function hideScreensaver(reason) {
    // A terminal saver is a window; end it the way its own keypress does.
    // Its closewindow event then cancels the idle cycle exactly as stock.
    if (root.screensaverWindowCount > 0) runProcess(killProcess, "kill-terminal-saver", "pkill -x ttfx; pkill -f '[o]rg.omarchy.screensaver'; hyprctl eval 'hl.config({ cursor = { invisible = false } })' >/dev/null 2>&1 || hyprctl keyword cursor:invisible false >/dev/null 2>&1 || true")
    if (!root.overlayVisible) return
    var wasIdle = root.overlayReason === "idle"
    root.overlayVisible = false
    root.overlayReason = ""
    if (wasIdle && root.idledThisCycle) cancelIdleCycle("screensaver-dismissed:" + (reason || "input"))
    else logEvent("overlay-hide", reason || "requested")
  }

  function nextSaver() {
    if (!root.overlayVisible) return
    root.overlaySaver = M.nextSaver(root.cfg, root.overlaySaver, root.userSavers)
    root.lastSaver = root.overlaySaver
    logEvent("overlay-next", root.overlaySaver)
  }

  function lockSystem(reason) {
    logEvent("lock-system", reason || "requested")
    root.overlayVisible = false
    root.overlayReason = ""
    screensaverTimer.stop()
    lockTimer.stop()
    screensaverLaunchGraceTimer.stop()
    root.idledThisCycle = false
    root.screensaverStartedThisCycle = false
    resetScreensaverWindows()
    if (root.lockDryRun) {
      logEvent("lock-dry-run", "omarchy-system-lock would run now")
      runProcess(lockProcess, "lock-dry-run", "omarchy-notification-send -g 󰌾 \"Stelline\" \"Lock would fire now (dry run)\"")
      return
    }
    runProcess(lockProcess, "lock", "omarchy-system-lock")
  }

  function startIdleCycle() {
    if (root.idledThisCycle) {
      logEvent("idle-cycle-already-running")
      return
    }

    logEvent("idle-cycle-start", "screensaver=" + (root.screensaverStageEnabled ? root.screensaverTimeoutSeconds : "off")
      + " lock=" + (root.lockStageEnabled ? root.lockTimeoutSeconds : "never")
      + (root.situation ? " situation=" + root.situation.id : ""))
    root.idledThisCycle = true
    root.screensaverStartedThisCycle = false
    root.idleStartedAtMs = Date.now()
    resetScreensaverWindows()

    if (root.screensaverStageEnabled) {
      if (root.screensaverDelaySeconds === 0) launchScreensaver()
      else screensaverTimer.restart()
    }

    if (root.lockStageEnabled) {
      if (root.lockDelaySeconds === 0) lockSystem("lock-timeout-immediate")
      else lockTimer.restart()
    }
  }

  function cancelIdleCycle(reason) {
    logEvent("idle-cycle-cancel", reason || "requested")
    root.overlayVisible = false
    root.overlayReason = ""
    screensaverTimer.stop()
    lockTimer.stop()
    screensaverLaunchGraceTimer.stop()

    if (root.idledThisCycle) runProcess(wakeProcess, "wake", "omarchy-system-wake")

    root.idledThisCycle = false
    root.screensaverStartedThisCycle = false
    root.simulatedIdle = false
    resetScreensaverWindows()
  }

  function resetScreensaverWindows() {
    root.screensaverWindows = ({})
    root.screensaverWindowCount = 0
  }

  function setScreensaverWindow(address, visible) {
    var next = IdleModel.screensaverWindowsAfter(root.screensaverWindows, address, visible)
    root.screensaverWindows = next.windows
    root.screensaverWindowCount = next.count
  }

  function handleScreensaverWindowOpened(address) {
    setScreensaverWindow(address, true)
    screensaverLaunchGraceTimer.stop()
    if (terminalSpawnDeadline.running) { terminalSpawnDeadline.stop(); root.spawnNextTerminal() }
  }

  function handleScreensaverWindowClosed(address) {
    setScreensaverWindow(address, false)

    if (!root.idleEnabled || !root.idledThisCycle || !root.screensaverStartedThisCycle) return
    if (root.screensaverWindowCount > 0) return

    // The user dismissed the screensaver before the lock deadline. Treat that
    // as activity and cancel the pending lock; the lock timer is only allowed
    // to fire while the screensaver remains up.
    root.cancelIdleCycle("screensaver-dismissed")
  }

  function eventParts(event, count) {
    return IdleModel.eventParts(event, count)
  }

  function handleHyprlandEvent(event) {
    var name = String(event && event.name ? event.name : "")
    if (name === "openwindow") {
      var open = eventParts(event, 4)
      if (String(open[2] || "") === root.screensaverClass) root.handleScreensaverWindowOpened(open[0])
    } else if (name === "closewindow") {
      var close = eventParts(event, 1)
      var address = String(close[0] || "")
      if (root.screensaverWindows[address]) root.handleScreensaverWindowClosed(address)
    }
  }

  function handleActiveSignal() {
    if (!root.idledThisCycle) return

    // Starting the screensaver can make the compositor report activity. Keep
    // the lock timer running once the screensaver exists (or during its short
    // launch grace); Hyprland window events cancel the cycle if it exits before
    // the normal lock deadline.
    if (root.screensaverStartedThisCycle && (root.overlayVisible || root.screensaverWindowCount > 0 || screensaverLaunchGraceTimer.running)) {
      logEvent("idle-monitor-active", "screensaver cycle remains armed")
      return
    }

    cancelIdleCycle("activity")
  }

  function handleIdleChanged() {
    logEvent("idle-monitor", idleMonitor.isIdle ? "idle" : "active")
    if (!root.idleEnabled) return

    if (idleMonitor.isIdle) startIdleCycle()
    else handleActiveSignal()
  }

  function statusJson() {
    return JSON.stringify({
      clone: "stelline",
      version: root.pluginVersion,
      saver: root.cfg.saver,
      overlay: { visible: root.overlayVisible, saver: root.overlaySaver, reason: root.overlayReason },
      stages: { screensaver: root.screensaverStageEnabled, lock: root.lockStageEnabled },
      screensaverOff: root.screensaverOff,
      locked: root.locked,
      lockSource: root.lockSource,
      lockDryRun: root.lockDryRun,
      shuffle: root.cfg.shuffle,
      card: { visible: root.cardVisible, dnd: root.dnd, agent: root.agentState, groups: root.cardGroups.length },
      setup: { done: root.setupDone, pending: root.setupPending, stayAwakeIndicatorShown: root.stayAwakeIndicatorShown, staleIdleOwner: root.staleIdleOwner, menuOverride: root.menuOverrideActive },
      terminal: root.terminalId,
      userSavers: root.userSaverIds,
      importing: root.importingIds,
      queued: root.importQueue.length,
      ai: root.aiProvider,
      draft: root.importDraft ? (root.importDraft.step || "start") : null,
      situation: root.situation ? root.situation.id : null,
      situationSaver: root.situation && root.situation.saver ? root.situation.saver : null,
      context: root.situationContext,
      enabled: root.idleEnabled,
      stayAwake: root.stayAwake,
      stayAwakeStateLoaded: root.stayAwakeStateLoaded,
      stayAwakeStatePath: root.stayAwakeStatePath,
      idle: idleMonitor.isIdle,
      inIdleCycle: root.idledThisCycle,
      screensaverStarted: root.screensaverStartedThisCycle,
      screensaver: root.screensaverTimeoutSeconds,
      lock: root.lockTimeoutSeconds,
      screensaverDelay: root.screensaverDelaySeconds,
      lockDelay: root.lockDelaySeconds,
      screensaverWindows: root.screensaverWindowCount,
      timers: {
        screensaver: screensaverTimer.running,
        lock: lockTimer.running,
        screensaverLaunchGrace: screensaverLaunchGraceTimer.running
      },
      processes: {
        screensaver: screensaverProcess.running,
        lock: lockProcess.running,
        wake: wakeProcess.running
      },
      lastEvent: root.lastEvent,
      lastEventAt: root.lastEventAt
    })
  }

  // Settings writes go through the host so the bar's copy and shell.json stay
  // one thing. updateEntryInline replaces the entry, hence the full object.
  function writeSettings(patch) {
    var full = M.fullSettings(root.cfg, patch)
    if (shell && typeof shell.updateEntryInline === "function") {
      shell.updateEntryInline(root.pluginId, full)
      return true
    }
    logEvent("settings-write-failed", "shell.updateEntryInline unavailable")
    return false
  }

  function applyJsonSetting(key, json) {
    var defaults = M.defaults()
    if (!(key in defaults)) return "unknown-key"
    var value
    try { value = JSON.parse(json) } catch (e) { return "bad-json" }
    var patch = {}
    patch[key] = value
    return writeSettings(patch) ? "ok" : "failed"
  }

  function writeIdleSeconds(stage, seconds) {
    var key = stage === "lock" ? "lock" : "screensaver"
    var n = Math.max(0, Math.floor(Number(seconds)))
    if (!isFinite(n)) return false
    if (shell && typeof shell.mutateShellConfig === "function") {
      shell.mutateShellConfig(function(config) {
        if (!config.idle || typeof config.idle !== "object") config.idle = {}
        config.idle[key] = n
      })
      return true
    }
    logEvent("settings-write-failed", "shell.mutateShellConfig unavailable")
    return false
  }

  // Installed theme slugs, for the theme situation's picker.
  property var themeNames: []
  property var themeNamesPending: []
  function refreshThemes() {
    if (!themeProbe.running) { root.themeNamesPending = []; themeProbe.running = true }
  }
  Process {
    id: themeProbe
    command: ["bash", "-c", "ls -1 /usr/share/omarchy/themes \"$HOME/.config/omarchy/themes\" 2>/dev/null | grep -v ':$' | grep -v '^$' | sort -u"]
    stdout: SplitParser {
      onRead: function(line) { var t = String(line).trim(); if (t !== "") root.themeNamesPending = root.themeNamesPending.concat([t]) }
    }
    onExited: function() { root.themeNames = root.themeNamesPending }
  }

  function refreshScreensaverOff() {
    if (!screensaverOffProbe.running) screensaverOffProbe.running = true
  }

  // The panel's screensaver switch IS the stock toggle (Trigger › Toggle ›
  // Screensaver, `omarchy toggle screensaver`): one flag file, one truth.
  // Written the way omarchy-toggle writes it, without the notification the
  // menu entry sends — the switch in front of you is the feedback.
  function setScreensaverOff(off) {
    var on = !off
    runProcess(screensaverOffWriter, "screensaver-off " + (off ? "on" : "off"),
      off ? "mkdir -p " + M.shellQuote(root.togglesDir) + " && touch " + M.shellQuote(root.togglesDir + "/screensaver-off")
          : "rm -f " + M.shellQuote(root.togglesDir + "/screensaver-off"))
    root.screensaverOff = !!off
    // Turning it on also lifts the config-level stage switch, so nothing
    // hidden keeps it off.
    if (on && root.cfg.screensaverEnabled === false) writeSettings({ screensaverEnabled: true })
    return "ok"
  }
  Process { id: screensaverOffWriter; onExited: root.refreshScreensaverOff() }

  function persistStayAwake(value) {
    var command = value
      ? "mkdir -p \"$HOME/.local/state/omarchy/indicators\" && touch \"$HOME/.local/state/omarchy/indicators/stay-awake\""
      : "rm -f \"$HOME/.local/state/omarchy/indicators/stay-awake\""

    if (stayAwakeStateWriter.running) {
      root.pendingStayAwakePersist = !!value
      root.hasPendingStayAwakePersist = true
      return
    }

    stayAwakeStateWriter.command = ["bash", "-lc", command]
    stayAwakeStateWriter.running = true
  }

  function refreshStayAwakeState() {
    if (!stayAwakeStateProbe.running) stayAwakeStateProbe.running = true
  }

  function applyStayAwake(value, persist, reason) {
    var enabled = !!value
    var changed = !root.stayAwakeStateLoaded || root.stayAwake !== enabled

    if (persist) persistStayAwake(enabled)

    root.stayAwake = enabled
    root.stayAwakeStateLoaded = true

    if (!changed) return enabled ? "disabled" : "enabled"

    logEvent("stay-awake", (enabled ? "enabled" : "disabled") + (reason ? " " + reason : ""))
    if (enabled) cancelIdleCycle("stay-awake")
    else Qt.callLater(root.handleIdleChanged)

    return enabled ? "disabled" : "enabled"
  }

  function setIdleEnabled(value) {
    return applyStayAwake(!value, true, "ipc")
  }

  IdleMonitor {
    id: idleMonitor
    enabled: root.idleEnabled && !root.rearming
    timeout: root.firstIdleTimeoutSeconds
    respectInhibitors: true
    onIsIdleChanged: root.handleIdleChanged()
  }

  Timer {
    id: screensaverTimer
    interval: root.screensaverDelaySeconds * 1000
    repeat: false
    onTriggered: root.launchScreensaver()
  }

  Timer {
    id: lockTimer
    interval: root.lockDelaySeconds * 1000
    repeat: false
    onTriggered: if (root.idleEnabled && root.idledThisCycle) root.lockSystem("lock-timeout")
  }

  Timer {
    id: screensaverLaunchGraceTimer
    interval: 3000
    repeat: false
    onTriggered: {
      if (root.idleEnabled && root.idledThisCycle && root.screensaverStartedThisCycle && !root.overlayVisible && root.screensaverWindowCount === 0 && !idleMonitor.isIdle) {
        root.cancelIdleCycle("screensaver-not-running")
      }
    }
  }

  Connections {
    target: Hyprland
    function onRawEvent(event) { root.handleHyprlandEvent(event) }
  }

  Process {
    id: screensaverProcess
    onExited: function(exitCode, exitStatus) { root.logEvent("process-exit", "screensaver exitCode=" + exitCode + " status=" + exitStatus) }
  }
  Process {
    id: lockProcess
    onExited: function(exitCode, exitStatus) { root.logEvent("process-exit", "lock exitCode=" + exitCode + " status=" + exitStatus) }
  }
  Process {
    id: wakeProcess
    onExited: function(exitCode, exitStatus) { root.logEvent("process-exit", "wake exitCode=" + exitCode + " status=" + exitStatus) }
  }

  Process {
    id: screensaverOffProbe
    command: ["bash", "-c", "if [[ -f $HOME/.local/state/omarchy/toggles/screensaver-off ]]; then echo yes; else echo no; fi"]
    stdout: SplitParser {
      onRead: function(line) {
        var off = String(line).trim() === "yes"
        if (off !== root.screensaverOff) {
          root.screensaverOff = off
          logEvent("screensaver-off", off ? "set" : "cleared")
        }
      }
    }
  }

  FileView {
    path: root.togglesDir
    watchChanges: true
    printErrors: false
    onFileChanged: root.refreshScreensaverOff()
  }

  Timer {
    id: lockPoll
    interval: 2000
    repeat: true
    running: !root.lockSvc && (root.idledThisCycle || root.overlayVisible)
    onTriggered: if (!lockPollProbe.running) lockPollProbe.running = true
  }

  Process {
    id: lockPollProbe
    command: ["omarchy-shell", "lock", "isLocked"]
    stdout: SplitParser {
      onRead: function(line) { root.lockedPolled = String(line).trim() === "true" }
    }
  }

  Process {
    id: stayAwakeStateProbe
    command: ["bash", "-c", "mkdir -p \"$HOME/.local/state/omarchy/indicators\"; if [[ -f $HOME/.local/state/omarchy/indicators/stay-awake ]]; then echo yes; else echo no; fi"]
    stdout: SplitParser {
      onRead: function(line) { root.applyStayAwake(String(line).trim() === "yes", false, "state-file") }
    }
    onExited: function() { stayAwakeStateDirWatcher.reload() }
  }

  Process {
    id: stayAwakeStateWriter
    onExited: function() {
      if (root.hasPendingStayAwakePersist) {
        var pending = root.pendingStayAwakePersist
        root.hasPendingStayAwakePersist = false
        root.persistStayAwake(pending)
        return
      }

      root.refreshStayAwakeState()
    }
  }

  FileView {
    id: stayAwakeStateDirWatcher
    path: root.stayAwakeStateDir
    watchChanges: true
    printErrors: false
    onFileChanged: root.refreshStayAwakeState()
  }

  Component.onCompleted: {
    logEvent("service-ready")
    refreshStayAwakeState()
    refreshScreensaverOff()
    refreshThemes()
    terminalIdProbe.running = true
    userDirSetup.running = true
    aiProbe.running = true
  }

  Saver {
    service: root
  }

  IpcHandler {
    target: "stelline"

    function status(): string {
      return root.statusJson()
    }

    function ping(): string {
      return "ok"
    }

    function preview(saverId: string): string {
      return root.showOverlay(saverId && saverId !== "" ? saverId : root.cfg.saver, "preview")
    }

    function show(): string {
      return root.showOverlay(root.cfg.saver, "menu")
    }

    function hide(): string {
      root.hideScreensaver("ipc")
      return "ok"
    }

    function next(): string {
      root.nextSaver()
      return root.overlaySaver
    }

    function setSaver(saverId: string): string {
      if (!M.saverById(saverId, root.userSavers)) return "unknown-saver"
      return root.writeSettings({ saver: saverId }) ? "ok" : "failed"
    }

    function toggleShuffle(): string {
      return root.writeSettings({ shuffle: !root.cfg.shuffle }) ? (root.cfg.shuffle ? "off" : "on") : "failed"
    }

    function setStage(stage: string, on: string): string {
      var key = stage === "lock" ? "lockEnabled" : "screensaverEnabled"
      var patch = {}
      patch[key] = String(on) === "true" || String(on) === "on"
      // The screensaver stage and the stock toggle are one switch.
      if (key === "screensaverEnabled") root.setScreensaverOff(!patch[key])
      return root.writeSettings(patch) ? "ok" : "failed"
    }
    function setScreensaverOff(off: string): string { return root.setScreensaverOff(String(off) === "true" || String(off) === "on") }

    function setTimeout(stage: string, seconds: string): string {
      return root.writeIdleSeconds(stage, seconds) ? "ok" : "failed"
    }

    function toggleStayAwake(): string {
      return root.setIdleEnabled(!root.idleEnabled)
    }

    function simulateIdle(): string {
      root.simulatedIdle = true
      root.startIdleCycle()
      return "ok"
    }

    function simulateLock(mode: string): string {
      if (mode === "real") { root.lockSystem("ipc"); return "locking" }
      if (mode === "dry-run" || mode === "on") { root.lockDryRun = true; return "dry-run on" }
      if (mode === "off") { root.lockDryRun = false; return "dry-run off" }
      var was = root.lockDryRun
      root.lockDryRun = true
      root.lockSystem("ipc-dry-run")
      root.lockDryRun = was
      return "dry-run"
    }

    function mini(saverId: string): string {
      var id = saverId && saverId !== "" ? saverId : root.cfg.saver
      var saver = M.saverById(id, root.userSavers)
      if (!saver || !M.isNativeSaver(saver)) return "unknown-saver"
      root.miniSaver = id
      root.miniVisible = true
      return "ok"
    }

    function hideMini(): string {
      root.miniVisible = false
      return "ok"
    }

    // Generic settings access for scripts and tests: values are JSON.
    function get(key: string): string {
      var v = root.cfg[key]
      return v === undefined ? "unknown-key" : JSON.stringify(v)
    }

    // `qs ipc` splits an argument on commas, so JSON with more than one
    // element cannot arrive intact through `set`; `set64` takes it base64-encoded.
    function set(key: string, json: string): string {
      return root.applyJsonSetting(key, json)
    }

    function set64(key: string, base64Json: string): string {
      var json
      try { json = Qt.atob(base64Json) } catch (e) { return "bad-base64" }
      return root.applyJsonSetting(key, json)
    }

    function finishSetup(): string { return root.finishSetup() }
    function undoSetup(): string { return root.undoSetup() }
    function setMenuEntry(on: string): string { return root.setMenuEntry(String(on) === "true" || String(on) === "on") }
    function probeIpcOwner(): string { root.probeIpcOwner(); return "ok" }

    function reloadCard(): string {
      root.refreshCard()
      return "ok"
    }

    function list(): string {
      return JSON.stringify(M.allSavers(root.userSavers).map(function(s) {
        return { id: s.id, name: s.name, kind: s.kind, current: s.id === root.cfg.saver, plays: M.playsLabel(root.cfg, s.id, root.userSavers),
          importing: !!(s.series && s.series.importing), error: s.series ? s.series.error : "" }
      }))
    }

    // Imports: the spec is JSON (see StellineModel.importDefaults), base64 so
    // it survives `qs ipc` splitting arguments on commas.
    function import64(base64Json: string): string {
      var spec
      try { spec = JSON.parse(Qt.atob(base64Json)) } catch (e) { return "bad-json" }
      return root.importSaver(spec)
    }
    function deleteSaver(saverId: string): string { return root.deleteSaver(saverId) }
    function cancelAdd(): string { root.importDraft = null; return "ok" }
    function branding(action: string): string {
      if (action === "image") return root.brandingImage()
      if (action === "text") return root.brandingText()
      if (action === "reset") return root.brandingReset()
      return "unknown-action"
    }
    function rescan(): string { root.rescan(); return "ok" }
    function pick(kind: string): string { return root.pickFiles(kind) }
    function paste(): string { root.refreshClipboard(); return root.pasteClipboard() }
    function clipboard(): string { root.refreshClipboard(); return root.clipboardHas }
    // `qs ipc` splits arguments on commas, so a word with one goes base64.
    function setText(saverId: string, text: string): string { return root.setWordmarkText(saverId, text) }
    function setText64(saverId: string, base64Text: string): string {
      var t
      try { t = Qt.atob(base64Text) } catch (e) { return "bad-base64" }
      return root.setWordmarkText(saverId, t)
    }
    function wordmarkArt(saverId: string): string { return root.wordmarkArtPath(saverId) }

    function setRule(saverId: string, key: string, on: string): string {
      if (M.RULE_KEYS.indexOf(key) === -1) return "unknown-condition"
      if (!M.saverById(saverId, root.userSavers)) return "unknown-saver"
      return root.setRuleCondition(saverId, key, String(on) === "true" || String(on) === "on") ? "ok" : "failed"
    }
  }

  IpcHandler {
    target: "idle"

    function status(): string {
      return root.statusJson()
    }

    function debug(): string {
      return root.statusJson()
    }

    function enable(): string {
      return root.setIdleEnabled(true)
    }

    function disable(): string {
      return root.setIdleEnabled(false)
    }

    function toggle(): string {
      return root.setIdleEnabled(!root.idleEnabled)
    }
  }
}
