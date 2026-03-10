/**
 * useZoom – Canvas zoom state and controls.
 * Provides zoom level, zoom in/out/reset, and wheel handler.
 */

import { useState, useCallback, useMemo } from 'react';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

export function useZoom(initial = 1) {
  const [scale, setScale] = useState(initial);

  const setZoom = useCallback((newScale: number) => {
    setScale(Math.max(MIN_ZOOM, Math.min(newScale, MAX_ZOOM)));
  }, []);

  const zoomIn = useCallback(() => setScale(s => Math.max(MIN_ZOOM, Math.min(s + 0.1, MAX_ZOOM))), []);
  const zoomOut = useCallback(() => setScale(s => Math.max(MIN_ZOOM, Math.min(s - 0.1, MAX_ZOOM))), []);
  const resetZoom = useCallback(() => setScale(1), []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale(s => Math.max(MIN_ZOOM, Math.min(s + delta, MAX_ZOOM)));
    },
    [],
  );

  const zoomLabel = `${Math.round(scale * 100)}%`;

  return useMemo(() => ({ scale, setZoom, zoomIn, zoomOut, resetZoom, handleWheel, zoomLabel }), [scale, setZoom, zoomIn, zoomOut, resetZoom, handleWheel, zoomLabel]);
}
