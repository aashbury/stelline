import QtQuick
import qs.Commons
import "Effects.js" as E

// One piece of text art with an entrance effect in the spirit of the stock
// ttfx screensaver: decrypt, rain, beams, scatter, wipe, typewriter, reveal;
// `pulse` shows it at once and breathes the colour toward the accent; `none`
// just shows it. Resolved cells are painted once into the cached canvas; the
// glyphs still in flight are one text overlay in a second colour, aligned to
// the same grid — so a frame is a few thousand array writes and one text
// layout, and once the effect lands the piece costs nothing at all.
//
// That second colour is the theme's accent, except that plenty of Omarchy
// themes set the accent to the foreground — on those the motion would be one
// flat colour, so the muted tone stands in and the animation still reads.
Item {
  id: root

  property string art: ""
  property string effect: "decrypt"
  property bool active: false
  property color fg: Color.foreground
  property color accent: Color.accent
  property string fontFamily: Style.font.family
  property real fitWidth: 0.8
  property real fitHeight: 0.6
  property real driftX: 0
  property real driftY: 0
  property int fps: 15

  property color muted: Color.muted
  readonly property bool accentShows: Math.abs(accent.r - fg.r) + Math.abs(accent.g - fg.g) + Math.abs(accent.b - fg.b) > 0.12
  readonly property color trail: accentShows ? accent : muted

  readonly property bool entrance: E.EFFECTS.indexOf(effect) !== -1 && effect !== "pulse"
  property var plan: null
  property double startedAt: 0
  property string overlay: ""
  property bool running: false
  property real pulseMix: 0

  // Planned from this item's own art: when `art` changes, the painter's copy
  // of it may not have updated yet.
  function restart() {
    root.pulseMix = 0
    root.overlay = ""
    var lines = root.art === "" ? [] : root.art.replace(/\s+$/, "").split("\n")
    if (!root.entrance || lines.length === 0) {
      root.plan = null
      root.running = false
      view.progressive = false
      view.invalidate()
      return
    }
    view.progressive = true
    view.reset()
    root.plan = E.plan(root.effect, lines, Date.now() % 100000)
    root.startedAt = Date.now()
    root.running = true
    step()
  }

  function step() {
    if (!root.plan) return
    var f = E.frame(root.plan, Date.now() - root.startedAt)
    if (f.resolved.length) view.resolve(f.resolved)
    root.overlay = f.overlay
    if (f.done) { root.running = false; root.overlay = "" }
  }

  onActiveChanged: if (active) restart(); else { running = false; overlay = "" }
  onArtChanged: if (active) restart()
  onEffectChanged: if (active) restart()
  Component.onCompleted: if (active) restart()

  Timer {
    interval: Math.round(1000 / Math.max(5, Math.min(30, root.fps)))
    repeat: true
    running: root.active && root.running
    onTriggered: root.step()
  }

  SequentialAnimation on pulseMix {
    running: root.active && root.effect === "pulse"
    loops: Animation.Infinite
    NumberAnimation { to: 1; duration: 3000; easing.type: Easing.InOutSine }
    NumberAnimation { to: 0; duration: 3000; easing.type: Easing.InOutSine }
  }

  AsciiArt {
    id: view
    anchors.fill: parent
    art: root.art
    fg: root.fg
    accent: root.accent
    fontFamily: root.fontFamily
    fitWidth: root.fitWidth
    fitHeight: root.fitHeight
    driftX: root.driftX
    driftY: root.driftY
    pulse: root.effect === "pulse"
    pulseMix: root.pulseMix
  }

  // In-flight glyphs on the same grid: the font's advance is padded out to
  // the cell width and lines are fixed to the cell height, so column 120 of
  // the overlay sits over column 120 of the canvas.
  Text {
    x: view.artX
    y: view.artY
    visible: root.overlay !== ""
    textFormat: Text.PlainText
    renderType: Text.NativeRendering
    text: root.overlay
    color: root.trail
    font.family: root.fontFamily
    font.pixelSize: view.pixelSize
    font.letterSpacing: view.cellW - view.advance
    lineHeightMode: Text.FixedHeight
    lineHeight: view.cellH
  }
}
