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
  property real driftX: 0
  property real driftY: 0

  readonly property var lines: art === "" ? [] : art.replace(/\s+$/, "").split("\n")
  readonly property int columns: {
    var m = 0
    for (var i = 0; i < lines.length; i++) m = Math.max(m, lines[i].length)
    return m
  }

  TextMetrics {
    id: probe
    font.family: root.fontFamily
    font.pixelSize: 100
    text: "█"
  }
  readonly property int pixelSize: {
    if (root.columns === 0 || root.lines.length === 0 || root.width === 0 || root.height === 0) return 24
    var byWidth = (root.width * root.fitWidth) / (root.columns * Math.max(1, probe.advanceWidth) / 100)
    var byHeight = (root.height * root.fitHeight) / (root.lines.length * Math.max(1, probe.height) / 100)
    return Math.max(4, Math.floor(Math.min(byWidth, byHeight)))
  }

  Text {
    anchors.centerIn: parent
    anchors.horizontalCenterOffset: root.driftX
    anchors.verticalCenterOffset: root.driftY
    textFormat: Text.PlainText
    renderType: Text.NativeRendering
    text: root.art
    color: root.fg
    font.family: root.fontFamily
    font.pixelSize: root.pixelSize
    lineHeight: 1
  }
}
