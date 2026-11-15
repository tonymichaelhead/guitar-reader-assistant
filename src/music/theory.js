// Tonal vocabulary for the musical generator. Everything here is on the
// white-note scale, so a tonal centre is just a choice of tonic and mode.
import { LETTERS } from './pitch.js';

export const PHRASE_LENGTH = 4; // measures

export const TONALITIES = [
  { label: 'C major', tonic: 'C', mode: 'major', weight: 5 },
  { label: 'A minor', tonic: 'A', mode: 'minor', weight: 4 },
  { label: 'G Mixolydian', tonic: 'G', mode: 'mixolydian', weight: 1 },
  { label: 'D Dorian', tonic: 'D', mode: 'dorian', weight: 1 }
];

// How stable each scale degree sounds (index 0 = tonic). The major and minor
// rows are the Krumhansl-Kessler probe-tone ratings for the seven diatonic
// degrees; the two modal rows are those rows with the altered degree adjusted
// by hand.
export const DEGREE_WEIGHTS = {
  major: [6.35, 3.48, 4.38, 4.09, 5.19, 3.66, 2.88],
  minor: [6.33, 3.52, 5.38, 3.53, 4.75, 3.98, 3.34],
  mixolydian: [6.35, 3.48, 4.38, 4.09, 5.19, 3.66, 3.3],
  dorian: [6.33, 3.52, 5.38, 3.53, 4.75, 3.3, 3.34]
};

// One chord per measure, written as the chord root's scale degree (0 = I).
// "open" phrases end away from the tonic (a half cadence); "closed" phrases
// end on it (an authentic cadence).
export const PROGRESSIONS = {
  major: {
    open: [[0, 0, 3, 4], [0, 3, 0, 4], [0, 5, 3, 4], [0, 1, 4, 4]],
    closed: [[0, 3, 4, 0], [5, 1, 4, 0], [3, 0, 4, 0], [0, 1, 4, 0]]
  },
  minor: {
    open: [[0, 3, 0, 4], [0, 5, 3, 4], [0, 2, 3, 4]],
    closed: [[0, 3, 4, 0], [5, 3, 4, 0], [0, 5, 6, 0]]
  },
  mixolydian: {
    open: [[0, 6, 0, 6], [0, 3, 0, 6]],
    closed: [[0, 6, 3, 0], [0, 3, 6, 0]]
  },
  dorian: {
    open: [[0, 3, 0, 6], [0, 1, 0, 6]],
    closed: [[0, 3, 6, 0], [0, 6, 3, 0]]
  }
};

// Scale degree (0-6) of a pitch's letter in a tonality.
export const degreeOf = (pitch, tonality) =>
  (LETTERS.indexOf(pitch.letter) - LETTERS.indexOf(tonality.tonic) + 7) % 7;

// Scale degrees of the triad built on a root degree.
export const chordDegrees = root => [root, (root + 2) % 7, (root + 4) % 7];
