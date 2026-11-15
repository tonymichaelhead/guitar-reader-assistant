// The library: scores the player chose to keep, in localStorage.
//
// Stored value: a JSON array of raw entries { id, savedAt, data }, where id is
// a non-empty string, data is encodeScore(score) and savedAt is a time in
// milliseconds since the epoch. The caller supplies id and savedAt, so nothing
// here reads a clock or rolls dice.
import { decodeScore, encodeScore } from '../music/score-codec.js';
import { sanitize } from './settings.js';

export const LIBRARY_KEY = 'guitar-reading-assistant.library.v1';

// The furthest a Date reaches, either side of the epoch. A number beyond it
// (a time in nanoseconds, say) is not a time: showing it as a date throws.
const MAX_TIME = 8.64e15;

const isId = id => typeof id === 'string' && id !== '';
const isTime = time => Number.isFinite(time) && Math.abs(time) <= MAX_TIME;

// `storage` defaults to localStorage in all three functions. Merely reading
// that global can throw where storage is blocked (cookies refused, a sandboxed
// frame), so the default is looked up inside each function's try block and
// not in its parameter list.
const resolve = storage => (storage === undefined ? globalThis.localStorage : storage);

// The stored list exactly as it is, entries this version cannot read included.
// A value that is not a JSON array counts as an empty list; a storage that
// cannot be read at all throws.
function readRaw(storage) {
  const text = storage.getItem(LIBRARY_KEY);
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// A raw entry as the app uses it, or null when this version cannot read it.
// The settings are the one part of a score the codec hands back as stored, so
// they are brought up to date here.
function readEntry(raw) {
  if (!raw || !isId(raw.id) || !isTime(raw.savedAt)) return null;
  const score = decodeScore(raw.data);
  if (!score) return null;
  return { id: raw.id, savedAt: raw.savedAt, score: { ...score, settings: sanitize(score.settings) } };
}

// Browsers name a full store differently: the standard name, Firefox's older
// one, and the legacy numeric codes that go with them.
const isQuotaError = error => {
  try {
    return error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error?.code === 22 || error?.code === 1014;
  } catch {
    // Anything at all can be thrown, even a value that throws again when it
    // is looked at (a getter, a proxy). That says nothing about room.
    return false;
  }
};

const failure = error => ({ ok: false, reason: isQuotaError(error) ? 'quota' : 'unavailable' });

// Storage can be missing or blocked (private windows), so the library is
// best-effort like the settings: none of these functions throws.

// [{ id, savedAt, score }], newest first.
export function loadLibrary(storage) {
  try {
    // The sort is stable, so entries saved at the same time keep their stored order.
    return readRaw(resolve(storage)).map(readEntry).filter(Boolean)
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

// Both functions below return { ok: true, entries } with the library as it now
// loads, or { ok: false, reason } with reason 'quota' (the browser has no room
// left) or 'unavailable' (anything else). Entries this version cannot read (a
// newer format, say) are written back untouched: only loadLibrary hides them.
// Each makes one setItem call at most, which either replaces the stored value
// or leaves it as it was.

export function addToLibrary(score, meta, storage) {
  try {
    const store = resolve(storage);
    const entry = { id: meta.id, savedAt: meta.savedAt, data: encodeScore(score) };
    // Never report as saved what loadLibrary could not give back.
    if (!readEntry(entry)) return { ok: false, reason: 'unavailable' };
    // The entry just written goes first, so that among equal times the latest
    // save leads; an older entry with the same id gives way to it.
    const list = [entry, ...readRaw(store).filter(raw => raw?.id !== entry.id)];
    store.setItem(LIBRARY_KEY, JSON.stringify(list));
    return { ok: true, entries: loadLibrary(store) };
  } catch (error) {
    return failure(error);
  }
}

export function removeFromLibrary(id, storage) {
  try {
    const store = resolve(storage);
    const list = readRaw(store);
    // Only a non-empty string names an entry. Anything else is an unknown id:
    // compared as it is, undefined would match every raw entry that has none.
    const kept = isId(id) ? list.filter(raw => raw?.id !== id) : list;
    // An unknown id changes nothing, so nothing is written and nothing can fail.
    if (kept.length < list.length) store.setItem(LIBRARY_KEY, JSON.stringify(kept));
    return { ok: true, entries: loadLibrary(store) };
  } catch (error) {
    return failure(error);
  }
}
