import QtQuick
import qs.Commons
import "Robot.js" as R
import "RobotArt.js" as A

// The agent's figure, in whatever shape the tile asked for, acting out one
// state. Two layers over one grid: the body painted as whole-pixel cells —
// the font's block glyphs leave hairline seams at fractional scale, so a
// slab would read as tiles — and the light laid over exactly that grid as
// text, the way the wordmark's animations are.
//
// Given a `pixelSize` it takes the size the art comes to; given none it
// fits whatever box it is put in.
Item {
  id: root

  property string figure: ""
  property string agentState: "idle"
  property color tone: Color.foreground
  property color light: Color.accent
  property string fontFamily: Style.font.family
  property bool running: true
  property int pixelSize: 0
  // The figure is made of the same dots as everything else, unless it is
  // drawn too small for a dot to survive.
  property bool dotted: true

  property int tick: 0
  // the baked drawings go in with every call: a script here cannot load
  // another script itself
  readonly property var pose: R.frame(root.figure, root.agentState, root.tick, A)
  readonly property var grid: R.size(root.figure)

  implicitWidth: pixelSize > 0 ? Math.round(grid.cols * pixelSize * body.advanceAt100 / 100) : 0
  implicitHeight: pixelSize > 0 ? Math.round(grid.rows * pixelSize * body.lineHeightAt100 / 100) : 0

  // It steps through its frames at the pace of what it is doing.
  Timer {
    interval: R.cadence(root.agentState)
    repeat: true
    running: root.running && root.visible
    onTriggered: root.tick++
  }
  onAgentStateChanged: tick = 0
  onFigureChanged: tick = 0

  AsciiArt {
    id: body
    anchors.fill: parent
    art: root.pose.body
    gridColumns: root.grid.cols
    gridRows: root.grid.rows
    dotted: root.dotted
    fg: root.tone
    accent: root.light
    fontFamily: root.fontFamily
    fitWidth: 1
    fitHeight: 1
  }

  Item {
    x: body.artX
    y: body.artY
    width: body.artW
    height: body.artH
    scale: body.shrink
    transformOrigin: Item.Center
    Text {
      textFormat: Text.PlainText
      renderType: Text.NativeRendering
      text: root.pose.glow
      color: root.light
      font.family: root.fontFamily
      font.pixelSize: body.pixelSize
      font.letterSpacing: body.cellW - body.advance
      lineHeightMode: Text.FixedHeight
      lineHeight: body.cellH
    }
  }
}
