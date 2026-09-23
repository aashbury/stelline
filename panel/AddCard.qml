import QtQuick
import qs.Commons
import qs.Ui
import "../savers"
import "../StellineModel.js" as M

// Adding a saver is one card. At the top, what kind of saver: one card for
// each kind the shipped savers are, and a couple more. Under it, only what
// that kind needs, laid out the way the rest of the panel is — a glyph, a
// label and the control, every row starting in the same place. Pictures and
// clips are converted exactly as the preview shows them; words are drawn the
// way the wordmark is, and the card shows that too. Pasting a picture or a
// clip anywhere on the card picks the kind for you. The draft lives in the
// service so it survives the panel closing for the file chooser.
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
  readonly property bool editing: fieldFocused

  // What the card holds, as the draft plus what is being typed right now.
  property string kind: ""
  property string typed: ""
  property string style: "ascii"
  property bool animated: true
  property string order: "shuffle"
  property int detail: M.DEFAULT_DETAIL
  readonly property var live: {
    var d = draft ? M.cloneJson(draft) : M.importDefaults()
    d.kind = root.kind; d.words = root.typed; d.style = root.style; d.animated = root.animated; d.order = root.order; d.detail = root.detail
    return d
  }
  readonly property string mode: M.composeMode(live, ai)
  readonly property bool canCreate: mode !== "" && !picking
  readonly property string source: draft && draft.source ? String(draft.source) : ""
  readonly property bool attached: !!(draft && draft.source && Array.isArray(draft.paths) && draft.paths.length)
  readonly property bool hasPictures: attached && source === "images"
  readonly property bool hasFolder: attached && source === "folder"
  readonly property bool hasClip: attached && source === "video"
  readonly property int count: attached ? draft.paths.length : 0
  readonly property bool movable: M.canMove(mode)
  readonly property bool orderable: M.canOrder(live, mode)
  // The conversion of what is attached, once it is of the current attachment.
  // Either may instead carry the reason there is nothing to show.
  readonly property var preview: svc && svc.draftPreview && attached && String(svc.draftPreview.path) === String(draft.paths[0]) ? svc.draftPreview : null
  readonly property string previewError: preview && preview.error ? String(preview.error) : ""
  readonly property bool previewReady: !!preview && previewError === ""
  readonly property var wordArt: svc && svc.wordPreview && String(svc.wordPreview.text) === typed.trim() ? svc.wordPreview : null
  readonly property bool wordReady: !!wordArt && String(wordArt.art || "") !== ""
  // Only some agents can be handed a picture; with the others a description
  // is words alone, and the card does not offer pictures.
  readonly property bool seesPictures: M.seesPictures(ai)
  readonly property bool picturesFull: count >= M.DESCRIBE_PICTURES
  readonly property string agentName: ai.indexOf("agent:") === 0 ? M.agentName(ai.substring(6)) : (ai === "api" ? "the Claude API" : "")

  // One label column for every row on the card.
  readonly property real labelWidth: Style.space(96)
  readonly property real controlX: Style.space(10) + Style.space(26) + labelWidth + Style.space(8)
  property bool fieldFocused: false

  readonly property string caption: {
    if (kind === "describe") {
      if (ai === "") return root.agentHint
      if (mode === "describe-pictures") return "Asks " + agentName + " to draw it from " + (count > 1 ? "the pictures" : "the picture") + ", the way you describe. It redraws rather than copies; the tile fills in when it is ready."
      return "Asks " + agentName + ". It takes a minute or two; the tile fills in when it is ready."
    }
    if (kind === "words") return "Drawn as a title card in your theme's colours, with the saver animations."
    if (kind === "clock") return "The time in the middle of an empty screen, in your theme's colours."
    if (kind === "blank") return "Black, and nothing else — for the widgets you put on top."
    if (kind === "clip") return mode === "clip" ? (style === "ascii" ? "The first 20 seconds, as dots; takes a minute or so." : "The first 20 seconds, as it is.") : ""
    if (movable) {
      var how = style === "image"
        ? (animated ? "A slow push-in on each picture." : "Each picture shown whole, and held.")
        : (animated ? "The dots light up across it, rest, go out, and light up another way." : "Every dot at once, the colour breathing.")
      var turn = orderable ? (order === "shuffle" ? " Shuffled, a new one every 12 seconds." : " In turn, a new one every 12 seconds.") : ""
      return how + turn + (count > 1 ? " The preview is the first picture." : "")
    }
    return ""
  }

  readonly property string agentHint: "Needs a coding agent: set one with omarchy default agent, or install Claude Code, or set ANTHROPIC_API_KEY."

  // What the card holds is restored whenever it comes back: opened afresh,
  // or re-made with the panel while a chooser was up.
  function restore() {
    typed = draft && draft.words ? String(draft.words) : ""
    kind = draft && draft.kind ? String(draft.kind) : ""
    style = draft && draft.style === "image" ? "image" : "ascii"
    animated = !draft || draft.animated !== false
    order = draft && draft.order === "sequence" ? "sequence" : "shuffle"
    detail = M.detailLevel(draft ? draft.detail : undefined)
  }
  onOpenChanged: if (open) { restore(); if (svc) Qt.callLater(svc.refreshClipboard) }
  // A paste or a pick can change the kind under the card; follow it.
  onDraftChanged: if (draft && draft.kind && draft.kind !== kind) kind = String(draft.kind)
  Component.onCompleted: if (open) restore()

  function update(patch) {
    if (!svc) return
    var d = draft ? M.cloneJson(draft) : M.importDefaults()
    for (var k in patch) d[k] = patch[k]
    svc.importDraft = d
  }
  function sync(extra) {
    var patch = { kind: root.kind, words: root.typed, style: root.style, animated: root.animated, order: root.order, detail: root.detail }
    for (var k in (extra || {})) patch[k] = extra[k]
    update(patch)
  }
  // Another kind: what was typed carries over between the two kinds that
  // take words (a description, a title), and between the ones it names; it
  // does not turn a description into a clock's name. What is attached stays
  // only where the new kind can use it.
  function choose(k) {
    var wordy = function(x) { return x === "describe" || x === "words" }
    if (root.kind !== "" && wordy(root.kind) !== wordy(k)) root.typed = ""
    root.kind = k
    if (svc) { var d = M.chooseKind(live, k, ai); d.step = "start"; svc.importDraft = d }
    Qt.callLater(function() { var f = root.fieldFor(k); if (f) f.forceActiveFocus() })
  }
  function fieldFor(k) { return k === "describe" ? describeField : (k === "words" ? wordsField : (k === "" ? null : nameField)) }
  function cancel() { if (svc) svc.importDraft = null }
  // A chooser that did not open leaves the card as it was.
  function pick(what) {
    if (!svc) return
    sync({ step: "picking" })
    if (svc.pickFiles(what) !== "ok") sync({ step: "start" })
  }
  function paste() { if (!svc || pasteable === "") return; sync({}); svc.pasteClipboard() }
  function detach() { if (svc) { var d = M.detach(live); d.step = "start"; svc.importDraft = d } }
  function removePicture(path) { if (svc) { var d = M.removePicture(live, path); d.step = "start"; svc.importDraft = d } }
  function create() {
    if (!svc || !canCreate) return
    var spec = M.composeSpec(live, ai, svc.pasteStageDir)
    if (!spec) return
    var id = svc.importSaver(spec)
    // The tile opens below the grid as it lands: Preview is one click away.
    if (body && typeof id === "string" && id !== "" && id.indexOf("bad") !== 0) body.openSettings = id
  }

  // The word is drawn once the typing stops.
  Timer { id: wordLater; interval: 700; onTriggered: if (root.kind === "words" && root.svc && typeof root.svc.previewWord === "function") root.svc.previewWord(root.typed) }
  onTypedChanged: if (kind === "words") wordLater.restart()
  onKindChanged: if (kind === "words" && typed.trim() !== "") wordLater.restart()

  implicitHeight: column.implicitHeight + padding * 2
  padding: Style.space(12)
  radius: Style.cornerRadius
  color: Style.controlFill(false, false, foreground, Color.accent)
  borderSpec: Border.controlSpec("selected", foreground, Color.accent)

  // ---- the pieces the card is made of ----

  // A text field that also takes a pasted picture or file: Ctrl+V with one
  // on the clipboard attaches it, plain text still pastes as text.
  component CardField: TextField {
    foreground: root.foreground
    font.family: root.fontFamily
    text: root.typed
    onTextEdited: root.typed = text
    onAccepted: root.create()
    onEditingFinished: if (root.open && !root.picking) root.sync({})
    onActiveFocusChanged: root.fieldFocused = activeFocus
    Keys.priority: Keys.BeforeItem
    Keys.onPressed: function(event) {
      if (event.matches(StandardKey.Paste) && root.pasteable !== "") { root.paste(); event.accepted = true }
    }
    Keys.onEscapePressed: focus = false
  }

  component CardButton: Button {
    leftAlign: true
    bordered: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.caption
  }

  component CardRow: FieldRow {
    width: parent ? parent.width : 0
    labelWidth: root.labelWidth
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  // One of the two ways a picture can be shown, as a picture of it.
  component Thumb: BorderSurface {
    id: thumb
    property string label: ""
    property bool chosen: false
    readonly property bool hot: thumbMouse.containsMouse
    default property alias content: slot.data
    signal picked()
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
    MouseArea { id: thumbMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: thumb.picked() }
  }

  // The pictures on the card, each one removable.
  component PictureStrip: Flow {
    spacing: Style.space(6)
    visible: root.hasPictures
    Repeater {
      model: root.hasPictures ? root.draft.paths : []
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

  // A folder or a clip, as a chip that can be taken off again.
  component Chip: BorderSurface {
    width: chipRow.implicitWidth + Style.space(16)
    height: chipRow.implicitHeight + Style.space(8)
    radius: Style.cornerRadius
    color: Style.selectedFillFor(root.foreground, Color.accent)
    borderSpec: Border.controlSpec("selected", root.foreground, Color.accent)
    Row {
      id: chipRow
      anchors.centerIn: parent
      spacing: Style.space(6)
      Text { textFormat: Text.PlainText; text: root.hasFolder ? "󰉋" : "󰕧"; color: Color.accent; font.family: root.fontFamily; font.pixelSize: Style.font.icon; anchors.verticalCenter: parent.verticalCenter }
      Text { textFormat: Text.PlainText; text: root.draft ? M.attachmentLabel(root.draft, root.svc ? String(root.svc.pasteStageDir || "") : "") : ""; color: root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.caption; anchors.verticalCenter: parent.verticalCenter }
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

  // The two ways to show what is attached, each as a picture of itself.
  component ShowAs: Row {
    spacing: Style.space(8)
    readonly property real each: Math.floor((width - spacing) / 2)
    Thumb {
      width: parent.each
      height: Math.round(parent.each * 0.66)
      label: root.kind === "clip" ? "as dots, moving" : "as a dot matrix"
      chosen: root.style === "ascii"
      onPicked: root.style = "ascii"
      AsciiArt {
        anchors.fill: parent
        visible: root.previewReady
        art: root.previewReady ? String(root.preview.art) : ""
        fg: root.foreground
        fontFamily: root.fontFamily
        fitWidth: 0.98
        fitHeight: 0.98
      }
      Text {
        anchors.centerIn: parent
        width: parent.width - Style.space(8)
        visible: !root.previewReady
        horizontalAlignment: Text.AlignHCenter
        wrapMode: Text.WordWrap
        textFormat: Text.PlainText
        text: root.previewError !== "" ? "No preview: " + root.previewError : "converting…"
        color: root.previewError !== "" ? Color.urgent : root.dim
        font.family: root.fontFamily
        font.pixelSize: Style.font.caption
      }
    }
    Thumb {
      width: parent.each
      height: Math.round(parent.each * 0.66)
      label: root.kind === "clip" ? "the clip as it is" : (root.count === 1 && root.hasPictures ? "the picture as it is" : "as they are")
      chosen: root.style === "image"
      onPicked: root.style = "image"
      Image {
        anchors.fill: parent
        visible: root.previewReady && String(root.preview.image) !== ""
        source: visible ? "file://" + String(root.preview.image) : ""
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        cache: false
        sourceSize.width: 480
        smooth: true
      }
      Text { anchors.centerIn: parent; visible: !root.previewReady; textFormat: Text.PlainText; text: root.previewError !== "" ? "—" : "…"; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
    }
  }

  // How much of the picture's shading the dots keep; the preview above
  // redraws as it moves.
  component DetailRow: SliderRow {
    visible: root.attached && root.style === "ascii"
    width: parent ? parent.width : 0
    glyph: "󰈊"
    label: "Detail"
    labelWidth: root.labelWidth
    value: root.detail
    minimum: 0
    maximum: 4
    step: 1
    format: function(v) { return M.detailName(v) }
    readoutWidth: Style.space(72)
    typeable: false
    foreground: root.foreground
    fontFamily: root.fontFamily
    onReleased: function(v) { root.detail = Math.round(v); root.sync({}) }
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

    // ---- what kind: one card each ----
    Grid {
      id: kinds
      width: parent.width
      // Three across when a card still has room for its hint, two otherwise.
      columns: (width - spacing * 2) / 3 >= Style.space(200) ? 3 : 2
      spacing: Style.space(6)
      readonly property real each: Math.floor((width - spacing * (columns - 1)) / columns)
      Repeater {
        model: M.ADD_KINDS
        BorderSurface {
          id: kindCard
          required property var modelData
          readonly property bool chosen: root.kind === modelData.id
          readonly property bool usable: modelData.id !== "describe" || root.ai !== ""
          readonly property bool hot: kindMouse.containsMouse
          width: kinds.each
          height: Style.space(54)
          radius: Style.cornerRadius
          opacity: usable ? 1 : 0.45
          color: chosen ? Style.selectedFillFor(root.foreground, Color.accent) : (hot && usable ? Style.hoverFillFor(root.foreground, Color.accent) : "transparent")
          borderSpec: Border.controlSpec(chosen ? "selected" : (hot && usable ? "hover-cursor" : "normal"), root.foreground, Color.accent)
          Row {
            anchors.left: parent.left
            anchors.leftMargin: Style.space(10)
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(8)
            Text {
              anchors.verticalCenter: parent.verticalCenter
              textFormat: Text.PlainText
              text: kindCard.modelData.glyph
              color: kindCard.chosen ? Color.accent : root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.subtitle
            }
            Column {
              anchors.verticalCenter: parent.verticalCenter
              width: parent.width - Style.space(34)
              spacing: Style.space(1)
              Text { width: parent.width; textFormat: Text.PlainText; text: kindCard.modelData.name; color: kindCard.chosen ? Color.accent : root.foreground; font.family: root.fontFamily; font.pixelSize: Style.font.body; elide: Text.ElideRight }
              Text { width: parent.width; textFormat: Text.PlainText; text: kindCard.modelData.hint; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption; elide: Text.ElideRight }
            }
          }
          MouseArea {
            id: kindMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: kindCard.usable ? Qt.PointingHandCursor : Qt.ArrowCursor
            onClicked: if (kindCard.usable) root.choose(kindCard.modelData.id)
          }
          PanelToolTip { visible: kindMouse.containsMouse && !kindCard.usable; text: root.agentHint }
        }
      }
    }

    // ---- describe it ----
    Column {
      visible: root.kind === "describe"
      width: parent.width
      CardRow {
        glyph: "󰏫"
        label: "Describe"
        CardField { id: describeField; width: parent.width; placeholderText: "What should it show?" }
      }
      CardRow {
        visible: root.seesPictures
        glyph: "󰋩"
        label: "From"
        Column {
          width: parent.width
          spacing: Style.space(6)
          Flow {
            width: parent.width
            spacing: Style.space(6)
            CardButton { text: root.hasPictures ? "Paste another" : "Paste a picture"; iconText: "󰆒"; enabled: root.pasteable !== "" && !root.picturesFull; opacity: enabled ? 1 : 0.45; onClicked: root.paste() }
            CardButton { text: root.hasPictures ? "Add more…" : "Pictures…"; iconText: "󰋩"; enabled: !root.picking && !root.picturesFull; opacity: enabled ? 1 : 0.45; onClicked: root.pick("images") }
          }
          PictureStrip { width: parent.width }
          Text { width: parent.width; wrapMode: Text.WordWrap; textFormat: Text.PlainText; text: root.hasPictures ? (root.picturesFull ? "That is as many as it can draw from." : "Up to " + M.DESCRIBE_PICTURES + ".") : "Optional: up to " + M.DESCRIBE_PICTURES + " pictures to draw from."; color: root.dim; font.family: root.fontFamily; font.pixelSize: Style.font.caption }
        }
      }
      CardRow {
        glyph: "󰕧"
        label: "Make it"
        ButtonGroup {
          options: [{ value: "animation", label: "an animation" }, { value: "still", label: "a still" }]
          value: root.animated ? "animation" : "still"
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          focusable: false
          onChanged: function(v) { root.animated = v === "animation" }
        }
      }
    }

    // ---- words ----
    Column {
      visible: root.kind === "words"
      width: parent.width
      CardRow {
        glyph: "󰊄"
        label: "Text"
        CardField { id: wordsField; width: parent.width; placeholderText: "A word or two" }
      }
      CardRow {
        visible: root.typed.trim() !== ""
        glyph: "󰈈"
        label: "Preview"
        BorderSurface {
          width: parent.width
          height: Style.space(84)
          radius: Style.cornerRadius
          color: Color.background
          borderSpec: Border.controlSpec("normal", root.foreground, Color.accent)
          AsciiArt {
            anchors.fill: parent
            anchors.margins: Style.space(8)
            visible: root.wordReady
            art: root.wordReady ? String(root.wordArt.art) : ""
            fg: root.foreground
            fontFamily: root.fontFamily
            fitWidth: 1
            fitHeight: 1
          }
          Text {
            anchors.centerIn: parent
            visible: !root.wordReady
            textFormat: Text.PlainText
            text: root.wordArt && root.wordArt.error ? "No preview: " + String(root.wordArt.error) : "drawing…"
            color: root.wordArt && root.wordArt.error ? Color.urgent : root.dim
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
          }
        }
      }
    }

    // ---- pictures ----
    Column {
      visible: root.kind === "pictures"
      width: parent.width
      CardRow {
        glyph: "󰋩"
        label: "Pictures"
        Column {
          width: parent.width
          spacing: Style.space(6)
          Flow {
            width: parent.width
            spacing: Style.space(6)
            CardButton { text: root.hasPictures ? "Paste another" : "Paste"; iconText: "󰆒"; enabled: root.pasteable !== ""; opacity: enabled ? 1 : 0.45; tooltipText: "What's on your clipboard — a picture, a file, or a folder. Ctrl+V does the same."; onClicked: root.paste() }
            CardButton { text: root.hasPictures ? "Add more…" : "Choose…"; iconText: "󰋩"; enabled: !root.picking; onClicked: root.pick("images") }
            CardButton { visible: !root.hasPictures; text: "A folder…"; iconText: "󰉋"; enabled: !root.picking; tooltipText: "Every picture in it"; onClicked: root.pick("folder") }
          }
          PictureStrip { width: parent.width }
          Chip { visible: root.hasFolder }
        }
      }
      CardRow {
        visible: root.attached
        glyph: "󰈈"
        label: "Show as"
        ShowAs { width: parent.width }
      }
      DetailRow {}
      CardRow {
        visible: root.movable
        glyph: "󰁌"
        label: "Motion"
        ButtonGroup {
          options: [{ value: "animation", label: "animated" }, { value: "still", label: "still" }]
          value: root.animated ? "animation" : "still"
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          focusable: false
          onChanged: function(v) { root.animated = v === "animation" }
        }
      }
      CardRow {
        visible: root.orderable
        glyph: "󰒟"
        label: "Order"
        ButtonGroup {
          options: [{ value: "shuffle", label: "shuffled" }, { value: "sequence", label: "in order" }]
          value: root.order
          foreground: root.foreground
          fontFamily: root.fontFamily
          fontSize: Style.font.caption
          focusable: false
          onChanged: function(v) { root.order = v }
        }
      }
    }

    // ---- a clip ----
    Column {
      visible: root.kind === "clip"
      width: parent.width
      CardRow {
        glyph: "󰕧"
        label: "Clip"
        Column {
          width: parent.width
          spacing: Style.space(6)
          Flow {
            visible: !root.hasClip
            width: parent.width
            spacing: Style.space(6)
            CardButton { text: "Paste"; iconText: "󰆒"; enabled: root.pasteable === "paths"; opacity: enabled ? 1 : 0.45; onClicked: root.paste() }
            CardButton { text: "Choose…"; iconText: "󰕧"; enabled: !root.picking; onClicked: root.pick("video") }
          }
          Chip { visible: root.hasClip }
        }
      }
      CardRow {
        visible: root.hasClip
        glyph: "󰈈"
        label: "Show as"
        ShowAs { width: parent.width }
      }
      DetailRow {}
    }

    // ---- a name, for everything that does not take its name from words ----
    CardRow {
      visible: root.kind === "pictures" || root.kind === "clip" || root.kind === "clock" || root.kind === "blank"
      glyph: "󰑕"
      label: "Name"
      CardField {
        id: nameField
        width: parent.width
        placeholderText: root.kind === "clock" ? "Clock" : (root.kind === "blank" ? "Blank" : "Named after what you add")
      }
    }

    // ---- what will happen, and the two actions, under the controls ----
    Text {
      visible: root.caption !== ""
      x: root.controlX
      width: parent.width - root.controlX
      textFormat: Text.PlainText
      wrapMode: Text.WordWrap
      text: root.caption
      color: root.dim
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
    Row {
      x: root.kind === "" ? 0 : root.controlX
      spacing: Style.space(6)
      CardButton {
        visible: root.kind !== ""
        enabled: root.canCreate
        opacity: root.canCreate ? 1 : 0.45
        text: "Create"
        iconText: "󰐕"
        selected: root.canCreate
        onClicked: root.create()
      }
      CardButton { text: "Never mind"; iconText: "󰅖"; onClicked: root.cancel() }
    }
  }
}
