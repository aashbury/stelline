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
  // "state" (the agent, and whether it needs you) or "titles" (what it is on).
  property string detail: "titles"
  property bool shown: true
  property bool large: false
  // The card's width, set by the layer so every widget matches. The figure
  // fits inside it, and inside the height it is given.
  property real cardWidth: Style.space(300)
  // The height the card may take: the figure is as big as that allows —
  // in the middle as big as the screen allows — and shrinks, rather than the
  // card running off the screen, when the spot is shared.
  property real maxHeight: 400
  readonly property var sessions: service && Array.isArray(service.agentSessions) ? service.agentSessions : []
  readonly property var summary: M.agentSummary(sessions, detail)
  readonly property string state: summary.state
  readonly property real k: large ? 1.6 : 1
  readonly property color fg: Color.notifications.text
  readonly property color tone: state === "error" ? Color.urgent : fg
  // The figure's lights — the visor, the lit keys, the eyes, the beacon —
  // are in the state's colour too, so light and words agree.
  readonly property color light: colorFor(state)
  // Each state in its own colour from the theme, so the words say it at a
  // glance: working in the accent, wanting you yellow, finished green, an
  // error red, standby muted.
  function colorFor(st) {
    return M.stateColor(st, service && service.themeColors ? service.themeColors : {},
      { accent: Color.accent, muted: Color.muted, urgent: Color.urgent, foreground: root.fg })
  }
  // Every figure is fitted to one frame, three wide by four tall like the
  // hands' own grid, so the card is the same shape whichever figure it
  // holds; the words go under it, the width of the frame. In a corner the
  // frame is tall enough for a fine grid's dots to stay dots; in the middle
  // it is as tall as the screen allows, less the room the words need.
  readonly property int moreSessions: Math.max(0, sessions.length - 5)
  readonly property real captionRoom: (Style.font.body * 1.4 + Style.font.bodySmall * 1.4 + Style.space(12)) * k
    + (Math.min(4, Math.max(0, sessions.length - 1)) + (moreSessions > 0 ? 1 : 0)) * Style.font.caption * k * 1.4
  // Below the floor a figure turns to mush; at the floor the card may run
  // tight, but the figure still reads.
  readonly property real textWidth: cardWidth - padding * 2
  readonly property real frameHeight: Math.max(Style.space(120),
    Math.min(large ? Style.space(560) : Style.space(300), maxHeight - captionRoom - padding * 2, textWidth * 4 / 3))
  // Centred over the words, which keep the card's whole width.
  readonly property real frameWidth: Math.min(textWidth, Math.round(frameHeight * 3 / 4))
  readonly property string fontFamily: Style.font.family

  // Whether there is anything to draw, apart from being shown: what the
  // layer above reads, since a hidden item's own visible reads false.
  readonly property bool hasContent: sessions.length > 0
  visible: shown && hasContent
  implicitWidth: cardWidth
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
    width: root.textWidth
    spacing: Style.space(10) * root.k

    RobotFigure {
      id: robot
      figure: root.figure
      agentState: root.state
      tone: root.tone
      light: root.light
      fontFamily: root.fontFamily
      x: Math.round((root.textWidth - root.frameWidth) / 2)
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
        color: root.colorFor(root.state)
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
          text: String(modelData.name) + (M.agentSessionWhat(modelData, root.detail) !== "" ? " · " + M.agentSessionWhat(modelData, root.detail) : "") + " · " + M.agentStateLabel(String(modelData.state))
          color: root.colorFor(String(modelData.state))
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption * root.k
          elide: Text.ElideRight
        }
      }
      Text {
        visible: root.moreSessions > 0
        width: parent.width
        textFormat: Text.PlainText
        text: "+ " + root.moreSessions + " more"
        color: Qt.darker(root.fg, 1.4)
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption * root.k
        elide: Text.ElideRight
      }
    }
  }
}
