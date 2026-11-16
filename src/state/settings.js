// User settings: defaults, validation and persistence.
import { POSITION_NUMBERS } from '../music/fretboard.js';
import { NOTE_VALUES } from '../music/rhythm.js';
import { DEFAULT_KEY, keyById } from '../music/theory.js';

const STORAGE_KEY = 'guitar-reading-assistant.settings.v1';
const STRINGS = [6, 5, 4, 3, 2, 1];

export const DEFAULTS = Object.freeze({
  measures: 16,          // not exposed in the UI yet
  maxLeapSteps: 7,       // Random mode's leap limit, in diatonic steps
  positions: [5],
  rotatePositions: false,
  strings: STRINGS,
  noteValues: ['quarter'],
  accidentals: 'none',   // 'none' | 'sharps' | 'flats'; Musical mode reads it as off or on
  melody: 'random',      // 'random' | 'musical'
  key: DEFAULT_KEY       // a key id from theory.js; only Musical mode has a key
});

export const ACCIDENTALS = ['none', 'sharps', 'flats'];

// Until keys were added this setting was a switch, stored as true or false,
// and "on" wrote sharps.
const accidentalsFrom = value => {
  if (value === true) return 'sharps';
  return ACCIDENTALS.includes(value) ? value : DEFAULTS.accidentals;
};

// Keep the allowed members of a stored list, in canonical order; fall back to
// the default when nothing valid is left, because no group may be empty.
const subset = (value, allowed, fallback) => {
  const kept = Array.isArray(value) ? allowed.filter(item => value.includes(item)) : [];
  return kept.length ? kept : [...fallback];
};

// Turn anything (stale or hand-edited storage included) into valid settings.
export function sanitize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    measures: DEFAULTS.measures,
    maxLeapSteps: DEFAULTS.maxLeapSteps,
    positions: subset(source.positions, POSITION_NUMBERS, DEFAULTS.positions),
    rotatePositions: source.rotatePositions === true,
    strings: subset(source.strings, STRINGS, DEFAULTS.strings),
    noteValues: subset(source.noteValues, NOTE_VALUES, DEFAULTS.noteValues),
    accidentals: accidentalsFrom(source.accidentals),
    melody: source.melody === 'musical' ? 'musical' : 'random',
    key: keyById(source.key) ? source.key : DEFAULTS.key
  };
}

// Storage can be missing or blocked (private windows), so both directions are
// best-effort and the app must work without them. Where it is blocked, merely
// reading the localStorage global can throw, so the default is looked up
// inside each try block and not in the parameter list.
const resolve = storage => (storage === undefined ? globalThis.localStorage : storage);

export function loadSettings(storage) {
  try {
    return sanitize(JSON.parse(resolve(storage).getItem(STORAGE_KEY)));
  } catch {
    return sanitize(null);
  }
}

export function saveSettings(settings, storage) {
  try {
    const { measures, maxLeapSteps, ...saved } = settings;
    resolve(storage).setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Nothing to do: the settings simply will not be remembered.
  }
}
