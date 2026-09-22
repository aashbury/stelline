// The hands, drawn as vector cels and baked to dots by tools/bake.js.
//
// Over the shoulder of whoever is typing: two plated hands on a keyboard
// that runs off both sides of the frame, forearms coming in from the bottom
// corners. Four tones only, the way the reference does it — lit plate,
// a dense shade, a sparse shade, and black for the gaps and the shadows —
// and every edge a black line wide enough to survive being made of dots.
//
// The canvas is 683 × 1000: the 120 × 160 dot grid at the braille cell's
// real proportions, so what is drawn here is what the screen shows.

var W = 683, H = 1000
var TONE = { 3: "#ffffff", 2: "#aaaaaa", 1: "#555555", 0: "#000000", 4: "#ff0000" }
// 4 is not a tone but the accent: the baker keeps it apart, and it is drawn
// in the theme's accent colour — a fingertip lit where it meets a key.
var ACCENT = 4
var LINE = 9            // an ink line, a touch over one dot wide

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
function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }
// The whole scene is drawn a little small and then brought in close, so
// the hands fill the frame and the keyboard runs off it on every side.
var ZOOM = 1.28, ANCHOR = [W / 2, 640]
function zoom(p) { return [ANCHOR[0] + (p[0] - ANCHOR[0]) * ZOOM, ANCHOR[1] + (p[1] - ANCHOR[1]) * ZOOM] }
function svg(body, background) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H +
    '" preserveAspectRatio="none">' + (background ? '<rect width="' + W + '" height="' + H + '" fill="' + background + '"/>' : "") +
    '<g transform="translate(' + ANCHOR[0] + "," + ANCHOR[1] + ") scale(" + ZOOM + ") translate(" + -ANCHOR[0] + "," + -ANCHOR[1] + ')">' +
    body + "</g></svg>"
}

// ---- the keyboard ------------------------------------------------------------
//
// A trapezoid in perspective: narrow at the far edge, wider than the frame
// at the near one. Five rows, each a little deeper than the one behind it.

var BOARD_TOP = 150, BOARD_BOTTOM = 575
function boardEdge(y) {
  var t = (y - BOARD_TOP) / (BOARD_BOTTOM - BOARD_TOP)
  return [70 + (-30 - 70) * t, 613 + (713 - 613) * t]
}
var ROWS = [
  { top: 164, bottom: 220, keys: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { top: 229, bottom: 291, keys: [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { top: 300, bottom: 368, keys: [1.8, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.4] },
  { top: 377, bottom: 450, keys: [2.3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2] },
  { top: 459, bottom: 540, keys: [1.4, 1.3, 1.3, 6.2, 1.3, 1.3, 1.4] }
]
var KEY_GAP = 11

// Every key as its quad, in order, so a key can be lit by number.
function keys() {
  var out = []
  for (var r = 0; r < ROWS.length; r++) {
    var row = ROWS[r]
    var et = boardEdge(row.top), eb = boardEdge(row.bottom)
    var inset = 18
    var total = row.keys.reduce(function (a, b) { return a + b }, 0)
    var at = 0
    for (var k = 0; k < row.keys.length; k++) {
      var t0 = at / total, t1 = (at + row.keys[k]) / total
      at += row.keys[k]
      var x = function (e, t) { return e[0] + inset + (e[1] - e[0] - inset * 2) * t }
      var g = KEY_GAP / 2
      out.push({
        row: r,
        quad: [[x(et, t0) + g, row.top], [x(et, t1) - g, row.top], [x(eb, t1) - g, row.bottom], [x(eb, t0) + g, row.bottom]]
      })
    }
  }
  return out
}

function board() {
  var s = ""
  var a = boardEdge(BOARD_TOP), b = boardEdge(BOARD_BOTTOM)
  // the case, and its lip catching the light along the front
  s += poly([[a[0], BOARD_TOP], [a[1], BOARD_TOP], [b[1], BOARD_BOTTOM], [b[0], BOARD_BOTTOM]], 0)
  s += poly([[b[0], BOARD_BOTTOM], [b[1], BOARD_BOTTOM], [b[1], BOARD_BOTTOM + 16], [b[0], BOARD_BOTTOM + 16]], 1)
  s += line([a[0], BOARD_TOP], [a[1], BOARD_TOP], 1, 8, "butt")
  var all = keys()
  for (var i = 0; i < all.length; i++) {
    var q = all[i].quad
    // a key is its top face, inked as a lit rim round a dark cap
    var mid = [lerp(q[0], q[3], 0.74), lerp(q[1], q[2], 0.74)]
    s += '<polygon points="' + pts([q[0], q[1], mid[1], mid[0]]) + '" fill="#000" stroke="' + TONE[2] + '" stroke-width="7" stroke-linejoin="round"/>'
  }
  return svg(s, "#000")
}

// The same keys again, each filled with its own number, so the baker can
// tell which dots belong to which key.
function keymap() {
  var s = ""
  var all = keys()
  for (var i = 0; i < all.length; i++) {
    var v = (i + 1) * 3
    // with its rim, so a pressed key lights round the finger that covers it
    s += '<polygon points="' + pts(all[i].quad) + '" fill="rgb(' + v + ',0,0)" stroke="rgb(' + v + ',0,0)" stroke-width="10" stroke-linejoin="round"/>'
  }
  return svg(s, "#000")
}

// ---- one hand -------------------------------------------------------------------
//
// Drawn as the left hand; the right is the same drawing in a mirror, the way
// the reference does it. Light comes from the upper left, so every round
// form has its lit stripe on that side and its shade on the other.

// Each finger leaves the hand at its knuckle and runs away from us onto the
// home row, curling down as it goes. From behind and above, that curl is
// foreshortening: a long first segment catching the light on top, a shorter
// middle one turning away from it, and a stub of a tip, dark, on the key.
var FINGERS = [
  { base: [122, 482], lean: -0.17, len: [40, 26, 16], w: 31 },   // little
  { base: [164, 464], lean: -0.07, len: [47, 29, 18], w: 36 },   // ring
  { base: [208, 458], lean: 0.02, len: [50, 31, 19], w: 38 },    // middle
  { base: [252, 468], lean: 0.14, len: [45, 28, 18], w: 37 }     // index
]
var THUMB = { base: [282, 562], tip: [318, 490], w: 36 }

// A plated segment in one tone, with a lit stripe down the side facing the
// light and a darker one down the other, and an ink outline round it all.
// A finger is too narrow for stripes to survive as dots, so it is one tone.
var LIGHTER = { 1: 2, 2: 3, 3: 3 }, DARKER = { 1: 0, 2: 1, 3: 2 }
function segment(a, b, w, tone) {
  var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy) || 1
  var nx = -dy / len, ny = dx / len
  if (nx > 0) { nx = -nx; ny = -ny }          // toward the light, on the left
  var off = function (p, k) { return [p[0] + nx * w * k, p[1] + ny * w * k] }
  var s = line(a, b, tone, w)
  if (w < 44) return s
  if (tone < 3) s += line(off(a, 0.22), off(b, 0.22), LIGHTER[tone], w * 0.3)
  s += line(off(a, -0.3), off(b, -0.3), DARKER[tone], w * 0.26)
  return s
}
function outline(a, b, w) { return line(a, b, 0, w + LINE * 2) }
// The seam at a joint: a black line straight across the finger.
function joint(p, dir, w) {
  var len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]) || 1
  var nx = -dir[1] / len * w * 0.55, ny = dir[0] / len * w * 0.55
  return line([p[0] - nx, p[1] - ny], [p[0] + nx, p[1] + ny], 0, 7, "butt")
}

// A finger with `lift` from 0 (on its key) to 1 (well up). Raised, the whole
// curl rises in the picture, the tip most, and a shadow is left on the key
// where it was; pressing, it reaches a touch further down.
function finger(fg, lift, press) {
  var dir = [fg.lean, -1]
  var at = function (d, rise) { return [fg.base[0] + dir[0] * d, fg.base[1] + dir[1] * d - rise] }
  var l0 = fg.len[0], l1 = fg.len[1], l2 = fg.len[2] + (press ? 5 : 0)
  var j1 = at(l0, lift * 6), j2 = at(l0 + l1, lift * 16), tip = at(l0 + l1 + l2, lift * 30)
  var rest = at(l0 + l1 + fg.len[2], 0)
  var back = "", front = ""
  if (lift > 0.15) back += ellipse([rest[0] + 5, rest[1] + 4], fg.w * 0.6, fg.w * 0.36, 0)
  front += outline(fg.base, j1, fg.w) + outline(j1, j2, fg.w * 0.95) + outline(j2, tip, fg.w * 0.9)
  front += segment(j2, tip, fg.w * 0.9, press ? ACCENT : 2)
  front += segment(j1, j2, fg.w * 0.95, 2)
  front += segment(fg.base, j1, fg.w, 3)
  front += joint(j1, dir, fg.w) + joint(j2, dir, fg.w * 0.95)
  return { back: back, front: front, tip: tip, pressing: lift === 0 }
}

var TURN = 9, WRIST = [211, 650]
function rotate(p, deg, c) {
  var a = deg * Math.PI / 180, x = p[0] - c[0], y = p[1] - c[1]
  return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]
}

function hand(lifts, dy) {
  var shadows = "", body = "", tips = []
  // the thumb first, so the side of the hand comes over its root
  var th = THUMB, tl = lifts[4] || 0
  var ttip = [th.tip[0], th.tip[1] - tl * 14]
  var tj = lerp(th.base, ttip, 0.58)
  body += outline(th.base, tj, th.w) + outline(tj, ttip, th.w * 0.9)
  body += segment(th.base, tj, th.w, 3) + segment(tj, ttip, th.w * 0.9, 2)
  body += joint(tj, [ttip[0] - th.base[0], ttip[1] - th.base[1]], th.w)
  for (var i = 0; i < 4; i++) {
    var fi = finger(FINGERS[i], lifts[i], lifts[i] === 0)
    shadows += fi.back
    body += fi.front
    tips.push(fi)
  }

  // the back of the hand: one lit plate, shaded down the side turned away
  // from the light and along the heel, with a seam curving across it
  var back = [[100, 494], [114, 458], [162, 440], [208, 434], [254, 444], [290, 472], [312, 528], [294, 588], [264, 620], [156, 620], [116, 572]]
  body += poly(back, 3, LINE * 1.6)
  body += poly([[268, 488], [306, 530], [290, 584], [262, 614], [240, 604], [262, 548]], 2)
  body += poly([[156, 596], [262, 596], [264, 616], [156, 616]], 2)
  // the tendons, running back from between the knuckles to the wrist
  body += line([143, 478], [178, 584], 0, 6) + line([186, 470], [201, 588], 0, 6) + line([231, 474], [224, 586], 0, 6)
  // the knuckles, a row of caps standing proud of the plate
  for (var k = 0; k < 4; k++) {
    var b = FINGERS[k].base
    body += ellipse([b[0], b[1] - 10], FINGERS[k].w * 0.5, 12, 3, 7)
  }

  // the wrist: bare cabling between the hand and the cuff
  var wrist = poly([[152, 612], [270, 612], [276, 676], [148, 676]], 0)
  for (var c = 0; c < 7; c++) {
    var x0 = 160 + c * 16.5
    wrist += line([x0, 616], [x0 - 2 + (c - 3) * 1.5, 672], c % 3 === 1 ? 3 : 2, 10, "butt")
  }
  // the forearm: a plated shell widening toward us and off the bottom
  var arm = ""
  arm += poly([[146, 668], [276, 668], [262, 1010], [22, 1010]], 2, LINE * 1.6)
  arm += poly([[160, 690], [214, 690], [140, 1010], [44, 1010]], 3)
  arm += poly([[246, 690], [270, 690], [258, 1010], [206, 1010]], 1)
  arm += line([146, 704], [276, 704], 0, 8, "butt")
  arm += line([214, 690], [140, 1010], 0, 6, "butt")
  arm += ellipse([118, 850], 12, 18, 0, 0, 14) + ellipse([118, 850], 5, 9, 2, 0, 14)
  // the sleeve, dark, off the bottom of the frame
  arm += poly([[36, 900], [256, 900], [262, 1010], [10, 1010]], 1, LINE)
  arm += line([80, 918], [60, 1004], 0, 7) + line([150, 916], [140, 1006], 0, 7) + line([214, 914], [220, 1004], 0, 7)

  // the hand turns in a little to follow the line of the forearm
  var turn = 'transform="rotate(' + TURN + " " + WRIST[0] + " " + WRIST[1] + ')"'
  var s = '<g transform="translate(0,' + f(dy) + ')">' + arm + "<g " + turn + ">" + shadows + wrist + body + "</g></g>"
  return { svg: s, tips: tips.map(function (t) { var p = rotate(t.tip, TURN, WRIST); return { at: [p[0], p[1] + dy], pressing: t.pressing } }) }
}

// Both hands. `left` and `right` are each [little, ring, middle, index, thumb]
// lifts; `dy` raises the pair off the keys.
function hands(left, right, dy) {
  var l = hand(left, dy || 0), r = hand(right, dy || 0)
  var body = l.svg + '<g transform="translate(' + W + ',0) scale(-1,1)">' + r.svg + "</g>"
  var tips = l.tips.concat(r.tips.map(function (t) { return { at: [W - t.at[0], t.at[1]], pressing: t.pressing } }))
    .map(function (t) { return { at: zoom(t.at), pressing: t.pressing } })
  return { svg: svg(body, null), tips: tips }
}

// ---- the poses ------------------------------------------------------------------

var TYPING = [
  [[0.6, 0.4, 0.7, 0, 0.2], [0.5, 0.8, 0.3, 0.6, 0.2]],
  [[0.5, 0.7, 0.3, 0.5, 0.2], [0.6, 0.4, 0, 0.7, 0.2]],
  [[0.3, 0, 0.6, 0.7, 0.2], [0.7, 0.5, 0.6, 0.3, 0.2]],
  [[0.6, 0.5, 0.4, 0.3, 0.2], [0.4, 0.7, 0.5, 0, 0.2]],
  [[0.7, 0.4, 0, 0.6, 0.2], [0, 0.6, 0.7, 0.4, 0.2]],
  [[0.4, 0.6, 0.5, 0.3, 0], [0.6, 0, 0.4, 0.6, 0.2]]
]
var REST = [0.12, 0.12, 0.12, 0.12, 0.1]
var UP = [1, 1, 1, 1, 0.8]

function poses() {
  var out = {}
  for (var i = 0; i < TYPING.length; i++) out["type" + i] = hands(TYPING[i][0], TYPING[i][1], 0)
  out.rest = hands(REST, REST, 0)
  out.up = hands(UP, UP, -34)
  return out
}

module.exports = { W: W, H: H, board: board, keymap: keymap, poses: poses, KEY_COUNT: keys().length }
