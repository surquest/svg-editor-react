/**
 * CodeEditor – Monaco-based SVG code editor with selection highlighting.
 *
 * Uses @monaco-editor/react to provide full syntax highlighting, intellisense,
 * and code folding for SVG/XML. When SVG elements are selected on the canvas,
 * their corresponding tags are highlighted in the editor using Monaco
 * decorations (translucent indigo background).
 */
'use client';

import React, { useCallback } from 'react';
import { Box, Stack, Typography, Button, Chip } from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import Editor, { OnMount } from '@monaco-editor/react';
import type * as MonacoNs from 'monaco-editor';

/** The editor instance type from Monaco */
type IStandaloneCodeEditor = MonacoNs.editor.IStandaloneCodeEditor;

export interface CodeEditorProps {
  /** Current SVG code string (controlled) */
  svgCode: string;
  /** Whether the "Synced ✓" indicator should be visible */
  showSync: boolean;
  /** Whether the "Show Properties" chip should appear */
  showPropsButton: boolean;
  /** Called when the user edits the code */
  onCodeChange: (value: string) => void;
  /** Trigger SVG formatting / pretty-print */
  onFormat: () => void;
  /** Open the properties sidebar */
  onToggleProperties: () => void;
  /** Ref that the parent fills with the Monaco editor instance (set on mount) */
  editorRef: React.MutableRefObject<IStandaloneCodeEditor | null>;
  /** Called once Monaco is fully loaded – parent can re-trigger highlighting */
  onReady?: () => void;
}

/** Colours for the header chrome */
const HEADER_BG = '#282a36';

export default React.memo(function CodeEditor({
  svgCode,
  showSync,
  showPropsButton,
  onCodeChange,
  onFormat,
  onToggleProperties,
  editorRef,
  onReady,
}: CodeEditorProps) {
  /**
   * Called once when Monaco is fully loaded and the editor instance is ready.
   * Injects the decoration CSS directly into <head> so it's guaranteed to be
   * available in the same DOM context Monaco renders into (avoids issues with
   * Next.js CSS bundling not reaching Monaco spans).
   */
  const handleEditorDidMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;

      // Inject decoration CSS rule programmatically
      const styleId = 'svg-editor-monaco-decorations';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = [
          '.monaco-editor .view-overlays .svg-selection-highlight {',
          '  background-color: rgba(79, 70, 229, 0.35) !important;',
          '}',
        ].join('\n');
        document.head.appendChild(style);
      }

      // Notify the parent that the editor is ready so it can apply decorations
      onReady?.();
    },
    [editorRef, onReady],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#1e1e1e' }}>
      {/* ---- Header row ---- */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ bgcolor: HEADER_BG, px: 2, py: 0.75, borderBottom: '1px solid rgba(0,0,0,0.2)', flexShrink: 0 }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <CodeIcon sx={{ color: 'grey.500', fontSize: 16 }} />
          <Typography variant="caption" sx={{ color: 'grey.500', textTransform: 'uppercase', letterSpacing: 1 }}>
            Editor
          </Typography>
          {showPropsButton && (
            <Chip
              label="Show Properties"
              size="small"
              color="primary"
              onClick={onToggleProperties}
              sx={{ fontSize: '0.65rem', height: 20 }}
            />
          )}
          <Button
            size="small"
            variant="contained"
            onClick={onFormat}
            sx={{
              bgcolor: 'grey.700',
              '&:hover': { bgcolor: 'grey.600' },
              fontSize: '0.65rem',
              minWidth: 0,
              px: 1,
              py: 0.25,
              textTransform: 'none',
            }}
          >
            Format
          </Button>
        </Stack>

        <Typography
          variant="caption"
          sx={{
            color: 'success.main',
            opacity: showSync ? 1 : 0,
            transition: 'opacity 0.3s',
          }}
        >
          Synced ✓
        </Typography>
      </Stack>

      {/* ---- Monaco Editor ---- */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Editor
          height="100%"
          defaultLanguage="xml"
          theme="vs-dark"
          value={svgCode}
          onChange={(value) => onCodeChange(value ?? '')}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineHeight: 21,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            renderWhitespace: 'none',
            folding: true,
            lineNumbers: 'on',
            glyphMargin: false,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          }}
        />
      </Box>
    </Box>
  );
});
