import QtQuick
import qs.Commons

// An empty screen: nothing of its own, in the theme's background or black,
// for the widgets to sit on — or for a battery rule to point at.
Item {
  property bool active: false
  property bool thumbnail: false
  property var service: null
  property var settings: ({})
  readonly property color bg: settings && settings.background === "theme" ? Color.background : "black"

  Rectangle { anchors.fill: parent; color: bg }
}
