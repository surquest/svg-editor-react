/**
 * ToastContainer – Renders a stack of auto-dismissing toast notifications.
 * Positioned at the bottom-center of the viewport using MUI's Alert component.
 */
'use client';

import React from 'react';
import { Box, Alert, Slide } from '@mui/material';
import type { ToastMessage } from '@/types/editor';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: number) => void;
}

export default React.memo(function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <Slide key={t.id} direction="up" in mountOnEnter unmountOnExit>
          <Alert
            severity={t.severity === 'info' ? 'info' : t.severity}
            variant="filled"
            onClose={() => onRemove(t.id)}
            sx={{ pointerEvents: 'auto', minWidth: 220 }}
          >
            {t.message}
          </Alert>
        </Slide>
      ))}
    </Box>
  );
});
