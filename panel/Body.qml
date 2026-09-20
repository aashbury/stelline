import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// The panel body. Level 1: hero + preview, the saver picker, timings and stay
// awake. Level 2: a gear per saver opens its settings inline. Level 3: the
// Advanced section — situations, the status card, integration.
//
// One cursor, shared by keyboard and mouse: rows bind `hasCursor` to
// `cursorActive && cursorIndex === <row>` and never read hover themselves.
// Inline editors' fields are mouse-driven; while one has focus, `editing`
// blocks the key catcher so typing goes to the field.
Column {
  id: root

  property var svc: null
  property var bar: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)

  property var editingKeys: ({})
  readonly property bool editing: Object.keys(editingKeys).length > 0
  property bool cursorActive: false
  property int cursorIndex: 0
  property bool advancedOpen: false
  property string openSettings: ""
  property int expandedSituation: -1

  signal closeRequested()
  signal ensureVisible(real y, real h)

  // The item that owns a cursor row, for scrolling it into view.
  function rowItem(index) {
    if (index === rowHero) return hero
    if (index === rowPreview) return previewButton
    if (index >= rowSaverFirst && index < rowShuffle) return saverRepeater.itemAt(index - rowSaverFirst)
    if (index === rowShuffle) return shuffleToggle
    if (index === rowScreensaver) return screensaverRow
    if (index === rowLock) return lockRow
    if (index === rowStayAwake) return stayAwakeToggle
    if (index === rowAdvanced) return advancedButton
    if (index >= rowSituationFirst) return advanced.situationItem(index - rowSituationFirst)
    return null
  }

  function scrollToRow(index) {
    var item = rowItem(index)
    if (!item) return
    var p = item.mapToItem(root, 0, 0)
    ensureVisible(p.y, item.height)
  }
  onCursorIndexChanged: if (cursorActive) scrollToRow(cursorIndex)
  // An editor opening makes its row taller; bring the whole row back into view.
  onExpandedSituationChanged: if (expandedSituation >= 0) revealEditor.restart()
  onOpenSettingsChanged: if (openSettings !== "") revealEditor.restart()
  Timer {
    id: revealEditor
    interval: 60
    onTriggered: {
      var item = null
      if (root.expandedSituation >= 0) item = root.rowItem(root.rowSituationFirst + root.expandedSituation)
      else if (root.openSettings !== "") {
        for (var i = 0; i < M.SAVERS.length; i++) if (M.SAVERS[i].id === root.openSettings) item = saverRepeater.itemAt(i)
      }
      if (!item) return
      var p = item.mapToItem(root, 0, 0)
      root.ensureVisible(p.y, item.height)
    }
  }

  // Opening Advanced reveals the section, not just its button.
  onAdvancedOpenChanged: if (advancedOpen) revealAdvanced.restart()
  Timer {
    id: revealAdvanced
    interval: 60
    onTriggered: {
      var p = advancedButton.mapToItem(root, 0, 0)
      root.ensureVisible(p.y, advancedButton.height + Style.space(10) + Math.min(advanced.implicitHeight, Style.space(420)))
    }
  }

  readonly property var cfg: svc ? svc.cfg : M.defaults()
  readonly property var saver: M.saverById(cfg.saver) || M.SAVERS[0]
  readonly property bool serviceOk: !!svc
  readonly property bool stayAwake: svc ? svc.stayAwake === true : false
  readonly property int screensaverSeconds: svc ? svc.screensaverTimeoutSeconds : 150
  readonly property int lockSeconds: svc ? svc.lockTimeoutSeconds : 300

  // Cursor rows, in visual order. Situations follow Advanced when it is open.
  readonly property int rowHero: 0
  readonly property int rowPreview: 1
  readonly property int rowSaverFirst: 2
  readonly property int rowShuffle: rowSaverFirst + M.SAVERS.length
  readonly property int rowScreensaver: rowShuffle + 1
  readonly property int rowLock: rowShuffle + 2
  readonly property int rowStayAwake: rowShuffle + 3
  readonly property int rowAdvanced: rowShuffle + 4
  readonly property int rowSituationFirst: rowAdvanced + 1
  readonly property int rowCount: rowSituationFirst + (advancedOpen ? cfg.situations.length : 0)

  function reset() {
    cursorActive = false
    cursorIndex = rowSaverFirst
    if (svc && typeof svc.refreshThemes === "function") svc.refreshThemes()
    if (svc && typeof svc.probeIpcOwner === "function") svc.probeIpcOwner()
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

  function move(dx, dy) {
    if (!cursorActive) { cursorActive = true; return }
    if (dy !== 0) {
      cursorIndex = Math.max(0, Math.min(rowCount - 1, cursorIndex + (dy > 0 ? 1 : -1)))
      return
    }
    if (dx !== 0) {
      if (cursorIndex === rowScreensaver) screensaverRow.nudge(dx > 0 ? 1 : -1)
      else if (cursorIndex === rowLock) lockRow.nudge(dx > 0 ? 1 : -1)
    }
  }

  function cursorSaverId() {
    if (cursorIndex < rowSaverFirst || cursorIndex >= rowShuffle) return ""
    return M.SAVERS[cursorIndex - rowSaverFirst].id
  }

  function activate() {
    if (!cursorActive) { cursorActive = true; return }
    if (!svc) return
    if (cursorIndex === rowHero) setStage("screensaverEnabled", !cfg.screensaverEnabled)
    else if (cursorIndex === rowPreview) preview("")
    else if (cursorIndex >= rowSaverFirst && cursorIndex < rowShuffle) chooseSaver(cursorSaverId())
    else if (cursorIndex === rowShuffle) toggleShuffle()
    else if (cursorIndex === rowLock) setStage("lockEnabled", !cfg.lockEnabled)
    else if (cursorIndex === rowStayAwake) toggleStayAwake()
    else if (cursorIndex === rowAdvanced) advancedOpen = !advancedOpen
    else if (cursorIndex >= rowSituationFirst) toggleSituationEditor(cursorIndex - rowSituationFirst)
  }

  function remove() {
    if (cursorActive && cursorIndex >= rowSituationFirst) removeSituation(cursorIndex - rowSituationFirst)
  }

  function hotkey(text) {
    if (text === "p") preview(cursorSaverId())
    else if (text === "s") toggleShuffle()
    else if (text === "a") advancedOpen = !advancedOpen
    else if (text === "g") { var id = cursorSaverId(); if (id !== "" && id !== "blank") toggleSettings(id) }
  }

  // ---- actions (all through the service) ----
  function preview(id) {
    if (svc && typeof svc.showOverlay === "function") svc.showOverlay(id && id !== "" ? id : cfg.saver, "preview")
  }
  function chooseSaver(id) {
    if (!svc) return
    if (cfg.shuffle) {
      var set = (cfg.shuffleFrom || []).slice()
      var at = set.indexOf(id)
      if (at === -1) set.push(id); else set.splice(at, 1)
      svc.writeSettings({ shuffleFrom: set })
    } else {
      svc.writeSettings({ saver: id })
    }
  }
  function toggleSettings(id) { openSettings = openSettings === id ? "" : id }
  function toggleShuffle() { if (svc) svc.writeSettings({ shuffle: !cfg.shuffle }) }
  function setStage(key, on) { if (svc) { var p = {}; p[key] = !!on; svc.writeSettings(p) } }
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

  function writeCard(patch) {
    if (!svc) return
    var card = M.cloneJson(cfg.card)
    for (var k in patch) card[k] = patch[k]
    svc.writeSettings({ card: card })
  }

  function writeSituations(list) { if (svc) svc.writeSettings({ situations: list }) }

  function addSituation(kind) {
    var list = M.cloneJson(cfg.situations)
    var n = list.length + 1
    var s = { id: kind + "-" + Date.now().toString(36), enabled: true, when: {} }
    if (kind === "battery") { s.when.battery = { below: 100 }; s.saver = "blank" }
    else if (kind === "night") { s.when.night = { from: "22:00", to: "07:00" }; s.saver = "clock" }
    else { s.when.theme = { name: svc && svc.themeName ? svc.themeName : "" }; s.saver = "matrix" }
    list.push(s)
    writeSituations(list)
    advancedOpen = true
    expandedSituation = list.length - 1
  }

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

  function toggleSituation(index) {
    var list = M.cloneJson(cfg.situations)
    if (index < 0 || index >= list.length) return
    list[index].enabled = list[index].enabled !== true
    writeSituations(list)
  }

  function toggleSituationEditor(index) { expandedSituation = expandedSituation === index ? -1 : index }

  function removeSituation(index) {
    var list = M.cloneJson(cfg.situations)
    if (index < 0 || index >= list.length) return
    list.splice(index, 1)
    if (expandedSituation === index) expandedSituation = -1
    writeSituations(list)
    if (cursorIndex >= rowCount) cursorIndex = Math.max(0, rowCount - 1)
  }

  function minutes(seconds) {
    var s = Math.max(0, Math.round(Number(seconds) || 0))
    var m = Math.floor(s / 60), r = s % 60
    return m + ":" + (r < 10 ? "0" : "") + r
  }

  spacing: Style.space(10)

  // ---- hero ----
  PanelHero {
    id: hero
    width: parent.width
    title: "Stelline"
    meta: root.serviceOk
      ? root.saver.name.toLowerCase() + " · " + root.minutes(root.screensaverSeconds)
        + (root.cfg.lockEnabled ? " → lock " + root.minutes(root.lockSeconds) : " · no lock")
        + (root.svc.situation ? " · " + M.situationLabel(root.svc.situation).toLowerCase() : "")
        + (root.stayAwake ? " · staying awake" : "")
      : "service not loaded — omarchy restart shell"
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
    trailingControl: Component {
      ToggleSwitch {
        checked: root.cfg.screensaverEnabled
        interactive: root.serviceOk
        hasCursor: root.cursorActive && root.cursorIndex === root.rowHero
        foreground: root.foreground
        onToggled: root.setStage("screensaverEnabled", !root.cfg.screensaverEnabled)
        onHovered: function(h) { root.hoverRow(root.rowHero, h) }
      }
    }
  }

  SetupCard {
    visible: root.svc ? root.svc.setupPending === true : false
    width: parent.width
    svc: root.svc
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  Row {
    spacing: Style.space(8)
    Button {
      id: previewButton
      text: "Preview"
      iconText: "󰐊"
      bordered: true
      foreground: root.foreground
      fontFamily: root.fontFamily
      hasCursor: root.cursorActive && root.cursorIndex === root.rowPreview
      onClicked: root.preview("")
      onHovered: function(h) { root.hoverRow(root.rowPreview, h) }
    }
  }

  PanelSeparator { width: parent.width; foreground: root.foreground }

  // ---- savers ----
  PanelSectionHeader { text: "SAVERS"; foreground: root.foreground; fontFamily: root.fontFamily }

  Column {
    width: parent.width
    spacing: Style.space(2)

    Repeater {
      id: saverRepeater
      model: M.SAVERS

      Column {
        required property var modelData
        required property int index
        width: parent.width
        spacing: Style.space(2)

        SaverRow {
          width: parent.width
          saver: modelData
          selected: root.cfg.saver === modelData.id
          shuffleMode: root.cfg.shuffle
          inRotation: (root.cfg.shuffleFrom || []).indexOf(modelData.id) !== -1
          hasSettings: modelData.id !== "blank"
          expanded: root.openSettings === modelData.id
          foreground: root.foreground
          fontFamily: root.fontFamily
          hasCursor: root.cursorActive && root.cursorIndex === root.rowSaverFirst + index
          onClicked: root.chooseSaver(modelData.id)
          onPreviewRequested: root.preview(modelData.id)
          onSettingsRequested: root.toggleSettings(modelData.id)
          onHovered: function(h) { root.hoverRow(root.rowSaverFirst + index, h) }
        }

        SaverSettings {
          visible: root.openSettings === modelData.id
          width: parent.width
          saverId: modelData.id
          settings: root.cfg.savers[modelData.id] || ({})
          bar: root.bar
          foreground: root.foreground
          fontFamily: root.fontFamily
          onPatched: function(patch) { root.writeSaverSettings(modelData.id, patch) }
        }
      }
    }
  }

  Toggle {
    id: shuffleToggle
    width: parent.width
    label: "Shuffle"
    description: root.cfg.shuffle ? "A different checked saver each time" : "Always the selected saver"
    checked: root.cfg.shuffle
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowShuffle
    onClicked: root.toggleShuffle()
    onHovered: function(h) { root.hoverRow(root.rowShuffle, h) }
  }

  PanelSeparator { width: parent.width; foreground: root.foreground }

  // ---- timings ----
  PanelSectionHeader { text: "TIMINGS"; foreground: root.foreground; fontFamily: root.fontFamily }

  SliderRow {
    id: screensaverRow
    width: parent.width
    bar: root.bar
    label: "Screensaver"
    value: root.screensaverSeconds
    minimum: 30
    maximum: 1800
    step: 30
    format: function(v) { return root.minutes(v) }
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowScreensaver
    onReleased: function(v) { root.setSeconds("screensaver", v) }
    onHovered: function(h) { root.hoverRow(root.rowScreensaver, h) }
  }

  SliderRow {
    id: lockRow
    width: parent.width
    bar: root.bar
    label: "Lock"
    value: root.cfg.lockEnabled ? root.lockSeconds : (root.svc && root.svc.idleConfig ? M.secondsFromConfig(root.svc.idleConfig.lock, 300) : 300)
    minimum: 60
    maximum: 3600
    step: 60
    format: function(v) { return root.minutes(v) }
    showSwitch: true
    switchChecked: root.cfg.lockEnabled
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowLock
    onReleased: function(v) { root.setSeconds("lock", v) }
    onSwitchToggled: root.setStage("lockEnabled", !root.cfg.lockEnabled)
    onHovered: function(h) { root.hoverRow(root.rowLock, h) }
  }

  Toggle {
    id: stayAwakeToggle
    width: parent.width
    label: "Stay awake"
    description: root.stayAwake ? "No screensaver, no lock — until you switch this off" : "Same switch as Super+Ctrl+I"
    checked: root.stayAwake
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowStayAwake
    onClicked: root.toggleStayAwake()
    onHovered: function(h) { root.hoverRow(root.rowStayAwake, h) }
  }

  PanelSeparator { width: parent.width; foreground: root.foreground }

  // ---- advanced ----
  Button {
    id: advancedButton
    text: "Advanced"
    iconText: root.advancedOpen ? "󰅀" : "󰅂"
    leftAlign: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    hasCursor: root.cursorActive && root.cursorIndex === root.rowAdvanced
    onClicked: root.advancedOpen = !root.advancedOpen
    onHovered: function(h) { root.hoverRow(root.rowAdvanced, h) }
  }

  AdvancedSection {
    id: advanced
    visible: root.advancedOpen
    width: parent.width
    body: root
    svc: root.svc
    bar: root.bar
    foreground: root.foreground
    fontFamily: root.fontFamily
  }
}
