// Entrance effects for text art, in the spirit of the stock ttfx screensaver:
// every cell of a piece resolves into place at its own moment, and until then
// something is drawn in its stead — a cipher glyph, the character falling in,
// a beam sweeping past. Pure JavaScript over a character grid, so it runs
// under `node --test` and inside the shell alike. The renderer paints
// resolved cells once into a cached canvas and draws the in-flight glyphs as
// one text overlay, so a frame costs a few thousand array writes, not a
// repaint of the art.

var EFFECTS = ["decrypt", "rain", "beams", "scatter", "wipe", "typewriter", "reveal", "pulse",
               "scanline", "grid", "shockwave", "slit", "glitch", "dust"]

// Nobody wants to audit fourteen names to set a mood. Each of these is a set
// the panel can offer as one chip; picking one writes the same `effects`
// array the individual chips do, so there is no second setting to keep in
// step and an old config still means what it meant.
var MOODS = {
  calm:    ["reveal", "wipe", "typewriter", "slit", "pulse"],
  neon:    ["decrypt", "rain", "scanline", "glitch", "grid"],
  kinetic: ["beams", "scatter", "shockwave", "dust"]
}
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
  case "scanline":
    // A bright bar travels down and the text is simply there behind it.
    p.duration = 3000
    for (k = 0; k < n; k++) list[k].at = 250 + (list[k].r / Math.max(1, rows - 1 || 1)) * 2400
    break
  case "grid":
    // Whatever of the art falls on a lattice snaps in first, then the rest
    // fills outward from those lines.
    p.duration = 3400
    p.gridRow = 4
    p.gridCol = 8
    for (k = 0; k < n; k++) {
      var gcell = list[k]
      var dr = Math.min(gcell.r % p.gridRow, p.gridRow - (gcell.r % p.gridRow))
      var dc = Math.min(gcell.c % p.gridCol, p.gridCol - (gcell.c % p.gridCol))
      var near = Math.min(dr, dc)
      gcell.at = near === 0
        ? 150 + (gcell.c / Math.max(1, cols)) * 700
        : 1100 + near * 260 + random() * 260
    }
    break
  case "shockwave":
    // An expanding ring. Rows count double: a character cell is about twice
    // as tall as it is wide, so equal steps in each make a circle.
    p.duration = 3000
    p.centreRow = (rows - 1) / 2
    p.centreCol = (cols - 1) / 2
    p.reach = Math.max(1, Math.sqrt(Math.pow(rows * 2, 2) + Math.pow(cols, 2)) / 2)
    for (k = 0; k < n; k++) {
      var scell = list[k]
      var sdr = (scell.r - p.centreRow) * 2
      var sdc = scell.c - p.centreCol
      scell.dist = Math.sqrt(sdr * sdr + sdc * sdc)
      scell.at = 200 + (scell.dist / p.reach) * 2400
    }
    break
  case "slit":
    // Opens from a single column and widens both ways.
    p.duration = 2900
    p.centreCol = (cols - 1) / 2
    for (k = 0; k < n; k++) {
      var lcell = list[k]
      lcell.at = 200 + (Math.abs(lcell.c - p.centreCol) / Math.max(1, p.centreCol)) * 2400
    }
    break
  case "glitch":
    // The art is there from the first frame but torn into bands that slide
    // sideways; the bands lock back into place one at a time, in a random
    // order spread over the whole run rather than all at once early.
    p.duration = 3200
    p.bandRows = 2
    p.tear = 800
    p.shift = []
    p.settle = []
    var bands = Math.max(1, Math.ceil(rows / p.bandRows))
    var bandOrder = []
    for (k = 0; k < bands; k++) bandOrder.push(k)
    for (k = bandOrder.length - 1; k > 0; k--) {
      var bj = Math.floor(random() * (k + 1))
      var bt = bandOrder[k]; bandOrder[k] = bandOrder[bj]; bandOrder[bj] = bt
    }
    for (k = 0; k < bands; k++) {
      p.shift.push(0)
      p.settle.push(0)
    }
    for (k = 0; k < bands; k++) {
      var slot = bandOrder[k]
      var spread = Math.round((random() * 2 - 1) * Math.max(4, cols * 0.3))
      p.shift[slot] = spread === 0 ? 4 : spread
      p.settle[slot] = 700 + (k / bands) * 2200 + random() * 160
    }
    for (k = 0; k < n; k++) {
      var bcell = list[k]
      bcell.band = Math.floor(bcell.r / p.bandRows)
      bcell.at = p.settle[bcell.band]
    }
    break
  case "dust":
    // Particles drift in from off-frame and converge.
    p.duration = 3400
    p.travel = 1700
    for (k = 0; k < n; k++) {
      var dcell = list[k]
      var angle = random() * Math.PI * 2
      var out = 1.25 + random() * 0.7
      dcell.r0 = (rows - 1) / 2 + Math.sin(angle) * out * rows / 2
      dcell.c0 = (cols - 1) / 2 + Math.cos(angle) * out * cols / 2
      dcell.start = random() * 1500
      dcell.at = dcell.start + p.travel
    }
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
    case "scanline":
    case "slit":
      // The bar itself: a short gradient just ahead of where it has reached.
      var ahead = cell.at - t
      if (ahead < 520) put(grid, cell.r, cell.c, ahead < 120 ? "█" : (ahead < 300 ? "▓" : "░"))
      break
    case "shockwave":
      var ring = cell.at - t
      if (ring < 420) put(grid, cell.r, cell.c, ring < 110 ? "█" : (ring < 260 ? "▓" : "▒"))
      break
    case "grid":
      if (cell.at - t < 240) put(grid, cell.r, cell.c, "▒")
      break
    case "glitch":
      // Torn sideways, the tear closing over the last stretch before the band
      // settles. The jitter is stepped off the clock rather than drawn from
      // the generator, so a frame is the same however often it is asked for.
      var lead = p.settle[cell.band] - t
      var amp = Math.max(0, Math.min(1, lead / p.tear))
      var step = Math.floor(t / 80)
      var jitter = ((cell.band * 31 + step * 17) % 9) / 8 - 0.5
      put(grid, cell.r, cell.c + Math.round(p.shift[cell.band] * amp * (0.7 + jitter * 0.6)), cell.ch)
      break
    case "dust":
      if (t >= cell.start) {
        var e = (t - cell.start) / p.travel
        e = 1 - Math.pow(1 - e, 3)
        put(grid, Math.round(cell.r0 + (cell.r - cell.r0) * e), Math.round(cell.c0 + (cell.c - cell.c0) * e), e < 0.72 ? "·" : cell.ch)
      }
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
  module.exports = { EFFECTS: EFFECTS, MOODS: MOODS, CIPHER: CIPHER, cells: cells, rng: rng, plan: plan, frame: frame, pick: pick }
}
