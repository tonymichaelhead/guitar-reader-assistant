// The words that go with a score: its title, the lines under it and the plate
// number. Pure text, shared by the on-screen title block, the saved-scores
// list, and the PDF export, so all three always say the same thing.
import { ROMAN, poolFor } from '../music/fretboard.js';
import { pitchName } from '../music/pitch.js';

const list = words =>
  words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} & ${words[words.length - 1]}`;

const stringsText = strings =>
  strings.length === 6 ? 'all strings' : `string${strings.length > 1 ? 's' : ''} ${strings.join(', ')}`;

const positionsText = positions =>
  `Position${positions.length > 1 ? 's' : ''} ${positions.map(p => ROMAN[p]).join(' · ')}`;

// Written range covered by a set of positions under the given settings.
function rangeText(positions, settings) {
  const pools = positions.map(p => poolFor(p, settings));
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
      settings.accidentals ? 'with accidentals' : 'natural notes',
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
      settings.accidentals ? 'with accidentals' : 'natural notes',
      stringsText(settings.strings)
    ].join(' · '),
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
    settings.accidentals ? 'accidentals' : 'naturals'
  ].join(' · ');
}

// One line for the folded settings panel on narrow screens.
export function summarizeSettings(settings) {
  return [
    `Pos. ${settings.positions.map(p => ROMAN[p]).join(', ')}${settings.rotatePositions ? ' (rotating)' : ''}`,
    stringsText(settings.strings),
    list(settings.noteValues),
    settings.accidentals ? 'accidentals' : 'naturals',
    settings.melody
  ].join(' · ');
}

// A file name for an exported study: "etude-0417".
export const fileStem = score => `etude-${String(score.seed).padStart(4, '0')}`;
