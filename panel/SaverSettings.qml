import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// Level 2: one saver's knobs, shown inline under its row. Every control
// reports a patch; the body merges it into the saver's settings object.
Column {
  id: root

  property string saverId: ""
  property var settings: ({})
  property var bar: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)

  signal patched(var patch)

  function pct(v) { return Math.round(v) + "%" }
  function fps(v) { return Math.round(v) + " fps" }
  function secs(v) { return Math.round(v) + " s" }

  spacing: Style.space(8)
  leftPadding: Style.space(36)
  rightPadding: Style.space(8)
  bottomPadding: Style.space(6)

  // ---- wordmark ----
  Column {
    visible: root.saverId === "wordmark"
    width: parent.width - root.leftPadding - root.rightPadding
    spacing: Style.space(8)

    Text { textFormat: Text.PlainText; text: "Effect"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
    ButtonGroup {
      options: ["cycle", "reveal", "typewriter", "pulse"]
      value: root.settings.effect || "cycle"
      foreground: root.foreground
      fontFamily: root.fontFamily
      focusable: false
      onChanged: function(v) { root.patched({ effect: v }) }
    }
    SliderRow {
      width: parent.width
      bar: root.bar
      label: "Hold"
      value: Number(root.settings.holdSec) || 15
      minimum: 5
      maximum: 60
      step: 5
      format: root.secs
      foreground: root.foreground
      fontFamily: root.fontFamily
      onReleased: function(v) { root.patched({ holdSec: Math.round(v) }) }
    }
    Text { textFormat: Text.PlainText; text: "Background"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
    ButtonGroup {
      options: [{ value: "theme", label: "theme" }, { value: "black", label: "black" }]
      value: root.settings.background || "theme"
      foreground: root.foreground
      fontFamily: root.fontFamily
      focusable: false
      onChanged: function(v) { root.patched({ background: v }) }
    }
  }

  // ---- clock ----
  Column {
    visible: root.saverId === "clock"
    width: parent.width - root.leftPadding - root.rightPadding
    spacing: Style.space(4)

    Toggle {
      width: parent.width
      label: "24-hour clock"
      checked: (root.settings.format || "HH:mm") === "HH:mm"
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: root.patched({ format: checked ? "h:mm AP" : "HH:mm" })
    }
    Toggle {
      width: parent.width
      label: "Show the date"
      checked: root.settings.showDate !== false
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: root.patched({ showDate: !checked })
    }
    Toggle {
      width: parent.width
      label: "Show seconds"
      description: "Repaints every second instead of every minute"
      checked: root.settings.showSeconds === true
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: root.patched({ showSeconds: !checked })
    }
  }

  // ---- matrix ----
  Column {
    visible: root.saverId === "matrix"
    width: parent.width - root.leftPadding - root.rightPadding
    spacing: Style.space(8)

    SliderRow {
      width: parent.width
      bar: root.bar
      label: "Density"
      value: Math.round((Number(root.settings.density) || 0.6) * 100)
      minimum: 10
      maximum: 100
      step: 10
      format: root.pct
      foreground: root.foreground
      fontFamily: root.fontFamily
      onReleased: function(v) { root.patched({ density: Math.round(v) / 100 }) }
    }
    SliderRow {
      width: parent.width
      bar: root.bar
      label: "Frame rate"
      value: Number(root.settings.fps) || 15
      minimum: 6
      maximum: 30
      step: 2
      format: root.fps
      foreground: root.foreground
      fontFamily: root.fontFamily
      onReleased: function(v) { root.patched({ fps: Math.round(v) }) }
    }
    Text { textFormat: Text.PlainText; text: "Glyphs · frame rate halves on battery"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
    ButtonGroup {
      options: ["katakana", "ascii", "binary"]
      value: root.settings.glyphs || "katakana"
      foreground: root.foreground
      fontFamily: root.fontFamily
      focusable: false
      onChanged: function(v) { root.patched({ glyphs: v }) }
    }
  }

  // ---- terminal ----
  Column {
    visible: root.saverId === "terminal"
    width: parent.width - root.leftPadding - root.rightPadding
    spacing: Style.space(8)

    readonly property var pinned: Array.isArray(root.settings.effects) ? root.settings.effects : []

    Row {
      spacing: Style.space(8)
      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: parent.parent.pinned.length === 0 ? "All 37 effects play" : parent.parent.pinned.length + " of 37 effects pinned"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
      Button {
        text: "Clear"
        bordered: true
        visible: parent.parent.pinned.length > 0
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        onClicked: root.patched({ effects: [] })
      }
    }

    Flow {
      width: parent.width
      spacing: Style.space(4)

      Repeater {
        model: M.TTFX_EFFECTS
        Button {
          required property var modelData
          readonly property bool pinned: parent.parent.pinned.indexOf(modelData) !== -1
          text: modelData
          bordered: true
          selected: pinned
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          horizontalPadding: Style.space(7)
          verticalPadding: Style.space(3)
          onClicked: {
            var next = parent.parent.pinned.slice()
            var at = next.indexOf(modelData)
            if (at === -1) next.push(modelData); else next.splice(at, 1)
            root.patched({ effects: next })
          }
        }
      }
    }
  }
}
