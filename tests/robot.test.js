const test = require("node:test")
const assert = require("node:assert/strict")
const R = require("../savers/Robot.js")

const lit = s => s.replace(/[\s\n]/g, "").length
const chars = s => [...s.replace(/[\s\n]/g, "")]
const isBraille = c => c.codePointAt(0) >= 0x2800 && c.codePointAt(0) <= 0x28ff

test("the canvas is a grid of dots, two across and four down per cell", () => {
  assert.equal(R.DOT_W, R.COLS * 2)
  assert.equal(R.DOT_H, R.ROWS * 4)
})

test("every figure draws every state, on the grid and made of dots", () => {
  for (const figure of R.FIGURES) {
    for (const state of R.STATES) {
      const f = R.frame(figure.id, state, 0)
      const where = figure.id + "/" + state
      const body = f.body.split("\n")
      const glow = f.glow.split("\n")
      // both layers are the same shape, so they line up when drawn together
      const grid = R.size(figure.id)
      assert.equal(body.length, grid.rows, where + " body rows")
      assert.equal(glow.length, grid.rows, where + " glow rows")
      for (const line of body.concat(glow)) assert.ok([...line].length <= grid.cols, where + " too wide")
      // everything is braille, because everything is dots now
      for (const c of chars(f.body).concat(chars(f.glow)))
        assert.ok(isBraille(c), where + " drew " + JSON.stringify(c) + ", which is not a dot cell")
      // there is a figure there
      assert.ok(lit(f.body) > 60, where + " is too empty to be a figure")
      // no single dot is lit in both layers, or the body would show through
      // the light sitting on it. A cell may hold some of each.
      const dots = c => (c && c !== " " ? c.codePointAt(0) - 0x2800 : 0)
      for (let r = 0; r < grid.rows; r++) {
        const b = [...(body[r] || "")], g = [...(glow[r] || "")]
        for (let c = 0; c < grid.cols; c++)
          assert.equal(dots(b[c]) & dots(g[c]), 0, where + " lights a dot at " + r + "," + c + " twice")
      }
    }
  }
})

test("every state is a loop, and something moves in it", () => {
  for (const figure of R.FIGURES) {
    for (const state of R.STATES) {
      const all = R.frames(figure.id, state)
      const where = figure.id + "/" + state
      assert.ok(all.length >= 3, where + " needs enough frames to read as motion")
      const a = R.frame(figure.id, state, 0)
      const b = R.frame(figure.id, state, 1)
      assert.notEqual(a.body + a.glow, b.body + b.glow, where + " never changes")
      // it comes back round to where it started
      assert.equal(R.frame(figure.id, state, all.length).body, a.body, where + " does not loop")
    }
  }
})

test("the states are told apart by what they do, not by a caption", () => {
  for (const figure of R.FIGURES) {
    const id = figure.id
    // needs and error say so in the accent: a beacon, or sparks and crosses
    const needs = Math.max(...[0, 1, 2, 3].map(n => lit(R.frame(id, "needs", n).glow)))
    assert.ok(needs > 6, id + " needs no beacon")
    const error = Math.max(...[0, 1, 2].map(n => lit(R.frame(id, "error", n).glow)))
    assert.ok(error > 6, id + " error has no sparks")
    // waiting has rain falling past it, which moves down the frame
    const w0 = R.frame(id, "waiting", 0).glow, w1 = R.frame(id, "waiting", 1).glow
    assert.ok(lit(w0) > 0 && w0 !== w1, id + " waiting has no rain")
    // standby is the quiet one: whatever it shows, it shows less of it
    const idle = Math.max(...[0, 1, 2, 3].map(n => lit(R.frame(id, "idle", n).glow)))
    assert.ok(idle < needs && idle < error, id + " standby is as busy as it is when it wants you")
    // and no two states draw the same picture
    const seen = {}
    for (const state of R.STATES) {
      const key = R.frame(id, state, 0).body
      assert.ok(!seen[key], id + " draws " + state + " the same as " + seen[key])
      seen[key] = state
    }
  }
})

test("an unknown figure falls back to the one everybody gets", () => {
  assert.equal(R.figureId(""), R.DEFAULT_FIGURE)
  assert.equal(R.figureId("a-shape-from-next-year"), R.DEFAULT_FIGURE)
  assert.equal(R.figureId("morty"), "morty")
  assert.equal(R.figureName("morty"), "Morty")
  // a state it does not know still draws something
  assert.ok(lit(R.frame("deck", "no-such-state", 0).body) > 0)
})

test("Morty is a Boston terrier: ears up, and a face with markings in it", () => {
  const up = R.frame("morty", "working", 0).body.split("\n")
  const down = R.frame("morty", "idle", 0).body.split("\n")
  // ears up reach higher up the frame than ears folded down
  const highest = rows => rows.findIndex(r => lit(r) > 0)
  assert.ok(highest(up) >= 0 && highest(down) >= 0, "the dog should be drawn")
  assert.ok(highest(up) < highest(down), "ears up should reach higher than ears folded")
  // the markings are holes in a solid head, so the face is not a filled block
  const faceRows = up.slice(2, 6)
  assert.ok(faceRows.some(r => [...r].some(c => isBraille(c) && c !== "⣿")), "the face has no markings in it")
})

test("the pace matches what it is doing", () => {
  assert.ok(R.cadence("working") < R.cadence("idle"))
  assert.equal(R.cadence("nonsense"), 900)
  for (const s of R.STATES) assert.ok(R.cadence(s) > 0)
})
