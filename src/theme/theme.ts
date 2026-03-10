'use client';

import { createTheme } from '@mui/material/styles';

/**
 * MUI theme configuration for SVG Studio.
 * Uses indigo as the primary color to match the original design,
 * with a custom dark palette for the code editor area.
 */
const theme = createTheme({
  palette: {
    primary: {
      main: '#4f46e5', // indigo-600
      light: '#6366f1',
      dark: '#4338ca',
    },
    secondary: {
      main: '#ec4899', // pink-500
    },
    success: {
      main: '#10b981', // emerald-500
    },
    error: {
      main: '#ef4444',
    },
    background: {
      default: '#f3f4f6', // gray-100
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    fontSize: 14,
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
        },
        sizeSmall: {
          fontSize: '0.8125rem',
          padding: '4px 12px',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
      },
    },
  },
});

export default theme;
