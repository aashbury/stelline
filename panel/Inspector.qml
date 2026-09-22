import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// The open tile, below the grid, the same three blocks for every saver:
// when it plays (its rule — the only place a rule is edited), how it looks
// (the knobs of its type), and what sits on top (the widgets). Delete for
// anything but the Original. Editors only appear for what is switched on.
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
  readonly property bool external: !!(saver && saver.kind === "external")
  readonly property bool failed: !!(saver && saver.series && saver.series.error)
  readonly property var rule: M.ruleFor(cfg.situations, saverId)
  readonly property var when: rule && rule.when ? rule.when : ({})
  readonly property var settings: cfg.savers && cfg.savers[saverId] ? cfg.savers[saverId] : ({})
  // The shared Omarchy artwork is the Original's subject; a text saver has a
  // word of its own instead, and shows this file only when that word is empty.
  readonly property bool showsBranding: saverId === "terminal"
  property bool deleteArmed: false

  readonly property bool editing: fromField.activeFocus || toField.activeFocus || belowField.field.activeFocus || look.editing

  function armDelete() { deleteArmed = true; disarm.restart() }
  Timer { id: disarm; interval: 4000; onTriggered: root.deleteArmed = false }
  onSaverIdChanged: deleteArmed = false

  function condition(key, on) { if (svc) svc.setRuleCondition(saverId, key, on) }
  function patchCondition(key, patch) { if (svc) svc.patchRuleCondition(saverId, key, patch) }

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

    // ---- title and delete ----
    Row {
      width: parent.width
      spacing: Style.space(8)
      Column {
        width: parent.width - (actions.visible ? actions.width + Style.space(8) : 0)
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
        visible: !root.external
        spacing: Style.space(4)
        Button {
          text: root.deleteArmed ? "Really delete" : "Delete"
          iconText: "󰆴"
          bordered: true
          selected: root.deleteArmed
          foreground: root.deleteArmed ? Color.urgent : root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          tooltipText: root.deleteArmed ? "Removes it and every rule pointing at it" : "Delete this saver; Add can make another"
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
      // a rule that belongs to it, and the tile's caption says so.
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

    // ---- look: the knobs of this saver's type ----
    PanelSectionHeader { visible: look.hasKnobs && !root.failed; text: "LOOK"; foreground: root.foreground; fontFamily: root.fontFamily }
    SaverSettings {
      id: look
      visible: hasKnobs && !root.failed
      width: parent.width
      saverId: root.saverId
      saver: root.saver
      settings: root.settings
      svc: root.svc
      bar: root.bar
      foreground: root.foreground
      fontFamily: root.fontFamily
      leftPadding: 0
      onPatched: function(patch) { if (root.body) root.body.writeSaverSettings(root.saverId, patch) }
    }

    // ---- on top: the widgets. The Original is Omarchy's own window and
    // carries none. ----
    WidgetRows {
      visible: !root.external && !root.failed
      width: parent.width
      settings: root.settings
      cfg: root.cfg
      foreground: root.foreground
      fontFamily: root.fontFamily
      onPatched: function(patch) { if (root.body) root.body.writeSaverSettings(root.saverId, patch) }
    }
  }
}
