# 2. Notation is drawn by hand in SVG, with Bravura glyphs

Date: 2026-11-15
Status: Accepted

## Context

The original renderer drew noteheads as ellipses and took its clef from whatever system font had one. Eighths and sixteenths needed beams, and the score was to look like an old engraving. A notation library such as VexFlow would have supplied beaming and spacing, at the cost of a large dependency and less control over the look and over per-note behaviour (hover fingerings, position marks).

## Decision

Keep the custom SVG renderer. Draw every symbol with glyphs from Bravura, a SMuFL font modelled on traditional plate engraving, and take line weights from its engraving defaults. Split the renderer into pure geometry (`layout.js`) and drawing (`draw.js`).

The scope that makes this affordable: one voice, 4/4, three note values, no rests, ties or tuplets.

## Consequences

- Full control over appearance, and no dependency (see record 1).
- Geometry is testable in Node without a browser.
- Engraving rules are ours to get right: spacing, system breaks, stems and beams are implemented in about 250 lines and described in `docs/engraving.md`.
- Each new notation feature costs real work. If the scope grows to several voices, tuplets or key signatures across many keys, a library becomes the better choice and this record should be superseded.
- Bravura has a Reserved Font Name, so the font file is shipped whole and unmodified (about 320 KB).
