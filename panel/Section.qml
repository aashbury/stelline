import QtQuick
import qs.Commons
import qs.Ui

// One collapsible row: a title, and in dim text what it is set to right now,
// so it can be left closed. Opens to whatever is declared inside it.
Column {
  id: root

  property string title: ""
  property string summary: ""
  property bool open: false
  property bool hasCursor: false
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  default property alias content: body.data
  property alias bodySpacing: body.spacing
  // How far the rows inside sit in from the head. Inside a card whose other
  // rows are not folded, 0 keeps every glyph and switch in one column.
  property real inset: Style.space(8)

  signal clicked()
  signal hovered(bool isHovered)

  width: parent ? parent.width : implicitWidth
  spacing: Style.space(6)

  CursorSurface {
    id: head
    width: parent.width
    implicitHeight: Style.space(36)
    hasCursor: root.hasCursor
    current: root.open
    foreground: root.foreground

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      onClicked: root.clicked()
      onContainsMouseChanged: root.hovered(containsMouse)
    }

    Row {
      id: titleRow
      anchors.left: parent.left
      anchors.leftMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(8)
      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: root.open ? "󰅀" : "󰅂"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
      }
      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: root.title
        color: root.foreground
        font.family: root.fontFamily
        font.pixelSize: Style.font.subtitle
      }
    }
    Text {
      anchors.left: titleRow.right
      anchors.leftMargin: Style.space(10)
      anchors.right: parent.right
      anchors.rightMargin: Style.space(10)
      anchors.verticalCenter: parent.verticalCenter
      textFormat: Text.PlainText
      text: root.summary
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
    }
  }

  Column {
    id: body
    visible: root.open
    width: parent.width
    topPadding: Style.space(2)
    leftPadding: root.inset
    rightPadding: root.inset
    bottomPadding: Style.space(10)
    spacing: Style.space(4)
  }
}
