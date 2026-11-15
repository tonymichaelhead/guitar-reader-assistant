const SVG_NS = 'http://www.w3.org/2000/svg';

// Create an SVG element with attributes and optional text content.
export function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
