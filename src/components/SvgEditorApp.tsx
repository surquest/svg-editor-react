/**
 * SvgEditorApp – Root client component that assembles the full editor UI.
 *
 * Composes the Toolbar, CodeEditor + PropertiesPanel (left pane),
 * Canvas (right pane), and ToastContainer. All state flows through
 * the useSvgEditor hook so this file is purely layout wiring.
 */
'use client';

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Box, Stack } from '@mui/material';
import { ThemeProvider, CssBaseline } from '@mui/material';

import theme from '@/theme/theme';
import { useSvgEditor } from '@/hooks/useSvgEditor';
import Toolbar from '@/components/Toolbar/Toolbar';
import CodeEditor from '@/components/CodeEditor/CodeEditor';
import PropertiesPanel from '@/components/PropertiesPanel/PropertiesPanel';
import Canvas from '@/components/Canvas/Canvas';
import ToastContainer from '@/components/Toast/ToastContainer';
import ShapeLibraryModal from '@/components/ShapeLibrary/ShapeLibraryModal';
import AiPanel from '@/components/AiPanel/AiPanel';
import { signInWithGoogle, loadToken, clearToken, type OAuthToken } from '@/lib/google-oauth';

export default function SvgEditorApp() {
  const editor = useSvgEditor();

  /* ---- Panel resizing (left/right split) ---- */
  const [leftPanelWidth, setLeftPanelWidth] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [oauthToken, setOauthToken] = useState<OAuthToken | null>(loadToken);
  const [oauthLoading, setOauthLoading] = useState(false);
  const isResizingRef = useRef(false);

  const handleResizerMouseDown = useCallback((e: React.MouseEvent) => {
    isResizingRef.current = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  }, []);

  // Window-level resize handlers
  React.useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const newWidth = e.clientX;
      if (newWidth > 300 && newWidth < window.innerWidth - 100) {
        setLeftPanelWidth(newWidth);
      }
    };
    const onMouseUp = () => {
      if (isResizingRef.current) {
        isResizingRef.current = false;
        document.body.style.cursor = '';
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  /* ---- Derived state for toolbar ---- */
  const selectionCount = editor.selectedElements.length;
  const isGroupSelected = useMemo(() =>
    selectionCount === 1 &&
    editor.selectedElements[0]?.tagName?.toLowerCase() === 'g',
    [selectionCount, editor.selectedElements],
  );

  /* ---- Sidebar auto-open / show-props-button logic ---- */
  const shouldShowPropsButton =
    editor.sidebarManuallyClosed && selectionCount >= 1;
  const sidebarShouldBeOpen =
    selectionCount > 0 && !editor.sidebarManuallyClosed;

  const handleSignIn = useCallback(async () => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    if (!clientId.trim()) {
      editor.toast.showToast('OAuth Client ID is not configured in environment', 'error');
      return;
    }
    setOauthLoading(true);
    try {
      const token = await signInWithGoogle(clientId.trim());
      setOauthToken(token);
    } catch (err) {
      editor.toast.showToast(err instanceof Error ? err.message : 'Sign-in failed', 'error');
    } finally {
      setOauthLoading(false);
    }
  }, [editor.toast]);

  const handleSignOut = useCallback(() => {
    clearToken();
    setOauthToken(null);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* ---- Top Toolbar ---- */}
        <Toolbar
          selectionCount={selectionCount}
          isGroupSelected={isGroupSelected}
          canUndo={editor.canUndo}
          autoConnect={editor.autoConnect}
          onAddShape={editor.addShape}
          onGroup={editor.groupSelected}
          onUngroup={editor.ungroupSelected}
          onBringToFront={editor.bringToFront}
          onSendToBack={editor.sendToBack}
          onAlign={editor.alignSelected}
          onCopy={editor.copySelection}
          onDownload={editor.handleDownload}
          onShare={editor.handleShare}
          onUndo={editor.performUndo}
          onClear={editor.clearAll}
          onAutoConnectChange={editor.setAutoConnect}
          onOpenLibrary={() => setLibraryOpen(true)}
          onOpenAi={() => setAiPanelOpen(true)}
          user={oauthToken ? { email: oauthToken.email } : undefined}
          signingIn={oauthLoading}
          onSignIn={handleSignIn}
          onSignOut={handleSignOut}
        />

        {/* ---- Main workspace: left (code) | resizer | right (canvas) ---- */}
        <Stack direction="row" sx={{ flex: 1, overflow: 'hidden', bgcolor: 'grey.100' }}>
          {/* Left panel: Properties + Code Editor */}
          <Box
            sx={{
              width: leftPanelWidth ?? '40%',
              minWidth: 300,
              display: 'flex',
              flexDirection: 'row',
              flexShrink: 0,
              boxShadow: 3,
              zIndex: 20,
            }}
          >
            {/* Properties sidebar (inside left panel) */}
            <PropertiesPanel
              open={sidebarShouldBeOpen}
              selectedElements={editor.selectedElements}
              onClose={editor.closeSidebar}
              onUpdateAttribute={editor.updateAttribute}
            />

            {/* Code editor */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
              <CodeEditor
                svgCode={editor.svgCode}
                editorRef={editor.monacoEditorRef}
                showSync={editor.showSync}
                showPropsButton={shouldShowPropsButton}
                onCodeChange={editor.onCodeInput}
                onFormat={editor.formatCode}
                onToggleProperties={editor.openSidebar}
                onReady={editor.handleEditorReady}
              />
            </Box>
          </Box>

          {/* Resizer divider */}
          <Box
            onMouseDown={handleResizerMouseDown}
            sx={{
              width: 4,
              bgcolor: 'grey.700',
              cursor: 'col-resize',
              flexShrink: 0,
              transition: 'background-color 0.2s',
              '&:hover': { bgcolor: 'primary.main' },
              zIndex: 30,
            }}
          />

          {/* Right panel: Canvas */}
          <Canvas
            renderTargetRef={editor.renderTargetRef}
            canvasContainerRef={editor.canvasContainerRef}
            selectionOverlayRef={editor.selectionOverlayRef}
            marqueeBoxRef={editor.marqueeBoxRef}
            canvasSize={editor.canvasSize}
            selectedElements={editor.selectedElements}
            scale={editor.zoom.scale}
            zoomLabel={editor.zoom.zoomLabel}
            getRootSVG={editor.getRootSVG}
            updateOverlayRef={editor.updateOverlayRef}
            onZoomIn={editor.zoom.zoomIn}
            onZoomOut={editor.zoom.zoomOut}
            onResetZoom={editor.zoom.resetZoom}
            onWheel={editor.zoom.handleWheel}
            onMouseDown={editor.handleCanvasMouseDown}
            onContextMenu={editor.handleCanvasContextMenu}
          />
        </Stack>

        {/* ---- Toasts ---- */}
        <ToastContainer toasts={editor.toast.toasts} onRemove={editor.toast.removeToast} />

        {/* ---- Shape Library Modal ---- */}
        <ShapeLibraryModal
          open={libraryOpen}
          onClose={() => setLibraryOpen(false)}
          onInsert={editor.addSvgMarkup}
        />

        {/* ---- AI Panel ---- */}
        <AiPanel
          open={aiPanelOpen}
          onClose={() => setAiPanelOpen(false)}
          oauthToken={oauthToken}
          onApply={(svgCode) => {
            editor.onCodeInput(svgCode);
            editor.toast.showToast('AI-generated SVG applied', 'success');
          }}
        />
      </Box>
    </ThemeProvider>
  );
}
