import QtQuick
import Quickshell
import qs.Commons
import qs.Ui

// The one row set once and then left alone, collapsed to what it says: the
// menu entry, a hotkey, the bar's cup. Everything inside is a plain row.
Section {
  id: root

  property var svc: null
  property var body: null
  property string menuNote: ""
  readonly property string bindLine: 'o.bind("SUPER + CTRL + S", "Screensaver", "omarchy-shell stelline preview")'

  title: "Shortcuts"
  summary: svc && svc.menuOverrideActive === true ? "Super+Esc shows this one" : "Super+Esc shows the original"
  open: body ? body.openSection === "shortcuts" : false
  hasCursor: body ? body.cursorActive && body.cursorIndex === body.rowShortcuts : false
  onClicked: if (body) body.toggleSection("shortcuts")
  onHovered: function(h) { if (body) body.hoverRow(body.rowShortcuts, h) }

  SwitchRow {
    width: parent.width - parent.leftPadding - parent.rightPadding
    glyph: "󰍜"
    label: "Super+Esc › Screensaver shows this one"
    description: root.menuNote
    checked: root.svc ? root.svc.menuOverrideActive === true : false
    foreground: root.foreground
    fontFamily: root.fontFamily
    onClicked: if (root.svc) { var r = root.svc.setMenuEntry(!checked); root.menuNote = r === "unparseable" ? "Couldn't: your menu extensions file has a mistake in it" : "" }
  }

  ActionRow {
    width: parent.width - parent.leftPadding - parent.rightPadding
    glyph: "󰌌"
    label: "Super+Ctrl+S starts it"
    description: "A line for your key bindings file"
    buttonText: "Copy the line"
    buttonIcon: "󰆏"
    tooltipText: "~/.config/hypr/bindings.lua:  " + root.bindLine
    foreground: root.foreground
    fontFamily: root.fontFamily
    onActivated: Quickshell.execDetached(["bash", "-c", 'printf %s "$1" | wl-copy', "_", root.bindLine])
  }

  ActionRow {
    visible: root.svc ? root.svc.setupDone === true : false
    width: parent.width - parent.leftPadding - parent.rightPadding
    glyph: "󰅶"
    label: "The bar's coffee cup"
    description: "Opens this panel now"
    buttonText: "Put the old one back"
    buttonIcon: "󰕌"
    tooltipText: "Undoes Finish setup: the original indicator returns and the menu entry goes"
    foreground: root.foreground
    fontFamily: root.fontFamily
    onActivated: if (root.svc) root.svc.undoSetup()
  }
}
