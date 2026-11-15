# Music generation

How a study's notes are chosen. The code is in `src/music/`; the entry point is `generateScore` in `generate.js`.

Every study is 16 measures of 4/4. Generation runs in this order: positions, then rhythm, then pitches.

## Positions (`positions.js`)

Twelve positions, I to XII. Position I covers the open strings and frets 1–4; position *n* covers frets *n* to *n*+3. The pool of a position is every written pitch playable there on the enabled strings.

- **Rotation off:** one of the enabled positions is drawn for the whole study. With a single position enabled this is simply that position.
- **Rotation on:** the enabled positions are shuffled once. Measures take them in that order, and the same order repeats until the study ends, wherever in the cycle that falls. No position repeats before all have appeared.

## Rhythm (`rhythm.js`)

Each beat is filled by one cell, so no note crosses a beat and every eighth or sixteenth has a beam partner:

| Cell | Needs |
|---|---|
| quarter | quarters |
| two eighths | eighths |
| four sixteenths | sixteenths |
| eighth + two sixteenths, two sixteenths + eighth | eighths and sixteenths |

Cells are weighted so each enabled note value gets an equal share of the beats. There are no rests, ties, dotted notes or syncopated cells.

- **Random mode** draws a cell for every beat independently.
- **Musical mode** builds two one-measure motifs and alternates them through each four-measure phrase. The measure that ends a phrase finishes on the longest enabled value, and the final measure does so for its last two beats. The motifs are redrawn until together they use every enabled value.

## Random mode (`random-melody.js`)

Each note is drawn uniformly from the measure's pool. Two things are rejected and redrawn, up to 50 times: repeating the previous note, and a leap wider than 7 diatonic steps. Accidentals are spelled as sharps. This is the app's original algorithm and is kept as it was.

## Musical mode (`musical-melody.js`)

Still random, but shaped in layers. Rules marked *hard* are never broken while the pool allows a choice; the rest are weights. Numbers live in the exported `TUNING` object.

### 1. Tonal centre

All centres use the white-note scale: C major (weight 5), A minor (4), G Mixolydian (1), D Dorian (1). Only centres whose tonic the final measure can play are considered.

### 2. Phrases, harmony and cadences

Four-measure phrases form a double period: the cadences are open, closed, open, closed.

- Each phrase takes a chord progression from `theory.js`, one chord per measure, such as I–I–IV–V (open) or I–IV–V–I (closed).
- A **closed** phrase ends on the tonic. An **open** phrase ends on a note of its last chord other than the tonic (for V: the 2nd, 5th or 7th degree).
- The cadence note is chosen six notes before the end, favouring the nearest candidate, and the walk is steered to arrive on it by step.
- The third phrase begins with the same first measure as the first phrase, when its position can play it.

### 3. Register

Each phrase gets a register centre somewhere in the position's range, at most a fifth from the previous phrase's centre, so a study visits the low strings as well as the high ones. The centre rises by up to 3 semitones in mid-phrase, which produces an arch. Notes are weighted by a bell curve around it (standard deviation 5.4 semitones).

### 4. The walk

Each note is drawn from the measure's natural notes with weight:

> stability of its scale degree × register × chord-tone bonus × interval preference × adjustments

- **Stability:** the Krumhansl–Kessler ratings of the seven scale degrees (major and minor; the two modal rows are adapted by hand).
- **Chord tones:** ×2.5 on beats 1 and 3, ×1.4 on beats 2 and 4.
- **Interval preference**, by diatonic distance: repeat 0.12, step 0.55, third 0.20, fourth 0.08, fifth 0.04, sixth 0.02, octave 0.02.
- **Step inertia:** ×1.5 for continuing a step in the same direction.
- **After a leap of a fourth or more:** ×3 for stepping back the other way, ×0.4 for carrying on in the same direction.
- **Hard:** no tritone leap, no seventh, nothing wider than an octave, never three leaps in a row, and sixteenths move by step or third only.

Across a change of position the interval rules give way to "take a stable note near the previous one", since the two pools may barely overlap. If the hard rules leave nothing in a very small pool, the nearest notes are used instead.

### 5. Chromatic notes (accidentals on)

There is no key signature; chromatic notes decorate the white-note scale. A chromatic note:

- is approached from a natural note at most a whole tone away;
- never falls on beat 1 or 3;
- commits the next note to its resolution a semitone away (*hard*);
- is spelled by direction: a sharp resolves up, a flat resolves down.

That allows chromatic neighbour notes (G–F♯–G), passing notes (C–C♯–D, B–B♭–A) and leading tones (F♯–G), and rules out the augmented second. Weights favour a leading tone to the tonic (×2), a raised 4th to the 5th (×1.5), a lowered 7th in major (×1.4), and a chromatic approach to a cadence note (×3). Flats count half.

In minor, the raised 6th appears only in the rising figure 5–♯6–♯7–1 (E–F♯–G♯–A).

### 6. Generate and test

Each phrase is walked 24 times. Each walk is scored for: share of stepwise motion, a single highest note away from the phrase's edges, a range of 5–14 semitones, few repeated notes, a stepwise arrival at the cadence without wide leaps just before it, and (with accidentals on) one to a handful of chromatic notes. One of the three best is kept.

### What it produces

Measured over 200 seeds in position V with all strings:

| Setting | Steps | Repeats | Leaps | Chromatic notes |
|---|---|---|---|---|
| quarters, naturals | 67% | 7% | 27% | 0% |
| quarters, accidentals | 69% | 7% | 24% | 6% |
| eighths + sixteenths, accidentals | 81% | 3% | 16% | 7% |
| sixteenths, accidentals | 87% | 2% | 11% | 8% |

Every study ended on its tonic, and at least 97% arrived there by step.

## Why these rules

The principles come from empirical studies of melody and from tonal pedagogy. The exact multipliers are this project's own starting values.

- **Small intervals dominate.** In large song corpora more than half of melodic intervals are a whole tone or less. Temperley, "A Probabilistic Model of Melody Perception" — https://archives.ismir.net/ismir2006/paper/000030.pdf
- **Melodies stay near a central pitch.** The apparent rule "a leap is followed by a reversal" is largely a consequence of a limited range; it is kept here as a smaller extra bonus because trained listeners expect it. Von Hippel & Huron, "Why Do Skips Precede Reversals?" — https://scilit.com/publications/d61da2e28fb69e0f7a57e22fd7fd1969
- **A step tends to continue in the same direction.** Chiu & Temperley (2024) — https://doaj.org/article/43b320953f444935a677d6cec2cb74f8
- **Phrases arch, and end on longer notes.** Tierney, Russo & Patel (2011) — https://pmc.ncbi.nlm.nih.gov/articles/PMC3174665
- **Some scale degrees are more stable than others.** The Krumhansl–Kessler key profiles, as tabulated at https://www.cs.oswego.edu/~sjenks/COG316/keyKrum/Krumhansl1
- **Leap limits, no tritones or sevenths, a single climax.** Species-counterpoint melody rules — https://intmus.github.io/inttheory/05-counterpoint-embell-shapes/b2-cantfirmand1st.html
- **Periods and cadences.** An open phrase answered by a closed one — https://musictheory.pugetsound.edu/mt21c/PeriodForm.html
- **Chord tones on strong beats; passing and neighbour notes approached and left by step.** https://intmus.github.io/inttheory21-22/09-non-chord-tones/a1-nonchordtonespt1.html
- **Chromatic notes resolve by semitone in the direction of their alteration.** https://tobyrush.com/soundpatterns/chromaticIII/linearchrom.html
- **Why not a Markov chain.** Low-order chains have no long-range structure, and there is no corpus here to train one. Herremans, Chuan & Chew, "A Functional Taxonomy of Music Generation Systems" — https://arxiv.org/pdf/1812.04186

## Not done yet

- Key signatures and keys other than the white-note ones.
- Rests, ties, dotted rhythms, other metres.
- Tendency-tone resolution (7 to 1, 4 to 3) as an explicit rule.
- Sequences (a motif repeated a step higher or lower); only the literal return of the opening measure is implemented.
