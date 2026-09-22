import QtQuick
import qs.Commons
import "../StellineModel.js" as M
import "../overlay"

// The layer on top of any saver: a clock, the agent, what arrived. Each one
// sits where its tile says — one of the four corners, or the middle, where
// it is drawn large. Two in the same spot stack, in that order. In a
// thumbnail only the clock is drawn: the cards depend on what has happened,
// and a tile is a picture of the saver.
//
// The whole layer drifts slowly against burn-in. Widgets are the one thing
// on a screensaver that holds still for hours — a card's border is a thin
// bright line in a fixed corner, which is exactly what burns — so they all
// glide together: far enough to take every edge off the pixels it was on,
// slowly enough that nobody watching sees it move, and never further than
// the margin they sit in, so a corner stays in its corner.
Item {
  id: root

  property var service: null
  property var widgets: ({})
  property bool active: false
  property bool thumbnail: false
  property bool showCards: true

  readonly property var clock: widgets && widgets.clock ? widgets.clock : ({})
  readonly property var notifications: widgets && widgets.notifications ? widgets.notifications : ({})
  readonly property var agent: widgets && widgets.agent ? widgets.agent : ({})
  // Do Not Disturb hides what arrived; the agent is status, not an
  // interruption, and stays.
  readonly property bool live: showCards && !thumbnail && !!service
  readonly property bool cards: live && service.dnd !== true
  readonly property real margin: thumbnail ? Style.space(4) : Style.gapsOut * 4
  readonly property real driftAmp: thumbnail || !active ? 0 : Math.max(0, Math.round(margin * 0.6))

  function at(w, spot) { return !!w && w.on === true && w.place === spot }

  Timer {
    interval: 45000
    repeat: true
    running: root.driftAmp > 0 && root.visible
    onTriggered: {
      shift.x = Math.round((Math.random() * 2 - 1) * root.driftAmp)
      shift.y = Math.round((Math.random() * 2 - 1) * root.driftAmp)
    }
  }

  Item {
    id: layer
    anchors.fill: parent
    // A glide, not a jump: over several seconds it reads as the screen
    // breathing rather than as something twitching out of place.
    transform: Translate {
      id: shift
      Behavior on x { NumberAnimation { duration: 9000; easing.type: Easing.InOutSine } }
      Behavior on y { NumberAnimation { duration: 9000; easing.type: Easing.InOutSine } }
    }

    Repeater {
      model: M.PLACES

      Item {
        id: spot
        required property var modelData
        readonly property bool centre: modelData === "centre"
        readonly property bool atTop: String(modelData).indexOf("top") === 0
        readonly property bool atLeft: String(modelData).indexOf("left") !== -1
        readonly property bool hasClock: root.at(root.clock, modelData)
        readonly property bool hasAgent: root.live && root.at(root.agent, modelData)
        readonly property bool hasCard: root.cards && root.at(root.notifications, modelData)

        anchors.centerIn: centre ? parent : undefined
        anchors.top: centre || !atTop ? undefined : parent.top
        anchors.bottom: centre || atTop ? undefined : parent.bottom
        anchors.left: centre || !atLeft ? undefined : parent.left
        anchors.right: centre || atLeft ? undefined : parent.right
        anchors.margins: centre ? 0 : root.margin
        width: centre ? root.width : stack.implicitWidth
        height: centre ? (stack.implicitHeight > 0 ? stack.implicitHeight : 0) : stack.implicitHeight

        Column {
          id: stack
          anchors.horizontalCenter: spot.centre ? parent.horizontalCenter : undefined
          anchors.right: !spot.centre && !spot.atLeft ? parent.right : undefined
          anchors.verticalCenter: spot.centre ? parent.verticalCenter : undefined
          spacing: root.thumbnail ? Style.space(2) : (spot.centre ? Style.space(24) : Style.space(10))

          // Faces are loaded once there is a size to fit, and only when shown:
          // a face created at zero size fits itself to nothing.
          Loader {
            visible: spot.hasClock
            active: visible && root.width > 0 && root.height > 0
            anchors.right: !spot.centre && !spot.atLeft ? parent.right : undefined
            width: spot.centre ? root.width : (root.thumbnail ? Math.round(root.width * 0.42) : Style.space(250))
            // In the middle on its own the face takes the screen; with a card
            // under it, it moves up to make room.
            height: spot.centre
              ? Math.round(root.height * (root.thumbnail || !(spot.hasCard || spot.hasAgent) ? 1 : 0.55))
              : (root.thumbnail ? Math.round(root.height * 0.3) : Style.space(100))
            sourceComponent: ClockFace {
              compact: !spot.centre
              thumbnail: root.thumbnail
              active: root.active
              settings: root.clock
            }
          }

          AgentWidget {
            anchors.horizontalCenter: spot.centre ? parent.horizontalCenter : undefined
            anchors.right: !spot.centre && !spot.atLeft ? parent.right : undefined
            shown: spot.hasAgent
            large: spot.centre
            service: root.service
            figure: root.agent.figure ? String(root.agent.figure) : ""
            maxWidth: spot.centre ? root.width * 0.6 : Math.max(Style.space(300), root.width * 0.4)
            maxHeight: root.height * (spot.hasClock ? 0.35 : 0.55)
          }

          StatusCard {
            anchors.horizontalCenter: spot.centre ? parent.horizontalCenter : undefined
            anchors.right: !spot.centre && !spot.atLeft ? parent.right : undefined
            shown: spot.hasCard
            large: spot.centre
            service: root.service
            detail: root.notifications.detail ? String(root.notifications.detail) : "counts"
            maxWidth: spot.centre ? root.width * 0.6 : Math.max(Style.space(300), root.width * 0.4)
          }
        }
      }
    }
  }
}
