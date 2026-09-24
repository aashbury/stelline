import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// What sits on top of this saver. Each widget is a switch and, while it is
// on, one line under it: where it goes, named, and its one or two choices.
// The three read the same way, so learning one teaches the others. Each
// widget picks its own spot; two in the same spot stack.
Column {
  id: root

  property var settings: ({})
  property var cfg: ({})
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property var widgets: M.widgetsOf(settings, cfg)
  readonly property real indent: Style.space(36)
  // An open list owns the keys until it closes.
  readonly property bool editing: clockPlace.popupOpen || notificationsPlace.popupOpen || agentPlace.popupOpen || agentFigure.popupOpen

  readonly property var placeOptions: M.PLACES.map(function(p) { return { value: p, label: M.placeLabel(p) } })

  signal patched(var patch)

  function set(key, patch) { root.patched(M.patchWidget(root.settings, key, patch)) }

  // A check box: a caption-sized button that says what it turns on.
  component Check: Button {
    property bool ticked: false
    iconText: ticked ? "󰄲" : "󰄱"
    bordered: true
    selected: ticked
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.caption
  }

  // Never shown: it only measures a check box, so a list beside one is
  // exactly as tall and the line reads level.
  Button { id: probe; visible: false; text: "x"; iconText: "󰄱"; bordered: true; fontSize: Style.font.caption }

  // Where a widget goes, by name.
  component Place: Choice {
    width: Style.space(132)
    rowHeight: probe.implicitHeight
    options: root.placeOptions
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  // The line of choices under a widget that is on; on a narrow panel or a
  // large font it wraps rather than running out of the card.
  component Choices: Flow {
    x: root.indent
    width: root.width - root.indent - Style.space(8)
    spacing: Style.space(6)
    bottomPadding: Style.space(8)
  }

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
  Choices {
    visible: root.widgets.clock.on === true
    Place {
      id: clockPlace
      value: root.widgets.clock.place
      onChanged: function(v) { root.set("clock", { place: v }) }
    }
    Check {
      text: "24h"
      ticked: String(root.widgets.clock.format).indexOf("AP") === -1
      onClicked: root.set("clock", { format: ticked ? "h:mm AP" : "HH:mm" })
    }
    Check {
      text: "date"
      ticked: root.widgets.clock.showDate !== false
      onClicked: root.set("clock", { showDate: !ticked })
    }
    Check {
      text: "seconds"
      ticked: root.widgets.clock.showSeconds === true
      onClicked: root.set("clock", { showSeconds: !ticked })
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
  Choices {
    visible: root.widgets.notifications.on === true
    Place {
      id: notificationsPlace
      value: root.widgets.notifications.place
      onChanged: function(v) { root.set("notifications", { place: v }) }
    }
    // Off, each app and how many; on, the latest one's title too.
    Check {
      text: "show titles"
      ticked: root.widgets.notifications.detail !== "counts"
      tooltipText: "Adds the latest notification's title beside each app"
      onClicked: root.set("notifications", { detail: ticked ? "counts" : "summaries" })
    }
  }

  // ---- coding agent: a figure acting out what the agents are doing ----
  SwitchRow {
    width: parent.width
    glyph: "󰚩"
    label: "Agent status"
    checked: root.widgets.agent.on === true
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: root.set("agent", { on: !checked })
  }
  Choices {
    visible: root.widgets.agent.on === true
    Place {
      id: agentPlace
      value: root.widgets.agent.place
      onChanged: function(v) { root.set("agent", { place: v }) }
    }
    Check {
      text: "show tasks"
      ticked: root.widgets.agent.detail !== "state"
      tooltipText: "What each session is working on, beside whether it needs you"
      onClicked: root.set("agent", { detail: ticked ? "state" : "titles" })
    }
    FigureChoice {
      id: agentFigure
      rowHeight: probe.implicitHeight
      figure: root.widgets.agent.figure ? String(root.widgets.agent.figure) : ""
      foreground: root.foreground
      fontFamily: root.fontFamily
      onPicked: function(id) { root.set("agent", { figure: id }) }
    }
  }
}
