// What the figures in art/ are drawn with: a few SVG shapes in the four
// tones, and the keyboard the robot and Morty sit behind. The hands keep
// their own copy of these; they came first.
//
// The canvas is 683 × 1000: the 120 × 160 dot grid at the braille cell's
// real proportions, so what is drawn here is what the screen shows. A dot
// is about 6 units, so nothing that has to survive can be thinner than 9.

var W = 683, H = 1000
var TONE = { 3: "#ffffff", 2: "#aaaaaa", 1: "#555555", 0: "#000000", 4: "#ff0000" }
// 4 is not a tone but the accent: the baker keeps it apart, and it is drawn
// in the theme's accent colour.
var ACCENT = 4
var LINE = 9

function f(n) { return Math.round(n * 10) / 10 }
function pts(list) { return list.map(function (p) { return f(p[0]) + "," + f(p[1]) }).join(" ") }
function poly(list, tone, stroke) {
  return '<polygon points="' + pts(list) + '" fill="' + TONE[tone] + '"' +
    (stroke ? ' stroke="#000" stroke-width="' + stroke + '" stroke-linejoin="round"' : "") + "/>"
}
function line(a, b, tone, w, cap) {
  return '<line x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) +
    '" stroke="' + TONE[tone] + '" stroke-width="' + f(w) + '" stroke-linecap="' + (cap || "round") + '"/>'
}
function ellipse(c, rx, ry, tone, stroke, rot) {
  return '<ellipse cx="' + f(c[0]) + '" cy="' + f(c[1]) + '" rx="' + f(rx) + '" ry="' + f(ry) + '" fill="' + TONE[tone] + '"' +
    (stroke ? ' stroke="#000" stroke-width="' + stroke + '"' : "") +
    (rot ? ' transform="rotate(' + f(rot) + " " + f(c[0]) + " " + f(c[1]) + ')"' : "") + "/>"
}
// A path, for the shapes a polygon makes too angular: an ear, a skull.
function path(d, tone, stroke) {
  return '<path d="' + d + '" fill="' + TONE[tone] + '"' +
    (stroke ? ' stroke="#000" stroke-width="' + stroke + '" stroke-linejoin="round"' : "") + "/>"
}
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }
function rotate(p, deg, c) {
  var a = deg * Math.PI / 180, x = p[0] - c[0], y = p[1] - c[1]
  return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]
}
function group(body, transform) { return transform ? '<g transform="' + transform + '">' + body + "</g>" : body }
function svg(body, background) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H +
    '" preserveAspectRatio="none">' + (background ? '<rect width="' + W + '" height="' + H + '" fill="' + background + '"/>' : "") +
    body + "</svg>"
}

// ---- the keyboard, from the screen's side ------------------------------------
//
// Across the bottom of the frame, seen from where the monitor is: its far
// edge from the typist is the near edge to us, so it widens toward the
// bottom and runs off both sides. Whoever is typing sits behind it, and
// everything of theirs but their hands stops at its top edge.

var BOARD_TOP = 815, BOARD_BOTTOM = 1000
function boardEdge(y) {
  var t = (y - BOARD_TOP) / (BOARD_BOTTOM - BOARD_TOP)
  return [70 + (-40 - 70) * t, 613 + (723 - 613) * t]
}
var ROWS = [
  { top: 832, bottom: 872, keys: [1.2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.2] },
  { top: 880, bottom: 924, keys: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1.5] },
  { top: 932, bottom: 980, keys: [1.4, 1.3, 5.6, 1.3, 1.4] }
]
var KEY_GAP = 12

function keys() {
  var out = []
  for (var r = 0; r < ROWS.length; r++) {
    var row = ROWS[r]
    var et = boardEdge(row.top), eb = boardEdge(row.bottom)
    var inset = 20
    var total = row.keys.reduce(function (a, b) { return a + b }, 0)
    var at = 0
    for (var k = 0; k < row.keys.length; k++) {
      var t0 = at / total, t1 = (at + row.keys[k]) / total
      at += row.keys[k]
      var x = function (e, t) { return e[0] + inset + (e[1] - e[0] - inset * 2) * t }
      var g = KEY_GAP / 2
      out.push({ row: r, quad: [[x(et, t0) + g, row.top], [x(et, t1) - g, row.top], [x(eb, t1) - g, row.bottom], [x(eb, t0) + g, row.bottom]] })
    }
  }
  return out
}

function board() {
  var s = ""
  var a = boardEdge(BOARD_TOP), b = boardEdge(BOARD_BOTTOM)
  s += poly([[a[0], BOARD_TOP], [a[1], BOARD_TOP], [b[1], BOARD_BOTTOM], [b[0], BOARD_BOTTOM]], 0)
  // its back edge, catching the light
  s += line([a[0], BOARD_TOP + 4], [a[1], BOARD_TOP + 4], 1, 9, "butt")
  var all = keys()
  for (var i = 0; i < all.length; i++) {
    var q = all[i].quad
    // a lit rim round a dark cap, the near face a thin grey lip
    var mid = [lerp(q[0], q[3], 0.72), lerp(q[1], q[2], 0.72)]
    s += '<polygon points="' + pts([q[0], q[1], mid[1], mid[0]]) + '" fill="#000" stroke="' + TONE[2] + '" stroke-width="7" stroke-linejoin="round"/>'
  }
  return svg(s, "#000")
}
function keymap() {
  var s = ""
  var all = keys()
  for (var i = 0; i < all.length; i++) {
    var v = (i + 1) * 3
    s += '<polygon points="' + pts(all[i].quad) + '" fill="rgb(' + v + ',0,0)" stroke="rgb(' + v + ',0,0)" stroke-width="10" stroke-linejoin="round"/>'
  }
  return svg(s, "#000")
}

module.exports = {
  W: W, H: H, TONE: TONE, ACCENT: ACCENT, LINE: LINE, BOARD_TOP: BOARD_TOP,
  f: f, pts: pts, poly: poly, line: line, ellipse: ellipse, path: path, lerp: lerp, rotate: rotate,
  group: group, svg: svg, board: board, keymap: keymap, keys: keys
}
