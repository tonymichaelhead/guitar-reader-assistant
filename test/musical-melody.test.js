import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POSITION_NUMBERS, poolFor } from '../src/music/fretboard.js';
import { TONALITIES } from '../src/music/theory.js';
import { allNotes, scoreWith, seeds } from './helpers.js';

const musical = (overrides, seed) => scoreWith({ melody: 'musical', ...overrides }, seed);
const tonicOf = score => TONALITIES.find(t => t.label === score.tonality).tonic;

// Intervals between consecutive notes that the melodic rules govern: not the
// jump into a new position, and not the seam where a phrase begins.
const governedIntervals = score => {
  const notes = allNotes(score);
  const intervals = [];
  for (let i = 1; i < notes.length; i++) {
    const a = notes[i - 1];
    const b = notes[i];
    if (a.position !== b.position) continue;
    if (b.start === 0 && (b.measure - 1) % 4 === 0) continue;
    intervals.push(Math.abs(b.pitch.value - a.pitch.value));
  }
  return intervals;
};

test('musical mode names its tonal centre; random mode has none', () => {
  assert.ok(TONALITIES.some(t => t.label === musical({}, 1).tonality));
  assert.equal(scoreWith({}, 1).tonality, null);
});

test('musical mode stays in the pool of each measure', () => {
  for (const seed of seeds(30)) {
    const score = musical({
      accidentals: true, positions: [2, 5, 10], rotatePositions: true, strings: [4, 3, 2],
      noteValues: ['quarter', 'eighth', 'sixteenth']
    }, seed);
    for (const m of score.measures) {
      const allowed = new Set(
        poolFor(m.position, { accidentals: true, strings: score.settings.strings }).map(p => p.value));
      assert.ok(m.notes.every(n => allowed.has(n.pitch.value)));
      // Fingerings offered in the tooltip respect the string toggles.
      assert.ok(m.notes.every(n => n.pitch.fingerings.every(f => [4, 3, 2].includes(f.string))));
    }
  }
});

test('with accidentals off, musical mode writes natural notes only', () => {
  for (const seed of seeds(30)) {
    const notes = allNotes(musical({ noteValues: ['quarter', 'eighth'] }, seed));
    assert.ok(notes.every(n => n.pitch.alter === 0));
  }
});

test('with accidentals on, chromatic notes appear but stay a small minority', () => {
  let chromatic = 0;
  let total = 0;
  for (const seed of seeds(60)) {
    const notes = allNotes(musical({ accidentals: true }, seed));
    chromatic += notes.filter(n => n.pitch.alter !== 0).length;
    total += notes.length;
  }
  const share = chromatic / total;
  assert.ok(share > 0.02 && share < 0.15, `chromatic share ${share.toFixed(3)}`);
});

test('every chromatic note resolves by semitone in the direction it is spelled', () => {
  for (const seed of seeds(60)) {
    const notes = allNotes(musical({ accidentals: true, noteValues: ['quarter', 'eighth', 'sixteenth'] }, seed));
    notes.forEach((n, i) => {
      if (n.pitch.alter === 0) return;
      const next = notes[i + 1];
      assert.ok(next, 'a chromatic note is never the last note');
      const rise = next.pitch.value - n.pitch.value;
      if (n.pitch.alter === -1) {
        assert.equal(rise, -1);
      } else {
        // Sharps rise a semitone, or (melodic minor) a whole tone to the raised 7th.
        assert.ok(rise === 1 || (rise === 2 && next.pitch.alter === 1), `seed ${seed} note ${i}`);
      }
    });
  }
});

test('chromatic notes avoid the strong beats and are approached by step', () => {
  for (const seed of seeds(40)) {
    const notes = allNotes(musical({ accidentals: true, noteValues: ['quarter', 'eighth'] }, seed));
    notes.forEach((n, i) => {
      if (n.pitch.alter === 0 || notes[i - 1].pitch.alter !== 0) return;
      assert.notEqual(n.start % 8, 0);
      assert.ok(Math.abs(n.pitch.value - notes[i - 1].pitch.value) <= 2);
    });
  }
});

test('the piece ends on the tonic, arriving by step', () => {
  let byStep = 0;
  const runs = seeds(100);
  for (const seed of runs) {
    const score = musical({ accidentals: seed % 2 === 0 }, seed);
    const notes = allNotes(score);
    const last = notes[notes.length - 1].pitch;
    assert.equal(last.letter, tonicOf(score));
    assert.equal(last.alter, 0);
    const arrival = Math.abs(last.value - notes[notes.length - 2].pitch.value);
    if (arrival === 1 || arrival === 2) byStep++;
  }
  assert.ok(byStep >= 0.9 * runs.length, `${byStep} of ${runs.length} arrive by step`);
});

test('phrases alternate open and closed cadences', () => {
  for (const seed of seeds(60)) {
    const score = musical({}, seed);
    const tonic = tonicOf(score);
    const ending = measure => score.measures[measure - 1].notes.at(-1).pitch.letter;
    assert.notEqual(ending(4), tonic);   // half cadence
    assert.equal(ending(8), tonic);      // authentic cadence
    assert.notEqual(ending(12), tonic);
    assert.equal(ending(16), tonic);
  }
});

test('the third phrase reopens like the first', () => {
  for (const seed of seeds(30)) {
    const score = musical({}, seed);
    const values = m => score.measures[m - 1].notes.map(n => n.pitch.value);
    assert.deepEqual(values(9), values(1));
  }
});

test('melodic motion is mostly stepwise, with few wide leaps', () => {
  let steps = 0;
  let wide = 0;
  let forbidden = 0;
  let total = 0;
  for (const seed of seeds(100)) {
    for (const semis of governedIntervals(musical({}, seed))) {
      total++;
      if (semis === 1 || semis === 2) steps++;
      if (semis >= 7) wide++;
      if (semis === 6 || semis === 10 || semis === 11 || semis > 12) forbidden++;
    }
  }
  assert.ok(steps / total > 0.55, `steps ${(steps / total).toFixed(2)}`);
  assert.ok(wide / total < 0.1, `fifths or wider ${(wide / total).toFixed(3)}`);
  assert.ok(forbidden / total < 0.005, `tritones and sevenths ${(forbidden / total).toFixed(4)}`);
});

test('sixteenth-note runs move by step or third', () => {
  for (const seed of seeds(30)) {
    const notes = allNotes(musical({ noteValues: ['sixteenth'] }, seed));
    let wide = 0;
    for (let i = 1; i < notes.length; i++) {
      if (Math.abs(notes[i].pitch.value - notes[i - 1].pitch.value) > 4) wide++;
    }
    assert.ok(wide / notes.length < 0.03, `seed ${seed}: ${wide} wide intervals`);
  }
});

test('different exercises explore different registers of the position', () => {
  const lows = seeds(60).map(seed => Math.min(...allNotes(musical({}, seed)).map(n => n.pitch.value)));
  assert.ok(Math.max(...lows) - Math.min(...lows) >= 7);
});

test('the same seed and settings give the same musical score', () => {
  const settings = { accidentals: true, noteValues: ['quarter', 'eighth', 'sixteenth'] };
  assert.deepEqual(musical(settings, 7), musical(settings, 7));
  assert.notDeepEqual(musical(settings, 7), musical(settings, 8));
});

test('musical mode copes with the smallest pools: one string in any position', () => {
  for (const position of POSITION_NUMBERS) {
    for (const string of [6, 5, 4, 3, 2, 1]) {
      for (const accidentals of [false, true]) {
        const score = musical({
          positions: [position], strings: [string], accidentals,
          noteValues: ['quarter', 'eighth', 'sixteenth']
        }, position * 10 + string);
        assert.equal(score.measures.length, 16);
        const allowed = new Set(poolFor(position, { accidentals, strings: [string] }).map(p => p.value));
        assert.ok(allNotes(score).every(n => allowed.has(n.pitch.value)));
      }
    }
  }
});

test('musical mode works when every position rotates', () => {
  for (const seed of seeds(20)) {
    const score = musical({ positions: POSITION_NUMBERS, rotatePositions: true, accidentals: true }, seed);
    assert.equal(new Set(score.measures.slice(0, 12).map(m => m.position)).size, 12);
    assert.equal(allNotes(score).at(-1).pitch.alter, 0);
  }
});
