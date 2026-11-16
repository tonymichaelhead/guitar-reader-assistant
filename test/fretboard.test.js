import assert from 'node:assert/strict';
import { test } from 'node:test';
import { POSITION_NUMBERS, ROMAN, buildPosition, poolFor } from '../src/music/fretboard.js';
import { pitchName, spell, staffStep } from '../src/music/pitch.js';

const ALL_STRINGS = [6, 5, 4, 3, 2, 1];

// Every non-empty selection of strings.
const stringSubsets = () => {
  const subsets = [];
  for (let mask = 1; mask < 64; mask++) {
    subsets.push(ALL_STRINGS.filter((_, i) => mask & (1 << i)));
  }
  return subsets;
};

test('spelling: sharps by default, flats on request, octaves unchanged', () => {
  assert.deepEqual(spell(48), { letter: 'C', octave: 4, alter: 0, value: 48 });
  assert.equal(pitchName(spell(58)), 'A♯4');
  assert.equal(pitchName(spell(58, 'flat')), 'B♭4');
  assert.equal(pitchName(spell(49, 'flat')), 'D♭4');
});

test('staff steps count from the bottom line of the treble staff', () => {
  assert.equal(staffStep(spell(52)), 0);  // E4, bottom line
  assert.equal(staffStep(spell(59)), 4);  // B4, middle line
  assert.equal(staffStep(spell(65)), 8);  // F5, top line
});

test('there are twelve positions with Roman numerals', () => {
  assert.deepEqual(POSITION_NUMBERS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(ROMAN[5], 'V');
  assert.equal(ROMAN[12], 'XII');
});

test('fifth position spans A3 to C6 as written', () => {
  const pool = poolFor(5, { accidentals: 'sharps', strings: ALL_STRINGS });
  assert.equal(pitchName(pool[0]), 'A3');
  assert.equal(pitchName(pool[pool.length - 1]), 'C6');
});

test('first position includes the open strings, played with no finger', () => {
  const notes = buildPosition(1);
  const lowE = notes.find(p => p.value === 40);
  assert.deepEqual(lowE.fingerings, [{ string: 6, fret: 0, finger: 0 }]);
  const frets = new Set(notes.flatMap(p => p.fingerings.map(f => f.fret)));
  assert.deepEqual([...frets].sort((a, b) => a - b), [0, 1, 2, 3, 4]);
});

test('other positions cover four frets, one finger per fret', () => {
  for (const position of POSITION_NUMBERS.slice(1)) {
    for (const p of buildPosition(position)) {
      for (const f of p.fingerings) {
        assert.ok(f.fret >= position && f.fret <= position + 3);
        assert.equal(f.finger, f.fret - position + 1);
      }
    }
  }
});

test('without accidentals the pool holds natural notes only', () => {
  for (const position of POSITION_NUMBERS) {
    const pool = poolFor(position, { accidentals: 'none', strings: ALL_STRINGS });
    assert.ok(pool.every(p => p.alter === 0));
  }
});

test('string toggles narrow both the notes and their fingerings', () => {
  const pool = poolFor(5, { accidentals: 'sharps', strings: [2, 1] });
  assert.ok(pool.length > 0);
  for (const p of pool) {
    assert.ok(p.fingerings.length > 0);
    assert.ok(p.fingerings.every(f => f.string === 1 || f.string === 2));
  }
});

test('no position and string selection ever leaves fewer than two natural notes', () => {
  for (const position of POSITION_NUMBERS) {
    for (const strings of stringSubsets()) {
      const pool = poolFor(position, { accidentals: 'none', strings });
      assert.ok(pool.length >= 2, `position ${position}, strings ${strings}`);
    }
  }
});
