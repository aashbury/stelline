import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M
import "../savers/Effects.js" as E

// One saver's knobs. Every control reports a patch; the body merges it into
// the saver's settings object. Only what applies to this saver is shown: a
// single picture gets no "each piece" slider, a still gets no frame rate.
Column {
  id: root

  property string saverId: ""
  property var saver: ({})
  property var settings: ({})
  property var bar: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)

  readonly property var series: saver && saver.series ? saver.series : null
  readonly property bool isSeries: !!series
  readonly property bool isAscii: isSeries && series.kind === "ascii"
  readonly property bool isImage: isSeries && series.kind === "image"
  readonly property int frameCount: isSeries && Number(series.frameCount) > 0 ? Number(series.frameCount) : 1
  readonly property string play: settings && settings.play ? String(settings.play) : (series && series.play ? String(series.play) : "slideshow")
  readonly property bool animation: isAscii && play === "animation" && frameCount > 1
  readonly property bool hasKnobs: saverId !== "" && saverId !== "blank" && !(isImage && frameCount === 1 && M.extensionOf(series.pieces[0] || "") === "gif")
  readonly property bool editing: false
  readonly property var pinned: Array.isArray(settings.effects) ? settings.effects : []

  signal patched(var patch)

  function pct(v) { return Math.round(v) + "%" }
  function fps(v) { return Math.round(v) + " fps" }
  function secs(v) { return Math.round(v) + " s" }
  function label(t) { return t.charAt(0).toUpperCase() + t.slice(1) }

  spacing: Style.space(8)
  leftPadding: Style.space(36)
  rightPadding: Style.space(8)
  bottomPadding: Style.space(6)

  // ---- effects: for the wordmark and ASCII slideshows ----
  Column {
    visible: root.saverId === "wordmark" || (root.isAscii && !root.animation)
    width: parent.width - root.leftPadding - root.rightPadding
    spacing: Style.space(6)

    Row {
      spacing: Style.space(8)
      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: root.pinned.length === 0
          ? (root.saverId === "wordmark" ? "All " + E.EFFECTS.length + " of Stelline's own effects, in turn — click the ones you want" : "All the effects, in turn — click the ones you want")
          : root.pinned.length + " of " + (root.saverId === "wordmark" ? "Stelline's " : "") + E.EFFECTS.length + " effects chosen"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
      Button {
        text: "All of them"
        bordered: true
        visible: root.pinned.length > 0
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
        model: E.EFFECTS
        Button {
          required property var modelData
          text: modelData
          bordered: true
          selected: root.pinned.indexOf(modelData) !== -1
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          horizontalPadding: Style.space(7)
          verticalPadding: Style.space(3)
          onClicked: {
            var next = root.pinned.slice()
            var at = next.indexOf(modelData)
            if (at === -1) next.push(modelData); else next.splice(at, 1)
            root.patched({ effects: next })
          }
        }
      }
    }
    SliderRow {
      width: parent.width
      bar: root.bar
      label: root.isSeries ? "Each piece stays" : "Each effect stays"
      value: root.isSeries ? (Number(root.settings.dwellSec) || Number(root.series.dwellSec) || 12) : (Number(root.settings.holdSec) || 15)
      minimum: 5
      maximum: 60
      step: 5
      format: root.secs
      foreground: root.foreground
      fontFamily: root.fontFamily
      onReleased: function(v) { root.patched(root.isSeries ? { dwellSec: Math.round(v) } : { holdSec: Math.round(v) }) }
    }
  }

  // ---- series: how the pieces play ----
  Column {
    visible: root.isSeries && root.frameCount > 1
    width: parent.width - root.leftPadding - root.rightPadding
    spacing: Style.space(6)
    Text { visible: root.isAscii; textFormat: Text.PlainText; text: "Show the pieces as"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
    ButtonGroup {
      visible: root.isAscii
      options: [{ value: "slideshow", label: "a slideshow" }, { value: "animation", label: "an animation" }]
      value: root.play
      foreground: root.foreground
      fontFamily: root.fontFamily
      focusable: false
      onChanged: function(v) { root.patched({ play: v }) }
    }
    SliderRow {
      visible: root.animation
      width: parent.width
      bar: root.bar
      label: "Speed"
      value: Number(root.settings.fps) || (root.series ? Number(root.series.fps) : 0) || 10
      minimum: 2
      maximum: 24
      step: 2
      format: root.fps
      foreground: root.foreground
      fontFamily: root.fontFamily
      onReleased: function(v) { root.patched({ fps: Math.round(v) }) }
    }
    SliderRow {
      visible: root.isImage
      width: parent.width
      bar: root.bar
      label: "Each picture stays"
      value: Number(root.settings.dwellSec) || (root.series ? Number(root.series.dwellSec) : 0) || 12
      minimum: 5
      maximum: 60
      step: 5
      format: root.secs
      foreground: root.foreground
      fontFamily: root.fontFamily
      onReleased: function(v) { root.patched({ dwellSec: Math.round(v) }) }
    }
    Toggle {
      visible: !root.animation
      width: parent.width
      label: "Shuffle the order"
      checked: root.settings.order === "shuffle"
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: root.patched({ order: checked ? "sequence" : "shuffle" })
    }
  }

  Column {
    visible: root.isImage
    width: parent.width - root.leftPadding - root.rightPadding
    spacing: Style.space(6)
    Row {
      spacing: Style.space(12)
      Column {
        spacing: Style.space(3)
        Text { textFormat: Text.PlainText; text: "Fit"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        ButtonGroup {
          options: [{ value: "contain", label: "whole picture" }, { value: "cover", label: "fill the screen" }]
          value: root.settings.fit || "contain"
          foreground: root.foreground
          fontFamily: root.fontFamily
          focusable: false
          onChanged: function(v) { root.patched({ fit: v }) }
        }
      }
      Column {
        spacing: Style.space(3)
        Text { textFormat: Text.PlainText; text: "Motion"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        ButtonGroup {
          options: [{ value: "none", label: "still" }, { value: "zoom", label: "slow zoom" }]
          value: root.settings.motion || "none"
          foreground: root.foreground
          fontFamily: root.fontFamily
          focusable: false
          onChanged: function(v) { root.patched({ motion: v }) }
        }
      }
    }
  }

  // ---- background: wordmark and every series ----
  Column {
    visible: root.saverId === "wordmark" || root.isSeries
    width: parent.width - root.leftPadding - root.rightPadding
    spacing: Style.space(3)
    Text { textFormat: Text.PlainText; text: "Background"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
    ButtonGroup {
      options: [{ value: "theme", label: "theme" }, { value: "black", label: "black" }]
      value: root.settings.background || (root.isImage ? "black" : "theme")
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

  // ---- terminal ----
  Column {
    visible: root.saverId === "terminal"
    width: parent.width - root.leftPadding - root.rightPadding
    spacing: Style.space(8)
    Row {
      spacing: Style.space(8)
      Text {
        anchors.verticalCenter: parent.verticalCenter
        textFormat: Text.PlainText
        text: root.pinned.length === 0 ? "All 37 of Omarchy's effects, at random — click the ones you want" : root.pinned.length + " of 37 effects chosen"
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
      Button {
        text: "All of them"
        bordered: true
        visible: root.pinned.length > 0
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
          text: modelData
          bordered: true
          selected: root.pinned.indexOf(modelData) !== -1
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          horizontalPadding: Style.space(7)
          verticalPadding: Style.space(3)
          onClicked: {
            var next = root.pinned.slice()
            var at = next.indexOf(modelData)
            if (at === -1) next.push(modelData); else next.splice(at, 1)
            root.patched({ effects: next })
          }
        }
      }
    }
  }
}
