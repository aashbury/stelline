import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// One rule, read out: its switch, the saver it belongs to ("Any screensaver"
// for one that only changes the timings), what it says, and remove. It is
// not edited here — click it and the panel goes to where it is edited: the
// saver's gear, or the switch under the timings.
CursorSurface {
  id: root

  property var situation: ({})
  property var userSavers: []
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  // Marked while the saver's own panel is open, so the two views of the
  // same rule point at each other.
  property bool highlighted: false
  readonly property var ruleSaver: M.ruleSaver(situation, userSavers)
  readonly property string subjectName: ruleSaver ? String(ruleSaver.name) : "Any screensaver"
  readonly property string subjectGlyph: ruleSaver ? String(ruleSaver.glyph || "󰊄") : "󰅐"
  readonly property string detail: {
    var when = M.situationLabel(situation)
    var timings = M.situationTimings(situation)
    return timings !== "" ? when + " · " + timings : when
  }

  signal clicked()
  signal toggled()
  signal removeRequested()
  signal hovered(bool isHovered)

  implicitHeight: Style.space(44)
  current: root.highlighted

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onClicked: root.clicked()
    onContainsMouseChanged: root.hovered(containsMouse)
  }

  ToggleSwitch {
    id: enabledSwitch
    anchors.left: parent.left
    anchors.leftMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    checked: root.situation.enabled === true
    foreground: root.foreground
    onToggled: root.toggled()
  }

  Text {
    id: subjectMark
    anchors.left: enabledSwitch.right
    anchors.leftMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    textFormat: Text.PlainText
    text: root.subjectGlyph
    color: root.situation.enabled === true ? root.foreground : root.dim
    font.family: root.fontFamily
    font.pixelSize: Style.font.subtitle
  }

  Column {
    anchors.left: subjectMark.right
    anchors.leftMargin: Style.space(8)
    anchors.right: removeButton.left
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.space(1)

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.subjectName
      color: root.situation.enabled === true ? root.foreground : root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
      elide: Text.ElideRight
    }
    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.detail !== "" ? root.detail : "no change"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
    }
  }

  PanelActionButton {
    id: removeButton
    anchors.right: parent.right
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    iconText: "󰅖"
    tooltipText: "Remove this rule"
    foreground: root.foreground
    hoverColor: Color.urgent
    fontFamily: root.fontFamily
    onClicked: root.removeRequested()
  }
}
