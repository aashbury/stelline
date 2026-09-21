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
  readonly property color dim: Qt.darker(foreground, 1.4)

  property bool expanded: false
  readonly property string mood: M.moodOf(root.pinned, root.moods)
  readonly property bool showChips: expanded || mood === "custom"

  signal changed(var effects)

  function title(t) { return t.charAt(0).toUpperCase() + t.slice(1) }

  width: parent ? parent.width : implicitWidth
  spacing: Style.space(6)

  Flow {
    width: parent.width
    spacing: Style.space(6)

    Text {
      // Flow lays its children out itself, so the label matches the chips'
      // height rather than anchoring to them.
      height: everything.height
      verticalAlignment: Text.AlignVCenter
      textFormat: Text.PlainText
      text: "Animations"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
    Button {
      id: everything
      text: "Everything"
      bordered: true
      selected: root.mood === ""
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      horizontalPadding: Style.space(9)
      verticalPadding: Style.space(3)
      tooltipText: "All " + root.effects.length + ", one after another at random"
      onClicked: root.changed([])
    }
    Repeater {
      model: root.moodKeys
      Button {
        required property var modelData
        text: root.title(modelData)
        bordered: true
        selected: root.mood === modelData
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        horizontalPadding: Style.space(9)
        verticalPadding: Style.space(3)
        tooltipText: (root.moods[modelData] || []).join(", ")
        onClicked: root.changed((root.moods[modelData] || []).slice())
      }
    }
  }

  Button {
    text: root.mood === "custom"
      ? "Your own — " + root.pinned.length + " of " + root.effects.length
      : (root.showChips ? "Choose individually" : "Choose individually…")
    iconText: root.showChips ? "󰅀" : "󰅂"
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.caption
    horizontalPadding: Style.space(4)
    onClicked: root.expanded = !root.expanded
  }

  Flow {
    visible: root.showChips
    width: parent.width
    spacing: Style.space(4)
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
        horizontalPadding: Style.space(7)
        verticalPadding: Style.space(3)
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
