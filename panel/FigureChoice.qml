import QtQuick
import qs.Commons
import qs.Ui
import "../savers"
import "../savers/Robot.js" as R

// Which figure the agent is drawn as: a list that names it, opening onto the
// figures themselves, at work, to pick from — so what you click is what you
// get.
Choice {
  id: root

  property string figure: ""
  readonly property color dim: Qt.darker(foreground, 1.4)

  signal picked(string figure)

  // How each figure shows the states, for its tooltip.
  readonly property var hints: ({
    deck: "types while an agent works, lifts off the keys when one needs you",
    visor: "code runs across its visor while an agent works, it looks up when one needs you",
    morty: "watches the screen while an agent works, grins when one is waiting on you"
  })

  value: R.figureId(figure)
  options: R.FIGURES.map(function(f) { return { value: f.id, label: f.name } })
  implicitWidth: Style.space(104)
  contentHeight: Style.space(90)
  onChanged: function(v) { root.picked(v) }

  content: Component {
    Row {
      spacing: Style.space(6)

      Repeater {
        model: R.FIGURES

        BorderSurface {
          id: card
          required property var modelData
          readonly property bool chosen: root.value === modelData.id
          readonly property bool hot: mouse.containsMouse

          // Tall enough for the figure to still read at a glance: the art is
          // all but square, and below about this it turns to mush.
          width: Style.space(82)
          height: Style.space(90)
          radius: Style.cornerRadius
          color: card.chosen ? Style.selectedFillFor(root.foreground, Color.accent)
            : (card.hot ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent")
          borderSpec: card.chosen ? Border.controlSpec("selected", root.foreground, Color.accent)
            : (card.hot ? Border.controlSpec("hover-cursor", root.foreground, Color.accent)
                        : Border.controlSpec("normal", root.foreground, Color.accent))

          Column {
            anchors.fill: parent
            anchors.margins: Style.space(5)
            spacing: Style.space(2)

            RobotFigure {
              width: parent.width
              height: parent.height - name.height - parent.spacing
              figure: card.modelData.id
              agentState: "working"
              tone: card.chosen ? root.foreground : root.dim
              light: card.chosen ? Color.accent : root.dim
              fontFamily: root.fontFamily
              opacity: card.chosen ? 1 : (card.hot ? 0.9 : 0.55)
              Behavior on opacity { NumberAnimation { duration: 90 } }
            }

            Text {
              id: name
              width: parent.width
              horizontalAlignment: Text.AlignHCenter
              textFormat: Text.PlainText
              text: card.modelData.name
              color: card.chosen ? Color.accent : root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
              elide: Text.ElideRight
            }
          }

          MouseArea {
            id: mouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: root.pick(card.modelData.id)
          }

          // What picking it gets you, in the terms you will see it in.
          PanelToolTip {
            visible: mouse.containsMouse
            text: card.modelData.name + ": " + (root.hints[card.modelData.id] || "")
          }
        }
      }
    }
  }
}
