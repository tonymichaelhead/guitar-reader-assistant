# 6. Musical mode is written in a chosen key, with a key signature

Date: 2026-11-15
Status: Accepted. Supersedes record 4.

## Context

Record 4 kept Musical mode on the white-note scale, with no key signature and every accidental written beside its note. That made a study practice at reading accidentals, but never at reading in a key, which is most of what a guitarist is asked to read: the instrument's repertoire lives in keys such as D, A and E major and their relative minors.

The owner asked for a choice of key, with the accidentals following the key signature, and for Random mode to choose between sharps, flats and natural notes only.

## Decision

- **Keys.** Musical mode is in one key, chosen by the reader from fourteen: C, G, D, A, E, F and B♭ major, and A, E, B, F♯, C♯, D and G minor. That is every key up to four sharps and two flats, each major key with its relative minor, which covers the keys the guitar is usually written in. The two modal centres of record 4 (G Mixolydian, D Dorian) are no longer generated.
- **Key signature.** The score carries a real key signature at the start of every system. A note has its own sign only when it departs from the signature or from a sign already in force in its measure, as in printed music.
- **Accidentals.** The setting has three values: none, sharps, flats. Random mode has no key and no key signature, so the setting decides how the black keys are written. Musical mode has a key, which decides that, so there the setting only means off (strictly the notes of the key) or on (passing, neighbour and leading notes from outside it).
- **Spelling.** A note of the scale is written on its own letter. A note from outside the scale is written toward the note it moves to: the letter below raised when it rises, the letter above lowered when it falls. Double sharps and flats are never written, nor E♯, B♯, C♭ or F♭, with one exception: the leading note of a minor key is always the seventh letter raised, so F♯ minor has E♯ and C♯ minor has B♯.
- **Stored studies.** The key is part of the Score and of the stored format, as version 2. Version 1, which has no key, is still read exactly as before: such a study has no key signature and keeps its accidentals as written.

## Consequences

- A study practises reading in a key: remembering the signature, and noticing the notes that leave it.
- The pitch model now allows any single sharp or flat on any letter. The octave of a pitch belongs to its letter, so B♯3 has the value of C4.
- `layout.js` places the signature and decides accidentals against it; both renderers draw it.
- Random mode's notes are unchanged for "none" and "sharps". "Flats" is new.
- The stored setting changed from true/false to three values. `sanitize` reads the old values: true becomes sharps.
- Keys with more than four sharps or two flats are not offered. Adding one means a line in `KEYS`; a key whose leading notes need a double sharp (G♯ minor) would also need double-sharp spelling and a glyph.
