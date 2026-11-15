# Engraving

How a Score becomes notation. Geometry is decided in `src/render/layout.js`; `draw.js` only draws it.

## SMuFL and Bravura

Notation glyphs come from Bravura, a font that follows the SMuFL standard. The conventions the code depends on:

- One staff space is a quarter of an em, so a glyph is drawn at `font-size = 4 × SPACE`.
- A glyph's origin is on its baseline. Noteheads and accidentals are vertically centred on the baseline with their left edge at x = 0. A clef's baseline is the line of the pitch it names: the G clef sits on the second line from the bottom. Time-signature digits are two spaces tall and centred on the baseline.
- SMuFL's y axis points up; SVG's points down.
- The glyphs are in Unicode's Private Use Area. Until the font has loaded they show as empty boxes, so `main.js` waits for `document.fonts.load` before the first render.

Code points and metrics used (all in `glyphs.js`, values in staff spaces from Bravura's `redist/Bravura.json`):

| Item | Value |
|---|---|
| G clef, black notehead, time-signature 4 | U+E050, U+E0A4, U+E084 |
| Flat, natural, sharp | U+E260, U+E261, U+E262 |
| Notehead width | 1.18 |
| Stem attachment, above or below the notehead's centre | 0.168 |
| Staff line, stem, ledger line thickness | 0.13, 0.12, 0.16 |
| Ledger line extension past the notehead | 0.4 |
| Beam thickness, gap between beams | 0.5, 0.25 |
| Thin barline, thick barline, gap | 0.16, 0.5, 0.4 |

Guitar music is written an octave above where it sounds. The plain G clef is used, as in older editions, rather than the clef with a small 8 beneath it.

## Horizontal spacing

Each note takes space according to its duration, following the table in Elaine Gould's *Behind Bars*: a sixteenth 2.0 staff spaces, an eighth 2.5, a quarter 3.5. A measure also has fixed space that never stretches: 1.4 spaces from the barline to the first notehead, and extra room for an accidental on the first note (0.8) or after an eighth or sixteenth (0.85).

## Systems

Every system holds the same number of measures: four, two or one. The largest count is used for which every system fits with note spacing squeezed to no less than 80% of its natural size. Four to a system lines systems up with the four-measure phrases of Musical mode.

Each system is then stretched so its final barline reaches the right margin. If even one measure per system would be squeezed past 80% (dense sixteenths with accidentals on a phone), the drawing is made wider instead and scales down to fit, so notes never collide.

The layout width follows the page: `viewWidthFor` maps the container's width to between 480 and 960 units, and `main.js` re-lays out when that changes.

## Stems

- A note below the middle line has its stem up; on or above it, down.
- A stem is 3.5 spaces long, and is lengthened to reach the middle line for notes far outside the staff.

## Beams

- Notes are beamed by beat: the eighths and sixteenths of one beat share a beam. With the rhythm cells in use, no eighth or sixteenth is ever left alone, so flags are not implemented.
- The note furthest from the middle line decides the stem direction for the group; a tie goes down.
- The beam slants half as steeply as the line between the first and last notes, by at most one staff space, and is flat when an inner note comes closer to the beam than both outer notes.
- The beam is placed so the shortest stem is 3.25 spaces in a group of eighths and 3.75 in a group with sixteenths, which leaves 2.5 spaces between the notehead and the inner beam.
- A run of sixteenths gets a second beam on the notehead side. A sixteenth with no sixteenth beside it would get a short stub; no current rhythm produces one.

## Accidentals

An accidental stays in force for its line or space until the barline. `resolveAccidentals` therefore writes a sign only when a note's alteration differs from what is in force, and writes a natural to cancel an earlier sharp or flat. The rule is per octave.

## Position marks and measure numbers

- The position is written as a Roman numeral over the first note of the study and over every measure where the position changes.
- All the marks in a system share one height: just above the staff, or above the highest note or stem in the system if that is higher.
- Measure numbers appear at the start of each system after the first.

## The PDF

`src/export/score-pdf.js` is a second renderer. It takes the same `layoutScore` output, always laid out at the full width of 960 units, and draws it onto Letter or A4 pages. It makes no engraving decisions: every position, stem and beam is the one `layout.js` computed, scaled uniformly to fit between the margins.

- **Glyphs.** A PDF cannot use the page's web font, and embedding Bravura whole would add about 500 KB to every file. The six glyphs a score needs (G clef, black notehead, the digit 4, sharp, flat, natural) are stored as outlines in `src/export/glyph-outlines.js` and placed in the PDF once each, as reusable forms. `scripts/extract-glyph-outlines.mjs` reads them from `Bravura.otf` and refuses to write anything unless each outline matches the bounding box and advance in Bravura's metadata.
- **Lines.** Staff lines, stems, ledger lines, barlines and beams are drawn as strokes and polygons with the same weights as on screen.
- **Words.** The title block, position marks and measure numbers are set in Times, one of the fonts every PDF viewer has built in, so no text font is embedded either. Their widths come from the font's published metrics (`times-metrics.js`). The page uses Playfair Display and EB Garamond, so the PDF's lettering is plainer than the screen's.
- **Pages.** A system is never split. The title block is on the first page only; the plate line is at the foot of every page, with "page x of y" when there is more than one.

A study in quarter notes comes to about 14 KB, and a dense sixteenth-note study to about 50 KB.

**Print** is the other way to paper. It prints the page's own SVG, so it keeps the web fonts; each system is a separate `<svg>` so that the browser can break pages between systems.

## Sources

- SMuFL glyph registration — http://smufl.formats.music/latest/specification/scoring-metrics-glyph-registration.html
- SMuFL engraving defaults — http://smufl.formats.music/latest/specification/engravingdefaults.html
- Bravura — https://github.com/steinbergmedia/bravura
- Spacing table from *Behind Bars*, as reproduced in MuseScore's spacing proposal — https://musescore.org/sites/musescore.org/files/2020-03/Improving%20MuseScore%27s%20Horizontal%20Spacing.pdf
- Beaming by beat, and stem direction — Gould, *Behind Bars*, as quoted at https://forums.steinberg.net/t/beams-and-stems-above-or-below-notes/710711

The one-space limit on beam slant and the 2.5-space minimum to the inner beam are common engraving guidance that was found only in secondary summaries, not in a primary source.
