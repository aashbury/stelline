import QtQuick
import QtQuick.Window
import qs.Commons

// Text art painted as cells. Block, quadrant, shade and braille characters
// become geometry in whole-pixel cells rather than glyphs from the font: glyph
// quads leave hairline seams at fractional display scales, cells tile.
// Anything else falls back to the terminal font. Two cached canvases — the
// foreground colour and the accent — crossfade on the GPU for a pulse; the
// art is repainted only when what is shown changes, never per frame.
Item {
  id: root

  property string art: ""
  property color fg: Color.foreground
  property color accent: Color.accent
  property color muted: Color.muted
  // A pulse toward an accent identical to the foreground is no pulse at all.
  readonly property color pulseTo: Math.abs(accent.r - fg.r) + Math.abs(accent.g - fg.g) + Math.abs(accent.b - fg.b) > 0.12 ? accent : muted
  property string fontFamily: Style.font.family
  // How much of the surface the art may take.
  property real fitWidth: 0.8
  property real fitHeight: 0.6
  // Progressive: nothing shows until `resolve()` names the cells that have
  // arrived (an entrance effect feeds it a few per frame). Off: everything.
  property bool progressive: false
  // 0 = all foreground, 1 = all accent. The accent layer only exists while
  // `pulse` is on, so a plain show never paints twice.
  property real pulseMix: 0
  property bool pulse: false
  property real driftX: 0
  property real driftY: 0
  // Where the grid sits, for an overlay that wants to line up with it.
  readonly property real artX: canvasHost.x
  readonly property real artY: canvasHost.y
  readonly property real advance: pixelSize * advanceAt100 / 100

  readonly property var lines: art === "" ? [] : art.replace(/\s+$/, "").split("\n")
  readonly property int columns: {
    var m = 0
    for (var i = 0; i < lines.length; i++) m = Math.max(m, lines[i].length)
    return m
  }
  readonly property int totalChars: {
    var n = 0
    for (var i = 0; i < lines.length; i++) n += lines[i].length + 1
    return n
  }

  // Fit: the widest line at fitWidth of the width, all lines at fitHeight of
  // the height, whichever binds; then whole-pixel cells from the font's aspect.
  TextMetrics {
    id: probe
    font.family: root.fontFamily
    font.pixelSize: 100
    text: "█"
  }
  readonly property real advanceAt100: Math.max(1, probe.advanceWidth)
  readonly property real lineHeightAt100: Math.max(1, probe.height)
  readonly property int pixelSize: {
    if (root.columns === 0 || root.lines.length === 0 || root.width === 0 || root.height === 0) return 24
    var byWidth = (root.width * root.fitWidth) / (root.columns * root.advanceAt100 / 100)
    var byHeight = (root.height * root.fitHeight) / (root.lines.length * root.lineHeightAt100 / 100)
    return Math.max(2, Math.floor(Math.min(byWidth, byHeight)))
  }
  readonly property int cellW: Math.max(1, Math.round(root.pixelSize * root.advanceAt100 / 100))
  readonly property int cellH: Math.max(1, Math.round(root.pixelSize * root.lineHeightAt100 / 100))
  readonly property int artW: root.columns * root.cellW
  readonly property int artH: root.lines.length * root.cellH

  // The cells resolved so far, in arrival order; each canvas remembers how
  // many of them it has painted.
  property var pending: []
  function reset() {
    root.pending = []
    fgCanvas.painted = 0
    accentCanvas.painted = 0
    invalidate()
  }
  function resolve(list) {
    if (!list || list.length === 0) return
    root.pending = root.pending.concat(list)
    repaint()
  }

  // Cell painter. Returns true when the character was drawn as geometry.
  function paintCell(ctx, ch, x, y, w, h) {
    var code = ch.charCodeAt(0)
    if (ch === " " || ch === "\t") return true
    if (code >= 0x2800 && code <= 0x28FF) {
      // Braille: 2 columns x 4 rows of dots.
      var bits = code - 0x2800
      var map = [[0, 0, 0x01], [0, 1, 0x02], [0, 2, 0x04], [0, 3, 0x40], [1, 0, 0x08], [1, 1, 0x10], [1, 2, 0x20], [1, 3, 0x80]]
      var dw = w / 2, dh = h / 4
      var r = Math.max(1, Math.min(dw, dh) * 0.42)
      for (var i = 0; i < map.length; i++) {
        if (!(bits & map[i][2])) continue
        var cx = x + (map[i][0] + 0.5) * dw
        var cy = y + (map[i][1] + 0.5) * dh
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      return true
    }
    var half = Math.round(h / 2), halfW = Math.round(w / 2)
    switch (ch) {
    case "█": ctx.fillRect(x, y, w, h); return true
    case "▀": ctx.fillRect(x, y, w, half); return true
    case "▄": ctx.fillRect(x, y + half, w, h - half); return true
    case "▌": ctx.fillRect(x, y, halfW, h); return true
    case "▐": ctx.fillRect(x + halfW, y, w - halfW, h); return true
    case "▘": ctx.fillRect(x, y, halfW, half); return true
    case "▝": ctx.fillRect(x + halfW, y, w - halfW, half); return true
    case "▖": ctx.fillRect(x, y + half, halfW, h - half); return true
    case "▗": ctx.fillRect(x + halfW, y + half, w - halfW, h - half); return true
    case "▚": ctx.fillRect(x, y, halfW, half); ctx.fillRect(x + halfW, y + half, w - halfW, h - half); return true
    case "▞": ctx.fillRect(x + halfW, y, w - halfW, half); ctx.fillRect(x, y + half, halfW, h - half); return true
    case "▙": ctx.fillRect(x, y, halfW, half); ctx.fillRect(x, y + half, w, h - half); return true
    case "▛": ctx.fillRect(x, y, w, half); ctx.fillRect(x, y + half, halfW, h - half); return true
    case "▜": ctx.fillRect(x, y, w, half); ctx.fillRect(x + halfW, y + half, w - halfW, h - half); return true
    case "▟": ctx.fillRect(x + halfW, y, w - halfW, half); ctx.fillRect(x, y + half, w, h - half); return true
    }
    // Lower eighths ▁▂▃▄▅▆▇ (0x2581-0x2587) and left eighths ▏▎▍▌▋▊▉ (0x258F-0x2589).
    if (code >= 0x2581 && code <= 0x2587) { var k = (code - 0x2580) / 8; ctx.fillRect(x, y + Math.round(h * (1 - k)), w, Math.round(h * k)); return true }
    if (code >= 0x2589 && code <= 0x258F) { var kk = (0x2590 - code) / 8; ctx.fillRect(x, y, Math.round(w * kk), h); return true }
    if (ch === "░" || ch === "▒" || ch === "▓") {
      var a = ch === "░" ? 0.25 : (ch === "▒" ? 0.5 : 0.75)
      ctx.globalAlpha = a; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1
      return true
    }
    return false
  }

  // Incremental: a canvas keeps what it has, so an effect step paints only
  // the cells that arrived since the last step (a dense braille piece is tens
  // of thousands of dots — painting it whole every frame would eat half a
  // core). Anything else changing — the art, a colour, the size — marks the
  // layer dirty for one full repaint.
  function paintArt(canvas, ctx, colour) {
    ctx.fillStyle = colour
    ctx.font = root.pixelSize + "px " + root.fontFamily
    ctx.textBaseline = "top"
    if (canvas.dirty) {
      ctx.clearRect(0, 0, root.artW, root.artH)
      canvas.dirty = false
      canvas.painted = 0
      if (!root.progressive) {
        for (var row = 0; row < root.lines.length; row++) {
          var line = root.lines[row]
          for (var col = 0; col < line.length; col++) {
            var ch = line.charAt(col)
            if (!paintCell(ctx, ch, col * root.cellW, row * root.cellH, root.cellW, root.cellH)) ctx.fillText(ch, col * root.cellW, row * root.cellH)
          }
        }
        return
      }
    }
    if (!root.progressive) return
    var list = root.pending
    for (var i = canvas.painted; i < list.length; i++) {
      var cell = list[i]
      if (!paintCell(ctx, cell.ch, cell.c * root.cellW, cell.r * root.cellH, root.cellW, root.cellH)) ctx.fillText(cell.ch, cell.c * root.cellW, cell.r * root.cellH)
    }
    canvas.painted = list.length
  }

  function repaint() {
    fgCanvas.requestPaint()
    if (accentCanvas.visible) accentCanvas.requestPaint()
  }

  function invalidate() {
    fgCanvas.dirty = true
    accentCanvas.dirty = true
    repaint()
  }

  // Cells are whole logical pixels, but the display may be 1.25x: an edge
  // landing between device pixels is antialiased into a hairline seam. Snap
  // the art's origin to the device grid and paint without antialiasing.
  readonly property real dpr: Screen.devicePixelRatio > 0 ? Screen.devicePixelRatio : 1
  function snap(v) { return Math.round(v * root.dpr) / root.dpr }

  // Cells are whole pixels, so a tall piece in a small box (a tile) can still
  // overflow at the smallest cell; the finished layer is then scaled down.
  readonly property real shrink: artW > 0 && artH > 0 ? Math.min(1, (root.width * root.fitWidth) / artW, (root.height * root.fitHeight) / artH) : 1

  Item {
    id: canvasHost
    width: root.artW
    height: root.artH
    x: root.snap((root.width - root.artW) / 2 + root.driftX)
    y: root.snap((root.height - root.artH) / 2 + root.driftY)
    scale: root.shrink
    transformOrigin: Item.Center

    Canvas {
      id: fgCanvas
      anchors.fill: parent
      property bool dirty: true
      property int painted: 0
      antialiasing: false
      smooth: false
      renderStrategy: Canvas.Cooperative
      onPaint: root.paintArt(fgCanvas, getContext("2d"), root.fg)
      opacity: root.pulse ? 1 - root.pulseMix : 1
      // A resized canvas starts blank.
      onWidthChanged: { dirty = true; requestPaint() }
      onHeightChanged: { dirty = true; requestPaint() }
    }

    Canvas {
      id: accentCanvas
      anchors.fill: parent
      property bool dirty: true
      property int painted: 0
      antialiasing: false
      smooth: false
      renderStrategy: Canvas.Cooperative
      visible: root.pulse
      onPaint: root.paintArt(accentCanvas, getContext("2d"), root.pulseTo)
      opacity: root.pulseMix
      onVisibleChanged: if (visible) { dirty = true; requestPaint() }
      onWidthChanged: { dirty = true; requestPaint() }
      onHeightChanged: { dirty = true; requestPaint() }
    }
  }

  onArtChanged: invalidate()
  onProgressiveChanged: invalidate()
  onFgChanged: { fgCanvas.dirty = true; fgCanvas.requestPaint() }
  onPulseToChanged: { accentCanvas.dirty = true; if (accentCanvas.visible) accentCanvas.requestPaint() }
  onArtWChanged: invalidate()
  onArtHChanged: invalidate()
  onFontFamilyChanged: invalidate()
}
