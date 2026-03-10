/**
 * PropertiesPanel – Sidebar that shows editable attributes for the selected
 * SVG element(s). Opens automatically on selection and can be manually closed.
 *
 * Renders a text input + colour picker for fill/stroke attributes,
 * and plain text inputs for all other attributes.
 */
'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  IconButton,
  Stack,
  Collapse,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { ShapeAttributes } from '@/types/editor';

interface DebouncedColorInputProps {
  attr: string;
  value: string;
  onUpdateAttribute: (attr: string, value: string) => void;
}

function DebouncedColorInput({ attr, value, onUpdateAttribute }: DebouncedColorInputProps) {
  const [localVal, setLocalVal] = useState(value);
  const timeoutRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalVal(newVal);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      onUpdateAttribute(attr, newVal);
    }, 50);
  };

  return (
    <input
      type="color"
      value={/^#[0-9A-F]{6}$/i.test(localVal) ? localVal : '#000000'}
      onChange={handleChange}
      style={{
        width: 28,
        height: 28,
        padding: 0,
        border: '1px solid #ccc',
        borderRadius: 4,
        cursor: 'pointer',
        flexShrink: 0,
      }}
    />
  );
}

interface PropertiesPanelProps {
  open: boolean;
  selectedElements: SVGElement[];
  onClose: () => void;
  onUpdateAttribute: (attr: string, value: string) => void;
}

/** Determine which attributes to expose for a given element tag. */
function getShapeAttrs(tag: string): ShapeAttributes {
  const attrs: string[] = ['id'];
  let showTextContent = false;

  switch (tag) {
    case 'rect':
      attrs.push('x', 'y', 'width', 'height', 'rx', 'ry');
      break;
    case 'circle':
      attrs.push('cx', 'cy', 'r');
      break;
    case 'ellipse':
      attrs.push('cx', 'cy', 'rx', 'ry');
      break;
    case 'line':
      attrs.push('x1', 'y1', 'x2', 'y2', 'data-connections');
      break;
    case 'text':
      attrs.push('x', 'y', 'font-size', 'font-family');
      showTextContent = true;
      break;
    case 'polygon':
    case 'polyline':
      attrs.push('points', 'data-connections');
      break;
    case 'path':
      attrs.push('d');
      break;
  }
  attrs.push('fill', 'stroke', 'stroke-width', 'opacity', 'transform');
  return { attrs, showTextContent };
}

/** Common attributes shown when multiple elements are selected. */
const MULTI_ATTRS = ['fill', 'stroke', 'stroke-width', 'opacity', 'transform'];

export default React.memo(function PropertiesPanel({
  open,
  selectedElements,
  onClose,
  onUpdateAttribute,
}: PropertiesPanelProps) {
  const isMulti = selectedElements.length > 1;
  const firstEl = selectedElements[0] ?? null;

  const { attrs, showTextContent } = useMemo(() => {
    if (!firstEl || isMulti) return { attrs: MULTI_ATTRS, showTextContent: false };
    return getShapeAttrs(firstEl.tagName.toLowerCase());
  }, [firstEl, isMulti]);

  const headerText = isMulti ? 'Common Properties' : 'Shape Properties';

  /** Read the current value of an attribute, handling multi-select consensus. */
  const getAttrValue = (attr: string): string => {
    if (!firstEl) return '';
    if (attr === 'text-content') return firstEl.textContent || '';
    const val = firstEl.getAttribute(attr) || '';
    if (isMulti) {
      const allSame = selectedElements.every(
        (el) => (el.getAttribute(attr) || '') === val,
      );
      return allSame ? val : '';
    }
    return val;
  };

  return (
    <Collapse in={open} orientation="horizontal" sx={{ flexShrink: 0 }}>
      <Box
        sx={{
          width: 240,
          bgcolor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}
        >
          <Typography variant="overline" fontWeight="bold" color="text.secondary">
            {headerText}
          </Typography>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>

        {/* Scrollable attribute list */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
          {/* Text content field (for <text> elements only) */}
          {showTextContent && !isMulti && firstEl && (
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                Content
              </Typography>
              <TextField
                size="small"
                fullWidth
                variant="outlined"
                value={firstEl.textContent || ''}
                onChange={(e) => onUpdateAttribute('text-content', e.target.value)}
                sx={{ mt: 0.5 }}
              />
            </Box>
          )}

          {/* Attribute fields */}
          {attrs.map((attr) => {
            const val = getAttrValue(attr);
            const isColor = attr === 'fill' || attr === 'stroke';

            return (
              <Box key={attr} sx={{ mb: 1.5 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  fontWeight="bold"
                  sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: '0.6rem' }}
                >
                  {attr}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                  {isColor && (
                    <DebouncedColorInput
                      attr={attr}
                      value={val}
                      onUpdateAttribute={onUpdateAttribute}
                    />
                  )}
                  <TextField
                    size="small"
                    fullWidth
                    variant="outlined"
                    value={val}
                    placeholder={isColor ? 'none' : undefined}
                    onChange={(e) => onUpdateAttribute(attr, e.target.value)}
                    sx={{
                      '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.75rem' },
                    }}
                  />
                </Stack>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Collapse>
  );
});
