import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// What sits on top of this saver. Each widget is a switch; on, it shows a
// little picture of the screen — click where it should go — and its own few
// choices beside it. Nothing here is a corner setting shared with the other
// widgets: each one picks its own spot, and two in the same spot stack.
Column {
  id: root

  property var settings: ({})
  property var cfg: ({})
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  readonly property var widgets: M.widgetsOf(settings, cfg)
  readonly property real indent: Style.space(36)

  // The time as it would read now, so the two ways of writing it are a
  // sample rather than a rule to decode.
  property date sampleTime: new Date()
  onVisibleChanged: if (visible) sampleTime = new Date()
  Timer { interval: 30000; repeat: true; running: root.visible; onTriggered: root.sampleTime = new Date() }

  signal patched(var patch)

  function set(key, patch) { root.patched(M.patchWidget(root.settings, key, patch)) }

  width: parent ? parent.width : implicitWidth
  spacing: Style.space(2)

  PanelSectionHeader { text: "ON TOP"; foreground: root.foreground; fontFamily: root.fontFamily }

  // ---- clock ----
  SwitchRow {
    width: parent.width
    glyph: "󰥔"
    label: "Clock"
    checked: root.widgets.clock.on === true
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: root.set("clock", { on: !checked })
  }
  Row {
    visible: root.widgets.clock.on === true
    x: root.indent
    spacing: Style.space(12)
    bottomPadding: Style.space(8)

    PlacePicker {
      anchors.verticalCenter: parent.verticalCenter
      place: root.widgets.clock.place
      foreground: root.foreground
      fontFamily: root.fontFamily
      onPicked: function(spot) { root.set("clock", { place: spot }) }
    }

    Column {
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(6)
      ButtonGroup {
        options: [{ value: "HH:mm", label: Qt.formatTime(root.sampleTime, "HH:mm") },
                  { value: "h:mm AP", label: Qt.formatTime(root.sampleTime, "h:mm AP") }]
        value: String(root.widgets.clock.format).indexOf("AP") !== -1 ? "h:mm AP" : "HH:mm"
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        focusable: false
        onChanged: function(v) { root.set("clock", { format: v }) }
      }
      Row {
        spacing: Style.space(6)
        Button {
          text: "date"
          iconText: root.widgets.clock.showDate !== false ? "󰄲" : "󰄱"
          bordered: true
          selected: root.widgets.clock.showDate !== false
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          onClicked: root.set("clock", { showDate: root.widgets.clock.showDate === false })
        }
        Button {
          text: "seconds"
          iconText: root.widgets.clock.showSeconds === true ? "󰄲" : "󰄱"
          bordered: true
          selected: root.widgets.clock.showSeconds === true
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          onClicked: root.set("clock", { showSeconds: root.widgets.clock.showSeconds !== true })
        }
      }
    }
  }

  // ---- notifications ----
  SwitchRow {
    width: parent.width
    glyph: "󰂚"
    label: "Notifications"
    description: "Unless Do Not Disturb is on"
    checked: root.widgets.notifications.on === true
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: root.set("notifications", { on: !checked })
  }
  Row {
    visible: root.widgets.notifications.on === true
    x: root.indent
    spacing: Style.space(12)
    bottomPadding: Style.space(8)

    PlacePicker {
      anchors.verticalCenter: parent.verticalCenter
      place: root.widgets.notifications.place
      foreground: root.foreground
      fontFamily: root.fontFamily
      onPicked: function(spot) { root.set("notifications", { place: spot }) }
    }

    ButtonGroup {
      anchors.verticalCenter: parent.verticalCenter
      options: [{ value: "counts", label: "how many" }, { value: "summaries", label: "what about" }, { value: "bodies", label: "in full" }]
      value: root.widgets.notifications.detail || "counts"
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.caption
      focusable: false
      onChanged: function(v) { root.set("notifications", { detail: v }) }
    }
  }

  // ---- coding agent ----
  SwitchRow {
    width: parent.width
    glyph: "󰚩"
    // Named for what it shows, so it does not read as a setting for the
    // agents themselves.
    label: "Agent status"
    // Only Claude Code reports what it is waiting for; the others are read
    // from whether they are busy, so the caption promises no more than that.
    description: "Claude Code in full; other agents as working or waiting"
    checked: root.widgets.agent.on === true
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: root.set("agent", { on: !checked })
  }
  // Where it goes, the same picture of the screen as every other widget's,
  // and under it which figure: the figures get a line of their own, so
  // they are never squeezed to fit beside it.
  Column {
    visible: root.widgets.agent.on === true
    x: root.indent
    width: parent.width - root.indent - Style.space(8)
    spacing: Style.space(8)
    bottomPadding: Style.space(8)

    // Where, and how much it says: by default which agent and whether it
    // needs you; what each session is on only if asked, the screen being
    // unattended while it shows.
    Row {
      spacing: Style.space(12)
      PlacePicker {
        anchors.verticalCenter: parent.verticalCenter
        place: root.widgets.agent.place
        foreground: root.foreground
        fontFamily: root.fontFamily
        onPicked: function(spot) { root.set("agent", { place: spot }) }
      }
      ButtonGroup {
        anchors.verticalCenter: parent.verticalCenter
        options: [{ value: "state", label: "who, and if it needs you" }, { value: "titles", label: "and what it's on" }]
        value: root.widgets.agent.detail === "titles" ? "titles" : "state"
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        focusable: false
        onChanged: function(v) { root.set("agent", { detail: v }) }
      }
    }

    Text {
      textFormat: Text.PlainText
      text: "How it looks — it acts out what they are doing"
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }

    FigurePicker {
      figure: root.widgets.agent.figure ? String(root.widgets.agent.figure) : ""
      foreground: root.foreground
      fontFamily: root.fontFamily
      onPicked: function(id) { root.set("agent", { figure: id }) }
    }
  }
}
