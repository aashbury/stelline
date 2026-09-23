// The robot, drawn as vector cels and baked to dots by tools/bake.js.
//
// Close up, head and shoulders, the way the hands are close up: an android
// in a plated shell with a visor slit where a face would be, seen from the
// screen it is reading. Same four tones and ink lines as the hands. The
// visor, the core in its chest and the lamp on its antenna are left dark
// here; the figure lights them in the accent — code running across the
// visor while it works — which is how the states read from across a room.

var D = require("./draw.js")
var poly = D.poly, line = D.line, ellipse = D.ellipse, LINE = D.LINE
var CX = D.W / 2

// ---- the head ------------------------------------------------------------------

// `dy` moves it; the visor is returned so the light can find it.
function head(dy) {
  var s = ""
  var p = function (x, y) { return [x, y + dy] }
  // the antenna first, so the helmet comes over its root
  s += line(p(438, 150), p(486, 50), 0, 24) + line(p(438, 150), p(486, 50), 2, 10)
  s += ellipse(p(486, 46), 14, 14, 0, 0)
  // the ear pods, behind the helmet's edge
  s += ellipse(p(222, 290), 26, 46, 2, LINE) + line(p(214, 262), p(214, 318), 0, 7)
  s += ellipse(p(460, 290), 26, 46, 1, LINE) + line(p(468, 262), p(468, 318), 0, 7)
  // the helmet: a long skull narrowing to the jaw, lit on the left
  var skull = [p(262, 84), p(420, 84), p(462, 130), p(470, 250), p(458, 330), p(420, 396), p(376, 424), p(306, 424), p(262, 396), p(224, 330), p(212, 250), p(220, 130)]
  s += poly(skull, 3, LINE * 1.8)
  s += poly([p(404, 88), p(420, 84), p(462, 130), p(470, 250), p(458, 330), p(420, 396), p(376, 424), p(360, 422), p(416, 350), p(440, 170)], 2)
  s += poly([p(446, 200), p(470, 250), p(458, 330), p(420, 396), p(404, 404), p(438, 330)], 1)
  // a lit edge down the left, where the light catches the curve
  s += line(p(232, 140), p(222, 250), 2, 10) + line(p(222, 250), p(232, 330), 2, 10)
  // the temple plates, each its own panel with a seam round it
  s += poly([p(236, 130), p(292, 104), p(300, 200), p(240, 204)], 3, 7)
  s += poly([p(446, 130), p(390, 104), p(382, 200), p(442, 204)], 2, 7)
  for (var r = 0; r < 2; r++) {
    s += ellipse(p(262, 150 + r * 34), 5, 5, 0) + ellipse(p(420, 150 + r * 34), 5, 5, 0)
  }
  // the crest down the middle of the skull
  s += line(p(CX, 92), p(CX, 196), 2, 22, "butt")
  s += line(p(CX - 15, 92), p(CX - 15, 196), 0, 7, "butt") + line(p(CX + 15, 92), p(CX + 15, 196), 0, 7, "butt")
  // the brow, a hard ledge over the visor
  s += line(p(226, 214), p(456, 214), 0, 9, "butt")
  // the visor: one slit across the face, dipping at the middle
  var visor = [p(230, 226), p(CX, 244), p(452, 226), p(454, 262), p(CX, 282), p(228, 262)]
  s += poly(visor, 0, 7)
  // below it the faceplate: a ridge down the middle, cheek seams, a grille
  s += line(p(CX, 290), p(CX, 330), 1, 12, "butt")
  s += line(p(250, 286), p(300, 404), 0, 8) + line(p(432, 286), p(382, 404), 0, 8)
  for (var i = 0; i < 4; i++) {
    var x = CX - 27 + i * 18
    s += line(p(x, 350), p(x, 394), 0, 8, "butt")
  }
  // cheek vents, three slots each side, and the jaw hinge
  for (var v = 0; v < 3; v++) {
    s += line(p(262 + v * 4, 318 + v * 18), p(282 + v * 4, 318 + v * 18), 0, 6, "butt")
    s += line(p(400 - v * 4, 318 + v * 18), p(420 - v * 4, 318 + v * 18), 0, 6, "butt")
  }
  s += ellipse(p(236, 336), 9, 9, 1, 6) + ellipse(p(446, 336), 9, 9, 0, 6)
  return { svg: s, visor: { x0: 234, x1: 448, y0: 236 + dy, y1: 272 + dy }, lamp: [486, 46 + dy] }
}

// ---- the body ------------------------------------------------------------------
//
// Cut off by the bottom of the frame: neck, collar, the top of the chest
// with its core, and the shoulders running off either side. The shell is
// dark and the plates on it lit, so the forms come apart.

function body(dy) {
  var s = ""
  var p = function (x, y) { return [x, y + dy] }
  // the neck: bare cabling, a column of it, behind the collar
  s += poly([p(262, 520), p(420, 520), p(432, 690), p(250, 690)], 0)
  for (var c = 0; c < 8; c++) {
    var x0 = 272 + c * 19.5
    s += line(p(x0, 524), p(x0 + (c - 3.5) * 2.5, 686), c % 3 === 1 ? 3 : 2, 11, "butt")
  }
  s += line(p(258, 600), p(424, 600), 0, 8, "butt")
  // the torso, dark, with a lit rim on the left
  s += poly([p(214, 664), p(468, 664), p(630, 742), p(700, 1010), p(-17, 1010), p(52, 742)], 1, LINE * 1.8)
  s += poly([p(52, 742), p(214, 664), p(236, 680), p(84, 758), p(26, 1010), p(-17, 1010)], 2)
  // the collar: two plates sloping off the neck to the shoulders
  s += poly([p(250, 668), p(310, 700), p(250, 760), p(120, 760)], 3, LINE * 1.2)
  s += poly([p(432, 668), p(372, 700), p(432, 760), p(562, 760)], 2, LINE * 1.2)
  s += ellipse(p(214, 718), 6, 6, 0) + ellipse(p(468, 718), 6, 6, 0)
  // the chest plate: one lit plate, shaded down the right, a seam across
  var plate = [p(262, 716), p(420, 716), p(478, 830), p(446, 1010), p(236, 1010), p(204, 830)]
  s += poly(plate, 3, LINE * 1.6)
  s += poly([p(384, 720), p(420, 716), p(478, 830), p(446, 1010), p(410, 1010), p(438, 830)], 2)
  s += line(p(222, 790), p(460, 790), 0, 8, "butt")
  // the core: a lit ring round a dark lens
  s += ellipse(p(CX, 890), 60, 60, 0, 0)
  s += ellipse(p(CX, 890), 50, 50, 2)
  s += ellipse(p(CX, 890), 36, 36, 0)
  s += ellipse(p(CX - 13, 877), 8, 8, 1)
  // the pauldrons, darker than the plate so the three come apart: a dome
  // each, a lit rim along its top, one seam and two rivets
  s += ellipse(p(20, 880), 150, 124, 2, LINE * 2)
  s += '<path d="M -100 830 Q 0 750 150 800" fill="none" stroke="' + D.TONE[3] + '" stroke-width="14"/>'
  s += line(p(-40, 890), p(158, 846), 0, 8)
  s += ellipse(p(70, 830), 7, 7, 0) + ellipse(p(124, 820), 7, 7, 0)
  s += ellipse(p(663, 880), 150, 124, 1, LINE * 2)
  s += '<path d="M 783 830 Q 683 750 533 800" fill="none" stroke="' + D.TONE[2] + '" stroke-width="14"/>'
  s += line(p(723, 890), p(525, 846), 0, 8)
  s += ellipse(p(613, 830), 7, 7, 0) + ellipse(p(559, 820), 7, 7, 0)
  return { svg: s, core: [CX, 880 + dy] }
}

// The head is drawn at the old size and brought in close.
var HEAD_ZOOM = 1.34, HEAD_AT = [CX, 60], HEAD_FROM = [CX, 84]
function zoomed(pt) { return [HEAD_AT[0] + (pt[0] - HEAD_FROM[0]) * HEAD_ZOOM, HEAD_AT[1] + (pt[1] - HEAD_FROM[1]) * HEAD_ZOOM] }
function bigHead(dy, tilt) {
  var h = head(0)
  var t = "translate(0," + dy + ") rotate(" + (tilt || 0) + " " + CX + " 560) translate(" + HEAD_AT[0] + "," + HEAD_AT[1] + ") scale(" + HEAD_ZOOM + ") translate(" + -HEAD_FROM[0] + "," + -HEAD_FROM[1] + ")"
  var move = function (pt) { var z = zoomed(pt); var r = D.rotate(z, tilt || 0, [CX, 560]); return [r[0], r[1] + dy] }
  var a = move([h.visor.x0, h.visor.y0]), b = move([h.visor.x1, h.visor.y1])
  return { svg: D.group(h.svg, t), visor: { x0: a[0], y0: a[1], x1: b[0], y1: b[1] }, lamp: move(h.lamp) }
}

// A whole pose: how far the head is raised or bowed and tipped, and how far
// the shoulders have sunk.
function pose(o) {
  var h = bigHead(o.head || 0, o.tilt || 0), b = body(o.body || 0)
  return { svg: D.svg(b.svg + h.svg, null), marks: { visor: h.visor, core: b.core, lamp: h.lamp } }
}

function poses() {
  return {
    level: pose({}),
    // looking up to catch you
    up: pose({ head: -26, body: -4 }),
    // a glance aside, for a jolt
    tilt: pose({ head: 4, tilt: -6 }),
    // standby: head bowed, shoulders down
    down: pose({ head: 46, body: 12 })
  }
}

module.exports = { W: D.W, H: D.H, poses: poses }
