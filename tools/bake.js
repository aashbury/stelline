#!/usr/bin/env node
// Bakes the vector figures in art/ into dots, and writes savers/RobotArt.js.
//
//   node tools/bake.js
//
// Each drawing is rendered eight times over with rsvg-convert, and every dot
// of the grid takes whichever tone covers most of its 8 × 8 block. Taking
// the majority rather than the average is the point: an edge stays one tone
// or the other instead of smearing into a grey that the dither turns to
// noise. Needs rsvg-convert and ImageMagick; the shell never runs this.
"use strict"
const fs = require("fs")
const path = require("path")
const { execFileSync } = require("child_process")

const ROOT = path.join(__dirname, "..")
const OVER = 8
const CLEAR = 63
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

function raster(svg, w, h) {
  const png = execFileSync("rsvg-convert", ["-w", String(w * OVER), "-h", String(h * OVER)], { input: svg, maxBuffer: 1 << 28 })
  return execFileSync("magick", ["png:-", "-depth", "8", "rgba:-"], { input: png, maxBuffer: 1 << 28 })
}

// One value per dot, by majority over its block. `classify` turns a pixel
// into a small number.
function sample(rgba, w, h, classify) {
  const W = w * OVER
  const out = new Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const votes = {}
    let best = 0, bestN = -1
    for (let yy = 0; yy < OVER; yy++) for (let xx = 0; xx < OVER; xx++) {
      const i = ((y * OVER + yy) * W + x * OVER + xx) * 4
      const v = classify(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])
      const n = (votes[v] = (votes[v] || 0) + 1)
      if (n > bestN) { bestN = n; best = v }
    }
    out[y * w + x] = best
  }
  return out
}
// Four greys, or the accent (pure red in the drawing), or nothing.
const ACCENT = 4
const tone = (r, g, b, a) => (a < 128 ? CLEAR : r > 200 && g < 60 ? ACCENT : Math.min(3, Math.round(r / 85)))

function rle(values) {
  let s = ""
  for (let i = 0; i < values.length;) {
    let n = 1
    while (i + n < values.length && values[i + n] === values[i] && n < 64) n++
    s += ALPHABET[values[i]] + ALPHABET[n - 1]
    i += n
  }
  return s
}

// Where the drawing marks a point or a box — a visor, an eye — in dots, so
// the figure can light it.
function toDots(v, art, w, h) {
  if (Array.isArray(v) && Array.isArray(v[0])) return v.map(p => toDots(p, art, w, h))
  if (Array.isArray(v)) return [Math.round(v[0] / art.W * w), Math.round(v[1] / art.H * h)]
  if (v && typeof v === "object") {
    const o = {}
    for (const k of Object.keys(v)) o[k] = /^x/.test(k) ? Math.round(v[k] / art.W * w) : /^y/.test(k) ? Math.round(v[k] / art.H * h) : toDots(v[k], art, w, h)
    return o
  }
  return v
}

function bake(name) {
  const art = require(path.join(ROOT, "art", name + ".js"))
  const w = 120, h = 160
  const board = sample(raster(art.board(), w, h), w, h, tone)
  const keymap = sample(raster(art.keymap(), w, h), w, h, r => Math.round(r / 3))
  const poses = {}
  const all = art.poses()
  process.stdout.write(name + ": ")
  for (const pname of Object.keys(all)) {
    const pose = all[pname]
    const dots = sample(raster(pose.svg, w, h), w, h, tone)
    // the keys under the fingers that are pressing, by where each tip lands
    const pressed = []
    for (const t of pose.tips || []) {
      if (!t.pressing) continue
      // the key most of the ground round the tip belongs to, since a tip can
      // come down on the gap between two
      const x = Math.floor(t.at[0] / art.W * w), y = Math.floor(t.at[1] / art.H * h)
      const count = {}
      let k = 0
      for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) {
        const v = xx >= 0 && xx < w && yy >= 0 && yy < h ? keymap[yy * w + xx] : 0
        if (v > 0 && (count[v] = (count[v] || 0) + 1) > (count[k] || 0)) k = v
      }
      if (k > 0 && pressed.indexOf(k) === -1) pressed.push(k)
    }
    poses[pname] = { dots: rle(dots), keys: pressed }
    if (pose.marks) poses[pname].marks = toDots(pose.marks, art, w, h)
    process.stdout.write(pname + " ")
  }
  process.stdout.write("\n")
  return { cols: w / 2, rows: h / 4, board: rle(board), keymap: rle(keymap), poses }
}

// The wordmark is not a figure: it is one picture, dithered here and packed
// straight to braille, and written where the saver reads its own art from.
function bakeWordmark() {
  const art = require(path.join(ROOT, "art", "wordmark.js"))
  const w = art.DOTS_W, h = art.DOTS_H
  const tones = sample(raster(art.svg(), w, h), w, h, tone)
  const LEVEL = [0, 0.25, 0.56, 1]
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
  const on = (x, y) => { const v = tones[y * w + x]; return v !== CLEAR && v > 0 && BAYER[y & 3][x & 3] / 16 < LEVEL[Math.min(3, v)] }
  const BITS = [[1, 2, 4, 64], [8, 16, 32, 128]]
  const lines = []
  for (let r = 0; r < h / 4; r++) {
    let line = ""
    for (let c = 0; c < w / 2; c++) {
      let code = 0
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 4; dy++) if (on(c * 2 + dx, r * 4 + dy)) code += BITS[dx][dy]
      line += code ? String.fromCharCode(0x2800 + code) : " "
    }
    lines.push(line.replace(/\s+$/, ""))
  }
  // cropped tight on every side, so the saver centres the picture itself
  // and not the blank canvas round it
  while (lines.length && lines[0] === "") lines.shift()
  while (lines.length && lines[lines.length - 1] === "") lines.pop()
  const lead = Math.min(...lines.filter(l => l !== "").map(l => l.length - l.replace(/^ +/, "").length))
  const tight = lines.map(l => l.slice(lead))
  const file = path.join(ROOT, "savers", "stelline.txt")
  fs.writeFileSync(file, tight.join("\n") + "\n")
  console.log("wrote " + path.relative(ROOT, file) + " (" + w / 2 + " × " + h / 4 + " cells)")
}
bakeWordmark()

const out = { hands: bake("hands"), robot: bake("robot"), morty: bake("morty") }
const file = path.join(ROOT, "savers", "RobotArt.js")
fs.writeFileSync(file,
  "// Generated by tools/bake.js from art/ — do not edit by hand.\n" +
  "// Each layer is run-length coded over the dot grid, row by row: a value\n" +
  "// and a run length, one character each, from ALPHABET.\n" +
  "var ALPHABET = " + JSON.stringify(ALPHABET) + "\n" +
  "var CLEAR = " + CLEAR + "\n" +
  "var ART = " + JSON.stringify(out) + "\n" +
  'if (typeof module !== "undefined") module.exports = { ALPHABET: ALPHABET, CLEAR: CLEAR, ART: ART }\n')
console.log("wrote " + path.relative(ROOT, file) + " (" + fs.statSync(file).size + " bytes)")
