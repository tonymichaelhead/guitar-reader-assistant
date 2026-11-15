# src/render — engraving

Two halves with different rules:

- `layout.js` computes geometry and must stay free of the DOM so it can be tested in Node (`test/layout.test.js`). Spacing, system breaks, stems, beams and accidental signs are decided here.
- `draw.js`, `score.js` and `note-map.js` create SVG nodes through `el()` in `svg.js`, and with `tooltip.js` the few HTML nodes around them. They draw what `layout.js` decided and make no layout decisions of their own.

SMuFL conventions the code relies on (details in `docs/engraving.md`):

- A glyph is drawn at `font-size = 4 * SPACE` with its origin on the baseline. Noteheads and accidentals are vertically centred on that baseline, with their left edge at x = 0.
- SMuFL's y axis points up and SVG's points down. Anchors copied from Bravura's metadata have their sign flipped where they are used.
- Code points and metrics live only in `glyphs.js`. Line weights come from Bravura's `engravingDefaults`, not from taste.
- The glyphs are in the Private Use Area, so nothing renders until Bravura has loaded. `main.js` waits for it; keep that wait if you change the boot sequence.

There is a second renderer: `src/export/score-pdf.js` draws the same layout into a PDF and mirrors `draw.js` and `score.js` function for function. Change how something is drawn here and change it there too, then open a downloaded PDF to check. A new glyph also has to be added to `WANTED` in `scripts/extract-glyph-outlines.mjs` and the outlines regenerated.

After any change here, look at the score in a browser at phone, tablet and desktop widths, with sixteenths and accidentals switched on. That combination is where collisions show up.
