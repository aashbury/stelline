const test = require("node:test")
const assert = require("node:assert/strict")
const I = require("../IdleModel.js")

test("a Hyprland event splits on commas when it cannot parse itself", () => {
  assert.deepEqual(I.eventParts({ data: "abc,1,class,title" }, 4), ["abc", "1", "class", "title"])
  assert.deepEqual(I.eventParts({ parse: (n) => ["x", n] }, 2), ["x", 2])
  assert.deepEqual(I.eventParts(null, 1), [""])
})

test("screensaver windows are counted as they open and close", () => {
  let s = I.screensaverWindowsAfter({}, "a", true)
  assert.equal(s.count, 1)
  s = I.screensaverWindowsAfter(s.windows, "b", true)
  assert.equal(s.count, 2)
  s = I.screensaverWindowsAfter(s.windows, "a", false)
  assert.deepEqual(s, { windows: { b: true }, count: 1 })
  // no address changes nothing
  assert.equal(I.screensaverWindowsAfter(s.windows, "", true).count, 1)
})
