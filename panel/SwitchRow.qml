import QtQuick
import qs.Commons
import qs.Ui

// The panel's one switch row: an optional glyph, a label, an optional dim
// line under it, and the switch on the right. No border of its own — the
// panel's boxes are the open detail card and the Add card, and a switch in
// a box inside the panel is what made the corners look busy.
CursorSurface {
  id: root

  property string glyph: ""
  property string label: ""
  property string description: ""
  property bool checked: false
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)

  signal clicked()
  signal hovered(bool isHovered)

  implicitHeight: Math.max(Style.space(44), text.implicitHeight + Style.space(16))

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
    onContainsMouseChanged: root.hovered(containsMouse)
  }

  // A fixed slot, so labels line up whether or not a row has a glyph.
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
      color: root.checked ? root.foreground : root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
    }
  }

  Column {
    id: text
    anchors.left: mark.right
    anchors.right: knob.left
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

  ToggleSwitch {
    id: knob
    anchors.right: parent.right
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    checked: root.checked
    interactive: false
    foreground: root.foreground
  }
}
