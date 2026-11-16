import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, loadSettings, sanitize, saveSettings } from '../src/state/settings.js';

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value))
  };
};

test('defaults match the original app: fifth position, all strings, quarter notes, random', () => {
  assert.deepEqual(sanitize(null), {
    measures: 16,
    maxLeapSteps: 7,
    positions: [5],
    rotatePositions: false,
    strings: [6, 5, 4, 3, 2, 1],
    noteValues: ['quarter'],
    accidentals: 'none',
    melody: 'random',
    key: 'C'
  });
});

test('sanitize drops unknown members and restores canonical order', () => {
  const s = sanitize({ positions: [12, 99, 1, 'x'], strings: [1, 6, 7], noteValues: ['sixteenth', 'quarter', 'whole'] });
  assert.deepEqual(s.positions, [1, 12]);
  assert.deepEqual(s.strings, [6, 1]);
  assert.deepEqual(s.noteValues, ['quarter', 'sixteenth']);
});

test('sanitize never leaves a group empty', () => {
  const s = sanitize({ positions: [], strings: 'nope', noteValues: [null] });
  assert.deepEqual(s.positions, DEFAULTS.positions);
  assert.deepEqual(s.strings, DEFAULTS.strings);
  assert.deepEqual(s.noteValues, DEFAULTS.noteValues);
});

test('accidentals are none, sharps or flats; the old on-off switch still reads', () => {
  for (const value of ['none', 'sharps', 'flats']) {
    assert.equal(sanitize({ accidentals: value }).accidentals, value);
  }
  // Stored before the setting had three values: on meant sharps.
  assert.equal(sanitize({ accidentals: true }).accidentals, 'sharps');
  assert.equal(sanitize({ accidentals: false }).accidentals, 'none');
  for (const value of ['yes', 'Sharps', 1, null, undefined, ['sharps'], {}]) {
    assert.equal(sanitize({ accidentals: value }).accidentals, 'none');
  }
});

test('the key is one of the keys on offer, C major otherwise', () => {
  for (const id of ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'Dm', 'Gm']) {
    assert.equal(sanitize({ key: id }).key, id);
  }
  for (const value of ['H', 'c', 'C major', 'Cb', '', 0, null, undefined, ['G'], {}]) {
    assert.equal(sanitize({ key: value }).key, 'C');
  }
});

test('sanitize accepts only real booleans and known melody modes', () => {
  assert.equal(sanitize({ rotatePositions: 1 }).rotatePositions, false);
  assert.equal(sanitize({ melody: 'jazz' }).melody, 'random');
  assert.equal(sanitize({ melody: 'musical' }).melody, 'musical');
});

test('settings survive a save and load', () => {
  const storage = memoryStorage();
  const settings = sanitize({
    positions: [2, 7], rotatePositions: true, strings: [3, 2, 1],
    noteValues: ['eighth', 'sixteenth'], accidentals: 'flats', melody: 'musical', key: 'F#m'
  });
  saveSettings(settings, storage);
  assert.deepEqual(loadSettings(storage), settings);
});

test('missing, corrupt or blocked storage falls back to the defaults', () => {
  assert.deepEqual(loadSettings(memoryStorage()), sanitize(null));
  const corrupt = memoryStorage();
  corrupt.setItem('guitar-reading-assistant.settings.v1', '{not json');
  assert.deepEqual(loadSettings(corrupt), sanitize(null));
  const blocked = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); }
  };
  assert.deepEqual(loadSettings(blocked), sanitize(null));
  assert.doesNotThrow(() => saveSettings(sanitize(null), blocked));
});

test('a browser that refuses even a look at localStorage still gets the defaults', () => {
  // With cookies blocked or in a sandboxed frame, reading the global throws.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new Error('The operation is insecure.'); }
  });
  try {
    assert.deepEqual(loadSettings(), sanitize(null));
    assert.doesNotThrow(() => saveSettings(sanitize(null)));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
