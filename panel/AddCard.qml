import QtQuick
import qs.Commons
import qs.Ui
import "../savers"
import "../StellineModel.js" as M

// Adding a saver is one card. Say what it should show, or attach a picture,
// or both; what gets made follows from what is there, and the card asks
// only the one question that is left open. Words alone are drawn by your
// agent, or set in big letters. A picture is the subject: it becomes a dot
// matrix of whatever it is a picture of, and you see both ways of showing it
// before choosing. Words alongside a picture name it. The draft lives in the
// service so it survives the panel closing for the file chooser; the words
// live in the field until the card needs them.
BorderSurface {
  id: root

  property var svc: null
  property var body: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  readonly property color dim: Qt.darker(foreground, 1.4)
  readonly property var draft: svc && svc.importDraft ? svc.importDraft : null
  readonly property string step: draft && draft.step ? String(draft.step) : "start"
  readonly property bool picking: step === "picking"
  readonly property string ai: svc ? String(svc.aiProvider || "") : ""
  readonly property string pasteable: svc ? String(svc.clipboardHas || "") : ""
  readonly property bool open: !!draft

  readonly property string words: wordsField.text.trim()
  readonly property string source: draft && draft.source ? String(draft.source) : ""
  readonly property bool attached: !!(draft && draft.source && Array.isArray(draft.paths) && draft.paths.length)
  readonly property string attachment: draft ? M.attachmentLabel(draft, svc ? String(svc.pasteStageDir || "") : "") : ""
  property string style: "ascii"
  property bool animated: true
  property bool letters: false
  // The draft as it stands with what the card holds right now.
  readonly property var live: {
    var d = draft ? M.cloneJson(draft) : M.importDefaults()
    d.words = root.words; d.style = root.style; d.animated = root.animated; d.letters = root.letters
    return d
  }
  readonly property string mode: M.composeMode(live, ai)
  readonly property bool describing: mode === "describe" || mode === "describe-pictures"
  // One picture as ASCII is the only conversion that can be still or moving.
  // One picture is the only thing that can be asked to move or sit still.
  readonly property bool movable: M.canMove(live, mode)
  readonly property bool converting: mode === "pictures" || mode === "folder" || mode === "clip"
  // The conversion of what is attached, once it is of the current attachment.
  readonly property var preview: svc && svc.draftPreview && attached && String(svc.draftPreview.path) === String(draft.paths[0]) ? svc.draftPreview : null

  readonly property bool editing: wordsField.activeFocus
  readonly property bool canCreate: mode !== "" && !picking
  readonly property string agentName: ai.indexOf("agent:") === 0 ? M.agentName(ai.substring(6)) : (ai === "api" ? "the Claude API" : "")

  readonly property string placeholder: {
    if (!attached) return ai !== "" ? "Describe it, or paste a picture" : "Words to show in big letters, or paste a picture"
    if (source === "images" && M.seesPictures(ai)) return "What to draw from it, or leave this empty"
    return "A name for it, or leave this empty"
  }
  readonly property string caption: {
    if (mode === "describe") return "Asks " + agentName + ". Usually under a minute; the tile fills in when it is ready."
    // A likeness asked of an agent is the one thing it cannot give: it
    // redraws rather than copies. The conversion does copy, exactly.

    if (mode === "letters") return "Big letters in your theme's colours."
    if (movable) {
      var who = root.ai !== "" ? agentName + " is asked what the picture is of, so the dots are of that rather than of the whole frame. " : ""
      return who + (animated
        ? "The dots light up across it, rest, go out, and light up another way."
        : "Every dot at once, the colour breathing.")
    }
    if (mode === "clip") return style === "ascii" ? "The first 20 seconds; takes a minute or so." : "The first 20 seconds."
    if (converting && words !== "") return "Named “" + M.shortName(words) + "”."
    return ""
  }

  // What the card holds is restored whenever it comes back: opened afresh,
  // or re-made with the panel while a chooser was up.
  function restore() {
    wordsField.text = draft && draft.words ? String(draft.words) : ""
    style = draft && draft.style === "image" ? "image" : "ascii"
    animated = !draft || draft.animated !== false
    letters = !!(draft && draft.letters)
  }
  onOpenChanged: if (open) { restore(); if (svc) svc.refreshClipboard(); wordsField.forceActiveFocus() }
  onStepChanged: if (step === "start" && wordsField.text === "" && draft && draft.words) wordsField.text = String(draft.words)
  Component.onCompleted: if (open) restore()

  function update(patch) {
    if (!svc) return
    var d = draft ? M.cloneJson(draft) : M.importDefaults()
    for (var k in patch) d[k] = patch[k]
    svc.importDraft = d
  }
  // The field's words go to the draft before anything closes the panel.
  function sync(extra) {
    var patch = { words: wordsField.text, style: root.style, animated: root.animated, letters: root.letters }
    for (var k in (extra || {})) patch[k] = extra[k]
    update(patch)
  }
  function cancel() { if (svc) svc.importDraft = null }
  function pick(kind) {
    sync({ step: "picking" })
    if (svc) svc.pickFiles(kind)
  }
  function paste() {
    if (!svc || pasteable === "") return
    sync({})
    svc.pasteClipboard()
  }
  function detach() { if (svc) { var d = M.detach(live); d.step = "start"; svc.importDraft = d } }
  // A clock, or an empty screen for widgets: nothing to convert, made at once.
  function createNow(source) {
    if (!svc) return
    var spec = M.importDefaults()
    spec.source = source
    var id = svc.importSaver(spec)
    if (body && typeof id === "string" && id !== "" && id.indexOf("bad") !== 0) body.openSettings = id
  }
  function create() {
    if (!svc || !canCreate) return
    var spec = M.composeSpec(live, ai, svc.pasteStageDir)
    if (!spec) return
    var id = svc.importSaver(spec)
    // The tile opens below the grid as it lands: Preview is one click away,
    // and a description can be changed from there.
    if (body && typeof id === "string" && id !== "" && id.indexOf("bad") !== 0) body.openSettings = id
  }

  implicitHeight: column.implicitHeight + padding * 2
  padding: Style.space(12)
  radius: Style.cornerRadius
  color: Style.controlFill(false, false, foreground, Color.accent)
  borderSpec: Border.controlSpec("selected", foreground, Color.accent)

  // One of the two ways a picture can be shown, as a picture of it.
  component Thumb: BorderSurface {
    id: thumb
    property string label: ""
    property bool chosen: false
    readonly property bool hot: thumbMouse.containsMouse
    default property alias content: slot.data
    signal picked()
    width: Style.space(196)
    height: Style.space(128)
    radius: Style.cornerRadius
    color: chosen ? Style.selectedFillFor(root.foreground, Color.accent) : (hot ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent")
    borderSpec: Border.controlSpec(chosen ? "selected" : (hot ? "hover-cursor" : "normal"), root.foreground, Color.accent)
    Item {
      id: slot
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.top: parent.top
      anchors.margins: Style.space(6)
      height: parent.height - Style.space(6) * 2 - thumbLabel.height - Style.space(4)
      clip: true
      opacity: thumb.chosen ? 1 : (thumb.hot ? 0.9 : 0.6)
    }
    Text {
      id: thumbLabel
      anchors.left: parent.left
      anchors.right: parent.right
      anchors.bottom: parent.bottom
      anchors.margins: Style.space(6)
      textFormat: Text.PlainText
      text: thumb.label
      color: thumb.chosen ? Color.accent : root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      elide: Text.ElideRight
    }
    MouseArea {
      id: thumbMouse
      anchors.fill: parent
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onClicked: thumb.picked()
    }
  }

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
        text: root.picking ? "choose in the file dialog" : ""
        color: root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }

    // ---- the words ----
    TextField {
      id: wordsField
      width: parent.width
      foreground: root.foreground
      font.family: root.fontFamily
      placeholderText: root.placeholder
      onAccepted: root.create()
      onEditingFinished: if (root.open && !root.picking) root.sync({})
      // Ctrl+V with a picture or a file on the clipboard attaches it; plain
      // text still pastes into the field.
      Keys.priority: Keys.BeforeItem
      Keys.onPressed: function(event) {
        if (event.matches(StandardKey.Paste) && root.pasteable !== "") { root.paste(); event.accepted = true }
      }
      Keys.onEscapePressed: wordsField.focus = false
    }

    // ---- what is attached, and how to attach ----
    Flow {
      width: parent.width
      spacing: Style.space(6)
      // Only when there is something to paste, so it never disappoints.
      Button {
        visible: root.pasteable !== "" && !root.picking
        leftAlign: true
        text: root.pasteable === "image" ? "Paste the picture" : "Paste what you copied"
        iconText: "󰆒"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        tooltipText: "What's on your clipboard — a picture, a file, or a folder. Ctrl+V does the same."
        onClicked: root.paste()
      }
      Button { visible: !root.picking; leftAlign: true; text: "Pictures or a clip…"; iconText: "󰋩"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: root.pick("media") }
      Button { visible: !root.picking; leftAlign: true; text: "A folder…"; iconText: "󰉋"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; tooltipText: "Every picture in it"; onClicked: root.pick("folder") }
      // The attachment, as a chip that can be taken off again.
      BorderSurface {
        visible: root.attached
        width: chipRow.implicitWidth + Style.space(16)
        height: chipRow.implicitHeight + Style.space(8)
        radius: Style.cornerRadius
        color: Style.selectedFillFor(root.foreground, Color.accent)
        borderSpec: Border.controlSpec("selected", root.foreground, Color.accent)
        Row {
          id: chipRow
          anchors.centerIn: parent
          spacing: Style.space(6)
          Text { textFormat: Text.PlainText; text: root.source === "folder" ? "󰉋" : (root.source === "video" ? "󰕧" : "󰋩"); color: Color.accent; font.family: root.fontFamily; font.pixelSize: Style.font.icon; anchors.verticalCenter: parent.verticalCenter }
          Text { textFormat: Text.PlainText; text: root.attachment; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.caption; anchors.verticalCenter: parent.verticalCenter }
          Text {
            textFormat: Text.PlainText
            text: "󰅖"
            color: offMouse.containsMouse ? root.foreground : root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            anchors.verticalCenter: parent.verticalCenter
            MouseArea { id: offMouse; anchors.fill: parent; anchors.margins: -Style.space(4); hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.detach() }
            PanelToolTip { visible: offMouse.containsMouse; text: "Take it off" }
          }
        }
      }
    }

    // ---- the one question left: what to make of words ----
    Row {
      visible: root.describing || root.movable || (root.mode === "letters" && root.ai !== "")
      spacing: Style.space(8)
      Text { anchors.verticalCenter: parent.verticalCenter; textFormat: Text.PlainText; text: "Make it"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
      ButtonGroup {
        options: root.movable
          ? [{ value: "animation", label: "moving" }, { value: "still", label: "a still" }]
          : [{ value: "animation", label: "an animation" }, { value: "still", label: "a still" }, { value: "letters", label: "big letters" }]
        value: root.letters && !root.movable ? "letters" : (root.animated ? "animation" : "still")
        foreground: root.foreground
        fontFamily: root.fontFamily
        focusable: false
        onChanged: function(v) {
          root.letters = v === "letters"
          if (v === "animation" || v === "still") root.animated = v === "animation"
        }
      }
    }

    // ---- ...or of a picture: both ways, as pictures ----
    Column {
      visible: root.converting
      width: parent.width
      spacing: Style.space(4)
      Text { textFormat: Text.PlainText; text: "Show it as"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
      Row {
        spacing: Style.space(8)
        Thumb {
          label: root.mode === "clip" ? "an ASCII animation" : (root.movable && root.animated ? "a dot matrix, moving" : "a dot matrix")
          chosen: root.style === "ascii"
          onPicked: root.style = "ascii"
          AsciiArt {
            anchors.fill: parent
            visible: !!root.preview
            art: root.preview ? String(root.preview.art) : ""
            fg: root.foreground
            fontFamily: root.fontFamily
            fitWidth: 0.98
            fitHeight: 0.98
          }
          Text { anchors.centerIn: parent; visible: !root.preview; textFormat: Text.PlainText; text: "converting…"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        }
        Thumb {
          label: root.mode === "clip" ? "the clip as it is" : (root.mode === "pictures" && root.draft && root.draft.paths.length === 1 ? "the picture as it is" : "the pictures as they are")
          chosen: root.style === "image"
          onPicked: root.style = "image"
          Image {
            anchors.fill: parent
            visible: !!root.preview && String(root.preview.image) !== ""
            source: visible ? "file://" + String(root.preview.image) : ""
            fillMode: Image.PreserveAspectFit
            asynchronous: true
            cache: false
            sourceSize.width: 480
            smooth: true
          }
          Text { anchors.centerIn: parent; visible: !root.preview; textFormat: Text.PlainText; text: "…"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        }
      }
    }

    Text {
      visible: root.caption !== ""
      width: parent.width
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      text: root.caption
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }

    // ---- actions; the two blanks sit quietly at the right until there is
    // something on the card ----
    Item {
      width: parent.width
      height: actions.implicitHeight
      Row {
        id: actions
        spacing: Style.space(6)
        Button {
          visible: root.mode !== ""
          enabled: root.canCreate
          opacity: root.canCreate ? 1 : 0.45
          text: "Create"
          iconText: "󰐕"
          bordered: true
          selected: root.canCreate
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          onClicked: root.create()
        }
        Button {
          text: "Never mind"
          bordered: true
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          onClicked: root.cancel()
        }
      }
      Row {
        visible: root.mode === "" && !root.picking
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.space(4)
        Button { text: "a clock"; foreground: root.dim; fontFamily: root.fontFamily; fontSize: Style.font.caption; tooltipText: "An empty screen with the clock in the middle"; onClicked: root.createNow("clock") }
        Text { anchors.verticalCenter: parent.verticalCenter; textFormat: Text.PlainText; text: "·"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        Button { text: "an empty screen"; foreground: root.dim; fontFamily: root.fontFamily; fontSize: Style.font.caption; tooltipText: "Nothing of its own — for what you put on top"; onClicked: root.createNow("empty") }
      }
    }
  }
}
