import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// Which animations play. A mood is a set of effects, so the row of four is
// the whole control for most people; the full list stays one click away and
// opens by itself when the chosen set is not one of the moods. Nothing new
// is stored — a mood writes the same `effects` array the chips do.
Column {
  id: root

  property var effects: []
  property var moods: ({})
  property var moodKeys: []
  property var pinned: []
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family

  property bool expanded: false
  readonly property string mood: M.moodOf(root.pinned, root.moods)
  readonly property bool showChips: expanded || mood === "custom"

  signal changed(var effects)

  function title(t) { return t.charAt(0).toUpperCase() + t.slice(1) }

  width: parent ? parent.width : implicitWidth
  spacing: Style.space(6)

  // The moods are one choice among four, so they are the same control as
  // every other choice in the panel. The label is the row's, not ours.
  ButtonGroup {
    options: [{ value: "", label: "Everything", tooltip: "All " + root.effects.length + ", one after another at random" }]
      .concat(root.moodKeys.map(function(k) { return { value: k, label: root.title(k), tooltip: (root.moods[k] || []).join(", ") } }))
    value: root.mood
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.caption
    focusable: false
    onChanged: function(v) { root.changed(v === "" ? [] : (root.moods[v] || []).slice()) }
  }

  Button {
    text: root.mood === "custom"
      ? "Your own — " + root.pinned.length + " of " + root.effects.length
      : (root.showChips ? "Choose individually" : "Choose individually…")
    iconText: root.showChips ? "󰅀" : "󰅂"
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.caption
    horizontalPadding: 0
    onClicked: root.expanded = !root.expanded
  }

  Flow {
    visible: root.showChips
    width: parent.width
    spacing: Style.space(6)
    Repeater {
      model: root.effects
      Button {
        required property var modelData
        text: modelData
        bordered: true
        selected: root.pinned.indexOf(modelData) !== -1
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        onClicked: {
          var next = root.pinned.slice()
          var at = next.indexOf(modelData)
          if (at === -1) next.push(modelData); else next.splice(at, 1)
          // Every one checked is the same as none: it plays all of them.
          root.changed(next.length === root.effects.length ? [] : next)
        }
      }
    }
  }
}
