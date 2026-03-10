/**
 * SVG geometry utilities.
 * Provides coordinate transformations, bounding-box calculations,
 * and edge-point finding for shape-to-shape line connections.
 */

import type { Point, SvgBBox } from '@/types/editor';

/** Convert client (screen) coordinates to SVG user-space coordinates. */
export function getSVGPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): Point {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}

/** Convert client coordinates to an element's local coordinate space. */
export function getLocalSVGPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  element: SVGGraphicsElement,
): Point {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = element.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return pt.matrixTransform(ctm.inverse());
}

/**
 * Get the bounding box of an SVG element in SVG user-space coordinates.
 * Uses getBoundingClientRect() + inverse CTM to handle transforms correctly.
 */
export function getSVGBBox(svg: SVGSVGElement, el: SVGGraphicsElement): SvgBBox {
  const rect = el.getBoundingClientRect();
  const pt1 = svg.createSVGPoint();
  const pt2 = svg.createSVGPoint();
  pt1.x = rect.left;
  pt1.y = rect.top;
  pt2.x = rect.right;
  pt2.y = rect.bottom;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0, width: 0, height: 0 };
  const matrix = ctm.inverse();
  const p1 = pt1.matrixTransform(matrix);
  const p2 = pt2.matrixTransform(matrix);
  return {
    x: Math.min(p1.x, p2.x),
    y: Math.min(p1.y, p2.y),
    width: Math.abs(p2.x - p1.x),
    height: Math.abs(p2.y - p1.y),
  };
}

/**
 * Find the point on a shape's edge closest to the ray from its center toward (tgtX, tgtY).
 * Used by auto-connect to position line endpoints on shape boundaries.
 *
 * For circles/ellipses: uses parametric ellipse intersection.
 * For polygons/polylines/lines: uses ray–segment intersection.
 * Fallback: bounding-box edge intersection (rect, text, etc.).
 */
export function getShapeEdgePoint(
  svg: SVGSVGElement,
  el: SVGGraphicsElement,
  tgtX: number,
  tgtY: number,
): Point {
  const bbox = getSVGBBox(svg, el);
  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;
  const dx = tgtX - cx;
  const dy = tgtY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const tag = el.tagName.toLowerCase();

  // Circle / ellipse: approximate with bounding-box ellipse
  if (tag === 'circle' || tag === 'ellipse') {
    const hw = bbox.width / 2;
    const hh = bbox.height / 2;
    const t = 1 / Math.sqrt(Math.pow(dx / hw, 2) + Math.pow(dy / hh, 2));
    return {
      x: +(cx + dx * t).toFixed(1),
      y: +(cy + dy * t).toFixed(1),
    };
  }

  // Polygon / polyline / line: ray-casting against edge segments
  if (tag === 'polygon' || tag === 'polyline' || tag === 'line') {
    let points: Point[] = [];
    if (tag === 'line') {
      points = [
        { x: parseFloat(el.getAttribute('x1') || '0'), y: parseFloat(el.getAttribute('y1') || '0') },
        { x: parseFloat(el.getAttribute('x2') || '0'), y: parseFloat(el.getAttribute('y2') || '0') },
      ];
    } else {
      const pStr = el.getAttribute('points');
      if (pStr) {
        const pts = pStr.trim().split(/[\s,]+/).filter((p) => p);
        for (let i = 0; i < pts.length; i += 2) {
          points.push({ x: parseFloat(pts[i]), y: parseFloat(pts[i + 1] || '0') });
        }
      }
    }

    // Transform points to SVG user-space via the element's CTM
    const elCtm = el.getScreenCTM();
    const svgCtm = svg.getScreenCTM();
    if (elCtm && svgCtm) {
      const matrix = elCtm.multiply(svgCtm.inverse());
      const trPoints = points.map((p) => {
        const pt = svg.createSVGPoint();
        pt.x = p.x;
        pt.y = p.y;
        return pt.matrixTransform(matrix);
      });

      if (tag === 'polygon' && trPoints.length > 2) {
        trPoints.push(trPoints[0]); // close polygon
      }

      const rayX2 = cx + dx * 1000;
      const rayY2 = cy + dy * 1000;
      let closestT = Infinity;
      let edgePt: Point | null = null;

      for (let i = 0; i < trPoints.length - 1; i++) {
        const p1 = trPoints[i];
        const p2 = trPoints[i + 1];
        const pt = lineIntersect(cx, cy, rayX2, rayY2, p1.x, p1.y, p2.x, p2.y);
        if (pt && pt.t < closestT) {
          closestT = pt.t;
          edgePt = { x: pt.x, y: pt.y };
        }
      }

      if (edgePt) {
        return { x: +edgePt.x.toFixed(1), y: +edgePt.y.toFixed(1) };
      }
    }
  }

  // Fallback: bounding-box edge intersection (works for rect, text, etc.)
  const hw = bbox.width / 2;
  const hh = bbox.height / 2;
  const tx = dx === 0 ? Infinity : Math.abs(hw / dx);
  const ty = dy === 0 ? Infinity : Math.abs(hh / dy);
  const t = Math.min(tx, ty);
  return { x: +(cx + dx * t).toFixed(1), y: +(cy + dy * t).toFixed(1) };
}

/**
 * Line–line intersection using parametric form.
 * Returns the intersection point and parameter t if segments intersect, else null.
 */
function lineIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
): { x: number; y: number; t: number } | null {
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (den === 0) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
  if (t > 0 && t < 1 && u > 0 && u < 1) {
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), t };
  }
  return null;
}
