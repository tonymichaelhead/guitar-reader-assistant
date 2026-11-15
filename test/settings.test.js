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
    accidentals: false,
    melody: 'random'
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

test('sanitize accepts only real booleans and known melody modes', () => {
  assert.equal(sanitize({ accidentals: 'yes' }).accidentals, false);
  assert.equal(sanitize({ rotatePositions: 1 }).rotatePositions, false);
  assert.equal(sanitize({ melody: 'jazz' }).melody, 'random');
  assert.equal(sanitize({ melody: 'musical' }).melody, 'musical');
});

test('settings survive a save and load', () => {
  const storage = memoryStorage();
  const settings = sanitize({
    positions: [2, 7], rotatePositions: true, strings: [3, 2, 1],
    noteValues: ['eighth', 'sixteenth'], accidentals: true, melody: 'musical'
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
