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

  // One width for every widget, so the screen stays balanced whatever sits
  // where: each card in a corner, and a corner clock, take the same width;
  // in the middle each card takes the larger one and the clock spans the row
  // of cards under it. What a card holds fits that width — a figure short of
  // height gets smaller inside its card, never the card narrower.
  readonly property real cardWidth: Math.round(Math.min(Style.space(300), root.width * 0.3))
  readonly property real centreCardWidth: Math.round(Math.min(Style.space(300) * 1.6, root.width * 0.3))

  // How much of each side the corner widgets hold, so art drawn in dots can
  // keep out from under them: a card's width and its margins. The art stays
  // centred on the screen, so it keeps the same room on both sides — the
  // wider of the two. What is switched on counts — not what happens to be
  // showing — so the art does not jump when a card comes or goes;
  // notifications under Do Not Disturb never show, so they hold nothing.
  function sideUsed(side) {
    var spots = ["top-" + side, "bottom-" + side]
    for (var i = 0; i < spots.length; i++) {
      if (at(clock, spots[i]) || at(agent, spots[i])) return true
      if (at(notifications, spots[i]) && !(service && service.dnd === true)) return true
    }
    return false
  }
  readonly property real reserveLeft: thumbnail || !showCards || !sideUsed("left") ? 0 : cardWidth + margin * 2
  readonly property real reserveRight: thumbnail || !showCards || !sideUsed("right") ? 0 : cardWidth + margin * 2
  readonly property real reserve: Math.max(reserveLeft, reserveRight)

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
        // Nothing is built for a layer that is not showing (a hidden
        // overlay, a tile the panel has not opened): `active` gates all of it.
        readonly property bool hasClock: root.active && root.at(root.clock, modelData)
        readonly property bool hasAgent: root.active && root.live && root.at(root.agent, modelData)
        readonly property bool hasCard: root.active && root.cards && root.at(root.notifications, modelData)
        // The height this spot's stack may take. A corner has the screen's
        // height, or half of it when the corner above or below it on the
        // same side is in use too; the middle has the whole height.
        readonly property string opposite: (atTop ? "bottom" : "top") + (atLeft ? "-left" : "-right")
        readonly property bool sharesSide: !centre && (root.at(root.clock, opposite) || root.at(root.agent, opposite) || root.at(root.notifications, opposite))
        readonly property real room: root.height - root.margin * 2
        readonly property real budget: sharesSide ? (room - stack.spacing) / 2 : room
        // What the clock and the card leave: the agent's figure is the one
        // thing here that can give, so it takes the rest. In the middle the
        // card sits beside it, not under it.
        readonly property real agentRoom: budget
          - (clockLoader.visible ? clockLoader.height + stack.spacing : 0)
          - (!centre && cardLoader.visible ? cardLoader.height + stack.spacing : 0)

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

          // Each widget is made only for the spot its tile puts it in, and
          // the faces only once there is a size to fit (a face created at
          // zero size fits itself to nothing). Every tile in the grid draws
          // this layer, so a widget built for all five spots of every tile
          // would cost the shell seconds at start-up.
          Loader {
            id: clockLoader
            visible: spot.hasClock
            active: visible && root.width > 0 && root.height > 0
            anchors.right: !spot.centre && !spot.atLeft ? parent.right : undefined
            width: root.thumbnail ? (spot.centre ? root.width : Math.round(root.width * 0.42))
              : (spot.centre ? (cards.width > 0 ? cards.width : root.width) : root.cardWidth)
            // In the middle on its own the face takes the screen; with a card
            // under it, it moves up to make room.
            height: spot.centre
              ? Math.round(root.thumbnail || !(spot.hasCard || spot.hasAgent) ? root.height : spot.budget * 0.4)
              : (root.thumbnail ? Math.round(root.height * 0.3) : Style.space(100))
            sourceComponent: ClockFace {
              compact: !spot.centre
              thumbnail: root.thumbnail
              active: root.active
              settings: root.clock
            }
          }

          // A card decides for itself whether it has anything to show; the
          // column skips it, as it did the card, while it has not. In a
          // corner the two cards stack, one width; in the middle, under a
          // clock that has taken the top of the screen, they sit side by side.
          Grid {
            id: cards
            anchors.horizontalCenter: spot.centre ? parent.horizontalCenter : undefined
            anchors.right: !spot.centre && !spot.atLeft ? parent.right : undefined
            columns: spot.centre ? 2 : 1
            columnSpacing: stack.spacing
            rowSpacing: stack.spacing
            horizontalItemAlignment: spot.centre ? Grid.AlignHCenter : (spot.atLeft ? Grid.AlignLeft : Grid.AlignRight)

            Loader {
              id: agentCard
              active: spot.hasAgent
              visible: active && !!item && item.hasContent
              sourceComponent: AgentWidget {
                large: spot.centre
                service: root.service
                figure: root.agent.figure ? String(root.agent.figure) : ""
                detail: root.agent.detail ? String(root.agent.detail) : "titles"
                cardWidth: spot.centre ? root.centreCardWidth : root.cardWidth
                maxHeight: spot.agentRoom
              }
            }

            Loader {
              id: cardLoader
              active: spot.hasCard
              visible: active && !!item && item.hasContent
              sourceComponent: StatusCard {
                large: spot.centre
                service: root.service
                detail: root.notifications.detail ? String(root.notifications.detail) : "counts"
                matchWidth: spot.centre ? root.centreCardWidth : root.cardWidth
              }
            }
          }
        }
      }
    }
  }
}
