/**
 * SVG transform utilities.
 * Provides functions for moving (delta) and scaling SVG elements
 * in response to drag and resize operations.
 */

import { optimize } from 'svgo/browser';

/**
 * Convert a world-space point to the local coordinate system of an element
 * by parsing its transform attribute and applying the inverse.
 */
function worldToLocal(transform: string, wx: number, wy: number): { x: number; y: number } {
  // Use a temporary SVG to compute the inverse CTM of the transform
  const ns = 'http://www.w3.org/2000/svg';
  const tmp = document.createElementNS(ns, 'svg');
  tmp.setAttribute('xmlns', ns);
  tmp.style.position = 'absolute';
  tmp.style.width = '0';
  tmp.style.height = '0';
  tmp.style.overflow = 'hidden';
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('transform', transform);
  tmp.appendChild(g);
  document.body.appendChild(tmp);
  try {
    const ctm = g.getCTM();
    if (ctm) {
      const inv = ctm.inverse();
      return { x: inv.a * wx + inv.c * wy + inv.e, y: inv.b * wx + inv.d * wy + inv.f };
    }
  } finally {
    document.body.removeChild(tmp);
  }
  return { x: wx, y: wy };
}

/**
 * Collapse chained translate/scale transforms into a single optimized transform
 * using svgo's convertTransform plugin.
 */
export function optimizeTransform(transform: string): string {
  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg"><g transform="${transform}"/></svg>`;
  const result = optimize(svgStr, {
    plugins: [
      {
        name: 'convertTransform',
        params: {
          transformPrecision: 6,
        },
      },
    ],
  });
  const match = result.data.match(/transform="([^"]*)"/);
  return match ? match[1] : transform;
}

/**
 * Apply a translation delta to an SVG element.
 * Handles each shape type's specific position attributes (x/y, cx/cy, points, etc.).
 *
 * @param target - The element to move (live DOM node).
 * @param orig - A snapshot clone of the element from before the drag started.
 * @param dx - Horizontal offset in SVG units.
 * @param dy - Vertical offset in SVG units.
 */
export function applyDelta(
  target: SVGElement,
  orig: SVGElement,
  dx: number,
  dy: number,
): void {
  const tag = target.tagName.toLowerCase();

  if (['rect', 'text', 'image', 'use'].includes(tag)) {
    target.setAttribute('x', String(parseFloat(orig.getAttribute('x') || '0') + dx));
    target.setAttribute('y', String(parseFloat(orig.getAttribute('y') || '0') + dy));
  } else if (['circle', 'ellipse'].includes(tag)) {
    target.setAttribute('cx', String(parseFloat(orig.getAttribute('cx') || '0') + dx));
    target.setAttribute('cy', String(parseFloat(orig.getAttribute('cy') || '0') + dy));
  } else if (tag === 'line') {
    target.setAttribute('x1', String(parseFloat(orig.getAttribute('x1') || '0') + dx));
    target.setAttribute('y1', String(parseFloat(orig.getAttribute('y1') || '0') + dy));
    target.setAttribute('x2', String(parseFloat(orig.getAttribute('x2') || '0') + dx));
    target.setAttribute('y2', String(parseFloat(orig.getAttribute('y2') || '0') + dy));
  } else if (['polygon', 'polyline'].includes(tag)) {
    const pStr = orig.getAttribute('points');
    if (pStr) {
      const pts = pStr.trim().split(/[\s,]+/).filter((p) => p);
      const npts: string[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        npts.push(`${parseFloat(pts[i]) + dx},${parseFloat(pts[i + 1] || '0') + dy}`);
      }
      target.setAttribute('points', npts.join(' '));
    }
  } else if (tag === 'path') {
    // Translate path coordinates directly in the d attribute
    const d = orig.getAttribute('d');
    if (d) {
      target.setAttribute('d', translatePathD(d, dx, dy));
    }
    // Preserve any existing transform unchanged
    const transform = orig.getAttribute('transform');
    if (transform) target.setAttribute('transform', transform);
    else target.removeAttribute('transform');
  } else {
    // Generic fallback: apply/update a translate() transform
    let transform = orig.getAttribute('transform') || '';
    const match = transform.match(/translate\(([-0-9.]+)(?:[\s,]+([-0-9.]+))?\)/);
    if (match) {
      const tx = parseFloat(match[1]) + dx;
      const ty = (match[2] !== undefined ? parseFloat(match[2]) : 0) + dy;
      target.setAttribute('transform', optimizeTransform(transform.replace(match[0], `translate(${tx}, ${ty})`)));
    } else {
      target.setAttribute('transform', optimizeTransform(`translate(${dx}, ${dy}) ${transform}`.trim()));
    }
  }
}

/**
 * Apply a scale transformation around a fixed origin point.
 * Handles each shape type's geometry attributes specifically.
 *
 * @param target - The element to scale (live DOM node).
 * @param orig - A snapshot clone from before the resize started.
 * @param sx - Horizontal scale factor.
 * @param sy - Vertical scale factor.
 * @param ox - X coordinate of the scale origin.
 * @param oy - Y coordinate of the scale origin.
 */
export function applyScale(
  target: SVGElement,
  orig: SVGElement,
  sx: number,
  sy: number,
  ox: number,
  oy: number,
): void {
  const tag = target.tagName.toLowerCase();

  if (['rect', 'image'].includes(tag)) {
    const w = parseFloat(orig.getAttribute('width') || '0');
    const h = parseFloat(orig.getAttribute('height') || '0');
    const x = parseFloat(orig.getAttribute('x') || '0');
    const y = parseFloat(orig.getAttribute('y') || '0');
    target.setAttribute('width', String(Math.max(1, w * sx)));
    target.setAttribute('height', String(Math.max(1, h * sy)));
    target.setAttribute('x', String(ox + (x - ox) * sx));
    target.setAttribute('y', String(oy + (y - oy) * sy));
  } else if (tag === 'circle') {
    const r = parseFloat(orig.getAttribute('r') || '0');
    const cx = parseFloat(orig.getAttribute('cx') || '0');
    const cy = parseFloat(orig.getAttribute('cy') || '0');
    const s = Math.max(sx, sy);
    target.setAttribute('r', String(Math.max(1, r * s)));
    target.setAttribute('cx', String(ox + (cx - ox) * sx));
    target.setAttribute('cy', String(oy + (cy - oy) * sy));
  } else if (tag === 'ellipse') {
    const rx = parseFloat(orig.getAttribute('rx') || '0');
    const ry = parseFloat(orig.getAttribute('ry') || '0');
    const cx = parseFloat(orig.getAttribute('cx') || '0');
    const cy = parseFloat(orig.getAttribute('cy') || '0');
    target.setAttribute('rx', String(Math.max(1, rx * sx)));
    target.setAttribute('ry', String(Math.max(1, ry * sy)));
    target.setAttribute('cx', String(ox + (cx - ox) * sx));
    target.setAttribute('cy', String(oy + (cy - oy) * sy));
  } else if (tag === 'line') {
    const x1 = parseFloat(orig.getAttribute('x1') || '0');
    const y1 = parseFloat(orig.getAttribute('y1') || '0');
    const x2 = parseFloat(orig.getAttribute('x2') || '0');
    const y2 = parseFloat(orig.getAttribute('y2') || '0');
    target.setAttribute('x1', String(ox + (x1 - ox) * sx));
    target.setAttribute('y1', String(oy + (y1 - oy) * sy));
    target.setAttribute('x2', String(ox + (x2 - ox) * sx));
    target.setAttribute('y2', String(oy + (y2 - oy) * sy));
  } else if (['polygon', 'polyline'].includes(tag)) {
    const pts = orig.getAttribute('points')?.trim().split(/[\s,]+/).filter((p) => p) || [];
    const npts: string[] = [];
    for (let i = 0; i < pts.length; i += 2) {
      npts.push(
        `${ox + (parseFloat(pts[i]) - ox) * sx},${oy + (parseFloat(pts[i + 1]) - oy) * sy}`,
      );
    }
    target.setAttribute('points', npts.join(' '));
  } else if (tag === 'path') {
    const d = orig.getAttribute('d');
    const transform = orig.getAttribute('transform') || '';
    if (d && !transform) {
      // No existing transform – scale d attribute directly in SVG user-space
      target.setAttribute('d', scalePathD(d, sx, sy, ox, oy));
    } else if (d && transform) {
      // Has a transform – convert origin to local coords, scale d, keep transform
      const local = worldToLocal(transform, ox, oy);
      target.setAttribute('d', scalePathD(d, sx, sy, local.x, local.y));
      target.setAttribute('transform', transform);
    }
  } else {
    // Generic fallback: wrap in scale transform, optimized via svgo.
    // Scale-around-origin must be placed BEFORE the existing transform so that
    // (ox, oy) is interpreted in SVG user-space (world coordinates), not in the
    // element's local coordinate system.
    const transform = orig.getAttribute('transform') || '';
    target.setAttribute(
      'transform',
      optimizeTransform(
        `translate(${ox}, ${oy}) scale(${sx}, ${sy}) translate(${-ox}, ${-oy}) ${transform}`.trim(),
      ),
    );
  }
}

/**
 * Scale all coordinates in an SVG path `d` attribute around a given origin.
 * Handles both absolute (uppercase) and relative (lowercase) commands.
 */
function scalePathD(
  d: string,
  sx: number,
  sy: number,
  ox: number,
  oy: number,
): string {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return d;

  const out: string[] = [];
  let i = 0;

  const scaleX = (v: number, rel: boolean) => (rel ? v * sx : ox + (v - ox) * sx);
  const scaleY = (v: number, rel: boolean) => (rel ? v * sy : oy + (v - oy) * sy);
  const num = (idx: number) => parseFloat(tokens[idx]);
  const isNum = (idx: number) => idx < tokens.length && !/[a-zA-Z]/.test(tokens[idx]);

  while (i < tokens.length) {
    const t = tokens[i];
    if (!/[a-zA-Z]/.test(t)) { i++; continue; } // skip orphan numbers
    out.push(t);
    i++;
    const rel = t === t.toLowerCase();
    const cmd = t.toUpperCase();

    switch (cmd) {
      case 'M': case 'L': case 'T':
        while (isNum(i) && isNum(i + 1)) {
          out.push(String(scaleX(num(i), rel)), String(scaleY(num(i + 1), rel)));
          i += 2;
        }
        break;
      case 'H':
        while (isNum(i)) { out.push(String(scaleX(num(i), rel))); i++; }
        break;
      case 'V':
        while (isNum(i)) { out.push(String(scaleY(num(i), rel))); i++; }
        break;
      case 'C':
        while (isNum(i) && isNum(i + 5)) {
          for (let j = 0; j < 3; j++) {
            out.push(String(scaleX(num(i), rel)), String(scaleY(num(i + 1), rel)));
            i += 2;
          }
        }
        break;
      case 'S': case 'Q':
        while (isNum(i) && isNum(i + 3)) {
          for (let j = 0; j < 2; j++) {
            out.push(String(scaleX(num(i), rel)), String(scaleY(num(i + 1), rel)));
            i += 2;
          }
        }
        break;
      case 'A':
        while (isNum(i) && isNum(i + 6)) {
          // rx, ry – scale radii
          out.push(String(Math.abs(num(i) * sx)), String(Math.abs(num(i + 1) * sy)));
          out.push(tokens[i + 2]); // x-rotation
          out.push(tokens[i + 3]); // large-arc-flag
          out.push(tokens[i + 4]); // sweep-flag
          out.push(String(scaleX(num(i + 5), rel)), String(scaleY(num(i + 6), rel)));
          i += 7;
        }
        break;
      case 'Z':
        break;
      default:
        break;
    }
  }
  return out.join(' ');
}

/**
 * Translate all absolute coordinates in an SVG path `d` attribute by (dx, dy).
 * Relative commands are unchanged since they already encode deltas.
 */
function translatePathD(d: string, dx: number, dy: number): string {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
  if (!tokens) return d;

  const out: string[] = [];
  let i = 0;
  const num = (idx: number) => parseFloat(tokens[idx]);
  const isNum = (idx: number) => idx < tokens.length && !/[a-zA-Z]/.test(tokens[idx]);

  while (i < tokens.length) {
    const t = tokens[i];
    if (!/[a-zA-Z]/.test(t)) { i++; continue; }
    out.push(t);
    i++;
    const rel = t === t.toLowerCase();
    const cmd = t.toUpperCase();

    switch (cmd) {
      case 'M': case 'L': case 'T':
        while (isNum(i) && isNum(i + 1)) {
          out.push(String(rel ? num(i) : num(i) + dx), String(rel ? num(i + 1) : num(i + 1) + dy));
          i += 2;
        }
        break;
      case 'H':
        while (isNum(i)) { out.push(String(rel ? num(i) : num(i) + dx)); i++; }
        break;
      case 'V':
        while (isNum(i)) { out.push(String(rel ? num(i) : num(i) + dy)); i++; }
        break;
      case 'C':
        while (isNum(i) && isNum(i + 5)) {
          for (let j = 0; j < 3; j++) {
            out.push(String(rel ? num(i) : num(i) + dx), String(rel ? num(i + 1) : num(i + 1) + dy));
            i += 2;
          }
        }
        break;
      case 'S': case 'Q':
        while (isNum(i) && isNum(i + 3)) {
          for (let j = 0; j < 2; j++) {
            out.push(String(rel ? num(i) : num(i) + dx), String(rel ? num(i + 1) : num(i + 1) + dy));
            i += 2;
          }
        }
        break;
      case 'A':
        while (isNum(i) && isNum(i + 6)) {
          out.push(tokens[i], tokens[i + 1]); // rx, ry unchanged
          out.push(tokens[i + 2]); // x-rotation
          out.push(tokens[i + 3]); // large-arc-flag
          out.push(tokens[i + 4]); // sweep-flag
          out.push(String(rel ? num(i + 5) : num(i + 5) + dx), String(rel ? num(i + 6) : num(i + 6) + dy));
          i += 7;
        }
        break;
      case 'Z': break;
      default: break;
    }
  }
  return out.join(' ');
}
