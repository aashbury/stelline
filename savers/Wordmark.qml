import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "Effects.js" as E

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
  readonly property string word: wordmarkId === "" ? "" : String(settings && settings.text !== undefined ? settings.text : "Stelline")
  readonly property bool usesText: word.trim() !== ""
  readonly property string brandingPath: Quickshell.env("HOME") + "/.config/omarchy/branding/screensaver.txt"
  readonly property string textArtPath: usesText ? Quickshell.env("HOME") + "/.config/omarchy/stelline/wordmarks/" + wordmarkId + ".txt" : ""
  property string branding: ""
  property string textArt: ""
  property string ownArt: ""
  // The word, once it has been drawn; Stelline's own art until then, so a
  // fresh install shows its name without waiting on anything.
  readonly property string art: usesText ? (textArt.trim() !== "" ? textArt : ownArt) : branding

  // `cycle` (the default) plays a different effect every `holdSec`, drawn at
  // random from `effects` (all of them unless pinned) the way the stock saver
  // draws from ttfx. Burn-in drift is a small jump every half minute.
  readonly property var effectList: settings && Array.isArray(settings.effects) && settings.effects.length ? settings.effects : E.EFFECTS
  readonly property string effectSetting: settings && settings.effect ? String(settings.effect) : "cycle"
  readonly property int holdSec: settings && Number(settings.holdSec) > 0 ? Number(settings.holdSec) : 15
  property string cycled: ""
  readonly property string effect: thumbnail ? "none" : (effectSetting === "cycle" ? cycled : effectSetting)
  property real driftX: 0
  property real driftY: 0

  function nextEffect() {
    var next = E.pick(root.effectList)
    if (next === root.cycled && root.effectList.length > 1) next = E.pick(root.effectList)
    root.cycled = next
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

  onActiveChanged: if (active) { driftX = 0; driftY = 0; nextEffect() }
  Component.onCompleted: nextEffect()

  Timer {
    interval: root.holdSec * 1000
    repeat: true
    running: root.active && !root.thumbnail && root.effectSetting === "cycle"
    onTriggered: root.nextEffect()
  }

  Timer {
    interval: 30000
    repeat: true
    running: root.active && !root.thumbnail
    onTriggered: {
      root.driftX = Math.round((Math.random() * 2 - 1) * root.width * 0.03)
      root.driftY = Math.round((Math.random() * 2 - 1) * root.height * 0.03)
    }
  }

  AsciiShow {
    anchors.fill: parent
    art: root.art
    effect: root.effect
    active: root.active && !root.thumbnail
    fg: root.fg
    accent: root.accent
    driftX: root.driftX
    driftY: root.driftY
  }
}
