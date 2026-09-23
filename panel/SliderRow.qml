import QtQuick
import qs.Commons
import qs.Ui

// A labelled slider with its value read out on the right, and an optional
// switch after the value (the lock row uses it for "lock at all"). The
// readout is also the way to set a time exactly: click it and type.
CursorSurface {
  id: root

  property var bar: null
  property string glyph: ""
  property real labelWidth: Style.space(92)
  property string label: ""
  property real value: 0
  property real minimum: 0
  property real maximum: 1
  property real step: 1
  property var format: function(v) { return String(Math.round(v)) }
  // Turns what someone typed back into seconds; NaN means it made no sense.
  property var parse: function(text) { return Number(text) }
  property bool showSwitch: false
  property bool switchChecked: true
  property color dim: Qt.darker(foreground, 1.4)
  property string fontFamily: Style.font.family
  readonly property real liveValue: slider.liveValue
  // True while the readout is being typed into; the panel stops reading
  // keystrokes as shortcuts for as long as it is.
  property bool editing: false
  readonly property bool settable: !(showSwitch && !switchChecked)

  signal released(real value)
  signal switchToggled()
  signal hovered(bool isHovered)
  // The wheel belongs to the panel, not to whatever it happens to be over.
  signal wheeled(real delta)

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

  function startEditing() {
    if (!root.settable) return
    valueField.text = root.format(root.value)
    root.editing = true
    valueField.forceActiveFocus()
    valueField.selectAll()
  }
  // What was typed is meant exactly — it is the way round a track too coarse
  // to land on — so it is only held to the ends of the track, not to a step.
  function commit() {
    var v = Number(root.parse(valueField.text))
    root.editing = false
    if (!isFinite(v)) return
    var next = Math.max(root.minimum, Math.min(root.maximum, Math.round(v)))
    if (next !== root.value) root.released(next)
  }

  // The same fixed glyph slot as a switch row, so every label in a section
  // starts at the same place.
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
      color: root.settable ? root.foreground : root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
    }
  }

  Text {
    id: labelText
    anchors.left: mark.right
    anchors.verticalCenter: parent.verticalCenter
    width: root.labelWidth
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
    anchors.right: readout.left
    anchors.leftMargin: Style.space(8)
    anchors.rightMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    minimum: root.minimum
    maximum: root.maximum
    step: root.step
    integer: true
    value: root.value
    opacity: root.settable ? 1 : 0.4
    // A drag lands on any whole second; the row's own step is what the
    // keyboard and the wheel move by, so a drag should land there too — a
    // screensaver delay of 3:16 is not a setting anyone meant.
    onReleased: function(v) { root.released(Math.max(root.minimum, Math.min(root.maximum, Math.round(v / root.step) * root.step))) }
  }

  // The track sits inside a panel that scrolls. Left to itself the slider
  // takes the wheel and moves the setting, so someone scrolling past a row
  // changes it by accident; the wheel is caught here and handed back to the
  // panel instead.
  MouseArea {
    anchors.fill: slider
    z: 1
    // Buttons still reach the track underneath; only the wheel stops here.
    acceptedButtons: Qt.NoButton
    onWheel: function(wheel) { root.wheeled(wheel.angleDelta.y) }
  }

  Item {
    id: readout
    anchors.right: root.showSwitch ? lockSwitch.left : parent.right
    anchors.rightMargin: Style.space(10)
    anchors.verticalCenter: parent.verticalCenter
    width: Style.space(52)
    height: Style.space(26)

    Text {
      id: valueText
      anchors.fill: parent
      visible: !root.editing
      horizontalAlignment: Text.AlignRight
      verticalAlignment: Text.AlignVCenter
      textFormat: Text.PlainText
      text: root.settable ? root.format(slider.liveValue) : "never"
      color: root.settable ? (readoutMouse.containsMouse ? Color.accent : root.foreground) : root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }

    MouseArea {
      id: readoutMouse
      anchors.fill: parent
      enabled: root.settable && !root.editing
      hoverEnabled: true
      cursorShape: Qt.IBeamCursor
      onClicked: root.startEditing()
    }

    PanelToolTip {
      text: "Type a time"
      visible: readoutMouse.containsMouse && !root.editing
    }

    TextField {
      id: valueField
      anchors.fill: parent
      visible: root.editing
      horizontalAlignment: Text.AlignRight
      verticalPadding: 0
      foreground: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      onAccepted: root.commit()
      onActiveFocusChanged: if (!activeFocus && root.editing) root.commit()
      Keys.onEscapePressed: root.editing = false
    }
  }

  ToggleSwitch {
    id: lockSwitch
    visible: root.showSwitch
    anchors.right: parent.right
    // A switch that takes its own click keeps room round it for its hover
    // ring; the track itself lines up with every other row's switch.
    anchors.rightMargin: Style.space(8) - (lockSwitch.cursorRing ? lockSwitch.cursorPad : 0)
    anchors.verticalCenter: parent.verticalCenter
    checked: root.switchChecked
    foreground: root.foreground
    onToggled: root.switchToggled()
  }
}
