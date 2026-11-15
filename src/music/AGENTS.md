# src/music — the music core

Everything here is pure logic that also runs in Node, which is how it is tested.

- No DOM, no `Math.random`, no `Date`. Take an `rng` argument (see `rng.js`) and pass it down.
- The same settings and seed must always give the same Score. `test/random-melody.test.js` and `test/musical-melody.test.js` check this.
- Draw from the pool you are given. Never invent a pitch: a note that is not in the measure's pool has no fingering and cannot be played in that position.
- A generator must cope with tiny pools (one string leaves as few as two natural notes). Relax a rule rather than throw or loop forever.
- Random mode (`random-melody.js`) is frozen behaviour. New musical ideas go in `musical-melody.js`.
- Chromatic notes in musical mode always resolve by semitone in the direction they are spelled. A test enforces it.
- Any change here needs a test in `test/`, and a matching edit to `docs/music-generation.md` if a rule or weight changed.
