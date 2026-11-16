import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspect } from 'node:util';
import { OPEN_STRINGS, POSITION_NUMBERS, keyPool, poolFor } from '../src/music/fretboard.js';
import { pitchName } from '../src/music/pitch.js';
import { mulberry32, pick } from '../src/music/rng.js';
import { CODEC_VERSION, decodeScore, encodeScore } from '../src/music/score-codec.js';
import { KEYS, inKey, keyAlter, keyById, spellInKey, spellToward } from '../src/music/theory.js';
import { allNotes, scoreWith, seeds, settingsWith } from './helpers.js';

const COMBINATIONS = [
  ['quarter'], ['eighth'], ['sixteenth'],
  ['quarter', 'eighth'], ['quarter', 'sixteenth'], ['eighth', 'sixteenth'],
  ['quarter', 'eighth', 'sixteenth']
];
const ALL_VALUES = COMBINATIONS[6];
const MODES = [
  { melody: 'random', accidentals: 'none' },
  { melody: 'random', accidentals: 'sharps' },
  { melody: 'random', accidentals: 'flats' },
  { melody: 'musical', accidentals: 'none' },
  { melody: 'musical', accidentals: 'sharps' }
];
const DENSE = { noteValues: ['sixteenth'], accidentals: 'sharps' };

// What storage does to an encoding: text out, text back in.
const throughJson = value => JSON.parse(JSON.stringify(value));
const roundTrip = score => decodeScore(throughJson(encodeScore(score)));

const SETTINGS = { strings: [6, 5, 4, 3, 2, 1] };
const ALL_STRINGS = SETTINGS.strings;
// A one-measure encoding in first position unless told otherwise, as each
// version of the format writes it. Version 1 has no key.
const encodingV1 = (n, overrides = {}) => ({
  v: 1, seed: 7, tonality: null, settings: SETTINGS, measures: [{ p: 1, n }], ...overrides
});
const encodingV2 = (n, overrides = {}) => ({
  v: 2, seed: 7, tonality: null, key: null, settings: SETTINGS, measures: [{ p: 1, n }], ...overrides
});
// A rule the two versions share is checked on each of them: `encoding` makes
// the encoding of the version under test.
const bothVersions = (name, body) => {
  test(`version 1: ${name}`, () => body(encodingV1));
  test(`version 2: ${name}`, () => body(encodingV2));
};

const QUARTERS = [[40, 0, 4], [41, 0, 4], [43, 0, 4], [45, 0, 4]]; // E3 F3 G3 A3
const BLACK_KEYS = [1, 3, 6, 8, 10];
// Four quarter notes on the lowest natural note a position offers.
const lowestNote = (position, strings) =>
  new Array(4).fill([poolFor(position, { accidentals: 'none', strings })[0].value, 0, 4]);

// The letter each pitch class takes under each alteration, C first, in each
// version. Version 1 has one spelling of a white key and two of a black key;
// version 2 adds B sharp, F flat, E sharp and C flat.
const SPELLINGS = {
  1: [
    { 0: 'C' }, { 1: 'C', [-1]: 'D' }, { 0: 'D' }, { 1: 'D', [-1]: 'E' }, { 0: 'E' }, { 0: 'F' },
    { 1: 'F', [-1]: 'G' }, { 0: 'G' }, { 1: 'G', [-1]: 'A' }, { 0: 'A' }, { 1: 'A', [-1]: 'B' }, { 0: 'B' }
  ],
  2: [
    { 0: 'C', 1: 'B' }, { 1: 'C', [-1]: 'D' }, { 0: 'D' }, { 1: 'D', [-1]: 'E' }, { 0: 'E', [-1]: 'F' }, { 0: 'F', 1: 'E' },
    { 1: 'F', [-1]: 'G' }, { 0: 'G' }, { 1: 'G', [-1]: 'A' }, { 0: 'A' }, { 1: 'A', [-1]: 'B' }, { 0: 'B', [-1]: 'C' }
  ]
};
const ALTERS = [-1, 0, 1];
// The letter and octave a version reads [value, alter] as, or null when the
// version has no such spelling. The octave is the letter's: B sharp belongs to
// the octave below the C it sounds as, C flat to the octave above its B.
const spellingIn = (version, value, alter) => {
  const letter = SPELLINGS[version][value % 12][alter];
  if (!letter) return null;
  const shift = letter === 'B' && alter === 1 ? -1 : letter === 'C' && alter === -1 ? 1 : 0;
  return { letter, octave: Math.floor(value / 12) + shift };
};

// decodeScore must refuse without throwing, so every refusal checks both.
const assertRefused = (data, label) => {
  let result;
  assert.doesNotThrow(() => { result = decodeScore(data); }, label);
  assert.equal(result, null, label);
};

// ---- Version 1 as the released app stored it -----------------------------
//
// These three encodings were written by version 0.2.0 of the app, the last
// one before keys, and are kept here as the very text that sits in people's
// localStorage. Under each is the study that version showed for it. They are
// the guarantee that old saves keep opening: do not regenerate them with
// today's encoder, and do not edit them to make a change to version-1 reading
// pass. If a test on them fails, saved studies have stopped opening as they
// were.

// Random mode with the settings a new visitor had: accidentals off.
const V1_PLAIN = '{"v":1,"seed":4821,"tonality":null,' +
  '"settings":{"measures":16,"maxLeapSteps":7,"positions":[5],"rotatePositions":false,"strings":[6,5,4,3,2,1],"noteValues":["quarter"],"accidentals":false,"melody":"random"},' +
  '"measures":[' +
  '{"p":5,"n":[[50,0,4],[57,0,4],[45,0,4],[55,0,4]]},' +
  '{"p":5,"n":[[52,0,4],[48,0,4],[47,0,4],[55,0,4]]},' +
  '{"p":5,"n":[[53,0,4],[64,0,4],[52,0,4],[55,0,4]]},' +
  '{"p":5,"n":[[57,0,4],[62,0,4],[53,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[69,0,4],[62,0,4],[64,0,4],[71,0,4]]},' +
  '{"p":5,"n":[[60,0,4],[71,0,4],[64,0,4],[67,0,4]]},' +
  '{"p":5,"n":[[71,0,4],[67,0,4],[57,0,4],[64,0,4]]},' +
  '{"p":5,"n":[[69,0,4],[60,0,4],[64,0,4],[72,0,4]]},' +
  '{"p":5,"n":[[64,0,4],[55,0,4],[62,0,4],[72,0,4]]},' +
  '{"p":5,"n":[[60,0,4],[65,0,4],[57,0,4],[62,0,4]]},' +
  '{"p":5,"n":[[52,0,4],[60,0,4],[52,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[64,0,4],[71,0,4],[72,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[65,0,4],[64,0,4],[65,0,4],[67,0,4]]},' +
  '{"p":5,"n":[[64,0,4],[69,0,4],[71,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[69,0,4],[64,0,4],[62,0,4],[67,0,4]]},' +
  '{"p":5,"n":[[65,0,4],[67,0,4],[64,0,4],[60,0,4]]}' +
  ']}';

// Musical mode with the old accidentals switch on, in a mode that is no
// longer on offer. It has both sharps (C sharp, F sharp) and a flat (B flat).
const V1_MIXOLYDIAN = '{"v":1,"seed":31,"tonality":"G Mixolydian",' +
  '"settings":{"measures":16,"maxLeapSteps":7,"positions":[5],"rotatePositions":false,"strings":[6,5,4,3,2,1],"noteValues":["quarter","eighth"],"accidentals":true,"melody":"musical"},' +
  '"measures":[' +
  '{"p":5,"n":[[62,0,2],[61,1,2],[62,0,2],[64,0,2],[62,0,4],[65,0,4]]},' +
  '{"p":5,"n":[[67,0,4],[64,0,4],[62,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[64,0,2],[62,0,2],[57,0,2],[62,0,2],[60,0,4],[62,0,4]]},' +
  '{"p":5,"n":[[60,0,4],[55,0,4],[55,0,4],[57,0,4]]},' +
  '{"p":5,"n":[[55,0,2],[53,0,2],[52,0,2],[50,0,2],[53,0,4],[55,0,4]]},' +
  '{"p":5,"n":[[57,0,4],[58,-1,4],[57,0,4],[58,-1,4]]},' +
  '{"p":5,"n":[[57,0,2],[55,0,2],[57,0,2],[60,0,2],[62,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[57,0,4],[55,0,4],[57,0,4],[55,0,4]]},' +
  '{"p":5,"n":[[57,0,2],[60,0,2],[62,0,2],[60,0,2],[62,0,4],[60,0,4]]},' +
  '{"p":5,"n":[[60,0,4],[62,0,4],[60,0,4],[61,1,4]]},' +
  '{"p":5,"n":[[62,0,2],[67,0,2],[66,1,2],[67,0,2],[71,0,4],[64,0,4]]},' +
  '{"p":5,"n":[[65,0,4],[62,0,4],[64,0,4],[65,0,4]]},' +
  '{"p":5,"n":[[67,0,2],[66,1,2],[67,0,2],[65,0,2],[67,0,4],[69,0,4]]},' +
  '{"p":5,"n":[[67,0,4],[66,1,4],[67,0,4],[65,0,4]]},' +
  '{"p":5,"n":[[62,0,2],[60,0,2],[60,0,2],[67,0,2],[65,0,4],[62,0,4]]},' +
  '{"p":5,"n":[[64,0,4],[65,0,4],[65,0,4],[67,0,4]]}' +
  ']}';

// Random mode with the old accidentals switch on, three positions in turn
// (the first with its open strings), three strings and every note value.
const V1_ROTATING = '{"v":1,"seed":906,"tonality":null,' +
  '"settings":{"measures":16,"maxLeapSteps":7,"positions":[1,7,12],"rotatePositions":true,"strings":[4,3,2],"noteValues":["quarter","eighth","sixteenth"],"accidentals":true,"melody":"random"},' +
  '"measures":[' +
  '{"p":1,"n":[[52,0,2],[51,1,2],[61,1,4],[51,1,2],[62,0,2],[53,0,2],[58,1,2]]},' +
  '{"p":12,"n":[[69,0,4],[64,0,4],[69,0,4],[64,0,1],[63,1,1],[62,0,1],[73,1,1]]},' +
  '{"p":7,"n":[[62,0,4],[69,0,2],[65,0,2],[60,0,2],[66,1,2],[57,0,2],[67,0,2]]},' +
  '{"p":1,"n":[[60,0,2],[55,0,2],[61,1,4],[53,0,1],[56,1,1],[53,0,1],[59,0,1],[61,1,4]]},' +
  '{"p":12,"n":[[73,1,2],[64,0,2],[70,1,2],[67,0,2],[71,0,4],[69,0,1],[70,1,1],[68,1,2]]},' +
  '{"p":7,"n":[[63,1,2],[58,1,1],[65,0,1],[68,1,4],[66,1,2],[67,0,1],[65,0,1],[62,0,2],[59,0,2]]},' +
  '{"p":1,"n":[[62,0,4],[60,0,2],[55,0,2],[63,1,4],[59,0,4]]},' +
  '{"p":12,"n":[[62,0,2],[67,0,2],[65,0,4],[63,1,4],[74,0,4]]},' +
  '{"p":7,"n":[[64,0,4],[67,0,1],[68,1,1],[60,0,1],[64,0,1],[63,1,4],[67,0,2],[57,0,1],[67,0,1]]},' +
  '{"p":1,"n":[[58,1,4],[57,0,2],[53,0,2],[57,0,4],[55,0,4]]},' +
  '{"p":12,"n":[[62,0,2],[67,0,2],[64,0,4],[72,0,2],[71,0,2],[73,1,2],[62,0,2]]},' +
  '{"p":7,"n":[[57,0,4],[64,0,2],[57,0,2],[69,0,2],[60,0,2],[69,0,2],[63,1,2]]},' +
  '{"p":1,"n":[[52,0,4],[61,1,2],[57,0,2],[50,0,1],[52,0,1],[58,1,1],[59,0,1],[53,0,4]]},' +
  '{"p":12,"n":[[64,0,2],[73,1,2],[69,0,4],[64,0,4],[73,1,2],[67,0,2]]},' +
  '{"p":7,"n":[[66,1,4],[63,1,2],[69,0,2],[62,0,4],[60,0,4]]},' +
  '{"p":1,"n":[[59,0,4],[50,0,4],[53,0,4],[62,0,1],[59,0,1],[55,0,2]]}' +
  ']}';

// What the released app showed for each: a line per measure, the position and
// then the notes as "name duration fingering ...", a fingering being
// string/fret/finger. Starts are not written: a note begins where the one
// before it ends.
const V1_FIXTURES = [
  {
    name: 'random mode, accidentals off',
    text: V1_PLAIN,
    seed: 4821,
    tonality: null,
    settings: {
      measures: 16, maxLeapSteps: 7, positions: [5], rotatePositions: false,
      strings: [6, 5, 4, 3, 2, 1], noteValues: ['quarter'], accidentals: false, melody: 'random'
    },
    measures: [
      '5 | D4 4 5/5/1 | A4 4 4/7/3 | A3 4 6/5/1 | G4 4 4/5/1',
      '5 | E4 4 5/7/3 | C4 4 6/8/4 | B3 4 6/7/3 | G4 4 4/5/1',
      '5 | F4 4 5/8/4 | E5 4 2/5/1 | E4 4 5/7/3 | G4 4 4/5/1',
      '5 | A4 4 4/7/3 | D5 4 3/7/3 | F4 4 5/8/4 | C5 4 3/5/1',
      '5 | A5 4 1/5/1 | D5 4 3/7/3 | E5 4 2/5/1 | B5 4 1/7/3',
      '5 | C5 4 3/5/1 | B5 4 1/7/3 | E5 4 2/5/1 | G5 4 2/8/4',
      '5 | B5 4 1/7/3 | G5 4 2/8/4 | A4 4 4/7/3 | E5 4 2/5/1',
      '5 | A5 4 1/5/1 | C5 4 3/5/1 | E5 4 2/5/1 | C6 4 1/8/4',
      '5 | E5 4 2/5/1 | G4 4 4/5/1 | D5 4 3/7/3 | C6 4 1/8/4',
      '5 | C5 4 3/5/1 | F5 4 2/6/2 | A4 4 4/7/3 | D5 4 3/7/3',
      '5 | E4 4 5/7/3 | C5 4 3/5/1 | E4 4 5/7/3 | C5 4 3/5/1',
      '5 | E5 4 2/5/1 | B5 4 1/7/3 | C6 4 1/8/4 | C5 4 3/5/1',
      '5 | F5 4 2/6/2 | E5 4 2/5/1 | F5 4 2/6/2 | G5 4 2/8/4',
      '5 | E5 4 2/5/1 | A5 4 1/5/1 | B5 4 1/7/3 | C5 4 3/5/1',
      '5 | A5 4 1/5/1 | E5 4 2/5/1 | D5 4 3/7/3 | G5 4 2/8/4',
      '5 | F5 4 2/6/2 | G5 4 2/8/4 | E5 4 2/5/1 | C5 4 3/5/1'
    ]
  },
  {
    name: 'musical mode in G Mixolydian, accidentals on',
    text: V1_MIXOLYDIAN,
    seed: 31,
    tonality: 'G Mixolydian',
    settings: {
      measures: 16, maxLeapSteps: 7, positions: [5], rotatePositions: false,
      strings: [6, 5, 4, 3, 2, 1], noteValues: ['quarter', 'eighth'], accidentals: true, melody: 'musical'
    },
    measures: [
      '5 | D5 2 3/7/3 | C#5 2 3/6/2 | D5 2 3/7/3 | E5 2 2/5/1 | D5 4 3/7/3 | F5 4 2/6/2',
      '5 | G5 4 2/8/4 | E5 4 2/5/1 | D5 4 3/7/3 | C5 4 3/5/1',
      '5 | E5 2 2/5/1 | D5 2 3/7/3 | A4 2 4/7/3 | D5 2 3/7/3 | C5 4 3/5/1 | D5 4 3/7/3',
      '5 | C5 4 3/5/1 | G4 4 4/5/1 | G4 4 4/5/1 | A4 4 4/7/3',
      '5 | G4 2 4/5/1 | F4 2 5/8/4 | E4 2 5/7/3 | D4 2 5/5/1 | F4 4 5/8/4 | G4 4 4/5/1',
      '5 | A4 4 4/7/3 | Bb4 4 4/8/4 | A4 4 4/7/3 | Bb4 4 4/8/4',
      '5 | A4 2 4/7/3 | G4 2 4/5/1 | A4 2 4/7/3 | C5 2 3/5/1 | D5 4 3/7/3 | C5 4 3/5/1',
      '5 | A4 4 4/7/3 | G4 4 4/5/1 | A4 4 4/7/3 | G4 4 4/5/1',
      '5 | A4 2 4/7/3 | C5 2 3/5/1 | D5 2 3/7/3 | C5 2 3/5/1 | D5 4 3/7/3 | C5 4 3/5/1',
      '5 | C5 4 3/5/1 | D5 4 3/7/3 | C5 4 3/5/1 | C#5 4 3/6/2',
      '5 | D5 2 3/7/3 | G5 2 2/8/4 | F#5 2 2/7/3 | G5 2 2/8/4 | B5 4 1/7/3 | E5 4 2/5/1',
      '5 | F5 4 2/6/2 | D5 4 3/7/3 | E5 4 2/5/1 | F5 4 2/6/2',
      '5 | G5 2 2/8/4 | F#5 2 2/7/3 | G5 2 2/8/4 | F5 2 2/6/2 | G5 4 2/8/4 | A5 4 1/5/1',
      '5 | G5 4 2/8/4 | F#5 4 2/7/3 | G5 4 2/8/4 | F5 4 2/6/2',
      '5 | D5 2 3/7/3 | C5 2 3/5/1 | C5 2 3/5/1 | G5 2 2/8/4 | F5 4 2/6/2 | D5 4 3/7/3',
      '5 | E5 4 2/5/1 | F5 4 2/6/2 | F5 4 2/6/2 | G5 4 2/8/4'
    ]
  },
  {
    name: 'random mode, accidentals on, rotating positions on three strings',
    text: V1_ROTATING,
    seed: 906,
    tonality: null,
    settings: {
      measures: 16, maxLeapSteps: 7, positions: [1, 7, 12], rotatePositions: true,
      strings: [4, 3, 2], noteValues: ['quarter', 'eighth', 'sixteenth'], accidentals: true, melody: 'random'
    },
    measures: [
      '1 | E4 2 4/2/2 | D#4 2 4/1/1 | C#5 4 2/2/2 | D#4 2 4/1/1 | D5 2 2/3/3 | F4 2 4/3/3 | A#4 2 3/3/3',
      '12 | A5 4 3/14/3 | E5 4 4/14/3 | A5 4 3/14/3 | E5 1 4/14/3 | D#5 1 4/13/2 | D5 1 4/12/1 | C#6 1 2/14/3',
      '7 | D5 4 3/7/1 | A5 2 2/10/4 | F5 2 3/10/4 | C5 2 4/10/4 | F#5 2 2/7/1 | A4 2 4/7/1 | G5 2 2/8/2',
      '1 | C5 2 2/1/1 | G4 2 3/0/0 | C#5 4 2/2/2 | F4 1 4/3/3 | G#4 1 3/1/1 | F4 1 4/3/3 | B4 1 3/4/4 2/0/0 | C#5 4 2/2/2',
      '12 | C#6 2 2/14/3 | E5 2 4/14/3 | A#5 2 3/15/4 | G5 2 3/12/1 | B5 4 2/12/1 | A5 1 3/14/3 | A#5 1 3/15/4 | G#5 2 3/13/2',
      '7 | D#5 2 3/8/2 | A#4 1 4/8/2 | F5 1 3/10/4 | G#5 4 2/9/3 | F#5 2 2/7/1 | G5 1 2/8/2 | F5 1 3/10/4 | D5 2 3/7/1 | B4 2 4/9/3',
      '1 | D5 4 2/3/3 | C5 2 2/1/1 | G4 2 3/0/0 | D#5 4 2/4/4 | B4 4 3/4/4 2/0/0',
      '12 | D5 2 4/12/1 | G5 2 3/12/1 | F5 4 4/15/4 | D#5 4 4/13/2 | D6 4 2/15/4',
      '7 | E5 4 3/9/3 | G5 1 2/8/2 | G#5 1 2/9/3 | C5 1 4/10/4 | E5 1 3/9/3 | D#5 4 3/8/2 | G5 2 2/8/2 | A4 1 4/7/1 | G5 1 2/8/2',
      '1 | A#4 4 3/3/3 | A4 2 3/2/2 | F4 2 4/3/3 | A4 4 3/2/2 | G4 4 3/0/0',
      '12 | D5 2 4/12/1 | G5 2 3/12/1 | E5 4 4/14/3 | C6 2 2/13/2 | B5 2 2/12/1 | C#6 2 2/14/3 | D5 2 4/12/1',
      '7 | A4 4 4/7/1 | E5 2 3/9/3 | A4 2 4/7/1 | A5 2 2/10/4 | C5 2 4/10/4 | A5 2 2/10/4 | D#5 2 3/8/2',
      '1 | E4 4 4/2/2 | C#5 2 2/2/2 | A4 2 3/2/2 | D4 1 4/0/0 | E4 1 4/2/2 | A#4 1 3/3/3 | B4 1 3/4/4 2/0/0 | F4 4 4/3/3',
      '12 | E5 2 4/14/3 | C#6 2 2/14/3 | A5 4 3/14/3 | E5 4 4/14/3 | C#6 2 2/14/3 | G5 2 3/12/1',
      '7 | F#5 4 2/7/1 | D#5 2 3/8/2 | A5 2 2/10/4 | D5 4 3/7/1 | C5 4 4/10/4',
      '1 | B4 4 3/4/4 2/0/0 | D4 4 4/0/0 | F4 4 4/3/3 | D5 1 2/3/3 | B4 1 3/4/4 2/0/0 | G4 2 3/0/0'
    ]
  }
];

// Semitones above C of each natural letter, and what a written sign adds.
const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SIGN = { '#': 1, b: -1, '': 0 };

// A measure of a Score from its line in a fixture. The value is worked out
// from the name alone: octave * 12 + the letter's semitones + the sign.
const writtenMeasure = (line, index) => {
  const [position, ...notes] = line.split(' | ');
  let start = 0;
  return {
    number: index + 1,
    position: Number(position),
    notes: notes.map(text => {
      const [name, duration, ...fingerings] = text.split(' ');
      const [, letter, sign, octave] = /^([A-G])([#b]?)(\d)$/.exec(name);
      const note = {
        pitch: {
          letter,
          octave: Number(octave),
          alter: SIGN[sign],
          value: Number(octave) * 12 + NATURAL[letter] + SIGN[sign],
          fingerings: fingerings.map(fingering => {
            const [string, fret, finger] = fingering.split('/').map(Number);
            return { string, fret, finger };
          })
        },
        start,
        dur: Number(duration)
      };
      start += note.dur;
      return note;
    })
  };
};

// The whole Score a fixture stands for. Version 1 had no key, so there is none.
const writtenScore = ({ seed, settings, tonality, measures }) => ({
  seed, settings, key: null, tonality, measures: measures.map(writtenMeasure)
});

for (const fixture of V1_FIXTURES) {
  test(`a version-1 study saved by the released app opens exactly as it was: ${fixture.name}`, () => {
    const stored = JSON.parse(fixture.text);
    const expected = writtenScore(fixture);
    // The lines of the fixture name the notes its text stores, one for one.
    assert.equal(stored.v, 1);
    assert.equal('key' in stored, false);
    assert.deepEqual(
      expected.measures.map(m => ({ p: m.position, n: m.notes.map(n => [n.pitch.value, n.pitch.alter, n.dur]) })),
      stored.measures);
    assert.equal(expected.measures.length, 16);

    const score = decodeScore(stored);
    assert.deepEqual(score, expected);
    assert.equal(score.key, null);
    assert.equal(score.tonality, fixture.tonality);
    // A pitch is these five things and no more, in a study of any age.
    for (const { pitch } of allNotes(score)) {
      assert.deepEqual(Object.keys(pitch).sort(), ['alter', 'fingerings', 'letter', 'octave', 'value']);
    }
  });
}

test('a version-1 study saved again is stored as version 2 without a key, and is the same study', () => {
  for (const fixture of V1_FIXTURES) {
    const stored = JSON.parse(fixture.text);
    const score = decodeScore(stored);
    const again = throughJson(encodeScore(score));
    assert.deepEqual(again, { ...stored, v: 2, key: null }, fixture.name);
    assert.deepEqual(decodeScore(again), score, fixture.name);
  }
});

// ---- Round trips ---------------------------------------------------------

test('a score survives encoding, JSON and decoding, for every note-value combination', () => {
  for (const mode of MODES) {
    for (const noteValues of COMBINATIONS) {
      for (const seed of seeds(10)) {
        const score = scoreWith({ ...mode, noteValues }, seed);
        assert.deepEqual(roundTrip(score), score, `${mode.melody} ${mode.accidentals} ${noteValues} seed ${seed}`);
      }
    }
  }
});

test('rotating positions survive the round trip', () => {
  for (const mode of MODES) {
    for (const positions of [[1, 7, 12], POSITION_NUMBERS]) {
      for (const seed of seeds(8)) {
        const score = scoreWith({ ...mode, positions, rotatePositions: true, noteValues: ALL_VALUES }, seed);
        assert.ok(new Set(score.measures.map(m => m.position)).size > 1);
        assert.deepEqual(roundTrip(score), score, `${mode.melody} ${mode.accidentals} ${positions} seed ${seed}`);
      }
    }
  }
});

test('restricted strings survive the round trip, fingerings included', () => {
  for (const mode of MODES) {
    for (const strings of [[6, 5, 4], [3, 2, 1], [4, 2], [6], [1]]) {
      for (const seed of seeds(6)) {
        const score = scoreWith({ ...mode, strings, positions: [1, 9], noteValues: ['quarter', 'eighth'] }, seed);
        const back = roundTrip(score);
        assert.deepEqual(back, score, `${mode.melody} ${mode.accidentals} strings ${strings} seed ${seed}`);
        for (const note of allNotes(back)) {
          assert.ok(note.pitch.fingerings.length > 0);
          assert.ok(note.pitch.fingerings.every(f => strings.includes(f.string)));
        }
      }
    }
  }
});

test('a generated study survives the round trip in every key, with its key', () => {
  for (const key of KEYS) {
    for (const accidentals of ['none', 'sharps']) {
      for (const seed of seeds(4)) {
        const score = scoreWith(
          { melody: 'musical', key: key.id, accidentals, noteValues: ALL_VALUES, positions: [1, 5, 9], rotatePositions: true },
          seed);
        assert.equal(score.key, key.id);
        assert.equal(encodeScore(score).key, key.id);
        assert.deepEqual(roundTrip(score), score, `${key.label} accidentals ${accidentals} seed ${seed}`);
      }
    }
  }
});

// Studies in a key, written here by hand so that these tests hold whatever the
// generator makes of a key.

// Every spelling a key gives the notes of a position: each note as the key
// writes it when nothing else decides, and each note from outside the scale
// as it is written on its way up or down to a neighbour in the scale.
function everySpelling(key, position, strings) {
  const pool = keyPool(position, { strings }, key);
  const leaning = [];
  for (const pitch of pool) {
    if (inKey(key, pitch)) continue;
    for (const direction of [1, -1]) {
      const resolution = spellInKey(pitch.value + direction, key);
      const spelling = inKey(key, resolution) && spellToward(pitch.value, resolution, key);
      if (spelling) leaning.push({ ...pitch, ...spelling });
    }
  }
  return [...pool, ...leaning];
}

// Measures of quarters, of eighths and of sixteenths, none crossing a beat.
const RHYTHMS = [[4, 4, 4, 4], [2, 2, 4, 2, 2, 4], [4, 1, 1, 2, 4, 2, 1, 1], [1, 1, 1, 1, 2, 2, 4, 4]];

// A Score holding the given pitches in order, each measure in the rhythm its
// turn brings and the last one filled out with the first pitch.
function scoreOf(pitches, { key, position, strings = ALL_STRINGS, seed = 1 }) {
  const measures = [];
  let next = 0;
  while (next < pitches.length) {
    let start = 0;
    const notes = RHYTHMS[measures.length % RHYTHMS.length].map(dur => {
      const note = { pitch: pitches[next++] || pitches[0], start, dur };
      start += dur;
      return note;
    });
    measures.push({ number: measures.length + 1, position, notes });
  }
  return {
    seed,
    settings: settingsWith({ melody: 'musical', key: key.id, accidentals: 'sharps', positions: [position], strings }),
    key: key.id,
    tonality: key.label,
    measures
  };
}

const keyedScore = (id, position, strings) => {
  const key = keyById(id);
  return scoreOf(everySpelling(key, position, strings || ALL_STRINGS), { key, position, strings, seed: position });
};

test('a study in any key survives the round trip, with every spelling the key uses', () => {
  let notes = 0;
  for (const key of KEYS) {
    for (const position of POSITION_NUMBERS) {
      for (const strings of [ALL_STRINGS, [6, 5, 4], [3, 2, 1], [2]]) {
        const score = keyedScore(key.id, position, strings);
        const encoded = encodeScore(score);
        assert.equal(encoded.v, 2);
        assert.equal(encoded.key, key.id);
        assert.deepEqual(roundTrip(score), score, `${key.label}, position ${position}, strings ${strings}`);
        notes += allNotes(score).length;
      }
    }
  }
  assert.ok(notes > 15000, `only ${notes} notes`);
});

test('the spellings a key calls for come back as written', () => {
  const namesIn = (id, position) => new Set(allNotes(roundTrip(keyedScore(id, position))).map(n => pitchName(n.pitch)));
  const assertNames = (id, position, wanted) => {
    const names = namesIn(id, position);
    for (const name of wanted) assert.ok(names.has(name), `${name} in ${id}, position ${position}`);
  };
  // E sharp, the leading note of F sharp minor, and B sharp, that of C sharp minor.
  assertNames('F#m', 1, ['E♯3', 'E♯4', 'E♯5', 'F♯3', 'C♯4', 'G♯4', 'D♯4']);
  assertNames('C#m', 1, ['B♯3', 'B♯4', 'C♯4', 'D♯4', 'F♯4', 'G♯4', 'A♯4']);
  // The naturals that cancel the two sharps of D major.
  assert.deepEqual([keyAlter(keyById('D'), 'F'), keyAlter(keyById('D'), 'C')], [1, 1]);
  assertNames('D', 2, ['F4', 'F♯4', 'C5', 'C♯5']);
  // The two flats of B flat major, the flats outside it, and the sharps that
  // lead up into its scale.
  assertNames('Bb', 1, ['B♭3', 'E♭4', 'B♭4', 'E♭5', 'A♭3', 'D♭4', 'G♭4', 'A♭4', 'C♯4', 'F♯4']);
  // B natural and E natural cancel them.
  assertNames('Bb', 1, ['B3', 'E4', 'B4', 'E5']);
});

// ---- The encoding --------------------------------------------------------

test('the encoding holds version, seed, tonality, key, settings and one [value, alter, duration] per note', () => {
  assert.equal(CODEC_VERSION, 2);
  const scores = [
    ...MODES.map(mode => scoreWith({ ...mode, noteValues: ALL_VALUES, positions: [2, 8], rotatePositions: true }, 4)),
    scoreWith({ melody: 'musical', key: 'Gm', noteValues: ALL_VALUES }, 4),
    keyedScore('F#m', 1),
    keyedScore('Bb', 3, [4, 3, 2])
  ];
  for (const score of scores) {
    const data = encodeScore(score);
    assert.deepEqual(Object.keys(data), ['v', 'seed', 'tonality', 'key', 'settings', 'measures']);
    assert.equal(data.v, 2);
    assert.equal(data.seed, score.seed);
    assert.equal(data.tonality, score.tonality);
    assert.equal(data.key, score.key);
    assert.deepEqual(data.settings, score.settings);
    assert.equal(data.measures.length, score.measures.length);
    data.measures.forEach((measure, i) => {
      const { position, notes } = score.measures[i];
      // No measure number, no starts, no letters, no fingerings.
      assert.deepEqual(measure, { p: position, n: notes.map(n => [n.pitch.value, n.pitch.alter, n.dur]) });
    });
    // Nothing in it is changed by a trip through JSON.
    assert.deepEqual(throughJson(data), data);
  }
});

test('random mode stores a null key and tonality, and musical mode the id and the label of its key', () => {
  for (const accidentals of ['none', 'sharps', 'flats']) {
    // The key left in the settings is not the key of a study that has none.
    const data = encodeScore(scoreWith({ accidentals, key: 'D' }, 1));
    assert.equal(data.key, null);
    assert.equal(data.tonality, null);
    assert.equal(data.settings.key, 'D');
  }
  for (const key of KEYS) {
    const data = encodeScore(scoreWith({ melody: 'musical', key: key.id }, 1));
    assert.equal(data.key, key.id);
    assert.equal(data.tonality, key.label);
  }
});

test('settings are stored as they are, and copied in both directions', () => {
  const score = scoreWith({ positions: [2, 7], strings: [3, 2, 1], melody: 'musical' }, 9);
  const data = encodeScore(score);
  assert.deepEqual(data.settings, score.settings);
  assert.notEqual(data.settings, score.settings);
  assert.notEqual(data.settings.strings, score.settings.strings);

  // Settings the codec knows nothing about pass through untouched.
  const stored = throughJson(data);
  stored.settings.someLaterSetting = { tempo: 60 };
  const back = decodeScore(stored);
  assert.deepEqual(back.settings, stored.settings);
  assert.notEqual(back.settings, stored.settings);
  back.settings.strings.push(6);
  assert.deepEqual(stored.settings.strings, [3, 2, 1]);
});

// ---- Decoding: what the two versions share -------------------------------

bothVersions('a hand-written encoding decodes to the notes it names', encoding => {
  // E3 open, F#3, Gb3 (the same fret), then E5 open, F5 and F5 again.
  const n = [[40, 0, 4], [42, 1, 4], [42, -1, 4], [64, 0, 2], [65, 0, 1], [65, 0, 1]];
  const score = decodeScore(encoding(n, { seed: 123, tonality: 'A minor' }));
  const fret2 = [{ string: 6, fret: 2, finger: 2 }];
  const fret1 = [{ string: 1, fret: 1, finger: 1 }];
  assert.deepEqual(score, {
    seed: 123,
    settings: SETTINGS,
    key: null,
    tonality: 'A minor',
    measures: [{
      number: 1,
      position: 1,
      notes: [
        { pitch: { letter: 'E', octave: 3, alter: 0, value: 40, fingerings: [{ string: 6, fret: 0, finger: 0 }] }, start: 0, dur: 4 },
        { pitch: { letter: 'F', octave: 3, alter: 1, value: 42, fingerings: fret2 }, start: 4, dur: 4 },
        { pitch: { letter: 'G', octave: 3, alter: -1, value: 42, fingerings: fret2 }, start: 8, dur: 4 },
        { pitch: { letter: 'E', octave: 5, alter: 0, value: 64, fingerings: [{ string: 1, fret: 0, finger: 0 }] }, start: 12, dur: 2 },
        { pitch: { letter: 'F', octave: 5, alter: 0, value: 65, fingerings: fret1 }, start: 14, dur: 1 },
        { pitch: { letter: 'F', octave: 5, alter: 0, value: 65, fingerings: fret1 }, start: 15, dur: 1 }
      ]
    }]
  });
  // A Score has these five fields, in a study of either version.
  assert.deepEqual(Object.keys(score).sort(), ['key', 'measures', 'seed', 'settings', 'tonality']);
});

bothVersions('measures are numbered from one and starts are the running sum of the durations', encoding => {
  const data = encoding(null, {
    measures: [{ p: 1, n: QUARTERS }, { p: 5, n: [[57, 0, 2], [57, 0, 2], [60, 0, 4], [62, 0, 1], [62, 0, 1], [64, 0, 2], [57, 0, 4]] }]
  });
  const score = decodeScore(data);
  assert.deepEqual(score.measures.map(m => [m.number, m.position]), [[1, 1], [2, 5]]);
  assert.deepEqual(score.measures[1].notes.map(n => n.start), [0, 2, 4, 8, 9, 10, 12]);
});

bothVersions('a study may be shorter or longer than the sixteen measures generated today', encoding => {
  for (const count of [1, 2, 15, 16, 17, 40, 200]) {
    const score = decodeScore(encoding(null, { measures: new Array(count).fill({ p: 1, n: QUARTERS }) }));
    assert.deepEqual(score.measures.map(m => m.number), Array.from({ length: count }, (_, i) => i + 1));
    assert.deepEqual(score.measures.at(-1).notes.map(n => n.pitch.value), [40, 41, 43, 45]);
  }
});

bothVersions('fingerings come from the fretboard, narrowed to the enabled strings', encoding => {
  // B4 is the one note first position offers twice: fourth fret of the third
  // string, or the open second string.
  const b4 = strings => encoding(new Array(4).fill([59, 0, 4]), { settings: { strings } });
  const fingerings = strings => decodeScore(b4(strings)).measures[0].notes[0].pitch.fingerings;
  const third = { string: 3, fret: 4, finger: 4 };
  const second = { string: 2, fret: 0, finger: 0 };
  assert.deepEqual(fingerings([6, 5, 4, 3, 2, 1]), [third, second]);
  assert.deepEqual(fingerings([1, 2, 3]), [third, second]);
  assert.deepEqual(fingerings([3]), [third]);
  assert.deepEqual(fingerings([2, 1]), [second]);
  assertRefused(b4([6, 5, 4]), 'B4 lies on disabled strings only');
  assertRefused(b4([1]), 'B4 lies on disabled strings only');
});

bothVersions('extra fields are ignored and do not reach the score', encoding => {
  const data = encoding(QUARTERS, { title: 'Study', measures: [{ p: 1, n: QUARTERS, number: 99, start: 5 }] });
  assert.deepEqual(decodeScore(data), decodeScore(encoding(QUARTERS)));
  // Nor does anything a triple cannot hold: a fingering written into storage
  // is not a fingering.
  const smuggled = encoding(QUARTERS.map(triple => Object.assign([...triple], { fingerings: [{ string: 1, fret: 24, finger: 9 }] })));
  assert.deepEqual(decodeScore(smuggled), decodeScore(encoding(QUARTERS)));
});

bothVersions('the seed must be a non-negative safe integer', encoding => {
  for (const seed of [0, 1, 9999, 4294967295, Number.MAX_SAFE_INTEGER]) {
    assert.equal(decodeScore(encoding(QUARTERS, { seed })).seed, seed);
  }
  for (const seed of [-1, 1.5, 2 ** 53, NaN, Infinity, '7', null, undefined, [7]]) {
    assertRefused(encoding(QUARTERS, { seed }), `seed ${inspect(seed)}`);
  }
});

bothVersions('the tonality must be a string or null', encoding => {
  // Whatever label a version once gave, modes no longer on offer included.
  for (const tonality of [null, '', 'C major', 'F♯ Phrygian', 'G Mixolydian', 'D Dorian', 'B♭ major']) {
    assert.equal(decodeScore(encoding(QUARTERS, { tonality })).tonality, tonality);
  }
  for (const tonality of [undefined, 0, 1, true, [], {}, ['C major']]) {
    assertRefused(encoding(QUARTERS, { tonality }), `tonality ${inspect(tonality)}`);
  }
});

bothVersions('settings must be a plain object naming distinct strings from 1 to 6', encoding => {
  for (const strings of [[6], [1], [1, 6], [2, 4], [1, 2, 3, 4, 5, 6]]) {
    const score = decodeScore(encoding(lowestNote(1, strings), { settings: { strings, later: true } }));
    assert.deepEqual(score.settings, { strings, later: true });
  }
  // Every note below is on the sixth string, which each list of strings
  // enables, so only the settings themselves can be at fault.
  const onSixth = settings => encoding(lowestNote(1, [6]), { settings });
  assert.ok(decodeScore(onSixth({ strings: [6] })));
  const notPlain = [
    undefined, null, 'x', 7, [], [SETTINGS], new Map(), Object.create(SETTINGS), {},
    Object.assign([], SETTINGS), Object.assign(new (class Settings {})(), SETTINGS)
  ];
  for (const settings of notPlain) assertRefused(onSixth(settings), `settings ${inspect(settings)}`);
  const bad = [
    undefined, null, 6, '6', {}, { 0: 6, length: 1 }, new Set([6]), [],
    [6, 0], [6, 7], [6, -6], [6, 5.5], [6, '5'], [6, null], [6, NaN], [6, [5]],
    [6, 6], [6, 5, 4, 3, 2, 1, 6], [6, 5, 4, 3, 2, 1, 0]
  ];
  for (const strings of bad) assertRefused(onSixth({ strings }), `strings ${inspect(strings)}`);
});

bothVersions('settings are handed back as stored, old or unknown values included', encoding => {
  // The codec reads the strings and nothing else: the old accidentals switch,
  // a missing key and a key that does not exist all pass through, for
  // sanitize to deal with.
  for (const extra of [{ accidentals: true }, { accidentals: false }, { accidentals: 'flats', key: 'D' }, { key: 'H', melody: 'jazz' }]) {
    const settings = { strings: [6, 5, 4, 3, 2, 1], ...extra };
    const score = decodeScore(encoding(QUARTERS, { settings }));
    assert.deepEqual(score.settings, settings);
    assert.equal(score.key, null);
  }
});

bothVersions('measures must be a non-empty list of objects with a position and notes', encoding => {
  for (const measures of [undefined, null, [], {}, 'x', 16, [null], [[]], ['x'], [{}], [{ p: 1 }], [{ n: QUARTERS }]]) {
    assertRefused(encoding(QUARTERS, { measures }), `measures ${inspect(measures)}`);
  }
  // The right fields on the wrong kind of object.
  const measure = { p: 1, n: QUARTERS };
  assert.ok(decodeScore(encoding(null, { measures: [measure] })));
  for (const odd of [Object.assign([], measure), Object.create(measure), Object.assign(new (class Measure {})(), measure)]) {
    assertRefused(encoding(null, { measures: [odd] }), `measure ${inspect(odd)}`);
  }
  // One bad measure spoils the score.
  assertRefused(encoding(null, { measures: [measure, { p: 1, n: [] }] }), 'empty second measure');
  assertRefused(encoding(null, { measures: [measure, measure, null] }), 'null third measure');
});

bothVersions('the position must be a whole number from 1 to 12', encoding => {
  for (const p of POSITION_NUMBERS) {
    const data = encoding(null, { measures: [{ p, n: lowestNote(p, SETTINGS.strings) }] });
    assert.equal(decodeScore(data).measures[0].position, p);
  }
  for (const p of [0, 13, -1, 1.5, '1', NaN, null, undefined, [1], true]) {
    assertRefused(encoding(null, { measures: [{ p, n: QUARTERS }] }), `p ${inspect(p)}`);
  }
  // The notes above are out of reach of a thirteenth position anyway, so they
  // cannot show that the position itself is checked. Here each position
  // outside the range gets the note its own frets would begin with, on the
  // sixth string: nothing but the position is at fault.
  for (const p of [-1, 0, 13, 14, 24, 40, 99]) {
    const value = OPEN_STRINGS[0] + p;
    const alter = BLACK_KEYS.includes(value % 12) ? 1 : 0;
    const data = encoding(null, { measures: [{ p, n: new Array(4).fill([value, alter, 4]) }] });
    assertRefused(data, `p ${p} with a note of its own`);
  }
});

bothVersions('notes must be triples of whole numbers with a duration of 1, 2 or 4', encoding => {
  const withFirst = triple => encoding([triple, ...QUARTERS.slice(1)]);
  assert.ok(decodeScore(withFirst([40, 0, 4])));
  const bad = [
    undefined, null, 40, 'x', {}, [], [40], [40, 0], [40, 0, 4, 0], { 0: 40, 1: 0, 2: 4, length: 3 },
    new Uint8Array([40, 0, 4]),
    ['40', 0, 4], [40.5, 0, 4], [NaN, 0, 4], [null, 0, 4],
    [40, '0', 4], [40, null, 4], [40, 0.5, 4], [40, 2, 4], [40, -2, 4],
    [40, 0, '4'], [40, 0, 4.5], [40, 0, null], [40, 0, 0], [40, 0, -4], [40, 0, 3], [40, 0, 8], [40, 0, 16]
  ];
  for (const triple of bad) assertRefused(withFirst(triple), `triple ${inspect(triple)}`);
});

bothVersions('a measure must last exactly four beats', encoding => {
  const E = dur => [40, 0, dur];
  const fill = durs => encoding(durs.map(E));
  for (const durs of [[4, 4, 4, 4], [2, 2, 2, 2, 2, 2, 2, 2], new Array(16).fill(1), [4, 2, 2, 1, 1, 2, 2, 1, 1]]) {
    assert.ok(decodeScore(fill(durs)), `${durs}`);
  }
  for (const durs of [[4], [4, 4, 4], [4, 4, 4, 2], [4, 4, 4, 2, 1], [4, 4, 4, 4, 1], [4, 4, 4, 4, 4], new Array(17).fill(1), new Array(32).fill(1)]) {
    assertRefused(fill(durs), `${durs}`);
  }
});

bothVersions('only quarters, eighths and sixteenths are accepted, even where another value would fit', encoding => {
  const fill = durs => encoding(durs.map(dur => [40, 0, dur]));
  // A dotted eighth inside one beat, halves of a sixteenth, a half note, a whole note.
  const fitting = [
    [3, 1, 4, 4, 4], [1, 3, 4, 4, 4], [4, 4, 4, 3, 1], [0.5, 0.5, 1, 2, 4, 4, 4], [2.5, 1.5, 4, 4, 4],
    [8, 4, 4], [8, 8], [16]
  ];
  for (const durs of fitting) {
    assert.equal(durs.reduce((a, b) => a + b, 0), 16);
    assertRefused(fill(durs), `${durs}`);
  }
});

bothVersions('no note may cross a beat', encoding => {
  const fill = durs => encoding(durs.map(dur => [40, 0, dur]));
  // Each of these adds up to four beats and still ties a note over a beat.
  for (const durs of [[2, 4, 2, 4, 4], [1, 4, 1, 2, 4, 4], [1, 1, 1, 2, 1, 2, 4, 4], [4, 4, 2, 1, 2, 1, 2], [4, 4, 1, 1, 1, 2, 1, 2]]) {
    assert.equal(durs.reduce((a, b) => a + b, 0), 16);
    assertRefused(fill(durs), `${durs}`);
  }
});

bothVersions('a note must be playable in its measure\'s position', encoding => {
  for (const position of POSITION_NUMBERS) {
    const playable = new Set(poolFor(position, { accidentals: 'sharps', strings: SETTINGS.strings }).map(p => p.value));
    for (let value = 30; value <= 90; value++) {
      const alter = BLACK_KEYS.includes(value % 12) ? 1 : 0;
      const data = encoding(null, { measures: [{ p: position, n: new Array(4).fill([value, alter, 4]) }] });
      assert.equal(Boolean(decodeScore(data)), playable.has(value), `${value} in position ${position}`);
    }
  }
});

bothVersions('a stored -0 is read as the 0 it stands for', encoding => {
  // JSON has a -0, though no encoder writes one. It is not the same number as
  // 0, and a pitch that carried it would not equal the pitch that was saved.
  const stored = JSON.parse(JSON.stringify(encoding(QUARTERS)).replace('[40,0,4]', '[40,-0,4]'));
  assert.ok(Object.is(stored.measures[0].n[0][1], -0));
  const score = decodeScore(stored);
  assert.deepEqual(score, decodeScore(encoding(QUARTERS)));
  assert.ok(Object.is(score.measures[0].notes[0].pitch.alter, 0));
});

bothVersions('holes in a list are refused, not skipped', encoding => {
  // The notes are on the sixth string, so the hole is all that is wrong here.
  assertRefused(encoding(lowestNote(1, [6]), { settings: { strings: [6, , 4] } }), 'strings');
  assertRefused(encoding(null, { measures: [{ p: 1, n: QUARTERS }, , { p: 1, n: QUARTERS }] }), 'measures');
  assertRefused(encoding([[40, 0, 4], , [40, 0, 4], [40, 0, 4], [40, 0, 4]]), 'notes');
  assertRefused(encoding([[40, , 4], ...QUARTERS.slice(1)]), 'triple');
  assertRefused(encoding(null, { measures: new Array(16) }), 'nothing but holes');
});

bothVersions('data that answers differently the second time is judged by what is used', encoding => {
  // Settings that are a plain object when checked and a list when taken. The
  // notes are on the sixth string, so the list alone is what must be refused.
  const onSixth = settings => encoding(lowestNote(1, [6]), { settings });
  const asList = Object.assign([], { strings: [6] });
  assertRefused(onSixth(asList), 'a list as settings');
  let reads = 0;
  const shifting = Object.defineProperty(onSixth(null), 'settings', {
    enumerable: true,
    get: () => (reads++ === 0 ? { strings: [6] } : asList)
  });
  const score = decodeScore(shifting);
  assert.equal(reads, 1);
  assert.deepEqual(score.settings, { strings: [6] });

  // A version that is right when checked and another one after.
  const { v } = encoding(QUARTERS);
  let versionReads = 0;
  const relabelled = Object.defineProperty(encoding(QUARTERS), 'v', {
    enumerable: true,
    get: () => (versionReads++ === 0 ? v : 3)
  });
  assert.deepEqual(decodeScore(relabelled), decodeScore(encoding(QUARTERS)));
  assert.equal(versionReads, 1);

  // Measures that claim a length and hand nothing over when walked.
  const vanishing = [{ p: 1, n: QUARTERS }];
  assert.ok(decodeScore(encoding(null, { measures: [...vanishing] })));
  vanishing[Symbol.iterator] = function* () {};
  assert.equal(vanishing.length, 1);
  assertRefused(encoding(null, { measures: vanishing }), 'measures that vanish');
});

// ---- Decoding: where the versions differ ---------------------------------

test('versions 1 and 2 are read, and nothing else passes for a version', () => {
  assert.ok(decodeScore(encodingV1(QUARTERS)));
  assert.ok(decodeScore(encodingV2(QUARTERS)));
  // A later version may mean something else by the same fields, so its data is
  // refused however well it reads, and with it everything that is not quite a
  // version number.
  const others = [0, 3, 4, 99, -1, -2, 1.5, 2.5, '1', '2', 'v2', true, false, null, undefined, NaN, Infinity, [1], [2], { v: 2 }, 1n, 2n];
  for (const v of others) {
    assertRefused(encodingV1(QUARTERS, { v }), `v ${inspect(v)} on a version-1 encoding`);
    assertRefused(encodingV2(QUARTERS, { v }), `v ${inspect(v)} on a version-2 encoding`);
  }
  for (const encoding of [encodingV1, encodingV2]) {
    const unlabelled = encoding(QUARTERS);
    delete unlabelled.v;
    assertRefused(unlabelled, 'no version at all');
  }
});

test('version 1 has no key, whatever sits under that name', () => {
  const plain = decodeScore(encodingV1(QUARTERS));
  assert.equal(plain.key, null);
  for (const key of ['D', 'Bb', 'F#m', 'nonsense', '', 7, true, null, undefined, [], {}, { id: 'D' }]) {
    const score = decodeScore(encodingV1(QUARTERS, { key }));
    assert.deepEqual(score, plain, `key ${inspect(key)}`);
  }
  // Nor is a key looked for in the settings, where a later version keeps one.
  assert.equal(decodeScore(encodingV1(QUARTERS, { settings: { ...SETTINGS, melody: 'musical', key: 'D' } })).key, null);
  // The field is not so much as read.
  let reads = 0;
  const watched = Object.defineProperty(encodingV1(QUARTERS), 'key', {
    enumerable: true,
    get: () => { reads++; throw new Error('boom'); }
  });
  assert.deepEqual(decodeScore(watched), plain);
  assert.equal(reads, 0);
});

// The ids of the keys on offer when version 2 was introduced. They are part
// of the stored format: a study saved in a key is found again by this id, so
// one that is renamed or withdrawn takes people's saved studies with it.
const STORED_KEY_IDS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Am', 'Em', 'Bm', 'F#m', 'C#m', 'Dm', 'Gm'];

test('version 2: the key must be null or the id of a key on offer', () => {
  assert.equal(decodeScore(encodingV2(QUARTERS)).key, null);
  for (const key of [...STORED_KEY_IDS, ...KEYS.map(k => k.id)]) {
    const score = decodeScore(encodingV2(QUARTERS, { key }));
    assert.ok(score, `key ${key}`);
    assert.equal(score.key, key);
    // The key says nothing about the label, which is kept as stored.
    assert.equal(score.tonality, null);
  }
  const unlabelled = encodingV2(QUARTERS);
  delete unlabelled.key;
  assertRefused(unlabelled, 'no key field');
  const unknown = [
    undefined, '', ' ', 'H', 'c', 'bb', 'BB', 'Cm', 'Eb', 'F#', 'F♯m', 'B♭', 'C major', 'A minor', 'C ', ' C', 'null',
    0, 1, -1, NaN, true, false, [], ['C'], {}, { id: 'C' }, keyById('C'), new String('C'), () => 'C', Symbol('C')
  ];
  for (const key of unknown) assertRefused(encodingV2(QUARTERS, { key }), `key ${inspect(key)}`);
});

test('version 2: the key is read once', () => {
  let reads = 0;
  const shifting = Object.defineProperty(encodingV2(QUARTERS), 'key', {
    enumerable: true,
    get: () => (reads++ === 0 ? 'G' : 'nonsense')
  });
  assert.equal(decodeScore(shifting).key, 'G');
  assert.equal(reads, 1);
});

test('version 2: a hand-written encoding in a key decodes to the notes it names', () => {
  // F sharp minor in first position: F#3, its leading note E#4, then B#3, Cb4,
  // Fb4, Bb4, B4 (which has two fingerings) and C#5.
  const n = [[42, 1, 4], [53, 1, 2], [48, 1, 2], [47, -1, 4], [52, -1, 1], [58, -1, 1], [59, 0, 1], [61, 1, 1]];
  const score = decodeScore(encodingV2(n, { seed: 2468, tonality: 'F♯ minor', key: 'F#m' }));
  const pitch = (letter, octave, alter, value, ...fingerings) => ({
    letter, octave, alter, value, fingerings: fingerings.map(([string, fret, finger]) => ({ string, fret, finger }))
  });
  assert.deepEqual(score, {
    seed: 2468,
    settings: SETTINGS,
    key: 'F#m',
    tonality: 'F♯ minor',
    measures: [{
      number: 1,
      position: 1,
      notes: [
        { pitch: pitch('F', 3, 1, 42, [6, 2, 2]), start: 0, dur: 4 },
        { pitch: pitch('E', 4, 1, 53, [4, 3, 3]), start: 4, dur: 2 },
        { pitch: pitch('B', 3, 1, 48, [5, 3, 3]), start: 6, dur: 2 },
        { pitch: pitch('C', 4, -1, 47, [5, 2, 2]), start: 8, dur: 4 },
        { pitch: pitch('F', 4, -1, 52, [4, 2, 2]), start: 12, dur: 1 },
        { pitch: pitch('B', 4, -1, 58, [3, 3, 3]), start: 13, dur: 1 },
        { pitch: pitch('B', 4, 0, 59, [3, 4, 4], [2, 0, 0]), start: 14, dur: 1 },
        { pitch: pitch('C', 5, 1, 61, [2, 2, 2]), start: 15, dur: 1 }
      ]
    }]
  });
  assert.deepEqual(allNotes(score).map(note => pitchName(note.pitch)), ['F♯3', 'E♯4', 'B♯3', 'C♭4', 'F♭4', 'B♭4', 'B4', 'C♯5']);
});

test('version 1: alter must agree with the pitch: plain white keys, sharp or flat black keys', () => {
  const pool = poolFor(1, { accidentals: 'sharps', strings: SETTINGS.strings });
  const withFirst = triple => encodingV1([triple, ...QUARTERS.slice(1)]);
  for (const { value, alter } of pool) {
    const white = alter === 0;
    assert.equal(Boolean(decodeScore(withFirst([value, 0, 4]))), white, `${value} natural`);
    assert.equal(Boolean(decodeScore(withFirst([value, 1, 4]))), !white, `${value} sharp`);
    assert.equal(Boolean(decodeScore(withFirst([value, -1, 4]))), !white, `${value} flat`);
  }
  // The two spellings of a black key differ in letter, not in value or fingering.
  const sharp = decodeScore(withFirst([42, 1, 4])).measures[0].notes[0].pitch;
  const flat = decodeScore(withFirst([42, -1, 4])).measures[0].notes[0].pitch;
  assert.deepEqual([sharp.letter, sharp.alter, flat.letter, flat.alter], ['F', 1, 'G', -1]);
  assert.deepEqual(sharp.fingerings, flat.fingerings);
});

bothVersions('every note of every position is read as the letter its alteration names, or refused', encoding => {
  const { v } = encoding(QUARTERS);
  let read = 0;
  let refused = 0;
  for (const position of POSITION_NUMBERS) {
    for (const strings of [ALL_STRINGS, [5, 2]]) {
      for (const entry of poolFor(position, { accidentals: 'sharps', strings })) {
        for (const alter of ALTERS) {
          const data = encoding(null, { settings: { strings }, measures: [{ p: position, n: new Array(4).fill([entry.value, alter, 4]) }] });
          const spelling = spellingIn(v, entry.value, alter);
          const label = `${entry.value} with alter ${alter} in position ${position}`;
          if (!spelling) {
            assertRefused(data, label);
            refused++;
            continue;
          }
          const { pitch } = decodeScore(data).measures[0].notes[3];
          assert.deepEqual(pitch, { ...spelling, alter, value: entry.value, fingerings: entry.fingerings }, label);
          read++;
        }
      }
    }
  }
  // Of the thirty-six pairs of a pitch class and an alteration, version 1 has
  // seventeen spellings and version 2 twenty-one, so both outcomes are common.
  assert.ok(read > 400 && refused > 400, `${read} read, ${refused} refused`);
});

test('version 2 reads every spelling version 1 has, the same way, and four more', () => {
  const added = new Set();
  for (const position of [1, 6, 12]) {
    for (const { value } of poolFor(position, { accidentals: 'sharps', strings: ALL_STRINGS })) {
      for (const alter of ALTERS) {
        const measures = [{ p: position, n: new Array(4).fill([value, alter, 4]) }];
        const old = decodeScore(encodingV1(null, { measures }));
        const now = decodeScore(encodingV2(null, { measures }));
        if (old) assert.deepEqual(now, old, `${value} with alter ${alter}`);
        else if (now) added.add(pitchName(now.measures[0].notes[0].pitch).replace(/\d/, ''));
      }
    }
  }
  assert.deepEqual([...added].sort(), ['B♯', 'C♭', 'E♯', 'F♭']);
});

test('a version label decides how the rest is read', () => {
  // Version-1 notes under a version-2 label: with a key (null is one) they are
  // the same study, without one they are not version 2.
  for (const fixture of V1_FIXTURES) {
    const stored = JSON.parse(fixture.text);
    assertRefused({ ...stored, v: 2 }, `${fixture.name} relabelled, no key`);
    assert.deepEqual(decodeScore({ ...stored, v: 2, key: null }), writtenScore(fixture), fixture.name);
    assert.deepEqual(decodeScore({ ...stored, v: 2, key: 'G' }), { ...writtenScore(fixture), key: 'G' }, fixture.name);
  }
  // Version-2 data under a version-1 label is read by version 1's rules: the
  // key is not looked at, and a spelling version 1 lacks is refused.
  const inG = encodingV2(QUARTERS, { key: 'G', tonality: 'G major' });
  assert.deepEqual(decodeScore({ ...inG, v: 1 }), { ...decodeScore(inG), key: null });
  const eSharp = encodingV2([[53, 1, 4], ...QUARTERS.slice(1)], { key: 'F#m' });
  assert.equal(pitchName(decodeScore(eSharp).measures[0].notes[0].pitch), 'E♯4');
  assertRefused({ ...eSharp, v: 1 }, 'E sharp under a version-1 label');
  const awkward = throughJson(encodeScore(keyedScore('C#m', 1)));
  assert.ok(decodeScore(awkward));
  assertRefused({ ...awkward, v: 1 }, 'C sharp minor with its B sharp under a version-1 label');
});

// ---- Refusals ------------------------------------------------------------

// A valid stored encoding of each version, fresh each time.
const validV1 = () => JSON.parse(V1_ROTATING);
const validV2 = () => throughJson(encodeScore(scoreWith({}, 1)));
const validInKey = () => throughJson(encodeScore(keyedScore('F#m', 1)));

test('anything that is not an encoding is refused without throwing', () => {
  for (const valid of [validV1(), validV2(), validInKey()]) {
    assert.ok(decodeScore(valid));
    const things = [
      undefined, null, 0, 1, 2, -1, NaN, Infinity, 1n, '', 'x', '{}', JSON.stringify(valid), true, false,
      Symbol('score'), () => valid, [], [valid], {}, new Map(Object.entries(valid)), new Date(0), /v/,
      Object.create(null), Object.create(valid), Object.assign(new (class Saved {})(), valid)
    ];
    for (const thing of things) assertRefused(thing, inspect(thing).slice(0, 60));
  }
});

test('hostile objects are refused without throwing', () => {
  const boom = () => { throw new Error('boom'); };
  const trapped = target => new Proxy(target, {
    get: boom, has: boom, ownKeys: boom, getPrototypeOf: boom, getOwnPropertyDescriptor: boom
  });
  const exploding = (object, key) => Object.defineProperty(object, key, { enumerable: true, get: boom });
  const touchy = { valueOf: boom, toString: boom, [Symbol.toPrimitive]: boom };
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();

  assertRefused(trapped({}), 'proxy');
  assertRefused(revoked.proxy, 'revoked proxy');

  // Every field a version reads. Version 1 reads no key.
  const versions = [
    ['version 1', validV1, ['v', 'seed', 'tonality', 'settings', 'measures']],
    ['version 2', validV2, ['v', 'seed', 'tonality', 'key', 'settings', 'measures']],
    ['version 2 in a key', validInKey, ['v', 'seed', 'tonality', 'key', 'settings', 'measures']]
  ];
  for (const [version, valid, fields] of versions) {
    assert.ok(decodeScore(valid()), version);
    assertRefused(trapped(valid()), `${version}: proxy over a valid encoding`);
    for (const key of fields) {
      assertRefused(exploding(valid(), key), `${version}: getter on ${key}`);
      assertRefused({ ...valid(), [key]: trapped({}) }, `${version}: proxy as ${key}`);
      assertRefused({ ...valid(), [key]: revoked.proxy }, `${version}: revoked proxy as ${key}`);
      assertRefused({ ...valid(), [key]: touchy }, `${version}: touchy object as ${key}`);
    }

    const inSettings = valid();
    const { strings } = inSettings.settings;
    exploding(inSettings.settings, 'strings');
    assertRefused(inSettings, `${version}: getter on strings`);
    assertRefused({ ...valid(), settings: { strings: trapped([...strings]) } }, `${version}: proxy as strings`);
    assertRefused({ ...valid(), settings: { strings, f: boom } }, `${version}: a function in settings`);

    for (const key of ['p', 'n']) {
      const data = valid();
      exploding(data.measures[3], key);
      assertRefused(data, `${version}: getter on a measure's ${key}`);
      const other = valid();
      other.measures[3][key] = touchy;
      assertRefused(other, `${version}: touchy object as a measure's ${key}`);
    }
    const data = valid();
    data.measures[2] = trapped(data.measures[2]);
    assertRefused(data, `${version}: proxy as a measure`);
    for (const index of [0, 1, 2]) {
      const inTriple = valid();
      inTriple.measures[5].n[1][index] = touchy;
      assertRefused(inTriple, `${version}: touchy object at ${index} of a triple`);
    }
    const trappedTriple = valid();
    trappedTriple.measures[5].n[1] = trapped(trappedTriple.measures[5].n[1]);
    assertRefused(trappedTriple, `${version}: proxy as a triple`);
  }
});

// Wrong wherever a number, a list or an object is expected, and not a valid
// value of any field of the encoding.
const WRONG = [
  undefined, null, NaN, Infinity, -Infinity, 1.5, -0.5, 1e21, '', '1', '4', 'x', true, false,
  [], [null], [[]], {}, { length: 1 }, { p: 1 }, () => 1, Symbol('wrong'), 1n, new Date(0)
];

// Every way of spoiling one field of a valid encoding: [label, spoiled copy].
function* malformed(valid) {
  const variant = (label, change) => {
    const copy = throughJson(valid);
    change(copy);
    return [label, copy];
  };
  const replace = function* (label, target, key, values) {
    for (const value of values) {
      yield variant(`${label} = ${inspect(value)}`, copy => { target(copy)[key] = value; });
    }
  };
  const remove = (label, target, key) => variant(`${label} removed`, copy => { delete target(copy)[key]; });
  const top = copy => copy;

  yield remove('v', top, 'v');
  // The other version's label is wrong on version-1 data, which has no key.
  // On version-2 data it is a different reading, not a refusal: see 'a
  // version label decides how the rest is read'.
  yield* replace('v', top, 'v', [...WRONG, 0, 3, -1, ...(valid.v === 1 ? [2] : [])]);
  yield remove('seed', top, 'seed');
  yield* replace('seed', top, 'seed', [...WRONG, -1, -9999, 2 ** 53]);
  yield remove('tonality', top, 'tonality');
  yield* replace('tonality', top, 'tonality', [...WRONG.filter(w => w !== null && typeof w !== 'string'), 0, 1]);
  if (valid.v === 2) {
    yield remove('key', top, 'key');
    yield* replace('key', top, 'key',
      [...WRONG.filter(w => w !== null), 0, 1, 'H', 'c', 'Cm', 'Eb', 'C major', ['C'], { id: 'C' }]);
  }
  yield remove('settings', top, 'settings');
  yield* replace('settings', top, 'settings', [...WRONG, { strings: [] }, { positions: [5] }]);
  yield remove('strings', copy => copy.settings, 'strings');
  yield* replace('strings', copy => copy.settings, 'strings',
    [...WRONG, 6, '654321', [0], [7], [-1], [1.5], ['6'], [6, 6], [6, 5, 4, 3, 2, 1, 0], [1, 2, 3, 4, 5, 6, 7]]);
  yield remove('measures', top, 'measures');
  yield* replace('measures', top, 'measures', [...WRONG, 16, [{}], [{ p: 5 }]]);

  const last = valid.measures.length - 1;
  for (const m of [0, last >> 1, last]) {
    const measure = copy => copy.measures[m];
    const here = `measure ${m + 1}`;
    yield* replace(here, copy => copy.measures, m, [...WRONG, 5]);
    yield remove(`${here} p`, measure, 'p');
    yield* replace(`${here} p`, measure, 'p', [...WRONG, 0, 13, -1, -5, 99]);
    yield remove(`${here} n`, measure, 'n');
    yield* replace(`${here} n`, measure, 'n', [...WRONG, 16, [[57]], [[57, 0, 16]]]);
    yield variant(`${here} one note short`, copy => { measure(copy).n.pop(); });
    yield variant(`${here} one note over`, copy => { measure(copy).n.push([...measure(copy).n[0]]); });
    yield variant(`${here} played twice`, copy => { measure(copy).n.push(...throughJson(measure(copy).n)); });

    const lastNote = valid.measures[m].n.length - 1;
    for (const i of [0, lastNote]) {
      const [value, , dur] = valid.measures[m].n[i];
      const triple = copy => measure(copy).n[i];
      const note = `${here} note ${i + 1}`;
      // The alterations this version cannot put on this note.
      const unspellable = ALTERS.filter(alter => !spellingIn(valid.v, value, alter));
      yield* replace(note, copy => measure(copy).n, i, [...WRONG, value, [value], [value, 0]]);
      yield variant(`${note} cut short`, copy => { triple(copy).pop(); });
      yield variant(`${note} with a fourth number`, copy => { triple(copy).push(0); });
      // No position reaches below E3 (40) or above G6 (79).
      yield* replace(`${note} value`, triple, 0, [...WRONG, -1, 0, 1, 39, 80, 127, 1000]);
      yield* replace(`${note} alter`, triple, 1, [...WRONG, 2, -2, 3, ...unspellable]);
      // Any other duration changes the length of the measure.
      yield* replace(`${note} dur`, triple, 2, [...WRONG, -1, 0, 3, 8, 16, ...[1, 2, 4].filter(d => d !== dur)]);
    }
  }
}

// Refuses every malformed variant of each valid encoding, and says how many.
const refuseVariants = sources => {
  let count = 0;
  for (const valid of sources) {
    assert.ok(decodeScore(valid));
    for (const [label, variant] of malformed(valid)) {
      assertRefused(variant, label);
      count++;
    }
  }
  return count;
};

test('version 1: every malformed variant of a valid encoding is refused without throwing', () => {
  const sources = V1_FIXTURES.map(fixture => JSON.parse(fixture.text));
  for (const valid of sources) assert.equal(valid.v, 1);
  const count = refuseVariants(sources);
  assert.ok(count > 3000, `only ${count} variants`);
});

test('version 2: every malformed variant of a valid encoding is refused without throwing', () => {
  const scores = [
    scoreWith({}, 1),
    scoreWith({ melody: 'musical', accidentals: 'sharps', noteValues: ALL_VALUES, positions: [1, 7, 12], rotatePositions: true }, 2),
    scoreWith({ ...DENSE, strings: [4, 3, 2] }, 3),
    // In keys, with the spellings only version 2 has.
    keyedScore('F#m', 1),
    keyedScore('C#m', 4, [5, 4, 3]),
    keyedScore('Bb', 10)
  ];
  const sources = scores.map(score => {
    const valid = throughJson(encodeScore(score));
    assert.equal(valid.v, 2);
    assert.deepEqual(decodeScore(valid), score);
    return valid;
  });
  const count = refuseVariants(sources);
  assert.ok(count > 6000, `only ${count} variants`);
});

// Every place in a JSON tree where a value sits: [container, key].
const slots = (node, out = []) => {
  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      out.push([node, key]);
      slots(node[key], out);
    }
  }
  return out;
};

// Plausible values as well as nonsense, so that some damage stays valid.
const JUNK = [
  ...WRONG, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 16, 40, 45, 52, 57, 58, 60, 64, 69, 72, 79, 80,
  'C major', 'G', 'F#m', [6, 5, 4], [1], [57, 0, 4], [58, 1, 2], [58, -1, 1], { p: 5, n: [[57, 0, 4]] }
];

// Damages one place of a valid encoding, 4,000 times over, and holds the
// decoder to what the damaged data says. Returns how the rounds went.
const damage = (sources, rng) => {
  let accepted = 0;
  let refused = 0;
  for (let round = 0; round < 4000; round++) {
    const data = throughJson(sources[round % sources.length]);
    const [container, key] = pick(rng, slots(data));
    const roll = rng();
    if (roll < 0.7) {
      container[key] = pick(rng, JUNK);
    } else if (Array.isArray(container)) {
      if (roll < 0.85) container.splice(key, 1);
      else container.splice(key, 0, throughJson(container[key]));
    } else {
      delete container[key];
    }

    let score;
    assert.doesNotThrow(() => { score = decodeScore(data); });
    if (score === null) {
      refused++;
      continue;
    }
    accepted++;
    // Whatever is accepted must say the same thing when encoded again: as it
    // stands if it is version 2, and as version 2 without a key if it is (or
    // has been damaged into) version 1. Every note must be a real note of its
    // position.
    assert.deepEqual(encodeScore(score), data.v === 1 ? { ...data, v: 2, key: null } : data);
    for (const measure of score.measures) {
      const pool = poolFor(measure.position, { accidentals: 'sharps', strings: score.settings.strings });
      assert.equal(measure.notes.reduce((sum, n) => sum + n.dur, 0), 16);
      for (const { pitch } of measure.notes) {
        assert.deepEqual(pitch.fingerings, pool.find(p => p.value === pitch.value).fingerings);
        assert.deepEqual(spellingIn(data.v, pitch.value, pitch.alter), { letter: pitch.letter, octave: pitch.octave });
      }
    }
  }
  return { accepted, refused };
};

test('version 1: random damage is refused, or decodes to exactly what the damaged data says', () => {
  const sources = [V1_MIXOLYDIAN, V1_ROTATING].map(text => JSON.parse(text));
  const { accepted, refused } = damage(sources, mulberry32(1986));
  assert.ok(accepted > 100 && refused > 1000, `${accepted} accepted, ${refused} refused`);
});

test('version 2: random damage is refused, or decodes to exactly what the damaged data says', () => {
  const sources = [
    scoreWith({ melody: 'musical', accidentals: 'sharps', noteValues: ALL_VALUES }, 5),
    scoreWith({ accidentals: 'sharps', noteValues: ['quarter', 'eighth'], positions: [4, 5, 6], rotatePositions: true }, 6),
    keyedScore('F#m', 1),
    keyedScore('Gm', 8, [4, 3, 2, 1])
  ].map(score => throughJson(encodeScore(score)));
  const { accepted, refused } = damage(sources, mulberry32(2024));
  assert.ok(accepted > 100 && refused > 1000, `${accepted} accepted, ${refused} refused`);
});

// ---- Size ----------------------------------------------------------------

test('the densest study encodes to under 3,072 characters of JSON', () => {
  // Sixteen measures of sixteenths with accidentals: 256 notes, 2,770 to 2,920
  // characters when this was written, the longest being those with flats (a
  // flat is stored as -1, a character more than a sharp). A library is one
  // localStorage value, and the limit browsers document is about five million
  // characters for an origin, so this bound leaves room for some 1,600 of the
  // densest studies.
  const densest = [
    DENSE,
    { ...DENSE, accidentals: 'flats' },
    { ...DENSE, melody: 'musical' },
    { ...DENSE, positions: POSITION_NUMBERS, rotatePositions: true },
    { ...DENSE, accidentals: 'flats', positions: POSITION_NUMBERS, rotatePositions: true },
    { ...DENSE, melody: 'musical', positions: [10, 11, 12], rotatePositions: true },
    // The keys with the most flats, and the one with the longest id.
    { ...DENSE, melody: 'musical', key: 'Bb', positions: [10, 11, 12], rotatePositions: true },
    { ...DENSE, melody: 'musical', key: 'Gm', positions: [10, 11, 12], rotatePositions: true },
    { ...DENSE, melody: 'musical', key: 'F#m', positions: [10, 11, 12], rotatePositions: true }
  ];
  for (const overrides of densest) {
    for (const seed of [...seeds(12), 9999]) {
      const score = scoreWith(overrides, seed);
      assert.equal(allNotes(score).length, 256);
      const { length } = JSON.stringify(encodeScore(score));
      assert.ok(length < 3072, `${length} characters`);
    }
  }
  // The default study, quarter notes in one position, is about a third of that.
  assert.ok(JSON.stringify(encodeScore(scoreWith({}, 1))).length < 1100);
});
