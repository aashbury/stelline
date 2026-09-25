import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M
import "../savers/Effects.js" as E

// The knobs of one saver's type. Every control reports a patch; the body
// merges it into the saver's settings object. What is shown follows the type
// alone — a shipped tile and one you added of the same type get exactly the
// same rows — and only what applies: a single picture gets no "each piece"
// slider, a still gets no frame rate.
Column {
  id: root

  property string saverId: ""
  property var saver: ({})
  property var settings: ({})
  property var bar: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family

  readonly property var series: saver && saver.series ? saver.series : null
  readonly property bool isSeries: !!series
  readonly property bool isAscii: isSeries && series.kind === "ascii"
  readonly property bool isImage: isSeries && series.kind === "image"
  readonly property bool importing: isSeries && series.importing === true
  readonly property int frameCount: isSeries && Number(series.frameCount) > 0 ? Number(series.frameCount) : 1
  readonly property string play: settings && settings.play ? String(settings.play) : (series && series.play ? String(series.play) : "slideshow")
  readonly property bool animation: isAscii && play === "animation" && frameCount > 1
  readonly property bool hasKnobs: saverId !== "" && !(isImage && frameCount === 1 && M.extensionOf(series.pieces[0] || "") === "gif")
  // What this saver is decides what it is configured with. A text saver has
  // a word, whether it shipped with Stelline or you typed it into Add.
  readonly property string type: M.saverType(root.saver)
  readonly property bool isWordmark: type === "text"
  readonly property string word: M.wordmarkText(root.saver, root.settings)
  property var svc: null
  readonly property bool editing: wordField.activeFocus
  readonly property var pinned: Array.isArray(settings.effects) ? settings.effects : []

  signal patched(var patch)
  // A wheel over a slider, handed back so it scrolls the panel.
  signal scrollBy(real delta)

  function fps(v) { return Math.round(v) + " fps" }
  function secs(v) { return Math.round(v) + " s" }
  // 0 is not "no time": it means the next animation starts the moment the last lands.
  function rest(v) { return Math.round(v) === 0 ? "never still" : Math.round(v) + " s" }

  // Every row is a glyph, a label and its control, with the label column
  // wide enough for the longest label here.
  readonly property real labelWidth: Style.space(112)
  // One readout width, so every slider's track ends in the same place.
  readonly property real readoutWidth: Style.space(72)

  spacing: Style.space(2)
  bottomPadding: Style.space(6)

  // ---- the word, for anything of the wordmark type ----
  FieldRow {
    visible: root.isWordmark
    width: parent.width
    glyph: "󰊄"
    label: "Text"
    labelWidth: root.labelWidth
    foreground: root.foreground
    fontFamily: root.fontFamily
    TextField {
      id: wordField
      width: Math.min(parent.width, Style.space(260))
      text: root.word
      placeholderText: root.saverId === "wordmark" ? "Omarchy's artwork" : "A word"
      foreground: root.foreground
      font.family: root.fontFamily
      onEditingFinished: if (text !== root.word && root.svc) root.svc.setWordmarkText(root.saverId, text)
      onAccepted: if (root.svc) root.svc.setWordmarkText(root.saverId, text)
    }
  }

  // ---- effects: for wordmarks and ASCII slideshows, and the terminal ----
  FieldRow {
    visible: root.isWordmark || (root.isAscii && !root.animation) || root.type === "original"
    width: parent.width
    glyph: "󰕧"
    label: "Animations"
    labelWidth: root.labelWidth
    foreground: root.foreground
    fontFamily: root.fontFamily
    MoodPicker {
      width: parent.width
      effects: root.type === "original" ? M.TTFX_EFFECTS : E.EFFECTS
      moods: root.type === "original" ? M.TTFX_MOODS : E.MOODS
      moodKeys: ["calm", "neon", "kinetic"]
      pinned: root.pinned
      foreground: root.foreground
      fontFamily: root.fontFamily
      onChanged: function(list) { root.patched({ effects: list }) }
    }
  }
  SliderRow {
    visible: root.isWordmark || (root.isAscii && !root.animation)
    width: parent.width
    bar: root.bar
    glyph: "󰔛"
    labelWidth: root.labelWidth
    readoutWidth: root.readoutWidth
    // One picture is drawn again on each cycle; several take turns.
    label: root.isWordmark ? "Rest between" : (root.series && root.series.pieces && root.series.pieces.length > 1 ? "Each picture" : "Redraw every")
    value: root.isSeries && !root.isWordmark
      ? (Number(root.settings.dwellSec) || Number(root.series.dwellSec) || 12)
      : (root.settings.holdSec !== undefined && Number(root.settings.holdSec) >= 0 ? Number(root.settings.holdSec) : 4)
    minimum: root.isWordmark ? 0 : 5
    maximum: root.isWordmark ? 30 : 60
    step: root.isWordmark ? 2 : 5
    format: root.isWordmark ? root.rest : root.secs
    foreground: root.foreground
    fontFamily: root.fontFamily
    onReleased: function(v) { root.patched(root.isSeries && !root.isWordmark ? { dwellSec: Math.round(v) } : { holdSec: Math.round(v) }) }
    onWheeled: function(d) { root.scrollBy(d) }
  }

  // ---- detail, for pictures drawn as dots: changing it draws them again ----
  // The level asked for is what the slider shows while they are redrawn:
  // the saver's own record only catches up once the redraw has started, and
  // until then the knob would spring back to the old level.
  property int askedDetail: -1
  onSaverIdChanged: askedDetail = -1
  onImportingChanged: if (!importing) askedDetail = -1
  SliderRow {
    visible: M.savedDetail(root.saver) >= 0
    width: parent.width
    bar: root.bar
    glyph: "󰈊"
    labelWidth: root.labelWidth
    label: "Detail"
    value: root.askedDetail >= 0 ? root.askedDetail : Math.max(0, M.savedDetail(root.saver))
    minimum: 0
    maximum: 4
    step: 1
    ticks: 5
    format: function(v) { return M.detailName(v) }
    readoutWidth: root.readoutWidth
    typeable: false
    foreground: root.foreground
    fontFamily: root.fontFamily
    onReleased: function(v) {
      if (!root.svc || Math.round(v) === Math.round(value)) return
      root.askedDetail = Math.round(v)
      root.svc.redetailSaver(root.saverId, root.askedDetail)
    }
    onWheeled: function(d) { root.scrollBy(d) }
  }

  // ---- series: how the pieces play ----
  FieldRow {
    visible: root.isAscii && root.frameCount > 1
    width: parent.width
    glyph: "󰐊"
    label: "Play as"
    labelWidth: root.labelWidth
    foreground: root.foreground
    fontFamily: root.fontFamily
    ButtonGroup {
      options: [{ value: "slideshow", label: "a slideshow" }, { value: "animation", label: "an animation" }]
      value: root.play
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      focusable: false
      onChanged: function(v) { root.patched({ play: v }) }
    }
  }
  SliderRow {
    visible: root.animation
    width: parent.width
    bar: root.bar
    glyph: "󰓅"
    labelWidth: root.labelWidth
    readoutWidth: root.readoutWidth
    label: "Speed"
    value: Number(root.settings.fps) || (root.series ? Number(root.series.fps) : 0) || 10
    minimum: 2
    maximum: 24
    step: 2
    format: root.fps
    foreground: root.foreground
    fontFamily: root.fontFamily
    onReleased: function(v) { root.patched({ fps: Math.round(v) }) }
    onWheeled: function(d) { root.scrollBy(d) }
  }
  SliderRow {
    visible: root.isImage && root.frameCount > 1
    width: parent.width
    bar: root.bar
    glyph: "󰔛"
    labelWidth: root.labelWidth
    readoutWidth: root.readoutWidth
    label: "Each picture"
    value: Number(root.settings.dwellSec) || (root.series ? Number(root.series.dwellSec) : 0) || 12
    minimum: 5
    maximum: 60
    step: 5
    format: root.secs
    foreground: root.foreground
    fontFamily: root.fontFamily
    onReleased: function(v) { root.patched({ dwellSec: Math.round(v) }) }
    onWheeled: function(d) { root.scrollBy(d) }
  }
  SwitchRow {
    visible: root.isSeries && root.frameCount > 1 && !root.animation
    width: parent.width
    glyph: "󰒟"
    label: "Shuffle the order"
    checked: root.settings.order === "shuffle"
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: root.patched({ order: checked ? "sequence" : "shuffle" })
  }

  // ---- size: how much of the screen it takes, never stretched ----
  FieldRow {
    visible: (root.isImage || root.isAscii) && !root.isWordmark
    width: parent.width
    glyph: "󰊓"
    label: "Size"
    labelWidth: root.labelWidth
    foreground: root.foreground
    fontFamily: root.fontFamily
    ButtonGroup {
      // Each a share of the screen, centred: XL is as big as the whole
      // picture fits; Fill covers the screen, trimming what runs past its
      // edges. (XL is stored as "full", as it was first called.)
      options: [
        { value: "s", label: "S", tooltip: "40% of the screen" },
        { value: "m", label: "M", tooltip: "60% of the screen" },
        { value: "l", label: "L", tooltip: "80% of the screen" },
        { value: "full", label: "XL", tooltip: "As big as the whole picture fits" },
        { value: "fill", label: "Fill", tooltip: "Covers the screen, trimming the edges" }
      ]
      value: M.pictureSize(root.settings, root.isImage ? "image" : "ascii").key
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      focusable: false
      onChanged: function(v) { root.patched({ size: v }) }
    }
  }

  // ---- pictures shown as they are ----
  FieldRow {
    visible: root.isImage
    width: parent.width
    glyph: "󰁌"
    label: "Motion"
    labelWidth: root.labelWidth
    foreground: root.foreground
    fontFamily: root.fontFamily
    ButtonGroup {
      options: [{ value: "none", label: "still" }, { value: "zoom", label: "slow zoom" }]
      value: root.settings.motion || "none"
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      focusable: false
      onChanged: function(v) { root.patched({ motion: v }) }
    }
  }

  // ---- background: everything Stelline draws itself ----
  FieldRow {
    visible: root.type !== "original"
    width: parent.width
    glyph: "󰸉"
    label: "Background"
    labelWidth: root.labelWidth
    foreground: root.foreground
    fontFamily: root.fontFamily
    ButtonGroup {
      options: [{ value: "theme", label: "theme" }, { value: "black", label: "black" }]
      value: root.settings.background || (root.isImage || root.type === "empty" ? "black" : "theme")
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      focusable: false
      onChanged: function(v) { root.patched({ background: v }) }
    }
  }
}
