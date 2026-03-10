/**
 * SVG formatting and serialization utilities.
 * Handles pretty-printing raw SVG strings and serializing SVG DOM nodes
 * back to clean source code.
 */

/**
 * Formats a minified SVG string with proper indentation.
 * Splits tags onto separate lines and applies hierarchical indentation.
 *
 * @param svgString - The raw SVG code (possibly minified).
 * @param indent - Number of spaces per indentation level (default: 2).
 * @returns The formatted SVG string.
 */
export function formatSVG(svgString: string, indent = 2): string {
  let formatted = '';
  let pad = 0;

  // Normalize whitespace between tags
  const minified = svgString
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const tokens = minified
    .split(/(<[^>]+>)/g)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  tokens.forEach((token) => {
    // Closing tag: decrease indentation before printing
    if (/^<\/[^>]+>/.test(token)) {
      pad = Math.max(pad - 1, 0);
    }

    const indentation = ' '.repeat(pad * indent);
    if (formatted.length > 0) formatted += '\n';
    formatted += indentation + token;

    // Opening tag (not self-closing, comment, or declaration): increase indentation
    if (/^<[^/!?][^>]*>$/.test(token) && !/\/>$/.test(token)) {
      pad++;
    }
  });

  return formatted;
}

/**
 * Serializes an SVG DOM node to a clean, formatted string.
 * Deduplicates xmlns declarations and applies basic pretty-printing.
 *
 * @param svgNode - The SVG element to serialize.
 * @returns A formatted SVG source string.
 */
export function cleanAndFormatSVG(svgNode: SVGSVGElement): string {
  if (!svgNode) return '';
  const clone = svgNode.cloneNode(true) as SVGSVGElement;
  let str = new XMLSerializer().serializeToString(clone);

  // Remove duplicate xmlns, then ensure it appears exactly once on the root <svg>
  str = str.replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, '');
  str = str.replace(/<svg\s/, '<svg xmlns="http://www.w3.org/2000/svg" ');

  // Basic pretty-print: newline before child elements
  return str
    .replace(/(>)(<)(?!\/)(?!g>)(?!defs>)/g, '$1\n  $2')
    .replace(/(>)(<\/g>)/g, '$1\n$2')
    .replace(/(>)(<\/svg>)/g, '$1\n$2');
}

/**
 * Serializes an SVG element with proper xmlns attributes for clipboard/export.
 * Ensures both SVG and XLink namespaces are present.
 */
export function serializeSvg(svg: SVGElement): string {
  const clone = svg.cloneNode(true) as SVGElement;
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }
  return new XMLSerializer().serializeToString(clone);
}
