import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// A quiet card on the screensaver: how many notifications arrived and from
// whom. Drawn with the notification surface tokens so it reads as part of
// the desktop, not an app. The widget layer places it; `large` is the
// middle-of-the-screen size.
BorderSurface {
  id: root

  property var service: null
  property bool shown: true
  property string detail: "counts"
  property bool large: false
  property real maxWidth: 480
  readonly property var groups: service ? service.cardGroups : []
  readonly property int total: M.totalCount(groups)
  readonly property real k: large ? 1.6 : 1
  readonly property color fg: Color.notifications.text
  readonly property color dim: Qt.darker(fg, 1.4)
  readonly property string fontFamily: Style.font.family

  readonly property bool hasContent: total > 0
  visible: shown && hasContent
  implicitWidth: Math.min(maxWidth, Math.max(Style.space(220) * k, column.implicitWidth + padding * 2))
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
    width: root.width - root.padding * 2
    spacing: Style.space(4) * root.k

    Text {
      visible: root.total > 0
      textFormat: Text.PlainText
      text: "󰂚 " + root.total + (root.total === 1 ? " notification" : " notifications")
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: Style.font.body * root.k
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
          font.pixelSize: Style.font.bodySmall * root.k
        }
        Text {
          visible: root.detail === "bodies" && modelData.latestBody !== ""
          width: parent.width
          textFormat: Text.PlainText
          elide: Text.ElideRight
          text: "  " + modelData.latestBody
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption * root.k
        }
      }
    }
  }
}
