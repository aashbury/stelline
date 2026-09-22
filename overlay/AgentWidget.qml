import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M
import "../savers"
import "../savers/Robot.js" as R

// The coding agent, as a figure that acts out what the agents are doing:
// typing while one works, hands off the keys under a blinking beacon when
// one needs you, waiting in the rain when it has finished, crossed and
// sparking when it hit an error, dark when there is nothing. Which figure
// is the tile's own choice. Beside it, which agent and what it is on, and
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
  readonly property real figureSize: large ? Math.max(Style.font.title, Math.min(Style.font.display * 1.4, Math.floor(maxHeight / (R.ROWS + 4)))) : Style.font.bodySmall
  readonly property string fontFamily: Style.font.family

  visible: shown && sessions.length > 0
  implicitWidth: Math.min(maxWidth, column.implicitWidth + padding * 2)
  implicitHeight: column.implicitHeight + padding * 2
  padding: Style.space(14) * k
  radius: Style.cornerRadius
  color: Color.notifications.background
  borderSpec: Border.surfaceSpec("notifications", "border", Color.notifications.border, Style.normalBorderWidth)

  Grid {
    id: column
    anchors.left: parent.left
    anchors.top: parent.top
    anchors.margins: root.padding
    // Beside the words in a corner; above them in the middle.
    columns: root.large ? 1 : 2
    horizontalItemAlignment: Grid.AlignHCenter
    verticalItemAlignment: Grid.AlignVCenter
    columnSpacing: Style.space(12)
    rowSpacing: Style.space(8) * root.k

    RobotFigure {
      id: robot
      figure: root.figure
      agentState: root.state
      tone: root.tone
      light: root.light
      fontFamily: root.fontFamily
      pixelSize: root.figureSize
      width: implicitWidth
      height: implicitHeight
    }

    Column {
      spacing: Style.space(2) * root.k
      Text {
        textFormat: Text.PlainText
        text: M.agentStateLabel(root.state)
        color: root.state === "needs" ? Color.accent : root.tone
        font.family: root.fontFamily
        font.pixelSize: (root.large ? Style.font.title : Style.font.body) * (root.large ? 1 : root.k)
        font.bold: true
        horizontalAlignment: root.large ? Text.AlignHCenter : Text.AlignLeft
        width: root.large ? implicitWidth : undefined
      }
      Text {
        textFormat: Text.PlainText
        text: root.summary.line
        color: root.fg
        font.family: root.fontFamily
        font.pixelSize: Style.font.bodySmall * root.k
        elide: Text.ElideRight
        width: Math.min(implicitWidth, root.maxWidth - root.padding * 2 - (root.large ? 0 : robot.width + column.columnSpacing))
      }
      // The other sessions, each on its own line, so the one that is stuck
      // is never hidden behind the one that is busy.
      Repeater {
        model: root.sessions.length > 1 ? root.sessions.slice(1, 5) : []
        Text {
          required property var modelData
          textFormat: Text.PlainText
          text: String(modelData.name) + " · " + String(modelData.title || modelData.project || "") + " · " + M.agentStateLabel(String(modelData.state))
          color: modelData.state === "needs" ? Color.accent : (modelData.state === "error" ? Color.urgent : root.dim)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption * root.k
          elide: Text.ElideRight
          width: Math.min(implicitWidth, root.maxWidth - root.padding * 2 - (root.large ? 0 : robot.width + column.columnSpacing))
        }
      }
    }
  }
}
