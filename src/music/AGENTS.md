# src/music — the music core

Everything here is pure logic that also runs in Node, which is how it is tested.

- No DOM, no `Math.random`, no `Date`. Take an `rng` argument (see `rng.js`) and pass it down.
- The same settings and seed must always give the same Score. `test/random-melody.test.js` and `test/musical-melody.test.js` check this.
- Draw from the pool you are given. Never invent a pitch: a note that is not in the measure's pool has no fingering and cannot be played in that position. To change how a pool note is written, use the spelling helpers (`respell`, `spellToward`) and keep its fingerings.
- A generator must cope with tiny pools. One string in one position leaves as few as two notes of a scale, and may leave a key without its tonic. Relax a rule rather than throw or loop forever.
- Random mode (`random-melody.js`) is frozen behaviour. New musical ideas go in `musical-melody.js`.
- In musical mode a note belongs to the key or not by `inKey(key, pitch)`, never by its `alter`: in D major F sharp is a scale note and F natural the chromatic one.
- A chromatic note in musical mode always resolves by semitone to a scale note, and is spelled toward that note with `spellToward`. The one exception is the raised sixth of a minor key, which rises a whole tone to the raised seventh on its way to the tonic. Tests enforce both.
- Musical mode treats every key alike: state a rule in scale degrees and intervals, not in letters or signs. A test checks that a study transposes with its key.
- Any change here needs a test in `test/`, and a matching edit to `docs/music-generation.md` if a rule or weight changed.
