// Morty, drawn as vector cels and baked to dots by tools/bake.js.
//
// Drawn from a photograph of the dog himself: a red-and-white Boston
// terrier, slim and leggy, sitting up square on and looking at you, friendly. Tall narrow ears
// standing straight up, a broad white blaze opening out over the whole
// muzzle and the inside of the cheeks, a liver nose, pink jowls, light
// amber eyes, and a white chest running down into two white front legs.
// A plain collar with a tag. Framed from the tips of his ears down his
// front legs, the way the others are framed close.
//
// Same four tones and ink lines as the hands and the robot: his white is
// the solid tone in the light and the dense one turning away from it; his
// red coat is the dense tone, darker where it turns from the light; the
// sparse tone is pink skin and shadow. The glint in his eyes and his tag
// are left for the figure to light.

var D = require("./draw.js")
var line = D.line, ellipse = D.ellipse, path = D.path, LINE = D.LINE
var T = D.TONE
var NECK = [330, 540]     // what the head turns about

function stroke(d, tone, w, cap) {
  return '<path d="' + d + '" fill="none" stroke="' + T[tone] + '" stroke-width="' + w + '" stroke-linecap="' + (cap || "round") + '" stroke-linejoin="round"/>'
}
function pt(p) { return p[0] + " " + p[1] }

// ---- the ears -------------------------------------------------------------------
//
// Tall, narrow and pointed, set high at the corners of the skull and
// standing straight up, a little flared. Red on the back, the inside pink
// with a fringe of pale hair along the edge the light catches. `droop`
// lays them back.

function ear(base0, base1, tip, lit) {
  var s = ""
  var mid0 = D.lerp(base0, tip, 0.55), mid1 = D.lerp(base1, tip, 0.55)
  s += path("M " + pt(base0) + " Q " + pt([mid0[0] - 14, mid0[1]]) + " " + pt(tip) +
    " Q " + pt([mid1[0] + 14, mid1[1]]) + " " + pt(base1) + " Z", 2, LINE * 1.6)
  // the inside, pink, narrowing to the tip
  var c = D.lerp(base0, base1, 0.5)
  var i0 = D.lerp(base0, c, 0.4), i1 = D.lerp(base1, c, 0.4), it = D.lerp(tip, c, 0.22)
  s += path("M " + pt(i0) + " Q " + pt(D.lerp(i0, it, 0.5)) + " " + pt(it) + " Q " + pt(D.lerp(i1, it, 0.5)) + " " + pt(i1) + " Z", 1)
  // a fold of cartilage up the middle, and the pale fringe on the lit edge
  var m = D.lerp(c, it, 0.5)
  s += stroke("M " + pt(D.lerp(c, it, 0.15)) + " Q " + pt([m[0] + 6, m[1]]) + " " + pt(D.lerp(c, it, 0.8)), 0, 7)
  s += stroke("M " + pt(D.lerp(i0, it, 0.1)) + " L " + pt(D.lerp(i0, it, 0.8)), lit ? 3 : 2, 7)
  return s
}
function ears(droop) {
  return ear([156, 268], [270, 214], D.lerp([156, 26], [60, 160], droop), true) +
    ear([392, 214], [500, 268], D.lerp([446, 32], [570, 160], droop), false)
}

// ---- the eyes -------------------------------------------------------------------
//
// Round and set wide, a little prominent, the iris light amber round a big
// dark pupil — not the black button of a cartoon. A dark rim round each,
// red brow over it, one glint on the side the light comes from.

var EYES = [[238, 372], [424, 372]]
function eye(c, r, mood) {
  var s = ""
  if (mood === "shut") {
    s += stroke("M " + (c[0] - r) + " " + (c[1] - 2) + " Q " + c[0] + " " + (c[1] + r * 0.55) + " " + (c[0] + r) + " " + (c[1] - 2), 0, 12)
    s += stroke("M " + (c[0] - r * 0.8) + " " + (c[1] - 10) + " Q " + c[0] + " " + (c[1] + r * 0.2) + " " + (c[0] + r * 0.8) + " " + (c[1] - 10), 1, 7)
    return s
  }
  s += ellipse(c, r + 6, r + 5, 0, 0)                          // the rim
  // the iris is light amber — lighter than his coat, so the eye reads
  s += ellipse(c, r, r - 1, 3)
  s += ellipse([c[0] + 3, c[1] + 4], r * 0.9, r * 0.5, 2)       // shade low in it
  s += ellipse([c[0], c[1] + 2], r * 0.56, r * 0.56, 0)        // the pupil
  s += stroke("M " + (c[0] - r - 2) + " " + (c[1] - 6) + " Q " + c[0] + " " + (c[1] - r - 12) + " " + (c[0] + r + 2) + " " + (c[1] - 6), 0, 6)  // the upper lid, light
  if (mood === "dizzy") {
    var k = r * 0.6
    s += line([c[0] - k, c[1] - k], [c[0] + k, c[1] + k], 3, 9) + line([c[0] + k, c[1] - k], [c[0] - k, c[1] + k], 3, 9)
    return s
  }
  s += ellipse([c[0] - r * 0.2, c[1] - r * 0.14], 7, 7, 3)    // the glint, in the pupil
  return s
}

// ---- the mouth -------------------------------------------------------------------

// Open in a happy pant, the way he grins when he wants you — the corners
// drawn back and up into his cheeks, the jaw dropped, a broad tongue lying
// in it. The chin comes down below the collar's edge.
function pant() {
  var s = ""
  s += path("M 258 500 C 262 552 292 586 331 590 C 370 586 400 552 404 500 Z", 3, LINE * 1.4)
  s += path("M 380 520 C 396 540 398 560 380 578 C 366 586 352 590 340 590 C 364 572 378 548 380 520 Z", 2)
  s += path("M 262 470 C 278 494 306 496 331 476 C 356 496 384 494 400 470 C 398 500 386 526 368 542 L 294 542 C 276 526 264 500 262 470 Z", 0, 8)
  // the tongue, light pink, broad, lying forward over the lower lip
  s += path("M 286 508 C 302 496 360 496 376 508 C 382 534 364 556 331 560 C 298 556 280 534 286 508 Z", 3, 6)
  s += path("M 360 504 C 374 510 380 530 368 548 C 358 556 346 560 336 560 C 356 546 366 528 360 504 Z", 2)
  s += stroke("M 331 510 L 331 546", 2, 6)
  // the upper lip, pulled back into the smile
  s += stroke("M 254 460 C 272 492 304 494 331 472 C 358 494 390 492 408 460", 0, 8)
  return s
}
// Shut, and still pleased with himself: the lip line turned up at the
// corners, the white of his chin under it.
function calm() {
  var s = ""
  s += stroke("M 262 466 C 280 488 306 490 331 476 C 356 490 382 488 400 466", 0, 8)
  s += stroke("M 304 506 Q 331 516 358 506", 2, 6)
  return s
}

// Busy: the mouth shut, and the tip of his tongue poked out between his lips
// the way a dog's is when he is concentrating on something.
function blep() {
  var s = calm()
  s += path("M 316 494 C 318 512 344 512 346 494 Z", 3, 6)
  s += stroke("M 331 496 L 331 506", 2, 5)
  return s
}

// ---- the head -------------------------------------------------------------------
//
// Broad and square-skulled, with an abrupt stop, big for his slim body.
// Near enough full face.

function head(mood, droop, mouthOpen) {
  var s = ears(droop)
  // the skull and cheeks, red: broad, flat on top, the cheeks wide, coming
  // in to the jowls
  var skull = "M 224 208 C 270 196 390 196 436 208 C 470 230 492 290 492 360 C 494 410 486 440 470 462 " +
    "C 450 500 420 530 398 546 L 266 546 C 244 530 214 500 194 462 C 178 440 170 410 172 360 C 172 290 190 230 224 208 Z"
  s += path(skull, 2, LINE * 1.8)
  // the far side of the head, turned from the light
  s += path("M 452 220 C 480 250 494 300 492 360 C 492 410 484 440 466 466 C 474 420 476 360 468 300 C 464 270 458 240 452 220 Z", 1)
  // light along the top of the skull and down the near cheek
  s += stroke("M 236 214 C 270 206 300 204 318 204", 3, 7)
  s += stroke("M 184 330 C 180 380 186 420 200 450", 3, 7)
  // the blaze: narrow up the forehead, between the eyes, then opening over
  // the whole muzzle and the inside of the cheeks
  s += path("M 312 206 L 348 206 C 350 260 356 320 366 356 C 400 376 428 398 438 428 C 440 470 422 510 398 542 " +
    "L 266 544 C 244 512 224 472 224 430 C 234 398 264 376 296 356 C 306 320 310 260 312 206 Z", 3, 7)
  s += path("M 366 360 C 400 378 428 400 436 430 C 438 470 420 508 398 540 L 384 540 C 410 490 418 440 366 360 Z", 2)
  // a lit brow over each eye
  // raised a little, which is most of what reads as friendly
  s += stroke("M 206 330 Q 238 308 270 326", 3, 7) + stroke("M 392 326 Q 424 308 456 330", 2, 7)
  s += eye(EYES[0], 30, mood) + eye(EYES[1], 30, mood)
  // the crease over the bridge of the muzzle
  s += stroke("M 300 400 Q 330 392 362 400", 2, 6)
  // the nose: broad, liver-coloured, nostrils cut in, a shine on top
  s += path("M 294 420 C 298 402 364 402 368 420 C 372 440 354 452 331 454 C 308 452 290 440 294 420 Z", 1, 8)
  s += ellipse([318, 412], 13, 5, 2)
  s += ellipse([314, 436], 7, 5, 0) + ellipse([348, 436], 7, 5, 0)
  s += line([331, 454], [331, 472], 0, 7)
  s += mouthOpen === "blep" ? blep() : (mouthOpen ? pant() : calm())
  // whisker spots either side of the nose
  var SPOTS = [[272, 440], [262, 454], [278, 458], [390, 440], [400, 454], [384, 458]]
  for (var i = 0; i < SPOTS.length; i++) s += ellipse(SPOTS[i], 4, 4, 1)
  return s
}

// ---- the body --------------------------------------------------------------------
//
// Sitting up straight, square on to you: a narrow white chest dropping into
// two slim white front legs, the red of his sides behind, a haunch and a
// white hind foot either side. Lit from the left; the right side of each
// form turns away.

function body(typing) {
  var s = ""
  // his sides, red, behind the chest, a touch darker down the right
  s += path("M 206 548 C 150 620 128 760 128 880 L 132 1000 L 530 1000 L 534 880 C 534 760 512 620 456 548 Z", 2, LINE * 1.8)
  s += path("M 480 600 C 516 660 534 760 534 880 L 530 1000 L 506 1000 C 512 900 506 740 480 600 Z", 1)
  // a haunch either side, rounding forward, and a white hind foot under each
  s += ellipse([176, 880], 62, 94, 2, LINE * 1.4) + ellipse([486, 880], 62, 94, 2, LINE * 1.4)
  s += stroke("M 130 820 C 144 796 170 788 196 794", 3, 8) + stroke("M 468 794 C 494 788 516 796 530 820", 2, 8)
  s += ellipse([168, 988], 44, 26, 3, LINE * 1.2) + ellipse([494, 988], 44, 26, 3, LINE * 1.2)
  s += line([156, 974], [156, 1002], 0, 6) + line([178, 972], [178, 1002], 0, 6)
  s += line([484, 972], [484, 1002], 0, 6) + line([506, 974], [506, 1002], 0, 6)
  // Typing, his front legs are up on the keyboard instead: drawn over it.
  if (!typing) {
  // the floor, showing between the front legs under the chest
  s += '<polygon points="290,800 372,800 378,1004 284,1004" fill="#000"/>'
  // the front legs: slim and straight
  s += path("M 222 700 C 214 790 210 890 206 1010 L 288 1010 C 290 910 294 840 300 800 C 270 780 240 740 222 700 Z", 3, LINE * 1.4)
  s += path("M 272 800 C 270 880 268 950 268 1010 L 288 1010 C 290 910 294 840 300 800 C 290 800 280 800 272 800 Z", 2)
  s += path("M 440 700 C 448 790 452 890 456 1010 L 374 1010 C 372 910 368 840 362 800 C 392 780 422 740 440 700 Z", 3, LINE * 1.4)
  s += path("M 424 740 C 436 800 440 900 442 1010 L 456 1010 C 452 890 448 790 440 700 C 436 716 430 728 424 740 Z", 2)
  s += stroke("M 232 760 C 226 840 222 920 220 1000", 3, 8)
  // the front paws, white, planted, toes marked
  s += ellipse([246, 1024], 54, 30, 3, LINE * 1.2) + ellipse([416, 1024], 54, 30, 3, LINE * 1.2)
  s += path("M 272 1006 C 294 1012 300 1030 290 1046 C 280 1052 268 1052 258 1052 C 282 1040 286 1022 272 1006 Z", 2)
  s += path("M 442 1006 C 464 1012 470 1030 460 1046 C 450 1052 438 1052 428 1052 C 452 1040 456 1022 442 1006 Z", 2)
  var TOES = [228, 248, 268, 398, 418, 438]
  for (var t = 0; t < TOES.length; t++) s += line([TOES[t], 1016], [TOES[t], 1044], 0, 6)
  }
  // the white throat and chest, narrow and deep, outlined only down its
  // sides so it runs on into the legs below
  s += path("M 196 520 L 466 520 C 478 600 474 700 450 780 C 430 830 400 856 362 860 L 300 860 C 262 856 232 830 212 780 C 188 700 184 600 196 520 Z", 3)
  s += stroke("M 196 520 C 184 600 188 700 212 780", 0, LINE * 1.4) + stroke("M 466 520 C 478 600 474 700 450 780", 0, LINE * 1.4)
  s += path("M 440 540 C 470 620 468 720 440 790 C 420 830 396 850 370 858 C 410 800 436 700 440 540 Z", 2)
  s += stroke("M 331 620 C 333 690 333 760 331 830", 2, 7)
  var FUR = [[226, 640], [218, 700], [236, 750], [436, 640], [444, 700], [426, 750]]
  for (var f = 0; f < FUR.length; f++) s += stroke("M " + FUR[f][0] + " " + FUR[f][1] + " q " + (FUR[f][0] < 331 ? -2 : 2) + " 14 " + (FUR[f][0] < 331 ? 2 : -2) + " 26", 2, 6)

  // the collar: a plain band round the neck, and the tag hanging from it
  var band = "M 190 540 C 250 590 410 590 472 536"
  s += stroke(band, 0, 34) + stroke(band, 2, 18)
  s += line([331, 578], [331, 598], 0, 10)
  s += ellipse([331, 614], 18, 18, 3, LINE)
  s += ellipse([331, 614], 7, 7, 2)
  return { svg: s, tag: [331, 614] }
}

// ---- at the keyboard --------------------------------------------------------------
//
// A keyboard across the bottom of the frame, seen from above and in front,
// its far edge narrower than its near one. The keys are the mid tone on the
// dark body, so the one under a paw can light.

// No wider than he is, so he reads as a dog at a desk rather than a shape.
var KB_TOP = 872, KB_BOTTOM = 1090, KB_L = 128, KB_R = 534, KB_FLARE = 26
function kbEdges(y) {
  var t = (y - KB_TOP) / (KB_BOTTOM - KB_TOP)
  return [KB_L - KB_FLARE * t, KB_R + KB_FLARE * t]
}
function keyboard() {
  var s = ""
  s += path("M " + KB_L + " " + KB_TOP + " L " + KB_R + " " + KB_TOP + " L " + (KB_R + KB_FLARE) + " " + KB_BOTTOM + " L " + (KB_L - KB_FLARE) + " " + KB_BOTTOM + " Z", 1, LINE * 1.6)
  // a lit near edge, where the light catches the case
  s += stroke("M " + (KB_L - KB_FLARE + 8) + " " + (KB_BOTTOM - 14) + " L " + (KB_R + KB_FLARE - 8) + " " + (KB_BOTTOM - 14), 2, 8)
  var ROWS = [[896, 7], [938, 8], [982, 8], [1028, 6]]
  for (var r = 0; r < ROWS.length; r++) {
    var y = ROWS[r][0], n = ROWS[r][1], e = kbEdges(y), gap = 10
    var inset = r === 3 ? 50 : 14
    var x0 = e[0] + inset, x1 = e[1] - inset, w = (x1 - x0 - gap * (n - 1)) / n
    var h = 30 + r * 2
    for (var k = 0; k < n; k++) {
      var x = x0 + k * (w + gap)
      s += '<rect x="' + D.f(x) + '" y="' + D.f(y) + '" width="' + D.f(w) + '" height="' + h + '" rx="5" fill="' + T[2] + '" stroke="#000" stroke-width="5"/>'
    }
  }
  return s
}

// A front leg from the shoulder down to its paw on the keys: white, slim,
// shaded down the side turned from the light and furred like his chest, the
// paw rounded with its toes marked. `up` lifts the paw well clear of the
// keys and tips it back at the toes, so the tapping reads at a glance.
var PAWS = { L: [240, 952], R: [422, 952] }
var SHOULDERS = { L: [248, 690], R: [414, 690] }
function frontLeg(side, up) {
  var s = "", sh = SHOULDERS[side], p = PAWS[side], out = side === "L" ? -1 : 1
  var paw = [p[0] + out * 8 * up, p[1] - 96 * up]
  var knee = D.lerp(sh, paw, 0.55)
  var d = "M " + pt(sh) + " Q " + pt([knee[0] + out * 14, knee[1]]) + " " + pt(paw)
  s += stroke(d, 0, 76) + stroke(d, 3, 60)
  // the side away from the light (his right, and the outer edge of each)
  var shade = "M " + pt([sh[0] + 20, sh[1] + 10]) + " Q " + pt([knee[0] + out * 14 + 20, knee[1]]) + " " + pt([paw[0] + 20, paw[1] - 16])
  s += stroke(shade, 2, 16)
  // a few strokes of fur down the front, as on his chest
  for (var k = 1; k <= 3; k++) {
    var q = D.lerp(sh, paw, k / 4.2)
    s += stroke("M " + pt([q[0] - 8, q[1]]) + " q " + (out * 2) + " 14 " + (-out * 2) + " 26", 2, 5)
  }
  // the paw, and its toes; lifted, it tips back so the pads show
  var rot = up ? out * -14 : 0
  s += ellipse(paw, 50, up ? 34 : 30, 3, LINE * 1.2, rot)
  for (var t = -1; t <= 1; t++) {
    var a = D.rotate([paw[0] + t * 18, paw[1] - 8], rot, paw), b = D.rotate([paw[0] + t * 18, paw[1] + 20], rot, paw)
    s += line(a, b, 0, 6)
  }
  if (up) s += ellipse(D.rotate([paw[0], paw[1] + 10], rot, paw), 16, 9, 1)
  return { svg: s, at: paw }
}

// He is drawn a little over the frame — ear tips at the top, paws past the
// bottom — and round a middle a touch left of the canvas's. The whole of him
// is brought in to fit with a margin, and centred.
var FIT = 0.9, DRAWN_MID = 331, DRAWN_TOP = 20, MARGIN = 26
function fit(p) { return [D.W / 2 + (p[0] - DRAWN_MID) * FIT, MARGIN + (p[1] - DRAWN_TOP) * FIT] }
var FIT_T = "translate(" + D.W / 2 + "," + MARGIN + ") scale(" + FIT + ") translate(" + -DRAWN_MID + "," + -DRAWN_TOP + ")"

// A whole pose: how the eyes are, whether the mouth is open, how far the
// ears are laid back, and how far the head is tipped and dropped.
function pose(o) {
  var b = body(!!o.typing)
  var tilt = o.tilt || 0, dy = o.head || 0
  var h = D.group(head(o.eyes || "open", o.droop || 0, o.blep ? "blep" : !!o.pant), "translate(0," + dy + ") rotate(" + tilt + " " + NECK[0] + " " + NECK[1] + ")")
  var move = function (p) { var r = D.rotate(p, tilt, NECK); return fit([r[0], r[1] + dy]) }
  var marks = { eyes: EYES.map(move), tag: fit(b.tag) }
  var front = ""
  if (o.typing) {
    // the keyboard over his lap, then his front legs over the keyboard; the
    // paw that is down marks the key it lights
    var L = frontLeg("L", o.typing === "R" ? 1 : 0), R = frontLeg("R", o.typing === "L" ? 1 : 0)
    front = keyboard() + L.svg + R.svg
    marks.keys = [o.typing === "R" ? null : fit(L.at), o.typing === "L" ? null : fit(R.at)].filter(function (p) { return p })
  }
  return { svg: D.svg(D.group(b.svg + h + front, FIT_T), null), marks: marks }
}

// Mouth shut while he works, sleeps or has come to grief; open, grinning,
// when he is waiting on you.
function poses() {
  return {
    calm: pose({}),
    calmBlink: pose({ eyes: "shut" }),
    pant: pose({ pant: true }),
    pantBlink: pose({ pant: true, eyes: "shut" }),
    // head cocked one way and the other: what is it, what do you want
    tiltL: pose({ pant: true, tilt: -12, head: -4 }),
    tiltR: pose({ pant: true, tilt: 12, head: -4 }),
    dizzy: pose({ eyes: "dizzy", tilt: 5 }),
    // asleep sitting up: head dropped, eyes shut, ears laid back
    sleep: pose({ eyes: "shut", head: 40, tilt: 4, droop: 0.6 }),
    // at the keyboard, head down over it, tongue out, one paw on the keys and
    // the other up — and both down, and a blink
    typeL: pose({ typing: "L", head: 16, blep: true }),
    typeR: pose({ typing: "R", head: 16, blep: true, tilt: 2 }),
    typeBoth: pose({ typing: "both", head: 16, blep: true }),
    typeBlink: pose({ typing: "both", head: 16, blep: true, eyes: "shut" })
  }
}

module.exports = { W: D.W, H: D.H, poses: poses }
