import QtQuick
import QtQuick.Controls
import qs.Commons
import qs.Ui
import "panel"
import "StellineModel.js" as M

// The bar icon and its panel. The icon doubles as the stay-awake indicator:
// Omarchy's own coffee cup binds to the stock idle service, which this plugin
// replaces, so the cup's job moves here — same glyph, same hotkey, same flag
// file. Left-click opens the panel, right-click toggles stay awake,
// middle-click previews the current saver.
Panel {
  id: root
  moduleName: M.PLUGIN_ID
  manageIpc: false

  readonly property var svc: bar && bar.shell && typeof bar.shell.serviceFor === "function"
    ? bar.shell.serviceFor(M.PLUGIN_ID) : null
  readonly property bool stayAwake: svc ? svc.stayAwake === true : false
  readonly property color foreground: bar ? bar.barForeground : Color.foreground
  readonly property string fontFamily: bar ? bar.fontFamily : Style.font.family

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  // The service cannot see the bar's injected entry itself; relay it so the
  // idle timeline follows panel edits without re-reading shell.json.
  onSettingsChanged: if (svc) svc.barSettings = settings
  Component.onCompleted: if (svc) svc.barSettings = settings
  Component.onDestruction: if (svc) svc.barSettings = null

  onOpenedChanged: if (opened) {
    body.reset()
    Qt.callLater(function() { keyCatcher.forceActiveFocus() })
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.stayAwake ? "󰅶" : "󱄄"
    active: root.stayAwake
    dimmed: !root.svc
    tooltipText: !root.svc
      ? "Stelline: service not loaded — run omarchy restart shell"
      : (root.stayAwake ? "Staying awake · right-click to allow idle" : "Screensaver · right-click to stay awake")
    onPressed: function(buttonCode) {
      if (buttonCode === Qt.RightButton) {
        // Same call the stock coffee cup makes on omarchy.idle.
        if (root.svc) root.svc.setIdleEnabled(root.stayAwake)
      } else if (buttonCode === Qt.MiddleButton) {
        if (root.svc && typeof root.svc.preview === "function") root.svc.preview("")
      } else {
        root.toggle()
      }
    }
  }

  KeyboardPanel {
    id: panel
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(420))
    contentHeight: panel.fittedContentHeight(body.implicitHeight, Style.space(720))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      blocked: body.editing
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onMoveRequested: function(dx, dy) { body.move(dx, dy) }
      onActivateRequested: body.activate()
      onDeleteRequested: body.remove()
      onTextKey: function(text) { body.hotkey(text) }

      Flickable {
        id: flick
        anchors.fill: parent
        contentWidth: width
        contentHeight: body.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        flickableDirection: Flickable.VerticalFlick
        interactive: contentHeight > height
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }

        Body {
          id: body
          width: flick.width
          svc: root.svc
          bar: root.bar
          foreground: root.foreground
          fontFamily: root.fontFamily
          onCloseRequested: root.close()
          onEnsureVisible: function(y, h) {
            var pad = Style.space(8)
            if (y < flick.contentY + pad) flick.contentY = Math.max(0, y - pad)
            else if (y + h > flick.contentY + flick.height - pad) flick.contentY = Math.min(Math.max(0, flick.contentHeight - flick.height), y + h - flick.height + pad)
          }
        }
      }
    }
  }
}
