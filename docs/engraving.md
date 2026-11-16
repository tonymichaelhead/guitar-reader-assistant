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
| G clef, sharp, flat width (each glyph fills its advance) | 2.684, 0.996, 0.904 |
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

What the measures of a system can use is the width between the margins less the head of the system: the clef's room (3.7 spaces), the key signature's room (below; none without a signature) and, on the first system, the time signature's room (2.5 spaces). All three are counted wherever a width is: in the choice of four, two or one measures, in the stretch, and in the widening of a dense study.

## Key signature

A Score names its key (`score.key`), and `layoutScore` reads the signature from it: so many sharps or flats. Every system starts clef, key signature, then the time signature on the first system only, then the measures. The signature is repeated on every system and never changes within a study, so there are no cancelling naturals.

**Placement.** The signs stand in the order a signature adds them, at the heights every treble-clef signature uses. `placeKeySignature` holds all seven of each, though the keys on offer go no further than four sharps and two flats.

| | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Sharps | F5 | C5 | G5 | D5 | A4 | E5 | B4 |
| Flats | B4 | E5 | A4 | D5 | G4 | C5 | F4 |

A sign is drawn like an accidental beside a note: centred on its line or space, here with its left edge at the `x` the layout gives.

**Spacing.** In staff spaces:

| Gap | Here | Practice |
|---|---|---|
| Right edge of the clef to the first sign | 1.0 | Gould 1 to 1.25; MuseScore 1.0 (0.75 since 4.4); LilyPond 3.5 from the clef's left edge, about 0.8 after a clef as wide as Bravura's |
| Between signs | 0: each takes its own width, 0.996 for a sharp and 0.904 for a flat | LilyPond adds no padding between the signs of a signature |
| Last sign to the time signature's room, or to the first measure | 1.0 | |
| ... which puts the digits of the time signature | 1.04 after the last sign | Gould 1 to 1.5; MuseScore 1.0; LilyPond 1.15 |
| ... and the first notehead of a later system | 1.81 after it | Gould 2.5; MuseScore 2.5; LilyPond 2.5 |

The first note is closer than Gould's ideal because every lead-in here is: a measure's first notehead is centred 1.4 spaces after its start, which also leaves 1.38 spaces after a clef and 1.55 after the time signature. An accidental on that first note is at least 1.36 spaces from the signature, far enough not to be read as part of it.

The room a signature takes out of every system is therefore 1.43 spaces plus its signs: 2.43 for one sharp, 5.42 for four, 3.24 for two flats. A study without a key (Random mode, or one saved before keys existed) and a study in C major or A minor have no signature, give up no room, and are laid out exactly as before keys existed.

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

`resolveAccidentals` decides which notes carry a sign.

- At the start of every measure the key signature is in force, for every octave of its letters.
- A sign beside a note then holds for that line or space, in that octave only, until the barline.
- A note carries a sign exactly when its alteration differs from what is in force for its line or space, and the sign is the one for its own alteration: sharp, flat or natural.

So in D major an F sharp carries nothing, an F natural carries a natural, and an F sharp later in that measure and octave carries a sharp again. After the barline it carries nothing. Without a key signature the same rule gives what it always gave: a sign on the first altered note of a measure, and a natural to cancel it. There are no courtesy accidentals.

A note is placed by its letter, not by its sound: B sharp 3 sounds as C4 and is written under C4's ledger line; C flat 4 sounds as B3 and is written on that ledger line.

The note map is a table of notes, not music in a key. It has no key signature and no measures, so `resolveAccidentals` is not used there: every note with a sharp or a flat in its spelling shows that sign, and a note with neither shows none.

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
- Gaps around a key signature in *Behind Bars* (clef to signature 1 to 1.25, signature to time signature 1 to 1.5, signature to first note 2.5), as recorded beside MuseScore 3's defaults, with those defaults — https://github.com/musescore/MuseScore/blob/3.x/libmscore/style.cpp (`clefKeyDistance`, `keyTimesigDistance`, `systemHeaderDistance`)
- MuseScore 4.4's defaults — https://github.com/musescore/MuseScore/blob/v4.4.4/src/engraving/style/styledef.cpp
- LilyPond's defaults: `space-alist` of Clef and of KeySignature — https://lilypond.org/doc/v2.24/Documentation/internals/clef and https://lilypond.org/doc/v2.24/Documentation/internals/keysignature ; no padding between the signs of a signature unless one is set — https://github.com/lilypond/lilypond/blob/v2.24.4/lily/key-signature-interface.cc

The one-space limit on beam slant and the 2.5-space minimum to the inner beam are common engraving guidance that was found only in secondary summaries, not in a primary source. Gould's figures for the key signature were likewise read from the comments in MuseScore's source, not from the book. The heights of the signs of a key signature are the universal convention and were not looked up.
