// Engraving geometry. Pure functions: a Score goes in, coordinates come out,
// and nothing here touches the DOM (so it can be unit-tested in Node).
// Rules and sources are written up in docs/engraving.md.
import { staffStep } from '../music/pitch.js';
import { METRICS, SPACE as S } from './glyphs.js';

export const PAGE = {
  left: 16,
  right: 16,
  clefWidth: 3.7 * S,
  timeWidth: 2.5 * S,
  systemTop: 8.5 * S,      // headroom above the first staff for ledger notes and markings
  systemGap: 17 * S,       // from one staff's top line to the next
  bottom: 6.5 * S,
  minWidth: 480,
  maxWidth: 960
};

// Horizontal space a note takes, by duration in sixteenths (Gould's table).
const ADVANCE = { 1: 2.0 * S, 2: 2.5 * S, 4: 3.5 * S };
const BAR_LEAD = 1.4 * S;          // barline to the centre of the first notehead
const FINAL_BAR_EXTRA = 0.9 * S;   // room for the thin-thick final barline
const ACCIDENTAL_FIRST = 0.8 * S;  // extra room for an accidental on a measure's first note
const ACCIDENTAL_TIGHT = 0.85 * S; // ... or after an eighth or sixteenth
const MIN_STRETCH = 0.8;           // how far note spacing may be squeezed to fit a system
const SHORT_SYSTEM_STRETCH = 1.25; // a short last system is not stretched to full width

const HEAD = METRICS.noteheadWidth * S;
const STEM = METRICS.stem * S;
const STEM_LENGTH = 3.5 * S;
const BEAMED_STEM = 3.25 * S;      // shortest stem in a group of eighths
const BEAMED_STEM_16 = 3.75 * S;   // ... and in a group with sixteenths (2.5 to the inner beam)
const MAX_SLANT = 1 * S;
const MIDDLE_STEP = 4;             // the middle staff line, in steps above the bottom line

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Layout width (in SVG units) for a container of the given pixel width: full
// size on wide screens, fewer and larger measures per line on narrow ones.
export const viewWidthFor = containerPx =>
  clamp(Math.round(containerPx * 1.1), PAGE.minWidth, PAGE.maxWidth);

// Which accidental sign each note of a measure needs. A sign stays in force
// for that line or space until the barline, so repeats are not re-marked and a
// return to the natural note needs a natural sign.
export function resolveAccidentals(notes) {
  const inForce = new Map();
  return notes.map(({ pitch }) => {
    const key = pitch.letter + pitch.octave;
    if (pitch.alter === (inForce.get(key) || 0)) return null;
    inForce.set(key, pitch.alter);
    return pitch.alter === 1 ? 'sharp' : pitch.alter === -1 ? 'flat' : 'natural';
  });
}

// A notehead on a staff whose bottom line is at `bottom`: its height and the
// ledger lines it needs.
export function placeNote(pitch, x, bottom, accidental = null) {
  const steps = staffStep(pitch);
  const ledgers = [];
  for (let k = -2; k >= steps; k -= 2) ledgers.push(bottom - k * (S / 2));
  for (let k = 10; k <= steps; k += 2) ledgers.push(bottom - k * (S / 2));
  return { pitch, accidental, x, y: bottom - steps * (S / 2), steps, ledgers };
}

const stemX = (note, up) => note.x + (up ? 1 : -1) * (HEAD / 2 - STEM / 2);
const stemStart = (note, up) => note.y + (up ? -1 : 1) * METRICS.stemAttachY * S;

// Stem for an unbeamed note: up below the middle line, down on or above it,
// one octave long, and reaching at least the middle line for ledger notes.
export function singleStem(note, bottom) {
  const middle = bottom - MIDDLE_STEP * (S / 2);
  const up = note.steps < MIDDLE_STEP;
  const tip = up ? Math.min(note.y - STEM_LENGTH, middle) : Math.max(note.y + STEM_LENGTH, middle);
  return { up, x: stemX(note, up), y1: stemStart(note, up), y2: tip };
}

// Notes that share a beam: the eighths and sixteenths of one beat.
export function beamGroups(notes) {
  const groups = new Map();
  for (const note of notes) {
    if (note.dur >= 4) continue;
    const beat = Math.floor(note.start / 4);
    if (!groups.has(beat)) groups.set(beat, []);
    groups.get(beat).push(note);
  }
  return [...groups.values()].filter(g => g.length > 1);
}

// Stems and beams for one group. Mutates each note's `stem`; returns the beams
// as { x1, y1, x2, y2, thickness } where thickness is signed toward the heads.
function beamGroup(notes, bottom) {
  const middle = bottom - MIDDLE_STEP * (S / 2);
  const above = Math.max(...notes.map(n => n.steps - MIDDLE_STEP));
  const below = Math.max(...notes.map(n => MIDDLE_STEP - n.steps));
  const up = below > above; // the note furthest from the middle line decides; ties go down
  const first = notes[0];
  const last = notes[notes.length - 1];
  const x1 = stemX(first, up);
  const x2 = stemX(last, up);

  // Slant follows the outer notes, gently, and goes flat when an inner note
  // pokes closer to the beam than both ends.
  let slant = clamp((last.y - first.y) / 2, -MAX_SLANT, MAX_SLANT);
  const inner = notes.slice(1, -1);
  const concave = inner.some(n =>
    (up ? n.y < Math.min(first.y, last.y) : n.y > Math.max(first.y, last.y)));
  if (concave) slant = 0;
  const slope = slant / (x2 - x1);

  // Put the beam as close as the shortest allowed stem permits, and no nearer
  // to far ledger notes than the middle line.
  const shortest = notes.some(n => n.dur === 1) ? BEAMED_STEM_16 : BEAMED_STEM;
  const limits = notes.flatMap(n => {
    const run = slope * (stemX(n, up) - x1);
    return up ? [n.y - shortest - run, middle - run] : [n.y + shortest - run, middle - run];
  });
  const base = up ? Math.min(...limits) : Math.max(...limits);
  const beamY = x => base + slope * (x - x1);

  for (const n of notes) {
    const x = stemX(n, up);
    n.stem = { up, x, y1: stemStart(n, up), y2: beamY(x) };
  }

  const toward = up ? 1 : -1; // beams thicken, and stack, toward the noteheads
  const thickness = toward * METRICS.beam * S;
  const beams = [{
    x1: x1 - STEM / 2, y1: beamY(x1 - STEM / 2),
    x2: x2 + STEM / 2, y2: beamY(x2 + STEM / 2),
    thickness
  }];

  // Secondary beam over each run of sixteenths; a lone sixteenth gets a stub
  // pointing into the group.
  const offset = toward * (METRICS.beam + METRICS.beamGap) * S;
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].dur !== 1) continue;
    let j = i;
    while (j + 1 < notes.length && notes[j + 1].dur === 1) j++;
    let from = stemX(notes[i], up) - STEM / 2;
    let to = stemX(notes[j], up) + STEM / 2;
    if (i === j) {
      if (i === notes.length - 1) from = to - 1.2 * S;
      else to = from + 1.2 * S;
    }
    beams.push({ x1: from, y1: beamY(from) + offset, x2: to, y2: beamY(to) + offset, thickness });
    i = j;
  }
  return beams;
}

// Natural (unstretched) spacing of one measure: `fixed` space that never
// stretches, `flex` space that does, and each note's share of both.
function measureSpacing(measure, isFinal) {
  const accidentals = resolveAccidentals(measure.notes);
  let fixed = BAR_LEAD;
  let flex = 0;
  const marks = measure.notes.map((note, i) => {
    if (accidentals[i]) {
      if (i === 0) fixed += ACCIDENTAL_FIRST;
      else if (measure.notes[i - 1].dur < 4) fixed += ACCIDENTAL_TIGHT;
    }
    const mark = { note, accidental: accidentals[i], fixed, flex };
    flex += ADVANCE[note.dur];
    return mark;
  });
  if (isFinal) fixed += FINAL_BAR_EXTRA;
  return { measure, marks, fixed, flex };
}

const availableWidth = (viewWidth, systemIndex) =>
  viewWidth - PAGE.left - PAGE.right - PAGE.clefWidth - (systemIndex === 0 ? PAGE.timeWidth : 0);

// The same number of measures on every system - four, two or one - so that
// systems line up with phrases. The largest count that fits everywhere wins.
function measuresPerSystem(spacings, viewWidth) {
  for (const count of [4, 2]) {
    let fits = true;
    for (let i = 0, s = 0; i < spacings.length; i += count, s++) {
      const chunk = spacings.slice(i, i + count);
      const fixed = chunk.reduce((sum, b) => sum + b.fixed, 0);
      const flex = chunk.reduce((sum, b) => sum + b.flex, 0);
      if (fixed + MIN_STRETCH * flex > availableWidth(viewWidth, s)) fits = false;
    }
    if (fits) return count;
  }
  return 1;
}

export function layoutScore(score, requestedWidth) {
  const total = score.measures.length;
  const spacings = score.measures.map((m, i) => measureSpacing(m, i === total - 1));
  // If even one measure per system would be squeezed past the limit (dense
  // sixteenths on a phone), widen the drawing instead: the notation renders
  // smaller, but notes never collide.
  const widest = Math.max(...spacings.map(b => b.fixed + MIN_STRETCH * b.flex));
  const viewWidth = Math.max(
    requestedWidth,
    Math.ceil(widest + PAGE.left + PAGE.right + PAGE.clefWidth + PAGE.timeWidth));
  const perSystem = measuresPerSystem(spacings, viewWidth);
  const systems = [];
  let previousPosition = null;

  for (let i = 0, s = 0; i < total; i += perSystem, s++) {
    const chunk = spacings.slice(i, i + perSystem);
    const top = PAGE.systemTop + s * PAGE.systemGap;
    const bottom = top + 4 * S;
    const startX = PAGE.left + PAGE.clefWidth + (s === 0 ? PAGE.timeWidth : 0);
    const fixed = chunk.reduce((sum, b) => sum + b.fixed, 0);
    const flex = chunk.reduce((sum, b) => sum + b.flex, 0);
    let stretch = (availableWidth(viewWidth, s) - fixed) / flex;
    if (chunk.length < perSystem) stretch = Math.min(stretch, SHORT_SYSTEM_STRETCH);

    let cursor = startX;
    let highest = top; // topmost ink of the system, to keep markings clear of it
    const bars = chunk.map(({ measure, marks, fixed: barFixed, flex: barFlex }) => {
      const x0 = cursor;
      const notes = marks.map(mark => ({
        ...placeNote(mark.note.pitch, x0 + mark.fixed + stretch * mark.flex, bottom, mark.accidental),
        start: mark.note.start,
        dur: mark.note.dur
      }));
      const beams = beamGroups(notes).flatMap(group => beamGroup(group, bottom));
      for (const n of notes) {
        if (!n.stem) n.stem = singleStem(n, bottom);
        highest = Math.min(highest, n.y - (n.accidental ? 1.5 * S : 0.6 * S), n.stem.y2);
      }
      cursor += barFixed + stretch * barFlex;
      const showPosition = measure.position !== previousPosition;
      previousPosition = measure.position;
      return {
        number: measure.number,
        position: measure.position,
        showPosition,
        final: measure.number === total,
        x0,
        x1: cursor,
        markX: notes[0].x,
        notes,
        beams
      };
    });

    systems.push({
      top,
      bottom,
      staffStart: PAGE.left,
      staffEnd: cursor,
      clefX: PAGE.left + 0.45 * S,
      timeX: s === 0 ? PAGE.left + PAGE.clefWidth + 0.9 * S : null,
      measureNumber: s === 0 ? null : chunk[0].measure.number,
      markY: Math.min(top - 2 * S, highest - 0.9 * S),
      bars
    });
  }

  const lastTop = systems[systems.length - 1].top;
  return { width: viewWidth, height: lastTop + 4 * S + PAGE.bottom, perSystem, systems };
}
