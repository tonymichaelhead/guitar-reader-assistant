# Design system

The app is meant to look like an old printed score lying on a desk, while behaving like a modern tool: every control is a native input, applies at once, and is usable by touch and keyboard.

## Tokens (`styles/tokens.css`)

| Token | Value | Use |
|---|---|---|
| `--desk` | `#dccfae` | Page background |
| `--paper` | `#f4ecd8` | The printed page |
| `--paper-deep` | `#e9ddc0` | Settings panel |
| `--ink` | `#2a2118` | Text and notation |
| `--ink-soft` | `#5b4733` | Secondary text, control borders |
| `--accent` | `#7a2318` | Primary button, switch "on", note hover |
| `--focus` | `#1f3f6b` | Focus rings only |
| `--ochre` | `#8c6a35` | Ornaments and rules only |
| `--gilt` | `#d9b66a` | Marks and headings on dark ink |

Contrast ratios (WCAG formula):

| Pair | Ratio |
|---|---|
| ink on paper / panel / desk | 13.4 / 11.7 / 10.2 |
| soft ink on paper / panel / desk | 7.5 / 6.5 / 5.7 |
| paper on ink (selected chips) | 13.4 |
| gilt on ink | 8.2 |
| paper on accent (primary button) | 8.6, and 7.3 at the lightest point of its gradient |
| focus ring on paper / panel / desk | 9.0 / 7.9 / 6.9 |
| ochre on paper | 4.2 — below the 4.5 needed for text, so ornaments only |

Text needs 4.5:1; control borders and state marks need 3:1. Focus has its own hue so it is never mistaken for "selected".

## Type

- **Playfair Display** — titles, the étude heading, control labels, position marks.
- **EB Garamond** — everything else.
- **Bravura** — notation, and the note icons on the note-value chips.

Section headings in the panel are small letter-spaced capitals. Hints are italic.

## Layout

- Wider than 900 px: a 300 px settings panel stays beside the page and sticks while the score scrolls.
- 900 px or narrower: the panel folds behind a **Settings** button that shows a one-line summary of the current settings.
- **New étude** is always visible in the masthead. From the note map it returns to the score.
- **Library** sits beside it and opens the list of saved studies, with a count of how many there are.
- **Page tools** (Save, Download PDF, Print) sit at the top of the page itself, because they act on the study shown there. A status line beside them reports what just happened and is announced to screen readers (`role="status"`).
- Anything tappable is at least 44 px tall.

## Controls

Choose the control by what the setting is, not by how it looks:

| Control | For | Markup |
|---|---|---|
| Chip | Independent on/off picks from a set (positions, strings, note values) | `input[type=checkbox]` in a `fieldset` |
| Switch | A single on/off setting (rotate positions, accidentals) | `input[type=checkbox][role=switch]` |
| Segmented control | One of two named options (melody, view) | `input[type=radio]` |

Rules:

- Every change applies immediately and is saved. There is no Save button.
- A selected chip or segment is filled with ink **and** shows a gilt mark under its label, so the state never depends on colour alone. A switch shows its state by the knob's position.
- A group can never be empty: the last chip left on is disabled until another is switched on.
- Focus is shown with `:focus-visible` as a 2 px ring in `--focus`.
- The real input covers its chip, invisibly, so the whole chip is the click and touch target and the browser's own keyboard handling applies.

## Buttons

| Button | For |
|---|---|
| Primary (`.button--primary`, oxblood) | The one main action: **New étude** |
| Quiet (`.button--quiet`, paper) | Everything else: Library, Save, Download PDF, Print, and the buttons inside the library |

- A quiet button that reports a finished state ("Saved") is disabled, flat and dashed, so it reads as a label rather than something to press.
- **Deleting needs two presses.** The first press arms the button ("Really delete?", filled oxblood); the second deletes. It disarms after four seconds or when focus leaves it. There is no undo, so there is no single-press delete.

## Library dialog

A native modal `<dialog>`, opened with `showModal()`: the browser traps focus inside it, closes it on Escape and returns focus to the Library button. A click on the backdrop also closes it. Each row shows the study's name, a one-line description, when it was saved, and Open and Delete buttons. A footnote says plainly that studies are kept in this browser only.

## Texture

- Paper grain is a small static SVG noise tile (`--grain`) on the desk. It is never animated.
- The page has a faint vignette toward its edges and stays flat behind the staves, so nothing competes with the notation.
- The page and panel carry a thin inset rule; the masthead and the title ornament use double rules.

Textures are removed for `prefers-contrast: more`, for `forced-colors`, and in print. Transitions are removed for `prefers-reduced-motion`.

## Print

Printing shows only the page: black on white, with the masthead, settings panel, page tools and dialog hidden. The score is re-laid out at full width just before printing (`beforeprint`) and restored afterwards, so a narrow window does not produce a narrow printout. Each system is its own SVG with `break-inside: avoid`, so a page break never cuts through a staff.

## The page as a print

The title block echoes an engraved first page: a small italic line, the title in spaced capitals with its number, an ornamental rule, then a line with the melody description on the left and the position on the right. The footline is styled as a publisher's plate number and carries the study's number, which is also its seed.

## Sources

- Checkboxes versus switches, and switches applying immediately — https://www.nngroup.com/articles/toggle-switch-guidelines/
- Pressed states must be unmistakable — https://www.nngroup.com/articles/state-switch-buttons/
- Switch and button patterns — https://www.w3.org/WAI/ARIA/apg/patterns/switch/
- Target size — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- Contrast for text and for non-text parts — https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html and https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html
- Grain from SVG noise — https://css-tricks.com/grainy-gradients/
- Plate numbers and footlines on engraved editions — https://imslp.org/wiki/Plate_Number_Styles
