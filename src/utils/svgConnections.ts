/**
 * SVG connection (auto-connect) utilities.
 * Manages data-connections attributes on lines/polylines,
 * snapping their endpoints to the edges of connected shapes.
 */

import { getSVGBBox, getShapeEdgePoint } from './svgGeometry';

/**
 * Update all elements with data-connections attributes so their
 * endpoints snap to the connected shape boundaries.
 *
 * @returns true if any attribute was modified, false otherwise.
 */
export function updateAllConnectedLines(svg: SVGSVGElement): boolean {
  let changed = false;
  const lines = svg.querySelectorAll('[data-connections]');

  lines.forEach((lineEl) => {
    const line = lineEl as SVGElement;
    const tag = line.tagName.toLowerCase();
    const connsStr = line.getAttribute('data-connections') || '';
    const conns = connsStr.split(',').map((s) => s.trim());

    if (tag === 'line') {
      changed = updateLineConnections(svg, line, conns) || changed;
    } else if (tag === 'polyline' || tag === 'polygon') {
      changed = updatePolyConnections(svg, line, conns) || changed;
    }
  });

  return changed;
}

export function updateConnectedLines(svg: SVGSVGElement, element: SVGElement): boolean {
  const id = element.getAttribute('id');
  if (!id) return false;
  return updateAllConnectedLines(svg);
}

/** Update a <line> element's endpoints based on its data-connections. */
function updateLineConnections(
  svg: SVGSVGElement,
  line: SVGElement,
  conns: string[],
): boolean {
  let changed = false;
  const srcEl = conns[0] ? svg.querySelector(`[id="${conns[0]}"]`) as SVGGraphicsElement | null : null;
  const tgtEl = conns[1] ? svg.querySelector(`[id="${conns[1]}"]`) as SVGGraphicsElement | null : null;

  const srcBBox = srcEl ? getSVGBBox(svg, srcEl) : null;
  const tgtBBox = tgtEl ? getSVGBBox(svg, tgtEl) : null;

  const cx1 = srcBBox
    ? srcBBox.x + srcBBox.width / 2
    : parseFloat(line.getAttribute('x1') || '0');
  const cy1 = srcBBox
    ? srcBBox.y + srcBBox.height / 2
    : parseFloat(line.getAttribute('y1') || '0');
  const cx2 = tgtBBox
    ? tgtBBox.x + tgtBBox.width / 2
    : parseFloat(line.getAttribute('x2') || '0');
  const cy2 = tgtBBox
    ? tgtBBox.y + tgtBBox.height / 2
    : parseFloat(line.getAttribute('y2') || '0');

  if (srcEl) {
    const p = getShapeEdgePoint(svg, srcEl, cx2, cy2);
    if (parseFloat(line.getAttribute('x1') || '0') !== p.x ||
        parseFloat(line.getAttribute('y1') || '0') !== p.y) {
      line.setAttribute('x1', String(p.x));
      line.setAttribute('y1', String(p.y));
      changed = true;
    }
  }
  if (tgtEl) {
    const p = getShapeEdgePoint(svg, tgtEl, cx1, cy1);
    if (parseFloat(line.getAttribute('x2') || '0') !== p.x ||
        parseFloat(line.getAttribute('y2') || '0') !== p.y) {
      line.setAttribute('x2', String(p.x));
      line.setAttribute('y2', String(p.y));
      changed = true;
    }
  }

  return changed;
}

/** Update a <polyline> or <polygon> element's vertex positions based on data-connections. */
function updatePolyConnections(
  svg: SVGSVGElement,
  line: SVGElement,
  conns: string[],
): boolean {
  const ptsStr = line.getAttribute('points');
  if (!ptsStr) return false;

  const pts = ptsStr.trim().split(/[\s,]+/).filter((p) => p !== '');
  let pChanged = false;

  for (let i = 0; i < Math.min(conns.length, pts.length / 2); i++) {
    if (!conns[i]) continue;
    const targetEl = svg.querySelector(`[id="${conns[i]}"]`) as SVGGraphicsElement | null;
    if (!targetEl || i * 2 + 1 >= pts.length) continue;

    let adjIdx = i === 0 ? 1 : i - 1;
    if (adjIdx * 2 + 1 >= pts.length) adjIdx = 0;
    const adjX = parseFloat(pts[adjIdx * 2] || '0');
    const adjY = parseFloat(pts[adjIdx * 2 + 1] || '0');

    const p = getShapeEdgePoint(svg, targetEl, adjX, adjY);
    if (parseFloat(pts[i * 2]) !== p.x || parseFloat(pts[i * 2 + 1]) !== p.y) {
      pts[i * 2] = p.x.toFixed(1);
      pts[i * 2 + 1] = p.y.toFixed(1);
      pChanged = true;
    }
  }

  if (pChanged) {
    line.setAttribute('points', pts.join(' '));
  }

  return pChanged;
}
