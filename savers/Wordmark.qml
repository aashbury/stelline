import QtQuick
import Quickshell
import Quickshell.Io
import QtQuick.Window
import qs.Commons

// The stock screensaver's subject, drawn natively: the branding ASCII art from
// ~/.config/omarchy/branding/screensaver.txt in the theme's colours, sized to
// the screen, with a few quiet reveal effects. Edits made through
// Style > Screensaver show up live.
//
// Block, quadrant, shade and braille characters are painted as geometry in
// whole-pixel cells rather than set in the font: glyph quads leave hairline
// seams at fractional display scales, cells tile. Anything else falls back to
// the terminal font. The art is painted once per effect step, never per frame;
// the pulse crossfades two cached canvases on the GPU.
Item {
  id: root

  property bool active: false
  property var service: null
  property var settings: ({})

  readonly property color fg: Color.foreground
  readonly property color bg: settings && settings.background === "black" ? "black" : Color.background
  readonly property color accent: Color.accent
  readonly property string fontFamily: Style.font.family

  readonly property string artPath: Quickshell.env("HOME") + "/.config/omarchy/branding/screensaver.txt"
  property string art: ""
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

  // Effects: `reveal` fades the lines in one after another, `typewriter` types
  // the art out, `pulse` breathes the colour toward the accent. `cycle` (the
  // default) rotates through `effects` every `holdSec`. Burn-in drift is a
  // small jump every half minute, always on.
  readonly property var effectList: settings && Array.isArray(settings.effects) && settings.effects.length ? settings.effects : ["reveal", "typewriter", "pulse"]
  readonly property string effectSetting: settings && settings.effect ? String(settings.effect) : "cycle"
  readonly property int holdSec: settings && Number(settings.holdSec) > 0 ? Number(settings.holdSec) : 15
  property int cycleIndex: 0
  readonly property string effect: effectSetting === "cycle" ? effectList[cycleIndex % effectList.length] : effectSetting
  property int revealedLines: 0
  property int typedChars: 0
  property real pulseMix: 0
  property real driftX: 0
  property real driftY: 0

  // Fit: the widest line at 80% of the width, all lines at 60% of the height,
  // whichever binds; then whole-pixel cells from the font's aspect ratio.
  TextMetrics {
    id: probe
    font.family: root.fontFamily
    font.pixelSize: 100
    text: "█"
  }
  readonly property real advanceAt100: Math.max(1, probe.advanceWidth)
  readonly property real lineHeightAt100: Math.max(1, probe.height)
  readonly property int pixelSize: {
    if (root.columns === 0 || root.lines.length === 0 || root.width === 0) return 24
    var byWidth = (root.width * 0.8) / (root.columns * root.advanceAt100 / 100)
    var byHeight = (root.height * 0.6) / (root.lines.length * root.lineHeightAt100 / 100)
    return Math.max(8, Math.floor(Math.min(byWidth, byHeight)))
  }
  readonly property int cellW: Math.max(1, Math.round(root.pixelSize * root.advanceAt100 / 100))
  readonly property int cellH: Math.max(1, Math.round(root.pixelSize * root.lineHeightAt100 / 100))
  readonly property int artW: root.columns * root.cellW
  readonly property int artH: root.lines.length * root.cellH

  FileView {
    id: artFile
    path: root.artPath
    watchChanges: true
    printErrors: false
    onLoaded: root.art = text()
    onFileChanged: reload()
    onLoadFailed: root.art = ""
  }

  function restartEffect() {
    revealedLines = 0
    typedChars = 0
    pulseMix = 0
    revealTimer.restart()
    typeTimer.restart()
  }

  onActiveChanged: if (active) { cycleIndex = 0; driftX = 0; driftY = 0; restartEffect() }
  onEffectChanged: if (active) restartEffect()
  Component.onCompleted: if (active) restartEffect()

  Timer {
    interval: root.holdSec * 1000
    repeat: true
    running: root.active && root.effectSetting === "cycle" && root.effectList.length > 1
    onTriggered: root.cycleIndex = (root.cycleIndex + 1) % root.effectList.length
  }

  Timer {
    id: revealTimer
    interval: 140
    repeat: true
    running: root.active && root.effect === "reveal" && root.revealedLines < root.lines.length
    onTriggered: root.revealedLines += 1
  }

  Timer {
    id: typeTimer
    interval: 50
    repeat: true
    running: root.active && root.effect === "typewriter" && root.typedChars < root.totalChars
    onTriggered: root.typedChars = Math.min(root.totalChars, root.typedChars + Math.max(4, Math.ceil(root.totalChars / 60)))
  }

  Timer {
    interval: 30000
    repeat: true
    running: root.active
    onTriggered: {
      root.driftX = Math.round((Math.random() * 2 - 1) * root.width * 0.03)
      root.driftY = Math.round((Math.random() * 2 - 1) * root.height * 0.03)
    }
  }

  SequentialAnimation on pulseMix {
    running: root.active && root.effect === "pulse"
    loops: Animation.Infinite
    NumberAnimation { to: 1; duration: 3000; easing.type: Easing.InOutSine }
    NumberAnimation { to: 0; duration: 3000; easing.type: Easing.InOutSine }
  }

  // How much of the art the current effect step shows.
  readonly property int visibleLines: effect === "reveal" ? revealedLines : lines.length
  readonly property int visibleChars: effect === "typewriter" ? typedChars : totalChars

  // Cell painter. Returns true when the character was drawn as geometry.
  function paintCell(ctx, ch, x, y, w, h) {
    var code = ch.charCodeAt(0)
    if (ch === " " || ch === "\t") return true
    if (code >= 0x2800 && code <= 0x28FF) {
      // Braille: 2 columns x 4 rows of dots.
      var bits = code - 0x2800
      var map = [[0, 0, 0x01], [0, 1, 0x02], [0, 2, 0x04], [0, 3, 0x40], [1, 0, 0x08], [1, 1, 0x10], [1, 2, 0x20], [1, 3, 0x80]]
      var r = Math.max(1, Math.min(w / 2, h / 4) * 0.42)
      for (var i = 0; i < map.length; i++) {
        if (!(bits & map[i][2])) continue
        var cx = x + (map[i][0] + 0.5) * (w / 2)
        var cy = y + (map[i][1] + 0.5) * (h / 4)
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

  function paintArt(ctx, colour) {
    ctx.clearRect(0, 0, root.artW, root.artH)
    ctx.fillStyle = colour
    ctx.font = root.pixelSize + "px " + root.fontFamily
    ctx.textBaseline = "top"
    var consumed = 0
    for (var row = 0; row < root.lines.length && row < root.visibleLines; row++) {
      var line = root.lines[row]
      for (var col = 0; col < line.length; col++) {
        if (consumed + col >= root.visibleChars) break
        var ch = line.charAt(col)
        var x = col * root.cellW, y = row * root.cellH
        if (!paintCell(ctx, ch, x, y, root.cellW, root.cellH)) ctx.fillText(ch, x, y)
      }
      consumed += line.length + 1
    }
  }

  // Cells are whole logical pixels, but the display is 1.25x: an edge landing
  // between device pixels is antialiased into a hairline seam. Snap the art's
  // origin to the device grid and paint without antialiasing.
  readonly property real dpr: Screen.devicePixelRatio > 0 ? Screen.devicePixelRatio : 1
  function snap(v) { return Math.round(v * root.dpr) / root.dpr }

  Item {
    id: canvasHost
    width: root.artW
    height: root.artH
    x: root.snap((root.width - root.artW) / 2 + root.driftX)
    y: root.snap((root.height - root.artH) / 2 + root.driftY)

    Canvas {
      id: fgCanvas
      anchors.fill: parent
      antialiasing: false
      smooth: false
      renderStrategy: Canvas.Cooperative
      onPaint: root.paintArt(getContext("2d"), root.fg)
      opacity: 1 - root.pulseMix
    }

    Canvas {
      id: accentCanvas
      anchors.fill: parent
      antialiasing: false
      smooth: false
      renderStrategy: Canvas.Cooperative
      visible: root.effect === "pulse"
      onPaint: root.paintArt(getContext("2d"), root.accent)
      opacity: root.pulseMix
    }

    // Any change to what is shown or which colours are in force repaints
    // both layers — a handful of times per effect step, not per frame.
    Connections {
      target: root
      function onVisibleLinesChanged() { fgCanvas.requestPaint(); if (accentCanvas.visible) accentCanvas.requestPaint() }
      function onVisibleCharsChanged() { fgCanvas.requestPaint(); if (accentCanvas.visible) accentCanvas.requestPaint() }
      function onEffectChanged() { if (accentCanvas.visible) accentCanvas.requestPaint() }
      function onFgChanged() { fgCanvas.requestPaint() }
      function onAccentChanged() { accentCanvas.requestPaint() }
      function onArtWChanged() { fgCanvas.requestPaint(); accentCanvas.requestPaint() }
      function onArtHChanged() { fgCanvas.requestPaint(); accentCanvas.requestPaint() }
      function onLinesChanged() { fgCanvas.requestPaint(); accentCanvas.requestPaint() }
    }
  }
}
