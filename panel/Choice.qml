import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui

// A list-shaped button that names what is chosen and opens onto the choices:
// Omarchy's Dropdown to look at, but its choices open above it when there is
// no room below — in a card whose last rows are these, there often isn't,
// and a list that runs off the panel is clipped. The choices are a plain
// list of `options` ({ value, label }), or whatever `content` draws, which
// calls `pick(value)`.
Item {
  id: root

  property string value: ""
  property var options: []
  property Component content: null
  property real rowHeight: Style.spacing.controlHeight
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property bool popupOpen: popup.opened
  // How tall the choices come to, known before they are first laid out —
  // which is when it is decided whether they open above.
  property real contentHeight: options.length * Style.spacing.popupRowHeight + Math.max(0, options.length - 1) * Style.spacing.labelGap

  signal changed(string value)

  function labelOf(v) {
    for (var i = 0; i < options.length; i++) if (String(options[i].value) === v) return String(options[i].label)
    return v
  }
  function pick(v) { popup.close(); if (v !== value) root.changed(v) }
  function open() { popup.open() }
  function close() { popup.close() }

  implicitWidth: Style.spacing.dropdownWidth
  implicitHeight: rowHeight

  BorderSurface {
    id: trigger
    anchors.fill: parent
    radius: Style.cornerRadius
    readonly property bool hot: triggerMouse.containsMouse || popup.opened
    color: Style.controlFill(false, hot, root.foreground, Color.accent)
    borderSpec: Border.controlSpec(hot ? "hover-cursor" : "normal", root.foreground, Color.accent)

    Text {
      anchors.left: parent.left
      anchors.right: chevron.left
      anchors.verticalCenter: parent.verticalCenter
      anchors.leftMargin: trigger.borderLeft + Style.spacing.controlPaddingX
      anchors.rightMargin: Style.spacing.md
      textFormat: Text.PlainText
      text: root.labelOf(root.value)
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
      elide: Text.ElideRight
    }
    Text {
      id: chevron
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      anchors.rightMargin: trigger.borderRight + Style.spacing.controlGap
      textFormat: Text.PlainText
      text: popup.opened && popup.above ? "󰅃" : "󰅀"
      color: Qt.darker(root.foreground, 1.2)
      font.family: root.fontFamily
      font.pixelSize: Style.font.body
    }
    MouseArea {
      id: triggerMouse
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: popup.opened ? popup.close() : popup.open()
    }
  }

  Popup {
    id: popup
    // Below when it fits in the window, above otherwise; a list as wide as
    // the button, anything wider right-aligned to it.
    property bool above: false
    readonly property real gap: Style.spacing.xxs
    x: Math.min(0, root.width - width)
    width: root.content ? implicitWidth : root.width
    y: above ? -height - gap : root.height + gap
    // A list runs to its border, as Omarchy's do; cards get room round them.
    padding: root.content ? Style.space(6) : Style.spacing.hairline + Style.normalBorderWidth
    focus: true
    onAboutToShow: {
      var win = root.Window.window
      var bottom = root.mapToItem(null, 0, root.height).y
      above = !!win && bottom + gap + root.contentHeight + topPadding + bottomPadding > win.height
    }

    background: BorderSurface {
      color: Color.popups.background
      borderSpec: Border.localOrSurfaceSpec("popups", "border", Color.popups.border, Color.popups.border, Style.normalBorderWidth)
      radius: Style.cornerRadius
    }

    contentItem: Loader {
      focus: true
      Keys.onEscapePressed: popup.close()
      sourceComponent: root.content || plainList
    }
  }

  Component {
    id: plainList
    Column {
      spacing: Style.spacing.labelGap
      Repeater {
        model: root.options
        Rectangle {
          required property var modelData
          readonly property bool chosen: String(modelData.value) === root.value
          width: parent.width
          height: Style.spacing.popupRowHeight
          color: rowMouse.containsMouse ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent"
          Text {
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            anchors.leftMargin: Style.spacing.controlPaddingX
            anchors.rightMargin: Style.spacing.controlPaddingX
            textFormat: Text.PlainText
            text: String(parent.modelData.label)
            color: rowMouse.containsMouse ? Style.hoverStateColor(root.foreground, Color.accent) : (parent.chosen ? Color.accent : root.foreground)
            font.family: root.fontFamily
            font.pixelSize: Style.font.body
            elide: Text.ElideRight
          }
          MouseArea {
            id: rowMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.pick(String(parent.modelData.value))
          }
        }
      }
    }
  }
}
