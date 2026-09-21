import QtQuick
import qs.Commons

// A big monospace clock in the theme's colours. One repaint a minute by
// default; a slow drift keeps it off any one set of pixels.
Item {
  id: root

  property bool active: false
  property bool thumbnail: false
  property var service: null
  property var settings: ({})

  property real driftX: 0
  property real driftY: 0
  Timer {
    interval: 30000
    repeat: true
    running: root.active
    onTriggered: {
      root.driftX = Math.round((Math.random() * 2 - 1) * root.width * 0.03)
      root.driftY = Math.round((Math.random() * 2 - 1) * root.height * 0.03)
    }
  }

  readonly property color fg: Color.foreground
  readonly property color bg: Color.background
  readonly property color muted: Color.muted
  readonly property string fontFamily: Style.font.family

  readonly property string format: settings && settings.format ? String(settings.format) : "HH:mm"
  readonly property bool showDate: !settings || settings.showDate !== false
  readonly property bool showSeconds: !!(settings && settings.showSeconds)

  property string timeText: ""
  property string dateText: ""

  function tick() {
    var now = new Date()
    var t = Qt.formatTime(now, root.showSeconds && root.format.indexOf("ss") === -1 ? root.format + ":ss" : root.format)
    var d = Qt.formatDate(now, "dddd d MMMM")
    if (t !== root.timeText) root.timeText = t
    if (d !== root.dateText) root.dateText = d
  }

  onActiveChanged: if (active) tick()
  Component.onCompleted: tick()

  Timer {
    interval: 1000
    repeat: true
    running: root.active
    onTriggered: root.tick()
  }

  Column {
    id: face
    anchors.centerIn: parent
    spacing: root.thumbnail ? Style.space(2) : Style.space(12)

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      textFormat: Text.PlainText
      renderType: Text.NativeRendering
      text: root.timeText
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: root.thumbnail ? Math.max(10, Math.round(Math.min(root.height * 0.34, root.width * 0.16))) : Math.max(48, Math.round(root.height * 0.22))
      font.bold: true
    }

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      visible: root.showDate
      textFormat: Text.PlainText
      renderType: Text.NativeRendering
      text: root.dateText
      color: root.muted
      font.family: root.fontFamily
      font.pixelSize: root.thumbnail ? Math.max(6, Math.round(root.height * 0.11)) : Math.max(18, Math.round(root.height * 0.04))
    }

    // Burn-in drift: a small jump to a new spot every half minute. A continuous
    // animation would repaint a fullscreen surface at 60 fps for nothing.
    anchors.horizontalCenterOffset: root.driftX
    anchors.verticalCenterOffset: root.driftY
  }
}
