import QtQuick
import qs.Commons
import "../StellineModel.js" as M

// One saver, composed: the base that fills the screen, drawn by the QML its
// type names, and the widgets on top. The tile and the full-screen surface
// both draw exactly this, so what a tile shows is what plays.
Item {
  id: root

  property var service: null
  property var saver: ({})
  property bool active: false
  property bool thumbnail: false
  property bool showCards: true

  readonly property var cfg: service ? service.cfg : M.defaults()
  readonly property string saverId: saver && saver.id ? String(saver.id) : ""
  readonly property var settings: cfg && cfg.savers && cfg.savers[saverId] ? cfg.savers[saverId] : ({})
  readonly property string file: saver ? String(thumbnail && saver.thumb ? saver.thumb : (saver.file || "")) : ""
  readonly property bool external: !!(saver && saver.kind === "external")
  readonly property color bg: loader.item && loader.item.bg !== undefined ? loader.item.bg : Color.background

  Rectangle { anchors.fill: parent; color: root.bg }

  Loader {
    id: loader
    anchors.fill: parent
    active: root.active && root.file !== ""
    source: active ? Qt.resolvedUrl("../" + root.file) : ""
    onLoaded: {
      item.service = root.service
      if ("thumbnail" in item) item.thumbnail = root.thumbnail
      if ("fallbackArt" in item && root.saver && root.saver.fallbackArt)
        item.fallbackArt = String(Qt.resolvedUrl("../" + root.saver.fallbackArt)).replace(/^file:\/\//, "")
      // Only a text saver names itself; the Original borrows the same
      // renderer for its thumbnail and wants the branding file as it is.
      if ("wordmarkId" in item && M.saverType(root.saver) === "text") item.wordmarkId = root.saverId
      item.settings = Qt.binding(function() { return root.settings })
      if ("series" in item) item.series = Qt.binding(function() { return root.saver && root.saver.series ? root.saver.series : ({}) })
      item.active = Qt.binding(function() { return root.active })
      // Art in dots keeps out from under the corner widgets.
      if ("artRoom" in item) item.artRoom = Qt.binding(function() { return root.width > 0 ? Math.max(0.3, 1 - 2 * widgets.reserve / root.width) : 1 })
    }
  }

  Widgets {
    id: widgets
    anchors.fill: parent
    visible: !root.external && loader.active
    service: root.service
    widgets: M.widgetsOf(root.settings, root.cfg)
    active: root.active
    thumbnail: root.thumbnail
    showCards: root.showCards
  }
}
