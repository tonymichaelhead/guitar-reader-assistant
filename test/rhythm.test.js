import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAR, BEAT, allowedCells, barSlots, musicalRhythm, randomRhythm } from '../src/music/rhythm.js';
import { mulberry32 } from '../src/music/rng.js';
import { DURATION, allNotes, scoreWith, seeds } from './helpers.js';

const COMBINATIONS = [
  ['quarter'], ['eighth'], ['sixteenth'],
  ['quarter', 'eighth'], ['quarter', 'sixteenth'], ['eighth', 'sixteenth'],
  ['quarter', 'eighth', 'sixteenth']
];

test('every cell fills exactly one beat with enabled values only', () => {
  for (const noteValues of COMBINATIONS) {
    const enabled = noteValues.map(v => DURATION[v]);
    for (const cell of allowedCells(noteValues)) {
      assert.equal(cell.durs.reduce((a, b) => a + b, 0), BEAT);
      assert.ok(cell.durs.every(d => enabled.includes(d)));
    }
  }
});

test('mixed eighth-and-sixteenth cells need both values enabled', () => {
  const mixed = cells => cells.filter(c => new Set(c.durs).size > 1).length;
  assert.equal(mixed(allowedCells(['eighth', 'sixteenth'])), 2);
  assert.equal(mixed(allowedCells(['quarter', 'sixteenth'])), 0);
  assert.equal(mixed(allowedCells(['quarter', 'eighth'])), 0);
});

test('slots tile the measure without gaps', () => {
  const rhythm = randomRhythm(['quarter', 'eighth', 'sixteenth'], 16, mulberry32(7));
  for (const bar of rhythm) {
    let expected = 0;
    for (const slot of barSlots(bar)) {
      assert.equal(slot.start, expected);
      expected += slot.dur;
    }
    assert.equal(expected, BAR);
  }
});

for (const melody of ['random', 'musical']) {
  test(`${melody}: every measure lasts four beats in enabled values, for each combination`, () => {
    for (const noteValues of COMBINATIONS) {
      const enabled = noteValues.map(v => DURATION[v]);
      for (const seed of seeds(10)) {
        const score = scoreWith({ melody, noteValues }, seed);
        assert.equal(score.measures.length, 16);
        for (const m of score.measures) {
          assert.equal(m.notes.reduce((sum, n) => sum + n.dur, 0), BAR);
          assert.ok(m.notes.every(n => enabled.includes(n.dur)));
          // No note crosses a beat.
          assert.ok(m.notes.every(n => Math.floor(n.start / BEAT) === Math.floor((n.start + n.dur - 1) / BEAT)));
        }
      }
    }
  });

  test(`${melody}: a single enabled value is used for every note`, () => {
    for (const value of ['quarter', 'eighth', 'sixteenth']) {
      const notes = allNotes(scoreWith({ melody, noteValues: [value] }, 5));
      assert.ok(notes.every(n => n.dur === DURATION[value]));
      assert.equal(notes.length, 16 * (BAR / DURATION[value]));
    }
  });

  test(`${melody}: when several values are enabled, all of them appear`, () => {
    for (const noteValues of COMBINATIONS.filter(c => c.length > 1)) {
      for (const seed of seeds(40)) {
        const used = new Set(allNotes(scoreWith({ melody, noteValues }, seed)).map(n => n.dur));
        assert.equal(used.size, noteValues.length, `${noteValues} seed ${seed}`);
      }
    }
  });
}

test('musical rhythm reuses its motifs and rests on the longest value at cadences', () => {
  for (const seed of seeds(20)) {
    const rhythm = musicalRhythm(['quarter', 'eighth', 'sixteenth'], 16, 4, mulberry32(seed));
    // The first two measures of every phrase are the same two motifs.
    for (const first of [4, 8, 12]) {
      assert.deepEqual(rhythm[first], rhythm[0]);
      assert.deepEqual(rhythm[first + 1], rhythm[1]);
    }
    // Phrase endings and the final measure end on a quarter note.
    for (const closing of [3, 7, 11, 15]) assert.deepEqual(rhythm[closing][3], [4]);
    assert.deepEqual(rhythm[15][2], [4]);
  }
});
