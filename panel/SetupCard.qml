import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// The one-time banner: Omarchy's coffee cup binds to the stock idle service,
// which Stelline replaces, so the cup's job moves to this icon. Finish setup
// retires the dead indicator; Advanced > Undo setup puts it back exactly.
BorderSurface {
  id: root

  property var svc: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  property bool detailsOpen: false
  readonly property bool stale: svc ? svc.staleIdleOwner === true : false
  readonly property bool indicatorShown: svc ? svc.stayAwakeIndicatorShown === true : false

  implicitHeight: column.implicitHeight + padding * 2
  padding: Style.space(12)
  radius: Style.cornerRadius
  color: Style.controlFill(false, false, foreground, Color.accent)
  borderSpec: Border.controlSpec("selected", foreground, Color.accent)

  Column {
    id: column
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.margins: root.padding
    spacing: Style.space(8)

    Text {
      textFormat: Text.PlainText
      text: root.stale ? "Restart the shell to finish" : "One more step"
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
      font.bold: true
    }

    Text {
      width: parent.width
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      text: root.stale
        ? "The stock idle service still answers until the shell restarts; the bar blinks once."
        : "Omarchy's coffee cup watches the idle service Stelline replaces, so this icon takes over that job — same glyph, same Super+Ctrl+I. Finish setup retires the dead cup; Undo in Advanced puts it back."
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }

    Row {
      spacing: Style.space(8)

      Button {
        visible: root.stale
        text: "Restart shell"
        iconText: "󰜉"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: Quickshell.execDetached(["omarchy-restart-shell"])
      }

      Button {
        visible: !root.stale
        text: "Finish setup"
        iconText: "󰄬"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: if (root.svc) root.svc.finishSetup()
      }

      Button {
        visible: !root.stale
        text: root.detailsOpen ? "Hide" : "What this changes"
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.detailsOpen = !root.detailsOpen
      }
    }

    Text {
      visible: root.detailsOpen && !root.stale
      width: parent.width
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      text: "In ~/.config/omarchy/shell.json: removes \"StayAwake\" from the omarchy.indicators items and records the previous list on this plugin's entry. Nothing else is touched; no files are created."
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }
}
