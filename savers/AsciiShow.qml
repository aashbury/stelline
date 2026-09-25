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
  // Cover the screen, cutting off what overflows, instead of fitting in it.
  property bool cover: false
  property real driftX: 0
  property real driftY: 0
  property int fps: 15

  // The cycle: the art arrives, lives (a cheap band rolling over it, so the
  // screen is never a still picture), then departs. `cycleToken` forces a
  // replay even when the same effect comes round again.
  property string ambientStyle: ""
  property int cycleToken: 0
  property string phase: "in"
  signal exitFinished()

  property var ambientPlan: null
  property double ambientAt: 0

  // An effect may draw outside the word — a beam crossing the dark, rain
  // falling past it — so the frame carries a margin and the overlay is shifted
  // back by it to keep the letters over their own cells.
  readonly property var livePlan: plan ? plan : ambientPlan
  readonly property int padR: livePlan && livePlan.padR ? livePlan.padR : 0
  readonly property int padC: livePlan && livePlan.padC ? livePlan.padC : 0

  property color muted: Color.muted
  readonly property bool accentShows: Math.abs(accent.r - fg.r) + Math.abs(accent.g - fg.g) + Math.abs(accent.b - fg.b) > 0.12
  readonly property color trail: accentShows ? accent : muted

  readonly property bool entrance: E.EFFECTS.indexOf(effect) !== -1 && effect !== "pulse"
  property var plan: null
  property double startedAt: 0
  property string overlay: ""
  property string hotOverlay: ""
  property string dimOverlay: ""
  property bool running: false
  property real pulseMix: 0
  readonly property bool ticking: running || (phase === "live" && ambientPlan !== null)

  // Planned from this item's own art: when `art` changes, the painter's copy
  // of it may not have updated yet.
  function artLines() { return root.art === "" ? [] : root.art.replace(/\s+$/, "").split("\n") }
  function clearOverlays() {
    root.overlay = ""; root.hotOverlay = ""; root.dimOverlay = ""; root.offsets = [0, 0, 0]
    root.fieldLayers = null
  }
  // Each level carries its own left edge in columns, so a narrow effect lays
  // out narrow text wherever it happens to be on screen.
  property var offsets: [0, 0, 0]
  function show(f) {
    root.overlay = f.overlay; root.hotOverlay = f.hot; root.dimOverlay = f.dim
    root.offsets = f.offset ? f.offset : [0, 0, 0]
    root.fieldLayers = f.field ? f.field : null
  }

  // Weather has a grid of its own: the whole of this item, at the text size
  // the art would have at Full, so a small piece still gets rain across the
  // screen in drops of the usual size. The plan is told where the art sits on
  // it, measured off the painter — scale and all — so the letters it lights
  // or drops land on their own dots.
  property var fieldGeo: null
  property var fieldLayers: null
  function fieldGeometry() {
    if (root.width <= 0 || root.height <= 0 || view.columns === 0) return null
    var px = view.fullPixelSize
    var cw = Math.max(1, Math.round(px * view.advanceAt100 / 100))
    var ch = Math.max(1, Math.round(px * view.lineHeightAt100 / 100))
    var sx = view.shrink * view.aspectFix, sy = view.shrink
    var ax = view.artX + view.artW * (1 - sx) / 2
    var ay = view.artY + view.artH * (1 - sy) / 2
    return { cols: Math.ceil(root.width / cw), rows: Math.ceil(root.height / ch), c0: ax / cw, r0: ay / ch,
             sc: view.cellW * sx / cw, sr: view.cellH * sy / ch, cellW: cw, cellH: ch, pixelSize: px }
  }

  function restart() {
    root.pulseMix = 0
    root.phase = "in"
    clearOverlays()
    var lines = artLines()
    if (!root.entrance || lines.length === 0) {
      root.plan = null
      root.running = false
      view.progressive = false
      view.invalidate()
      beginAmbient()
      return
    }
    // The painter lays the art out from its own copy; the field is measured
    // off that, so wait for it to catch up with a new piece.
    if (view.art !== root.art) { Qt.callLater(root.restart); return }
    view.progressive = true
    view.reset()
    root.fieldGeo = E.FIELD_EFFECTS.indexOf(root.effect) !== -1 ? fieldGeometry() : null
    root.plan = E.plan(root.effect, lines, Date.now() % 100000, root.fieldGeo)
    root.startedAt = Date.now()
    root.running = true
    step()
  }

  // The art goes again. Everything is drawn in the overlay for this, because
  // the cached canvas can only ever be added to.
  function playExit(style) {
    var lines = artLines()
    if (lines.length === 0) { root.exitFinished(); return }
    root.phase = "out"
    root.ambientPlan = null
    view.progressive = true
    view.reset()
    root.plan = E.planExit(style, lines, Date.now() % 100000)
    root.startedAt = Date.now()
    root.running = true
    step()
  }

  function beginAmbient() {
    root.phase = "live"
    // The arrival is over; keep stepping it and it re-seeds the ambient on
    // every tick, which is a resting layer that never actually moves.
    root.plan = null
    clearOverlays()
    var lines = artLines()
    root.ambientPlan = (root.ambientStyle === "" || lines.length === 0) ? null : E.planAmbient(root.ambientStyle, lines, Date.now() % 100000)
    root.ambientAt = Date.now()
  }

  function step() {
    if (root.plan) {
      var f = E.frame(root.plan, Date.now() - root.startedAt)
      if (f.resolved.length) view.resolve(f.resolved)
      show(f)
      if (f.done) {
        root.running = false
        clearOverlays()
        if (root.phase === "out") { root.plan = null; root.exitFinished() }
        else beginAmbient()
      }
      return
    }
    if (root.phase === "live" && root.ambientPlan) show(E.ambientFrame(root.ambientPlan, Date.now() - root.ambientAt))
  }

  onCycleTokenChanged: if (active) restart()
  onActiveChanged: if (active) restart(); else { running = false; plan = null; ambientPlan = null; clearOverlays() }
  onArtChanged: if (active) restart()
  onEffectChanged: if (active) restart()
  Component.onCompleted: if (active) restart()

  Timer {
    // The resting art does not need the frame rate an arrival does.
    // An effect that covers the whole screen asks for a gentler rate than one
    // that only touches the letters.
    readonly property int rate: root.plan && root.plan.fps ? root.plan.fps : root.fps
    interval: root.phase === "live" ? 110 : Math.round(1000 / Math.max(5, Math.min(30, rate)))
    repeat: true
    running: root.active && root.ticking
    onTriggered: root.step()
  }

  SequentialAnimation on pulseMix {
    running: root.active && root.effect === "pulse"
    loops: Animation.Infinite
    NumberAnimation { to: 1; duration: 3000; easing.type: Easing.InOutSine }
    NumberAnimation { to: 0; duration: 3000; easing.type: Easing.InOutSine }
  }

  // The weather, behind the art: rain passes behind a letter that has landed.
  Item {
    visible: root.fieldLayers !== null && root.fieldGeo !== null
    Repeater {
      model: 3
      Text {
        required property int index
        readonly property var g: root.fieldGeo
        readonly property string body: !root.fieldLayers ? "" : (index === 0 ? root.fieldLayers.dim : (index === 1 ? root.fieldLayers.overlay : root.fieldLayers.hot))
        x: g && root.fieldLayers ? (root.fieldLayers.offset[index] || 0) * g.cellW : 0
        y: 0
        visible: body !== "" && !!g
        textFormat: Text.PlainText
        renderType: Text.NativeRendering
        text: body
        color: index === 0 ? Qt.darker(root.trail, 1.9) : (index === 1 ? root.trail : Qt.lighter(root.fg, 1.25))
        font.family: root.fontFamily
        font.pixelSize: g ? g.pixelSize : 12
        font.letterSpacing: g ? g.cellW - g.pixelSize * view.advanceAt100 / 100 : 0
        lineHeightMode: Text.FixedHeight
        lineHeight: g ? g.cellH : 12
      }
    }
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
    cover: root.cover
    driftX: root.driftX
    driftY: root.driftY
    pulse: root.effect === "pulse"
    pulseMix: root.pulseMix
  }

  // In-flight glyphs on the same grid: the font's advance is padded out to
  // the cell width and lines are fixed to the cell height, so column 120 of
  // the overlay sits over column 120 of the canvas.
  // The painter fits the art by scaling its canvas, so the overlay has to sit
  // under exactly the same transform or the glyphs still in flight drift off
  // the letters they are meant to be landing on — further off the further
  // right and further down they are.
  Item {
    x: view.artX
    y: view.artY
    width: view.artW
    height: view.artH
    transform: Scale {
      origin.x: view.artW / 2
      origin.y: view.artH / 2
      xScale: view.shrink * view.aspectFix
      yScale: view.shrink
    }

    Repeater {
      model: 3
      Text {
        required property int index
        readonly property string body: index === 0 ? root.dimOverlay : (index === 1 ? root.overlay : root.hotOverlay)
        x: (root.offsets[index] || 0) * view.cellW
        y: -root.padR * view.cellH
        visible: body !== ""
        textFormat: Text.PlainText
        renderType: Text.NativeRendering
        text: body
        color: index === 0 ? Qt.darker(root.trail, 1.9) : (index === 1 ? root.trail : Qt.lighter(root.fg, 1.25))
        font.family: root.fontFamily
        font.pixelSize: view.pixelSize
        font.letterSpacing: view.cellW - view.advance
        lineHeightMode: Text.FixedHeight
        lineHeight: view.cellH
      }
    }
  }
}
