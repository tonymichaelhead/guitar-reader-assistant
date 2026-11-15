// Browser-side helpers for exporting: hand a file to the user, and guess
// which paper size they print on. (The files themselves are produced by pure
// modules such as score-pdf.js.)

// Offer bytes as a file download. Works without a server: the bytes are
// wrapped in a temporary object URL and "clicked".
export function downloadBytes(bytes, filename, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before freeing the bytes.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Countries where Letter, not A4, is the everyday paper size.
const LETTER_REGIONS = ['US', 'CA', 'MX', 'PH', 'CL', 'CO', 'VE', 'CR', 'GT', 'PA', 'DO', 'PR'];

export function preferredPageSize(language = globalThis.navigator?.language) {
  try {
    const { region } = new Intl.Locale(language).maximize();
    return LETTER_REGIONS.includes(region) ? 'letter' : 'a4';
  } catch {
    return 'letter';
  }
}
