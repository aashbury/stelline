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


// An effect's glyphs now land in one of three brightness layers; a test that
// asks "what is on screen" has to look at all three.
function merged(f) {
  // Each layer is emitted at its own left edge with its offset in columns, so
  // putting the frame back together means shifting them before comparing.
  const offs = f.offset || [0, 0, 0]
  const layers = [f.dim || "", f.overlay || "", f.hot || ""].map((l) => l.split("\n"))
  const base = Math.min(...offs)
  const rows = Math.max(...layers.map((l) => l.length))
  const out = []
  for (let r = 0; r < rows; r++) {
    let line = ""
    for (let i = 0; i < 3; i++) {
      const src = layers[i][r] || ""
      const shift = offs[i] - base
      for (let c = 0; c < src.length; c++) {
        const ch = src[c]
        if (!ch || ch === " ") continue
        const at = shift + c
        while (line.length < at) line += " "
        line = line.substring(0, at) + ch + line.substring(at + 1)
      }
    }
    out.push(line.replace(/\s+$/, ""))
  }
  while (out.length && out[out.length - 1] === "") out.pop()
  return out.join("\n")
}

test("overlays draw something in flight and never outside the grid", () => {
  const p = E.plan("rain", art, 3)
  const mid = E.frame(p, 900)
  const lines = merged(mid).split("\n")
  assert.ok(lines.length <= 3)
  assert.ok(lines.every((l) => l.length <= 5))
  const d = E.plan("decrypt", art, 3)
  const glyphs = merged(E.frame(d, 1000)).replace(/\s/g, "")
  assert.ok(glyphs.length > 0)
  assert.ok([...glyphs].every((g) => E.CIPHER.includes(g)))
  const tw = E.plan("typewriter", art, 1)
  const cursorFrame = merged(E.frame(tw, 10))
  assert.equal((cursorFrame.match(/█/g) || []).length, 1, "one cursor")
})

test("reveal goes row by row, wipe leads with shade, pulse is instant", () => {
  const r = E.plan("reveal", art, 1)
  const first = E.frame(r, 0).resolved
  assert.ok(first.length > 0 && first.every((c) => c.r === 0))
  const w = E.plan("wipe", art, 1)
  assert.match(merged(E.frame(w, 250)), /[░▒]/)
  const pulse = E.plan("pulse", art, 1)
  assert.equal(E.frame(pulse, 0).resolved.length, 8)
  assert.equal(E.plan("nonsense", art, 1).effect, "pulse")
})

test("pick honours a list, ignores unknown names, and falls back to all", () => {
  assert.equal(E.pick(["rain", "bogus"], 0.9), "rain")
  assert.equal(E.pick([], 0), "decrypt")
  // an unknown name falls back to the whole list, whatever is in it
  assert.equal(E.pick(["bogus"], 0.99), E.EFFECTS[E.EFFECTS.length - 1])
  assert.equal(E.rng(5)(), E.rng(5)())
})

test("every effect plans, stays inside the grid, and finishes", () => {
  const art = ["  ████  ", " ██  ██ ", "████████", "██    ██"]
  for (const fx of E.EFFECTS) {
    const p = E.plan(fx, art, 11)
    assert.ok(p.cells.length > 0, fx)
    for (const cell of p.cells) assert.ok(isFinite(cell.at) && cell.at >= 0, fx + " at")
    // Mid-flight an effect may draw outside the word — that is what the
    // margin is for — but never outside the margin.
    const mid = merged(E.frame(E.plan(fx, art, 11), Math.round(p.duration * 0.4))).split("\n")
    assert.ok(mid.length <= art.length + p.padR * 2, fx + " rows")
    for (const line of mid) assert.ok(line.length <= 8 + p.padC * 2, fx + " cols")
    // and everything is resolved once the plan is over
    assert.equal(E.frame(p, p.duration + 50).resolved.length, p.cells.length, fx + " unresolved")
  }
})

test("moods are sets of real effects, and moodOf names them back", () => {
  const M = require("../StellineModel.js")
  const seen = []
  for (const key of Object.keys(E.MOODS)) {
    for (const fx of E.MOODS[key]) {
      assert.ok(E.EFFECTS.includes(fx), key + " has unknown " + fx)
      assert.ok(!seen.includes(fx), fx + " is in two moods")
      seen.push(fx)
    }
  }
  assert.equal(seen.length, E.EFFECTS.length, "the moods together are every effect")
  // and the same for Omarchy's 37
  const ttfx = Object.values(M.TTFX_MOODS).flat()
  assert.deepEqual(ttfx.slice().sort(), M.TTFX_EFFECTS.slice().sort())
  // moodOf: nothing pinned is every effect, a set is its mood, anything else is custom
  assert.equal(M.moodOf([], E.MOODS), "")
  assert.equal(M.moodOf(E.MOODS.neon.slice().reverse(), E.MOODS), "neon")
  assert.equal(M.moodOf(M.TTFX_MOODS.kinetic, M.TTFX_MOODS), "kinetic")
  assert.equal(M.moodOf(["rain"], E.MOODS), "custom")
})

test("every departure clears the art and leaves nothing behind", () => {
  for (const style of E.EXITS) {
    const p = E.planExit(style, art, 4)
    assert.ok(p.cells.length > 0, style)
    // something is on screen while it is going
    assert.ok(merged(E.frame(E.planExit(style, art, 4), Math.round(p.duration * 0.3))) !== "", style + " mid-exit")
    // and nothing at all once it is over
    const end = E.frame(p, p.duration + 20)
    assert.equal(merged(end), "", style + " leftovers")
    assert.equal(end.resolved.length, 0, style + " resolves nothing")
    assert.ok(end.done, style + " done")
  }
})

test("the ambient layer keeps drawing and never runs out", () => {
  for (const style of E.AMBIENTS) {
    const p = E.planAmbient(style, art, 4)
    let drawn = 0
    for (let t = 0; t < 12000; t += 70) if (merged(E.ambientFrame(p, t)) !== "") drawn++
    assert.ok(drawn > 0, style + " never draws")
    // and it stays inside the art
    const f = E.ambientFrame(p, 5000)
    for (const line of merged(f).split("\n")) assert.ok(line.length <= art[0].length + 12, style + " too wide")
  }
  // an unknown style is a scan rather than nothing at all
  assert.equal(E.planAmbient("nonsense", art, 1).effect, "scan")
})

test("moods still partition every effect after the new ones", () => {
  const seen = Object.keys(E.MOODS).flatMap((k) => E.MOODS[k])
  assert.deepEqual(seen.slice().sort(), E.EFFECTS.slice().sort())
})

test("the field draws outside the word, and never outlives its effect", () => {
  const art = ["  ████  ", " ██  ██ ", "████████", "██    ██"]
  const field = ["spotlight", "cascade", "shockwave", "beams", "storm"]
  for (const fx of field) {
    const p = E.plan(fx, art, 6)
    assert.ok(p.padR > 0 || p.padC > 0, fx + " has no margin")
    // it uses the margin: something is drawn beyond the word's own box, in
    // whichever direction that effect travels
    let outside = 0
    for (let t = 200; t < p.duration; t += 120) {
      const rows = merged(E.frame(E.plan(fx, art, 6), t)).split("\n")
      const wider = rows.some((l) => l.length > art[0].length)
      if (rows.length > art.length || wider) outside++
    }
    assert.ok(outside > 0, fx + " never draws outside the word")
    // and the screen is the letters' own once the arrival is over
    assert.equal(merged(E.frame(p, p.duration + 40)), "", fx + " weather outlived it")
  }
})

test("on battery the whole-canvas effects stand down", () => {
  for (const fx of E.FIELD_EFFECTS) assert.ok(E.EFFECTS.includes(fx), fx + " is not an effect")
  const cheap = E.onlyCheap(E.EFFECTS)
  assert.ok(cheap.length > 0)
  for (const fx of E.FIELD_EFFECTS) assert.ok(!cheap.includes(fx), fx + " survived")
  // a pinned list is filtered the same way, and never becomes empty
  assert.deepEqual(E.onlyCheap(["reveal", "storm"]), ["reveal"])
  assert.deepEqual(E.onlyCheap(["storm", "cascade"]), ["reveal"])
  assert.ok(E.onlyCheap([]).length > 0)
})

test("every frame carries offsets, and a padded frame's glyphs land on their own cells", () => {
  // Regression: a stale layersOf without offsets once shadowed the real one,
  // and everything with a margin drew padC cells to the right.
  const wide = ["  ████████  ", " ██      ██ ", "████████████", "██        ██"]
  const check = (f, label) => {
    assert.ok(Array.isArray(f.offset) && f.offset.length === 3, label + " has no offsets")
    for (const [i, key] of [[0, "dim"], [1, "overlay"], [2, "hot"]]) {
      const layer = f[key]; if (!layer) continue
      layer.split("\n").forEach((line, row) => {
        for (let j = 0; j < line.length; j++) {
          const ch = line[j]; if (ch === " " || ch === "─" || ch === "·") continue
          const r = row - (f.padR ?? 0), c = f.offset[i] + j
          // only glyphs that are the art's own letters must sit on the art
          if (E.CIPHER.includes(ch) || "░▒▓█╲".includes(ch)) continue   // weather, not letters
          assert.equal((wide[r] || "")[c], ch, `${label} ${key} r${r} c${c}`)
        }
      })
    }
  }
  const amb = E.planAmbient("scan", wide, 2)
  for (let t = 0; t < 6000; t += 60) { const f = E.ambientFrame(amb, t); f.padR = amb.padR; check(f, "scan@" + t) }
  const st = E.plan("storm", wide, 2)
  for (let t = 0; t < st.duration; t += 90) { const f = E.frame(st, t); f.padR = st.padR; check(f, "storm@" + t) }
  const ex = E.planExit("dissolve", wide, 2)
  const f0 = E.frame(ex, 0); f0.padR = ex.padR; check(f0, "dissolve@0")
})
