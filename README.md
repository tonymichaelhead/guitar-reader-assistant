# Guitar Reading Assistant

Endless sight-reading studies for classical guitar, engraved in the browser in the style of an old printed score.

**Live:** https://tonymichaelhead.github.io/guitar-reader-assistant/

## What it does

- **Positions I–XII.** Switch on the positions you want. A study stays in one of them, or changes position every measure in a shuffled order that then repeats.
- **Strings.** Limit a study to any set of strings.
- **Note values.** Quarter, eighth and sixteenth notes, alone or mixed.
- **Melody.** *Random* leaves every note to chance. *Musical* still generates at random but writes phrases in a key, with cadences, stepwise motion and resolved chromatic notes.
- **Key.** Musical studies are in the key you choose, from the fourteen most used on the guitar (up to four sharps and two flats, major and minor), with its key signature on every line.
- **Accidentals.** In Random mode: natural notes only, or every note with the black keys written as sharps or as flats. In Musical mode: the notes of the key only, or with passing notes from outside it.
- **Fingerings.** Hover over a note (or tap it) to see its strings, frets and fingers. The *Note map* view lists the notes a study with the current settings can contain, position by position.
- **Library.** *Save* keeps a study in your browser's local storage; *Library* lists the saved ones to reopen or delete. They stay on that browser and device only.
- **Export.** *Download PDF* makes a small, sharp PDF of the study right in the browser, with nothing uploaded anywhere. *Print* sends the page to the printer.

Each study has a number. The same number with the same settings always gives the same study.

## Run it

Requires Node 22 or newer. There is nothing to install.

```bash
npm start
```

Then open http://localhost:5173. Press **N** for a new study.

The app is plain HTML, CSS and ES modules, so any static file server or GitHub Pages can host it as it is. It cannot be opened straight from the file system, because browsers do not load ES modules from `file://`.

## Test it

```bash
npm test
```

## Documentation

- [AGENTS.md](AGENTS.md) — working rules for contributors and coding agents.
- [docs/architecture.md](docs/architecture.md) — how the code is organised.
- [docs/music-generation.md](docs/music-generation.md) — how studies are generated, and the music theory behind Musical mode.
- [docs/engraving.md](docs/engraving.md) — how the notation is drawn.
- [docs/design-system.md](docs/design-system.md) — the visual design.
- [docs/decisions/](docs/decisions/) — why the main technical choices were made.

## Fonts

The bundled fonts are under the SIL Open Font License 1.1; see [assets/fonts/README.md](assets/fonts/README.md).
