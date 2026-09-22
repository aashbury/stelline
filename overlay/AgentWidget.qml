import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M
import "../savers"

// The coding agent, as a figure that acts out what the agents are doing:
// typing while one works, hands off the keys under a blinking beacon when
// one needs you, waiting in the rain when it has finished, crossed and
// sparking when it hit an error, dark when there is nothing. Which figure
// is the tile's own choice. Under it, which agent and what it is on, and
// every other session below that. Drawn on the notification surface, like
// the card; `large` is the middle-of-the-screen size.
BorderSurface {
  id: root

  property var service: null
  property string figure: ""
  property bool shown: true
  property bool large: false
  property real maxWidth: 480
  // In the middle the figure is as big as the screen allows, never bigger.
  property real maxHeight: 400
  readonly property var sessions: service && Array.isArray(service.agentSessions) ? service.agentSessions : []
  readonly property var summary: M.agentSummary(sessions)
  readonly property string state: summary.state
  readonly property real k: large ? 1.6 : 1
  readonly property color fg: Color.notifications.text
  readonly property color dim: Qt.darker(fg, 1.4)
  readonly property color tone: state === "error" ? Color.urgent : fg
  readonly property color light: state === "error" ? Color.urgent : Color.accent
  // Every figure is fitted to one frame, three wide by four tall like the
  // hands' own grid, so the card is the same shape whichever figure it
  // holds; the words go under it, the width of the frame. In a corner the
  // frame is tall enough for a fine grid's dots to stay dots; in the middle
  // it is as tall as the screen allows, less the room the words need.
  readonly property real captionRoom: (Style.font.body * 1.4 + Style.font.bodySmall * 1.4 + Style.space(12)) * k
    + Math.min(4, Math.max(0, sessions.length - 1)) * Style.font.caption * k * 1.4
  readonly property real frameHeight: large
    ? Math.max(Style.space(300), Math.min(Style.space(560), maxHeight - captionRoom - padding * 2, (maxWidth - padding * 2) * 4 / 3))
    : Math.min(Style.space(300), (maxWidth - padding * 2) * 4 / 3)
  readonly property real frameWidth: Math.round(frameHeight * 3 / 4)
  readonly property string fontFamily: Style.font.family

  visible: shown && sessions.length > 0
  implicitWidth: frameWidth + padding * 2
  implicitHeight: column.implicitHeight + padding * 2
  padding: Style.space(14) * k
  radius: Style.cornerRadius
  color: Color.notifications.background
  borderSpec: Border.surfaceSpec("notifications", "border", Color.notifications.border, Style.normalBorderWidth)

  Column {
    id: column
    anchors.left: parent.left
    anchors.top: parent.top
    anchors.margins: root.padding
    width: root.frameWidth
    spacing: Style.space(10) * root.k

    RobotFigure {
      id: robot
      figure: root.figure
      agentState: root.state
      tone: root.tone
      light: root.light
      fontFamily: root.fontFamily
      width: root.frameWidth
      height: root.frameHeight
    }

    Column {
      width: parent.width
      spacing: Style.space(2) * root.k
      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: M.agentStateLabel(root.state)
        color: root.state === "needs" ? Color.accent : root.tone
        font.family: root.fontFamily
        font.pixelSize: Style.font.body * root.k
        font.bold: true
        elide: Text.ElideRight
      }
      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: root.summary.line
        color: root.fg
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall * root.k
        elide: Text.ElideRight
      }
      // The other sessions, each on its own line, so the one that is stuck
      // is never hidden behind the one that is busy.
      Repeater {
        model: root.sessions.length > 1 ? root.sessions.slice(1, 5) : []
        Text {
          required property var modelData
          width: parent.width
          textFormat: Text.PlainText
          text: String(modelData.name) + " · " + String(modelData.title || modelData.project || "") + " · " + M.agentStateLabel(String(modelData.state))
          color: modelData.state === "needs" ? Color.accent : (modelData.state === "error" ? Color.urgent : root.dim)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption * root.k
          elide: Text.ElideRight
        }
      }
    }
  }
}
