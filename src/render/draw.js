// Drawing primitives shared by the score and the note map. They only draw:
// every coordinate comes from layout.js.
import { GLYPH, GLYPH_SIZE, METRICS, SPACE as S } from './glyphs.js';
import { el } from './svg.js';

const HEAD = METRICS.noteheadWidth * S;

const glyph = (char, x, y, className, attrs = {}) =>
  el('text', { class: `glyph ${className}`, x, y, 'font-size': GLYPH_SIZE, ...attrs }, char);

const line = (className, x1, y1, x2, y2, width) =>
  el('line', { class: className, x1, y1, x2, y2, 'stroke-width': width });

export function drawStaff(svg, x1, x2, top) {
  for (let i = 0; i < 5; i++) {
    svg.appendChild(line('staff-line', x1, top + i * S, x2, top + i * S, METRICS.staffLine * S));
  }
}

// The G clef's baseline is the G line, second from the bottom.
export function drawClef(svg, x, bottom) {
  svg.appendChild(glyph(GLYPH.gClef, x, bottom - S, 'clef'));
}

// The signs of a key signature from layout.js: like an accidental, each is
// centred on its line or space, here with its left edge at `x`.
export function drawKeySignature(svg, signs) {
  for (const { sign, x, y } of signs) svg.appendChild(glyph(GLYPH[sign], x, y, 'keysig'));
}

// 4/4: each digit is two spaces tall and centred on its baseline.
export function drawTimeSignature(svg, x, top) {
  for (const y of [top + S, top + 3 * S]) {
    svg.appendChild(glyph(GLYPH.timeSig4, x, y, 'timesig', { 'text-anchor': 'middle' }));
  }
}

// `x` is the right-hand edge of the measure. The final barline is thin-thick.
export function drawBarline(svg, x, top, bottom, final = false) {
  const thin = METRICS.thinBarline * S;
  if (!final) {
    svg.appendChild(line('barline', x, top, x, bottom, thin));
    return;
  }
  const thick = METRICS.thickBarline * S;
  const thinX = x - thick - METRICS.barlineGap * S - thin / 2;
  svg.appendChild(line('barline', thinX, top, thinX, bottom, thin));
  svg.appendChild(line('barline', x - thick / 2, top, x - thick / 2, bottom, thick));
}

export function drawBeam(svg, { x1, y1, x2, y2, thickness }) {
  svg.appendChild(el('polygon', {
    class: 'beam',
    points: `${x1},${y1} ${x2},${y2} ${x2},${y2 + thickness} ${x1},${y1 + thickness}`
  }));
}

// A note from layout.js: ledger lines, notehead, accidental, stem and an
// invisible hit area. Returns the group so callers can attach behaviour.
export function drawNote(svg, note) {
  const group = el('g', { class: 'note' });
  const left = note.x - HEAD / 2;

  const reach = METRICS.ledgerExtension * S;
  for (const y of note.ledgers) {
    group.appendChild(line('ledger', left - reach, y, left + HEAD + reach, y, METRICS.ledger * S));
  }
  group.appendChild(glyph(GLYPH.noteheadBlack, left, note.y, 'notehead'));
  if (note.accidental) {
    group.appendChild(glyph(GLYPH[note.accidental], left - 0.25 * S, note.y, 'accidental', {
      'text-anchor': 'end'
    }));
  }
  if (note.stem) {
    const { x, y1, y2 } = note.stem;
    group.appendChild(line('stem', x, y1, x, y2, METRICS.stem * S));
  }
  group.appendChild(el('rect', {
    class: 'hit',
    x: note.x - 0.85 * S, y: note.y - 1.2 * S,
    width: 1.7 * S, height: 2.4 * S
  }));
  svg.appendChild(group);
  return group;
}
