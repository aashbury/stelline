import QtQuick
import Quickshell.Io
import qs.Commons
import "Effects.js" as E
import "../StellineModel.js" as M

// A wordmark: a word, drawn big in the theme's colours with a reveal effect.
// The word is a setting — type another one in the saver's gear — and the
// block art beside it is a cache the service rebuilds. Clear the word and it
// falls back to Omarchy's shared artwork, the same file the Original plays,
// so nothing that lived in Style > Screensaver is lost. Edits either way show
// up live.
Item {
  id: root

  property bool active: false
  property bool thumbnail: false
  property var service: null
  property var settings: ({})

  readonly property color fg: Color.foreground
  readonly property color bg: settings && settings.background === "black" ? "black" : Color.background
  readonly property color accent: Color.accent

  // The host names which wordmark this is; the art cache is derived from it.
  // Empty (the Original's tile borrows this renderer) means: just the branding.
  property string wordmarkId: ""
  property string fallbackArt: ""
  readonly property string word: wordmarkId === "" ? "" : String(settings && settings.text !== undefined ? settings.text : M.DEFAULT_WORDMARK)
  readonly property bool usesText: word.trim() !== ""
  // Where the service keeps both; a saver is always drawn with one.
  readonly property string brandingPath: service ? String(service.brandingPath) : ""
  readonly property string textArtPath: usesText && service ? String(service.wordmarkDir) + "/" + wordmarkId + ".txt" : ""
  property string branding: ""
  property string textArt: ""
  property string ownArt: ""
  // Stelline's own name is hand-drawn (art/wordmark.js), so it always shows
  // that rather than the typed-word treatment. Any other word shows once it
  // has been drawn, and Stelline's own art until then, so a fresh install
  // shows its name without waiting on anything.
  readonly property bool isOwnName: word.trim().toLowerCase() === M.DEFAULT_WORDMARK
  readonly property string art: usesText ? ((isOwnName || textArt.trim() === "") ? ownArt : textArt) : branding

  // `cycle` (the default) draws a different effect at random from `effects`
  // (all of them unless pinned) the way the stock saver draws from ttfx. It
  // is a screensaver, so the next one starts `holdSec` after the last one
  // lands rather than on a fixed clock — 0 means the art never sits still.
  // Each run lands in a slightly new spot, which is the burn-in drift too.
  readonly property bool onBattery: service && service.onBattery === true
  readonly property var chosenEffects: settings && Array.isArray(settings.effects) && settings.effects.length ? settings.effects : E.EFFECTS
  // Unplugged, the whole-canvas ones stand down: a screensaver that costs a
  // third of a core is not what you want running off a battery.
  readonly property var effectList: onBattery ? E.onlyCheap(chosenEffects) : chosenEffects
  readonly property string effectSetting: settings && settings.effect ? String(settings.effect) : "cycle"
  readonly property int holdSec: settings && settings.holdSec !== undefined && Number(settings.holdSec) >= 0 ? Number(settings.holdSec) : 4
  readonly property bool cycling: active && !thumbnail && effectSetting === "cycle"
  property string cycled: ""
  readonly property string effect: thumbnail ? "none" : (effectSetting === "cycle" ? cycled : effectSetting)
  property real driftX: 0
  property real driftY: 0

  function nextEffect() {
    var next = E.pick(root.effectList)
    if (next === root.cycled && root.effectList.length > 1) next = E.pick(root.effectList)
    root.cycled = next
    // A different ambient and a different way out each time round, so the
    // same arrival never plays the same cycle twice.
    root.ambient = E.pick(E.AMBIENTS)
    root.exitStyle = E.pick(E.EXITS)
    // The token replays even when the same effect comes round again.
    root.token++
    if (!root.thumbnail) {
      root.driftX = Math.round((Math.random() * 2 - 1) * root.width * 0.03)
      root.driftY = Math.round((Math.random() * 2 - 1) * root.height * 0.03)
    }
  }

  FileView {
    path: root.brandingPath
    watchChanges: true
    printErrors: false
    onLoaded: root.branding = text()
    onFileChanged: reload()
    onLoadFailed: root.branding = ""
  }
  FileView {
    path: root.textArtPath
    watchChanges: true
    printErrors: false
    onLoaded: root.textArt = text()
    onFileChanged: reload()
    onLoadFailed: root.textArt = ""
  }
  FileView {
    path: root.fallbackArt
    printErrors: false
    onLoaded: root.ownArt = text()
    onLoadFailed: root.ownArt = ""
  }

  onActiveChanged: if (active) nextEffect()
  Component.onCompleted: nextEffect()

  // Started when an effect lands, so the rest is between animations rather
  // than shared with them: a long effect no longer means a short pause.
  property string ambient: ""
  property string exitStyle: ""
  property int token: 0

  // The rest is what the art does between arriving and leaving, and it is
  // never a still picture: something quiet rolls over it until time is up.
  function scheduleNext() { if (root.cycling && show.phase === "live") rest.restart() }

  Timer {
    id: rest
    interval: Math.max(120, root.holdSec * 1000)
    running: false
    onTriggered: if (root.cycling) show.playExit(root.exitStyle)
  }

  AsciiShow {
    id: show
    anchors.fill: parent
    ambientStyle: root.thumbnail ? "" : root.ambient
    cycleToken: root.token
    onPhaseChanged: if (phase === "live") root.scheduleNext()
    onExitFinished: if (root.cycling) root.nextEffect()
    art: root.art
    effect: root.effect
    active: root.active && !root.thumbnail
    fg: root.fg
    accent: root.accent
    driftX: root.driftX
    driftY: root.driftY
  }
}
