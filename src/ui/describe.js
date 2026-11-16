// The words that go with a score: its title, the lines under it and the plate
// number. Pure text, shared by the on-screen title block, the saved-scores
// list, and the PDF export, so all three always say the same thing.
import { ROMAN, notePool } from '../music/fretboard.js';
import { FLAT_ORDER, SHARP_ORDER, pitchName } from '../music/pitch.js';
import { DEFAULT_KEY, keyById } from '../music/theory.js';

const list = words =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} & ${words[words.length - 1]}`;

const stringsText = strings =>
  strings.length === 6 ? 'all strings' : `string${strings.length > 1 ? 's' : ''} ${strings.join(', ')}`;

const positionsText = positions =>
  `Position${positions.length > 1 ? 's' : ''} ${positions.map(p => ROMAN[p]).join(' · ')}`;

// What the accidentals setting means for the notes. Random mode has no key,
// so the setting chooses how the black keys are written; in Musical mode the
// key decides that, and the setting only says whether notes from outside the
// key may appear.
const ACCIDENTALS_LONG = { none: 'natural notes', sharps: 'with sharps', flats: 'with flats' };
const ACCIDENTALS_SHORT = { none: 'naturals', sharps: 'sharps', flats: 'flats' };
// Settings normally arrive through sanitize, but a score can be described
// before that (straight from the codec), so the old on-off value still reads.
const spelling = settings => {
  if (settings.accidentals === true) return 'sharps';
  // Compared by name, not looked up: "constructor" is a property of every object.
  return settings.accidentals === 'sharps' || settings.accidentals === 'flats' ? settings.accidentals : 'none';
};
const chromatic = settings => spelling(settings) !== 'none';
const accidentalsText = settings => (settings.melody === 'musical'
  ? (chromatic(settings) ? 'with chromatic notes' : 'notes of the key only')
  : ACCIDENTALS_LONG[spelling(settings)]);
const accidentalsBrief = settings => (settings.melody === 'musical'
  ? (chromatic(settings) ? 'chromatic' : 'in key')
  : ACCIDENTALS_SHORT[spelling(settings)]);
const keyLabel = settings => (keyById(settings.key) || keyById(DEFAULT_KEY)).label;

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

// A key's name as it is said aloud: "F sharp minor". The signs are for the
// eye; a screen reader may skip them or read them out as symbols.
export const spokenKey = label => label.replace('♯', ' sharp').replace('♭', ' flat');

// A key and its signature in a sentence: "D major: two sharps, F♯ C♯."
export function describeKey(key) {
  const count = Math.abs(key.signature);
  if (count === 0) return `${key.label}: no sharps or flats.`;
  const flat = key.signature < 0;
  const signs = (flat ? FLAT_ORDER : SHARP_ORDER).slice(0, count).map(l => l + (flat ? '♭' : '♯'));
  return `${key.label}: ${COUNT_WORDS[count]} ${flat ? 'flat' : 'sharp'}${count > 1 ? 's' : ''}, ${signs.join(' ')}.`;
}

// Written range covered by a set of positions under the given settings.
function rangeText(positions, settings) {
  const pools = positions.map(p => notePool(p, settings));
  const low = pools.map(pool => pool[0]).reduce((a, b) => (b.value < a.value ? b : a));
  const high = pools.map(pool => pool[pool.length - 1]).reduce((a, b) => (b.value > a.value ? b : a));
  return `${pitchName(low)}–${pitchName(high)} as written`;
}

// Positions in order of first appearance: when rotating, this is the cycle.
const positionsUsed = score => [...new Set(score.measures.map(m => m.position))];

export const studyName = score => `Étude No. ${score.seed}`;

// A score is described by the settings it was generated with, which for a
// saved score may differ from what the settings panel shows now.
export function describeScore(score) {
  const { settings } = score;
  const used = positionsUsed(score);
  return {
    dedication: 'for the classical guitar',
    title: 'Étude',
    number: `No. ${score.seed}`,
    left: score.tonality ? `Melody in ${score.tonality}` : 'Notes drawn at random',
    right: positionsText(used),
    meta: [
      `${score.measures.length} measures in 4/4`,
      `${list(settings.noteValues)} notes`,
      accidentalsText(settings),
      stringsText(settings.strings),
      rangeText(used, settings)
    ].join(' · '),
    plate: `G. R. A. — ${String(score.seed).padStart(4, '0')}`
  };
}

export function describeNoteMap(settings) {
  return {
    dedication: 'a table of the',
    title: 'Notes',
    number: '',
    left: 'Numbers are left-hand fingers; 0 is an open string',
    right: positionsText(settings.positions),
    meta: [
      settings.melody === 'musical' ? keyLabel(settings) : null,
      accidentalsText(settings),
      stringsText(settings.strings)
    ].filter(Boolean).join(' · '),
    // Kept apart from meta: it only makes sense on a screen, so a printed
    // page leaves it out.
    hint: 'hover or tap a note for its strings and frets',
    plate: 'G. R. A.'
  };
}

// One line for a row in the saved-scores list.
export function describeBriefly(score) {
  const { settings } = score;
  return [
    score.tonality ? score.tonality : 'random',
    positionsText(positionsUsed(score)),
    `${list(settings.noteValues)} notes`,
    accidentalsBrief(settings)
  ].join(' · ');
}

// One line for the folded settings panel on narrow screens.
export function summarizeSettings(settings) {
  return [
    `Pos. ${settings.positions.map(p => ROMAN[p]).join(', ')}${settings.rotatePositions ? ' (rotating)' : ''}`,
    stringsText(settings.strings),
    list(settings.noteValues),
    settings.melody === 'musical' ? keyLabel(settings) : 'random',
    accidentalsBrief(settings)
  ].join(' · ');
}

// A file name for an exported study: "etude-0417".
export const fileStem = score => `etude-${String(score.seed).padStart(4, '0')}`;
