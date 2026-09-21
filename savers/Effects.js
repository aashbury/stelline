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
               "spotlight", "cascade", "derez", "collapse"]

// How a piece leaves. An arrival on its own is a poster; a screensaver wants
// the art to go again, so every cycle is arrive, live, depart. Departures are
// drawn entirely in the overlay — the cached canvas can only be added to —
// which is the same work a dense arrival frame already does.
var EXITS = ["fall", "shear", "implode", "dissolve", "sweepout"]

// What happens while the art is resting: cheap, a few rows at a time, so the
// screen is never a still picture.
var AMBIENTS = ["scan", "interference", "flicker"]

// Nobody wants to audit fourteen names to set a mood. Each of these is a set
// the panel can offer as one chip; picking one writes the same `effects`
// array the individual chips do, so there is no second setting to keep in
// step and an old config still means what it meant.
var MOODS = {
  calm:    ["reveal", "wipe", "typewriter", "slit", "pulse"],
  neon:    ["decrypt", "rain", "scanline", "glitch", "grid", "cascade"],
  kinetic: ["beams", "scatter", "shockwave", "dust", "spotlight", "derez", "collapse"]
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
  case "spotlight":
    // A beam crosses the art and leaves the letters lit behind it.
    p.duration = 3400
    p.beam = 620
    for (k = 0; k < n; k++) {
      var pcell = list[k]
      pcell.at = 400 + (pcell.c / Math.max(1, cols)) * 2500 + (pcell.r / Math.max(1, rows)) * 220
    }
    break
  case "cascade":
    // Columns fall; each one drops a letter into place as its head goes by.
    p.duration = 4000
    p.fall = 105
    p.colStart = []
    for (k = 0; k < cols; k++) p.colStart.push(random() * 2000)
    for (k = 0; k < n; k++) {
      var ccell = list[k]
      ccell.at = p.colStart[ccell.c] + (ccell.r + 1) * p.fall
    }
    break
  case "derez":
    // The art arrives as diagonal shards sliding in from alternating sides.
    p.duration = 3300
    p.slide = 760
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
  default:
    // pulse and anything unknown: everything is there from the start.
    p.effect = "pulse"
    p.duration = 0
    for (k = 0; k < n; k++) list[k].at = 0
  }
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
  var p = { effect: style, exit: true, rows: rows, cols: cols, cells: list, duration: 2400, random: random }
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
  return { effect: AMBIENTS.indexOf(style) === -1 ? "scan" : style, ambient: true, rows: rows, cols: cols, cells: list, random: rng(seed) }
}

// `t` here is time since the art settled, and it never ends.
function ambientFrame(p, t) {
  var g = blankFrame(p.rows, p.cols)
  var list = p.cells
  var k, cell
  if (p.effect === "scan") {
    // A bright band rolls down over the letters, lighting what it crosses.
    var period = 3800 + p.rows * 40
    var head = ((t % period) / period) * (p.rows + 6) - 3
    for (k = 0; k < list.length; k++) {
      cell = list[k]
      var d = Math.abs(cell.r - head)
      if (d < 2.4) put(g, cell.r, cell.c, cell.ch, d < 0.7 ? HOT : (d < 1.5 ? MID : DIM))
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
  return { overlay: layerOf(g, MID), hot: layerOf(g, HOT), dim: layerOf(g, DIM) }
}

// A frame is characters plus a brightness for each: 2 is the core of a beam,
// 1 the body, 0 the falloff. The renderer draws one text layer per level in
// its own colour, which is what makes a sweep read as light rather than as a
// row of characters. A layer with nothing in it is never laid out.
var DIM = 0, MID = 1, HOT = 2

function blankFrame(rows, cols) {
  var chars = [], heat = []
  for (var r = 0; r < rows; r++) {
    chars.push(new Array(cols).fill(" "))
    heat.push(new Array(cols).fill(MID))
  }
  return { chars: chars, heat: heat, used: [0, 0, 0] }
}

function put(g, r, c, ch, level) {
  if (r < 0 || c < 0 || r >= g.chars.length || c >= g.chars[r].length) return
  var lv = level === undefined ? MID : level
  g.chars[r][c] = ch
  g.heat[r][c] = lv
  g.used[lv]++
}

// One string per brightness, trailing blanks trimmed so the text layout stays
// as small as the effect actually is.
function layerOf(g, want) {
  if (g.used[want] === 0) return ""
  var out = []
  for (var r = 0; r < g.chars.length; r++) {
    var row = g.chars[r], heat = g.heat[r], line = ""
    for (var c = 0; c < row.length; c++) line += (row[c] !== " " && heat[c] === want) ? row[c] : " "
    out.push(line.replace(/\s+$/, ""))
  }
  while (out.length && out[out.length - 1] === "") out.pop()
  return out.join("\n")
}

// frame(plan, t) → { resolved: [cell, ...] newly in place since the last
// call, overlay: string (the in-flight glyphs on a grid of spaces), done }
function frame(p, t) {
  if (p && p.exit) return exitFrame(p, t)
  var resolved = []
  var g = blankFrame(p.rows, p.cols)
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
      put(g, cell.r, cell.c, CIPHER.charAt(Math.floor(random() * CIPHER.length)), cell.at - t < 280 ? HOT : DIM)
      break
    case "rain":
      if (t >= cell.start) {
        var f = (t - cell.start) / p.travel
        put(g, Math.round(-1 + (cell.r + 1) * f), cell.c, cell.ch, f > 0.82 ? HOT : MID)
      }
      break
    case "beams":
      var rs = p.rowStart[cell.r]
      if (t >= rs && t < rs + p.sweep) {
        var head = (t - rs) / p.sweep * p.cols
        var d = cell.c - head
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
    case "spotlight":
      // The beam is wide and soft, and the letter is lit inside it before it
      // stays lit — so the light looks like it is doing the revealing.
      var sd = Math.abs(cell.at - t)
      if (sd < p.beam) put(g, cell.r, cell.c, cell.ch, sd < p.beam * 0.24 ? HOT : (sd < p.beam * 0.55 ? MID : DIM))
      break
    case "cascade":
      var chead = (t - p.colStart[cell.c]) / p.fall - 1
      var dr = cell.r - chead
      if (dr >= 0 && dr < 5) {
        put(g, cell.r, cell.c, CIPHER.charAt(Math.floor(random() * CIPHER.length)), dr < 1 ? HOT : (dr < 2.5 ? MID : DIM))
      }
      break
    case "derez":
      var dg = Math.max(0, Math.min(1, (cell.at - t) / p.slide))
      put(g, cell.r, cell.c + Math.round(cell.dir * dg * p.cols * 0.55), cell.ch, dg > 0.55 ? DIM : (dg > 0.2 ? MID : HOT))
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
  return { resolved: resolved, overlay: layerOf(g, MID), hot: layerOf(g, HOT), dim: layerOf(g, DIM), done: t >= p.duration }
}

// A departure draws every cell that has not gone yet, so the canvas is
// cleared first and the whole piece lives in the overlay for these two seconds.
function exitFrame(p, t) {
  // Room below the art so a fall has somewhere to fall to; trailing blank
  // rows are trimmed off again, so the padding costs nothing when unused.
  var g = blankFrame(p.rows + 10, p.cols)
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
  return { resolved: [], overlay: layerOf(g, MID), hot: layerOf(g, HOT), dim: layerOf(g, DIM), done: t >= p.duration }
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
  module.exports = { EFFECTS: EFFECTS, EXITS: EXITS, AMBIENTS: AMBIENTS, MOODS: MOODS, planExit: planExit, planAmbient: planAmbient, ambientFrame: ambientFrame, CIPHER: CIPHER, cells: cells, rng: rng, plan: plan, frame: frame, pick: pick }
}
