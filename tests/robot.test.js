const test = require("node:test")
const assert = require("node:assert/strict")
const R = require("../savers/Robot.js")

test("every figure's every frame is two layers of exactly the same size, so it never jumps", () => {
  for (const shape of R.FIGURES) {
    for (const state of R.STATES) {
      const frames = R.frames(shape.id, state)
      const where = shape.id + "/" + state
      assert.ok(frames.length >= 3, where + " has frames")
      for (const f of frames) {
        for (const layer of [f.body, f.glow]) {
          const lines = layer.split("\n")
          assert.equal(lines.length, R.ROWS, where + " rows")
          for (const line of lines) assert.equal([...line].length, R.COLS, where + " cols: " + JSON.stringify(line))
        }
        // nothing is in both layers, and only light is in the glow
        const b = [...f.body], g = [...f.glow]
        for (let i = 0; i < b.length; i++) {
          assert.ok(!(b[i] !== " " && b[i] !== "\n" && g[i] !== " " && g[i] !== "\n"), where + ": a cell in both layers")
          if (g[i] !== " " && g[i] !== "\n") assert.ok(R.LIGHT.indexOf(g[i]) !== -1, where + ": body char in the glow")
        }
      }
      // every state moves — in the body, the light, or both — and every
      // frame draws something
      const at = n => R.frame(shape.id, state, n).body + R.frame(shape.id, state, n).glow
      assert.notEqual(at(0), at(1), where + " moves")
      for (let i = 0; i < frames.length; i++)
        assert.ok(frames[i].body.trim() !== "", where + " frame " + i + " is blank")
      assert.ok(R.cadence(state) >= 200)
    }
  }
})

test("an unknown figure, or none, is the usual one", () => {
  assert.equal(R.figureId(""), R.DEFAULT_FIGURE)
  assert.equal(R.figureId("nothing-like-it"), R.DEFAULT_FIGURE)
  assert.equal(R.figureId(undefined), R.DEFAULT_FIGURE)
  assert.equal(R.figureId("visor"), "visor")
  assert.equal(R.frame("", "working", 0).body, R.frame(R.DEFAULT_FIGURE, "working", 0).body)
  assert.notEqual(R.frame("visor", "working", 0).body, R.frame("deck", "working", 0).body)
  assert.ok(R.figureName("deck").length > 0)
  // an unknown state stands by rather than drawing nothing
  assert.equal(R.frame("deck", "nope", 0).body, R.frame("deck", "idle", 0).body)
})

test("each state reads differently: lit at work, beacon when it wants you, dark on standby", () => {
  for (const shape of R.FIGURES) {
    const where = shape.id
    assert.ok(R.frame(shape.id, "needs", 0).glow.indexOf("!") !== -1, where + " beacons")
    assert.ok(R.frame(shape.id, "waiting", 0).glow.indexOf("¦") !== -1, where + " rains")
    assert.ok(R.frame(shape.id, "error", 0).glow.indexOf("✶") !== -1, where + " sparks")
    // standby has no lit seams, and the working figure does
    assert.equal(R.frame(shape.id, "idle", 1).glow.indexOf("╎"), -1, where + " sleeps dark")
    assert.ok(R.frame(shape.id, "working", 0).glow.indexOf("╎") !== -1, where + " works lit")
  }
})

test("the robot has no neck: nothing pokes up out of its shoulders", () => {
  // The shoulder line is one unbroken row — a single raised cell there sat
  // off the figure's centre and read as a mistake.
  for (const state of R.STATES) {
    for (const f of R.frames("visor", state)) {
      const rows = f.body.split("\n")
      const shoulder = rows.find(r => r.indexOf("█████████") !== -1)
      assert.ok(shoulder, "visor/" + state + " has shoulders")
      assert.equal(shoulder.indexOf("▄▄▄▄▄█▄▄▄"), -1, "visor/" + state + " grew a neck back")
    }
  }
})
