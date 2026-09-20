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
  property var series: ({})

  readonly property string kind: series && series.kind === "image" ? "image" : "ascii"
  readonly property string play: settings && settings.play ? String(settings.play) : (series && series.play ? String(series.play) : "slideshow")
  readonly property int dwellSec: settings && Number(settings.dwellSec) > 0 ? Number(settings.dwellSec) : (series && Number(series.dwellSec) > 0 ? Number(series.dwellSec) : 12)
  readonly property int fpsSetting: settings && Number(settings.fps) > 0 ? Number(settings.fps) : (series && Number(series.fps) > 0 ? Number(series.fps) : 10)
  readonly property bool onBattery: service && service.onBattery === true
  readonly property int fps: Math.max(1, Math.min(30, onBattery ? Math.round(fpsSetting / 2) : fpsSetting))
  readonly property string effectSetting: settings && settings.effect ? String(settings.effect) : "cycle"
  readonly property bool shuffleOrder: settings && settings.order === "shuffle"
  readonly property string fit: settings && settings.fit ? String(settings.fit) : "contain"
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
  }
  readonly property int frameCount: frames.length
  readonly property string frame: frameCount > 0 ? frames[Math.min(index, frameCount - 1)] : ""
  readonly property bool animating: play === "animation" && frameCount > 1

  function nextIndex(count) {
    if (count <= 1) return 0
    if (!root.shuffleOrder || root.animating) return (root.index + 1) % count
    var n = Math.floor(Math.random() * (count - 1))
    return n >= root.index ? n + 1 : n
  }

  function loadFrames() {
    if (root.kind !== "ascii") return
    if (root.thumbnail) { root.frames = root.series && root.series.thumbArt ? [String(root.series.thumbArt)] : []; return }
    if (root.pieces.length === 0) { root.frames = []; return }
    var cmd = root.pieces.map(function(p) { return "cat " + M.shellQuote(p) + " 2>/dev/null; printf '\\f'" }).join("; ")
    reader.command = ["bash", "-c", cmd]
    reader.running = true
  }

  Process {
    id: reader
    stdout: StdioCollector {
      onStreamFinished: {
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

  // Slideshow: every piece for dwellSec, a different effect each time.
  Timer {
    interval: root.dwellSec * 1000
    repeat: true
    running: root.running && root.kind === "ascii" && !root.animating && root.frameCount > 1
    onTriggered: {
      root.index = root.nextIndex(root.frameCount)
      root.nextEffect()
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

  // A slideshow piece: effects, painted a few times per piece.
  AsciiShow {
    anchors.fill: parent
    visible: root.kind === "ascii" && !root.animating
    art: visible ? root.frame : ""
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
    art: visible ? root.frame : ""
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
      width: parent.width
      height: parent.height
      visible: !slot.animated
      source: slot.animated ? "" : picture.source
      sourceSize: Qt.size(Math.round(root.width * 1.2), Math.round(root.height * 1.2))
      scale: slot.zoom
      fillMode: root.fit === "cover" ? Image.PreserveAspectCrop : Image.PreserveAspectFit
      asynchronous: true
      cache: false
      smooth: true
      mipmap: true
    }
    AnimatedImage {
      id: picture
      anchors.centerIn: parent
      width: parent.width
      height: parent.height
      visible: slot.animated
      scale: slot.zoom
      fillMode: root.fit === "cover" ? Image.PreserveAspectCrop : Image.PreserveAspectFit
      asynchronous: true
      cache: false
      smooth: true
      playing: root.running && slot.visible && slot.animated
    }
  }

  Slot { id: slotA }
  Slot { id: slotB }

  // The tile: one picture, decoded small, never animated.
  Image {
    anchors.fill: parent
    visible: root.thumbnail && root.kind === "image"
    source: visible && root.series && root.series.thumbImage ? "file://" + root.series.thumbImage : ""
    sourceSize: Qt.size(320, 180)
    fillMode: Image.PreserveAspectCrop
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
