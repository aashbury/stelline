import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// Level 3: situations, the status card, integration.
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

  spacing: Style.space(10)

  function situationItem(index) { return situationRepeater.itemAt(index) }

  // ---- situations ----
  Row {
    width: parent.width
    spacing: Style.space(8)
    PanelSectionHeader { text: "RULES"; foreground: root.foreground; fontFamily: root.fontFamily }
    Text {
      anchors.baseline: parent.children[0].baseline
      textFormat: Text.PlainText
      text: "every tile's rule, in priority order — the first that holds wins"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  Column {
    id: situationList
    width: parent.width
    spacing: Style.space(4)

    Repeater {
      id: situationRepeater
      model: root.cfg.situations.length

      SituationRow {
        required property int index
        width: parent.width
        situation: root.cfg.situations[index] || ({})
        userSavers: root.svc ? root.svc.userSavers : []
        themeNames: root.svc ? root.svc.themeNames : []
        bar: root.bar
        foreground: root.foreground
        fontFamily: root.fontFamily
        hasCursor: root.body ? root.body.cursorActive && root.body.cursorIndex === root.body.rowSituationFirst + index : false
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
      visible: root.cfg.situations.length === 0
      textFormat: Text.PlainText
      text: "No rules yet — the usual saver and timings always apply. Open a tile's gear to give it one."
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  Row {
    spacing: Style.space(6)
    Text {
      anchors.verticalCenter: parent.verticalCenter
      textFormat: Text.PlainText
      text: "A rule with no saver only changes the timings:"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
    Button { text: "+ On battery"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: if (root.body) root.body.addSituation("battery") }
    Button { text: "+ Night"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: if (root.body) root.body.addSituation("night") }
    Button { text: "+ Theme"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: if (root.body) root.body.addSituation("theme") }
  }

  PanelSeparator { width: parent.width; foreground: root.foreground }

  // ---- status card ----
  PanelSectionHeader { text: "STATUS CARD"; foreground: root.foreground; fontFamily: root.fontFamily }

  Toggle {
    width: parent.width
    label: "Show on the screensaver"
    description: "Notification counts by app, hidden while Do Not Disturb is on"
    checked: root.card.enabled !== false
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: if (root.body) root.body.writeCard({ enabled: !checked })
  }

  Row {
    spacing: Style.space(12)
    Column {
      spacing: Style.space(3)
      Text { textFormat: Text.PlainText; text: "Detail"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
      ButtonGroup {
        options: ["counts", "summaries", "bodies"]
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
    width: parent.width
    label: "Show agent state"
    description: "Reads ~/.local/state/omarchy/agent-ambient (working, needs, done, error)"
    checked: root.card.showAgent !== false
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: if (root.body) root.body.writeCard({ showAgent: !checked })
  }

  PanelSeparator { width: parent.width; foreground: root.foreground }

  // ---- integration ----
  PanelSectionHeader { text: "INTEGRATION"; foreground: root.foreground; fontFamily: root.fontFamily }

  Toggle {
    width: parent.width
    label: "System › Screensaver opens Stelline"
    description: root.menuNote !== "" ? root.menuNote : "Super+Esc › Screensaver previews this saver instead of the stock terminal one (edits ~/.config/omarchy/extensions/omarchy-menu.jsonc)"
    checked: root.svc ? root.svc.menuOverrideActive === true : false
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: if (root.svc) { var r = root.svc.setMenuEntry(!checked); root.menuNote = r === "unparseable" ? "Refused: that file does not parse — fix it or paste the entry by hand" : "" }
  }
  property string menuNote: ""

  Text {
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    text: "A hotkey for the screensaver — add to ~/.config/hypr/bindings.lua:"
    color: root.dim
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
  }

  Row {
    width: parent.width
    spacing: Style.space(8)
    BorderSurface {
      width: parent.width - copyButton.width - Style.space(8)
      implicitHeight: bindText.implicitHeight + Style.space(12)
      radius: Style.cornerRadius
      color: Style.normalFillFor(root.foreground, Color.accent)
      borderSpec: Border.controlSpec("normal", root.foreground, Color.accent)
      Text {
        id: bindText
        anchors.centerIn: parent
        width: parent.width - Style.space(12)
        textFormat: Text.PlainText
        wrapMode: Text.WrapAnywhere
        text: root.bindLine
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }
    Button {
      id: copyButton
      text: "Copy"
      bordered: true
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      onClicked: Quickshell.execDetached(["bash", "-c", 'printf %s "$1" | wl-copy', "_", root.bindLine])
    }
  }
  readonly property string bindLine: 'o.bind("SUPER + CTRL + S", "Screensaver", "omarchy-shell stelline preview")'

  Button {
    visible: root.svc ? root.svc.setupDone === true : false
    text: "Undo setup"
    iconText: "󰕌"
    bordered: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.caption
    tooltipText: "Put the stock StayAwake indicator back and remove the menu entry"
    onClicked: if (root.svc) root.svc.undoSetup()
  }
}
