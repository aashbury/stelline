import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// The one-time banner: Omarchy's coffee cup binds to the stock idle service,
// which Stelline replaces, so the cup's job moves to this icon. Finish setup
// retires the dead indicator; Shortcuts › Put the old one back restores it
// exactly.
BorderSurface {
  id: root

  property var svc: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  property bool detailsOpen: false
  readonly property bool stale: svc ? svc.staleIdleOwner === true : false

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
        : "The coffee cup already in your bar only works with the original screensaver. Finish setup swaps it for this icon — same cup, same Super+Ctrl+I. Shortcuts › Put the old one back undoes it."
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
        fontSize: Style.font.caption
        onClicked: Quickshell.execDetached(["omarchy-restart-shell"])
      }

      Button {
        visible: !root.stale
        text: "Finish setup"
        iconText: "󰄬"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        onClicked: if (root.svc) root.svc.finishSetup()
      }

      Button {
        visible: !root.stale
        text: root.detailsOpen ? "Hide" : "What this changes"
        // Bordered, with an icon, so it stands the same height as Finish setup.
        iconText: root.detailsOpen ? "󰅃" : "󰋽"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        onClicked: root.detailsOpen = !root.detailsOpen
      }
    }

    Text {
      visible: root.detailsOpen && !root.stale
      width: parent.width
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      text: "One line in your shell settings: the old cup comes off the bar's list of indicators, and what was there is remembered so it can go back. Nothing else changes."
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }
}
