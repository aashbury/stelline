import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// Level 3: three rows that say what they are set to and open one at a time —
// the rules in order, the note shown while you are away, and shortcuts.
Column {
  id: root

  property var body: null
  property var svc: null
  property var bar: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  readonly property var cfg: body ? body.cfg : M.defaults()
  readonly property var card: cfg.card || {}
  readonly property var userSavers: svc ? svc.userSavers : []
  property bool addingTimings: false
  property string menuNote: ""

  spacing: Style.space(4)

  function situationItem(index) { return situationRepeater.itemAt(index) }
  function isOpen(name) { return body ? body.openSection === name : false }
  function cursorOn(row) { return body ? body.cursorActive && body.cursorIndex === row : false }

  // What each row says while closed.
  readonly property string rulesSummary: {
    var list = cfg.situations || []
    if (list.length === 0) return "none yet"
    var parts = []
    for (var i = 0; i < list.length; i++) {
      var s = list[i]
      if (!s || s.enabled !== true) continue
      var who = s.saver ? (M.saverById(s.saver, root.userSavers) || { name: s.saver }).name : "timings"
      parts.push(who + " " + M.situationLabel(s).toLowerCase())
    }
    return parts.length ? parts.join(" · ") : list.length + " off"
  }
  readonly property string awaySummary: {
    var parts = []
    if (card.enabled !== false) parts.push("notifications")
    if (card.showAgent !== false) parts.push("coding agent")
    return parts.length ? parts.join(" · ") : "nothing shown"
  }
  readonly property string shortcutsSummary: svc && svc.menuOverrideActive === true ? "Super+Esc shows this one" : "Super+Esc shows the original"
  readonly property string bindLine: 'o.bind("SUPER + CTRL + S", "Screensaver", "omarchy-shell stelline preview")'

  // ---- rules ----
  Section {
    id: rulesSection
    title: "Rules"
    summary: root.rulesSummary
    open: root.isOpen("rules")
    hasCursor: root.cursorOn(root.body ? root.body.rowRules : -1)
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: if (root.body) root.body.toggleSection("rules")
    onHovered: function(h) { if (root.body) root.body.hoverRow(root.body.rowRules, h) }

    Text {
      textFormat: Text.PlainText
      text: (root.cfg.situations || []).length > 1 ? "In order — the first one that fits wins." : ""
      visible: text !== ""
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }

    Column {
      width: parent.width - parent.leftPadding - parent.rightPadding
      spacing: Style.space(4)
      Repeater {
        id: situationRepeater
        model: (root.cfg.situations || []).length
        SituationRow {
          required property int index
          width: parent.width
          situation: root.cfg.situations[index] || ({})
          userSavers: root.userSavers
          themeNames: root.svc ? root.svc.themeNames : []
          bar: root.bar
          foreground: root.foreground
          fontFamily: root.fontFamily
          hasCursor: root.cursorOn(root.body ? root.body.rowSituationFirst + index : -1)
          expanded: root.body ? root.body.expandedSituation === index : false
          onClicked: if (root.body) root.body.toggleSituationEditor(index)
          onToggled: if (root.body) root.body.toggleSituation(index)
          onRemoveRequested: if (root.body) root.body.removeSituation(index)
          onPatched: function(patch) { if (root.body) root.body.updateSituation(index, patch) }
          onHovered: function(h) { if (root.body) root.body.hoverRow(root.body.rowSituationFirst + index, h) }
          onEditingChanged: if (root.body) root.body.setEditing("situation-" + index, editing)
        }
      }
      Text {
        visible: (root.cfg.situations || []).length === 0
        textFormat: Text.PlainText
        text: "None yet. Open a tile's gear to say when it plays."
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    // A rule that only changes the timings has no tile to live on; it is added here.
    Row {
      spacing: Style.space(6)
      Button {
        text: root.addingTimings ? "Timings at certain times —" : "Timings at certain times…"
        iconText: "󰅐"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        tooltipText: "A shorter screensaver on battery, say, without changing which one plays"
        onClicked: root.addingTimings = !root.addingTimings
      }
      Button { visible: root.addingTimings; text: "on battery"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: { root.addingTimings = false; if (root.body) root.body.addSituation("battery") } }
      Button { visible: root.addingTimings; text: "at night"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: { root.addingTimings = false; if (root.body) root.body.addSituation("night") } }
      Button { visible: root.addingTimings; text: "with a theme"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: { root.addingTimings = false; if (root.body) root.body.addSituation("theme") } }
    }
  }

  // ---- while you're away ----
  Section {
    title: "While you're away"
    summary: root.awaySummary
    open: root.isOpen("away")
    hasCursor: root.cursorOn(root.body ? root.body.rowAway : -1)
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: if (root.body) root.body.toggleSection("away")
    onHovered: function(h) { if (root.body) root.body.hoverRow(root.body.rowAway, h) }

    Toggle {
      width: parent.width - parent.leftPadding - parent.rightPadding
      label: "Show what came in"
      description: "A small note on the screensaver: how many notifications, from which apps. Hidden while Do Not Disturb is on."
      checked: root.card.enabled !== false
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: if (root.body) root.body.writeCard({ enabled: !checked })
    }
    Row {
      visible: root.card.enabled !== false
      leftPadding: Style.space(12)
      spacing: Style.space(12)
      Column {
        spacing: Style.space(3)
        Text { textFormat: Text.PlainText; text: "How much"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        ButtonGroup {
          options: [{ value: "counts", label: "how many" }, { value: "summaries", label: "what about" }, { value: "bodies", label: "in full" }]
          value: root.card.detail || "counts"
          foreground: root.foreground
          fontFamily: root.fontFamily
          focusable: false
          onChanged: function(v) { if (root.body) root.body.writeCard({ detail: v }) }
        }
      }
      Dropdown {
        width: Style.space(150)
        label: "Corner"
        options: [{ value: "bottom-right", label: "bottom right" }, { value: "bottom-left", label: "bottom left" }, { value: "top-right", label: "top right" }, { value: "top-left", label: "top left" }]
        value: root.card.corner || "bottom-right"
        foreground: root.foreground
        fontFamily: root.fontFamily
        onChanged: function(v) { if (root.body) root.body.writeCard({ corner: v }) }
      }
    }
    Toggle {
      width: parent.width - parent.leftPadding - parent.rightPadding
      label: "Show what your coding agent is up to"
      description: "Working, waiting for you, done, or stuck"
      checked: root.card.showAgent !== false
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: if (root.body) root.body.writeCard({ showAgent: !checked })
    }
  }

  // ---- shortcuts ----
  Section {
    title: "Shortcuts"
    summary: root.shortcutsSummary
    open: root.isOpen("shortcuts")
    hasCursor: root.cursorOn(root.body ? root.body.rowShortcuts : -1)
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: if (root.body) root.body.toggleSection("shortcuts")
    onHovered: function(h) { if (root.body) root.body.hoverRow(root.body.rowShortcuts, h) }

    Toggle {
      width: parent.width - parent.leftPadding - parent.rightPadding
      label: "Super+Esc › Screensaver shows this one"
      description: root.menuNote !== "" ? root.menuNote : "Omarchy's menu entry previews Stelline instead of the original"
      checked: root.svc ? root.svc.menuOverrideActive === true : false
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: if (root.svc) { var r = root.svc.setMenuEntry(!checked); root.menuNote = r === "unparseable" ? "Couldn't: your menu extensions file has a mistake in it" : "" }
    }

    Row {
      width: parent.width - parent.leftPadding - parent.rightPadding
      spacing: Style.space(8)
      Column {
        width: parent.width - copyButton.width - Style.space(8)
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.space(1)
        Text {
          textFormat: Text.PlainText
          text: "Super+Ctrl+S starts the screensaver"
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.subtitle
        }
        Text {
          width: parent.width
          textFormat: Text.PlainText
          wrapMode: Text.WordWrap
          text: "Copy the line, paste it into ~/.config/hypr/bindings.lua, and change the keys if you like."
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
      Button {
        id: copyButton
        anchors.verticalCenter: parent.verticalCenter
        text: "Copy the line"
        iconText: "󰆏"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        tooltipText: root.bindLine
        onClicked: Quickshell.execDetached(["bash", "-c", 'printf %s "$1" | wl-copy', "_", root.bindLine])
      }
    }

    Row {
      visible: root.svc ? root.svc.setupDone === true : false
      width: parent.width - parent.leftPadding - parent.rightPadding
      spacing: Style.space(8)
      Text {
        width: parent.width - undoButton.width - Style.space(8)
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        wrapMode: Text.WordWrap
        text: "The bar's coffee cup is this icon now."
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
      Button {
        id: undoButton
        anchors.verticalCenter: parent.verticalCenter
        text: "Put the old one back"
        iconText: "󰕌"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        tooltipText: "Undoes Finish setup: the original indicator returns and the menu entry goes"
        onClicked: if (root.svc) root.svc.undoSetup()
      }
    }
  }
}
