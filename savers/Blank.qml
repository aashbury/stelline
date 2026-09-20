import QtQuick

// Nothing at all: the cheapest thing a screen can show, so a battery rule has
// somewhere free to point.
Item {
  property bool active: false
  property var service: null
  property var settings: ({})
  readonly property color bg: "black"

  Rectangle { anchors.fill: parent; color: "black" }
}
