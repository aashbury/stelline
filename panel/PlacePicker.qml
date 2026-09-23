import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// Where a widget sits, picked on a little picture of the screen: four
// corners and the middle. The chosen spot is filled in the accent — the
// middle as a wide bar, because that is where a widget is drawn large — and
// the rest appear under the pointer, so the control teaches itself.
Item {
  id: root

  property string place: "bottom-right"
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)

  signal picked(string place)

  implicitWidth: Style.space(72)
  implicitHeight: Style.space(46)

  BorderSurface {
    anchors.fill: parent
    radius: Style.cornerRadius
    color: "transparent"
    borderSpec: Border.controlSpec("normal", root.foreground, Color.accent)
  }

  Grid {
    anchors.fill: parent
    anchors.margins: Style.space(5)
    columns: 3
    rows: 3

    Repeater {
      model: 9

      // The nine cells of the box; the four corners and the middle are the
      // spots, the rest are only spacing.
      Item {
        required property int index
        readonly property int row: Math.floor(index / 3)
        readonly property int column: index % 3
        readonly property string spot: {
          if (row === 1 && column === 1) return "centre"
          if (row === 1 || column === 1) return ""
          return (row === 0 ? "top-" : "bottom-") + (column === 0 ? "left" : "right")
        }
        readonly property bool chosen: spot !== "" && spot === root.place

        width: Math.floor((root.width - Style.space(10)) / 3)
        height: Math.floor((root.height - Style.space(10)) / 3)

        Rectangle {
          anchors.centerIn: parent
          visible: parent.spot !== ""
          // The spots grow with the picture, so a taller picker is not a
          // big empty box with pinpricks in it.
          readonly property real dot: Math.max(Style.space(7), Math.round(root.height * 0.11))
          width: parent.spot === "centre" ? Math.round(parent.width * 0.62) : dot
          height: dot
          radius: height / 2
          color: parent.chosen ? Color.accent : root.dim
          opacity: parent.chosen ? 1 : (mouse.containsMouse ? 0.75 : 0.22)
          Behavior on opacity { NumberAnimation { duration: 90 } }
          Behavior on color { ColorAnimation { duration: 90 } }
        }

        MouseArea {
          id: mouse
          anchors.fill: parent
          enabled: parent.spot !== ""
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: root.picked(parent.spot)
        }

        PanelToolTip {
          text: M.placeLabel(parent.spot)
          visible: mouse.containsMouse && parent.spot !== ""
        }
      }
    }
  }
}
