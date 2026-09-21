import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// Level 3: three rows that say what they are set to and open one at a time —
// the rules, the note shown while you are away, and shortcuts. Everything
// inside an opened row is a plain row: label on the left, control on the
// right, no border. The row that is open is the only box.
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
  property string menuNote: ""

  spacing: Style.space(4)

  function situationItem(index) { return situationRepeater.itemAt(index) }
  function isOpen(name) { return body ? body.openSection === name : false }
  function cursorOn(row) { return body ? body.cursorActive && body.cursorIndex === row : false }
  function ruleLabel(s) {
    // A saver rule names the saver; a timings-only rule says what it does:
    // "Docked → never locks".
    if (s.saver) return (M.saverById(s.saver, root.userSavers) || { name: s.saver }).name + " " + M.situationLabel(s).toLowerCase()
    return M.situationLabel(s) + " → " + (M.situationTimings(s) || "no change")
  }

  // What each row says while closed. One rule reads out in full; more than
  // one would only elide, so they count instead — the list is a click away.
  readonly property string rulesSummary: {
    var list = cfg.situations || []
    if (list.length === 0) return "none yet"
    var on = []
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].enabled === true) on.push(list[i])
    if (on.length === 0) return list.length === 1 ? "one, switched off" : "all " + list.length + " switched off"
    if (on.length === 1) return root.ruleLabel(on[0]) + (list.length > 1 ? " · " + (list.length - 1) + " off" : "")
    return on.length + " set" + (list.length > on.length ? " · " + (list.length - on.length) + " off" : "")
  }
  readonly property string awaySummary: {
    var parts = []
    if (card.enabled !== false) parts.push("notifications")
    if (card.showAgent !== false) parts.push("coding agent")
    return parts.length ? parts.join(" · ") : "nothing shown"
  }
  readonly property string shortcutsSummary: svc && svc.menuOverrideActive === true ? "Super+Esc shows this one" : "Super+Esc shows the original"
  readonly property string bindLine: 'o.bind("SUPER + CTRL + S", "Screensaver", "omarchy-shell stelline preview")'

  // ---- rules: the list, each one a link to where it is edited ----
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

    Column {
      width: parent.width - parent.leftPadding - parent.rightPadding
      spacing: Style.space(2)
      Repeater {
        id: situationRepeater
        model: (root.cfg.situations || []).length
        SituationRow {
          required property int index
          width: parent.width
          situation: root.cfg.situations[index] || ({})
          userSavers: root.userSavers
          foreground: root.foreground
          fontFamily: root.fontFamily
          hasCursor: root.cursorOn(root.body ? root.body.rowSituationFirst + index : -1)
          highlighted: !!(root.body && root.body.openSettings !== "" && root.cfg.situations[index] && root.cfg.situations[index].saver === root.body.openSettings)
          onClicked: if (root.body) root.body.openRule(index)
          onToggled: if (root.body) root.body.toggleSituation(index)
          onRemoveRequested: if (root.body) root.body.removeSituation(index)
          onHovered: function(h) { if (root.body) root.body.hoverRow(root.body.rowSituationFirst + index, h) }
        }
      }
      Text {
        visible: (root.cfg.situations || []).length === 0
        leftPadding: Style.space(10)
        textFormat: Text.PlainText
        text: "None yet. A tile's gear adds one."
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
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

    SwitchRow {
      width: parent.width - parent.leftPadding - parent.rightPadding
      glyph: "󰂚"
      label: "Show what came in"
      description: "Unless Do Not Disturb is on"
      checked: root.card.enabled !== false
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: if (root.body) root.body.writeCard({ enabled: !checked })
    }

    // The two choices that only matter once the note is on, lined up under it.
    Column {
      visible: root.card.enabled !== false
      width: parent.width - parent.leftPadding - parent.rightPadding
      leftPadding: Style.space(36)
      spacing: Style.space(6)
      Row {
        spacing: Style.space(10)
        Text {
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(58)
          textFormat: Text.PlainText
          text: "How much"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
        ButtonGroup {
          anchors.verticalCenter: parent.verticalCenter
          options: [{ value: "counts", label: "how many" }, { value: "summaries", label: "what about" }, { value: "bodies", label: "in full" }]
          value: root.card.detail || "counts"
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          focusable: false
          onChanged: function(v) { if (root.body) root.body.writeCard({ detail: v }) }
        }
      }
      Row {
        spacing: Style.space(10)
        Text {
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(58)
          textFormat: Text.PlainText
          text: "Corner"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
        Dropdown {
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(160)
          showLabel: false
          options: [{ value: "bottom-right", label: "bottom right" }, { value: "bottom-left", label: "bottom left" }, { value: "top-right", label: "top right" }, { value: "top-left", label: "top left" }]
          value: root.card.corner || "bottom-right"
          foreground: root.foreground
          fontFamily: root.fontFamily
          onChanged: function(v) { if (root.body) root.body.writeCard({ corner: v }) }
        }
      }
    }

    SwitchRow {
      width: parent.width - parent.leftPadding - parent.rightPadding
      glyph: "󰚩"
      label: "Show what your coding agent is up to"
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

    SwitchRow {
      width: parent.width - parent.leftPadding - parent.rightPadding
      glyph: "󰍜"
      label: "Super+Esc › Screensaver shows this one"
      description: root.menuNote
      checked: root.svc ? root.svc.menuOverrideActive === true : false
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: if (root.svc) { var r = root.svc.setMenuEntry(!checked); root.menuNote = r === "unparseable" ? "Couldn't: your menu extensions file has a mistake in it" : "" }
    }

    ActionRow {
      width: parent.width - parent.leftPadding - parent.rightPadding
      glyph: "󰌌"
      label: "Super+Ctrl+S starts it"
      description: "A line for your key bindings file"
      buttonText: "Copy the line"
      buttonIcon: "󰆏"
      tooltipText: "~/.config/hypr/bindings.lua:  " + root.bindLine
      foreground: root.foreground
      fontFamily: root.fontFamily
      onActivated: Quickshell.execDetached(["bash", "-c", 'printf %s "$1" | wl-copy', "_", root.bindLine])
    }

    ActionRow {
      visible: root.svc ? root.svc.setupDone === true : false
      width: parent.width - parent.leftPadding - parent.rightPadding
      glyph: "󰅶"
      label: "The bar's coffee cup"
      description: "Opens this panel now"
      buttonText: "Put the old one back"
      buttonIcon: "󰕌"
      tooltipText: "Undoes Finish setup: the original indicator returns and the menu entry goes"
      foreground: root.foreground
      fontFamily: root.fontFamily
      onActivated: if (root.svc) root.svc.undoSetup()
    }
  }
}
