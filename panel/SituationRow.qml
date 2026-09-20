import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// One rule: switch, condition, effect, delete — and, when expanded, its editor.
Column {
  id: root

  property var situation: ({})
  property bool hasCursor: false
  property bool expanded: false
  property var themeNames: []
  property var bar: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  readonly property var when: situation && situation.when ? situation.when : ({})
  readonly property string kind: when.battery ? "battery" : (when.night ? "night" : (when.theme ? "theme" : "unknown"))
  readonly property bool editing: fromField.activeFocus || toField.activeFocus || belowField.field.activeFocus
    || screensaverField.field.activeFocus || lockField.field.activeFocus

  signal clicked()
  signal toggled()
  signal removeRequested()
  signal patched(var patch)
  signal hovered(bool isHovered)

  width: parent ? parent.width : implicitWidth
  spacing: Style.space(4)

  CursorSurface {
    width: parent.width
    implicitHeight: Style.space(44)
    hasCursor: root.hasCursor
    current: root.expanded
    foreground: root.foreground

    MouseArea {
      anchors.fill: parent
      hoverEnabled: true
      onClicked: root.clicked()
      onContainsMouseChanged: root.hovered(containsMouse)
    }

    ToggleSwitch {
      id: enabledSwitch
      anchors.left: parent.left
      anchors.leftMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter
      checked: root.situation.enabled === true
      foreground: root.foreground
      onToggled: root.toggled()
    }

    Column {
      anchors.left: enabledSwitch.right
      anchors.leftMargin: Style.space(10)
      anchors.right: removeButton.left
      anchors.rightMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter
      spacing: Style.space(1)

      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: M.situationLabel(root.situation)
        color: root.situation.enabled === true ? root.foreground : root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.subtitle
        elide: Text.ElideRight
      }
      Text {
        width: parent.width
        textFormat: Text.PlainText
        text: "→ " + (M.situationEffect(root.situation) || "no change")
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
        elide: Text.ElideRight
      }
    }

    PanelActionButton {
      id: removeButton
      anchors.right: parent.right
      anchors.rightMargin: Style.space(8)
      anchors.verticalCenter: parent.verticalCenter
      iconText: "󰅖"
      tooltipText: "Remove this situation"
      foreground: root.foreground
      hoverColor: Color.urgent
      fontFamily: root.fontFamily
      onClicked: root.removeRequested()
    }
  }

  // ---- editor ----
  Column {
    visible: root.expanded
    width: parent.width
    leftPadding: Style.space(12)
    rightPadding: Style.space(8)
    spacing: Style.space(8)

    // condition
    Row {
      visible: root.kind === "battery"
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
        onModified: function(v) { root.patched({ when: { battery: { below: v } } }) }
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

    Row {
      visible: root.kind === "night"
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
          onEditingFinished: if (M.hhmm(text) >= 0) root.patched({ when: { night: { from: text.trim(), to: root.when.night ? root.when.night.to : "07:00" } } })
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
          onEditingFinished: if (M.hhmm(text) >= 0) root.patched({ when: { night: { from: root.when.night ? root.when.night.from : "22:00", to: text.trim() } } })
        }
      }
    }

    Dropdown {
      visible: root.kind === "theme"
      width: Style.space(220)
      label: "Theme"
      options: root.themeNames
      value: root.when.theme ? String(root.when.theme.name || "") : ""
      foreground: root.foreground
      fontFamily: root.fontFamily
      onChanged: function(v) { root.patched({ when: { theme: { name: v } } }) }
    }

    // effect
    Dropdown {
      width: Style.space(220)
      label: "Show"
      options: [{ value: "", label: "the usual saver" }].concat(M.SAVERS.filter(function(s) { return s.kind === "native" }).map(function(s) { return { value: s.id, label: s.name } }))
      value: root.situation.saver ? String(root.situation.saver) : ""
      foreground: root.foreground
      fontFamily: root.fontFamily
      onChanged: function(v) { root.patched({ saver: v === "" ? null : v }) }
    }

    Row {
      spacing: Style.space(8)
      NumberField {
        id: screensaverField
        label: "Screensaver after (s, 0 = keep)"
        value: isFinite(Number(root.situation.screensaver)) && root.situation.screensaver !== null && root.situation.screensaver !== "" ? Number(root.situation.screensaver) : 0
        from: 0
        to: 3600
        stepSize: 15
        foreground: root.foreground
        fontFamily: root.fontFamily
        onModified: function(v) { root.patched({ screensaver: v > 0 ? v : null }) }
      }
      NumberField {
        id: lockField
        label: "Lock after (s, 0 = keep)"
        enabled: root.situation.lock !== "never"
        value: root.situation.lock !== "never" && isFinite(Number(root.situation.lock)) && root.situation.lock !== null && root.situation.lock !== "" ? Number(root.situation.lock) : 0
        from: 0
        to: 7200
        stepSize: 30
        foreground: root.foreground
        fontFamily: root.fontFamily
        onModified: function(v) { root.patched({ lock: v > 0 ? v : null }) }
      }
    }

    Toggle {
      width: parent.width - parent.leftPadding - parent.rightPadding
      label: "Never lock in this situation"
      checked: root.situation.lock === "never"
      foreground: root.foreground
      fontFamily: root.fontFamily
      onClicked: root.patched({ lock: checked ? null : "never" })
    }
  }
}
