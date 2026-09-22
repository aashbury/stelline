// The agent's figure. One drawing per state, a few frames each, in whatever
// shape the tile asked for. Two layers per frame: the body, in the theme's
// foreground, and the light — seams, lenses, the beacon, whatever the scene
// throws at it — in the accent.
//
// working  — typing, keys lighting under the fingers that land on them
// needs    — hands off the keys, a beacon blinking: it has stopped for you
// waiting  — still at the keys, in the rain: finished, come and look
// error    — crossed, sparks
// idle     — dark, a slow pulse on standby
//
// Shapes are listed in FIGURES and picked per tile. Adding one is a draw
// function, a name, and how long each state's loop runs.
var ROWS = 13
var COLS = 26

// What glows. Everything else is body.
var LIGHT = "╎●✕¦!✶·╌▔"

// ---- the canvas -----------------------------------------------------------

function blank() {
  var g = []
  for (var r = 0; r < ROWS; r++) g.push(new Array(COLS + 1).join(" ").split(""))
  return g
}
function put(g, x, y, lines) {
  for (var r = 0; r < lines.length; r++) {
    var row = y + r
    if (row < 0 || row >= ROWS) continue
    var chars = Array.from(lines[r])
    for (var c = 0; c < chars.length; c++) {
      var col = x + c
      if (col < 0 || col >= COLS || chars[c] === " ") continue
      g[row][col] = chars[c]
    }
  }
}
function join(g) { return g.map(function(r) { return r.join("") }) }
function rep(ch, n) { return new Array(n + 1).join(ch) }

// ---- the weather round the figure -----------------------------------------

function sparks(g, at) { for (var i = 0; i < at.length; i++) put(g, at[i][0], at[i][1], ["✶"]) }
function rain(g, n, drops) {
  for (var i = 0; i < drops.length; i++) put(g, drops[i][0], (drops[i][1] + n) % ROWS, ["¦"])
}
function beacon(g, n, x, y) { if (n % 4 !== 3) put(g, x, y, ["!"]) }

// ---- 1 · hands ------------------------------------------------------------
//
// A pair of hands seen from behind: forearms at the top, the backs of the
// hands, then four fingers reaching down onto the keys. Fingers run short,
// long, long, short from the outside in and each thumb sits on the inner
// edge, which is what makes two of these read as a pair rather than as two
// combs.

var KEY_Y = 10
// Where the two hands rest, and where their fingers fall. They sit a row
// down from the top edge so that lifting off the keys has somewhere to go.
var REST_Y = 1
var LEFT_X = 3, RIGHT_X = 16
var FINGERS = [0, 2, 4, 6]
// Outside in: little, ring, middle, index — mirrored for the other hand.
var LEN_L = [2, 4, 4, 3]
var LEN_R = [3, 4, 4, 2]

function forearm(g, x, y, seam) { put(g, x + 2, y, ["███", "█" + seam + "█"]) }
function backOfHand(g, x, y, mark) {
  put(g, x, y, ["▄▄▄▄▄▄▄", "███████", "███████"])
  if (mark) put(g, x + 3, y + 1, [mark])
}
// Off the inner edge, stepping down and inward below the knuckles.
function thumb(g, x, y, side) {
  if (side === "left") {
    put(g, x + 7, y, ["▄▄"])
    put(g, x + 8, y + 1, ["█", "▀"])
  } else {
    put(g, x - 2, y, ["▄▄"])
    put(g, x - 2, y + 1, ["█", "▀"])
  }
}
function finger(g, x, y, len) { for (var r = 0; r < len; r++) put(g, x, y + r, ["█"]) }
// The keys. The one under a fingertip lights.
function keys(g, x, w, pressed) {
  var row = ""
  for (var c = 0; c < w; c++) row += c % 3 === 2 ? " " : "█"
  put(g, x, KEY_Y, [rep("▄", w), row, rep("▀", w)])
  for (var i = 0; i < (pressed || []).length; i++)
    if (pressed[i] >= x && pressed[i] < x + w) put(g, pressed[i], KEY_Y + 1, ["╌"])
}
// One hand, its forearm top at y. Hands back the columns its fingers reach.
function hand(g, x, y, side, lens, seam, mark) {
  forearm(g, x, y, seam)
  backOfHand(g, x, y + 2, mark)
  thumb(g, x, y + 4, side)
  var pressed = []
  for (var i = 0; i < FINGERS.length; i++) {
    if (lens[i] <= 0) continue
    var fx = x + FINGERS[i]
    finger(g, fx, y + 5, lens[i])
    if (y + 5 + lens[i] >= KEY_Y) pressed.push(fx)
  }
  return pressed
}
function bothHands(g, o) {
  var y = o.y === undefined ? REST_Y : o.y
  var lens = o.lens || [LEN_L, LEN_R]
  var dy = o.dy || [0, 0]
  var seam = o.seam || "╎"
  var down = hand(g, LEFT_X, y + dy[0], "left", lens[0], seam, o.mark)
    .concat(hand(g, RIGHT_X, y + dy[1], "right", lens[1], seam, o.mark))
  if (o.keys) keys(g, 1, 24, down)
}
// Typing: every frame each finger is either down on a key or lifted.
function typingLens(base, n, phase) {
  return base.map(function(v, i) {
    var beat = (i + n + (phase || 0)) % 3
    return v + (beat === 0 ? 1 : (beat === 1 ? 0 : -1))
  })
}

var DECK_RAIN = [[0, 2], [1, 9], [25, 0], [24, 7]]
var DECK_SPARKS = [[[12, 2], [24, 6]], [[13, 5], [0, 3]], [[11, 7], [25, 4]]]

function deck(state, n) {
  var g = blank()
  if (state === "working") {
    bothHands(g, { keys: true, lens: [typingLens(LEN_L, n, 0), typingLens(LEN_R, n, 1)] })
  } else if (state === "needs") {
    // Both hands lift clear of the keys — it has stopped, and it is waiting.
    var lift = n % 2 ? 1 : 2
    bothHands(g, { dy: [-lift, -lift], lens: [[2, 3, 3, 2], [2, 3, 3, 2]] })
    keys(g, 1, 24, [])
    beacon(g, n, 24, 1)
  } else if (state === "waiting") {
    bothHands(g, { keys: true })
    rain(g, n, DECK_RAIN)
  } else if (state === "error") {
    bothHands(g, {
      keys: true,
      mark: n % 2 ? "✕" : null,
      lens: [LEN_L.map(function(v, i) { return v - ((n + i) % 2) }),
             LEN_R.map(function(v, i) { return v - ((n + i + 1) % 2) })]
    })
    sparks(g, DECK_SPARKS[n % 3])
  } else {
    // Resting on the keys, curled and dark, the wrists pulsing on standby.
    bothHands(g, { y: REST_Y + 2, seam: n % 4 === 0 ? "╎" : "│", lens: [[2, 2, 2, 2], [2, 2, 2, 2]] })
    keys(g, 1, 24, [])
  }
  return join(g)
}

// ---- 2 · robot ------------------------------------------------------------
//
// A figure at the same desk: a helmet whose face is a slit, and the light
// inside it is the state — sweeping while it works, steady when it wants
// you, scattered when it has gone wrong, out on standby.

var BODY_X = 8, BODY_Y = 1
// The lens tracking back and forth across the slit.
var SWEEP = [0, 1, 2, 3, 4, 3, 2, 1]
var BOT_RAIN = [[1, 2], [2, 8], [23, 0], [22, 6]]
var BOT_SPARKS = [[[18, 2], [21, 5]], [[20, 3], [6, 2]], [[22, 4], [19, 1]]]

function helmet(g, x, y, col, lens) {
  put(g, x + 4, y, ["▄"])
  put(g, x + 1, y + 1, ["▄▄▄█▄▄▄", "█     █", "▀▀▀▀▀▀▀"])
  if (lens) put(g, x + 2 + col, y + 2, [lens])
}
function torso(g, x, y, seam, disc) {
  var mid = "█" + seam + "█" + seam + "█" + seam + "█" + seam + "█"
  put(g, x, y, ["█████████", mid, mid, "▀▀▀▀▀▀▀▀▀"])
  if (disc) put(g, x + 4, y + 2, [disc])
}
function legs(g, x, y) { put(g, x + 1, y, ["██   ██", "▀▀   ▀▀"]) }
// An arm: hanging, reaching down to the keys, or raised beside the head.
function arm(g, x, y, mode, seam, lean) {
  if (mode === "down") put(g, x, y, ["▄▄▄", "█" + seam + "█", "▀▀▀"])
  else if (mode === "up") put(g, x + (lean || 0), y - 4, ["▄▄▄", "█" + seam + "█", "█" + seam + "█"])
  else if (mode === "type") put(g, x, y, ["▄▄▄", "█" + seam + "█", "█" + seam + "█", "█" + seam + "█"])
  else if (mode === "typeUp") put(g, x, y, ["▄▄▄", "█" + seam + "█", "█" + seam + "█"])
}
// The desk it sits behind, keys lighting in a run under its hands.
function desk(g, y, step) {
  var row = ""
  for (var c = 0; c < 17; c++) row += (c + step * 3) % 5 === 0 ? "╌" : "▔"
  put(g, 4, y, [row, rep("▀", 17)])
}

function visor(state, n) {
  var g = blank(), x = BODY_X, y = BODY_Y
  var lean = n % 4 === 1 || n % 4 === 2 ? 1 : 0
  if (state === "working") {
    helmet(g, x, y, SWEEP[n % 8], "●")
    torso(g, x, y + 4, "╎", n % 4 < 2 ? "●" : "·")
    legs(g, x, y + 8)
    arm(g, x - 4, y + 5, n % 2 ? "type" : "typeUp", "╎")
    arm(g, x + 10, y + 5, n % 2 ? "typeUp" : "type", "╎")
    desk(g, 10, n % 4)
  } else if (state === "needs" || state === "waiting") {
    helmet(g, x, y, 2, state === "needs" ? (n % 2 ? "●" : null) : "●")
    torso(g, x, y + 4, "╎", n % 2 ? "●" : "·")
    legs(g, x, y + 8)
    arm(g, x - 4, y + 5, "down", "╎")
    arm(g, x + 10, y + 5, "up", "╎", lean)
    if (state === "needs") beacon(g, n, x + 15, y + 1)
    else rain(g, n, BOT_RAIN)
  } else if (state === "error") {
    helmet(g, x, y, n % 3, "✕")
    put(g, x + 2 + ((n + 2) % 5), y + 3, ["✕"])
    torso(g, x, y + 4, "╎")
    legs(g, x, y + 8)
    arm(g, x - 4, y + 5, "down", "╎")
    arm(g, x + 10, y + 5, "down", "╎")
    sparks(g, BOT_SPARKS[n % 3])
  } else {
    helmet(g, x, y, 2, n % 4 === 0 ? "·" : null)
    torso(g, x, y + 4, "│")
    legs(g, x, y + 8)
    arm(g, x - 4, y + 5, "down", "│")
    arm(g, x + 10, y + 5, "down", "│")
  }
  return join(g)
}

// ---- the shapes on offer ---------------------------------------------------

var FIGURES = [
  { id: "deck", name: "Hands", draw: deck, loop: { working: 3, needs: 4, waiting: 13, error: 6, idle: 4 } },
  { id: "visor", name: "Robot", draw: visor, loop: { working: 8, needs: 4, waiting: 52, error: 15, idle: 4 } }
]
var DEFAULT_FIGURE = "deck"
// How long each state holds a frame: fast while it works, slow on standby.
var CADENCE = { working: 240, needs: 300, waiting: 380, error: 300, idle: 700 }
var STATES = ["working", "needs", "waiting", "error", "idle"]

// Anything unknown — nothing stored, a shape from a later version — is the
// usual one.
function shapeOf(id) {
  for (var i = 0; i < FIGURES.length; i++) if (FIGURES[i].id === id) return FIGURES[i]
  for (var j = 0; j < FIGURES.length; j++) if (FIGURES[j].id === DEFAULT_FIGURE) return FIGURES[j]
  return FIGURES[0]
}
function figureId(id) { return shapeOf(id).id }
function figureName(id) { return shapeOf(id).name }

function split(lines) {
  var body = [], glow = []
  for (var r = 0; r < lines.length; r++) {
    var b = "", l = "", chars = Array.from(lines[r])
    for (var c = 0; c < chars.length; c++) {
      var ch = chars[c]
      if (ch !== " " && LIGHT.indexOf(ch) !== -1) { l += ch; b += " " } else { b += ch; l += " " }
    }
    body.push(b); glow.push(l)
  }
  return { body: body.join("\n"), glow: glow.join("\n") }
}

var cache = {}
function frames(figure, state) {
  var shape = shapeOf(figure)
  var key = shape.loop[state] ? state : "idle"
  var id = shape.id + ":" + key
  if (!cache[id]) {
    var out = []
    for (var i = 0; i < shape.loop[key]; i++) out.push(split(shape.draw(key, i)))
    cache[id] = out
  }
  return cache[id]
}
function frame(figure, state, n) {
  var f = frames(figure, state)
  return f[((n % f.length) + f.length) % f.length]
}
function cadence(state) { return CADENCE[state] || 900 }

if (typeof module !== "undefined")
  module.exports = {
    ROWS: ROWS, COLS: COLS, LIGHT: LIGHT, CADENCE: CADENCE, STATES: STATES,
    FIGURES: FIGURES, DEFAULT_FIGURE: DEFAULT_FIGURE,
    figureId: figureId, figureName: figureName,
    frames: frames, frame: frame, cadence: cadence
  }
