import QtQuick
import qs.Commons
import qs.Ui

// One saver in the picker: marker, glyph, name, one line of meta, and a
// preview action. With shuffle on the marker is a checkbox for the rotation.
CursorSurface {
  id: root

  property var saver: ({})
  property bool selected: false
  property bool shuffleMode: false
  property bool inRotation: false
  property bool hasSettings: true
  property bool expanded: false
  property color dim: Qt.darker(foreground, 1.4)
  property string fontFamily: Style.font.family

  signal clicked()
  signal previewRequested()
  signal settingsRequested()
  signal hovered(bool isHovered)

  current: selected && !shuffleMode
  implicitHeight: Style.space(40)
  padding: Style.space(6)

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    onClicked: root.clicked()
    onContainsMouseChanged: root.hovered(containsMouse)
  }

  Row {
    anchors.left: parent.left
    anchors.right: gear.left
    anchors.leftMargin: Style.space(10)
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(10)

    Text {
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(14)
      textFormat: Text.PlainText
      text: root.shuffleMode ? (root.inRotation ? "󰄲" : "󰄱") : (root.selected ? "●" : "")
      color: root.selected || root.inRotation ? Color.accent : root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }

    Text {
      anchors.verticalCenter: parent.verticalCenter
      width: Style.space(20)
      textFormat: Text.PlainText
      text: root.saver.glyph || ""
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.icon
    }

    Column {
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(1)

      Text {
        textFormat: Text.PlainText
        text: root.saver.name || ""
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.subtitle
        font.bold: root.selected
      }
      Text {
        textFormat: Text.PlainText
        text: root.saver.meta || ""
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }
  }

  PanelActionButton {
    id: gear
    visible: root.hasSettings
    anchors.right: preview.left
    anchors.rightMargin: Style.space(4)
    anchors.verticalCenter: parent.verticalCenter
    iconText: root.expanded ? "󰅀" : "󰒓"
    tooltipText: root.expanded ? "Hide settings" : "Settings"
    foreground: root.expanded ? Color.accent : root.foreground
    fontFamily: root.fontFamily
    onClicked: root.settingsRequested()
  }

  PanelActionButton {
    id: preview
    anchors.right: parent.right
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    iconText: "󰐊"
    tooltipText: "Preview " + (root.saver.name || "")
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: root.previewRequested()
  }
}
