/**
 * useSvgEditor – Central state management hook for the SVG editor.
 *
 * Owns all mutable editor state and exposes action functions that
 * the UI components call. Keeps SVG code ↔ DOM synchronisation,
 * selection management, undo history, connection updates, and
 * keyboard/mouse interaction logic in one place so components
 * stay purely presentational.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { formatSVG, cleanAndFormatSVG } from '@/utils/svgFormat';
import { getSVGPoint, getLocalSVGPoint, getSVGBBox } from '@/utils/svgGeometry';
import { applyDelta, applyScale, optimizeTransform } from '@/utils/svgTransform';
import { updateAllConnectedLines } from '@/utils/svgConnections';
import { copySvgToClipboard, downloadSvg, copyShareableLink } from '@/utils/clipboard';
import { useUndoStack } from './useUndoStack';
import { useZoom } from './useZoom';
import { useToast } from './useToast';
import type { ActiveAction, AlignDirection, SvgBBox } from '@/types/editor';
import type * as MonacoNs from 'monaco-editor';

/** Monaco editor instance type */
type IStandaloneCodeEditor = MonacoNs.editor.IStandaloneCodeEditor;

/* ----- Default SVG loaded on first visit ----- */
const DEFAULT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 500" width="100%" height="100%">
  <rect id="shape1" x="150" y="100" width="120" height="120" fill="#4f46e5" rx="8" ry="8" />
  <circle id="shape2" cx="350" cy="160" r="60" fill="#ec4899" />
  <line data-connections="shape1,shape2" x1="210" y1="160" x2="350" y2="160" stroke="#10b981" stroke-width="4" />
  <polygon points="250,280 180,400 320,400" fill="#10b981" />
  <text x="50" y="50" font-family="sans-serif" font-size="24" fill="#333">SVG Studio</text>
  <polyline points="400,300 450,350 400,400" fill="none" stroke="#f59e0b" stroke-width="4" />
</svg>`;

export function useSvgEditor() {
  /* ---- refs for DOM nodes that live outside React's render tree ---- */
  const renderTargetRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const selectionOverlayRef = useRef<HTMLDivElement>(null);
  const marqueeBoxRef = useRef<HTMLDivElement>(null);

  /** Monaco editor instance – set by CodeEditor on mount */
  const monacoEditorRef = useRef<IStandaloneCodeEditor | null>(null);
  /** Tracks current highlight decoration IDs so they can be replaced */
  const decorationsRef = useRef<MonacoNs.editor.IEditorDecorationsCollection | null>(null);

  /* ---- owned state ---- */
  const [svgCode, setSvgCode] = useState(DEFAULT_SVG);
  const [showSync, setShowSync] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarManuallyClosed, setSidebarManuallyClosed] = useState(false);
  const [selectedElements, setSelectedElements] = useState<SVGElement[]>([]);
  const [autoConnect, setAutoConnect] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 500 });

  /* ---- compose smaller hooks ---- */
  const { canUndo, pushUndo, popUndo } = useUndoStack();
  const zoom = useZoom(1);
  const toast = useToast();
  const showToast = toast.showToast;

  /* ---- interaction state kept as refs (mutated in event handlers, no re-render needed) ---- */
  const isSyncingRef = useRef(false);
  const activeActionRef = useRef<ActiveAction>(null);
  const startPtRef = useRef<{ x: number; y: number } | null>(null);
  const origStateRef = useRef<Map<SVGElement, SVGElement>>(new Map());
  const groupBBoxRef = useRef<SvgBBox | null>(null);
  const resizeDirRef = useRef<string | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const isArrowMovingRef = useRef(false);
  const drawingPolylineRef = useRef(false);
  const currentPolylineRef = useRef<SVGPolylineElement | null>(null);
  const typeTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const urlTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Callback ref for Canvas to register its overlay-update function.
  // Called during drag/resize so the selection box tracks shape movement.
  const updateOverlayRef = useRef<(() => void) | null>(null);

  // Mutable selection stored as ref for event handlers that close over stale state
  const selRef = useRef<SVGElement[]>([]);
  selRef.current = selectedElements;

  // Ref for svgCode to avoid recreating callbacks on every keystroke
  const svgCodeRef = useRef(svgCode);
  svgCodeRef.current = svgCode;

  // Stable ref for window event handlers so listeners are attached only once
  const windowHandlersRef = useRef<{
    mouseMove: (e: MouseEvent) => void;
    mouseUp: (e: MouseEvent) => void;
    keyDown: (e: KeyboardEvent) => void;
    keyUp: (e: KeyboardEvent) => void;
  } | null>(null);

  /* =========== helpers =========== */

  const getRootSVG = useCallback((): SVGSVGElement | null => {
    return renderTargetRef.current?.querySelector('svg') ?? null;
  }, []);

  /* ---- URL persistence (LZ-string compressed) ---- */
  const updateURLWithSVG = useCallback((content: string) => {
    clearTimeout(urlTimeoutRef.current);
    urlTimeoutRef.current = setTimeout(() => {
      try {
        const minified = content.replace(/>\s+</g, '><').trim();
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const LZString = require('lz-string');
        const compressed = LZString.compressToEncodedURIComponent(minified);
        const newUrl = new URL(window.location.href);
        if (compressed && compressed.length > 0) {
          newUrl.searchParams.set('svg', compressed);
        } else {
          newUrl.searchParams.delete('svg');
        }
        window.history.replaceState({}, '', newUrl.toString());
      } catch {
        // silently ignore if LZString is unavailable
      }
    }, 800);
  }, []);

  const flashSync = useCallback(
    (code: string) => {
      setShowSync(true);
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => setShowSync(false), 1000);
      updateURLWithSVG(code);
    },
    [updateURLWithSVG],
  );

  /**
   * highlightSelectionInCode – Uses Monaco decorations to highlight the
   * opening tags of currently-selected SVG elements with a translucent
   * indigo background. Replaces the old backdrop-HTML approach.
   */
  const highlightSelectionInCode = useCallback(() => {
    const editor = monacoEditorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const sel = selRef.current;
    if (sel.length === 0) {
      // Clear any existing decorations
      decorationsRef.current?.clear();
      return;
    }

    const svg = getRootSVG();
    if (!svg) return;

    // Map selected elements to their indices in the full DOM node list
    const allNodes = [svg as SVGElement, ...Array.from(svg.querySelectorAll('*'))] as SVGElement[];
    const targetIndices = sel
      .map((el) => allNodes.indexOf(el))
      .filter((idx) => idx !== -1)
      .sort((a, b) => a - b);
    if (targetIndices.length === 0) {
      decorationsRef.current?.clear();
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps

    // Walk through opening tags in the code string and match to indices
    const codeStr = model.getValue();
    const tagRegex = /<(?!\/)[a-zA-Z0-9:-]+/g;
    let match: RegExpExecArray | null;
    let currentIndex = 0;
    const charRanges: { start: number; end: number }[] = [];
    let nextTargetObj = 0;

    while ((match = tagRegex.exec(codeStr)) !== null && nextTargetObj < targetIndices.length) {
      if (currentIndex === targetIndices[nextTargetObj]) {
        const startIdx = match.index;
        const endIdx = codeStr.indexOf('>', startIdx);
        if (endIdx !== -1) charRanges.push({ start: startIdx, end: endIdx + 1 });
        nextTargetObj++;
      }
      currentIndex++;
    }

    // Convert character offsets to Monaco line/column ranges
    const newDecorations: MonacoNs.editor.IModelDeltaDecoration[] = charRanges.map((r) => {
      const startPos = model.getPositionAt(r.start);
      const endPos = model.getPositionAt(r.end);
      return {
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        },
        options: {
          className: 'svg-selection-highlight',
          isWholeLine: false,
          stickiness: 1, // NeverGrowsWhenTypingAtEdges
        },
      };
    });

    // Replace previous decorations with the new set
    if (decorationsRef.current) {
      decorationsRef.current.clear();
    }
    decorationsRef.current = editor.createDecorationsCollection(newDecorations);
  }, [getRootSVG]);

  /* ---- sync: code → DOM ---- */
  const updateDOMFromCode = useCallback(
    (codeValue?: string) => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;

      const code = codeValue ?? monacoEditorRef.current?.getModel()?.getValue() ?? svgCodeRef.current;
      const parser = new DOMParser();
      const doc = parser.parseFromString(code, 'image/svg+xml');
      const errorNode = doc.querySelector('parsererror');

      if (errorNode) {
        showToast('Invalid SVG code', 'error');
        isSyncingRef.current = false;
        return;
      }

      if (renderTargetRef.current) {
        const oldSvg = getRootSVG();
        const sel = selRef.current;
        const currentIndices = sel.map((el) => {
          if (!oldSvg) return -1;
          return Array.from(oldSvg.querySelectorAll('*')).indexOf(el);
        });

        renderTargetRef.current.innerHTML = '';
        const svg = doc.documentElement as unknown as SVGSVGElement;
        const vbAttr = svg.getAttribute('viewBox');
        if (vbAttr) {
          const vb = vbAttr.split(/[\s,]+/).map(parseFloat);
          if (vb.length === 4) {
            setCanvasSize({ width: vb[2], height: vb[3] });
          }
        }
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        renderTargetRef.current.appendChild(svg);

        // Re-run auto-connect after DOM update
        const liveSvg = getRootSVG();
        if (liveSvg && updateAllConnectedLines(liveSvg)) {
          const newStr = cleanAndFormatSVG(liveSvg);
          setSvgCode(newStr);
        }

        // Restore selection by index
        const newChildren = liveSvg ? Array.from(liveSvg.querySelectorAll('*')) : [];
        const newSel = currentIndices
          .map((idx) => (idx !== -1 ? (newChildren[idx] as SVGElement) : null))
          .filter(Boolean) as SVGElement[];
        setSelectedElements(newSel);
        flashSync(code);
      }

      isSyncingRef.current = false;
    },
    [getRootSVG, flashSync],
  );

  /* ---- sync: DOM → code ---- */
  const updateCodeFromDOM = useCallback(() => {
    if (isSyncingRef.current) return;
    const svg = getRootSVG();
    if (!svg) return;
    const newStr = cleanAndFormatSVG(svg);
    const currentCode = monacoEditorRef.current?.getModel()?.getValue() ?? svgCodeRef.current;
    if (currentCode !== newStr) {
      isSyncingRef.current = true;
      pushUndo(currentCode);
      setSvgCode(newStr);
      flashSync(newStr);
      isSyncingRef.current = false;
    }
    if (!activeActionRef.current && !isArrowMovingRef.current) {
      highlightSelectionInCode();
    }
  }, [getRootSVG, pushUndo, flashSync, highlightSelectionInCode]);

  /* =========== public actions =========== */

  /* ---- Code editor input ---- */
  const onCodeInput = useCallback(
    (value: string) => {
      setSvgCode(value);
      clearTimeout(typeTimeoutRef.current);
      typeTimeoutRef.current = setTimeout(() => updateDOMFromCode(value), 500);
    },
    [updateDOMFromCode],
  );

  const formatCode = useCallback(() => {
    const currentCode = monacoEditorRef.current?.getModel()?.getValue() ?? svgCodeRef.current;
    const formatted = formatSVG(currentCode);
    setSvgCode(formatted);
    updateDOMFromCode(formatted);
    showToast('SVG Formatted', 'success');
  }, [updateDOMFromCode, showToast]);

  /* ---- Undo ---- */
  const performUndo = useCallback(() => {
    const prev = popUndo();
    if (prev !== null) {
      setSvgCode(prev);
      updateDOMFromCode(prev);
      showToast('Undo successful');
    }
  }, [popUndo, updateDOMFromCode, showToast]);

  /* ---- Sidebar ---- */
  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
    setSidebarManuallyClosed(false);
    setTimeout(highlightSelectionInCode, 260);
  }, [highlightSelectionInCode]);

  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    setSidebarManuallyClosed(true);
    setTimeout(highlightSelectionInCode, 260);
  }, [highlightSelectionInCode]);

  /* ---- Add shapes ---- */
  const addShape = useCallback(
    (type: 'rect' | 'circle' | 'line' | 'polyline' | 'text') => {
      const svg = getRootSVG();
      if (!svg) return;

      const ns = 'http://www.w3.org/2000/svg';
      let el: SVGElement;

      switch (type) {
        case 'rect': {
          el = document.createElementNS(ns, 'rect');
          el.setAttribute('x', '100');
          el.setAttribute('y', '100');
          el.setAttribute('width', '100');
          el.setAttribute('height', '100');
          el.setAttribute('fill', '#4f46e5');
          el.setAttribute('rx', '4');
          break;
        }
        case 'circle': {
          el = document.createElementNS(ns, 'circle');
          el.setAttribute('cx', '200');
          el.setAttribute('cy', '200');
          el.setAttribute('r', '50');
          el.setAttribute('fill', '#ec4899');
          break;
        }
        case 'line': {
          el = document.createElementNS(ns, 'line');
          el.setAttribute('x1', '100');
          el.setAttribute('y1', '100');
          el.setAttribute('x2', '250');
          el.setAttribute('y2', '250');
          el.setAttribute('stroke', '#10b981');
          el.setAttribute('stroke-width', '4');
          break;
        }
        case 'polyline': {
          drawingPolylineRef.current = true;
          el = document.createElementNS(ns, 'polyline') as SVGPolylineElement;
          el.setAttribute('fill', 'none');
          el.setAttribute('stroke', '#f59e0b');
          el.setAttribute('stroke-width', '4');
          el.setAttribute('points', '');
          currentPolylineRef.current = el as SVGPolylineElement;
          svg.appendChild(el);
          setSelectedElements([el]);
          showToast('Click on canvas to add points. Right-click or ESC to finish.', 'info');
          return; // Don't update code yet – user is still drawing
        }
        case 'text': {
          el = document.createElementNS(ns, 'text');
          el.setAttribute('x', '200');
          el.setAttribute('y', '200');
          el.setAttribute('font-family', 'sans-serif');
          el.setAttribute('font-size', '24');
          el.setAttribute('fill', '#333333');
          el.textContent = 'New Text';
          break;
        }
        default:
          return;
      }

      svg.appendChild(el);
      setSelectedElements([el]);
      updateCodeFromDOM();
    },
    [getRootSVG, updateCodeFromDOM, showToast],
  );

  /* ---- Finish polyline drawing ---- */
  const finishPolyline = useCallback(() => {
    if (!drawingPolylineRef.current || !currentPolylineRef.current) return;
    const pts = currentPolylineRef.current.getAttribute('points');
    if (pts) {
      const ptsArr = pts.trim().split(/\s+/).filter(Boolean);
      if (ptsArr.length > 1) ptsArr.pop(); // remove preview point
      currentPolylineRef.current.setAttribute('points', ptsArr.join(' '));
      if (ptsArr.length <= 1) {
        currentPolylineRef.current.remove();
        setSelectedElements([]);
      }
    }
    drawingPolylineRef.current = false;
    currentPolylineRef.current = null;
    updateCodeFromDOM();
    showToast('Polyline finished', 'success');
  }, [updateCodeFromDOM, showToast]);

  /* ---- Add raw SVG markup (used by Shape Library) ---- */
  const addSvgMarkup = useCallback(
    (markup: string) => {
      const svg = getRootSVG();
      if (!svg) return;

      const ns = 'http://www.w3.org/2000/svg';
      const tmp = document.createElementNS(ns, 'svg');
      tmp.innerHTML = markup;

      const inserted: SVGElement[] = [];
      while (tmp.firstElementChild) {
        const el = tmp.firstElementChild as SVGElement;
        svg.appendChild(el);
        inserted.push(el);
      }

      if (inserted.length > 0) {
        setSelectedElements(inserted);
        updateCodeFromDOM();
      }
    },
    [getRootSVG, updateCodeFromDOM],
  );

  /* ---- Group / Ungroup ---- */
  const groupSelected = useCallback(() => {
    const sel = selRef.current;
    if (sel.length < 2) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    sel[0].parentNode?.insertBefore(g, sel[0]);
    sel.forEach((el) => g.appendChild(el));
    setSelectedElements([g]);
    updateCodeFromDOM();
  }, [updateCodeFromDOM]);

  const ungroupSelected = useCallback(() => {
    const sel = selRef.current;
    const gs = sel.filter((el) => el.tagName.toLowerCase() === 'g');
    if (gs.length === 0) return;
    const ns: SVGElement[] = [];
    gs.forEach((g) => {
      const p = g.parentNode;
      if (!p) return;
      const pt = g.getAttribute('transform') || '';
      const m = pt.match(/^\s*translate\s*\(\s*([-0-9.]+)(?:[\s,]+([-0-9.]+))?\s*\)\s*$/);
      let dx = 0, dy = 0, isT = false;
      if (m) {
        dx = parseFloat(m[1]);
        dy = m[2] !== undefined ? parseFloat(m[2]) : 0;
        isT = true;
      }
      Array.from(g.childNodes).forEach((c) => {
        if (c.nodeType !== 1) return;
        const child = c as SVGElement;
        if (pt) {
          if (isT && !child.hasAttribute('transform') &&
            ['rect', 'text', 'image', 'use', 'circle', 'ellipse', 'line', 'polygon', 'polyline']
              .includes(child.tagName.toLowerCase())) {
            applyDelta(child, child.cloneNode(true) as SVGElement, dx, dy);
          } else {
            child.setAttribute('transform', optimizeTransform(`${pt} ${child.getAttribute('transform') || ''}`.trim()));
          }
        }
        p.insertBefore(child, g);
        ns.push(child);
      });
      p.removeChild(g);
    });
    setSelectedElements(ns);
    updateCodeFromDOM();
  }, [updateCodeFromDOM]);

  /* ---- Layering ---- */
  const bringToFront = useCallback(() => {
    selRef.current.forEach((el) => el.parentNode?.appendChild(el));
    updateCodeFromDOM();
  }, [updateCodeFromDOM]);

  const sendToBack = useCallback(() => {
    [...selRef.current].reverse().forEach((el) =>
      el.parentNode?.insertBefore(el, el.parentNode.firstChild),
    );
    updateCodeFromDOM();
  }, [updateCodeFromDOM]);

  /* ---- Alignment ---- */
  const alignSelected = useCallback(
    (direction: AlignDirection) => {
      const sel = selRef.current;
      if (sel.length < 2) return;
      const svg = getRootSVG();
      if (!svg) return;

      let mX = Infinity, mY = Infinity, MX = -Infinity, MY = -Infinity;
      const bxs = new Map<SVGElement, SvgBBox>();
      sel.forEach((el) => {
        const b = getSVGBBox(svg, el as SVGGraphicsElement);
        bxs.set(el, b);
        mX = Math.min(mX, b.x);
        mY = Math.min(mY, b.y);
        MX = Math.max(MX, b.x + b.width);
        MY = Math.max(MY, b.y + b.height);
      });
      const gCX = mX + (MX - mX) / 2;
      const gCY = mY + (MY - mY) / 2;

      sel.forEach((el) => {
        const b = bxs.get(el)!;
        let dx = 0, dy = 0;
        switch (direction) {
          case 'left': dx = mX - b.x; break;
          case 'right': dx = MX - (b.x + b.width); break;
          case 'top': dy = mY - b.y; break;
          case 'bottom': dy = MY - (b.y + b.height); break;
          case 'center horizontally': dx = gCX - (b.x + b.width / 2); break;
          case 'center vertically': dy = gCY - (b.y + b.height / 2); break;
        }
        if (dx !== 0 || dy !== 0) {
          applyDelta(el, el.cloneNode(true) as SVGElement, dx, dy);
          if (svg) updateAllConnectedLines(svg);
        }
      });
      updateCodeFromDOM();
    },
    [getRootSVG, updateCodeFromDOM],
  );

  /* ---- Clear all ---- */
  const clearAll = useCallback(() => {
    const svg = getRootSVG();
    if (svg) svg.innerHTML = '';
    setSelectedElements([]);
    updateCodeFromDOM();
  }, [getRootSVG, updateCodeFromDOM]);

  /* ---- Clipboard ---- */
  const copySelection = useCallback(async () => {
    const sel = selRef.current;
    if (sel.length === 0) {
      showToast('Select shapes to copy', 'error');
      return;
    }
    const svg = getRootSVG();
    if (!svg) return;
    const virtualSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    virtualSvg.setAttribute('viewBox', svg.getAttribute('viewBox') || '0 0 600 500');
    sel.forEach((el) => virtualSvg.appendChild(el.cloneNode(true)));
    const msg = await copySvgToClipboard(virtualSvg);
    showToast(msg, 'success');
  }, [getRootSVG, showToast]);

  const handleDownload = useCallback(() => {
    downloadSvg(monacoEditorRef.current?.getModel()?.getValue() ?? svgCodeRef.current);
    showToast('SVG Downloaded', 'success');
  }, [showToast]);

  const handleShare = useCallback(async () => {
    const msg = await copyShareableLink(window.location.href);
    showToast(msg, 'success');
  }, [showToast]);

  /* ---- Delete selected ---- */
  const deleteSelected = useCallback(() => {
    const sel = selRef.current;
    if (sel.length === 0) return;
    sel.forEach((el) => el.remove());
    setSelectedElements([]);
    updateCodeFromDOM();
    showToast('Deleted');
  }, [updateCodeFromDOM, showToast]);

  /* ---- Property update ---- */
  const updateAttribute = useCallback(
    (attr: string, val: string) => {
      const sel = selRef.current;
      const svg = getRootSVG();
      sel.forEach((target) => {
        if (attr === 'text-content') {
          target.textContent = val;
        } else if (val === '') {
          target.removeAttribute(attr);
        } else {
          target.setAttribute(attr, val);
        }
      });
      if (svg) updateAllConnectedLines(svg);
      updateCodeFromDOM();
    },
    [getRootSVG, updateCodeFromDOM],
  );

  /* =========== canvas interaction handlers =========== */

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const svg = getRootSVG();
      if (!svg) return;

      // Polyline drawing mode
      if (drawingPolylineRef.current) {
        if (e.button === 2) { finishPolyline(); e.preventDefault(); return; }
        const pt = getSVGPoint(svg, e.clientX, e.clientY);
        const newPt = `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
        const poly = currentPolylineRef.current;
        if (!poly) return;
        const pts = poly.getAttribute('points');
        if (!pts) {
          poly.setAttribute('points', `${newPt} ${newPt}`);
        } else {
          const ptsArr = pts.trim().split(/\s+/).filter(Boolean);
          ptsArr[ptsArr.length - 1] = newPt;
          ptsArr.push(newPt);
          poly.setAttribute('points', ptsArr.join(' '));
        }
        setSelectedElements([poly]);
        e.preventDefault();
        return;
      }

      // Resize handle
      const targetEl = e.target as HTMLElement;
      if (targetEl.classList.contains('resize-handle')) {
        resizeDirRef.current = targetEl.id;
        if (resizeDirRef.current.startsWith('handle-line')) activeActionRef.current = 'resize-line';
        else if (resizeDirRef.current.startsWith('handle-poly')) activeActionRef.current = 'resize-poly';
        else {
          activeActionRef.current = 'resize';
          let mX = Infinity, mY = Infinity, MX = -Infinity, MY = -Infinity;
          selRef.current.forEach((el) => {
            const b = getSVGBBox(svg, el as SVGGraphicsElement);
            mX = Math.min(mX, b.x); mY = Math.min(mY, b.y);
            MX = Math.max(MX, b.x + b.width); MY = Math.max(MY, b.y + b.height);
          });
          groupBBoxRef.current = { x: mX, y: mY, width: MX - mX, height: MY - mY };
        }
        startPtRef.current = getSVGPoint(svg, e.clientX, e.clientY);
        origStateRef.current.clear();
        selRef.current.forEach((el) => origStateRef.current.set(el, el.cloneNode(true) as SVGElement));
        e.preventDefault();
        return;
      }

      // Click on an SVG child → select / drag
      let clicked = e.target as SVGElement;
      if (svg.contains(clicked) && clicked !== svg) {
        const tag = clicked.tagName.toLowerCase();
        if (tag !== 'text' && tag !== 'tspan') {
          let curr: Node | null = clicked;
          let highest: SVGElement | null = null;
          while (curr && curr !== svg) {
            if ((curr as SVGElement).tagName?.toLowerCase() === 'g') highest = curr as SVGElement;
            curr = curr.parentNode;
          }
          if (highest) clicked = highest;
        } else if (tag === 'tspan') {
          clicked = (clicked.closest('text') ?? clicked) as SVGElement;
        }

        setSidebarManuallyClosed(false);
        activeActionRef.current = 'drag';
        const sel = selRef.current;
        if (e.shiftKey) {
          if (!sel.includes(clicked)) setSelectedElements([...sel, clicked]);
        } else {
          if (!sel.includes(clicked)) setSelectedElements([clicked]);
        }
        startPtRef.current = getSVGPoint(svg, e.clientX, e.clientY);
        origStateRef.current.clear();
        // re-read since setSelectedElements is async
        const newSel = e.shiftKey
          ? (sel.includes(clicked) ? sel : [...sel, clicked])
          : (sel.includes(clicked) ? sel : [clicked]);
        newSel.forEach((el) => origStateRef.current.set(el, el.cloneNode(true) as SVGElement));
        e.preventDefault();
      } else {
        // Marquee selection
        activeActionRef.current = 'marquee';
        marqueeStartRef.current = { x: e.clientX, y: e.clientY };
        if (!e.shiftKey) setSelectedElements([]);
        const mb = marqueeBoxRef.current;
        const r = canvasContainerRef.current?.getBoundingClientRect();
        if (mb && r) {
          mb.style.display = 'block';
          mb.style.left = `${(e.clientX - r.left) / zoom.scale}px`;
          mb.style.top = `${(e.clientY - r.top) / zoom.scale}px`;
          mb.style.width = mb.style.height = '0px';
        }
        e.preventDefault();
      }
    },
    [getRootSVG, zoom.scale, finishPolyline],
  );

  const handleCanvasContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (drawingPolylineRef.current) {
        e.preventDefault();
        finishPolyline();
      }
    },
    [finishPolyline],
  );

  /* ---- Global mouse move (attached to window in useEffect) ---- */
  const handleWindowMouseMove = useCallback(
    (e: MouseEvent) => {
      const svg = getRootSVG();
      if (!svg) return;

      // Polyline preview
      if (drawingPolylineRef.current && currentPolylineRef.current) {
        const pt = getSVGPoint(svg, e.clientX, e.clientY);
        const pts = currentPolylineRef.current.getAttribute('points');
        if (pts) {
          const ptsArr = pts.trim().split(/\s+/).filter(Boolean);
          if (ptsArr.length > 0) {
            ptsArr[ptsArr.length - 1] = `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
            currentPolylineRef.current.setAttribute('points', ptsArr.join(' '));
          }
        }
        return;
      }

      if (!activeActionRef.current) return;
      const sp = startPtRef.current;
      if (!sp) return;
      const cp = getSVGPoint(svg, e.clientX, e.clientY);
      const dx = cp.x - sp.x;
      const dy = cp.y - sp.y;

      if (activeActionRef.current === 'drag') {
        selRef.current.forEach((el) => {
          const orig = origStateRef.current.get(el);
          if (orig) applyDelta(el, orig, dx, dy);
        });
        updateAllConnectedLines(svg);
      } else if (activeActionRef.current === 'marquee') {
        const r = canvasContainerRef.current?.getBoundingClientRect();
        const ms = marqueeStartRef.current;
        const mb = marqueeBoxRef.current;
        if (!r || !ms || !mb) return;
        const minX = Math.min(ms.x, e.clientX);
        const minY = Math.min(ms.y, e.clientY);
        const maxX = Math.max(ms.x, e.clientX);
        const maxY = Math.max(ms.y, e.clientY);
        mb.style.left = `${(minX - r.left) / zoom.scale}px`;
        mb.style.top = `${(minY - r.top) / zoom.scale}px`;
        mb.style.width = `${(maxX - minX) / zoom.scale}px`;
        mb.style.height = `${(maxY - minY) / zoom.scale}px`;
        return;
      } else if (activeActionRef.current === 'resize-line' && selRef.current.length > 0) {
        const line = selRef.current[0];
        const lp = getLocalSVGPoint(svg, e.clientX, e.clientY, line as SVGGraphicsElement);
        if (resizeDirRef.current === 'handle-line-p1') {
          line.setAttribute('x1', String(lp.x));
          line.setAttribute('y1', String(lp.y));
        } else {
          line.setAttribute('x2', String(lp.x));
          line.setAttribute('y2', String(lp.y));
        }
      } else if (activeActionRef.current === 'resize-poly' && selRef.current.length > 0) {
        const pEl = selRef.current[0];
        const lp = getLocalSVGPoint(svg, e.clientX, e.clientY, pEl as SVGGraphicsElement);
        const ptIdx = parseInt(resizeDirRef.current?.split('-')[2] || '0');
        const pts = pEl.getAttribute('points')?.trim().split(/[\s,]+/).filter((p) => p !== '') || [];
        if (ptIdx * 2 + 1 < pts.length) {
          pts[ptIdx * 2] = lp.x.toFixed(1);
          pts[ptIdx * 2 + 1] = lp.y.toFixed(1);
          pEl.setAttribute('points', pts.join(' '));
          updateAllConnectedLines(svg);
        }
      } else if (activeActionRef.current === 'resize') {
        const dir = resizeDirRef.current?.split('-')[1] || '';
        const gb = groupBBoxRef.current;
        if (!gb) return;
        let sx = 1, sy = 1;
        if (dir.includes('r')) sx = Math.max(0.1, (gb.width + dx) / gb.width);
        else if (dir.includes('l')) sx = Math.max(0.1, (gb.width - dx) / gb.width);
        if (dir.includes('b')) sy = Math.max(0.1, (gb.height + dy) / gb.height);
        else if (dir.includes('t')) sy = Math.max(0.1, (gb.height - dy) / gb.height);
        const ox = dir.includes('l') ? gb.x + gb.width : gb.x;
        const oy = dir.includes('t') ? gb.y + gb.height : gb.y;
        selRef.current.forEach((el) => {
          const orig = origStateRef.current.get(el);
          if (orig) applyScale(el, orig, sx, sy, ox, oy);
        });
        updateAllConnectedLines(svg);
      }

      // Keep the selection overlay in sync with the moved/resized shapes
      // (marquee branch returns early above, so we're always in drag/resize here)
      updateOverlayRef.current?.();
    },
    [getRootSVG, zoom.scale],
  );

  /* ---- Global mouse up ---- */
  const handleWindowMouseUp = useCallback(
    (e: MouseEvent) => {
      const svg = getRootSVG();

      if (activeActionRef.current === 'marquee') {
        const mb = marqueeBoxRef.current;
        if (mb) mb.style.display = 'none';
        const ms = marqueeStartRef.current;
        if (ms) {
          const mr = {
            left: Math.min(ms.x, e.clientX),
            top: Math.min(ms.y, e.clientY),
            right: Math.max(ms.x, e.clientX),
            bottom: Math.max(ms.y, e.clientY),
          };
          if (mr.right - mr.left > 2 || mr.bottom - mr.top > 2) {
            const ns: SVGElement[] = [];
            if (svg) {
              Array.from(svg.children).forEach((child) => {
                if (child.tagName.toLowerCase() === 'defs') return;
                const er = child.getBoundingClientRect();
                if (!(mr.right < er.left || mr.left > er.right || mr.bottom < er.top || mr.top > er.bottom)) {
                  ns.push(child as SVGElement);
                }
              });
            }
            if (e.shiftKey) {
              setSelectedElements((prev) => {
                const combined = [...prev];
                ns.forEach((n) => { if (!combined.includes(n)) combined.push(n); });
                return combined;
              });
            } else {
              setSelectedElements(ns);
            }
          }
        }
        activeActionRef.current = null;
      } else if (activeActionRef.current) {
        // Handle auto-connect on line/poly endpoint drop
        if (
          (activeActionRef.current === 'resize-line' || activeActionRef.current === 'resize-poly') &&
          selRef.current.length > 0 && svg
        ) {
          const line = selRef.current[0];
          const overlay = selectionOverlayRef.current;
          const prevDisplay = overlay?.style.display || '';
          if (overlay) overlay.style.display = 'none';
          (line as unknown as HTMLElement).style.pointerEvents = 'none';

          let targetEl = document.elementFromPoint(e.clientX, e.clientY) as SVGElement | null;
          (line as unknown as HTMLElement).style.pointerEvents = '';

          if (targetEl?.tagName?.toLowerCase() === 'tspan') {
            targetEl = (targetEl.closest('text') ?? targetEl) as SVGElement;
          }

          if (autoConnect && targetEl && targetEl !== line && svg.contains(targetEl) && targetEl !== svg) {
            // Walk up to group level
            let curr: Node | null = targetEl;
            let highest: SVGElement | null = null;
            while (curr && curr !== svg) {
              if ((curr as SVGElement).tagName?.toLowerCase() === 'g') highest = curr as SVGElement;
              curr = curr.parentNode;
            }
            if (highest) targetEl = highest;

            if (!targetEl.getAttribute('id')) {
              targetEl.setAttribute('id', 'shape_' + Math.random().toString(36).substr(2, 6));
            }

            let conns = (line.getAttribute('data-connections') || '').split(',').map((s) => s.trim());
            if (activeActionRef.current === 'resize-line') {
              if (conns.length === 1) conns.push('');
              if (resizeDirRef.current === 'handle-line-p1') conns[0] = targetEl.getAttribute('id')!;
              else if (resizeDirRef.current === 'handle-line-p2') conns[1] = targetEl.getAttribute('id')!;
            } else {
              const ptIdx = parseInt(resizeDirRef.current?.split('-')[2] || '0');
              while (conns.length <= ptIdx) conns.push('');
              conns[ptIdx] = targetEl.getAttribute('id')!;
            }

            if (conns.some((c) => c)) {
              line.setAttribute('data-connections', conns.join(','));
              targetEl.parentNode?.appendChild(targetEl);
            } else {
              line.removeAttribute('data-connections');
            }
            updateAllConnectedLines(svg);
          } else {
            // Disconnect dropped endpoint
            let conns = (line.getAttribute('data-connections') || '').split(',').map((s) => s.trim());
            if (activeActionRef.current === 'resize-line') {
              if (conns.length === 1) conns.push('');
              if (resizeDirRef.current === 'handle-line-p1') conns[0] = '';
              else if (resizeDirRef.current === 'handle-line-p2') conns[1] = '';
            } else {
              const ptIdx = parseInt(resizeDirRef.current?.split('-')[2] || '0');
              while (conns.length <= ptIdx) conns.push('');
              conns[ptIdx] = '';
            }
            if (conns.some((c) => c)) line.setAttribute('data-connections', conns.join(','));
          }
          if (overlay) overlay.style.display = prevDisplay;
        }
        activeActionRef.current = null;
        updateCodeFromDOM();
        updateOverlayRef.current?.();
      }
    },
    [getRootSVG, autoConnect, updateCodeFromDOM],
  );

  /* ---- Global keyboard handlers ---- */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const active = document.activeElement;
      // Check if Monaco editor is focused — use the editor's DOM node
      const monacoFocused = monacoEditorRef.current?.hasTextFocus();

      if (e.key === 'Escape') {
        if (drawingPolylineRef.current) finishPolyline();
        else closeSidebar();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (active?.tagName !== 'INPUT' && !monacoFocused) {
          e.preventDefault();
          const svg = getRootSVG();
          if (svg) {
            setSelectedElements(
              Array.from(svg.children).filter((el) => el.tagName.toLowerCase() !== 'defs') as SVGElement[],
            );
          }
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (active?.tagName !== 'INPUT' && !monacoFocused) {
          e.preventDefault();
          performUndo();
        }
        return;
      }

      if (monacoFocused || active?.tagName === 'INPUT') return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelection();
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selRef.current.length) {
          deleteSelected();
          e.preventDefault();
        }
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        if (selRef.current.length > 0) {
          e.preventDefault();
          isArrowMovingRef.current = true;
          const step = e.shiftKey ? 10 : 1;
          let dx = 0, dy = 0;
          if (e.key === 'ArrowUp') dy = -step;
          if (e.key === 'ArrowDown') dy = step;
          if (e.key === 'ArrowLeft') dx = -step;
          if (e.key === 'ArrowRight') dx = step;
          const svg = getRootSVG();
          selRef.current.forEach((el) => {
            applyDelta(el, el.cloneNode(true) as SVGElement, dx, dy);
          });
          if (svg) updateAllConnectedLines(svg);
          // Update the selection overlay to follow the moved shapes
          updateOverlayRef.current?.();
        }
      }
    },
    [getRootSVG, finishPolyline, closeSidebar, performUndo, copySelection, deleteSelected],
  );

  const handleKeyUp = useCallback(
    (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && isArrowMovingRef.current) {
        updateCodeFromDOM();
        isArrowMovingRef.current = false;
      }
    },
    [updateCodeFromDOM],
  );

  /* =========== side effects =========== */

  /**
   * Re-run highlight decorations whenever the selection or code changes.
   * Uses requestAnimationFrame to ensure Monaco has finished processing
   * any pending value updates (the @monaco-editor/react library syncs
   * the controlled `value` prop via executeEdits, which can clear decorations).
   */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      highlightSelectionInCode();
    });
    return () => cancelAnimationFrame(id);
  }, [selectedElements, highlightSelectionInCode]);

  /**
   * Called by CodeEditor when Monaco finishes its async initialization.
   * At this point the editor ref is set and we can safely apply decorations.
   */
  const handleEditorReady = useCallback(() => {
    requestAnimationFrame(() => {
      highlightSelectionInCode();
    });
  }, [highlightSelectionInCode]);

  // Update stable refs for window event handlers
  windowHandlersRef.current = {
    mouseMove: handleWindowMouseMove,
    mouseUp: handleWindowMouseUp,
    keyDown: handleKeyDown,
    keyUp: handleKeyUp,
  };

  // Attach window-level event listeners (once, using stable refs)
  useEffect(() => {
    let rafId = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => windowHandlersRef.current?.mouseMove(e));
    };
    const onUp = (e: MouseEvent) => windowHandlersRef.current?.mouseUp(e);
    const onKeyDown = (e: KeyboardEvent) => windowHandlersRef.current?.keyDown(e);
    const onKeyUp = (e: KeyboardEvent) => windowHandlersRef.current?.keyUp(e);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Initial render: parse URL params & render default SVG
  useEffect(() => {
    let initial = DEFAULT_SVG;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const svgParam = urlParams.get('svg');
      if (svgParam) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const LZString = require('lz-string');
        const decompressed = LZString.decompressFromEncodedURIComponent(svgParam);
        initial = decompressed || decodeURIComponent(svgParam);
        initial = formatSVG(initial);
      }
    } catch {
      // ignore invalid URL params
    }
    setSvgCode(initial);
    // Use a microtask to ensure the ref is mounted
    setTimeout(() => updateDOMFromCode(initial), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // Refs for DOM attachment
    renderTargetRef,
    canvasContainerRef,
    selectionOverlayRef,
    marqueeBoxRef,
    /** Monaco editor instance ref – passed to CodeEditor */
    monacoEditorRef,

    // State
    svgCode,
    showSync,
    sidebarOpen,
    sidebarManuallyClosed,
    selectedElements,
    setSelectedElements,
    autoConnect,
    setAutoConnect,
    canvasSize,
    canUndo,

    // Sub-hooks
    zoom,
    toast,

    // Actions
    onCodeInput,
    formatCode,
    performUndo,
    openSidebar,
    closeSidebar,
    addShape,
    addSvgMarkup,
    finishPolyline,
    groupSelected,
    ungroupSelected,
    bringToFront,
    sendToBack,
    alignSelected,
    clearAll,
    copySelection,
    handleDownload,
    handleShare,
    deleteSelected,
    updateAttribute,
    updateCodeFromDOM,
    getRootSVG,
    highlightSelectionInCode,
    /** Callback for CodeEditor's onReady prop */
    handleEditorReady,

    // Canvas event handlers
    handleCanvasMouseDown,
    handleCanvasContextMenu,

    // Callback ref – Canvas registers its overlay-update function here
    updateOverlayRef,
  };
}
