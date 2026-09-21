import QtQuick
import qs.Commons
import qs.Ui
import "../StellineModel.js" as M

// Adding a saver, one decision at a time. Pick where it comes from; pictures
// and clips go through the desktop file chooser (the panel closes for it and
// comes back), then the one choice that matters — ASCII art in the theme's
// colours, or the pictures as they are — and Create. Text and descriptions
// are typed right here. The draft lives in the service so it survives the
// panel closing.
BorderSurface {
  id: root

  property var svc: null
  property var body: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  readonly property var draft: svc && svc.importDraft ? svc.importDraft : null
  readonly property string step: draft && draft.step ? String(draft.step) : "start"
  readonly property string source: draft && draft.source ? String(draft.source) : "images"
  readonly property var paths: draft && Array.isArray(draft.paths) ? draft.paths : []
  readonly property string ai: svc ? String(svc.aiProvider || "") : ""
  property string style: "ascii"
  property bool animated: true

  readonly property bool editing: nameField.activeFocus || textField.activeFocus || promptField.activeFocus
  readonly property string pasteable: svc ? String(svc.clipboardHas || "") : ""

  // Asked each time the card comes up: what is on the clipboard now is what
  // the button should offer. The card itself is always instantiated, so the
  // draft appearing — not Component.onCompleted — is when it opens.
  readonly property bool open: !!draft
  onOpenChanged: if (open && svc) svc.refreshClipboard()

  onStepChanged: {
    style = "ascii"; animated = true
    if (step === "confirm") nameField.text = draft && draft.name ? draft.name : ""
  }
  Component.onCompleted: if (step === "confirm") nameField.text = draft && draft.name ? draft.name : ""

  function update(patch) {
    if (!svc) return
    var d = draft ? M.cloneJson(draft) : M.importDefaults()
    for (var k in patch) d[k] = patch[k]
    svc.importDraft = d
  }
  function cancel() { if (svc) svc.importDraft = null }
  function pick(kind) {
    update({ step: "picking", source: kind === "folder" ? "folder" : (kind === "video" ? "video" : "images") })
    if (svc) svc.pickFiles(kind)
  }
  function create() {
    if (!svc) return
    var spec = draft ? M.cloneJson(draft) : M.importDefaults()
    delete spec.step
    spec.style = root.style
    if (step === "confirm") spec.name = nameField.text
    if (step === "text") { spec.source = "text"; spec.text = textField.text; spec.name = textField.text; spec.style = "ascii" }
    if (step === "prompt") { spec.source = "prompt"; spec.prompt = promptField.text; spec.animated = root.animated; spec.style = "ascii"; spec.name = promptField.text.split(/[,.;]/)[0] }
    if ((step === "text" && spec.text.trim() === "") || (step === "prompt" && spec.prompt.trim() === "")) return
    svc.importSaver(spec)
  }

  readonly property string summary: {
    if (source === "folder") return "The pictures in " + M.baseName(paths[0] || "")
    if (source === "video") return M.baseName(paths[0] || "")
    return paths.length === 1 ? M.baseName(paths[0]) : paths.length + " pictures"
  }

  implicitHeight: column.implicitHeight + padding * 2
  padding: Style.space(12)
  radius: Style.cornerRadius
  color: Style.controlFill(false, false, foreground, Color.accent)
  borderSpec: Border.controlSpec("selected", foreground, Color.accent)

  Column {
    id: column
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.top: parent.top
    anchors.margins: root.padding
    spacing: Style.space(8)

    Row {
      width: parent.width
      spacing: Style.space(8)
      PanelSectionHeader { text: "ADD A SCREENSAVER"; foreground: root.foreground; fontFamily: root.fontFamily }
      Text {
        anchors.baseline: parent.children[0].baseline
        textFormat: Text.PlainText
        text: root.step === "start" ? "" : (root.step === "picking" ? "choose in the file dialog" : root.summary)
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    // ---- start: where it comes from, two equal columns like the power
    // panel's profile row, so the choices read as one set ----
    Grid {
      id: sources
      visible: root.step === "start"
      width: parent.width
      columns: 2
      columnSpacing: Style.space(6)
      rowSpacing: Style.space(6)
      readonly property real cell: (width - columnSpacing) / 2
      // Only when there is something to paste, so it never disappoints.
      Button {
        visible: root.pasteable !== ""
        width: sources.cell
        leftAlign: true
        text: root.pasteable === "image" ? "Paste the picture" : "Paste what you copied"
        iconText: "󰆒"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        tooltipText: "What's on your clipboard — a picture, a file, or a folder"
        onClicked: if (root.svc) root.svc.pasteClipboard()
      }
      Button { width: sources.cell; leftAlign: true; text: "Pictures…"; iconText: "󰋩"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: root.pick("images") }
      Button { width: sources.cell; leftAlign: true; text: "A folder of pictures…"; iconText: "󰉋"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: root.pick("folder") }
      Button { width: sources.cell; leftAlign: true; text: "A video or GIF…"; iconText: "󰕧"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: root.pick("video") }
      Button { width: sources.cell; leftAlign: true; text: "Some text"; iconText: "󰊄"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: root.update({ step: "text" }) }
      Button { visible: root.ai !== ""; width: sources.cell; leftAlign: true; text: "A description"; iconText: "󰚩"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; tooltipText: "Asks your default coding agent for the art"; onClicked: root.update({ step: "prompt" }) }
    }

    // ---- confirm (after the chooser) ----
    Column {
      visible: root.step === "confirm"
      width: parent.width
      spacing: Style.space(8)
      Column {
        spacing: Style.space(3)
        Text { textFormat: Text.PlainText; text: "Name"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        TextField {
          id: nameField
          width: Style.space(260)
          foreground: root.foreground
          font.family: root.fontFamily
          placeholderText: "Acme Co."
        }
      }
      Column {
        spacing: Style.space(3)
        Text { textFormat: Text.PlainText; text: "Show it as"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        ButtonGroup {
          options: root.source === "video"
            ? [{ value: "ascii", label: "an ASCII animation" }, { value: "image", label: "the clip as it is" }]
            : [{ value: "ascii", label: "ASCII art" }, { value: "image", label: root.paths.length === 1 && root.source !== "folder" ? "the picture as it is" : "the pictures as they are" }]
          value: root.style
          foreground: root.foreground
          fontFamily: root.fontFamily
          focusable: false
          onChanged: function(v) { root.style = v }
        }
      }
      Text {
        visible: root.source === "video"
        width: parent.width
        textFormat: Text.PlainText
        wrapMode: Text.WordWrap
        text: root.style === "ascii" ? "The first 20 seconds; takes a minute or so." : "The first 20 seconds."
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    // ---- text ----
    Column {
      visible: root.step === "text"
      spacing: Style.space(3)
      Text { textFormat: Text.PlainText; text: "Text — big letters in your theme's colours"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
      TextField {
        id: textField
        width: Style.space(320)
        foreground: root.foreground
        font.family: root.fontFamily
        placeholderText: "Hello"
        onAccepted: root.create()
      }
    }

    // ---- description ----
    Column {
      visible: root.step === "prompt"
      width: parent.width
      spacing: Style.space(6)
      Column {
        spacing: Style.space(3)
        Text { textFormat: Text.PlainText; text: "Describe it"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        TextField {
          id: promptField
          width: Style.space(360)
          foreground: root.foreground
          font.family: root.fontFamily
          placeholderText: "a robot waving hello, pixel-art style"
          onAccepted: root.create()
        }
      }
      ButtonGroup {
        options: [{ value: "animated", label: "animated" }, { value: "still", label: "a still" }]
        value: root.animated ? "animated" : "still"
        foreground: root.foreground
        fontFamily: root.fontFamily
        focusable: false
        onChanged: function(v) { root.animated = v === "animated" }
      }
      Text {
        width: parent.width
        textFormat: Text.PlainText
        wrapMode: Text.WordWrap
        text: (root.ai.indexOf("agent:") === 0
            ? "Asks " + M.agentName(root.ai.substring(6)) + ", your default agent."
            : "Uses your Anthropic key.") + " A minute or two; you get a notification when it is ready."
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    // ---- actions ----
    Row {
      spacing: Style.space(6)
      Button {
        visible: root.step === "confirm" || root.step === "text" || root.step === "prompt"
        text: "Create"
        iconText: "󰐕"
        bordered: true
        selected: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        onClicked: root.create()
      }
      Button {
        visible: root.step === "confirm"
        text: "Change…"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        onClicked: root.pick(root.source)
      }
      Button {
        text: root.step === "start" ? "Never mind" : "Cancel"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        onClicked: root.cancel()
      }
    }
  }
}
