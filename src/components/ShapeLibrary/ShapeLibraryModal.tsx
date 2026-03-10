/**
 * ShapeLibraryModal – Modal dialog that displays a browsable collection
 * of SVG shapes organised by category. Shapes are loaded from JSON files
 * stored under /library/ at runtime. Clicking a shape inserts it into the
 * editor canvas.
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tabs,
  Tab,
  Box,
  Typography,
  Grid,
  Paper,
  CircularProgress,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

/** Shape entry inside a category JSON file */
interface LibraryShape {
  name: string;
  svg: string;
}

/** A single category loaded from one JSON file */
interface ShapeCategory {
  name: string;
  shapes: LibraryShape[];
}

interface ShapeLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onInsert: (svgMarkup: string) => void;
}

export default function ShapeLibraryModal({ open, onClose, onInsert }: ShapeLibraryModalProps) {
  const [categories, setCategories] = useState<ShapeCategory[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Load the library index and all category files on first open */
  useEffect(() => {
    if (!open || categories.length > 0) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const indexRes = await fetch('./library/index.json');
        if (!indexRes.ok) throw new Error('Could not load shape library index');
        const index: { categories: string[] } = await indexRes.json();

        const loaded: ShapeCategory[] = [];
        for (const file of index.categories) {
          const res = await fetch(`/library/${file}`);
          if (!res.ok) continue;
          const data: ShapeCategory = await res.json();
          loaded.push(data);
        }

        if (!cancelled) {
          setCategories(loaded);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load shapes');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [open, categories.length]);

  const handleInsert = useCallback(
    (svg: string) => {
      onInsert(svg);
      onClose();
    },
    [onInsert, onClose],
  );

  const current = categories[activeTab];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { height: '70vh' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
        <Typography variant="h6" component="span">Shape Library</Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ display: 'flex', flexDirection: 'column', pt: 1, overflow: 'hidden' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}

        {!loading && !error && categories.length > 0 && (
          <>
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{ borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
            >
              {categories.map((cat) => (
                <Tab key={cat.name} label={cat.name} />
              ))}
            </Tabs>

            <Box sx={{ flex: 1, overflow: 'auto', pt: 2 }}>
              {current && (
                <Grid container spacing={2}>
                  {current.shapes.map((shape) => (
                    <Grid key={shape.name} size={{ xs: 6, sm: 4, md: 3 }}>
                      <Paper
                        elevation={1}
                        onClick={() => handleInsert(shape.svg)}
                        sx={{
                          p: 2,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 1,
                          transition: 'box-shadow 0.15s, transform 0.15s',
                          '&:hover': {
                            boxShadow: 4,
                            transform: 'translateY(-2px)',
                          },
                        }}
                      >
                        {/* SVG preview */}
                        <Box
                          sx={{
                            width: 80,
                            height: 80,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <svg
                            viewBox={computeViewBox(shape.svg)}
                            width="72"
                            height="72"
                            xmlns="http://www.w3.org/2000/svg"
                            dangerouslySetInnerHTML={{ __html: shape.svg }}
                          />
                        </Box>
                        <Typography variant="caption" textAlign="center" noWrap sx={{ width: '100%' }}>
                          {shape.name}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Compute a reasonable viewBox for a shape snippet by parsing it into a
 * temporary offscreen SVG and reading its bounding box, with a fallback
 * to a fixed viewBox.
 */
function computeViewBox(svgMarkup: string): string {
  if (typeof document === 'undefined') return '0 0 50 50';
  try {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('xmlns', ns);
    svg.style.position = 'absolute';
    svg.style.left = '-9999px';
    svg.style.top = '-9999px';
    svg.innerHTML = svgMarkup;
    document.body.appendChild(svg);
    const bbox = svg.getBBox();
    document.body.removeChild(svg);
    const pad = 4;
    return `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`;
  } catch {
    return '0 0 50 50';
  }
}
