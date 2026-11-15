import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spell } from '../src/music/pitch.js';
import { METRICS, SPACE } from '../src/render/glyphs.js';
import {
  PAGE, beamGroups, layoutScore, placeNote, resolveAccidentals, singleStem, viewWidthFor
} from '../src/render/layout.js';
import { scoreWith, seeds } from './helpers.js';

const HEAD = METRICS.noteheadWidth * SPACE;
const note = (value, prefer) => ({ pitch: spell(value, prefer) });
const systemNotes = system => system.bars.flatMap(bar => bar.notes);

const DENSE = { noteValues: ['sixteenth'], accidentals: true };
const VARIED = [
  {},
  { noteValues: ['eighth'] },
  DENSE,
  { noteValues: ['quarter', 'eighth', 'sixteenth'], accidentals: true, melody: 'musical' },
  { noteValues: ['eighth', 'sixteenth'], positions: [1, 7, 12], rotatePositions: true }
];
const WIDTHS = [480, 640, 800, 960];

test('an accidental is written once per measure, and cancelled with a natural', () => {
  // F#4, F#4, F4, G4, Gb4 (same line as G), G4
  const notes = [note(54), note(54), note(53), note(55), note(54, 'flat'), note(55)];
  assert.deepEqual(resolveAccidentals(notes), ['sharp', null, 'natural', null, 'flat', 'natural']);
});

test('an accidental applies only to its own octave', () => {
  assert.deepEqual(resolveAccidentals([note(54), note(66), note(54)]), ['sharp', 'sharp', null]);
});

test('notes are placed by staff step, with ledger lines outside the staff', () => {
  const bottom = 100;
  assert.equal(placeNote(spell(52), 0, bottom).y, bottom);                 // E4, bottom line
  assert.equal(placeNote(spell(65), 0, bottom).y, bottom - 4 * SPACE);     // F5, top line
  assert.deepEqual(placeNote(spell(59), 0, bottom).ledgers, []);           // B4, inside
  assert.deepEqual(placeNote(spell(48), 0, bottom).ledgers, [bottom + SPACE]);      // C4
  assert.equal(placeNote(spell(40), 0, bottom).ledgers.length, 3);         // E3
  assert.deepEqual(placeNote(spell(69), 0, bottom).ledgers, [bottom - 5 * SPACE]);  // A5
});

test('single stems point up below the middle line and down from it upward', () => {
  const bottom = 100;
  assert.equal(singleStem(placeNote(spell(57), 0, bottom), bottom).up, true);   // A4
  assert.equal(singleStem(placeNote(spell(59), 0, bottom), bottom).up, false);  // B4, middle line
  // A low ledger note's stem reaches the middle line.
  const lowE = placeNote(spell(40), 0, bottom);
  assert.equal(singleStem(lowE, bottom).y2, bottom - 2 * SPACE);
});

test('beam groups hold the eighths and sixteenths of one beat', () => {
  const durs = [4, 2, 2, 1, 1, 2, 1, 1, 1, 1];
  let start = 0;
  const notes = durs.map(dur => {
    const n = { start, dur };
    start += dur;
    return n;
  });
  assert.deepEqual(beamGroups(notes).map(g => g.map(n => n.dur)), [[2, 2], [1, 1, 2], [1, 1, 1, 1]]);
});

test('layout width follows the container within limits', () => {
  assert.equal(viewWidthFor(0), PAGE.minWidth);
  assert.equal(viewWidthFor(320), PAGE.minWidth);
  assert.equal(viewWidthFor(2000), PAGE.maxWidth);
  assert.ok(viewWidthFor(600) > PAGE.minWidth && viewWidthFor(600) < PAGE.maxWidth);
});

test('every measure is laid out exactly once, four, two or one to a system', () => {
  for (const overrides of VARIED) {
    for (const width of WIDTHS) {
      const layout = layoutScore(scoreWith(overrides, 3), width);
      assert.ok([4, 2, 1].includes(layout.perSystem));
      const numbers = layout.systems.flatMap(s => s.bars.map(b => b.number));
      assert.deepEqual(numbers, Array.from({ length: 16 }, (_, i) => i + 1));
      assert.ok(layout.systems.every(s => s.bars.length === layout.perSystem));
    }
  }
});

test('quarter notes fit four measures to a system at full width', () => {
  assert.equal(layoutScore(scoreWith({}, 1), PAGE.maxWidth).perSystem, 4);
});

test('systems fill the width and nothing spills past the right margin', () => {
  for (const overrides of VARIED) {
    for (const width of WIDTHS) {
      const layout = layoutScore(scoreWith(overrides, 5), width);
      for (const system of layout.systems) {
        assert.ok(Math.abs(system.staffEnd - (layout.width - PAGE.right)) < 0.01);
        assert.ok(system.bars.every(bar => bar.x1 <= layout.width - PAGE.right + 0.01));
      }
    }
  }
});

test('noteheads never overlap, even dense sixteenths on a narrow screen', () => {
  for (const overrides of VARIED) {
    for (const width of WIDTHS) {
      for (const seed of seeds(5)) {
        const layout = layoutScore(scoreWith(overrides, seed), width);
        for (const system of layout.systems) {
          const notes = systemNotes(system);
          for (let i = 1; i < notes.length; i++) {
            const gap = notes[i].x - notes[i - 1].x;
            assert.ok(gap >= HEAD, `gap ${gap.toFixed(1)} at width ${width}`);
            // An accidental needs its own room on top of that.
            if (notes[i].accidental) assert.ok(gap >= HEAD + SPACE, `accidental gap ${gap.toFixed(1)}`);
          }
        }
      }
    }
  }
});

test('the first note of a measure clears the barline before it', () => {
  const layout = layoutScore(scoreWith(DENSE, 2), 960);
  for (const system of layout.systems) {
    for (const bar of system.bars) {
      const first = bar.notes[0];
      assert.ok(first.x - bar.x0 >= HEAD / 2 + (first.accidental ? SPACE : 0.5 * SPACE));
    }
  }
});

test('every note has a stem; beamed stems end on their beam and are long enough', () => {
  for (const seed of seeds(10)) {
    const score = scoreWith({ noteValues: ['quarter', 'eighth', 'sixteenth'], accidentals: true }, seed);
    const layout = layoutScore(score, 960);
    for (const system of layout.systems) {
      for (const bar of system.bars) {
        for (const n of bar.notes) {
          const length = Math.abs(n.stem.y2 - n.y);
          assert.ok(length >= 3.2 * SPACE, `stem ${length.toFixed(1)}`);
          assert.equal(n.stem.up, n.stem.y2 < n.y);
        }
        // Notes of one beam group share a stem direction.
        for (const group of beamGroups(bar.notes)) {
          assert.equal(new Set(group.map(n => n.stem.up)).size, 1);
        }
        // Beams never slant by more than one staff space.
        for (const beam of bar.beams) assert.ok(Math.abs(beam.y2 - beam.y1) <= SPACE + 0.5);
      }
    }
  }
});

test('one primary beam per group, plus one secondary beam per run of sixteenths', () => {
  const score = scoreWith({ noteValues: ['eighth', 'sixteenth'] }, 11);
  const layout = layoutScore(score, 960);
  for (const system of layout.systems) {
    for (const bar of system.bars) {
      let expected = 0;
      for (const group of beamGroups(bar.notes)) {
        expected += 1;
        if (group.some(n => n.dur === 1)) expected += 1;
      }
      assert.equal(bar.beams.length, expected);
    }
  }
});

test('position marks appear at the start and wherever the position changes', () => {
  const fixed = layoutScore(scoreWith({ positions: [7] }, 1), 960);
  const marks = layout => layout.systems.flatMap(s => s.bars.filter(b => b.showPosition).map(b => b.number));
  assert.deepEqual(marks(fixed), [1]);
  const rotating = layoutScore(scoreWith({ positions: [1, 5, 9], rotatePositions: true }, 1), 960);
  assert.equal(marks(rotating).length, 16);
});

test('position marks sit above everything in their system', () => {
  for (const seed of seeds(10)) {
    const score = scoreWith({ positions: [12], noteValues: ['eighth', 'sixteenth'], accidentals: true }, seed);
    for (const system of layoutScore(score, 960).systems) {
      for (const n of systemNotes(system)) {
        assert.ok(system.markY < n.y - 0.5 * SPACE);
        assert.ok(system.markY < n.stem.y2);
      }
      assert.ok(system.markY > system.top - PAGE.systemTop + SPACE, 'mark stays on the page');
    }
  }
});

test('only the last measure gets the final barline', () => {
  const layout = layoutScore(scoreWith({}, 1), 960);
  const finals = layout.systems.flatMap(s => s.bars.filter(b => b.final).map(b => b.number));
  assert.deepEqual(finals, [16]);
});
