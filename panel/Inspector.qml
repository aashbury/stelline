import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// The open tile, below the grid: when this saver plays (its rule), how it
// looks (its knobs), and delete. One rule per saver; its conditions all have
// to hold, and this is the rule's only editor — Rules lists it and links
// back here. Editors only appear for conditions that are on.
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
  // The shared Omarchy artwork is the Original's subject; a wordmark has a
  // word of its own instead, and shows this file only when that word is empty.
  readonly property bool showsBranding: saverId === "terminal"
  // Its own timings while the rule holds; absent means the usual ones. The
  // two sliders are the same two as at the top of the panel.
  readonly property bool ownTimings: hasRule && (M.hasTiming(rule.screensaver) || M.hasTiming(rule.lock))
  readonly property int usualScreensaver: body ? body.screensaverSeconds : 150
  readonly property int usualLock: body ? body.lockSeconds : 300
  readonly property int ruleScreensaver: hasRule && M.hasTiming(rule.screensaver) ? Number(rule.screensaver) : usualScreensaver
  readonly property bool ruleLocks: !(hasRule && rule.lock === "never")
  readonly property int ruleLock: hasRule && M.hasTiming(rule.lock) && rule.lock !== "never" ? Number(rule.lock) : usualLock
  property bool deleteArmed: false

  readonly property bool editing: fromField.activeFocus || toField.activeFocus || belowField.field.activeFocus || look.editing

  function armDelete() { deleteArmed = true; disarm.restart() }
  Timer { id: disarm; interval: 4000; onTriggered: root.deleteArmed = false }
  onSaverIdChanged: deleteArmed = false

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
        width: parent.width - actions.width - (actions.visible ? Style.space(8) : 0)
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
        visible: root.isUser
        spacing: Style.space(4)
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
      spacing: Style.space(2)

      // Naming the saver here is the whole point: every switch below writes
      // a rule that belongs to it, and Rules lists it under this same name.
      PanelSectionHeader { text: "WHEN " + (root.saver && root.saver.name ? String(root.saver.name).toUpperCase() : "IT") + " PLAYS"; foreground: root.foreground; fontFamily: root.fontFamily }

      SwitchRow {
        width: parent.width
        glyph: "󰖔"
        label: "At night"
        checked: M.ruleHas(root.rule, "night")
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.condition("night", !checked)
      }
      Row {
        visible: M.ruleHas(root.rule, "night")
        leftPadding: Style.space(36)
        bottomPadding: Style.space(6)
        spacing: Style.space(8)
        Column {
          spacing: Style.space(3)
          Text { textFormat: Text.PlainText; text: "From"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
          TextField {
            id: fromField
            width: Style.space(80)
            text: root.when.night ? String(root.when.night.from || "") : ""
            placeholderText: "22:00"
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
            placeholderText: "07:00"
            foreground: root.foreground
            font.family: root.fontFamily
            onEditingFinished: if (M.hhmm(text) >= 0) root.patchCondition("night", { to: text.trim() })
          }
        }
      }

      SwitchRow {
        width: parent.width
        glyph: "󰁹"
        label: "On battery"
        checked: M.ruleHas(root.rule, "battery")
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.condition("battery", !checked)
      }
      Row {
        visible: M.ruleHas(root.rule, "battery")
        leftPadding: Style.space(36)
        bottomPadding: Style.space(6)
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
          anchors.bottomMargin: Style.space(14)
          textFormat: Text.PlainText
          text: "100 = whenever unplugged"
          color: root.dim
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }

      SwitchRow {
        width: parent.width
        glyph: "󰍹"
        label: "Docked"
        checked: M.ruleHas(root.rule, "docked")
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.condition("docked", !checked)
      }

      SwitchRow {
        width: parent.width
        glyph: "󰏘"
        label: "With a theme"
        checked: M.ruleHas(root.rule, "theme")
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.condition("theme", !checked)
      }
      Row {
        visible: M.ruleHas(root.rule, "theme")
        leftPadding: Style.space(36)
        bottomPadding: Style.space(6)
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

      // Timings only make sense once there is a rule to hang them on. On
      // starts from the usual values; the sliders take it from there.
      SwitchRow {
        visible: root.hasRule
        width: parent.width
        glyph: "󰅐"
        label: "Different timings at those times"
        checked: root.ownTimings
        foreground: root.foreground
        fontFamily: root.fontFamily
        onClicked: root.patchRule(checked ? { screensaver: null, lock: null } : { screensaver: root.usualScreensaver, lock: root.usualLock })
      }
      Column {
        visible: root.hasRule && root.ownTimings
        width: parent.width
        leftPadding: Style.space(24)
        spacing: Style.space(2)
        SliderRow {
          width: parent.width - parent.leftPadding
          bar: root.bar
          label: "Screensaver"
          value: root.ruleScreensaver
          minimum: 30
          maximum: 1800
          step: 30
          format: function(v) { return M.mmss(v) }
          foreground: root.foreground
          fontFamily: root.fontFamily
          onReleased: function(v) { root.patchRule({ screensaver: Math.round(v) }) }
        }
        SliderRow {
          width: parent.width - parent.leftPadding
          bar: root.bar
          label: "Lock"
          value: root.ruleLock
          minimum: 60
          maximum: 3600
          step: 60
          format: function(v) { return M.mmss(v) }
          showSwitch: true
          switchChecked: root.ruleLocks
          foreground: root.foreground
          fontFamily: root.fontFamily
          onReleased: function(v) { root.patchRule({ lock: Math.round(v) }) }
          onSwitchToggled: root.patchRule({ lock: root.ruleLocks ? "never" : root.usualLock })
        }
      }
    }

    // ---- artwork: the branding file, same as Style › Screensaver ----
    Column {
      visible: root.showsBranding
      width: parent.width
      spacing: Style.space(6)
      PanelSectionHeader { text: "ARTWORK"; foreground: root.foreground; fontFamily: root.fontFamily }
      Flow {
        width: parent.width
        spacing: Style.space(6)
        Button { text: "Use a picture…"; iconText: "󰋩"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; tooltipText: "A PNG or SVG, turned into text art"; onClicked: if (root.svc) root.svc.brandingImage() }
        Button { text: "Edit the text…"; iconText: "󰏫"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; tooltipText: "Opens the art in your editor — the same file as Style › Screensaver"; onClicked: if (root.svc) root.svc.brandingText() }
        Button { text: "Back to the Omarchy logo"; iconText: "󰕌"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: if (root.svc) root.svc.brandingReset() }
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
