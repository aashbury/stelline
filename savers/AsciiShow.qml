import QtQuick
import qs.Commons

// One piece of text art with a quiet effect: `reveal` fades the lines in one
// after another, `typewriter` types the art out, `pulse` breathes the colour
// toward the accent, `none` just shows it. The effect restarts whenever the
// art or the effect changes while active.
Item {
  id: root

  property string art: ""
  property string effect: "reveal"
  property bool active: false
  property color fg: Color.foreground
  property color accent: Color.accent
  property real fitWidth: 0.8
  property real fitHeight: 0.6
  property real driftX: 0
  property real driftY: 0

  property int revealedLines: 0
  property int typedChars: 0
  property real pulseMix: 0

  function restart() {
    revealedLines = 0
    typedChars = 0
    pulseMix = 0
    revealTimer.restart()
    typeTimer.restart()
  }

  onActiveChanged: if (active) restart()
  onArtChanged: if (active) restart()
  onEffectChanged: if (active) restart()
  Component.onCompleted: if (active) restart()

  Timer {
    id: revealTimer
    interval: 140
    repeat: true
    running: root.active && root.effect === "reveal" && root.revealedLines < view.lines.length
    onTriggered: root.revealedLines += 1
  }

  Timer {
    id: typeTimer
    interval: 50
    repeat: true
    running: root.active && root.effect === "typewriter" && root.typedChars < view.totalChars
    onTriggered: root.typedChars = Math.min(view.totalChars, root.typedChars + Math.max(4, Math.ceil(view.totalChars / 60)))
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
    fitWidth: root.fitWidth
    fitHeight: root.fitHeight
    driftX: root.driftX
    driftY: root.driftY
    visibleLines: root.effect === "reveal" ? root.revealedLines : -1
    visibleChars: root.effect === "typewriter" ? root.typedChars : -1
    pulse: root.effect === "pulse"
    pulseMix: root.pulseMix
  }
}
