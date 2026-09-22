import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// The panel body. Level 1: hero, stay awake (the coffee cup — changed often,
// so it sits at the top), the timings, the saver grid (click a tile = that
// one plays). Level 2: a tile's gear opens it below the grid — when it
// plays, how it looks, what sits on top, delete. Level 3: the Shortcuts row,
// set once, collapsed to what it says.
//
// Nothing here explains itself in a sentence: the stock panels don't, and a
// row that needs a caption is a row that needs a better label.
//
// One cursor, shared by keyboard and mouse: rows bind `hasCursor` to
// `cursorActive && cursorIndex === <row>` and never read hover themselves.
// Inline editors' fields are mouse-driven; while one has focus, `editing`
// blocks the key catcher so typing goes to the field.
Column {
  id: root

  property var svc: null
  property var bar: null
  property bool live: false
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)

  property var editingKeys: ({})
  readonly property bool editing: Object.keys(editingKeys).length > 0
  property bool cursorActive: false
  property int cursorIndex: 0
  property string openSection: ""
  property string openSettings: ""

  signal closeRequested()
  signal ensureVisible(real y, real h)
  // A wheel that a control caught and did not want; the panel scrolls by it.
  signal scrollBy(real delta)

  readonly property var cfg: svc ? svc.cfg : M.defaults()
  readonly property var userSavers: svc ? svc.userSavers : []
  readonly property var savers: M.allSavers(userSavers, cfg.hidden)
  readonly property var saver: M.saverById(cfg.saver, userSavers) || M.SAVERS[0]
  readonly property bool serviceOk: !!svc
  readonly property bool stayAwake: svc ? svc.stayAwake === true : false
  // One switch: Omarchy's own screensaver toggle and the stage switch agree.
  readonly property bool screensaverOn: svc ? svc.screensaverOff !== true && cfg.screensaverEnabled !== false : false
  // The sliders show the settings; the hero shows what is in effect, rules
  // included. A rule that says "never lock" must not drag the Lock slider to
  // the end of its track.
  readonly property int screensaverSeconds: svc && svc.idleConfig ? M.secondsFromConfig(svc.idleConfig.screensaver, 150) : 150
  readonly property int lockSeconds: svc && svc.idleConfig ? M.secondsFromConfig(svc.idleConfig.lock, 300) : 300
  readonly property int screensaverNow: svc ? svc.screensaverTimeoutSeconds : screensaverSeconds
  readonly property int lockNow: svc ? svc.lockTimeoutSeconds : lockSeconds
  readonly property bool adding: !!(svc && svc.importDraft)
  // What the hero names and Preview shows: the rule's saver, the shuffle,
  // or the chosen one — the same answer the screensaver itself gives.
  readonly property var situationNow: svc ? svc.situation : null
  readonly property string playingName: M.playingName(cfg, situationNow, userSavers)
  readonly property bool shuffling: cfg.shuffle && !(situationNow && situationNow.saver)
  // Shuffle on with nothing ticked plays everything; the row says so.
  readonly property bool shuffleUnticked: cfg.shuffle && M.rotation(cfg, userSavers).length === savers.filter(function(s) { return s.kind !== "external" }).length && (cfg.shuffleFrom || []).filter(function(id) { return savers.some(function(s) { return s.id === id && s.kind !== "external" }) }).length === 0
  readonly property real inertOpacity: serviceOk ? 1 : 0.45
  readonly property var openSaver: openSettings !== "" ? M.saverById(openSettings, userSavers) : null
  readonly property int columns: 3
  readonly property int tileGap: Style.space(6)
  readonly property int tileWidth: Math.floor((width - tileGap * (columns - 1)) / columns)

  // The two laptop rows under the sliders are rules underneath — one that
  // shortens the timings on battery, one that never locks at a monitor —
  // matched by shape, so Rules lists them too.
  readonly property bool hasLaptopRows: svc ? svc.isLaptop === true : false
  readonly property var batteryRule: M.timingsRule(cfg.situations, "battery")
  readonly property bool batteryTimings: !!batteryRule && batteryRule.enabled === true
  readonly property bool batteryRowsOpen: hasLaptopRows && batteryTimings
  readonly property int batteryScreensaver: batteryTimings && M.hasTiming(batteryRule.screensaver) ? Number(batteryRule.screensaver) : screensaverSeconds
  readonly property bool batteryLocks: !(batteryTimings && batteryRule.lock === "never")
  readonly property int batteryLock: batteryTimings && M.hasTiming(batteryRule.lock) && batteryRule.lock !== "never" ? Number(batteryRule.lock) : lockSeconds

  // The grid is the one part of the panel that grows without limit, and it
  // sits above the things set once. Past four rows it keeps four and ends in
  // a "+N / Show all" tile; the panel opens collapsed again each time.
  property bool gridExpanded: false
  readonly property int gridCap: columns * 4 - 1
  // Past the cap the grid ends in one tile that folds it either way.
  readonly property bool gridToggle: savers.length > gridCap
  readonly property bool gridCapped: !gridExpanded && gridToggle
  readonly property var shownSavers: gridCapped ? savers.slice(0, gridCap - 1) : savers
  readonly property int hiddenCount: savers.length - shownSavers.length

  // Cursor rows, in visual order — most-used first: the master switch, stay
  // awake, the timings (with the two laptop rows, and the battery pair while
  // it is open), then the gallery, then what gets set once. Tiles are one
  // row each and end with "Show all" (when capped) and Add.
  readonly property int rowHero: 0
  readonly property int rowStayAwake: 1
  readonly property int rowScreensaver: 2
  readonly property int rowLock: 3
  readonly property int rowBattery: hasLaptopRows ? 4 : -1
  readonly property int rowBatteryScreensaver: batteryRowsOpen ? 5 : -1
  readonly property int rowBatteryLock: batteryRowsOpen ? 6 : -1
  readonly property int rowDockedLock: hasLaptopRows ? (batteryRowsOpen ? 7 : 5) : -1
  readonly property int rowPreview: rowLock + 1 + (hasLaptopRows ? 2 : 0) + (batteryRowsOpen ? 2 : 0)
  readonly property int rowTileFirst: rowPreview + 1
  readonly property int tileCount: shownSavers.length + (gridToggle ? 1 : 0) + 1
  readonly property int rowMore: gridToggle ? rowTileFirst + shownSavers.length : -1
  readonly property int rowShuffle: rowTileFirst + tileCount
  readonly property int rowShortcuts: rowShuffle + 1
  readonly property int rowCount: rowShortcuts + 1

  // The item that owns a cursor row, for scrolling it into view.
  function rowItem(index) {
    if (index === rowHero) return hero
    if (index === rowStayAwake) return stayAwakeToggle
    if (index === rowPreview) return previewButton
    if (index >= rowTileFirst && index < rowShuffle) return tileRepeater.itemAt(index - rowTileFirst)
    if (index === rowShuffle) return shuffleToggle
    if (index === rowScreensaver) return screensaverRow
    if (index === rowLock) return lockRow
    if (index === rowBattery) return batteryRow
    if (index === rowBatteryScreensaver) return batteryScreensaverRow
    if (index === rowBatteryLock) return batteryLockRow
    if (index === rowDockedLock) return dockedLockRow
    if (index === rowShortcuts) return shortcuts
    return null
  }

  function scrollToRow(index) {
    var item = rowItem(index)
    if (!item) return
    var p = item.mapToItem(root, 0, 0)
    ensureVisible(p.y, item.height)
  }
  onCursorIndexChanged: if (cursorActive) scrollToRow(cursorIndex)

  // An editor opening below the grid should come into view whole.
  onOpenSettingsChanged: if (openSettings !== "") revealEditor.restart()
  onAddingChanged: if (adding) revealEditor.restart()
  Timer {
    id: revealEditor
    interval: 60
    onTriggered: {
      var item = null
      if (root.adding) item = addCard
      else if (root.openSettings !== "") item = inspector
      if (!item) return
      var p = item.mapToItem(root, 0, 0)
      root.ensureVisible(p.y, item.height)
    }
  }

  onOpenSectionChanged: if (openSection !== "") revealSection.restart()
  Timer {
    id: revealSection
    interval: 60
    onTriggered: {
      var item = root.rowItem(root.rowShortcuts)
      if (!item) return
      var p = item.mapToItem(root, 0, 0)
      root.ensureVisible(p.y, Math.min(item.height, Style.space(420)))
    }
  }
  function toggleSection(name) { openSection = openSection === name ? "" : name }

  // Opens at the top with nothing unfolded, the way every panel does; an
  // Add in progress is the one thing worth coming back to.
  function reset() {
    cursorActive = false
    cursorIndex = rowTileFirst
    gridExpanded = false
    openSettings = ""
    openSection = ""
    if (adding) revealEditor.restart()
    if (svc && typeof svc.refreshThemes === "function") svc.refreshThemes()
    if (svc && typeof svc.probeIpcOwner === "function") svc.probeIpcOwner()
    if (svc && typeof svc.probeHotkey === "function") svc.probeHotkey()
    if (svc && typeof svc.rescan === "function") svc.rescan()
    if (svc && typeof svc.refreshAi === "function") svc.refreshAi()
  }

  function setEditing(key, on) {
    var next = {}
    for (var k in editingKeys) if (k !== key) next[k] = true
    if (on) next[key] = true
    editingKeys = next
  }

  function hoverRow(index, isHovered) {
    if (!isHovered) return
    cursorActive = true
    cursorIndex = index
  }

  function foldGrid() {
    gridExpanded = !gridExpanded
    // The tail tile moves when the grid folds; the cursor stays on it.
    cursorIndex = rowMore
  }

  function inTiles(index) { return index >= rowTileFirst && index < rowShuffle }

  function move(dx, dy) {
    if (!cursorActive) { cursorActive = true; return }
    if (dy !== 0) {
      var next
      if (inTiles(cursorIndex)) {
        next = cursorIndex + (dy > 0 ? columns : -columns)
        if (next >= rowShuffle) next = rowShuffle
        else if (next < rowTileFirst) next = rowPreview
      } else if (cursorIndex === rowPreview && dy > 0) next = rowTileFirst
      else if (cursorIndex === rowShuffle && dy < 0) next = rowShuffle - 1
      else next = cursorIndex + (dy > 0 ? 1 : -1)
      cursorIndex = Math.max(0, Math.min(rowCount - 1, next))
      return
    }
    if (dx !== 0) {
      if (inTiles(cursorIndex)) cursorIndex = Math.max(rowTileFirst, Math.min(rowShuffle - 1, cursorIndex + (dx > 0 ? 1 : -1)))
      else if (cursorIndex === rowScreensaver) screensaverRow.nudge(dx > 0 ? 1 : -1)
      else if (cursorIndex === rowLock) lockRow.nudge(dx > 0 ? 1 : -1)
      else if (cursorIndex === rowBatteryScreensaver) batteryScreensaverRow.nudge(dx > 0 ? 1 : -1)
      else if (cursorIndex === rowBatteryLock) batteryLockRow.nudge(dx > 0 ? 1 : -1)
    }
  }

  function cursorSaverId() {
    if (!inTiles(cursorIndex)) return ""
    var at = cursorIndex - rowTileFirst
    return at < shownSavers.length ? shownSavers[at].id : ""
  }

  function activate() {
    if (!cursorActive) { cursorActive = true; return }
    if (!svc) return
    if (cursorIndex === rowHero) setScreensaver(!screensaverOn)
    else if (cursorIndex === rowStayAwake) toggleStayAwake()
    else if (cursorIndex === rowPreview) preview("")
    else if (cursorIndex === rowMore) foldGrid()
    else if (inTiles(cursorIndex)) { var id = cursorSaverId(); if (id === "") startAdd(); else chooseSaver(id) }
    else if (cursorIndex === rowShuffle) toggleShuffle()
    else if (cursorIndex === rowLock) setStage("lockEnabled", !cfg.lockEnabled)
    else if (cursorIndex === rowBattery) setBatteryTimings(!batteryTimings)
    else if (cursorIndex === rowBatteryLock) patchBatteryTimings({ lock: batteryLocks ? "never" : lockSeconds })
    else if (cursorIndex === rowDockedLock) svc.setDockedNoLock(!svc.dockedNoLock)
    else if (cursorIndex === rowShortcuts) toggleSection("shortcuts")
  }

  // Delete: the saver under the cursor opens its inspector with Delete
  // armed; the second press deletes. The Original cannot go.
  function remove() {
    if (!cursorActive) return
    var id = cursorSaverId()
    var s = id !== "" ? M.saverById(id, userSavers) : null
    if (!s || s.kind === "external") return
    if (openSettings === id && inspector.deleteArmed) deleteSaver(id)
    else { openSettings = id; inspector.armDelete() }
  }

  function hotkey(text) {
    if (text === "p") preview(cursorSaverId())
    else if (text === "s") toggleShuffle()
    else if (text === "n" || text === "+") startAdd()
    else if (text === "g") { var id = cursorSaverId(); if (id !== "") toggleSettings(id) }
  }

  // ---- actions (all through the service) ----
  function preview(id) {
    if (svc && typeof svc.previewSaver === "function") svc.previewSaver(id && id !== "" ? id : "", "preview")
  }
  function chooseSaver(id) {
    if (!svc) return
    var s = M.saverById(id, userSavers)
    if (s && s.series && (s.series.importing || s.series.error)) { toggleSettings(id); return }
    // The panel below the grid is a detail view of a tile. Once it is open it
    // has to follow the tile you touch, or it sits there editing something
    // you stopped looking at.
    if (openSettings !== "") openSettings = id
    if (cfg.shuffle) {
      if (s && s.kind === "external") return
      var set = (cfg.shuffleFrom || []).slice()
      var at = set.indexOf(id)
      if (at === -1) set.push(id); else set.splice(at, 1)
      svc.writeSettings({ shuffleFrom: set })
    } else {
      svc.writeSettings({ saver: id })
    }
  }
  function toggleSettings(id) {
    if (svc && svc.importDraft) svc.importDraft = null
    openSettings = openSettings === id ? "" : id
  }
  function startAdd() {
    if (!svc) return
    openSettings = ""
    svc.beginAdd()
  }
  function deleteSaver(id) {
    if (!svc) return
    if (openSettings === id) openSettings = ""
    svc.deleteSaver(id)
    if (cursorIndex >= rowCount) cursorIndex = Math.max(0, rowCount - 1)
  }
  function toggleShuffle() { if (svc) svc.writeSettings({ shuffle: !cfg.shuffle }) }
  function setStage(key, on) { if (svc) { var p = {}; p[key] = !!on; svc.writeSettings(p) } }
  function setScreensaver(on) { if (svc) { svc.setScreensaverOff(!on); if (on) setStage("screensaverEnabled", true); else setStage("screensaverEnabled", false) } }
  function toggleStayAwake() { if (svc) svc.setIdleEnabled(stayAwake) }
  function setSeconds(stage, v) { if (svc) svc.writeIdleSeconds(stage, v) }

  function writeSaverSettings(id, patch) {
    if (!svc) return
    var savers = M.cloneJson(cfg.savers)
    var current = savers[id] || {}
    for (var k in patch) current[k] = patch[k]
    savers[id] = current
    svc.writeSettings({ savers: savers })
  }

  function writeSituations(list) { if (svc) svc.writeSettings({ situations: list }) }

  function updateSituation(index, patch) {
    var list = M.cloneJson(cfg.situations)
    if (index < 0 || index >= list.length) return
    var s = list[index]
    for (var k in patch) {
      if (patch[k] === null) delete s[k]
      else s[k] = patch[k]
    }
    writeSituations(list)
  }

  function setBatteryTimings(on) { writeSituations(M.setTimingsRule(cfg.situations, "battery", !!on, svc ? svc.situationContext : null)) }
  function patchBatteryTimings(patch) { var at = M.timingsRuleIndex(cfg.situations, "battery"); if (at >= 0) updateSituation(at, patch) }

  function minutes(seconds) {
    var s = Math.max(0, Math.round(Number(seconds) || 0))
    var m = Math.floor(s / 60), r = s % 60
    return m + ":" + (r < 10 ? "0" : "") + r
  }

  // The other way: what someone typed into a readout, back into seconds.
  // "2:30" is two and a half minutes, and a bare number is minutes, because
  // that is what the readout shows. Anything else is NaN and changes nothing.
  function fromMinutes(text) {
    var t = String(text).trim()
    var parts = t.match(/^(\d+)\s*:\s*([0-5]?\d)$/)
    if (parts) return Number(parts[1]) * 60 + Number(parts[2])
    if (/^\d+(\.\d+)?$/.test(t)) return Math.round(Number(t) * 60)
    return NaN
  }

  spacing: Style.space(8)

  // ---- hero ----
  PanelHero {
    id: hero
    width: parent.width
    title: "Stelline"
    meta: root.serviceOk
      ? (root.stayAwake ? "staying awake"
        : (!root.screensaverOn ? "screensaver off" + (root.svc.lockStageEnabled ? ", still locks at " + root.minutes(root.lockNow) : ", no lock")
        : root.playingName.toLowerCase() + " after " + root.minutes(root.screensaverNow)
          + (root.svc.lockStageEnabled ? ", lock at " + root.minutes(root.lockNow) : ", no lock")
          + (root.svc.situation ? " · " + M.situationLabel(root.svc.situation).toLowerCase() : "")))
      : "not running yet — restart the shell"
    foreground: root.foreground
    fontFamily: root.fontFamily
    iconComponent: Component {
      Text {
        textFormat: Text.PlainText
        text: root.stayAwake ? "󰅶" : "󱄄"
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.display
      }
    }
    // Without the service there is nothing to switch; what there is to do is
    // restart the shell, so that is the control.
    trailingControl: root.serviceOk ? masterSwitch : restartShell
  }
  Component {
    id: masterSwitch
    ToggleSwitch {
      checked: root.screensaverOn
      interactive: root.serviceOk
      hasCursor: root.cursorActive && root.cursorIndex === root.rowHero
      foreground: root.foreground
      onToggled: root.setScreensaver(!root.screensaverOn)
      onHovered: function(h) { root.hoverRow(root.rowHero, h) }
    }
  }
  Component {
    id: restartShell
    Button {
      text: "Restart shell"
      iconText: "󰜉"
      bordered: true
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      onClicked: Quickshell.execDetached(["omarchy-restart-shell"])
    }
  }

  SetupCard {
    visible: root.svc ? root.svc.setupPending === true : false
    width: parent.width
    svc: root.svc
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  SwitchRow {
    id: stayAwakeToggle
    width: parent.width
    enabled: root.serviceOk
    opacity: root.inertOpacity
    glyph: "󰅶"
    label: "Stay awake"
    description: "No screensaver and no lock until you switch it back · Super+Ctrl+I"
    checked: root.stayAwake
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowStayAwake
    onClicked: root.toggleStayAwake()
    onHovered: function(h) { root.hoverRow(root.rowStayAwake, h) }
  }

  PanelSeparator { width: parent.width; foreground: root.foreground }

  // ---- timings ----
  PanelSectionHeader { text: "TIMINGS"; foreground: root.foreground; fontFamily: root.fontFamily }

  SliderRow {
    id: screensaverRow
    width: parent.width
    enabled: root.serviceOk
    opacity: root.inertOpacity
    bar: root.bar
    label: "Screensaver"
    value: root.screensaverSeconds
    minimum: 30
    maximum: 1800
    step: 30
    format: function(v) { return root.minutes(v) }
    parse: function(t) { return root.fromMinutes(t) }
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowScreensaver
    onReleased: function(v) { root.setSeconds("screensaver", v) }
    onHovered: function(h) { root.hoverRow(root.rowScreensaver, h) }
    onWheeled: function(d) { root.scrollBy(d) }
    onEditingChanged: root.setEditing("screensaver", editing)
  }

  SliderRow {
    id: lockRow
    width: parent.width
    enabled: root.serviceOk
    opacity: root.inertOpacity
    bar: root.bar
    label: "Lock"
    value: root.lockSeconds
    minimum: 60
    maximum: 3600
    step: 60
    format: function(v) { return root.minutes(v) }
    parse: function(t) { return root.fromMinutes(t) }
    showSwitch: true
    switchChecked: root.cfg.lockEnabled
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowLock
    onReleased: function(v) { root.setSeconds("lock", v) }
    onSwitchToggled: root.setStage("lockEnabled", !root.cfg.lockEnabled)
    onHovered: function(h) { root.hoverRow(root.rowLock, h) }
    onWheeled: function(d) { root.scrollBy(d) }
    onEditingChanged: root.setEditing("lock", editing)
  }

  // A laptop's two exceptions, where you look when the timings bother you.
  // Each is an ordinary rule underneath — Rules lists them too.
  SwitchRow {
    id: batteryRow
    visible: root.hasLaptopRows
    enabled: root.serviceOk
    opacity: root.inertOpacity
    width: parent.width
    glyph: "󰁹"
    label: "Different timings on battery"
    description: root.svc && root.svc.onBattery && root.batteryTimings ? "That's now" : ""
    checked: root.batteryTimings
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowBattery
    onClicked: root.setBatteryTimings(!checked)
    onHovered: function(h) { root.hoverRow(root.rowBattery, h) }
  }
  Column {
    visible: root.batteryRowsOpen
    enabled: root.serviceOk
    opacity: root.inertOpacity
    width: parent.width
    leftPadding: Style.space(24)
    spacing: Style.space(8)
    SliderRow {
      id: batteryScreensaverRow
      width: parent.width - parent.leftPadding
      bar: root.bar
      label: "Screensaver"
      value: root.batteryScreensaver
      minimum: 30
      maximum: 1800
      step: 30
      format: function(v) { return root.minutes(v) }
      parse: function(t) { return root.fromMinutes(t) }
      foreground: root.foreground
      fontFamily: root.fontFamily
      hasCursor: root.cursorActive && root.cursorIndex === root.rowBatteryScreensaver
      onReleased: function(v) { root.patchBatteryTimings({ screensaver: Math.round(v) }) }
      onHovered: function(h) { root.hoverRow(root.rowBatteryScreensaver, h) }
      onWheeled: function(d) { root.scrollBy(d) }
      onEditingChanged: root.setEditing("batteryScreensaver", editing)
    }
    SliderRow {
      id: batteryLockRow
      width: parent.width - parent.leftPadding
      bar: root.bar
      label: "Lock"
      value: root.batteryLock
      minimum: 60
      maximum: 3600
      step: 60
      format: function(v) { return root.minutes(v) }
      parse: function(t) { return root.fromMinutes(t) }
      showSwitch: true
      switchChecked: root.batteryLocks
      foreground: root.foreground
      fontFamily: root.fontFamily
      hasCursor: root.cursorActive && root.cursorIndex === root.rowBatteryLock
      onReleased: function(v) { root.patchBatteryTimings({ lock: Math.round(v) }) }
      onSwitchToggled: root.patchBatteryTimings({ lock: root.batteryLocks ? "never" : root.lockSeconds })
      onHovered: function(h) { root.hoverRow(root.rowBatteryLock, h) }
      onWheeled: function(d) { root.scrollBy(d) }
      onEditingChanged: root.setEditing("batteryLock", editing)
    }
  }

  SwitchRow {
    id: dockedLockRow
    visible: root.hasLaptopRows
    enabled: root.serviceOk
    opacity: root.inertOpacity
    width: parent.width
    glyph: "󰍹"
    label: "Never lock while docked"
    description: root.svc && root.svc.docked && root.svc.dockedNoLock ? "That's now" : ""
    checked: root.svc ? root.svc.dockedNoLock === true : false
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowDockedLock
    onClicked: if (root.svc) root.svc.setDockedNoLock(!checked)
    onHovered: function(h) { root.hoverRow(root.rowDockedLock, h) }
  }

  PanelSeparator { width: parent.width; foreground: root.foreground }

  // ---- savers ----
  // Preview rides the header: it plays whichever saver is chosen below, so
  // this is where you look for it.
  Item {
    width: parent.width
    enabled: root.serviceOk
    opacity: root.inertOpacity
    implicitHeight: Math.max(saversHeading.implicitHeight, previewButton.implicitHeight)

    PanelSectionHeader {
      id: saversHeading
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      text: "SAVERS"
      foreground: root.foreground
      fontFamily: root.fontFamily
    }

    Button {
      id: previewButton
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: "Preview"
      iconText: "󰐊"
      bordered: true
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      hasCursor: root.cursorActive && root.cursorIndex === root.rowPreview
      tooltipText: root.shuffling ? "Show one from the shuffle now" : "Show " + root.playingName + " now"
      onClicked: root.preview("")
      onHovered: function(h) { root.hoverRow(root.rowPreview, h) }
    }
  }

  Grid {
    id: grid
    width: parent.width
    enabled: root.serviceOk
    opacity: root.inertOpacity
    columns: root.columns
    columnSpacing: root.tileGap
    rowSpacing: root.tileGap

    Repeater {
      id: tileRepeater
      model: root.tileCount

      SaverTile {
        required property int index
        readonly property bool isMore: root.gridToggle && index === root.shownSavers.length
        readonly property bool isAdd: !isMore && index >= root.shownSavers.length
        readonly property bool isTile: !isMore && !isAdd
        readonly property var entry: isTile ? root.shownSavers[index] : ({})
        width: root.tileWidth
        saver: entry
        svc: root.svc
        live: root.live
        addTile: isAdd
        addHint: root.svc && String(root.svc.aiProvider || "") !== "" ? "describe, paste, pick" : "paste, pick, type"
        moreCount: isMore && root.gridCapped ? root.hiddenCount : 0
        fewerTile: isMore && !root.gridCapped
        selected: isTile && root.cfg.saver === entry.id
        shuffleMode: root.cfg.shuffle
        inRotation: isTile && (root.cfg.shuffleFrom || []).indexOf(entry.id) !== -1
        open: isTile && root.openSettings === entry.id
        caption: isTile ? M.playsLabel(root.cfg, entry.id, root.userSavers) : ""
        foreground: root.foreground
        fontFamily: root.fontFamily
        hasCursor: root.cursorActive && root.cursorIndex === root.rowTileFirst + index
        onClicked: if (isMore) root.foldGrid(); else if (isAdd) root.startAdd(); else root.chooseSaver(entry.id)
        onPreviewRequested: root.preview(entry.id)
        onSettingsRequested: root.toggleSettings(entry.id)
        onHovered: function(h) { root.hoverRow(root.rowTileFirst + index, h) }
      }
    }
  }

  Inspector {
    id: inspector
    visible: !root.adding && !!root.openSaver
    width: parent.width
    saver: root.openSaver || ({})
    svc: root.svc
    body: root
    bar: root.bar
    foreground: root.foreground
    fontFamily: root.fontFamily
    onEditingChanged: root.setEditing("inspector", editing)
  }

  AddCard {
    id: addCard
    visible: root.adding
    width: parent.width
    svc: root.svc
    body: root
    foreground: root.foreground
    fontFamily: root.fontFamily
    onEditingChanged: root.setEditing("add", editing)
  }

  SwitchRow {
    id: shuffleToggle
    width: parent.width
    enabled: root.serviceOk
    opacity: root.inertOpacity
    glyph: "󰒟"
    label: "Shuffle"
    description: root.shuffleUnticked ? "Every saver — tick the ones you want" : ""
    checked: root.cfg.shuffle
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowShuffle
    onClicked: root.toggleShuffle()
    onHovered: function(h) { root.hoverRow(root.rowShuffle, h) }
  }

  PanelSeparator { width: parent.width; foreground: root.foreground }

  // ---- shortcuts ----
  ShortcutsSection {
    id: shortcuts
    width: parent.width
    enabled: root.serviceOk
    opacity: root.inertOpacity
    body: root
    svc: root.svc
    foreground: root.foreground
    fontFamily: root.fontFamily
  }
}
