# 4. Musical mode uses chromatic colour, not key signatures

Date: 2026-11-15
Status: Accepted

## Context

Musical mode had to work both with natural notes only and with accidentals. With accidentals there were two ways to go: write real keys with key signatures (G major, B♭ major and so on), or stay on the white-note scale and add chromatic notes written out beside the notes they alter. The app's purpose with accidentals switched on is practice at reading accidentals.

## Decision

No key signatures. A study is centred on C major, A minor, G Mixolydian or D Dorian. With accidentals on, chromatic notes appear as neighbour notes, passing notes and leading tones, each written with its own sign, each resolving by semitone in the direction it is spelled. Sharps rise, flats fall.

## Consequences

- Every accidental is on the page next to its note, which is the reading skill being practised.
- The renderer needs no key-signature support: only the rule that an accidental lasts until the barline.
- Flats appear in Musical mode. Random mode still spells everything with sharps, as it always has.
- Studies never leave the white-note keys, so reading in keys with many sharps or flats is not practised. Adding key signatures later means work in three places: spelling in `pitch.js`, the scale in `theory.js`, and signatures plus accidental logic in `layout.js`.
