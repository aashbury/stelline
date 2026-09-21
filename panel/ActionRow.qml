import QtQuick
import qs.Commons
import qs.Ui

// A row inside an opened section that ends in a button rather than a switch:
// same shape as SwitchRow, glyph slot included, so the two line up down the
// left edge.
Item {
  id: root

  property string glyph: ""
  property string label: ""
  property string description: ""
  property string buttonText: ""
  property string buttonIcon: ""
  property string tooltipText: ""
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)

  signal activated()

  implicitHeight: Math.max(Style.space(38), text.implicitHeight + Style.space(12))

  Item {
    id: mark
    anchors.left: parent.left
    anchors.leftMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    width: root.glyph !== "" ? Style.space(26) : 0
    height: glyphText.implicitHeight
    Text {
      id: glyphText
      textFormat: Text.PlainText
      text: root.glyph
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
    }
  }

  Column {
    id: text
    anchors.left: mark.right
    anchors.right: action.left
    anchors.rightMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(2)

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.label
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      elide: Text.ElideRight
    }
    Text {
      width: parent.width
      visible: root.description !== ""
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      text: root.description
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  Button {
    id: action
    anchors.right: parent.right
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    text: root.buttonText
    iconText: root.buttonIcon
    bordered: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.caption
    tooltipText: root.tooltipText
    onClicked: root.activated()
  }
}
