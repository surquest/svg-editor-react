/**
 * Canvas – SVG preview area with selection overlay, resize handles,
 * zoom controls, and marquee selection.
 *
 * The actual SVG is rendered into renderTargetRef via innerHTML
 * (managed by the editor hook). This component provides the visual
 * chrome: checkerboard background, selection box, interactive handles,
 * zoom buttons, and usage hints.
 */
'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { Box, IconButton, Typography, Stack, Paper } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { getSVGBBox } from '@/utils/svgGeometry';

interface CanvasProps {
  renderTargetRef: React.RefObject<HTMLDivElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  selectionOverlayRef: React.RefObject<HTMLDivElement | null>;
  marqueeBoxRef: React.RefObject<HTMLDivElement | null>;
  canvasSize: { width: number; height: number };
  selectedElements: SVGElement[];
  scale: number;
  zoomLabel: string;
  getRootSVG: () => SVGSVGElement | null;
  /** Ref that Canvas fills with its overlay-update function so the editor can call it during drag/resize */
  updateOverlayRef: React.MutableRefObject<(() => void) | null>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onWheel: (e: React.WheelEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/** CSS for a checkerboard transparency pattern */
const CHECKERBOARD_SX = {
  backgroundImage:
    'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), ' +
    'linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), ' +
    'linear-gradient(45deg, transparent 75%, #f0f0f0 75%), ' +
    'linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
  bgcolor: '#ffffff',
};

export default React.memo(function Canvas({
  renderTargetRef,
  canvasContainerRef,
  selectionOverlayRef,
  marqueeBoxRef,
  canvasSize,
  selectedElements,
  scale,
  zoomLabel,
  getRootSVG,
  updateOverlayRef,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onWheel,
  onMouseDown,
  onContextMenu,
}: CanvasProps) {
  /** updateOverlay – Recompute the position/size of the selection overlay and resize handles.
   *  Called whenever selectedElements or scale change. */
  const updateOverlay = useCallback(() => {
    const overlay = selectionOverlayRef.current;
    const container = canvasContainerRef.current;
    if (!overlay || !container) return;

    if (selectedElements.length === 0) {
      overlay.style.display = 'none';
      return;
    }

    const containerRect = container.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    selectedElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      minX = Math.min(minX, rect.left);
      minY = Math.min(minY, rect.top);
      maxX = Math.max(maxX, rect.right);
      maxY = Math.max(maxY, rect.bottom);
    });

    overlay.style.display = 'block';
    overlay.style.left = `${(minX - containerRect.left) / scale - 4}px`;
    overlay.style.top = `${(minY - containerRect.top) / scale - 4}px`;
    overlay.style.width = `${(maxX - minX) / scale + 8}px`;
    overlay.style.height = `${(maxY - minY) / scale + 8}px`;

    const isLine = selectedElements.length === 1 && selectedElements[0].tagName.toLowerCase() === 'line';
    const isPathLike =
      selectedElements.length === 1 &&
      ['polyline', 'polygon'].includes(selectedElements[0].tagName.toLowerCase());

    // Show/hide standard handles vs line handles
    overlay.querySelectorAll<HTMLElement>('.standard-handle').forEach((h) => {
      h.style.display = isLine || isPathLike ? 'none' : 'block';
    });
    overlay.querySelectorAll<HTMLElement>('.line-handle').forEach((h) => {
      h.style.display = isLine ? 'block' : 'none';
    });
    overlay.querySelectorAll<HTMLElement>('.poly-handle').forEach((h) => h.remove());

    const svg = getRootSVG();
    if (!svg) return;

    if (isLine) {
      // Position line endpoint handles – no rectangle border, just the point handles
      overlay.classList.remove('selection-border');
      overlay.style.background = 'transparent';
      overlay.style.border = 'none';
      const line = selectedElements[0];
      const matrix = (line as SVGGraphicsElement).getScreenCTM();
      if (!matrix) return;
      const pt1 = svg.createSVGPoint();
      const pt2 = svg.createSVGPoint();
      pt1.x = parseFloat(line.getAttribute('x1') || '0');
      pt1.y = parseFloat(line.getAttribute('y1') || '0');
      pt2.x = parseFloat(line.getAttribute('x2') || '0');
      pt2.y = parseFloat(line.getAttribute('y2') || '0');
      const sp1 = pt1.matrixTransform(matrix);
      const sp2 = pt2.matrixTransform(matrix);
      const ovL = parseFloat(overlay.style.left);
      const ovT = parseFloat(overlay.style.top);
      const h1 = overlay.querySelector<HTMLElement>('#handle-line-p1');
      const h2 = overlay.querySelector<HTMLElement>('#handle-line-p2');
      if (h1) { h1.style.left = `${(sp1.x - containerRect.left) / scale - ovL}px`; h1.style.top = `${(sp1.y - containerRect.top) / scale - ovT}px`; }
      if (h2) { h2.style.left = `${(sp2.x - containerRect.left) / scale - ovL}px`; h2.style.top = `${(sp2.y - containerRect.top) / scale - ovT}px`; }
    } else if (isPathLike) {
      // Create per-vertex handles for polygon/polyline – no rectangle border
      overlay.classList.remove('selection-border');
      overlay.style.background = 'transparent';
      overlay.style.border = 'none';
      const pEl = selectedElements[0];
      const matrix = (pEl as SVGGraphicsElement).getScreenCTM();
      if (!matrix) return;
      const ovL = parseFloat(overlay.style.left);
      const ovT = parseFloat(overlay.style.top);
      const pStr = pEl.getAttribute('points');
      if (pStr) {
        const pts = pStr.trim().split(/[\s,]+/).filter((p) => p !== '');
        for (let i = 0; i < pts.length; i += 2) {
          const pt = svg.createSVGPoint();
          pt.x = parseFloat(pts[i]);
          pt.y = parseFloat(pts[i + 1] || '0');
          const spt = pt.matrixTransform(matrix);
          const handle = document.createElement('div');
          handle.className = 'poly-handle resize-handle';
          handle.id = `handle-poly-${i / 2}`;
          Object.assign(handle.style, {
            position: 'absolute',
            width: '12px',
            height: '12px',
            background: 'white',
            border: '1px solid #4f46e5',
            borderRadius: '50%',
            transform: 'translate(-6px, -6px)',
            cursor: 'crosshair',
            pointerEvents: 'auto',
            left: `${(spt.x - containerRect.left) / scale - ovL}px`,
            top: `${(spt.y - containerRect.top) / scale - ovT}px`,
          });
          overlay.appendChild(handle);
        }
      }
    } else {
      // Standard selection box styling – restore border for shapes
      overlay.classList.add('selection-border');
      overlay.style.border = '1px solid #4f46e5';
      overlay.style.background = 'rgba(79, 70, 229, 0.05)';
    }
  }, [selectedElements, scale, canvasContainerRef, selectionOverlayRef, getRootSVG]);

  // Update overlay whenever selection or scale changes
  useEffect(() => {
    updateOverlay();
  }, [updateOverlay]);

  // Register the overlay-update callback so useSvgEditor can invoke it during drag/resize
  useEffect(() => {
    updateOverlayRef.current = updateOverlay;
    return () => { updateOverlayRef.current = null; };
  }, [updateOverlay, updateOverlayRef]);

  // Also update on window resize
  useEffect(() => {
    const handler = () => updateOverlay();
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [updateOverlay]);

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Scrollable canvas wrapper */}
      <Box
        sx={{ position: 'absolute', inset: 0, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}
        onWheel={onWheel}
      >
        <Box
          ref={canvasContainerRef}
          onMouseDown={onMouseDown}
          onContextMenu={onContextMenu}
          sx={{
            position: 'relative',
            width: canvasSize.width,
            height: canvasSize.height,
            ...CHECKERBOARD_SX,
            boxShadow: 4,
            border: 1,
            borderColor: 'grey.300',
            borderRadius: 0.5,
            overflow: 'hidden',
            userSelect: 'none',
            transform: `scale(${scale})`,
            transformOrigin: 'center',
          }}
        >
          {/* SVG render target */}
          <Box ref={renderTargetRef} sx={{ width: '100%', height: '100%', '& svg text': { userSelect: 'none' } }} />

          {/* Selection overlay with resize handles */}
          <SelectionOverlay ref={selectionOverlayRef} />

          {/* Marquee box */}
          <Box
            ref={marqueeBoxRef}
            sx={{
              position: 'absolute',
              border: '1px solid',
              borderColor: 'info.main',
              bgcolor: 'rgba(59, 130, 246, 0.2)',
              pointerEvents: 'none',
              display: 'none',
              zIndex: 20,
            }}
          />
        </Box>
      </Box>

      {/* Usage hints */}
      <Paper
        variant="outlined"
        sx={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          px: 1.5,
          py: 1,
          pointerEvents: 'none',
          opacity: 0.9,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Select: Click &bull; Multi-select: Shift + Click &bull; Delete: Backspace/Del
        </Typography>
      </Paper>

      {/* Zoom controls */}
      <Paper
        variant="outlined"
        sx={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', alignItems: 'center' }}
      >
        <IconButton size="small" onClick={onZoomOut} title="Zoom Out">
          <RemoveIcon fontSize="small" />
        </IconButton>
        <Typography
          variant="caption"
          sx={{
            px: 1,
            fontFamily: 'monospace',
            cursor: 'pointer',
            userSelect: 'none',
            minWidth: 48,
            textAlign: 'center',
          }}
          onClick={onResetZoom}
          title="Reset Zoom"
        >
          {zoomLabel}
        </Typography>
        <IconButton size="small" onClick={onZoomIn} title="Zoom In">
          <AddIcon fontSize="small" />
        </IconButton>
      </Paper>
    </Box>
  );
});

/* ---- Selection overlay sub-component (with resize handles) ---- */
const SelectionOverlay = React.forwardRef<HTMLDivElement>(function SelectionOverlay(_, ref) {
  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: 12,
    height: 12,
    background: 'white',
    border: '1px solid #4f46e5',
    borderRadius: 2,
    pointerEvents: 'auto',
  };
  const lineHandleStyle: React.CSSProperties = {
    ...handleStyle,
    borderRadius: '50%',
    transform: 'translate(-6px, -6px)',
    cursor: 'crosshair',
    display: 'none',
  };

  return (
    <div
      ref={ref}
      className="selection-border"
      style={{
        position: 'absolute',
        border: '1px solid #4f46e5',
        pointerEvents: 'none',
        display: 'none',
        zIndex: 10,
        background: 'rgba(79, 70, 229, 0.05)',
      }}
    >
      {/* Standard 8-point resize handles */}
      <div id="handle-tl" className="resize-handle standard-handle" style={{ ...handleStyle, left: -6, top: -6, cursor: 'nw-resize' }} />
      <div id="handle-t" className="resize-handle standard-handle" style={{ ...handleStyle, left: '50%', top: -6, transform: 'translateX(-50%)', cursor: 'n-resize' }} />
      <div id="handle-tr" className="resize-handle standard-handle" style={{ ...handleStyle, right: -6, top: -6, cursor: 'ne-resize' }} />
      <div id="handle-l" className="resize-handle standard-handle" style={{ ...handleStyle, left: -6, top: '50%', transform: 'translateY(-50%)', cursor: 'w-resize' }} />
      <div id="handle-r" className="resize-handle standard-handle" style={{ ...handleStyle, right: -6, top: '50%', transform: 'translateY(-50%)', cursor: 'e-resize' }} />
      <div id="handle-bl" className="resize-handle standard-handle" style={{ ...handleStyle, left: -6, bottom: -6, cursor: 'sw-resize' }} />
      <div id="handle-b" className="resize-handle standard-handle" style={{ ...handleStyle, left: '50%', bottom: -6, transform: 'translateX(-50%)', cursor: 's-resize' }} />
      <div id="handle-br" className="resize-handle standard-handle" style={{ ...handleStyle, right: -6, bottom: -6, cursor: 'se-resize' }} />

      {/* Line endpoint handles (shown only for <line> elements) */}
      <div id="handle-line-p1" className="resize-handle line-handle" style={lineHandleStyle} />
      <div id="handle-line-p2" className="resize-handle line-handle" style={lineHandleStyle} />
    </div>
  );
});
