import QtQuick
import qs.Commons

// Digital rain in the theme's colours: heads in the foreground, trails in the
// accent. Pure scene graph — one multi-line Text per column, clipped to the
// head, a gradient for the fade and a single bright glyph for the head — so
// each step is a handful of property writes per live column and the GPU does
// the drawing. (Canvas 2D is software in Qt 6 and text there is ruinously
// slow; the stock terminal saver burns five cores.)
Item {
  id: root

  property bool active: false
  property var service: null
  property var settings: ({})

  readonly property color fg: Color.foreground
  readonly property color bg: Color.background
  readonly property color accent: Color.accent
  readonly property string fontFamily: Style.font.family

  readonly property real density: settings && isFinite(Number(settings.density)) ? Math.max(0.1, Math.min(1, Number(settings.density))) : 0.6
  readonly property int fpsSetting: settings && isFinite(Number(settings.fps)) ? Math.max(6, Math.min(30, Math.round(Number(settings.fps)))) : 15
  readonly property bool onBattery: service && service.onBattery === true
  readonly property int fps: onBattery ? Math.max(6, Math.round(fpsSetting / 2)) : fpsSetting
  readonly property string glyphSet: settings && settings.glyphs ? String(settings.glyphs) : "katakana"
  readonly property string alphabet: glyphSet === "ascii"
    ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$+-*/=%\"'#&_(),.;:?!\\|{}<>[]^~"
    : (glyphSet === "binary" ? "01" : "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789")

  readonly property int cell: Math.max(10, Math.round(Style.font.title * 1.5))
  readonly property int columns: Math.max(1, Math.floor(width / cell))
  readonly property int rows: Math.max(1, Math.floor(height / cell))
  readonly property int trail: Math.max(4, Math.min(16, Math.round(rows * 0.35)))
  readonly property real xInset: (width - columns * cell) / 2

  function glyph() { return alphabet.charAt(Math.floor(Math.random() * alphabet.length)) }

  function randomColumnText() {
    var out = []
    for (var r = 0; r < rows; r++) out.push(glyph())
    return out.join("\n")
  }

  function step() {
    for (var i = 0; i < columnRepeater.count; i++) {
      var col = columnRepeater.itemAt(i)
      if (!col) continue
      if (col.head < 0) {
        if (Math.random() < 0.02 * root.density) { col.head = 0; col.frac = 0; col.headGlyph = root.glyph() }
        continue
      }
      col.frac += col.speed
      var moved = false
      while (col.frac >= 1) {
        col.frac -= 1
        col.head += 1
        moved = true
        if (col.head > root.rows + root.trail) { col.head = -1; break }
      }
      if (moved && col.head >= 0) {
        col.headGlyph = root.glyph()
        // Mutate the glyph the head just left so the trail shimmers.
        if (col.head > 0 && col.head - 1 < root.rows) col.mutate(col.head - 1)
      }
    }
  }

  onActiveChanged: if (active) reseed()
  onColumnsChanged: reseed()
  onRowsChanged: reseed()

  function reseed() {
    for (var i = 0; i < columnRepeater.count; i++) {
      var col = columnRepeater.itemAt(i)
      if (!col) continue
      col.text = root.randomColumnText()
      col.head = Math.random() < root.density ? Math.floor(Math.random() * root.rows) : -1
      col.speed = 0.35 + Math.random() * 0.75
      col.frac = 0
      col.headGlyph = root.glyph()
    }
  }

  Timer {
    interval: Math.round(1000 / root.fps)
    repeat: true
    running: root.active
    onTriggered: root.step()
  }

  Repeater {
    id: columnRepeater
    model: root.columns
    onItemAdded: function(index, item) {
      item.text = root.randomColumnText()
      item.head = Math.random() < root.density ? Math.floor(Math.random() * root.rows) : -1
      item.speed = 0.35 + Math.random() * 0.75
      item.headGlyph = root.glyph()
    }

    Item {
      id: column
      required property int index
      property int head: -1
      property real speed: 0.6
      property real frac: 0
      property string text: ""
      property string headGlyph: ""
      readonly property bool live: head >= 0

      function mutate(row) {
        var chars = text.split("\n")
        if (row < 0 || row >= chars.length) return
        chars[row] = root.glyph()
        text = chars.join("\n")
      }

      x: root.xInset + index * root.cell
      y: 0
      width: root.cell
      height: root.height
      visible: live

      // Everything above the head, clipped so unreached rows stay dark.
      Item {
        id: revealed
        width: parent.width
        height: Math.max(0, Math.min(root.rows, column.head + 1)) * root.cell
        clip: true

        Text {
          id: body
          width: parent.width
          textFormat: Text.PlainText
          text: column.text
          color: root.accent
          font.family: root.fontFamily
          font.pixelSize: Math.round(root.cell * 0.8)
          font.bold: true
          lineHeightMode: Text.FixedHeight
          lineHeight: root.cell
          horizontalAlignment: Text.AlignHCenter
        }

        // Older trail rows fade to the background; the last `trail` rows
        // above the head stay visible.
        Rectangle {
          width: parent.width
          y: 0
          height: Math.max(0, revealed.height - root.trail * root.cell)
          color: root.bg
        }
        Rectangle {
          width: parent.width
          y: Math.max(0, revealed.height - root.trail * root.cell)
          height: Math.min(revealed.height, root.trail * root.cell)
          gradient: Gradient {
            GradientStop { position: 0.0; color: root.bg }
            GradientStop { position: 1.0; color: Qt.rgba(root.bg.r, root.bg.g, root.bg.b, 0) }
          }
        }
      }

      Text {
        visible: column.head >= 0 && column.head < root.rows
        y: column.head * root.cell
        width: parent.width
        height: root.cell
        textFormat: Text.PlainText
        text: column.headGlyph
        color: root.fg
        font.family: root.fontFamily
        font.pixelSize: Math.round(root.cell * 0.8)
        font.bold: true
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
      }
    }
  }
}
