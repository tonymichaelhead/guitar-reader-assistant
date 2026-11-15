// The note map: every note of each enabled position on a staff, with the
// left-hand finger that plays it. A reference view, not an exercise.
import { ROMAN, poolFor } from '../music/fretboard.js';
import { pitchName } from '../music/pitch.js';
import { drawClef, drawNote, drawStaff } from './draw.js';
import { SPACE as S } from './glyphs.js';
import { PAGE, placeNote, singleStem } from './layout.js';
import { el } from './svg.js';
import { attachTooltip, hideTooltip } from './tooltip.js';

const COLUMN = 4.4 * S;       // ideal width per note
const MIN_ROOM = 2.6 * S;     // least space kept above and below every staff
const LABEL_BELOW = 2.1 * S;  // finger number under a stem-up note
const LABEL_ABOVE = 1.5 * S;  // ... and over a stem-down note

// One row of notes on a staff whose bottom line is at y = 0, with how far its
// ink reaches above and below.
function buildRow(pitches) {
  let above = -4 * S; // the top staff line
  let below = 0;
  const notes = pitches.map(pitch => {
    const note = placeNote(pitch, 0, 0, pitch.alter === 0 ? null : 'sharp');
    note.stem = singleStem(note, 0);
    // Finger numbers go on the notehead side, but always clear of the staff lines.
    note.labelY = note.stem.up
      ? Math.max(note.y + LABEL_BELOW, 1.9 * S)
      : Math.min(note.y - LABEL_ABOVE, -4 * S - 0.9 * S);
    above = Math.min(above, note.stem.up ? note.stem.y2 : note.labelY - 1.1 * S, note.y - 1.5 * S);
    below = Math.max(below, note.stem.up ? note.labelY + 0.4 * S : note.stem.y2, note.y + S);
    return note;
  });
  return { notes, headroom: Math.max(MIN_ROOM, -4 * S - above + 0.6 * S), footroom: Math.max(MIN_ROOM, below + 0.6 * S) };
}

function drawPosition(pool, viewWidth) {
  const startX = PAGE.left + PAGE.clefWidth + 0.6 * S;
  const usable = viewWidth - PAGE.right - startX;
  // As many notes per row as fit, then evened out so the last row is not a stub.
  const fits = Math.max(4, Math.min(14, Math.floor(usable / COLUMN)));
  const perRow = Math.ceil(pool.length / Math.ceil(pool.length / fits));
  const columnWidth = usable / fits;

  const svg = el('svg', { role: 'img' });
  let y = 0;
  for (let i = 0; i < pool.length; i += perRow) {
    const row = buildRow(pool.slice(i, i + perRow));
    const top = y + row.headroom;
    const bottom = top + 4 * S;
    drawStaff(svg, PAGE.left, viewWidth - PAGE.right, top);
    drawClef(svg, PAGE.left + 0.45 * S, bottom);
    row.notes.forEach((note, j) => {
      const dx = startX + columnWidth * (j + 0.5);
      const placed = {
        ...note,
        x: dx,
        y: note.y + bottom,
        ledgers: note.ledgers.map(v => v + bottom),
        stem: { ...note.stem, x: note.stem.x + dx, y1: note.stem.y1 + bottom, y2: note.stem.y2 + bottom }
      };
      attachTooltip(drawNote(svg, placed), note.pitch);
      const fingers = [...new Set(note.pitch.fingerings.map(f => f.finger))].sort();
      svg.appendChild(el('text', {
        class: 'map-finger', x: dx, y: note.labelY + bottom, 'text-anchor': 'middle'
      }, fingers.join('/')));
    });
    y = bottom + row.footroom;
  }
  svg.setAttribute('viewBox', `0 0 ${viewWidth} ${y}`);
  return svg;
}

export function renderNoteMap(settings, container, viewWidth) {
  const sections = settings.positions.map(position => {
    const pool = poolFor(position, settings);
    const section = document.createElement('section');
    section.className = 'map-section';

    const heading = document.createElement('h3');
    heading.textContent = `Position ${ROMAN[position]}`;
    const range = document.createElement('span');
    range.textContent =
      `${pitchName(pool[0])}–${pitchName(pool[pool.length - 1])} as written · ${pool.length} notes`;
    heading.appendChild(range);

    const svg = drawPosition(pool, viewWidth);
    svg.setAttribute('aria-label', `Notes of position ${ROMAN[position]} with left-hand fingerings`);
    section.append(heading, svg);
    return section;
  });
  container.replaceChildren(...sections);
  hideTooltip();
}
