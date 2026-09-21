import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// The open tile, below the grid: when this saver plays (its rule), how it
// looks (its knobs), and what can be done with it. One rule per saver; its
// conditions all have to hold. Editors only appear for conditions that are on.
BorderSurface {
  id: root

  property var saver: ({})
  property var svc: null
  property var body: null
  property var bar: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  readonly property var cfg: body ? body.cfg : M.defaults()
  readonly property string saverId: saver && saver.id ? String(saver.id) : ""
  readonly property bool isUser: !!(saver && saver.kind === "series")
  readonly property bool failed: !!(saver && saver.series && saver.series.error)
  readonly property var rule: M.ruleFor(cfg.situations, saverId)
  readonly property int ruleIndex: M.ruleIndexFor(cfg.situations, saverId)
  readonly property bool hasRule: !!rule && rule.enabled === true
  readonly property var when: rule && rule.when ? rule.when : ({})
  readonly property bool usual: cfg.saver === saverId && !cfg.shuffle
  // The shared Omarchy artwork is the Original's subject; a wordmark has a
  // word of its own instead, and shows this file only when that word is empty.
  readonly property bool showsBranding: saverId === "terminal"
  property bool timingsOpen: false
  property bool deleteArmed: false

  readonly property bool editing: fromField.activeFocus || toField.activeFocus || belowField.field.activeFocus
    || screensaverField.field.activeFocus || lockField.field.activeFocus || look.editing

  function armDelete() { deleteArmed = true; disarm.restart() }
  Timer { id: disarm; interval: 4000; onTriggered: root.deleteArmed = false }
  onSaverIdChanged: { deleteArmed = false; timingsOpen = false }

  function condition(key, on) { if (svc) svc.setRuleCondition(saverId, key, on) }
  function patchCondition(key, patch) { if (svc) svc.patchRuleCondition(saverId, key, patch) }
  function patchRule(patch) { if (body && ruleIndex >= 0) body.updateSituation(ruleIndex, patch) }

  implicitHeight: column.implicitHeight + padding * 2
  padding: Style.space(12)
  radius: Style.cornerRadius
  color: Style.controlFill(false, false, foreground, Color.accent)
  borderSpec: Border.controlSpec("normal", foreground, Color.accent)

  Column {
    id: column
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.margins: root.padding
    spacing: Style.space(8)

    // ---- title and actions ----
    Row {
      width: parent.width
      spacing: Style.space(8)
      Column {
        width: parent.width - actions.width - Style.space(8)
        spacing: Style.space(1)
        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: root.saver && root.saver.name ? root.saver.name : ""
          color: root.foreground
          font.family: root.fontFamily
          font.pixelSize: Style.font.subtitle
          font.bold: true
          elide: Text.ElideRight
        }
        Text {
          width: parent.width
          textFormat: Text.PlainText
          text: root.failed ? "Import failed: " + root.saver.series.error : (root.saver && root.saver.about ? root.saver.about : (root.saver && root.saver.meta ? root.saver.meta : ""))
          color: root.failed ? Color.urgent : root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
          wrapMode: Text.WordWrap
        }
      }
      Row {
        id: actions
        spacing: Style.space(4)
        Button {
          visible: !root.failed
          text: "Preview"
          iconText: "󰐊"
          bordered: true
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          onClicked: if (root.body) root.body.preview(root.saverId)
        }
        Button {
          visible: root.isUser
          text: root.deleteArmed ? "Really delete" : "Delete"
          iconText: "󰆴"
          bordered: true
          selected: root.deleteArmed
          foreground: root.deleteArmed ? Color.urgent : root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          tooltipText: root.deleteArmed ? "Removes its folder and every rule pointing at it" : "Delete this saver"
          onClicked: { if (root.deleteArmed) { if (root.body) root.body.deleteSaver(root.saverId) } else root.armDelete() }
        }
      }
    }

    // ---- plays when ----
    Column {
      visible: !root.failed
      width: parent.width
      spacing: Style.space(4)

      Row {
        spacing: Style.space(8)
        // Naming the saver here is the whole point: every switch below writes
        // a rule that belongs to it, and that rule shows up in Rules under
        // this same name.
        PanelSectionHeader { text: "WHEN " + (root.saver && root.saver.name ? String(root.saver.name).toUpperCase() : "IT") + " PLAYS"; foreground: root.foreground; fontFamily: root.fontFamily }
        Text {
          anchors.baseline: parent.children[0].baseline
          textFormat: Text.PlainText
          text: root.usual
            ? (root.hasRule ? "usually, and whenever all of these are true" : "usually — whenever nothing else is due")
            : (root.hasRule ? "whenever all of these are true" : (root.cfg.shuffle ? "in the shuffle, if checked" : "only if you switch something on below, or click its tile"))
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }

      Toggle {
        width: parent.width
        label: "At night"
        description: M.ruleHas(root.rule, "night") ? "" : "Between two times of day, wrapping midnight"
        checked: M.ruleHas(root.rule, "night")
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.condition("night", !checked)
      }
      Row {
        visible: M.ruleHas(root.rule, "night")
        leftPadding: Style.space(12)
        spacing: Style.space(8)
        Column {
          spacing: Style.space(3)
          Text { textFormat: Text.PlainText; text: "From"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
          TextField {
            id: fromField
            width: Style.space(80)
            text: root.when.night ? String(root.when.night.from || "") : ""
            placeholderText: "17:00"
            foreground: root.foreground
            font.family: root.fontFamily
            onEditingFinished: if (M.hhmm(text) >= 0) root.patchCondition("night", { from: text.trim() })
          }
        }
        Column {
          spacing: Style.space(3)
          Text { textFormat: Text.PlainText; text: "To"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
          TextField {
            id: toField
            width: Style.space(80)
            text: root.when.night ? String(root.when.night.to || "") : ""
            placeholderText: "08:30"
            foreground: root.foreground
            font.family: root.fontFamily
            onEditingFinished: if (M.hhmm(text) >= 0) root.patchCondition("night", { to: text.trim() })
          }
        }
      }

      Toggle {
        width: parent.width
        label: "On battery"
        description: M.ruleHas(root.rule, "battery") ? "" : "Unplugged, or below a charge level"
        checked: M.ruleHas(root.rule, "battery")
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.condition("battery", !checked)
      }
      Row {
        visible: M.ruleHas(root.rule, "battery")
        leftPadding: Style.space(12)
        spacing: Style.space(8)
        NumberField {
          id: belowField
          label: "Below %"
          value: root.when.battery && isFinite(Number(root.when.battery.below)) ? Number(root.when.battery.below) : 100
          from: 1
          to: 100
          stepSize: 5
          foreground: root.foreground
          fontFamily: root.fontFamily
          onModified: function(v) { root.patchCondition("battery", { below: v }) }
        }
        Text {
          anchors.bottom: parent.bottom
          anchors.bottomMargin: Style.space(8)
          textFormat: Text.PlainText
          text: "100 = whenever unplugged"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }

      Toggle {
        width: parent.width
        label: "Docked"
        description: M.ruleHas(root.rule, "docked") ? "" : "A monitor is plugged in"
        checked: M.ruleHas(root.rule, "docked")
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.condition("docked", !checked)
      }
      Toggle {
        width: parent.width
        label: "With a theme"
        description: M.ruleHas(root.rule, "theme") ? "" : "While a particular Omarchy theme is set"
        checked: M.ruleHas(root.rule, "theme")
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.condition("theme", !checked)
      }
      Row {
        visible: M.ruleHas(root.rule, "theme")
        leftPadding: Style.space(12)
        Dropdown {
          width: Style.space(220)
          label: "Theme"
          options: root.svc ? root.svc.themeNames : []
          value: root.when.theme ? String(root.when.theme.name || "") : ""
          foreground: root.foreground
          fontFamily: root.fontFamily
          onChanged: function(v) { root.patchCondition("theme", { name: v }) }
        }
      }

      // Timings only make sense once there is a rule to hang them on.
      Button {
        visible: root.hasRule
        text: "Different timings at those times"
        iconText: root.timingsOpen ? "󰅀" : "󰅂"
        leftAlign: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        onClicked: root.timingsOpen = !root.timingsOpen
      }
      Column {
        visible: root.hasRule && root.timingsOpen
        width: parent.width
        leftPadding: Style.space(12)
        spacing: Style.space(6)
        Row {
          spacing: Style.space(8)
          NumberField {
            id: screensaverField
            label: "Screensaver after (seconds)"
            value: root.rule && isFinite(Number(root.rule.screensaver)) && root.rule.screensaver !== null && root.rule.screensaver !== "" ? Number(root.rule.screensaver) : 0
            from: 0
            to: 3600
            stepSize: 15
            foreground: root.foreground
            fontFamily: root.fontFamily
            onModified: function(v) { root.patchRule({ screensaver: v > 0 ? v : null }) }
          }
          NumberField {
            id: lockField
            label: "Lock after (seconds)"
            enabled: !root.rule || root.rule.lock !== "never"
            value: root.rule && root.rule.lock !== "never" && isFinite(Number(root.rule.lock)) && root.rule.lock !== null && root.rule.lock !== "" ? Number(root.rule.lock) : 0
            from: 0
            to: 7200
            stepSize: 30
            foreground: root.foreground
            fontFamily: root.fontFamily
            onModified: function(v) { root.patchRule({ lock: v > 0 ? v : null }) }
          }
        }
        Text { textFormat: Text.PlainText; text: "0 keeps the usual timing"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        Toggle {
          width: parent.width - parent.leftPadding
          label: "Don't lock at those times"
          checked: !!root.rule && root.rule.lock === "never"
          foreground: root.foreground
          fontFamily: root.fontFamily
          onClicked: root.patchRule({ lock: checked ? null : "never" })
        }
      }
    }

    // ---- artwork: the branding file, same as Style › Screensaver ----
    Column {
      visible: root.showsBranding
      width: parent.width
      spacing: Style.space(6)
      Row {
        spacing: Style.space(8)
        PanelSectionHeader { text: "ARTWORK"; foreground: root.foreground; fontFamily: root.fontFamily }
        Text {
          anchors.baseline: parent.children[0].baseline
          textFormat: Text.PlainText
          text: "the same file as Style › Screensaver"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
      Flow {
        width: parent.width
        spacing: Style.space(6)
        Button { text: "Use a picture…"; iconText: "󰋩"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; tooltipText: "A PNG or SVG, turned into text art"; onClicked: if (root.svc) root.svc.brandingImage() }
        Button { text: "Edit the text…"; iconText: "󰏫"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; tooltipText: "Opens the art in your editor"; onClicked: if (root.svc) root.svc.brandingText() }
        Button { text: "Back to the Omarchy logo"; iconText: "󰕌"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: if (root.svc) root.svc.brandingReset() }
      }
      Text {
        width: parent.width
        textFormat: Text.PlainText
        wrapMode: Text.WordWrap
        text: "A wordmark with its text cleared shows this too."
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    // ---- look ----
    PanelSectionHeader { visible: look.hasKnobs; text: "LOOK"; foreground: root.foreground; fontFamily: root.fontFamily }
    SaverSettings {
      id: look
      visible: hasKnobs && !root.failed
      width: parent.width
      saverId: root.saverId
      saver: root.saver
      settings: root.cfg.savers[root.saverId] || ({})
      svc: root.svc
      bar: root.bar
      foreground: root.foreground
      fontFamily: root.fontFamily
      leftPadding: 0
      onPatched: function(patch) { if (root.body) root.body.writeSaverSettings(root.saverId, patch) }
    }
  }
}
