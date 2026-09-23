import QtQuick
import qs.Commons
import qs.Ui
import "../savers"
import "../StellineModel.js" as M

// Adding a saver is one card. Say what it should show, or attach a picture,
// or both; what gets made follows from what is there. Words alone are drawn
// by your agent, or set in big letters. Pictures — one or as many as you
// like — are shown exactly as the preview shows them, nothing cropped: you
// pick a dot matrix or the picture as it is, moving or still, and several
// come round shuffled or in turn. Words alongside pictures name the saver. The draft lives in the
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
  property string order: "shuffle"
  // The draft as it stands with what the card holds right now.
  readonly property var live: {
    var d = draft ? M.cloneJson(draft) : M.importDefaults()
    d.words = root.words; d.style = root.style; d.animated = root.animated; d.letters = root.letters; d.order = root.order
    return d
  }
  readonly property string mode: M.composeMode(live, ai)
  readonly property bool describing: mode === "describe" || mode === "describe-pictures"
  // Pictures can move or sit still; more than one can be shuffled.
  readonly property bool movable: M.canMove(live, mode)
  readonly property bool orderable: M.canOrder(live, mode)
  readonly property bool pictures: source === "images" && attached
  readonly property int count: attached ? draft.paths.length : 0
  readonly property bool converting: mode === "pictures" || mode === "folder" || mode === "clip"
  // The conversion of what is attached, once it is of the current attachment.
  readonly property var preview: svc && svc.draftPreview && attached && String(svc.draftPreview.path) === String(draft.paths[0]) ? svc.draftPreview : null

  readonly property bool editing: wordsField.activeFocus
  readonly property bool canCreate: mode !== "" && !picking
  readonly property string agentName: ai.indexOf("agent:") === 0 ? M.agentName(ai.substring(6)) : (ai === "api" ? "the Claude API" : "")

  readonly property string placeholder: {
    if (!attached) return ai !== "" ? "Describe it, or paste a picture" : "Words to show in big letters, or paste a picture"
    if (source === "images" && M.seesPictures(ai)) return count > 1 ? "What to draw from them, or leave this empty" : "What to draw from it, or leave this empty"
    return "A name for it, or leave this empty"
  }
  readonly property string caption: {
    if (mode === "describe") return "Asks " + agentName + ". Usually under a minute; the tile fills in when it is ready."
    // An agent redraws rather than copies; the conversion copies exactly.
    if (mode === "describe-pictures") return "Asks " + agentName + " to draw it from " + (count > 1 ? "the pictures" : "the picture") + ", the way you describe. It redraws rather than copies — clear the words to show " + (count > 1 ? "them" : "it") + " as " + (count > 1 ? "they are" : "it is") + "."
    // A likeness asked of an agent is the one thing it cannot give: it
    // redraws rather than copies. The conversion does copy, exactly.

    if (mode === "letters") return "Big letters in your theme's colours."
    if (movable) {
      var how = style === "image"
        ? (animated ? "A slow push-in on each picture." : "Each picture shown whole, and held.")
        : (animated ? "The dots light up across it, rest, go out, and light up another way." : "Every dot at once, the colour breathing.")
      var turn = orderable ? (order === "shuffle" ? " Shuffled, a new one every 12 seconds." : " In turn, a new one every 12 seconds.") : ""
      var first = count > 1 ? " The preview is the first picture." : ""
      return how + turn + first
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
    order = draft && draft.order === "sequence" ? "sequence" : "shuffle"
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
    var patch = { words: wordsField.text, style: root.style, animated: root.animated, letters: root.letters, order: root.order }
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
  function removePicture(path) { if (svc) { var d = M.removePicture(live, path); d.step = "start"; svc.importDraft = d } }
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
        text: root.pasteable === "image" ? (root.pictures ? "Paste another picture" : "Paste the picture") : "Paste what you copied"
        iconText: "󰆒"
        bordered: true
        foreground: root.foreground
        fontFamily: root.fontFamily
        fontSize: Style.font.caption
        tooltipText: "What's on your clipboard — a picture, a file, or a folder. Ctrl+V does the same."
        onClicked: root.paste()
      }
      Button { visible: !root.picking; leftAlign: true; text: root.pictures ? "Add more pictures…" : "Pictures or a clip…"; iconText: root.pictures ? "󰐕" : "󰋩"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; onClicked: root.pick("media") }
      Button { visible: !root.picking && !root.pictures; leftAlign: true; text: "A folder…"; iconText: "󰉋"; bordered: true; foreground: root.foreground; fontFamily: root.fontFamily; fontSize: Style.font.caption; tooltipText: "Every picture in it"; onClicked: root.pick("folder") }
      // The attachment, as a chip that can be taken off again.
      BorderSurface {
        visible: root.attached && !root.pictures
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

    // ---- the pictures on the card, each one removable ----
    Flow {
      visible: root.pictures
      width: parent.width
      spacing: Style.space(6)
      Repeater {
        model: root.pictures ? root.draft.paths : []
        BorderSurface {
          id: pic
          required property var modelData
          width: Style.space(64)
          height: Style.space(48)
          radius: Style.cornerRadius
          color: "transparent"
          borderSpec: Border.controlSpec(picMouse.containsMouse ? "hover-cursor" : "normal", root.foreground, Color.accent)
          Image {
            anchors.fill: parent
            anchors.margins: Style.space(3)
            source: "file://" + String(pic.modelData)
            fillMode: Image.PreserveAspectCrop
            asynchronous: true
            sourceSize.width: 128
            smooth: true
          }
          MouseArea { id: picMouse; anchors.fill: parent; hoverEnabled: true }
          // Take this one off: shown on hover, so the row stays calm.
          Rectangle {
            visible: picMouse.containsMouse || offOne.containsMouse
            anchors.top: parent.top
            anchors.right: parent.right
            anchors.margins: Style.space(2)
            width: Style.space(16)
            height: width
            radius: width / 2
            color: Color.notifications.background
            Text { anchors.centerIn: parent; textFormat: Text.PlainText; text: "󰅖"; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
            MouseArea { id: offOne; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.removePicture(String(pic.modelData)) }
          }
          PanelToolTip { visible: offOne.containsMouse; text: "Take this one off" }
        }
      }
    }

    // ---- the one question left: what to make of words ----
    Row {
      visible: root.describing || (root.mode === "letters" && root.ai !== "")
      spacing: Style.space(8)
      Text { anchors.verticalCenter: parent.verticalCenter; textFormat: Text.PlainText; text: "Make it"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
      ButtonGroup {
        options: root.mode === "describe-pictures"
          ? [{ value: "animation", label: "an animation" }, { value: "still", label: "a still" }]
          : [{ value: "animation", label: "an animation" }, { value: "still", label: "a still" }, { value: "letters", label: "big letters" }]
        value: root.letters && root.mode !== "describe-pictures" ? "letters" : (root.animated ? "animation" : "still")
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
          label: root.mode === "clip" ? "an ASCII animation" : "a dot matrix"
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

    // ---- how pictures play: moving or still, shuffled or in turn ----
    Row {
      visible: root.movable
      spacing: Style.space(8)
      Text { anchors.verticalCenter: parent.verticalCenter; width: Style.space(52); textFormat: Text.PlainText; text: "Motion"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
      ButtonGroup {
        options: [{ value: "animation", label: "animated" }, { value: "still", label: "still" }]
        value: root.animated ? "animation" : "still"
        foreground: root.foreground
        fontFamily: root.fontFamily
        focusable: false
        onChanged: function(v) { root.animated = v === "animation" }
      }
    }
    Row {
      visible: root.orderable
      spacing: Style.space(8)
      Text { anchors.verticalCenter: parent.verticalCenter; width: Style.space(52); textFormat: Text.PlainText; text: "Order"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
      ButtonGroup {
        options: [{ value: "shuffle", label: "shuffled" }, { value: "sequence", label: "in order" }]
        value: root.order
        foreground: root.foreground
        fontFamily: root.fontFamily
        focusable: false
        onChanged: function(v) { root.order = v }
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
          iconText: "󰅖"
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
