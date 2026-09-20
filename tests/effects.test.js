const test = require("node:test")
const assert = require("node:assert/strict")
const E = require("../savers/Effects.js")

const art = ["██ ██", " █ █ ", "█   █"]

test("every effect resolves every cell by its duration and nothing before it starts", () => {
  for (const effect of E.EFFECTS) {
    const p = E.plan(effect, art, 7)
    assert.equal(p.cells.length, 8, effect)
    const before = E.frame(p, -1)
    assert.equal(before.resolved.length, 0, effect)
    assert.ok(!before.done, effect)
    let total = 0
    for (let t = 0; t <= p.duration; t += 50) total += E.frame(p, t).resolved.length
    const last = E.frame(p, p.duration)
    assert.equal(total, 8, effect)
    assert.ok(last.done, effect)
    assert.equal(last.overlay.trim(), "", effect + " overlay should be empty at the end")
  }
})

test("overlays draw something in flight and never outside the grid", () => {
  const p = E.plan("rain", art, 3)
  const mid = E.frame(p, 900)
  const lines = mid.overlay.split("\n")
  assert.ok(lines.length <= 3)
  assert.ok(lines.every((l) => l.length <= 5))
  const d = E.plan("decrypt", art, 3)
  const glyphs = E.frame(d, 1000).overlay.replace(/\s/g, "")
  assert.ok(glyphs.length > 0)
  assert.ok([...glyphs].every((g) => E.CIPHER.includes(g)))
  const tw = E.plan("typewriter", art, 1)
  const cursorFrame = E.frame(tw, 10).overlay
  assert.equal((cursorFrame.match(/█/g) || []).length, 1, "one cursor")
})

test("reveal goes row by row, wipe leads with shade, pulse is instant", () => {
  const r = E.plan("reveal", art, 1)
  const first = E.frame(r, 0).resolved
  assert.ok(first.length > 0 && first.every((c) => c.r === 0))
  const w = E.plan("wipe", art, 1)
  assert.match(E.frame(w, 250).overlay, /[░▒]/)
  const pulse = E.plan("pulse", art, 1)
  assert.equal(E.frame(pulse, 0).resolved.length, 8)
  assert.equal(E.plan("nonsense", art, 1).effect, "pulse")
})

test("pick honours a list, ignores unknown names, and falls back to all", () => {
  assert.equal(E.pick(["rain", "bogus"], 0.9), "rain")
  assert.equal(E.pick([], 0), "decrypt")
  assert.equal(E.pick(["bogus"], 0.99), "pulse")
  assert.equal(E.rng(5)(), E.rng(5)())
})
