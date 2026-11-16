// SMuFL glyphs and Bravura's engraving metrics.
//
// SMuFL convention: a glyph is drawn at font-size = 4 staff spaces, with its
// origin on the baseline. Noteheads and accidentals are vertically centred on
// that baseline with their left edge at x = 0; a clef's baseline is the line
// of the pitch it names; time-signature digits are centred on the baseline.
// SMuFL's y axis points up, SVG's points down.

export const SPACE = 12;                 // SVG units per staff space
export const GLYPH_SIZE = SPACE * 4;
export const MUSIC_FONT = 'Bravura';

export const GLYPH = {
  gClef: '',
  noteheadBlack: '',
  timeSig4: '',
  flat: '',
  natural: '',
  sharp: '',
  // Whole notes-with-stems, used as icons on the note-value controls.
  noteQuarterUp: '',
  note8thUp: '',
  note16thUp: ''
};

// All values are in staff spaces, taken from Bravura's metadata
// (redist/Bravura.json: glyphsWithAnchors, glyphBBoxes, engravingDefaults).
export const METRICS = {
  noteheadWidth: 1.18,
  // Widths of the glyphs a key signature is spaced by. Each glyph fills its
  // advance, so this is both: 671, 249 and 226 font units, 250 to the space.
  gClefWidth: 2.684,
  sharpWidth: 0.996,
  flatWidth: 0.904,
  stemAttachY: 0.168,      // where a stem meets the notehead, above/below its centre
  staffLine: 0.13,
  stem: 0.12,
  beam: 0.5,
  beamGap: 0.25,
  ledger: 0.16,
  ledgerExtension: 0.4,    // how far a ledger line passes the notehead on each side
  thinBarline: 0.16,
  thickBarline: 0.5,
  barlineGap: 0.4
};
