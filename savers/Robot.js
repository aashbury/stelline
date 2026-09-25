// The agent's figure. One drawing per state, a few frames each, in whatever
// shape the tile asked for. Two layers per frame: the body, in the theme's
// foreground, and the light — a visor, the glint in an eye, a beacon, the
// key under a finger — in the accent.
//
// working  — busy: keys lighting under the fingers, code across a visor
// needs    — looking up, a beacon blinking: it has stopped for you
// waiting  — breathing, in the rain: finished, come and look
// error    — crossed out, sparks
// idle     — dark, a slow pulse on standby
//
// Everything is drawn on a grid of dots rather than of characters: a
// braille cell holds two dots across and four down. The figures are drawn
// as vector cels in art/ and baked to dots on a 120 × 160 grid (60 × 40
// cells) by tools/bake.js; this end lays the baked poses down, moves them,
// and does the light.
//
// Shapes are listed in FIGURES and picked per tile. Adding one is a
// drawing, a draw function, a name, and how long each state's loop runs.
var ROWS = 40
var COLS = 60

// The grid being drawn on right now, which frames() sets from the figure.
var GR = ROWS, GC = COLS, GW = COLS * 2, GH = ROWS * 4
function useGrid(rows, cols) { GR = rows; GC = cols; GW = cols * 2; GH = rows * 4 }

// ---- the canvas ------------------------------------------------------------
//
// Two planes of dots, each one bit per dot: what the body lights and what
// the accent lights. A dot in both belongs to the accent.

function plane() {
  var p = new Array(GW * GH)
  for (var i = 0; i < p.length; i++) p[i] = 0
  return p
}
function newFrame() { return { body: plane(), glow: plane() } }

function px(p, x, y, on) {
  x = Math.round(x); y = Math.round(y)
  if (x < 0 || x >= GW || y < 0 || y >= GH) return
  p[y * GW + x] = on === 0 ? 0 : 1
}
function rect(p, x, y, w, h, on) {
  for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) px(p, x + c, y + r, on)
}
function clear(p, x, y, w, h) { rect(p, x, y, w, h, 0) }

// Tone. A solid area is a slab; an area with some of its dots left dark
// reads as a surface turning away from the light, which is the only way a
// drawing made of identical dots gets any roundness into it. The ladder is
// ordered rather than random so a tone holds still instead of crawling.
var BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
function disc(p, cx, cy, r, on) {
  for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++)
    if (x * x + y * y <= r * r) px(p, cx + x, cy + y, on)
}

// A solid shape with its corners taken off, which is all "rounded" means at
// this size.
function blob(p, x, y, w, h, bite) {
  var b = bite === undefined ? 1 : bite
  rect(p, x, y, w, h, 1)
  for (var i = 0; i < b; i++) {
    var n = b - i
    clear(p, x, y + i, n, 1)
    clear(p, x + w - n, y + i, n, 1)
    clear(p, x, y + h - 1 - i, n, 1)
    clear(p, x + w - n, y + h - 1 - i, n, 1)
  }
}

// Dots to braille, one cell per two across and four down.
var BITS = [[1, 2, 4, 64], [8, 16, 32, 128]]
function pack(p) {
  var lines = []
  for (var r = 0; r < GR; r++) {
    var line = ""
    for (var c = 0; c < GC; c++) {
      var code = 0
      for (var dx = 0; dx < 2; dx++) for (var dy = 0; dy < 4; dy++)
        if (p[(r * 4 + dy) * GW + c * 2 + dx]) code += BITS[dx][dy]
      line += code === 0 ? " " : String.fromCharCode(0x2800 + code)
    }
    lines.push(line.replace(/\s+$/, ""))
  }
  return lines.join("\n")
}
// A dot lit in both planes belongs to the accent, so the body never shows
// through the light sitting on it.
function finish(f) {
  for (var i = 0; i < f.body.length; i++) if (f.glow[i]) f.body[i] = 0
  return { body: pack(f.body), glow: pack(f.glow) }
}

// ---- a field of light, rather than a set of lit dots ------------------------
//
// A baked drawing arrives as tones; they go into a field of brightness from
// 0 to 1, the state's light is worked on that, and the whole field is
// dithered once at the end through the same ordered matrix the pictures go
// through.

function field() {
  var a = new Array(GW * GH)
  for (var i = 0; i < a.length; i++) a[i] = 0
  return a
}
// The field, dithered once, the way a picture is.
function dither(fd) {
  var p = plane()
  for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
    var i = y * GW + x
    if (fd[i] > 0 && BAYER[y & 3][x & 3] / 16 < fd[i]) p[i] = 1
  }
  return p
}

// ---- tone as movement -------------------------------------------------------
//
// Now that a form has a lit face and a shadow side, brightness is somewhere
// to put an animation as well. A thing on standby is not merely still, it
// is dark; a thing that wants you catches the light.

// The whole figure up or down.
function fade(fd, k) {
  for (var i = 0; i < fd.length; i++) if (fd[i] > 0) fd[i] = Math.min(1, fd[i] * k)
}
// A band of light crossing the figure, brightening whatever it falls on and
// falling off at its edges. Skin and a metal shell both do this.
function sheen(fd, at, h, boost) {
  for (var y = Math.floor(at - h); y <= Math.ceil(at + h); y++) {
    if (y < 0 || y >= GH) continue
    var d = Math.abs(y - at) / h
    var k = 1 + (boost - 1) * Math.max(0, 1 - d * d)
    for (var x = 0; x < GW; x++) {
      var i = y * GW + x
      if (fd[i] > 0) fd[i] = Math.min(1, fd[i] * k)
    }
  }
}

// ---- what a sprite does between the big movements ---------------------------
//
// A figure that only does the one thing its state is named after reads as a
// diagram. The small involuntary movements — the chest going, a blink, an
// ear turning — are what make it look alive, and they cost a table each.

// Picks out of a short pattern that repeats, so a cycle is written down
// rather than worked out.
function cycle(list, n) { return list[((n % list.length) + list.length) % list.length] }

// Up and down and back, for a chest or a head.
var BREATH = [0, 0, 1, 2, 2, 2, 1, 0]
// A blink is one frame in eight, which is about the rate a dog blinks at.
function blinking(n, at) { return (n % 8) === (at === undefined ? 6 : at) }

// What each state does to the light. This is the same for all three
// figures, so the state reads before the drawing does — across a room you
// see that it has gone dark, or that something is sweeping over it, long
// before you see which shape it is.
//
//   working  a band of light running down it, keeping time with the hands
//   needs    the same band, faster and brighter, travelling up to catch you
//   waiting  breathing, a little under full
//   error    lurching between full and half, which reads as a fault
//   standby  down to about half, breathing very slowly
// Where the band is, as a share of the figure's height.
function stateLight(fd, state, n) {
  if (state === "working") { sheen(fd, GH * cycle([0.154, 0.308, 0.462, 0.615, 0.769, 0.923], n), GH * 0.106, 1.3); return }
  if (state === "needs") { sheen(fd, GH * cycle([0.923, 0.788, 0.654, 0.519, 0.385, 0.25, 0.115, 0.038], n), GH * 0.135, 1.45); return }
  if (state === "waiting") { fade(fd, cycle([0.86, 0.89, 0.93, 0.97, 1, 0.97, 0.93, 0.89], n)); return }
  if (state === "error") { fade(fd, cycle([1, 0.66, 1, 0.7, 0.94, 0.72], n)); return }
  fade(fd, cycle([0.48, 0.5, 0.54, 0.58, 0.58, 0.54, 0.5, 0.48], n))
}

// ---- weather ---------------------------------------------------------------

function rain(f, n, drops) {
  for (var i = 0; i < drops.length; i++) {
    var x = drops[i][0]
    var y = (drops[i][1] + n * 6) % (GH + 16) - 8
    rect(f.glow, x, y, 1, 6, 1)
    px(f.glow, x + 1, y + 2, 1)
  }
}
function sparks(f, at) {
  for (var i = 0; i < at.length; i++) {
    var x = at[i][0], y = at[i][1]
    rect(f.glow, x - 1, y - 1, 3, 3, 1)
    px(f.glow, x - 5, y - 3, 1); px(f.glow, x - 4, y - 2, 1)
    px(f.glow, x + 5, y - 3, 1); px(f.glow, x + 4, y - 2, 1)
    px(f.glow, x - 3, y + 4, 1); px(f.glow, x - 2, y + 3, 1)
    px(f.glow, x + 3, y + 4, 1); px(f.glow, x + 2, y + 3, 1)
  }
}
function beacon(f, n, x, y) {
  if (n % 2) return
  blob(f.glow, x, y, 9, 9, 2)
  rect(f.glow, x - 4, y + 4, 2, 1, 1)
  rect(f.glow, x + 11, y + 4, 2, 1, 1)
  rect(f.glow, x + 4, y - 4, 1, 2, 1)
  rect(f.glow, x + 4, y + 11, 1, 2, 1)
}
function cross(f, x, y, s) {
  for (var i = 0; i < s; i++) {
    px(f.glow, x + i, y + i, 1)
    px(f.glow, x + s - 1 - i, y + i, 1)
  }
}

// ---- the deck: a pair of hands over a keyboard ------------------------------
//
// Over the shoulder of whoever is typing: two plated hands on a keyboard
// that runs off both sides of the frame, drawn as vector cels in
// art/hands.js — four tones, lit plate, dense shade, sparse shade and
// black. tools/bake.js turns each pose into dots, so what arrives is a
// keyboard, a map of which dot belongs to which key, and the hands in each
// pose. This end puts them together, lights the keys under the fingers
// that are pressing, and does the light.

// The four tones, as brightness for the dither: black, sparse, dense, lit.
// Lit is solid: at this grid a lit plate a shade
// short of full reads as the same grey as the shade beside it.
var TONES = [0, 0.25, 0.56, 1]
var ACCENT_TIP = 4

var unpacked = {}
function unpack(art, key, s) {
  if (unpacked[key]) return unpacked[key]
  var out = []
  for (var i = 0; i < s.length; i += 2) {
    var v = art.ALPHABET.indexOf(s[i]), n = art.ALPHABET.indexOf(s[i + 1]) + 1
    for (var j = 0; j < n; j++) out.push(v)
  }
  unpacked[key] = out
  return out
}

var DECK_RAIN = [[6, 0], [20, 40], [100, 16], [114, 60]]
var DECK_SPARKS = [[[30, 52], [92, 46]], [[84, 58], [22, 44]], [[102, 50], [40, 62]]]

function deck(state, n, art) {
  var f = newFrame()
  if (!art || !art.ART || !art.ART.hands) return finish(f)
  var A = art.ART.hands
  var fd = field()
  var board = unpack(art, "board", A.board)
  var keymap = unpack(art, "keymap", A.keymap)
  for (var i = 0; i < fd.length; i++) fd[i] = TONES[board[i]]

  var pose = "rest", dx = 0, dy = 0
  if (state === "working") { pose = "type" + (n % 6); dy = cycle([0, 0, 1, 1, 0, 0], n) }
  else if (state === "needs") { pose = "up"; dy = -cycle([0, 1, 2, 3, 3, 2, 1, 0], n) }
  else if (state === "waiting") dy = -cycle(BREATH, n)
  else if (state === "error") { pose = "up"; dx = cycle([-2, 2, -1, 1, -2, 2], n) }
  else dy = cycle(BREATH, n)
  var hands = unpack(art, "pose:" + pose, A.poses[pose].dots)
  var lit = state === "working" ? A.poses[pose].keys : []

  // the hands over the keyboard, moved as a pair; where they are is noted
  // so a lit key never shows through a finger
  var over = plane()
  for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
    var sx = x - dx, sy = y - dy
    if (sx < 0 || sx >= GW || sy < 0 || sy >= GH) continue
    var v = hands[sy * GW + sx]
    if (v === art.CLEAR) continue
    // a fingertip lit where it meets a key is the accent's, not the body's
    if (v === ACCENT_TIP) { if (state === "working") f.glow[y * GW + x] = 1; v = 2 }
    fd[y * GW + x] = TONES[v]
    over[y * GW + x] = 1
  }
  stateLight(fd, state, n)
  f.body = dither(fd)

  for (var k = 0; k < fd.length; k++)
    if (!over[k] && keymap[k] > 0 && lit.indexOf(keymap[k]) !== -1) f.glow[k] = 1
  if (state === "needs") beacon(f, Math.floor(n / 2), 56, 4)
  else if (state === "waiting") rain(f, n, DECK_RAIN)
  else if (state === "error") sparks(f, DECK_SPARKS[n % DECK_SPARKS.length])
  else if (state !== "working" && n % 8 === 0) {
    // standby: one slow pulse along the cabling at each wrist
    rect(f.glow, 31, 101 + dy, 13, 1, 1)
    rect(f.glow, 76, 101 + dy, 13, 1, 1)
  }
  return finish(f)
}

// ---- the other two: baked close-ups -------------------------------------------
//
// The robot and Morty are drawn the way the hands are, as vector cels in
// art/ baked to dots, but close up — head and shoulders filling the frame,
// nothing to sit at. Each pose comes with marks: where the visor is, where
// the eyes are. The light goes there.

// A baked pose laid into a field, moved by `dx`, `dy`. What it covers is
// kept, so the light can be kept to what is dark in the drawing.
function lay2(fd, art, key, poseName, dx, dy) {
  var A = art.ART[key]
  var dots = unpack(art, key + ":" + poseName, A.poses[poseName].dots)
  var seen = plane()
  for (var y = 0; y < GH; y++) for (var x = 0; x < GW; x++) {
    var sx = x - dx, sy = y - dy
    if (sx < 0 || sx >= GW || sy < 0 || sy >= GH) continue
    var v = dots[sy * GW + sx]
    if (v === art.CLEAR) continue
    fd[y * GW + x] = TONES[v === ACCENT_TIP ? 2 : v]
    seen[y * GW + x] = v === 0 ? 1 : 2
  }
  return { seen: seen, marks: A.poses[poseName].marks }
}
// Light a box, but only where the drawing is dark: a visor, an iris.
function fillDark(f, seen, x0, y0, x1, y1, on) {
  for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
    if (x < 0 || x >= GW || y < 0 || y >= GH) continue
    if (seen[y * GW + x] === 1 && (!on || on(x, y))) f.glow[y * GW + x] = 1
  }
}

var BUST_RAIN = [[6, 10], [18, 70], [104, 30], [114, 90]]
var BUST_SPARKS = [[[18, 40], [100, 58]], [[96, 36], [26, 62]], [[108, 48], [14, 54]]]

// The robot. Code runs across its visor while it works; the visor lights
// right up and a beacon goes when it wants you; it dims to a slit on
// standby, and crosses out when it has failed.
function visor(state, n, art) {
  var f = newFrame()
  if (!art || !art.ART || !art.ART.robot) return finish(f)
  var fd = field()
  var pose = "level", dx = 0, dy = 0
  if (state === "working") dy = cycle([0, 0, 1, 1, 0, 0, 1, 1, 0, 0], n)
  else if (state === "needs") { pose = "up"; dy = -cycle([0, 1, 2, 2, 1, 0, 0, 0], n) }
  else if (state === "waiting") dy = -cycle(BREATH, n)
  else if (state === "error") { pose = "tilt"; dx = cycle([-2, 2, -1, 1, -2, 2], n) }
  else { pose = "down"; dy = cycle(BREATH, n) }
  var at = lay2(fd, art, "robot", pose, dx, dy)
  var v = at.marks.visor, x0 = v.x0 + dx, x1 = v.x1 + dx, y0 = v.y0 + dy, y1 = v.y1 + dy
  var core = at.marks.core, lamp = at.marks.lamp
  stateLight(fd, state, n)
  f.body = dither(fd)
  if (state === "working") {
    // lines of code running across it, each its own length, scrolling left
    fillDark(f, at.seen, x0, y0, x1, y1, function (x, y) {
      var row = y - y0
      if (row % 2) return false
      var k = (x + n * 3 + row * 7) % 23
      return k < 4 + (row * 5) % 11
    })
    if (n % 2 === 0) disc(f.glow, core[0] + dx, core[1] + dy, 3, 1)
  } else if (state === "needs") {
    fillDark(f, at.seen, x0, y0, x1, y1)
    disc(f.glow, lamp[0] + dx, lamp[1] + dy, 2, 1)
    beacon(f, Math.floor(n / 2), 100, 14)
  } else if (state === "waiting") {
    if (n % 4 < 2) fillDark(f, at.seen, x0, y0, x1, y1, function (x, y) { return (y - y0) % 3 === 1 })
    rain(f, n, BUST_RAIN)
  } else if (state === "error") {
    var mid = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2)
    cross(f, mid - 16, cy - 4, 9)
    cross(f, mid + 7, cy - 4, 9)
    sparks(f, BUST_SPARKS[n % BUST_SPARKS.length])
  } else {
    // standby: a slit of light in the middle of the visor, breathing
    var w = cycle([3, 4, 5, 6, 6, 5, 4, 3], n), c = Math.round((x0 + x1) / 2)
    fillDark(f, at.seen, c - w, y0, c + w, y1, function (x, y) { return (y - y0) % 3 === 1 })
  }
  return finish(f)
}

// Morty. At the keyboard while it works, tongue out, a paw on the keys at a
// time and the key under it lit; head cocked one way and the other when he
// wants you; out cold on standby.
function morty(state, n, art) {
  var f = newFrame()
  if (!art || !art.ART || !art.ART.morty) return finish(f)
  var fd = field()
  // mouth shut while he works; open, grinning, when he is waiting on you
  var pose = blinking(n) ? "calmBlink" : "calm", dx = 0, dy = 0
  if (state === "working") pose = cycle(["typeL", "typeR", "typeL", "typeR", "typeBoth", "typeL", "typeBlink", "typeR"], n)
  else if (state === "needs") { pose = cycle(["tiltL", "tiltL", "tiltL", "pant", "tiltR", "tiltR", "tiltR", "pant"], n) }
  else if (state === "waiting") { pose = blinking(n) ? "pantBlink" : "pant"; dy = -cycle(BREATH, n) }
  else if (state === "error") { pose = "dizzy"; dx = cycle([-2, 2, -2, 2, -1, 1], n) }
  else { pose = "sleep"; dy = cycle(BREATH, n) }
  var at = lay2(fd, art, "morty", pose, dx, dy)
  stateLight(fd, state, n)
  f.body = dither(fd)
  if (state === "working") {
    // the key under each paw that is down, lit where the paw meets it
    var keys = at.marks.keys || []
    for (var i = 0; i < keys.length; i++) rect(f.glow, keys[i][0] - 4 + dx, keys[i][1] + 4 + dy, 9, 3, 1)
  } else if (state === "needs") {
    beacon(f, Math.floor(n / 2), 100, 10)
  } else if (state === "waiting") {
    rain(f, n, BUST_RAIN)
  } else if (state === "error") {
    sparks(f, BUST_SPARKS[n % BUST_SPARKS.length])
  } else if (state !== "working" && n % 8 === 0) {
    // standby: the tag on his collar catches the light now and then
    var tag = at.marks.tag
    rect(f.glow, tag[0] - 1, tag[1] - 1 + dy, 3, 3, 1)
  }
  return finish(f)
}

// ---- the shapes on offer ---------------------------------------------------

var FIGURES = [
  { id: "deck", name: "Hands", draw: deck, rows: 40, cols: 60, loop: { working: 6, needs: 8, waiting: 16, error: 6, idle: 8 } },
  { id: "visor", name: "Robot", draw: visor, rows: 40, cols: 60, loop: { working: 10, needs: 8, waiting: 16, error: 6, idle: 8 } },
  { id: "morty", name: "Morty", draw: morty, rows: 40, cols: 60, loop: { working: 8, needs: 8, waiting: 16, error: 6, idle: 8 } }
]
var DEFAULT_FIGURE = "deck"
// How long each state holds a frame: fast while it works, slow on standby.
var CADENCE = { working: 240, needs: 300, waiting: 380, error: 300, idle: 700 }

// Anything unknown — nothing stored, a shape from a later version — is the
// usual one.
function shapeOf(id) {
  for (var i = 0; i < FIGURES.length; i++) if (FIGURES[i].id === id) return FIGURES[i]
  for (var j = 0; j < FIGURES.length; j++) if (FIGURES[j].id === DEFAULT_FIGURE) return FIGURES[j]
  return FIGURES[0]
}
function figureId(id) { return shapeOf(id).id }

// How big a figure's grid is, in braille cells. Most are the usual size.
function size(id) {
  var shape = shapeOf(id)
  return { rows: shape.rows || ROWS, cols: shape.cols || COLS }
}

// The baked drawings (RobotArt.js). QML hands them in, since a script there
// cannot load another; under node they are picked up here.
var BAKED = null
if (typeof require === "function") { try { BAKED = require("./RobotArt.js") } catch (e) { BAKED = null } }

var cache = {}
function frames(figure, state, art) {
  var shape = shapeOf(figure)
  var key = shape.loop[state] ? state : "idle"
  var id = shape.id + ":" + key
  if (!cache[id]) {
    var grid = size(shape.id)
    useGrid(grid.rows, grid.cols)
    var out = []
    for (var i = 0; i < shape.loop[key]; i++) out.push(shape.draw(key, i, art || BAKED))
    useGrid(ROWS, COLS)
    cache[id] = out
  }
  return cache[id]
}
function frame(figure, state, n, art) {
  var f = frames(figure, state, art)
  return f[((n % f.length) + f.length) % f.length]
}
function cadence(state) { return CADENCE[state] || 900 }

if (typeof module !== "undefined")
  module.exports = {
    BAYER: BAYER, BITS: BITS, TONES: TONES,
    FIGURES: FIGURES, DEFAULT_FIGURE: DEFAULT_FIGURE,
    figureId: figureId, size: size,
    frames: frames, frame: frame, cadence: cadence
  }
