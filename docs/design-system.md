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
- **Page tools** (Save, Download PDF, Print) sit at the top of the page itself, because they act on the study shown there. A status line beside them reports what just happened and is announced to screen readers (`role="status"`). Where the row is too narrow for both, the status moves to its own line under the buttons; the row measures itself with a container query, because beside the settings panel the page can be narrower than a phone held sideways.
- Anything tappable is at least 44 px tall.

## Controls

Choose the control by what the setting is, not by how it looks:

| Control | For | Markup |
|---|---|---|
| Chip | Independent on/off picks from a set (positions, strings, note values) | `input[type=checkbox]` in a `fieldset` |
| Choice chip | One pick from a set too large for a segmented control (the key) | `input[type=radio]` in a `fieldset`, drawn as a chip |
| Switch | A single on/off setting (rotate positions, notes outside the key) | `input[type=checkbox][role=switch]` |
| Segmented control | One of two or three named options (melody, view, accidentals in Random mode) | `input[type=radio]` |

Rules:

- Every change to a setting applies immediately and is remembered; settings have no Save button. (The Save button on the page keeps a study, not the settings.)
- A selected chip or segment is filled with ink **and** shows a gilt mark under its label, so the state never depends on colour alone. A switch shows its state by the knob's position.
- A group can never be empty: the last chip left on is disabled until another is switched on.
- The key chips stand in two rows of seven, major keys over their relative minors, so each column shares a key signature. A line under them spells the signature out ("D major: two sharps, F♯ C♯").
- A control that only one melody mode uses is hidden in the other, not greyed out: the key row and the "Notes outside the key" switch belong to Musical mode, the None / Sharps / Flats choice to Random mode. Both accidentals controls write the same setting, and the sharps-or-flats choice is kept while Musical mode has it switched off.
- Focus is shown with `:focus-visible` as a 2 px ring in `--focus`.
- The real input covers its chip, invisibly, so the whole chip is the click and touch target and the browser's own keyboard handling applies.

## Buttons

| Button | For |
|---|---|
| Primary (`.button--primary`, oxblood) | The one main action: **New étude** |
| Quiet (`.button--quiet`, paper) | Everything else: Library, Save, Download PDF, Print, and the buttons inside the library |

- A quiet button that reports a finished state ("Saved") is flat and dashed, so it reads as a label rather than something to press. It is marked `aria-disabled`, not `disabled`: a button that disables itself under the finger that pressed it drops keyboard focus to the top of the page.
- **Deleting needs two presses.** The first press arms the button ("Really delete?", filled oxblood); a second press at least half a second later deletes. A double-click is one gesture: on an unarmed button it only arms, and as the confirming press it deletes that row without arming the next one. A held key does not repeat. The button stays armed until focus leaves it or something else in the dialog is pressed; there is no timer, so nobody loses the confirmation for being slow. It is wide enough for the longer label from the start, so arming moves nothing. There is no undo, so there is no single-press delete.

## Library dialog

A native modal `<dialog>`, opened with `showModal()`: the browser traps focus inside it, closes it on Escape and returns focus to the Library button. A press that starts and ends on the backdrop also closes it; a click in the dialog's own margins or a text selection dragged out of it does not. The second half of a double-click on the Library button is ignored wherever it lands, so the dialog it opened stays open. Each row shows the study's name, a one-line description, when it was saved, and Open and Delete buttons. A footnote says plainly that studies are kept in this browser only.

- While the dialog is open the page behind it is inert and does not scroll, so the page's status line would reach nobody. The dialog has its own (`role="status"`), which says what was deleted or why it could not be.
- After a delete, focus goes to the Delete button of the row that took its place, and the list keeps its scroll position.
- In a very short window the whole dialog scrolls, instead of squeezing the list between the heading and the footnote; its status line then sticks to the foot of the window.

## Texture

- Paper grain is a small static SVG noise tile (`--grain`) on the desk. It is never animated.
- The page has a faint vignette toward its edges and stays flat behind the staves, so nothing competes with the notation.
- The page and panel carry a thin inset rule; the masthead and the title ornament use double rules.

Textures are removed for `prefers-contrast: more`, for `forced-colors`, and in print. Transitions are removed for `prefers-reduced-motion`.

## Print

Printing shows only the page: black on white, with the masthead, settings panel, page tools and dialog hidden. Every ink token is set to black for print, the diamond in the title ornament is told to print although it is a background, and advice that only works on a screen (`.screen-only`, such as "hover or tap a note") is left out. The score is re-laid out at full width just before printing (`beforeprint`) and restored afterwards, so a narrow window does not produce a narrow printout. Each system is its own SVG with `break-inside: avoid`, so a page break never cuts through a staff.

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
