# 5. The PDF export is written by hand, as vector drawing

Date: 2026-11-15
Status: Accepted

## Context

A study should be downloadable as a PDF. The app is a static site on GitHub Pages with no server, no build step and no dependencies (record 1), so the file has to be made in the browser by the files in `src/`.

The options considered:

- **The browser's print dialog only** ("Save as PDF"). No code to write, but it takes several steps, differs between browsers, is awkward on phones, and the result depends on the reader's print settings.
- **A PDF library** such as jsPDF or pdf-lib. A dependency of several hundred kilobytes, against record 1, for a document made of lines and six symbols.
- **A picture of the score inside a PDF.** Simple, but blurry in print, and large.
- **Embedding Bravura in the PDF.** Faithful, but it adds about 500 KB to every file, and a correct font embedding (subset, descriptors, encoding) is more code than drawing the outlines.

## Decision

Write the PDF directly. `src/export/pdf-writer.js` is a minimal PDF 1.4 writer, and `src/export/score-pdf.js` draws the output of `layoutScore` with it: strokes and polygons for lines and beams, and the outlines of the six Bravura glyphs the score uses, stored as path data in `src/export/glyph-outlines.js`. Words are set in Times, which every PDF viewer has built in, so nothing is embedded. The outlines are extracted once, at development time, by `scripts/extract-glyph-outlines.mjs`, which is our own reader of the font format and checks every outline against Bravura's metadata.

The print dialog stays available as the **Print** button, with page breaks between systems.

## Consequences

- No dependency, and the export works offline and on GitHub Pages. Nothing is uploaded.
- Files are small (about 14 to 50 KB) and sharp at any size.
- The exporter is pure, so it is tested in Node like the rest of the core.
- There are now two renderers. Anything drawn differently in `draw.js` must be drawn differently in `score-pdf.js` too. Both read the same layout, which keeps the duplication to drawing calls.
- The PDF's lettering is Times, not the page's Playfair Display and EB Garamond. Matching it would mean embedding fonts.
- A new notation glyph means adding it to the extraction script and regenerating the outlines.
- Only the characters of Windows-1252 can be written as text. That covers everything `describe.js` produces except the sharp sign in a written range ("G♯5"), which the PDF writes as "#".
- If the notation grows much beyond this (several voices, many more glyphs), embedding the font or adopting a library becomes the better choice and this record should be superseded.
