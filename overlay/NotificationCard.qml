import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// A quiet corner card on the screensaver: how many notifications arrived, from
// whom, and whether an agent is waiting. Drawn with the notification surface
// tokens so it reads as part of the desktop, not an app.
BorderSurface {
  id: root

  property var service: null
  property string corner: "bottom-right"
  readonly property var groups: service ? service.cardGroups : []
  readonly property string agentState: service ? String(service.agentState || "") : ""
  readonly property var card: service && service.cfg && service.cfg.card ? service.cfg.card : ({})
  readonly property string detail: card.detail || "counts"
  readonly property bool showAgent: card.showAgent !== false && agentState !== "" && agentState !== "idle"
  readonly property int total: M.totalCount(groups)
  readonly property color fg: Color.notifications.text
  readonly property color dim: Qt.darker(fg, 1.4)
  readonly property string fontFamily: Style.font.family

  function agentLine(state) {
    if (state === "needs") return "agent · needs your input"
    if (state === "error") return "agent · hit an error"
    if (state === "done") return "agent · finished"
    if (state === "working") return "agent · working"
    return "agent · " + state
  }

  visible: total > 0 || showAgent
  anchors.top: corner.indexOf("top") === 0 ? parent.top : undefined
  anchors.bottom: corner.indexOf("bottom") === 0 ? parent.bottom : undefined
  anchors.left: corner.indexOf("left") !== -1 ? parent.left : undefined
  anchors.right: corner.indexOf("right") !== -1 ? parent.right : undefined
  anchors.margins: Style.gapsOut * 4

  implicitWidth: Math.min(parent ? parent.width * 0.4 : 480, Math.max(Style.space(220), column.implicitWidth + padding * 2))
  implicitHeight: column.implicitHeight + padding * 2
  padding: Style.space(14)
  radius: Style.cornerRadius
  color: Color.notifications.background
  borderSpec: Border.surfaceSpec("notifications", "border", Color.notifications.border, Style.normalBorderWidth)

  Column {
    id: column
    anchors.left: parent.left
    anchors.top: parent.top
    anchors.margins: root.padding
    width: root.width - root.padding * 2
    spacing: Style.space(4)

    Text {
      visible: root.total > 0
      textFormat: Text.PlainText
      text: "󰂚 " + root.total + (root.total === 1 ? " notification" : " notifications")
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      font.bold: true
    }

    Repeater {
      model: root.groups
      Column {
        required property var modelData
        width: column.width
        spacing: Style.space(1)
        Text {
          width: parent.width
          textFormat: Text.PlainText
          elide: Text.ElideRight
          text: (modelData.glyph ? modelData.glyph + " " : "") + modelData.app
            + (modelData.count > 1 ? " ×" + modelData.count : "")
            + (root.detail !== "counts" && modelData.latestSummary ? " — " + modelData.latestSummary : "")
          color: modelData.urgency >= 2 ? Color.urgent : root.fg
          font.family: root.fontFamily
          font.pixelSize: Style.font.bodySmall
        }
        Text {
          visible: root.detail === "bodies" && modelData.latestBody !== ""
          width: parent.width
          textFormat: Text.PlainText
          elide: Text.ElideRight
          text: "  " + modelData.latestBody
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }

    Text {
      visible: root.showAgent
      textFormat: Text.PlainText
      text: root.agentLine(root.agentState)
      color: root.agentState === "needs" || root.agentState === "error" ? Color.urgent : Color.accent
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }
  }
}
