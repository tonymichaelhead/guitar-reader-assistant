# Music generation

How a study's notes are chosen. The code is in `src/music/`; the entry point is `generateScore` in `generate.js`.

Every study is 16 measures of 4/4. Generation runs in this order: positions, then rhythm, then pitches.

## Positions (`positions.js`)

Twelve positions, I to XII. Position I covers the open strings and frets 1–4; position *n* covers frets *n* to *n*+3. The pool of a position is every written pitch playable there on the enabled strings.

Position I holds every semitone of its range. Every other position has four frets on strings that are mostly five semitones apart, so it lacks one note between each such pair of strings: position V has no C♯4, F♯4, B4 or G♯5. A key can therefore be missing a note or two of its scale in a given position, and the generator works with what is there.

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

Each note is drawn uniformly from the measure's pool. Two things are rejected and redrawn, up to 50 times: repeating the previous note, and a leap wider than 7 diatonic steps. This is the app's original algorithm and is kept as it was.

Random mode has no key and no key signature. The accidentals setting chooses its pool (`poolFor` in `fretboard.js`):

- **none:** the natural notes only;
- **sharps:** every note, the black keys written as sharps;
- **flats:** every note, the black keys written as flats.

"None" and "sharps" give, seed for seed, the notes the app gave before the setting had three values. "Flats" draws from the same notes in the same rhythm, but is not "sharps" respelled: the leap limit is counted in staff steps, and D♭ sits a step higher on the staff than C♯, so now and then one setting redraws a note the other keeps, and from there on the two studies differ.

## Musical mode (`musical-melody.js`)

Still random, but shaped in layers. Rules marked *hard* are never broken while the pool allows a choice; the rest are weights. Numbers live in the exported `TUNING` object.

### 1. The key

A study is in the key its settings name. Fourteen are on offer (`KEYS` in `theory.js`): every key up to four sharps and two flats, each major key with its relative minor.

| Signature | Major | Minor |
|---|---|---|
| none | C | A |
| 1 sharp | G | E |
| 2 sharps | D | B |
| 3 sharps | A | F♯ |
| 4 sharps | E | C♯ |
| 1 flat | F | D |
| 2 flats | B♭ | G |

Two words are used below. A **scale note** belongs to the key; in a minor key that means the natural minor, the scale its signature gives. A **chromatic note** does not belong to it. Neither word is about the sign a note carries: in D major F♯ is a scale note and F♮ the chromatic one. The code asks `inKey`, never whether a note has a sharp or flat.

Each measure is given every note of its position, spelled for the key (`keyPool`). The scale notes do all the ordinary work. The chromatic notes are used only when accidentals are on, and only as section 5 allows. In this mode the accidentals setting is a switch: "none" is off, "sharps" and "flats" are both on and give the same study, because the key decides the spelling.

Every rule below is stated in scale degrees and intervals, so the generator treats all keys alike. In positions II to XII, moving the key and the position by the same number of semitones gives the same study, transposed; a test checks it. Two keys are excepted, for one figure (see section 5).

### 2. Phrases, harmony and cadences

Four-measure phrases form a double period: the cadences are open, closed, open, closed.

- Each phrase takes a chord progression from `theory.js`, one chord per measure, such as I–I–IV–V (open) or I–IV–V–I (closed).
- A **closed** phrase ends on the tonic. An **open** phrase ends on a note of its last chord other than the tonic (for V: the 2nd, 5th or 7th degree).
- The cadence note is chosen six notes before the end, favouring the nearest candidate, and the walk is steered to arrive on it by step.
- The third phrase begins with the same first measure as the first phrase, when its position can play it and that measure has no chromatic note in it.

The key is the reader's choice, so a measure may not be able to play the note its cadence wants: one string in one position holds four or five semitones. A phrase then ends on any note of its last chord that the measure does have. For a closed phrase that is the third or the fifth of the tonic chord, an imperfect cadence in place of a perfect one. If the measure has none of those either, the walk simply ends on the scale note its weights lead to. With all six strings a tonic is always in reach.

### 3. Register

Each phrase gets a register centre somewhere in the position's range, at most a fifth from the previous phrase's centre, so a study visits the low strings as well as the high ones. The centre rises by up to 3 semitones in mid-phrase, which produces an arch. Notes are weighted by a bell curve around it (standard deviation 5.4 semitones).

### 4. The walk

Each note is drawn from the measure's scale notes with weight:

> stability of its scale degree × register × chord-tone bonus × interval preference × adjustments

- **Stability:** the Krumhansl–Kessler ratings of the seven scale degrees, one row for major keys and one for minor.
- **Chord tones:** ×2.5 on beats 1 and 3, ×1.4 on beats 2 and 4.
- **Interval preference**, by diatonic distance: repeat 0.12, step 0.55, third 0.20, fourth 0.08, fifth 0.04, sixth 0.02, octave 0.02.
- **Step inertia:** ×1.5 for continuing a step in the same direction.
- **After a leap of a fourth or more:** ×3 for stepping back the other way, ×0.4 for carrying on in the same direction.
- **Hard:** no tritone leap, no seventh, nothing wider than an octave, never three leaps in a row, and sixteenths move by step or third only.

Across a change of position the interval rules give way to "take a stable note near the previous one", since the two pools may barely overlap. If the hard rules leave nothing in a very small pool, the nearest notes are used instead.

### 5. Chromatic notes (accidentals on)

A chromatic note decorates the scale; it never replaces it. Each one:

- is approached from a scale note at most a whole tone away, and at most a step away on the staff;
- never falls on beat 1 or 3;
- commits the next note to its resolution, the scale note a semitone further on (*hard*);
- is spelled toward that resolution.

That allows chromatic neighbour notes (G–F♯–G), passing notes (C–C♯–D, B–B♭–A) and leading notes (G♯–A in A minor), and rules out the augmented second.

**Weights.** A chromatic note weighs 0.07 of a stable step, times the stability of the degree it resolves to. On top of that: ×0.5 when it resolves downward; ×2 for a leading note up to the tonic (in a minor key: the major scale has its own); ×1.5 for a raised 4th up to the 5th; ×1.4 for a lowered 7th down to the 6th in a major key; ×3 when it leads straight into the note a phrase ends on, which is then the only resolution it may have.

**Spelling** (`spellToward` in `theory.js`). A note that rises is written as the letter below its resolution, raised: G♯ to A. A note that falls is written as the letter above, lowered: B♭ to A. "Raised" and "lowered" are relative to the key signature, so the sign on the page is often a natural: in F major the raised 4th is B♮ (to C), in G major the lowered 7th is F♮ (to E).

Double sharps and double flats are never written, nor E♯, B♯, C♭ or F♭. Where the rule above would need one, the note is written on its resolution's own letter with that letter's sign cancelled: F♮ to F♯ in D major (not E♯), G♮ to G♯ in A major (not F double sharp), B♮ to B♭ in F major (not C♭). The one exception is the leading note of a minor key, which is always the seventh letter raised: E♯ in F♯ minor, B♯ in C♯ minor. These are this project's choices for easy reading (decision record 6); a strict speller would write the E♯ every time.

One consequence: in E major and C♯ minor the figure D♯–E♯–F♯ would be written D♯–F♮–F♯, a diminished third on the page. It is left out. This is the only place where a key behaves differently from the others.

**Melodic minor.** In a minor key the raised 6th appears only in the rising figure 5–♯6–♯7–1 (E–F♯–G♯–A in A minor, C♯–D♯–E♯–F♯ in F♯ minor). It is the one chromatic note that moves by a whole tone, to the raised 7th, which then resolves to the tonic. The figure weighs 1.5 times the chromatic rate, and three times that when its tonic is the note the phrase ends on. Coming down, the scale is the natural minor. With accidentals off a minor key is the natural minor throughout.

### 6. Generate and test

Each phrase is walked 24 times. Each walk is scored for: share of stepwise motion, a single highest note away from the phrase's edges, a range of 5–14 semitones, few repeated notes, a stepwise arrival at the cadence without wide leaps just before it, and (with accidentals on) one to a handful of chromatic notes. One of the three best is kept.

### What it produces

Measured over 200 seeds in each of the fourteen keys, in position V with all strings. The first figure is the average over the keys; the range is the lowest and highest single key.

| Setting | Steps | Repeats | Leaps | Chromatic notes |
|---|---|---|---|---|
| quarters, accidentals off | 66% (62–69) | 7% (6–9) | 27% (25–29) | 0% |
| quarters, accidentals on | 69% (66–71) | 7% (6–9) | 24% (23–26) | 6% (5–8) |
| eighths + sixteenths, accidentals on | 81% (80–82) | 4% (3–4) | 16% (14–17) | 8% (5–10) |
| sixteenths, accidentals on | 87% (86–89) | 2% (2–3) | 11% (9–12) | 9% (6–11) |

The keys differ only because position V sits differently against each scale: which of its notes fall in range, and which on the four missing frets. C major alone gives 67%, 7%, 26% in the first row and 70%, 6%, 24%, 6% in the second.

Every study in every key ended on its tonic. Between 97% and 99% arrived there by step, depending on the setting. The lowest single figure was 165 studies of 200, for A major in sixteenths: position V has neither the B4 above one of its tonics nor the G♯5 below another, so the last interval is sometimes a third.

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
- **Chromatic notes resolve by semitone in the direction of their alteration**, and a leading note keeps its own letter even where that is harder to read (B♯ before C♯). Magnuson, *Sound Patterns*, chapter 37 — https://tobyrush.com/soundpatterns/chromaticIII/linearchrom.html
- **Melodic minor: the 6th and 7th degrees are raised going up, and the natural minor comes back down.** Hutchinson, *Music Theory for the 21st-Century Classroom*, 3.1 — https://musictheory.pugetsound.edu/mt21c/MinorScales.html
- **A cadence that ends on the 3rd or 5th of the tonic chord is still an authentic cadence, an imperfect one.** Same book, 13.1 — https://musictheory.pugetsound.edu/mt21c/PerfectAuthenticCadence.html
- **Relative keys share a signature.** Same book, 3.2 — https://musictheory.pugetsound.edu/mt21c/MinorKeySignatures.html
- **Why not a Markov chain.** Low-order chains have no long-range structure, and there is no corpus here to train one. Herremans, Chuan & Chew, "A Functional Taxonomy of Music Generation Systems" — https://arxiv.org/pdf/1812.04186

## Not done yet

- Keys with more than four sharps or two flats. One whose leading notes need a double sharp (G♯ minor) would also need double-sharp spelling and a glyph.
- The harmonic minor as a scale of its own. The raised 7th is a chromatic note here, so with accidentals off a minor key never has its leading note.
- A way to reach the notes a position lacks (a stretch or a shift within the measure).
- Rests, ties, dotted rhythms, other metres.
- Tendency-tone resolution (7 to 1, 4 to 3) as an explicit rule.
- Sequences (a motif repeated a step higher or lower); only the literal return of the opening measure is implemented.
