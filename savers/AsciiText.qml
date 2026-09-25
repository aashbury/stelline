import QtQuick
import qs.Commons

// Arbitrary text art as one Text item: letters, punctuation, braille — the
// glyph cache does the work, so a new frame costs one layout. Block
// characters can show hairline seams at fractional display scales here,
// which is why stills go through AsciiArt instead.
Item {
  id: root

  property string art: ""
  property color fg: Color.foreground
  property string fontFamily: Style.font.family
  property real fitWidth: 0.9
  property real fitHeight: 0.85
  // Cover the screen, cutting off what overflows, instead of fitting in it.
  property bool cover: false
  property real driftX: 0
  property real driftY: 0
  // An animation lays every frame on one grid (the widest and tallest of
  // them), pinned at its top left, so a frame a line short of the next
  // does not resize or recentre the picture. 0 = this art's own size.
  property int gridColumns: 0
  property int gridRows: 0

  readonly property var lines: art === "" ? [] : art.replace(/\s+$/, "").split("\n")
  readonly property int columns: {
    var m = 0
    for (var i = 0; i < lines.length; i++) m = Math.max(m, lines[i].length)
    return m
  }
  readonly property int fitColumns: gridColumns > 0 ? Math.max(gridColumns, columns) : columns
  readonly property int fitRows: gridRows > 0 ? Math.max(gridRows, lines.length) : lines.length

  TextMetrics {
    id: probe
    font.family: root.fontFamily
    font.pixelSize: 100
    text: "█"
  }
  readonly property int pixelSize: {
    if (root.columns === 0 || root.lines.length === 0 || root.width === 0 || root.height === 0) return 24
    var byWidth = (root.width * root.fitWidth) / (root.fitColumns * Math.max(1, probe.advanceWidth) / 100)
    var byHeight = (root.height * root.fitHeight) / (root.fitRows * Math.max(1, probe.height) / 100)
    return Math.max(4, root.cover ? Math.ceil(Math.max(byWidth, byHeight)) : Math.floor(Math.min(byWidth, byHeight)))
  }

  // The grid's box, centred; the text sits at its top left.
  Item {
    id: box
    width: root.gridColumns > 0 ? Math.round(root.fitColumns * root.pixelSize * Math.max(1, probe.advanceWidth) / 100) : label.implicitWidth
    height: root.gridRows > 0 ? Math.round(root.fitRows * root.pixelSize * Math.max(1, probe.height) / 100) : label.implicitHeight
    anchors.centerIn: parent
    anchors.horizontalCenterOffset: root.driftX
    anchors.verticalCenterOffset: root.driftY
    scale: width > 0 && height > 0 ? Math.min(1, (root.cover ? Math.max : Math.min)((root.width * root.fitWidth) / width, (root.height * root.fitHeight) / height)) : 1
    transformOrigin: Item.Center
    Text {
      id: label
      anchors.left: parent.left
      anchors.top: parent.top
      textFormat: Text.PlainText
      renderType: Text.NativeRendering
      text: root.art
      color: root.fg
      font.family: root.fontFamily
      font.pixelSize: root.pixelSize
      lineHeight: 1
    }
  }
}
