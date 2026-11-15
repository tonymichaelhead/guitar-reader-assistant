// Shared helpers for the tests.
import { generateScore } from '../src/music/generate.js';
import { sanitize } from '../src/state/settings.js';

export const settingsWith = overrides => ({ ...sanitize(null), ...overrides });

export const scoreWith = (overrides, seed) => generateScore(settingsWith(overrides), seed);

// Every note of a score in playing order, tagged with its measure.
export const allNotes = score =>
  score.measures.flatMap(m => m.notes.map(n => ({ ...n, measure: m.number, position: m.position })));

export const seeds = count => Array.from({ length: count }, (_, i) => i + 1);

export const DURATION = { quarter: 4, eighth: 2, sixteenth: 1 };
