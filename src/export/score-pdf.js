// Draws a Score as a vector PDF: the second renderer. It draws the same
// layoutScore output as ../render/draw.js and ../render/score.js, element for
// element, onto pages instead of into SVG, so a change to how something is
// drawn there almost always needs the same change here.
//
// No position is re-derived. Layout units (y down) become PDF points (y up)
// through one uniform scale. The notation glyphs are Bravura's outlines, which
// already have their y axis up and their origin on the baseline; the words are
// set in the Times faces every PDF viewer has built in.
//
// Pure and deterministic: no DOM, no clock, no randomness. The same score and
// text always give the same bytes.
import { ROMAN } from '../music/fretboard.js';
import { GLYPH_SIZE, METRICS, SPACE as S } from '../render/glyphs.js';
import { PAGE, layoutScore } from '../render/layout.js';
import { OUTLINES, UNITS_PER_EM } from './glyph-outlines.js';
import { createPdf, textWidth } from './pdf-writer.js';

// Portrait pages, in points.
export const PAGE_SIZES = { letter: [612, 792], a4: [595.28, 841.89] };

const MARGIN = { left: 40, right: 40, top: 44, bottom: 40 };

// The title block: baselines (and the ornament's centre) in points below the
// top margin, and the height the block takes before the first system's slot.
const TITLE_BLOCK = { dedication: 8, title: 33, ornament: 45, lines: 64, meta: 77, height: 84 };
const TITLE_GAP = 10;  // between the title and the number that follows it
const LINES_GAP = 14;  // the least space between the left and the right line

// A thin double rule with a small diamond at its centre.
const ORNAMENT = { halfWidth: 90, diamond: 3, gap: 5, spread: 2.6, weight: 0.5 };

// The plate line stands just above the bottom margin, so that the descenders
// of "page" stay inside it; the music keeps `height` clear above the margin.
const FOOTER = { baseline: 2, height: 18 };

const TYPE = {
  dedication: { font: 'Times-Italic', size: 10 },
  title: { font: 'Times-Roman', size: 22, charSpacing: 3 },
  number: { font: 'Times-Italic', size: 14 },
  left: { font: 'Times-BoldItalic', size: 11 },
  right: { font: 'Times-Roman', size: 10 },
  meta: { font: 'Times-Roman', size: 8.5 },
  plate: { font: 'Times-Roman', size: 7, charSpacing: 1.5 }
};

// Words inside the notation, sized in layout units as in styles/score.css.
const POSITION_MARK = { font: 'Times-Bold', size: 17 };
const MEASURE_NUMBER = { font: 'Times-Italic', size: 13 };

// How far those words rise above their baseline, in ems: the capitals of a
// Roman numeral reach 0.68 in Times-Bold, and no figure of Times-Italic passes
// 0.69. Neither has a descender to allow for.
const TEXT_RISE = 0.7;

const HEAD = METRICS.noteheadWidth * S;
const GLYPH_UNIT = GLYPH_SIZE / UNITS_PER_EM; // layout units per font unit
const SLOT_DEPTH = PAGE.systemGap - PAGE.systemTop; // top staff line to the foot of the slot

// SVG's text-anchor, which the drawing calls below keep so that they read like
// draw.js: the share of its own advance a glyph or a word is moved left by.
const ANCHOR_SHIFT = { start: 0, middle: 0.5, end: 1 };
const ANCHOR_ALIGN = { start: 'left', middle: 'center', end: 'right' };

const TEXT_KEYS = ['dedication', 'title', 'number', 'left', 'right', 'meta', 'plate'];

// ---- One system, as draw.js and score.js draw it --------------------------
// Each function takes a pen, which receives the drawing calls in layout units.

function drawStaff(pen, x1, x2, top) {
  for (let i = 0; i < 5; i++) pen.line(x1, top + i * S, x2, top + i * S, METRICS.staffLine * S);
}

// The G clef's baseline is the G line, second from the bottom.
function drawClef(pen, x, bottom) {
  pen.glyph('gClef', x, bottom - S);
}

// 4/4: each digit is two spaces tall and centred on its baseline.
function drawTimeSignature(pen, x, top) {
  for (const y of [top + S, top + 3 * S]) pen.glyph('timeSig4', x, y, 'middle');
}

// `x` is the right-hand edge of the measure. The final barline is thin-thick.
function drawBarline(pen, x, top, bottom, final) {
  const thin = METRICS.thinBarline * S;
  if (!final) {
    pen.line(x, top, x, bottom, thin);
    return;
  }
  const thick = METRICS.thickBarline * S;
  const thinX = x - thick - METRICS.barlineGap * S - thin / 2;
  pen.line(thinX, top, thinX, bottom, thin);
  pen.line(x - thick / 2, top, x - thick / 2, bottom, thick);
}

function drawBeam(pen, { x1, y1, x2, y2, thickness }) {
  pen.polygon([[x1, y1], [x2, y2], [x2, y2 + thickness], [x1, y1 + thickness]]);
}

// Ledger lines, notehead, accidental and stem. The notehead's left edge is at
// its origin; the accidental ends a quarter of a space before it.
function drawNote(pen, note) {
  const left = note.x - HEAD / 2;
  const reach = METRICS.ledgerExtension * S;
  for (const y of note.ledgers) pen.line(left - reach, y, left + HEAD + reach, y, METRICS.ledger * S);
  pen.glyph('noteheadBlack', left, note.y);
  if (note.accidental) pen.glyph(note.accidental, left - 0.25 * S, note.y, 'end');
  if (note.stem) pen.line(note.stem.x, note.stem.y1, note.stem.x, note.stem.y2, METRICS.stem * S);
}

function drawSystem(pen, system) {
  drawStaff(pen, system.staffStart, system.staffEnd, system.top);
  drawClef(pen, system.clefX, system.bottom);
  if (system.timeX !== null) drawTimeSignature(pen, system.timeX, system.top);
  if (system.measureNumber !== null) {
    pen.text(String(system.measureNumber), system.staffStart, system.top - 2 * S, MEASURE_NUMBER);
  }

  for (const bar of system.bars) {
    if (bar.showPosition) {
      pen.text(ROMAN[bar.position], bar.markX, system.markY, { ...POSITION_MARK, anchor: 'middle' });
    }
    for (const beam of bar.beams) drawBeam(pen, beam);
    for (const note of bar.notes) drawNote(pen, note);
    drawBarline(pen, bar.x1, system.top, system.bottom, bar.final);
  }
}

// ---- Pens -------------------------------------------------------------------
// There are two: one measures and one draws on a page. Both are handed the
// same calls, so what is measured is exactly what will be drawn.

// Draws nothing, and remembers how far up and down the ink reached.
function measuringPen() {
  let top = Infinity;
  let bottom = -Infinity;
  const cover = (y1, y2) => {
    top = Math.min(top, y1, y2);
    bottom = Math.max(bottom, y1, y2);
  };
  return {
    // A level line is as tall as it is thick; an upright one ends squarely.
    line(x1, y1, x2, y2, width) {
      const half = y1 === y2 ? width / 2 : 0;
      cover(Math.min(y1, y2) - half, Math.max(y1, y2) + half);
    },
    polygon(points) {
      for (const [, y] of points) cover(y, y);
    },
    glyph(name, x, y) {
      const [, low, , high] = OUTLINES[name].bbox; // font units, y up
      cover(y - high * GLYPH_UNIT, y - low * GLYPH_UNIT);
    },
    text(string, x, y, { size }) {
      cover(y - TEXT_RISE * size, y);
    },
    extent: () => ({ top, bottom })
  };
}

// Draws on a PDF page. `originY` is where layout y = 0 falls on the page, in
// points; layout y grows downward and the page's upward, hence the minus.
function pagePen(page, scale, originY) {
  const px = x => MARGIN.left + x * scale;
  const py = y => originY - y * scale;
  return {
    line(x1, y1, x2, y2, width) {
      page.line(px(x1), py(y1), px(x2), py(y2), width * scale);
    },
    polygon(points) {
      page.polygon(points.map(([x, y]) => [px(x), py(y)]));
    },
    // The outline is not flipped: its y axis already points up, like the
    // page's. Only its origin is placed.
    glyph(name, x, y, anchor = 'start') {
      const advance = OUTLINES[name].advance * GLYPH_UNIT;
      page.shape(name, px(x - ANCHOR_SHIFT[anchor] * advance), py(y), GLYPH_UNIT * scale);
    },
    text(string, x, y, { font, size, anchor = 'start' }) {
      page.text(string, px(x), py(y), { font, size: size * scale, align: ANCHOR_ALIGN[anchor] });
    }
  };
}

// ---- Pages ------------------------------------------------------------------

// How far a system's ink reaches above and below its top staff line.
function inkExtent(system) {
  const pen = measuringPen();
  drawSystem(pen, system);
  const { top, bottom } = pen.extent();
  return { rise: system.top - top, drop: bottom - system.top };
}

// Which systems go on which page, and where each one's top staff line falls.
// As on screen, every system has a slot of PAGE.systemGap with its top line
// PAGE.systemTop below the top of the slot. A system is never split: it goes
// to a new page when its slot would pass the page's floor. So does one whose
// ink would pass it: a rare low beam hangs out of its slot, which on screen
// only reaches into the headroom of the next system.
function paginate(systems, { scale, firstTop, laterTop, floor }) {
  const pages = [];
  let staffTop = 0;
  for (const system of systems) {
    const { rise, drop } = inkExtent(system);
    const page = pages[pages.length - 1];
    const next = staffTop - PAGE.systemGap * scale;
    if (page && next - Math.max(SLOT_DEPTH, drop) * scale >= floor) {
      staffTop = next;
      page.push({ system, staffTop });
    } else {
      // The first system of a page hangs from the top of the page's room. If
      // its ink ever rose out of its slot, the page starts lower instead.
      const pageTop = pages.length ? laterTop : firstTop;
      staffTop = pageTop - Math.max(PAGE.systemTop, rise) * scale;
      pages.push([{ system, staffTop }]);
    }
  }
  return pages;
}

// ---- Words ------------------------------------------------------------------

const widthOf = (string, { font, size, charSpacing = 0 }) =>
  textWidth(string, font, size, charSpacing);

// Sizes are cut, never rounded, to the three decimals a PDF number keeps, so
// that text shrunk to fit a width is not written a hair too wide.
const cut = value => Math.floor(value * 1000) / 1000;

// A type style reduced so that text `wide` points wide fits in `room`.
function shrunk(style, wide, room) {
  if (wide <= room) return style;
  const factor = room / wide;
  return { ...style, size: cut(style.size * factor), charSpacing: cut((style.charSpacing ?? 0) * factor) };
}

// The title in capitals with its number after it, the pair centred as a unit.
function drawTitle(page, title, number, { centre, y, room }) {
  const capitals = title.toUpperCase();
  const widthAt = (style, numberStyle) => {
    // Letter-spacing follows the last capital too, and is not part of the ink.
    const titleWidth = capitals ? widthOf(capitals, style) - style.charSpacing : 0;
    const gap = capitals && number ? TITLE_GAP * style.size / TYPE.title.size : 0;
    return { titleWidth, gap, total: titleWidth + gap + widthOf(number, numberStyle) };
  };
  const natural = widthAt(TYPE.title, TYPE.number).total;
  const style = shrunk(TYPE.title, natural, room);
  const numberStyle = shrunk(TYPE.number, natural, room);
  const { titleWidth, gap, total } = widthAt(style, numberStyle);
  const start = centre - total / 2;
  page.text(capitals, start, y, style);
  page.text(number, start + titleWidth + gap, y, numberStyle);
}

function drawOrnament(page, centre, y) {
  const { halfWidth, diamond, gap, spread, weight } = ORNAMENT;
  for (const side of [-1, 1]) {
    for (const rule of [y + spread / 2, y - spread / 2]) {
      page.line(centre + side * (diamond + gap), rule, centre + side * halfWidth, rule, weight);
    }
  }
  page.polygon([[centre - diamond, y], [centre, y + diamond], [centre + diamond, y], [centre, y - diamond]]);
}

// One line with `left` at the left margin and `right` at the right margin.
// If they would meet, both are reduced by the same amount, just enough.
function drawLines(page, left, right, { y, room, leftX, rightX }) {
  const wide = widthOf(left, TYPE.left) + widthOf(right, TYPE.right);
  const gap = left && right ? LINES_GAP : 0;
  page.text(left, leftX, y, shrunk(TYPE.left, wide, room - gap));
  page.text(right, rightX, y, { ...shrunk(TYPE.right, wide, room - gap), align: 'right' });
}

function drawTitleBlock(page, text, { top, leftX, rightX }) {
  const centre = (leftX + rightX) / 2;
  const room = rightX - leftX;
  const at = name => top - TITLE_BLOCK[name];
  page.text(text.dedication, centre, at('dedication'), {
    ...shrunk(TYPE.dedication, widthOf(text.dedication, TYPE.dedication), room),
    align: 'center'
  });
  drawTitle(page, text.title, text.number, { centre, y: at('title'), room });
  drawOrnament(page, centre, at('ornament'));
  drawLines(page, text.left, text.right, { y: at('lines'), room, leftX, rightX });
  page.text(text.meta, centre, at('meta'), {
    ...shrunk(TYPE.meta, widthOf(text.meta, TYPE.meta), room),
    align: 'center'
  });
}

// The plate line, and the page count once there is more than one page.
function drawFooter(page, plate, { number, count, leftX, rightX }) {
  const parts = count > 1 ? [plate, `page ${number} of ${count}`] : [plate];
  const label = parts.filter(Boolean).join(' · ');
  const style = shrunk(TYPE.plate, widthOf(label, TYPE.plate), rightX - leftX);
  // Half a letter-space to the right: the spacing after the last character
  // counts toward the width, and would pull the ink off centre.
  const centre = (leftX + rightX) / 2 + style.charSpacing / 2;
  page.text(label, centre, MARGIN.bottom + FOOTER.baseline, { ...style, align: 'center' });
}

// ---- The file ---------------------------------------------------------------

// The bytes of a complete PDF of the score. `text` holds the words around the
// music, as describeScore gives them: { dedication, title, number, left,
// right, meta, plate }. A missing one is simply not drawn.
export function scoreToPdf(score, { text = {}, pageSize = 'letter' } = {}) {
  if (!Object.hasOwn(PAGE_SIZES, pageSize)) throw new Error(`Unknown page size "${pageSize}"`);
  const [width, height] = PAGE_SIZES[pageSize];
  const words = Object.fromEntries(TEXT_KEYS.map(key => [key, String(text?.[key] ?? '')]));

  // The full-width layout of the screen, scaled to run from margin to margin.
  const layout = layoutScore(score, PAGE.maxWidth);
  const leftX = MARGIN.left;
  const rightX = width - MARGIN.right;
  const scale = (rightX - leftX) / layout.width;
  const top = height - MARGIN.top;

  const doc = createPdf({ title: [words.title, words.number].filter(Boolean).join(' ') });
  for (const [name, { d, bbox }] of Object.entries(OUTLINES)) doc.defineShape(name, d, bbox);

  const pages = paginate(layout.systems, {
    scale,
    firstTop: top - TITLE_BLOCK.height,
    laterTop: top,
    floor: MARGIN.bottom + FOOTER.height
  });
  pages.forEach((placed, i) => {
    const page = doc.addPage(width, height);
    if (i === 0) drawTitleBlock(page, words, { top, leftX, rightX });
    for (const { system, staffTop } of placed) {
      drawSystem(pagePen(page, scale, staffTop + system.top * scale), system);
    }
    drawFooter(page, words.plate, { number: i + 1, count: pages.length, leftX, rightX });
  });
  return doc.toBytes();
}
