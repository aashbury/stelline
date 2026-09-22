import QtQuick
import qs.Commons
import qs.Ui
import "../savers"

// One saver in the grid: a live thumbnail, the name, and one line saying when
// it plays. Click makes it the usual saver (or checks it into the shuffle);
// the pointer or the cursor reveals Preview and the gear. A saver still
// importing shows so.
CursorSurface {
  id: root

  property var saver: ({})
  property var svc: null
  property bool selected: false
  property bool shuffleMode: false
  property bool inRotation: false
  property bool open: false
  property bool live: false
  property bool addTile: false

  // The tail of a grid that got long: "+7 / Show all". Rendered as the plain
  // box the Add tile uses, so the row of tiles keeps its rhythm.
  property int moreCount: 0
  readonly property bool moreTile: moreCount > 0
  readonly property bool plainTile: addTile || moreTile
  property string caption: ""
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  readonly property bool importing: !!(saver && saver.series && saver.series.importing)
  readonly property bool failed: !!(saver && saver.series && saver.series.error)
  readonly property bool hot: hasCursor || mouse.containsMouse
  // With no rule to report, the line under the name says what the saver is.
  readonly property string metaLine: saver && saver.meta ? String(saver.meta) : ""
  readonly property bool external: !!(saver && saver.kind === "external")

  signal clicked()
  signal previewRequested()
  signal settingsRequested()
  signal hovered(bool isHovered)

  current: selected && !shuffleMode && !plainTile
  outline: open
  implicitHeight: column.implicitHeight + padding * 2
  padding: Style.space(6)

  MouseArea {
    id: mouse
    anchors.fill: parent
    hoverEnabled: true
    onClicked: root.clicked()
    onContainsMouseChanged: root.hovered(containsMouse)
  }

  Column {
    id: column
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.margins: root.padding
    spacing: Style.space(4)

    Item {
      id: thumb
      width: parent.width
      height: Math.round(width * 9 / 16)

      Rectangle {
        anchors.fill: parent
        color: root.plainTile ? "transparent" : Color.background
        border.width: root.plainTile ? 1 : 0
        border.color: root.dim
        radius: root.plainTile ? Style.cornerRadius : 0
      }

      // Only the saver is clipped. A border drawn on the clip's own edge
      // loses its top row to rounding at fractional display scales, so the
      // box that draws it sits outside.
      Item {
        anchors.fill: parent
        clip: true

        // The same composition the screen gets — base and widgets — small.
        Scene {
          anchors.fill: parent
          visible: !root.plainTile && !root.importing && !root.failed
          service: root.svc
          saver: root.saver
          thumbnail: true
          active: root.live && visible && !!(root.saver && (root.saver.file || root.saver.thumb))
        }
      }

      // Savers with no surface of their own (the stock terminal), the add
      // tile, and anything still on its way.
      Text {
        anchors.centerIn: parent
        visible: root.plainTile || !(root.saver && (root.saver.file || root.saver.thumb)) || root.importing || root.failed
        textFormat: Text.PlainText
        text: root.moreTile ? "+" + root.moreCount : (root.addTile ? "+" : (root.importing ? "󰔟" : (root.failed ? "󰀦" : (root.saver && root.saver.glyph ? root.saver.glyph : ""))))
        color: root.failed ? Color.urgent : (root.plainTile ? root.dim : root.foreground)
        font.family: root.fontFamily
        font.pixelSize: Style.font.display
      }

      // The stock saver runs in a terminal, and its thumbnail is the same art
      // the Wordmark draws — a terminal glyph tells the two apart.
      Text {
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.margins: Style.space(4)
        visible: root.external
        textFormat: Text.PlainText
        text: root.saver.glyph || "󰆍"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        style: Text.Outline
        styleColor: Color.background
      }

      // The shuffle checkbox. The usual saver needs no mark of its own: its
      // surface is highlighted and its caption says so.
      Text {
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.margins: Style.space(4)
        visible: !root.plainTile && root.shuffleMode
        textFormat: Text.PlainText
        text: (root.inRotation ? "󰄲" : "󰄱")
        color: Color.accent
        font.family: root.fontFamily
        font.pixelSize: Style.font.body
        style: Text.Outline
        styleColor: Color.background
      }

      Row {
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: Style.space(2)
        spacing: 0
        // Revealed by the pointer or the keyboard cursor, and kept while the
        // tile's panel is open below.
        visible: (root.hot || root.open) && !root.plainTile && !root.importing
        PanelActionButton {
          iconText: "󰐊"
          tooltipText: "Preview"
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.body
          visible: !root.failed
          onClicked: root.previewRequested()
        }
        PanelActionButton {
          iconText: "󰒓"
          tooltipText: "When it plays, and how it looks"
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.body
          onClicked: root.settingsRequested()
        }
      }
    }

    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.moreTile ? "Show all" : (root.addTile ? "Add" : (root.saver && root.saver.name ? root.saver.name : ""))
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.subtitle
      elide: Text.ElideRight
    }
    Text {
      width: parent.width
      textFormat: Text.PlainText
      text: root.moreTile ? root.moreCount + " more" : (root.addTile ? "picture, clip, text" : (root.importing ? "importing…" : (root.failed ? "import failed" : (root.caption !== "" ? root.caption : root.metaLine))))
      color: root.failed ? Color.urgent : (root.caption !== "" && !root.importing ? Color.accent : root.dim)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
    }
  }
}
