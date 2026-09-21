import QtQuick
import qs.Commons
import qs.Ui

// A labelled slider with its value read out on the right, and an optional
// switch after the value (the lock row uses it for "lock at all").
CursorSurface {
  id: root

  property var bar: null
  property string label: ""
  property real value: 0
  property real minimum: 0
  property real maximum: 1
  property real step: 1
  property var format: function(v) { return String(Math.round(v)) }
  property bool showSwitch: false
  property bool switchChecked: true
  property color dim: Qt.darker(foreground, 1.4)
  property string fontFamily: Style.font.family
  readonly property real liveValue: slider.liveValue

  signal released(real value)
  signal switchToggled()
  signal hovered(bool isHovered)

  outline: true
  implicitHeight: Style.space(44)
  padding: Style.space(6)

  MouseArea {
    anchors.fill: parent
    hoverEnabled: true
    acceptedButtons: Qt.NoButton
    onContainsMouseChanged: root.hovered(containsMouse)
  }

  function nudge(direction) {
    var next = Math.max(root.minimum, Math.min(root.maximum, root.value + direction * root.step))
    if (next !== root.value) root.released(next)
  }

  Text {
    id: labelText
    anchors.left: parent.left
    anchors.leftMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    width: Style.space(92)
    textFormat: Text.PlainText
    text: root.label
    color: root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
    elide: Text.ElideRight
  }

  PanelSlider {
    id: slider
    bar: root.bar
    anchors.left: labelText.right
    anchors.right: valueText.left
    anchors.leftMargin: Style.space(8)
    anchors.rightMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    minimum: root.minimum
    maximum: root.maximum
    step: root.step
    integer: true
    value: root.value
    opacity: root.showSwitch && !root.switchChecked ? 0.4 : 1
    // A drag lands on any whole second; the row's own step is what the
    // keyboard and the wheel move by, so a drag should land there too — a
    // screensaver delay of 3:16 is not a setting anyone meant.
    onReleased: function(v) { root.released(Math.max(root.minimum, Math.min(root.maximum, Math.round(v / root.step) * root.step))) }
  }

  Text {
    id: valueText
    anchors.right: root.showSwitch ? lockSwitch.left : parent.right
    anchors.rightMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    width: Style.space(44)
    horizontalAlignment: Text.AlignRight
    textFormat: Text.PlainText
    text: root.showSwitch && !root.switchChecked ? "never" : root.format(slider.liveValue)
    color: root.showSwitch && !root.switchChecked ? root.dim : root.foreground
    font.family: root.fontFamily
    font.pixelSize: Style.font.body
  }

  ToggleSwitch {
    id: lockSwitch
    visible: root.showSwitch
    anchors.right: parent.right
    anchors.rightMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    checked: root.switchChecked
    foreground: root.foreground
    onToggled: root.switchToggled()
  }
}
