import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "../StellineModel.js" as M
import "Effects.js" as E

// A user saver: the pieces in one folder under ~/.config/omarchy/stelline/savers.
// ASCII pieces play as a slideshow (each with a quiet effect) or, frame by
// frame, as an animation; pictures crossfade with a slow drift, and an
// animated picture just plays. The content is read when the saver comes up
// and dropped when it goes away, so a long animation costs nothing while idle.
Item {
  id: root

  property bool active: false
  property bool thumbnail: false
  property var service: null
  property var settings: ({})
  // The share of the width the art may take, set by the scene so it keeps
  // out from under the corner widgets; the art stays centred.
  property real artRoom: 1
  // S, M and L keep clear of the corner widgets; Full and Fill take the
  // whole screen, and the cards sit on top of it, as they do on a photo.
  readonly property bool wholeScreen: size.key === "full" || size.key === "fill"
  readonly property real room: wholeScreen ? 1 : artRoom
  property var series: ({})

  readonly property string kind: series && series.kind === "image" ? "image" : "ascii"
  readonly property string play: settings && settings.play ? String(settings.play) : (series && series.play ? String(series.play) : "slideshow")
  readonly property int dwellSec: settings && Number(settings.dwellSec) > 0 ? Number(settings.dwellSec) : (series && Number(series.dwellSec) > 0 ? Number(series.dwellSec) : 12)
  readonly property int fpsSetting: settings && Number(settings.fps) > 0 ? Number(settings.fps) : (series && Number(series.fps) > 0 ? Number(series.fps) : 10)
  readonly property bool onBattery: service && service.onBattery === true
  readonly property int fps: Math.max(1, Math.min(30, onBattery ? Math.round(fpsSetting / 2) : fpsSetting))
  // One effect pinned; one that has since been retired means cycle again.
  readonly property string effectSetting: settings && settings.effect && (E.EFFECTS.indexOf(String(settings.effect)) !== -1 || settings.effect === "none") ? String(settings.effect) : "cycle"
  readonly property bool shuffleOrder: settings && settings.order === "shuffle"
  // How much of the screen the picture or the art takes: a box centred on
  // the screen it fits inside whole, or — Fill — the whole screen, cropped.
  readonly property var size: M.pictureSize(settings, kind)
  // A slow push-in on stills is opt-in: it re-renders the screen every frame.
  readonly property bool motion: !!settings && settings.motion === "zoom"
  readonly property string background: settings && settings.background ? String(settings.background) : (kind === "image" ? "black" : "theme")
  readonly property color bg: background === "black" ? "black" : Color.background
  readonly property color fg: Color.foreground
  readonly property color accent: Color.accent

  readonly property var pieces: series && Array.isArray(series.pieces) ? series.pieces : []
  readonly property bool running: active && !thumbnail

  // ---- ASCII: the frames of every piece, in order ----
  property var frames: []
  property int index: 0
  readonly property var effectList: settings && Array.isArray(settings.effects) && settings.effects.length ? settings.effects : E.EFFECTS
  property string cycled: ""
  readonly property string effect: effectSetting === "cycle" ? cycled : effectSetting
  function nextEffect() {
    var next = E.pick(root.effectList)
    if (next === root.cycled && root.effectList.length > 1) next = E.pick(root.effectList)
    root.cycled = next
    // Something quiet has to keep going while the art rests, or a saver is
    // a still picture for as long as the rest lasts. Only the ambients that
    // light the art rather than replace it: dots have no spare glyphs.
    root.ambient = E.pick(E.STEADY_AMBIENTS)
  }
  property string ambient: ""
  readonly property int frameCount: frames.length
  readonly property string frame: frameCount > 0 ? frames[Math.min(index, frameCount - 1)] : ""
  readonly property bool animating: play === "animation" && frameCount > 1
  // A still is painted by AsciiArt, which draws a block on the dot grid
  // itself. An animation is swapped frame by frame as text — a canvas
  // repaint per frame costs three times as much — and text draws whatever
  // glyph it is handed, so the blocks are swapped for the braille cells
  // holding the same dots. Done once on load, never per frame. Anything
  // that is not a block, braille included, passes through untouched.
  readonly property var dotFrames: animating ? frames.map(function(f) { return M.blocksToBraille(f) }) : []
  readonly property string dotFrame: dotFrames.length > 0 ? dotFrames[Math.min(index, dotFrames.length - 1)] : ""
  // Every frame on the grid of the largest, so the picture holds still.
  readonly property var grid: animating ? M.frameGrid(frames) : ({ columns: 0, rows: 0 })

  function nextIndex(count) {
    if (count <= 1) return 0
    if (!root.shuffleOrder || root.animating) return (root.index + 1) % count
    var n = Math.floor(Math.random() * (count - 1))
    return n >= root.index ? n + 1 : n
  }

  // Deferred a tick: properties set one after another from a Loader (or an
  // instance declaration, literals before bindings) must all be in place
  // before deciding between the thumbnail frame and the real pieces.
  function loadFrames() { Qt.callLater(root.loadFramesNow) }

  function loadFramesNow() {
    if (root.kind !== "ascii") return
    if (root.thumbnail) { root.frames = root.series && root.series.thumbArt ? [String(root.series.thumbArt)] : []; return }
    if (!root.active) return
    if (root.pieces.length === 0) { root.frames = []; return }
    var cmd = root.pieces.map(function(p) { return "cat " + M.shellQuote(p) + " 2>/dev/null; printf '\\f'" }).join("; ")
    reader.command = ["bash", "-c", cmd]
    reader.running = true
  }

  Process {
    id: reader
    stdout: StdioCollector {
      onStreamFinished: {
        // A thumbnail never shows the pieces, whatever was read on its behalf.
        if (root.thumbnail || !root.active) return
        root.frames = M.splitFrames(String(text || ""))
        root.index = 0
      }
    }
  }

  onActiveChanged: {
    if (active) { index = 0; nextEffect(); driftX = 0; driftY = 0; loadFrames(); pictureIndex = 0; if (kind === "image") showPicture(0, false) }
    else if (!thumbnail) frames = []
  }
  onThumbnailChanged: if (active) loadFrames()
  onSeriesChanged: if (active) { loadFrames(); if (kind === "image") showPicture(0, false) }
  Component.onCompleted: { nextEffect(); if (active) { loadFrames(); if (kind === "image") showPicture(0, false) } }

  // Slideshow: every piece for dwellSec, a different effect each time. One
  // piece cycles back to itself — the dots go off and come back on another
  // way, which is the whole point of a saver made of dots. The token is what
  // replays it when the effect that comes round is the one already showing.
  //
  // Unlike the Wordmark, pinning a single effect here does not stop the
  // cycle: pinning chooses which effect plays, not whether it repeats.
  property int token: 0
  readonly property var playable: effectSetting === "cycle" ? effectList : [effectSetting]
  // Nothing to arrive from: `pulse` shows the piece whole and breathes its
  // colour, so a saver with only that to play never departs.
  readonly property bool cycling: running && !thumbnail && !E.onlyPulse(playable)
  Timer {
    interval: root.dwellSec * 1000
    repeat: true
    running: root.cycling && root.kind === "ascii" && !root.animating && root.frameCount > 0
    onTriggered: {
      root.index = root.nextIndex(root.frameCount)
      root.nextEffect()
      root.token++
    }
  }

  // Animation: frames at fps, halved on battery.
  Timer {
    interval: Math.round(1000 / root.fps)
    repeat: true
    running: root.running && root.kind === "ascii" && root.animating
    onTriggered: root.index = (root.index + 1) % root.frameCount
  }

  property real driftX: 0
  property real driftY: 0
  Timer {
    interval: 30000
    repeat: true
    running: root.running && root.kind === "ascii"
    onTriggered: {
      root.driftX = Math.round((Math.random() * 2 - 1) * root.width * 0.03)
      root.driftY = Math.round((Math.random() * 2 - 1) * root.height * 0.03)
    }
  }

  // A slideshow piece: effects, painted a few times per piece. A piece of
  // its own gets most of the screen — the art is the saver, not a caption
  // in the middle of one — with just enough margin for what an arrival
  // throws in from outside the grid.
  AsciiShow {
    anchors.fill: parent
    visible: root.kind === "ascii" && !root.animating
    art: visible ? root.frame : ""
    cycleToken: root.token
    // S, M and L are shares of the centred width the widgets leave, so each
    // one is bigger than the last whatever sits in the corners; Full is the
    // screen. Always centred.
    fitWidth: root.size.w * root.room
    fitHeight: root.size.h * (root.thumbnail ? 0.8 : 1)
    cover: root.size.crop
    ambientStyle: root.thumbnail ? "" : root.ambient
    effect: root.thumbnail ? "none" : root.effect
    active: root.running && visible
    fg: root.fg
    accent: root.accent
    driftX: root.driftX
    driftY: root.driftY
  }

  // An animation frame: one Text item, swapped at fps — the glyph cache makes
  // that far cheaper than painting cells (a canvas repaint per frame cost
  // three times as much).
  AsciiText {
    anchors.fill: parent
    visible: root.kind === "ascii" && root.animating
    // A frame at L fills a little more than a still does; the other sizes
    // follow it.
    fitWidth: Math.min(0.95, root.size.w * 1.125) * root.room
    fitHeight: Math.min(0.9, root.size.h * 1.13)
    cover: root.size.crop
    art: visible ? root.dotFrame : ""
    gridColumns: root.grid.columns
    gridRows: root.grid.rows
    fg: root.fg
    driftX: root.driftX
    driftY: root.driftY
  }

  // ---- pictures ----
  property int pictureIndex: 0
  property bool frontIsA: true

  function pictureUrl(i) {
    if (i < 0 || i >= root.pieces.length) return ""
    return "file://" + root.pieces[i]
  }

  function showPicture(i, animate) {
    if (root.kind !== "image") return
    root.pictureIndex = i
    var incoming = root.frontIsA ? slotB : slotA
    var outgoing = root.frontIsA ? slotA : slotB
    incoming.source = pictureUrl(i)
    incoming.zoom = 1
    if (!animate) {
      outgoing.opacity = 0
      incoming.opacity = 1
      root.frontIsA = !root.frontIsA
      return
    }
    crossfade.stop()
    crossfade.outgoing = outgoing
    crossfade.incoming = incoming
    crossfade.start()
    root.frontIsA = !root.frontIsA
  }

  Timer {
    interval: root.dwellSec * 1000
    repeat: true
    running: root.running && root.kind === "image" && root.pieces.length > 1
    onTriggered: root.showPicture(root.nextIndex(root.pieces.length), true)
  }

  ParallelAnimation {
    id: crossfade
    property var outgoing: null
    property var incoming: null
    NumberAnimation { target: crossfade.incoming; property: "opacity"; to: 1; duration: 1400; easing.type: Easing.InOutSine }
    NumberAnimation { target: crossfade.outgoing; property: "opacity"; to: 0; duration: 1400; easing.type: Easing.InOutSine }
  }

  component Slot: Item {
    id: slot
    property alias source: picture.source
    property real zoom: 1
    anchors.fill: parent
    opacity: 0
    visible: opacity > 0 && root.kind === "image"
    // A slow push-in over the dwell keeps a still photo from burning in.
    NumberAnimation on zoom {
      running: slot.visible && root.running && root.motion && !root.thumbnail
      from: 1
      to: 1.06
      duration: Math.max(4000, root.dwellSec * 1000 + 1400)
      easing.type: Easing.Linear
    }
    readonly property bool animated: M.extensionOf(String(source)) === "gif"
    Image {
      anchors.centerIn: parent
      width: parent.width * root.size.w
      height: parent.height * root.size.h
      visible: !slot.animated
      source: slot.animated ? "" : picture.source
      sourceSize: Qt.size(Math.round(root.width * 1.2), Math.round(root.height * 1.2))
      scale: slot.zoom
      fillMode: root.size.crop ? Image.PreserveAspectCrop : Image.PreserveAspectFit
      asynchronous: true
      cache: false
      smooth: true
      mipmap: true
    }
    AnimatedImage {
      id: picture
      anchors.centerIn: parent
      width: parent.width * root.size.w
      height: parent.height * root.size.h
      visible: slot.animated
      scale: slot.zoom
      fillMode: root.size.crop ? Image.PreserveAspectCrop : Image.PreserveAspectFit
      asynchronous: true
      cache: false
      smooth: true
      playing: root.running && slot.visible && slot.animated
    }
  }

  Slot { id: slotA }
  Slot { id: slotB }

  // The tile: one picture, decoded small, never animated — at the size it
  // plays, so the tile shows what the screen will.
  Image {
    anchors.centerIn: parent
    width: parent.width * root.size.w
    height: parent.height * root.size.h
    visible: root.thumbnail && root.kind === "image"
    source: visible && root.series && root.series.thumbImage ? "file://" + root.series.thumbImage : ""
    sourceSize: Qt.size(320, 180)
    fillMode: root.size.crop ? Image.PreserveAspectCrop : Image.PreserveAspectFit
    asynchronous: true
    smooth: true
  }

  Text {
    anchors.centerIn: parent
    visible: (root.kind === "ascii" && root.frameCount === 0 && !reader.running) || (root.kind === "image" && root.pieces.length === 0)
    textFormat: Text.PlainText
    text: root.thumbnail ? "" : "Nothing to show — this saver's folder is empty"
    color: Color.muted
    font.family: Style.font.family
    font.pixelSize: Style.font.title
  }
}
