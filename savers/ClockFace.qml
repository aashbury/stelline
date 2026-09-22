import QtQuick
import qs.Commons

// The clock widget's face: seven-segment digits built from block characters,
// painted as whole-pixel cells (AsciiArt) in the theme's foreground, the colon
// in the accent and blinking once a second, and under it the date in small,
// widely tracked capitals. It fits whatever box it is given — a corner or the
// middle of the screen — and repaints only when the text changes. Drifting
// against burn-in belongs to the layer above, so that everything on top of a
// saver moves together.
Item {
  id: root

  property bool active: false
  property bool thumbnail: false
  // In a corner: tighter, a legible date.
  property bool compact: false
  property var settings: ({})

  readonly property color fg: Color.foreground
  readonly property color accent: Color.accent
  readonly property color muted: Color.muted
  readonly property string fontFamily: Style.font.family

  readonly property string format: settings && settings.format ? String(settings.format) : "HH:mm"
  readonly property bool twelveHour: format.indexOf("AP") !== -1 || format.indexOf("ap") !== -1
  readonly property bool showDate: !settings || settings.showDate !== false
  readonly property bool showSeconds: !!(settings && settings.showSeconds)

  // ---- the segmented digits ----
  // Seven rows by five columns per glyph. Verticals are full blocks; the
  // three bars are half blocks hugging the verticals they meet, so each
  // segment sits apart from the next the way LED segments do.
  readonly property var segments: ({
    "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
    "5": "afgcd", "6": "afgecd", "7": "abc", "8": "abcdefg", "9": "abcdfg"
  })
  // A glyph keeps its width whether or not it is drawn: five columns for a
  // digit, three for a space, one for the colon. The face is built twice —
  // once without the colon, once with nothing but — and the two must land on
  // the same grid, or the layer that fits itself to fewer columns comes out
  // at another size and the colon sits off the digits.
  function blankGlyph(w) {
    var s = new Array(w + 1).join(" ")
    return [s, s, s, s, s, s, s]
  }
  function glyph(ch, hide) {
    if (ch === ":") return hide ? root.blankGlyph(1) : [" ", " ", "▀", " ", "▄", " ", " "]
    if (ch === " ") return root.blankGlyph(3)
    if (hide) return root.blankGlyph(5)
    var on = root.segments[ch] || ""
    var has = function(s) { return on.indexOf(s) !== -1 }
    var bar = function(s, c) { return " " + (has(s) ? c + c + c : "   ") + " " }
    var side = function(l, r) { return (has(l) ? "█" : " ") + "   " + (has(r) ? "█" : " ") }
    return [bar("a", "▄"), side("f", "b"), side("f", "b"), bar("g", "▀"), side("e", "c"), side("e", "c"), bar("d", "▀")]
  }
  function face(text, colonOnly) {
    var rows = ["", "", "", "", "", "", ""]
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i)
      var g = root.glyph(ch, colonOnly ? ch !== ":" : ch === ":")
      for (var r = 0; r < 7; r++) rows[r] += (i > 0 ? " " : "") + g[r]
    }
    return rows.join("\n")
  }

  property string digits: ""
  property string suffix: ""
  property string dateText: ""
  property bool colonOn: true

  function tick() {
    var now = new Date()
    var pattern = root.twelveHour ? "h:mm" : "HH:mm"
    if (root.showSeconds) pattern += ":ss"
    var t = Qt.formatTime(now, pattern)
    var d = Qt.formatDate(now, "dddd d MMMM").toUpperCase()
    var s = root.twelveHour ? Qt.formatTime(now, "AP") : ""
    var colon = root.thumbnail ? true : (now.getSeconds() % 2 === 0)
    if (t !== root.digits) root.digits = t
    if (d !== root.dateText) root.dateText = d
    if (s !== root.suffix) root.suffix = s
    if (colon !== root.colonOn) root.colonOn = colon
  }

  onActiveChanged: if (active) tick()
  Component.onCompleted: tick()

  Timer {
    interval: 1000
    repeat: true
    running: root.active && !root.thumbnail
    onTriggered: root.tick()
  }

  // The colon is drawn twice: in the foreground art it is blank, and an
  // accent-coloured copy of the face carrying only the colon sits on top,
  // so the blink is a visibility toggle rather than a repaint.
  readonly property string digitsArt: root.face(root.digits, false)
  readonly property string colonArt: root.face(root.digits, true)

  Column {
    id: stack
    anchors.centerIn: parent
    spacing: root.thumbnail ? Style.space(2) : (root.compact ? Style.space(6) : Style.space(16))

    Item {
      id: faceBox
      width: root.width
      height: Math.round(root.height * (root.thumbnail ? 0.5 : (root.compact ? 0.6 : 0.42)))

      AsciiArt {
        id: digitLayer
        anchors.fill: parent
        art: root.digitsArt
        fg: root.fg
        accent: root.accent
        fontFamily: root.fontFamily
        fitWidth: root.thumbnail ? 0.9 : (root.compact ? 0.96 : 0.7)
        fitHeight: 0.95
      }
      AsciiArt {
        anchors.fill: parent
        visible: root.colonOn
        art: root.colonArt
        fg: root.accent
        accent: root.accent
        fontFamily: root.fontFamily
        fitWidth: digitLayer.fitWidth
        fitHeight: digitLayer.fitHeight
      }
    }

    Text {
      anchors.horizontalCenter: parent.horizontalCenter
      visible: root.showDate || root.suffix !== ""
      textFormat: Text.PlainText
      renderType: Text.NativeRendering
      text: (root.suffix !== "" ? root.suffix + (root.showDate ? "   ·   " : "") : "") + (root.showDate ? root.dateText : "")
      color: root.muted
      font.family: root.fontFamily
      font.pixelSize: root.thumbnail ? Math.max(5, Math.round(root.height * 0.09)) : (root.compact ? Math.max(10, Math.round(root.height * 0.12)) : Math.max(14, Math.round(root.height * 0.028)))
      font.letterSpacing: root.thumbnail ? 1 : (root.compact ? 2 : Math.max(2, Math.round(root.height * 0.006)))
    }
  }
}
