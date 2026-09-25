// Entrance effects for text art, in the spirit of the stock ttfx screensaver:
// every cell of a piece resolves into place at its own moment, and until then
// something is drawn in its stead — a cipher glyph, the character falling in,
// a beam sweeping past. Pure JavaScript over a character grid, so it runs
// under `node --test` and inside the shell alike. The renderer paints
// resolved cells once into a cached canvas and draws the in-flight glyphs as
// one text overlay, so a frame costs a few thousand array writes, not a
// repaint of the art.

var EFFECTS = ["decrypt", "rain", "beams", "scatter", "wipe", "typewriter", "reveal", "pulse",
               "scanline", "grid", "shockwave", "slit", "glitch", "dust",
               "cascade", "derez", "collapse", "storm"]

// How a piece leaves. An arrival on its own is a poster; a screensaver wants
// the art to go again, so every cycle is arrive, live, depart. Departures are
// drawn entirely in the overlay — the cached canvas can only be added to —
// which is the same work a dense arrival frame already does.
var EXITS = ["fall", "shear", "implode", "dissolve", "sweepout"]

// What happens while the art is resting: cheap, a few rows at a time, so the
// screen is never a still picture.
var AMBIENTS = ["scan", "interference", "flicker", "shimmer"]

// The ambients that only change how brightly the art burns, never what it is
// made of. Braille art is dots, not letters: scramble it and you get
// katakana where a face was. A dot matrix rests with one of these.
var STEADY_AMBIENTS = ["scan", "shimmer"]

// The ones that animate the whole canvas rather than the letters alone. They
// are the point of the thing and also most of its cost, so on battery they
// step aside — the same bargain Series already makes with its frame rate.
var FIELD_EFFECTS = ["cascade", "shockwave", "beams", "storm"]

// `pulse` is the one entrance that is not an arrival: it shows the piece
// whole and lets the colour breathe. A piece with nothing else to play has
// nowhere to arrive from, so it should be left where it is rather than cycled.
function onlyPulse(list) {
  var pool = Array.isArray(list) ? list.filter(function(e) { return typeof e === "string" && e !== "" }) : []
  return pool.length > 0 && pool.every(function(e) { return e === "pulse" })
}

function onlyCheap(list) {
  var pool = (Array.isArray(list) && list.length ? list : EFFECTS).filter(function(e) {
    return FIELD_EFFECTS.indexOf(e) === -1
  })
  return pool.length ? pool : ["reveal"]
}

// Nobody wants to audit every name to set a mood. Each of these is a set
// the panel can offer as one chip; picking one writes the same `effects`
// array the individual chips do, so there is no second setting to keep in
// step and an old config still means what it meant.
var MOODS = {
  calm:    ["reveal", "wipe", "typewriter", "slit", "pulse"],
  neon:    ["decrypt", "rain", "scanline", "glitch", "grid", "cascade"],
  kinetic: ["beams", "scatter", "shockwave", "dust", "derez", "collapse", "storm"]
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
// The weather of a field effect can have a grid of its own: the whole screen,
// at the dot size the art would have at Full, so a small picture still gets
// rain across the screen, in drops the same size as ever. `field` says where
// the art sits on that grid: its top left cell (r0, c0) and how big one of
// the art's cells is in field cells (sr, sc). Without one — a tile, a test —
// the weather is drawn in the art's own grid, a margin round it, as before.
function fieldOf(effect, field) {
  if (FIELD_EFFECTS.indexOf(effect) === -1 || !field) return null
  if (!(field.cols > 0 && field.rows > 0 && field.sc > 0 && field.sr > 0)) return null
  return field
}
// Where an art cell's middle lies on the field.
function fieldRow(F, r) { return F.r0 + (r + 0.5) * F.sr }
function fieldCol(F, c) { return F.c0 + (c + 0.5) * F.sc }

function plan(effect, lines, seed, field) {
  var rows = lines.length
  var cols = 0
  for (var i = 0; i < rows; i++) cols = Math.max(cols, lines[i].length)
  var list = cells(lines)
  var random = rng(seed)
  var F = fieldOf(effect, field)
  var p = { effect: effect, rows: rows, cols: cols, cells: list, duration: 3500, random: random, padR: 0, padC: 0, clearsField: false, field: F }
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
    if (F) {
      // A beam per field row the art spans, each crossing the whole screen.
      p.sweep = Math.min(1400, 500 * F.cols / Math.max(1, cols * F.sc))
      p.fieldRowOf = []
      var frows = [], seen = {}
      for (k = 0; k < rows; k++) {
        var fr = Math.floor(fieldRow(F, k))
        p.fieldRowOf.push(fr)
        if (!seen[fr]) { seen[fr] = true; frows.push(fr) }
      }
      for (k = frows.length - 1; k > 0; k--) { var fj = Math.floor(random() * (k + 1)); var ft = frows[k]; frows[k] = frows[fj]; frows[fj] = ft }
      p.fieldRowStart = {}
      for (k = 0; k < frows.length; k++) p.fieldRowStart[frows[k]] = k * (2600 / Math.max(1, frows.length))
      for (k = 0; k < n; k++) list[k].at = p.fieldRowStart[p.fieldRowOf[list[k].r]] + (fieldCol(F, list[k].c) / F.cols) * p.sweep
      break
    }
    p.padC = Math.max(6, Math.round(cols * 0.1))
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
    p.padR = Math.max(2, Math.round(rows * 0.5))
    p.padC = Math.max(6, Math.round(cols * 0.08))
    for (k = 0; k < n; k++) {
      var s = list[k]
      s.r0 = Math.floor(-p.padR + random() * (rows + p.padR * 2))
      s.c0 = Math.floor(-p.padC + random() * (cols + p.padC * 2))
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
    if (F) {
      // From the middle of the art out to the furthest corner of the screen.
      p.fps = 12
      p.centreRow = F.r0 + rows * F.sr / 2
      p.centreCol = F.c0 + cols * F.sc / 2
      p.reach = 1
      var corners = [[0, 0], [0, F.cols], [F.rows, 0], [F.rows, F.cols]]
      for (k = 0; k < 4; k++) p.reach = Math.max(p.reach, Math.sqrt(Math.pow((corners[k][0] - p.centreRow) * 2, 2) + Math.pow(corners[k][1] - p.centreCol, 2)))
      for (k = 0; k < n; k++) {
        var fsc = list[k]
        var fdr = (fieldRow(F, fsc.r) - p.centreRow) * 2, fdc = fieldCol(F, fsc.c) - p.centreCol
        fsc.dist = Math.sqrt(fdr * fdr + fdc * fdc)
        fsc.at = 200 + (fsc.dist / p.reach) * 2400
      }
      break
    }
    p.centreRow = (rows - 1) / 2
    p.centreCol = (cols - 1) / 2
    p.fps = 12
    p.padR = Math.max(3, Math.round(rows * 0.7))
    p.padC = Math.max(6, Math.round(cols * 0.08))
    p.reach = Math.max(1, Math.sqrt(Math.pow((rows + p.padR * 2) * 2, 2) + Math.pow(cols + p.padC * 2, 2)) / 2)
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
    p.padR = Math.max(3, rows)
    p.padC = Math.max(8, Math.round(cols * 0.12))
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
  case "cascade":
    // Columns fall; each one drops a letter into place as its head goes by.
    p.duration = 4000
    p.fall = 105
    p.tail = 5
    p.fps = 12
    if (F) {
      // Every column of the screen falls, fast enough to reach the bottom.
      p.fall = Math.max(25, Math.min(105, 1900 / Math.max(1, F.rows)))
      p.colStart = []
      for (k = 0; k < F.cols; k++) p.colStart.push(random() * 2000)
      for (k = 0; k < n; k++) {
        var fcc = list[k]
        var col = Math.max(0, Math.min(F.cols - 1, Math.floor(fieldCol(F, fcc.c))))
        fcc.fcol = col
        fcc.at = p.colStart[col] + (fieldRow(F, fcc.r) + 1) * p.fall
      }
      break
    }
    p.padR = Math.max(3, Math.round(rows * 0.8))
    p.padC = Math.max(4, Math.round(cols * 0.06))
    p.clearsField = true
    p.colStart = []
    for (k = 0; k < cols + p.padC * 2; k++) p.colStart.push(random() * 2000)
    for (k = 0; k < n; k++) {
      var ccell = list[k]
      ccell.at = p.colStart[ccell.c] + (ccell.r + 1) * p.fall
    }
    break
  case "derez":
    // The art arrives as diagonal shards sliding in from alternating sides.
    p.duration = 3300
    p.slide = 760
    p.padC = Math.max(8, Math.round(cols * 0.14))
    for (k = 0; k < n; k++) {
      var rcell = list[k]
      rcell.band = Math.floor((rcell.c + rcell.r * 2) / 9)
      rcell.dir = rcell.band % 2 === 0 ? -1 : 1
      rcell.at = 350 + (rcell.band % 8) * 290 + random() * 150
    }
    break
  case "collapse":
    // Spun in from far out, tightening onto the letterform.
    p.duration = 3600
    p.travel = 2000
    p.padR = Math.max(3, rows)
    p.padC = Math.max(8, Math.round(cols * 0.12))
    p.centreRow = (rows - 1) / 2
    p.centreCol = (cols - 1) / 2
    for (k = 0; k < n; k++) {
      var ocell = list[k]
      var odr = (ocell.r - p.centreRow) * 2, odc = ocell.c - p.centreCol
      ocell.rad = Math.sqrt(odr * odr + odc * odc)
      ocell.ang = Math.atan2(odr, odc)
      ocell.start = random() * 1100
      ocell.at = ocell.start + p.travel
    }
    break
  case "storm":
    // Rain in the dark, the sky going off behind it, the word arriving with
    // the light.
    p.duration = 4200
    // On a field of its own the rain is drawn behind the art, so a settled
    // letter never needs clearing.
    if (!F) {
      p.padR = Math.max(3, rows)
      p.padC = Math.max(4, Math.round(cols * 0.06))
      p.clearsField = true
    }
    p.fps = 12
    p.flashes = [700, 1500, 2100, 3000, 3600]
    for (k = 0; k < n; k++) {
      var ncell = list[k]
      // each letter lands on one of the flashes
      ncell.at = p.flashes[Math.floor(random() * p.flashes.length)] + random() * 90
    }
    break
  default:
    // pulse and anything unknown: everything is there from the start.
    p.effect = "pulse"
    p.duration = 0
    for (k = 0; k < n; k++) list[k].at = 0
  }
  // An arrival lasts until its last letter lands: one still to come when it
  // ended would never be drawn.
  for (k = 0; k < n; k++) if (list[k].at + 150 > p.duration) p.duration = list[k].at + 150
  p.next = 0
  return p
}

// A departure. Every cell starts on screen and has a moment it is gone; until
// then it is drawn wherever the exit has carried it.
function planExit(style, lines, seed) {
  var rows = lines.length
  var cols = 0
  for (var i = 0; i < rows; i++) cols = Math.max(cols, lines[i].length)
  var list = cells(lines)
  var random = rng(seed)
  var p = { effect: style, exit: true, rows: rows, cols: cols, cells: list, duration: 2400, random: random,
            padR: Math.max(6, rows), padC: Math.max(8, Math.round(cols * 0.14)) }
  var n = list.length
  var k, cell
  switch (style) {
  case "shear":
    // Diagonal shards slide off the way derez brings them in.
    p.duration = 2300
    p.slide = 900
    for (k = 0; k < n; k++) {
      cell = list[k]
      cell.band = Math.floor((cell.c + cell.r * 2) / 9)
      cell.dir = cell.band % 2 === 0 ? -1 : 1
      cell.at = 200 + (cell.band % 8) * 190 + p.slide
      cell.start = cell.at - p.slide
    }
    break
  case "implode":
    // Wound into the middle and gone.
    p.duration = 2200
    p.travel = 1500
    p.centreRow = (rows - 1) / 2
    p.centreCol = (cols - 1) / 2
    for (k = 0; k < n; k++) {
      cell = list[k]
      var dr = (cell.r - p.centreRow) * 2, dc = cell.c - p.centreCol
      cell.rad = Math.sqrt(dr * dr + dc * dc)
      cell.ang = Math.atan2(dr, dc)
      cell.start = random() * 500
      cell.at = cell.start + p.travel
    }
    break
  case "dissolve":
    // Scrambles into cipher, then nothing.
    p.duration = 2400
    for (k = 0; k < n; k++) {
      cell = list[k]
      cell.start = random() * 900
      cell.at = cell.start + 500 + random() * 900
    }
    break
  case "sweepout":
    // A bar crosses and takes the art with it.
    p.duration = 2000
    for (k = 0; k < n; k++) {
      cell = list[k]
      cell.at = 200 + (cell.c / Math.max(1, cols)) * 1600
      cell.start = 0
    }
    break
  default:
    // fall: gravity, one column after another.
    p.effect = "fall"
    p.duration = 2600
    p.drop = 1100
    for (k = 0; k < n; k++) {
      cell = list[k]
      cell.start = (cell.c / Math.max(1, cols)) * 700 + random() * 260
      cell.at = cell.start + p.drop
    }
  }
  // End when the last cell has actually gone, not on a round number — a
  // departure that keeps running over an empty screen is dead air.
  var last = 0
  for (k = 0; k < n; k++) last = Math.max(last, list[k].at)
  p.duration = Math.round(last) + 120
  return p
}

// What plays over the settled art while it rests. Prepared once so a frame is
// a walk over the cells, never a re-parse of the art.
function planAmbient(style, lines, seed) {
  var rows = lines.length
  var cols = 0
  for (var i = 0; i < rows; i++) cols = Math.max(cols, lines[i].length)
  var list = cells(lines)
  return { effect: AMBIENTS.indexOf(style) === -1 ? "scan" : style, ambient: true, rows: rows, cols: cols, cells: list,
           random: rng(seed), padR: Math.max(2, Math.round(rows * 0.6)), padC: Math.max(4, Math.round(cols * 0.05)) }
}

// `t` here is time since the art settled, and it never ends.
function ambientFrame(p, t) {
  var g = blankFrame(p.rows, p.cols, p.padR, p.padC)
  var list = p.cells
  var k, cell
  if (p.effect === "scan") {
    // A bright band rolls down over the letters, lighting what it crosses.
    var period = 3800 + p.rows * 40
    var span = p.rows + p.padR * 2
    var head = ((t % period) / period) * (span + 4) - p.padR - 2
    // the line itself, all the way across
    for (var lr = Math.floor(head - 1); lr <= Math.ceil(head + 1); lr++) {
      var ld = Math.abs(lr - head)
      if (ld > 1.1) continue
      for (var lc = -p.padC; lc < p.cols + p.padC; lc++) {
        if (noise(lc, lr) > 0.5) continue
        put(g, lr, lc, ld < 0.5 ? "─" : "·", DIM)
      }
    }
    // and the letters it is crossing, lit
    for (k = 0; k < list.length; k++) {
      cell = list[k]
      var d = Math.abs(cell.r - head)
      if (d < 2.4) put(g, cell.r, cell.c, cell.ch, d < 0.7 ? HOT : (d < 1.5 ? MID : DIM))
    }
  } else if (p.effect === "shimmer") {
    // A slow swell of light travels across the dots on the diagonal, and a
    // few catch it early and burn bright for a moment. Nothing moves and
    // nothing is replaced: only how brightly each dot is lit.
    var swell = t / 2400
    for (k = 0; k < list.length; k++) {
      cell = list[k]
      var lift = Math.sin(cell.c * 0.055 + cell.r * 0.10 - swell)
      if (lift < 0.2) continue
      var spark = noise(cell.c, cell.r + Math.floor(t / 380))
      put(g, cell.r, cell.c, cell.ch, lift > 0.9 && spark > 0.82 ? HOT : (lift > 0.55 ? MID : DIM))
    }
  } else if (p.effect === "interference") {
    // A couple of rows tear sideways and snap back, over and over.
    var cycle = 2600
    var phase = (t % cycle) / cycle
    var band = Math.floor(((t / cycle) * 3.7) % Math.max(1, p.rows))
    var amp = phase < 0.22 ? Math.round(Math.sin(phase / 0.22 * Math.PI) * Math.max(3, p.cols * 0.16)) : 0
    if (amp !== 0) {
      for (k = 0; k < list.length; k++) {
        cell = list[k]
        if (cell.r < band || cell.r > band + 1) continue
        put(g, cell.r, cell.c + amp, cell.ch, DIM)
      }
    }
  } else {
    // flicker: a short scramble of a few cells every second or so.
    var beat = 1100
    var on = (t % beat) < 130
    if (on) {
      var step = Math.floor(t / beat)
      for (k = 0; k < list.length; k++) {
        cell = list[k]
        if (((k * 37 + step * 91) % 11) !== 0) continue
        put(g, cell.r, cell.c, CIPHER.charAt((k * 13 + step * 7) % CIPHER.length), DIM)
      }
    }
  }
  return layersOf(g)
}

// A frame is characters plus a brightness for each: 2 is the core of a beam,
// 1 the body, 0 the falloff. The renderer draws one text layer per level in
// its own colour, which is what makes a sweep read as light rather than as a
// row of characters. A layer with nothing in it is never laid out.
var DIM = 0, MID = 1, HOT = 2

// The frame is bigger than the word. Omarchy's own screensaver animates the
// whole terminal — beams cross empty space, rain falls past the letters — and
// an effect confined to the letterform's own cells can never do that. So the
// buffer carries a margin all round, coordinates stay in the art's own frame
// of reference, and anything may draw outside it: `put(g, -2, 40, "░")` is two
// rows above the word. The renderer shifts the overlay back by the margin.
function blankFrame(rows, cols, padR, padC) {
  var pr = padR || 0, pc = padC || 0
  var height = rows + pr * 2, width = cols + pc * 2
  var chars = [], heat = [], lo = [], hi = []
  for (var r = 0; r < height; r++) {
    chars.push(new Array(width).fill(" "))
    heat.push(new Array(width).fill(MID))
    // What each row actually touched, so reading the frame back never walks
    // the whole canvas — a beam is fourteen columns of ninety.
    lo.push(width)
    hi.push(-1)
  }
  return { chars: chars, heat: heat, lo: lo, hi: hi, used: [0, 0, 0], padR: pr, padC: pc }
}

function put(g, r, c, ch, level) {
  var rr = r + g.padR, cc = c + g.padC
  if (rr < 0 || cc < 0 || rr >= g.chars.length || cc >= g.chars[rr].length) return
  var lv = level === undefined ? MID : level
  g.chars[rr][cc] = ch
  g.heat[rr][cc] = lv
  g.used[lv]++
  if (cc < g.lo[rr]) g.lo[rr] = cc
  if (cc > g.hi[rr]) g.hi[rr] = cc
}

// A settled letter must not be papered over by whatever is falling past it.
function clear(g, r, c) {
  var rr = r + g.padR, cc = c + g.padC
  if (rr < 0 || cc < 0 || rr >= g.chars.length || cc >= g.chars[rr].length) return
  g.chars[rr][cc] = " "
}

// A deterministic value in [0,1) for a place and a moment — field glyphs need
// randomness that does not change every time a frame is asked for.
function noise(a, b) {
  var h = Math.imul(a * 73856093 ^ b * 19349663, 2654435761) >>> 0
  return (h % 100000) / 100000
}

// The weather on a field of its own: the whole screen, in field cells, drawn
// behind the art. Each is the same weather as below, bounded by the screen
// instead of a margin round the art.
function drawOwnField(p, t, g) {
  var F = p.field
  var c, r, k
  switch (p.effect) {
  case "cascade":
    for (c = 0; c < F.cols; c++) {
      var head = (t - p.colStart[c]) / p.fall - 1
      if (head < 0) continue
      for (k = 0; k < p.tail; k++) {
        r = Math.round(head - k)
        if (r < 0 || r >= F.rows) continue
        put(g, r, c, CIPHER.charAt(Math.floor(noise(c, r + Math.floor(t / 70)) * CIPHER.length)),
            k === 0 ? HOT : (k < 3 ? MID : DIM))
      }
    }
    break
  case "shockwave":
    var reach = (t - 200) / 2400 * p.reach
    if (reach <= 0) break
    for (r = 0; r < F.rows; r++) {
      for (c = 0; c < F.cols; c++) {
        var dr = (r - p.centreRow) * 2, dc = c - p.centreCol
        var off = Math.abs(Math.sqrt(dr * dr + dc * dc) - reach)
        if (off > 2.2) continue
        if (noise(c, r) > 0.62) continue
        put(g, r, c, off < 0.8 ? "▓" : "░", off < 0.8 ? MID : DIM)
      }
    }
    break
  case "beams":
    for (var key in p.fieldRowStart) {
      var rs = p.fieldRowStart[key]
      if (t < rs || t >= rs + p.sweep) continue
      var bhead = ((t - rs) / p.sweep) * (F.cols + 6)
      for (k = 0; k < 6; k++) put(g, Number(key), Math.round(bhead - k), k === 0 ? "█" : (k < 2 ? "▓" : (k < 4 ? "▒" : "░")), k === 0 ? HOT : (k < 3 ? MID : DIM))
    }
    break
  case "storm":
    var lit = false
    for (k = 0; k < p.flashes.length; k++) if (t >= p.flashes[k] && t < p.flashes[k] + 140) lit = true
    for (c = 0; c < F.cols; c += 2) {
      var sh = ((t / 2.2) + noise(c, 1) * 900) % (F.rows * 14)
      r = Math.round(sh / 14)
      put(g, r, c, "╲", DIM)
      put(g, r + 1, c + 1, "╲", DIM)
    }
    if (lit) {
      for (r = 0; r < F.rows; r += 2) {
        for (c = 0; c < F.cols; c += 3) {
          if (noise(c, r + Math.floor(t / 40)) > 0.5) continue
          put(g, r, c, "░", DIM)
        }
      }
    }
    break
  }
}

// What an effect draws in the empty space. Called before the letters, so the
// word always reads on top of its own weather.
function drawField(p, t, g) {
  // Once the arrival is over the letters are on the canvas and the screen
  // belongs to them: no weather may outlive its own effect.
  if (t >= p.duration) return
  if (p.field) { drawOwnField(p, t, g); return }
  var c, r, k
  switch (p.effect) {
  case "cascade":
    // Rain over the whole canvas, not only over the word.
    for (c = -p.padC; c < p.cols + p.padC; c++) {
      var head = (t - p.colStart[c + p.padC]) / p.fall - p.padR - 1
      if (head < -p.padR) continue
      for (k = 0; k < p.tail; k++) {
        r = Math.round(head - k)
        if (r < -p.padR || r >= p.rows + p.padR) continue
        put(g, r, c, CIPHER.charAt(Math.floor(noise(c, r + Math.floor(t / 70)) * CIPHER.length)),
            k === 0 ? HOT : (k < 3 ? MID : DIM))
      }
    }
    break
  case "shockwave":
    // The ring is visible crossing the emptiness, which is the whole point of
    // a shockwave.
    var reach = (t - 200) / 2400 * p.reach
    if (reach <= 0) break
    for (r = -p.padR; r < p.rows + p.padR; r++) {
      for (c = -p.padC; c < p.cols + p.padC; c++) {
        var dr = (r - p.centreRow) * 2, dc = c - p.centreCol
        var dist = Math.sqrt(dr * dr + dc * dc)
        var off = Math.abs(dist - reach)
        if (off > 2.2) continue
        if (noise(c, r) > 0.62) continue
        put(g, r, c, off < 0.8 ? "▓" : "░", off < 0.8 ? MID : DIM)
      }
    }
    break
  case "beams":
    // Each beam crosses the full width, not just the letters in its row.
    for (r = 0; r < p.rows; r++) {
      var rs = p.rowStart[r]
      if (t < rs || t >= rs + p.sweep) continue
      var bhead = -p.padC + ((t - rs) / p.sweep) * (p.cols + p.padC * 2)
      for (k = 0; k < 6; k++) {
        c = Math.round(bhead - k)
        put(g, r, c, k === 0 ? "█" : (k < 2 ? "▓" : (k < 4 ? "▒" : "░")), k === 0 ? HOT : (k < 3 ? MID : DIM))
      }
    }
    break
  case "storm":
    // Rain in the dark with the sky going off behind it.
    var flash = p.flashes
    var lit = false
    for (k = 0; k < flash.length; k++) if (t >= flash[k] && t < flash[k] + 140) lit = true
    for (c = -p.padC; c < p.cols + p.padC; c += 2) {
      var sh = ((t / 2.2) + noise(c, 1) * 900) % ((p.rows + p.padR * 2) * 14)
      r = Math.round(-p.padR + sh / 14)
      if (r >= -p.padR && r < p.rows + p.padR) put(g, r, c, "╲", DIM)
      if (r + 1 >= -p.padR && r + 1 < p.rows + p.padR) put(g, r + 1, c + 1, "╲", DIM)
    }
    if (lit) {
      for (r = -p.padR; r < p.rows + p.padR; r += 2) {
        for (c = -p.padC; c < p.cols + p.padC; c += 3) {
          if (noise(c, r + Math.floor(t / 40)) > 0.5) continue
          put(g, r, c, "░", DIM)
        }
      }
    }
    break
  }
}

// All three brightnesses in one walk over only the cells that were touched.
// Trailing blanks are trimmed so each text layout stays as small as the
// effect actually is, and an empty level costs nothing at all.
function layersOf(g) {
  // Each level is emitted at its own left edge rather than padded out from
  // column zero, and the renderer shifts it back. A beam is fourteen columns
  // of text instead of ninety, which is what the frame actually costs — the
  // layout, not the arithmetic.
  var loAt = [Infinity, Infinity, Infinity]
  var hiAt = [-1, -1, -1]
  var lastRow = [-1, -1, -1]
  var r, c, lv
  for (r = 0; r < g.chars.length; r++) {
    var from = g.lo[r], to = g.hi[r]
    if (to < from) continue
    var row = g.chars[r], heat = g.heat[r]
    for (c = from; c <= to; c++) {
      if (row[c] === " ") continue
      lv = heat[c]
      if (c < loAt[lv]) loAt[lv] = c
      if (c > hiAt[lv]) hiAt[lv] = c
      lastRow[lv] = r
    }
  }
  var out = { dim: "", overlay: "", hot: "", offset: [0, 0, 0] }
  var names = ["dim", "overlay", "hot"]
  for (lv = 0; lv < 3; lv++) {
    if (hiAt[lv] < 0) continue
    var left = loAt[lv]
    out.offset[lv] = left - g.padC
    var lines = []
    for (r = 0; r <= lastRow[lv]; r++) {
      var f = g.lo[r], t2 = g.hi[r]
      if (t2 < f) { lines.push(""); continue }
      var chars = g.chars[r], hot = g.heat[r], line = ""
      for (c = left; c <= hiAt[lv]; c++) {
        var ch = (c >= f && c <= t2 && chars[c] !== " " && hot[c] === lv) ? chars[c] : " "
        line += ch
      }
      lines.push(line.replace(/\s+$/, ""))
    }
    while (lines.length && lines[lines.length - 1] === "") lines.pop()
    out[names[lv]] = lines.join("\n")
  }
  return out
}

function frame(p, t) {
  if (p && p.exit) return exitFrame(p, t)
  var resolved = []
  var g = blankFrame(p.rows, p.cols, p.padR, p.padC)
  var list = p.cells
  var random = p.random
  var cursor = p.effect === "typewriter" ? firstPending(p, t) : -1
  // Weather with a field of its own goes in its own frame, drawn behind the
  // art; otherwise under the letters in this one.
  var fg = p.field ? blankFrame(p.field.rows, p.field.cols, 0, 0) : null
  drawField(p, t, fg || g)
  for (var k = 0; k < list.length; k++) {
    var cell = list[k]
    if (cell.at <= t) {
      if (!cell.done) { cell.done = true; resolved.push(cell) }
      // The letter is on the canvas now; keep the weather off it.
      if (p.clearsField) clear(g, cell.r, cell.c)
      continue
    }
    switch (p.effect) {
    case "decrypt":
      put(g, cell.r, cell.c, CIPHER.charAt(Math.floor(random() * CIPHER.length)), cell.at - t < 280 ? HOT : DIM)
      break
    case "rain":
      if (t >= cell.start) {
        var f = (t - cell.start) / p.travel
        put(g, Math.round(-1 + (cell.r + 1) * f), cell.c, cell.ch, f > 0.82 ? HOT : MID)
      }
      break
    case "beams":
      var rs = p.field ? p.fieldRowStart[p.fieldRowOf[cell.r]] : p.rowStart[cell.r]
      if (t >= rs && t < rs + p.sweep) {
        // In art cells behind the head, wherever the head is measured.
        var d = p.field
          ? (fieldCol(p.field, cell.c) - (t - rs) / p.sweep * p.field.cols) / p.field.sc
          : cell.c - (t - rs) / p.sweep * p.cols
        if (d >= 0 && d < 5) put(g, cell.r, cell.c, d < 1 ? "█" : (d < 2 ? "▓" : (d < 3.5 ? "▒" : "░")), d < 1 ? HOT : (d < 2.5 ? MID : DIM))
      }
      break
    case "scatter":
      if (t >= cell.start) {
        var sg = (t - cell.start) / p.travel
        sg = sg * sg * (3 - 2 * sg)
        put(g, Math.round(cell.r0 + (cell.r - cell.r0) * sg), Math.round(cell.c0 + (cell.c - cell.c0) * sg), cell.ch,
            sg < 0.5 ? DIM : (sg < 0.86 ? MID : HOT))
      }
      break
    case "wipe":
      if (cell.at - t < 260) put(g, cell.r, cell.c, cell.at - t < 130 ? "▒" : "░", cell.at - t < 130 ? MID : DIM)
      break
    case "typewriter":
      if (k === cursor) put(g, cell.r, cell.c, "█", HOT)
      break
    case "reveal":
      // A soft edge just ahead of the line, so even the quietest one moves.
      if (cell.at - t < 150) put(g, cell.r, cell.c, "░", DIM)
      break
    case "scanline":
    case "slit":
      var ahead = cell.at - t
      if (ahead < 520) put(g, cell.r, cell.c, ahead < 120 ? "█" : (ahead < 300 ? "▓" : "░"), ahead < 120 ? HOT : (ahead < 300 ? MID : DIM))
      break
    case "shockwave":
      var ring = cell.at - t
      if (ring < 420) put(g, cell.r, cell.c, ring < 110 ? "█" : (ring < 260 ? "▓" : "▒"), ring < 110 ? HOT : (ring < 260 ? MID : DIM))
      break
    case "grid":
      var gl = cell.at - t
      if (gl < 240) put(g, cell.r, cell.c, gl < 90 ? "█" : "▒", gl < 90 ? HOT : MID)
      break
    case "glitch":
      var lead = p.settle[cell.band] - t
      var amp = Math.max(0, Math.min(1, lead / p.tear))
      var step = Math.floor(t / 80)
      var jitter = ((cell.band * 31 + step * 17) % 9) / 8 - 0.5
      put(g, cell.r, cell.c + Math.round(p.shift[cell.band] * amp * (0.7 + jitter * 0.6)), cell.ch, amp > 0.55 ? DIM : MID)
      break
    case "dust":
      if (t >= cell.start) {
        var e = (t - cell.start) / p.travel
        e = 1 - Math.pow(1 - e, 3)
        put(g, Math.round(cell.r0 + (cell.r - cell.r0) * e), Math.round(cell.c0 + (cell.c - cell.c0) * e),
            e < 0.72 ? "·" : cell.ch, e < 0.72 ? DIM : (e < 0.93 ? MID : HOT))
      }
      break
    case "cascade":
      var chead = (t - p.colStart[p.field ? cell.fcol : cell.c]) / p.fall - 1
      var dr = p.field ? (fieldRow(p.field, cell.r) - chead) / p.field.sr : cell.r - chead
      if (dr >= 0 && dr < 5) {
        put(g, cell.r, cell.c, CIPHER.charAt(Math.floor(random() * CIPHER.length)), dr < 1 ? HOT : (dr < 2.5 ? MID : DIM))
      }
      break
    case "derez":
      var dg = Math.max(0, Math.min(1, (cell.at - t) / p.slide))
      put(g, cell.r, cell.c + Math.round(cell.dir * dg * p.cols * 0.55), cell.ch, dg > 0.55 ? DIM : (dg > 0.2 ? MID : HOT))
      break
    case "storm":
      if (noise(cell.c, cell.r + Math.floor(t / 120)) < 0.12) put(g, cell.r, cell.c, cell.ch, DIM)
      break
    case "collapse":
      if (t >= cell.start) {
        var ce = Math.max(0, Math.min(1, (t - cell.start) / p.travel))
        ce = 1 - Math.pow(1 - ce, 2.2)
        var cang = cell.ang + (1 - ce) * 2.6
        var crad = cell.rad * (1 + (1 - ce) * 2.4)
        put(g, Math.round(p.centreRow + Math.sin(cang) * crad / 2), Math.round(p.centreCol + Math.cos(cang) * crad), cell.ch,
            ce < 0.55 ? DIM : (ce < 0.86 ? MID : HOT))
      }
      break
    }
  }
  var out = layersOf(g)
  var res = { resolved: resolved, overlay: out.overlay, hot: out.hot, dim: out.dim, offset: out.offset, done: t >= p.duration }
  if (fg) {
    var fo = layersOf(fg)
    res.field = { overlay: fo.overlay, hot: fo.hot, dim: fo.dim, offset: fo.offset }
  }
  return res
}

// A departure draws every cell that has not gone yet, so the canvas is
// cleared first and the whole piece lives in the overlay for these two seconds.
function exitFrame(p, t) {
  // Room all round so a fall has somewhere to fall to and a shear has
  // somewhere to go; trailing blank rows are trimmed off again.
  var g = blankFrame(p.rows, p.cols, p.padR, p.padC)
  var list = p.cells
  var random = p.random
  for (var k = 0; k < list.length; k++) {
    var cell = list[k]
    if (t >= cell.at) continue
    switch (p.effect) {
    case "shear":
      var sg = Math.max(0, Math.min(1, (t - cell.start) / p.slide))
      put(g, cell.r, cell.c + Math.round(cell.dir * sg * p.cols * 0.7), cell.ch, sg < 0.3 ? MID : DIM)
      break
    case "implode":
      var ie = Math.max(0, Math.min(1, (t - cell.start) / p.travel))
      var iang = cell.ang - ie * 2.6
      var irad = cell.rad * (1 - ie)
      put(g, Math.round(p.centreRow + Math.sin(iang) * irad / 2), Math.round(p.centreCol + Math.cos(iang) * irad), cell.ch,
          ie < 0.45 ? MID : HOT)
      break
    case "dissolve":
      if (t < cell.start) put(g, cell.r, cell.c, cell.ch, MID)
      else put(g, cell.r, cell.c, CIPHER.charAt(Math.floor(random() * CIPHER.length)), DIM)
      break
    case "sweepout":
      var left = cell.at - t
      if (left < 260) put(g, cell.r, cell.c, left < 110 ? "█" : "▓", left < 110 ? HOT : MID)
      else put(g, cell.r, cell.c, cell.ch, MID)
      break
    default:
      // fall
      var fe = Math.max(0, (t - cell.start) / p.drop)
      put(g, cell.r + Math.round(fe * fe * (p.rows + 5)), cell.c, cell.ch, fe < 0.35 ? MID : DIM)
    }
  }
  var ex = layersOf(g)
  return { resolved: [], overlay: ex.overlay, hot: ex.hot, dim: ex.dim, offset: ex.offset, done: t >= p.duration }
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
  module.exports = { EFFECTS: EFFECTS, FIELD_EFFECTS: FIELD_EFFECTS, onlyCheap: onlyCheap, onlyPulse: onlyPulse, STEADY_AMBIENTS: STEADY_AMBIENTS, EXITS: EXITS, AMBIENTS: AMBIENTS, MOODS: MOODS, planExit: planExit, planAmbient: planAmbient, ambientFrame: ambientFrame, CIPHER: CIPHER, cells: cells, rng: rng, plan: plan, frame: frame, pick: pick }
}
