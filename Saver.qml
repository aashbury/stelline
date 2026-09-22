import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "StellineModel.js" as M
import "savers"

// The screensaver surface: one full-screen Overlay-layer window per monitor,
// every one showing the same saver. Any key, click, wheel or deliberate
// pointer movement on any monitor dismisses all of them through the service,
// which is what cancels the pending lock exactly as the stock screensaver does.
Item {
  id: host

  property var service: null
  readonly property bool shown: service ? service.overlayVisible === true : false
  readonly property string saverId: service ? String(service.overlaySaver || "") : ""
  // Development aid: the same saver in a small corner surface that steals no
  // focus and takes over nothing (`omarchy-shell stelline mini <saver>`).
  readonly property bool miniShown: service ? service.miniVisible === true : false
  readonly property string miniSaverId: service ? String(service.miniSaver || "") : ""

  // One saver instance: the same Scene a tile draws, full size, loaded only
  // while running. The cards show on the focused monitor only.
  component SaverStage: Item {
    id: stage
    property string saverId: ""
    property bool running: false
    property bool showCard: true
    Scene {
      anchors.fill: parent
      service: host.service
      saver: M.saverById(stage.saverId, host.service ? host.service.userSavers : []) || ({})
      active: stage.running && stage.saverId !== ""
      showCards: stage.showCard
    }
  }

  PanelWindow {
    id: mini
    visible: host.miniShown
    anchors { bottom: true; right: true }
    margins { bottom: Style.gapsOut * 2; right: Style.gapsOut * 2 }
    implicitWidth: 480
    implicitHeight: 270
    color: "transparent"
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "stelline-mini"
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    SaverStage { anchors.fill: parent; saverId: host.miniSaverId; running: host.miniShown }
  }

  // Input in the first moments after mapping is compositor noise (focus
  // handoff, a synthetic hover under a stationary pointer), not the user.
  property bool armed: false
  property int graceMs: 600

  Timer {
    id: grace
    interval: host.graceMs
    onTriggered: host.armed = true
  }

  onShownChanged: {
    host.armed = false
    if (shown) grace.restart()
    else grace.stop()
  }

  function dismiss(reason) {
    if (!host.armed || !host.service) return
    host.service.hideScreensaver(reason)
  }

  function next() {
    if (host.service && typeof host.service.nextSaver === "function") host.service.nextSaver()
  }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: win
      required property var modelData
      screen: modelData
      visible: host.shown
      anchors { top: true; bottom: true; left: true; right: true }
      color: "transparent"
      exclusionMode: ExclusionMode.Ignore
      WlrLayershell.namespace: "stelline-saver"
      WlrLayershell.layer: WlrLayer.Overlay
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.Exclusive

      readonly property bool primary: Hyprland.focusedMonitor && Hyprland.focusedMonitor.name
        ? String(Hyprland.focusedMonitor.name) === String(modelData.name)
        : modelData === Quickshell.screens[0]

      PointerMoveGate {
        id: gate
        threshold: 8
      }

      Connections {
        target: host
        function onShownChanged() {
          gate.reset()
          if (host.shown) Qt.callLater(function() { keys.forceActiveFocus() })
        }
      }

      SaverStage { anchors.fill: parent; saverId: host.saverId; running: host.shown; showCard: win.primary }

      MouseArea {
        anchors.fill: parent
        hoverEnabled: true
        acceptedButtons: Qt.AllButtons
        cursorShape: Qt.BlankCursor
        onPressed: function(mouse) { mouse.accepted = true; host.dismiss("click") }
        onWheel: function(wheel) { wheel.accepted = true; host.dismiss("wheel") }
        onPositionChanged: function(mouse) { if (gate.moved(this, mouse)) host.dismiss("pointer") }
      }

      Item {
        id: keys
        anchors.fill: parent
        focus: true
        Keys.priority: Keys.BeforeItem
        Keys.onPressed: function(event) {
          event.accepted = true
          if (!host.armed) return
          if (event.key === Qt.Key_Right || event.key === Qt.Key_N) host.next()
          else host.dismiss("key")
        }
      }
    }
  }
}
