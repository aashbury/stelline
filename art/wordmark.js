// The Stelline wordmark, drawn as vector cels and baked to dots by
// tools/bake.js into savers/stelline.txt.
//
// A title card rather than a label: heavy slanted capitals with their top
// faces lit and their fronts in the dense tone, an extrusion falling away
// down and to the right in the sparse tone, an ink line round every letter
// so face and depth come apart, and scanlines across the faces. A rule under
// it with a lit run and tick marks.
// Same four tones as the figures; typed words get the same treatment from
// the cache script (StellineModel.wordmarkScript), without the extras.
//
// The dot grid is 280 × 72: 140 braille cells by 18. The canvas is drawn at
// the dot's real proportions, the same as the figures.

var DOTS_W = 280, DOTS_H = 72
var UX = 683 / 120, UY = 1000 / 160          // one dot, in units
var W = Math.round(DOTS_W * UX), H = Math.round(DOTS_H * UY)
var TONE = { 3: "#ffffff", 2: "#aaaaaa", 1: "#555555", 0: "#000000" }
var FONT = "Adwaita Sans"

var WORD = "STELLINE"
var SIZE = 282                 // the capitals' em, in units
var BASE = 262                 // where they stand
var SLANT = -12                // degrees, leaning forward
var DEPTH = 9                  // how many steps the extrusion falls
var STEP = [3.2, 3.6]          // how far each step falls, across and down
var INK = 16                   // the line round each letter

function text(fill, extra) {
  return '<text x="' + W / 2 + '" y="' + BASE + '" text-anchor="middle" font-family="' + FONT +
    '" font-weight="900" font-size="' + SIZE + '" letter-spacing="2" fill="' + fill + '"' + (extra || "") + ">" + WORD + "</text>"
}

function svg() {
  var s = ""
  s += '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">'
  s += '<rect width="' + W + '" height="' + H + '" fill="#000"/>'
  s += "<defs>"
  s += '<clipPath id="letters">' + text("#fff") + "</clipPath>"
  s += "</defs>"
  s += '<g transform="translate(' + (-Math.tan(SLANT * Math.PI / 180) * BASE) + ',0) skewX(' + SLANT + ')">'
  // the extrusion, back to front, and its ink
  for (var i = DEPTH; i >= 1; i--) {
    var t = 'transform="translate(' + (i * STEP[0]) + "," + (i * STEP[1]) + ')"'
    s += "<g " + t + ">" + text(TONE[0], ' stroke="#000" stroke-width="' + INK + '" stroke-linejoin="round"') + "</g>"
  }
  for (var j = DEPTH; j >= 1; j--) {
    s += '<g transform="translate(' + (j * STEP[0]) + "," + (j * STEP[1]) + ')">' + text(TONE[1]) + "</g>"
  }
  // the ink round the faces, then the faces
  s += text("#000", ' stroke="#000" stroke-width="' + INK + '" stroke-linejoin="round"')
  // lit on top, dense below, the split drawn straight across every letter
  s += '<g clip-path="url(#letters)">'
  s += '<rect x="0" y="0" width="' + W + '" height="' + (BASE - SIZE * 0.36) + '" fill="' + TONE[3] + '"/>'
  s += '<rect x="0" y="' + (BASE - SIZE * 0.36) + '" width="' + W + '" height="' + SIZE + '" fill="' + TONE[2] + '"/>'
  // scanlines across the faces, a dot tall, every seventh dot
  for (var y = BASE - SIZE; y < BASE + 10; y += UY * 7) s += '<rect x="0" y="' + y + '" width="' + W + '" height="' + UY + '" fill="#000"/>'
  s += "</g></g>"
  // the rule: a lit run, then the rest dense, tick marks along it
  var ry = BASE + 58, x0 = W * 0.08, x1 = W * 0.92
  s += '<rect x="' + x0 + '" y="' + ry + '" width="' + (x1 - x0) * 0.3 + '" height="' + UY * 1.4 + '" fill="' + TONE[3] + '"/>'
  s += '<rect x="' + (x0 + (x1 - x0) * 0.3 + UX * 3) + '" y="' + ry + '" width="' + ((x1 - x0) * 0.7 - UX * 3) + '" height="' + UY * 1.4 + '" fill="' + TONE[2] + '"/>'
  for (var k = 0; k <= 12; k++) {
    var tx = x0 + (x1 - x0) * k / 12
    s += '<rect x="' + tx + '" y="' + (ry + UY * 2.4) + '" width="' + UX * 1.2 + '" height="' + UY * (k % 3 === 0 ? 3 : 1.6) + '" fill="' + TONE[2] + '"/>'
  }
  s += "</svg>"
  return s
}

module.exports = { W: W, H: H, DOTS_W: DOTS_W, DOTS_H: DOTS_H, svg: svg }
