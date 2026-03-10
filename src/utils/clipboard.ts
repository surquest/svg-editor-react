/**
 * Clipboard utilities for SVG copy/paste operations.
 * Attempts the modern Clipboard API first, then falls back
 * to a textarea-based execCommand approach for restricted environments.
 */

import { serializeSvg } from './svgFormat';

/**
 * Copy an SVG element to the clipboard in multiple formats.
 * Format priority: image/svg+xml, text/html (embedded data URI), text/plain.
 *
 * @returns A promise that resolves to a success/failure message string.
 */
export async function copySvgToClipboard(svgElement: SVGElement): Promise<string> {
  const svgText = serializeSvg(svgElement);

  try {
    const blobSvg = new Blob([svgText], { type: 'image/svg+xml' });
    const blobText = new Blob([svgText], { type: 'text/plain' });
    const html = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}">`;
    const blobHtml = new Blob([html], { type: 'text/html' });

    const clipboardItem = new ClipboardItem({
      'image/svg+xml': blobSvg,
      'text/plain': blobText,
      'text/html': blobHtml,
    });

    await navigator.clipboard.write([clipboardItem]);
    return 'Selection copied (Multi-format)';
  } catch {
    // Fallback for environments where ClipboardItem is blocked
    return copyTextFallback(svgText);
  }
}

/** Fallback clipboard copy using a hidden textarea + execCommand. */
function copyTextFallback(text: string): string {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const successful = document.execCommand('copy');
    return successful ? 'SVG code copied to clipboard' : 'Copy failed';
  } catch {
    return 'Unable to copy';
  } finally {
    document.body.removeChild(textArea);
  }
}

/**
 * Download the SVG code as a .svg file.
 * Creates a temporary object URL and triggers a download via an anchor element.
 */
export function downloadSvg(svgCode: string, filename = 'export.svg'): void {
  const blob = new Blob([svgCode], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy a shareable link to the clipboard.
 * Uses the modern API first, then falls back to execCommand.
 */
export async function copyShareableLink(url: string): Promise<string> {
  try {
    await navigator.clipboard.writeText(url);
    return 'Shareable link copied to clipboard!';
  } catch {
    return copyTextFallback(url);
  }
}
