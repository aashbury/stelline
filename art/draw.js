// What the figures in art/ are drawn with: a few SVG shapes in the four
// tones.
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

module.exports = {
  W: W, H: H, TONE: TONE, ACCENT: ACCENT, LINE: LINE,
  f: f, pts: pts, poly: poly, line: line, ellipse: ellipse, path: path, lerp: lerp, rotate: rotate,
  group: group, svg: svg
}
