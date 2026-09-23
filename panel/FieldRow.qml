import QtQuick
import qs.Commons
import qs.Ui

// One setting: a glyph, a label, and the control for it. The glyph slot and
// the label column are the same as a switch row's and a slider row's, so a
// section of mixed rows reads as one list — every glyph, every label and
// every control starting at the same place. The control goes in as the
// row's content and is given the width that is left.
Item {
  id: root

  property string glyph: ""
  property string label: ""
  property real labelWidth: Style.space(92)
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  default property alias content: slot.data

  // As tall as a switch row or a slider row when it is one line, with that
  // line centred the way theirs is; taller only when the control wraps.
  readonly property real rowHeight: Style.space(44)
  readonly property real pad: Math.max(Style.space(4), Math.round((rowHeight - mark.firstLineHeight) / 2))
  implicitHeight: Math.max(rowHeight, slot.childrenRect.height + pad * 2)

  Item {
    id: mark
    anchors.left: parent.left
    anchors.leftMargin: Style.space(10)
    y: root.pad + Math.round((firstLineHeight - glyphText.implicitHeight) / 2)
    // One line of controls is one button high: the label and glyph sit
    // level with that, however many lines the control runs to.
    readonly property real firstLineHeight: Math.max(labelText.implicitHeight, probe.implicitHeight)
    width: root.glyph !== "" ? Style.space(26) : 0
    height: glyphText.implicitHeight
    Text {
      id: glyphText
      textFormat: Text.PlainText
      text: root.glyph
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
    }
  }

  // The label sits level with the control's first line, so a control that
  // wraps onto more lines keeps its label at the top.
  Text {
    id: labelText
    anchors.left: mark.right
    y: root.pad + Math.round((mark.firstLineHeight - implicitHeight) / 2)
    width: root.labelWidth
    textFormat: Text.PlainText
    text: root.label
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    elide: Text.ElideRight
  }

  // Never shown: it only measures how tall a caption-sized button is.
  Button { id: probe; visible: false; text: "x"; bordered: true; fontSize: Style.font.caption }

  Item {
    id: slot
    anchors.left: labelText.right
    anchors.leftMargin: Style.space(8)
    anchors.right: parent.right
    anchors.rightMargin: Style.space(8)
    y: root.pad
    height: childrenRect.height
  }
}
