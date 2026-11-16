import assert from 'node:assert/strict';
import { test } from 'node:test';
import { poolFor } from '../src/music/fretboard.js';
import { diatonicIndex, pitchName } from '../src/music/pitch.js';
import { allNotes, scoreWith, seeds } from './helpers.js';

const ACCIDENTALS = ['none', 'sharps', 'flats'];
const BLACK_KEYS = [1, 3, 6, 8, 10]; // pitch classes

test('random mode stays in the pool of each measure', () => {
  for (const accidentals of ACCIDENTALS) {
    for (const seed of seeds(20)) {
      const score = scoreWith({
        accidentals, positions: [1, 5, 9], rotatePositions: true, strings: [5, 4, 3],
        noteValues: ['quarter', 'eighth', 'sixteenth']
      }, seed);
      for (const m of score.measures) {
        const pool = poolFor(m.position, score.settings);
        for (const n of m.notes) {
          // The pool's own note: its spelling and its fingerings, nothing invented.
          assert.deepEqual(n.pitch, pool.find(p => p.value === n.pitch.value), `${accidentals} seed ${seed}`);
        }
      }
    }
  }
});

test('random mode has no key and no tonality, whatever the key setting says', () => {
  for (const accidentals of ACCIDENTALS) {
    const score = scoreWith({ accidentals, key: 'E' }, 5);
    assert.equal(score.key, null);
    assert.equal(score.tonality, null);
    assert.deepEqual(score.measures, scoreWith({ accidentals, key: 'Bb' }, 5).measures);
  }
});

test('random mode without accidentals writes natural notes only', () => {
  for (const seed of seeds(20)) {
    assert.ok(allNotes(scoreWith({}, seed)).every(n => n.pitch.alter === 0));
  }
});

test('random mode with accidentals mixes in sharps, spelled as sharps', () => {
  const notes = seeds(20).flatMap(seed => allNotes(scoreWith({ accidentals: 'sharps' }, seed)));
  assert.ok(notes.some(n => n.pitch.alter === 1));
  assert.ok(notes.every(n => n.pitch.alter >= 0));
});

test('random mode with flats writes every black key as a flat, and no sharp', () => {
  const notes = seeds(20).flatMap(seed => allNotes(scoreWith({ accidentals: 'flats' }, seed)));
  assert.ok(notes.some(n => n.pitch.alter === -1));
  for (const { pitch } of notes) {
    assert.equal(pitch.alter, BLACK_KEYS.includes(pitch.value % 12) ? -1 : 0, pitchName(pitch));
  }
});

// Taken from the release before keys and the three-way accidentals setting.
test('random mode is frozen: none and sharps still write the notes they always wrote', () => {
  const opening = (overrides, seed) => scoreWith(overrides, seed).measures.slice(0, 2)
    .map(m => m.notes.map(n => pitchName(n.pitch)).join(' ')).join(' | ');
  assert.equal(opening({}, 42), 'B5 F5 B5 F5 | C5 A5 C6 D5');
  assert.equal(
    opening({
      accidentals: 'sharps', noteValues: ['quarter', 'eighth'], positions: [1, 7], rotatePositions: true,
      strings: [5, 4, 3, 2]
    }, 2026),
    'E4 F♯4 F4 F♯4 C5 D♯5 | D4 D♯5 D5 D♯5 G♯4 C♯5');
});

test('random mode keeps the original shaping: no repeats, leaps within the limit', () => {
  for (const accidentals of ACCIDENTALS) {
    for (const seed of seeds(40)) {
      const score = scoreWith({ accidentals, noteValues: ['quarter', 'eighth'] }, seed);
      const notes = allNotes(score);
      for (let i = 1; i < notes.length; i++) {
        // The limit is counted in staff steps, on the notes as they are written.
        const leap = Math.abs(diatonicIndex(notes[i].pitch) - diatonicIndex(notes[i - 1].pitch));
        assert.notEqual(notes[i].pitch.value, notes[i - 1].pitch.value);
        assert.ok(leap <= score.settings.maxLeapSteps);
      }
    }
  }
});

test('random mode uses the whole pool', () => {
  for (const accidentals of ACCIDENTALS) {
    const pool = poolFor(5, { accidentals, strings: [6, 5, 4, 3, 2, 1] });
    const used = new Set(seeds(20).flatMap(seed =>
      allNotes(scoreWith({ accidentals }, seed)).map(n => n.pitch.value)));
    assert.equal(used.size, pool.length, accidentals);
  }
});

test('sharps and flats draw from the same notes in the same rhythm', () => {
  const sharps = poolFor(5, { accidentals: 'sharps', strings: [6, 5, 4, 3, 2, 1] });
  const flats = poolFor(5, { accidentals: 'flats', strings: [6, 5, 4, 3, 2, 1] });
  assert.deepEqual(flats.map(p => p.value), sharps.map(p => p.value));
  for (const seed of seeds(10)) {
    const rhythm = accidentals => allNotes(scoreWith({ accidentals, noteValues: ['quarter', 'eighth', 'sixteenth'] }, seed))
      .map(n => [n.measure, n.start, n.dur]);
    assert.deepEqual(rhythm('flats'), rhythm('sharps'));
  }
});

test('the same seed and settings give the same score; another seed does not', () => {
  for (const accidentals of ['sharps', 'flats']) {
    const settings = { noteValues: ['quarter', 'eighth', 'sixteenth'], accidentals };
    assert.deepEqual(scoreWith(settings, 42), scoreWith(settings, 42));
    assert.notDeepEqual(scoreWith(settings, 42), scoreWith(settings, 43));
  }
});
