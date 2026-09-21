import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "Effects.js" as E

// The stock screensaver's subject, drawn natively: the branding ASCII art from
// ~/.config/omarchy/branding/screensaver.txt in the theme's colours, sized to
// the screen, with a few quiet reveal effects. Edits made through
// Style > Screensaver show up live.
Item {
  id: root

  property bool active: false
  property bool thumbnail: false
  property var service: null
  property var settings: ({})

  readonly property color fg: Color.foreground
  readonly property color bg: settings && settings.background === "black" ? "black" : Color.background
  readonly property color accent: Color.accent

  // Until the branding file has been changed from the stock logo, the
  // Wordmark draws Stelline's own art (`fallbackArt`, set by the tile and the
  // full-screen surface for this saver only) — otherwise it would be the
  // Omarchy logo twice over, here and on the Original, which always shows the
  // branding file because that is what the stock saver plays. Set your own
  // art (the ⚙ ARTWORK row, or Style › Screensaver) and it shows that instead.
  property string fallbackArt: ""
  readonly property string brandingPath: Quickshell.env("HOME") + "/.config/omarchy/branding/screensaver.txt"
  readonly property string logoPath: (service && service.omarchyPath ? String(service.omarchyPath) : (Quickshell.env("OMARCHY_PATH") || "/usr/share/omarchy")) + "/logo.txt"
  property string branding: ""
  property string logo: ""
  property string ownArt: ""
  readonly property bool brandingIsStock: branding.trim() === "" || (logo.trim() !== "" && branding.trim() === logo.trim())
  readonly property string art: fallbackArt !== "" && brandingIsStock ? ownArt : branding

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
    path: root.logoPath
    printErrors: false
    onLoaded: root.logo = text()
    onLoadFailed: root.logo = ""
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
