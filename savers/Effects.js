// Entrance effects for text art, in the spirit of the stock ttfx screensaver:
// every cell of a piece resolves into place at its own moment, and until then
// something is drawn in its stead — a cipher glyph, the character falling in,
// a beam sweeping past. Pure JavaScript over a character grid, so it runs
// under `node --test` and inside the shell alike. The renderer paints
// resolved cells once into a cached canvas and draws the in-flight glyphs as
// one text overlay, so a frame costs a few thousand array writes, not a
// repaint of the art.

var EFFECTS = ["decrypt", "rain", "beams", "scatter", "wipe", "typewriter", "reveal", "pulse"]
var CIPHER = "!@#$%&*+=?<>/\\|01アイウエオカキクケコサシスセソタチツテトナニヌネノ"

function cells(lines) {
  var out = []
  for (var r = 0; r < lines.length; r++) {
    var line = lines[r]
    for (var c = 0; c < line.length; c++) {
      var ch = line.charAt(c)
      if (ch !== " " && ch !== "\t") out.push({ r: r, c: c, ch: ch })
    }
  }
  return out
}

// A small deterministic generator, so a plan is reproducible under test.
function rng(seed) {
  var s = (Number(seed) || 1) >>> 0
  return function() {
    s = (s + 0x6D2B79F5) >>> 0
    var t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// plan(effect, lines, seed) → { effect, rows, cols, cells, duration (ms), ... }
// Each cell gets `at`, the time it resolves; effects add what they need.
function plan(effect, lines, seed) {
  var rows = lines.length
  var cols = 0
  for (var i = 0; i < rows; i++) cols = Math.max(cols, lines[i].length)
  var list = cells(lines)
  var random = rng(seed)
  var p = { effect: effect, rows: rows, cols: cols, cells: list, duration: 3500, random: random }
  var n = list.length
  var k
  switch (effect) {
  case "decrypt":
    p.duration = 4000
    for (k = 0; k < n; k++) list[k].at = 600 + random() * 3000
    break
  case "rain":
    p.duration = 3600
    p.travel = 700
    for (k = 0; k < n; k++) {
      var cell = list[k]
      cell.start = random() * 2600 * (0.4 + 0.6 * (cell.r / Math.max(1, rows)))
      cell.at = cell.start + p.travel
    }
    break
  case "beams":
    p.duration = 3200
    p.sweep = 500
    p.rowStart = []
    var order = []
    for (k = 0; k < rows; k++) order.push(k)
    for (k = order.length - 1; k > 0; k--) { var j = Math.floor(random() * (k + 1)); var t = order[k]; order[k] = order[j]; order[j] = t }
    for (k = 0; k < rows; k++) p.rowStart[order[k]] = k * (2600 / Math.max(1, rows))
    for (k = 0; k < n; k++) list[k].at = p.rowStart[list[k].r] + (list[k].c / Math.max(1, cols)) * p.sweep
    break
  case "scatter":
    p.duration = 3200
    p.travel = 1200
    for (k = 0; k < n; k++) {
      var s = list[k]
      s.r0 = Math.floor(random() * rows)
      s.c0 = Math.floor(random() * cols)
      s.start = random() * 1800
      s.at = s.start + p.travel
    }
    break
  case "wipe":
    p.duration = 2600
    for (k = 0; k < n; k++) list[k].at = 200 + ((list[k].r / Math.max(1, rows)) * 0.4 + (list[k].c / Math.max(1, cols)) * 0.6) * 2200
    break
  case "typewriter":
    p.duration = Math.min(6000, 800 + n * 6)
    for (k = 0; k < n; k++) list[k].at = (k / Math.max(1, n)) * (p.duration - 300)
    break
  case "reveal":
    p.duration = Math.min(5000, 600 + rows * 140)
    for (k = 0; k < n; k++) list[k].at = list[k].r * 140
    break
  default:
    // pulse and anything unknown: everything is there from the start.
    p.effect = "pulse"
    p.duration = 0
    for (k = 0; k < n; k++) list[k].at = 0
  }
  p.next = 0
  return p
}

function blankGrid(rows, cols) {
  var grid = []
  for (var r = 0; r < rows; r++) grid.push(new Array(cols).fill(" "))
  return grid
}

function put(grid, r, c, ch) {
  if (r < 0 || c < 0 || r >= grid.length || c >= grid[r].length) return
  grid[r][c] = ch
}

// frame(plan, t) → { resolved: [cell, ...] newly in place since the last
// call, overlay: string (the in-flight glyphs on a grid of spaces), done }
function frame(p, t) {
  var resolved = []
  var grid = blankGrid(p.rows, p.cols)
  var list = p.cells
  var random = p.random
  var cursor = p.effect === "typewriter" ? firstPending(p, t) : -1
  for (var k = 0; k < list.length; k++) {
    var cell = list[k]
    if (cell.at <= t) {
      if (!cell.done) { cell.done = true; resolved.push(cell) }
      continue
    }
    switch (p.effect) {
    case "decrypt":
      put(grid, cell.r, cell.c, CIPHER.charAt(Math.floor(random() * CIPHER.length)))
      break
    case "rain":
      if (t >= cell.start) {
        var f = (t - cell.start) / p.travel
        put(grid, Math.round(-1 + (cell.r + 1) * f), cell.c, cell.ch)
      }
      break
    case "beams":
      var rs = p.rowStart[cell.r]
      if (t >= rs && t < rs + p.sweep) {
        var head = (t - rs) / p.sweep * p.cols
        var d = cell.c - head
        if (d >= 0 && d < 5) put(grid, cell.r, cell.c, d < 1 ? "█" : (d < 2 ? "▓" : (d < 3.5 ? "▒" : "░")))
      }
      break
    case "scatter":
      if (t >= cell.start) {
        var g = (t - cell.start) / p.travel
        g = g * g * (3 - 2 * g)
        put(grid, Math.round(cell.r0 + (cell.r - cell.r0) * g), Math.round(cell.c0 + (cell.c - cell.c0) * g), cell.ch)
      }
      break
    case "wipe":
      if (cell.at - t < 260) put(grid, cell.r, cell.c, cell.at - t < 130 ? "▒" : "░")
      break
    case "typewriter":
      if (k === cursor) put(grid, cell.r, cell.c, "█")
      break
    }
  }
  var lines = []
  for (var r = 0; r < grid.length; r++) lines.push(grid[r].join("").replace(/\s+$/, ""))
  return { resolved: resolved, overlay: lines.join("\n"), done: t >= p.duration }
}

// The cursor sits on the first cell still to come at time t.
function firstPending(p, t) {
  for (var k = 0; k < p.cells.length; k++) if (p.cells[k].at > t) return k
  return -1
}

function pick(list, random) {
  var pool = Array.isArray(list) && list.length ? list.filter(function(e) { return EFFECTS.indexOf(e) !== -1 }) : EFFECTS
  if (pool.length === 0) pool = EFFECTS
  var r = typeof random === "number" ? random : Math.random()
  return pool[Math.min(pool.length - 1, Math.floor(r * pool.length))]
}

if (typeof module !== "undefined") {
  module.exports = { EFFECTS: EFFECTS, CIPHER: CIPHER, cells: cells, rng: rng, plan: plan, frame: frame, pick: pick }
}
