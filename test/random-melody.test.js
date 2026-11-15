import assert from 'node:assert/strict';
import { test } from 'node:test';
import { poolFor } from '../src/music/fretboard.js';
import { diatonicIndex } from '../src/music/pitch.js';
import { allNotes, scoreWith, seeds } from './helpers.js';

test('random mode stays in the pool of each measure', () => {
  for (const seed of seeds(20)) {
    const score = scoreWith({ positions: [1, 5, 9], rotatePositions: true, strings: [5, 4, 3] }, seed);
    for (const m of score.measures) {
      const allowed = new Set(poolFor(m.position, score.settings).map(p => p.value));
      assert.ok(m.notes.every(n => allowed.has(n.pitch.value)));
    }
  }
});

test('random mode without accidentals writes natural notes only', () => {
  for (const seed of seeds(20)) {
    assert.ok(allNotes(scoreWith({}, seed)).every(n => n.pitch.alter === 0));
  }
});

test('random mode with accidentals mixes in sharps, spelled as sharps', () => {
  const notes = seeds(20).flatMap(seed => allNotes(scoreWith({ accidentals: true }, seed)));
  assert.ok(notes.some(n => n.pitch.alter === 1));
  assert.ok(notes.every(n => n.pitch.alter >= 0));
});

test('random mode keeps the original shaping: no repeats, leaps within the limit', () => {
  for (const seed of seeds(40)) {
    const score = scoreWith({ noteValues: ['quarter', 'eighth'] }, seed);
    const notes = allNotes(score);
    for (let i = 1; i < notes.length; i++) {
      const leap = Math.abs(diatonicIndex(notes[i].pitch) - diatonicIndex(notes[i - 1].pitch));
      assert.notEqual(notes[i].pitch.value, notes[i - 1].pitch.value);
      assert.ok(leap <= score.settings.maxLeapSteps);
    }
  }
});

test('random mode uses the whole pool', () => {
  const pool = poolFor(5, { accidentals: false, strings: [6, 5, 4, 3, 2, 1] });
  const used = new Set(seeds(20).flatMap(seed => allNotes(scoreWith({}, seed)).map(n => n.pitch.value)));
  assert.equal(used.size, pool.length);
});

test('the same seed and settings give the same score; another seed does not', () => {
  const settings = { noteValues: ['quarter', 'eighth', 'sixteenth'], accidentals: true };
  assert.deepEqual(scoreWith(settings, 42), scoreWith(settings, 42));
  assert.notDeepEqual(scoreWith(settings, 42), scoreWith(settings, 43));
});
