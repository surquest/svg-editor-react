/**
 * Toolbar – Top application bar with shape tools, grouping, alignment,
 * export, undo, and clear controls.
 *
 * All button actions are delegated up via props so the toolbar
 * remains a purely presentational component.
 */
'use client';

import React from 'react';
import {
  AppBar,
  Toolbar as MuiToolbar,
  Typography,
  Button,
  IconButton,
  Divider,
  Stack,
  Tooltip,
  Switch,
  FormControlLabel,
  ButtonGroup,
  Box,
  Avatar,
  CircularProgress,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import RectangleOutlinedIcon from '@mui/icons-material/RectangleOutlined';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import TimelineIcon from '@mui/icons-material/Timeline';
import PolylineIcon from '@mui/icons-material/Polyline';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import CategoryIcon from '@mui/icons-material/Category';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import GroupWorkOutlinedIcon from '@mui/icons-material/GroupWorkOutlined';
import FlipToFrontIcon from '@mui/icons-material/FlipToFront';
import FlipToBackIcon from '@mui/icons-material/FlipToBack';
import AlignHorizontalLeftIcon from '@mui/icons-material/AlignHorizontalLeft';
import AlignHorizontalCenterIcon from '@mui/icons-material/AlignHorizontalCenter';
import AlignHorizontalRightIcon from '@mui/icons-material/AlignHorizontalRight';
import AlignVerticalTopIcon from '@mui/icons-material/AlignVerticalTop';
import AlignVerticalCenterIcon from '@mui/icons-material/AlignVerticalCenter';
import AlignVerticalBottomIcon from '@mui/icons-material/AlignVerticalBottom';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import ShareIcon from '@mui/icons-material/Share';
import UndoIcon from '@mui/icons-material/Undo';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import type { AlignDirection } from '@/types/editor';

interface ToolbarProps {
  /** Number of currently selected elements */
  selectionCount: number;
  /** Whether a single <g> element is selected (enables Ungroup) */
  isGroupSelected: boolean;
  /** Whether undo stack has entries */
  canUndo: boolean;
  /** Auto-connect toggle state */
  autoConnect: boolean;

  onAddShape: (type: 'rect' | 'circle' | 'line' | 'polyline' | 'text') => void;
  onGroup: () => void;
  onUngroup: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onAlign: (dir: AlignDirection) => void;
  onCopy: () => void;
  onDownload: () => void;
  onShare: () => void;
  onUndo: () => void;
  onClear: () => void;
  onAutoConnectChange: (enabled: boolean) => void;
  onOpenLibrary: () => void;
  onOpenAi: () => void;
  /** Signed-in user info (undefined = not signed in) */
  user?: { email?: string };
  /** Whether sign-in is in progress */
  signingIn?: boolean;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

export default React.memo(function Toolbar({
  selectionCount,
  isGroupSelected,
  canUndo,
  autoConnect,
  onAddShape,
  onGroup,
  onUngroup,
  onBringToFront,
  onSendToBack,
  onAlign,
  onCopy,
  onDownload,
  onShare,
  onUndo,
  onClear,
  onAutoConnectChange,
  onOpenLibrary,
  onOpenAi,
  user,
  signingIn,
  onSignIn,
  onSignOut,
}: ToolbarProps) {
  const canGroup = selectionCount > 1;
  const canUngroup = isGroupSelected;
  const canLayer = selectionCount > 0;

  return (
    <AppBar
      position="static"
      color="default"
      elevation={1}
      sx={{ bgcolor: 'background.paper', zIndex: 10, flexShrink: 0 }}
    >
      <MuiToolbar variant="dense" sx={{ flexWrap: 'wrap', gap: 1, py: 0.5 }}>
        {/* ---- Brand ---- */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mr: 2 }}>
          <EditIcon color="primary" />
          <Typography variant="subtitle1" fontWeight="bold" color="primary">
            SVG Studio
          </Typography>
        </Stack>

        <Divider orientation="vertical" flexItem />

        {/* ---- Add shape buttons ---- */}
        <Stack direction="row" spacing={0.5}>
          <Button size="small" variant="outlined" startIcon={<RectangleOutlinedIcon />} onClick={() => onAddShape('rect')}>
            Rectangle
          </Button>
          <Button size="small" variant="outlined" startIcon={<CircleOutlinedIcon />} onClick={() => onAddShape('circle')}>
            Circle
          </Button>
          <Button size="small" variant="outlined" startIcon={<TimelineIcon />} onClick={() => onAddShape('line')}>
            Line
          </Button>
          <Button size="small" variant="outlined" startIcon={<PolylineIcon />} onClick={() => onAddShape('polyline')}>
            Polyline
          </Button>
          <Button size="small" variant="outlined" startIcon={<TextFieldsIcon />} onClick={() => onAddShape('text')}>
            Text
          </Button>
          <Button size="small" variant="outlined" startIcon={<CategoryIcon />} onClick={onOpenLibrary}>
            Library
          </Button>
        </Stack>

        <Divider orientation="vertical" flexItem />

        {/* ---- Group / Ungroup ---- */}
        <Stack direction="row" spacing={0.5}>
          <Button size="small" variant="outlined" disabled={!canGroup} startIcon={<GroupWorkIcon />} onClick={onGroup}>
            Group
          </Button>
          <Button size="small" variant="outlined" disabled={!canUngroup} startIcon={<GroupWorkOutlinedIcon />} onClick={onUngroup}>
            Ungroup
          </Button>
        </Stack>

        {/* ---- Layering ---- */}
        <ButtonGroup size="small" variant="outlined">
          <Tooltip title="Bring to Front">
            <span>
              <IconButton size="small" disabled={!canLayer} onClick={onBringToFront}>
                <FlipToFrontIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Send to Back">
            <span>
              <IconButton size="small" disabled={!canLayer} onClick={onSendToBack}>
                <FlipToBackIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </ButtonGroup>

        {/* ---- Alignment ---- */}
        <ButtonGroup size="small" variant="outlined">
          <Tooltip title="Align Left">
            <IconButton size="small" onClick={() => onAlign('left')}><AlignHorizontalLeftIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Align Center Horizontally">
            <IconButton size="small" onClick={() => onAlign('center horizontally')}><AlignHorizontalCenterIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Align Right">
            <IconButton size="small" onClick={() => onAlign('right')}><AlignHorizontalRightIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Align Top">
            <IconButton size="small" onClick={() => onAlign('top')}><AlignVerticalTopIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Align Center Vertically">
            <IconButton size="small" onClick={() => onAlign('center vertically')}><AlignVerticalCenterIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Align Bottom">
            <IconButton size="small" onClick={() => onAlign('bottom')}><AlignVerticalBottomIcon fontSize="small" /></IconButton>
          </Tooltip>
        </ButtonGroup>

        {/* ---- Auto-connect toggle ---- */}
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={autoConnect}
              onChange={(_, checked) => onAutoConnectChange(checked)}
            />
          }
          label={<Typography variant="body2">Auto-connect</Typography>}
          sx={{ ml: 1 }}
        />

        {/* ---- Export / Copy / Share ---- */}
        <ButtonGroup size="small" variant="outlined">
          <Tooltip title="Copy Selected (SVG / Text / HTML)">
            <IconButton size="small" onClick={onCopy}><ContentCopyIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Download SVG">
            <IconButton size="small" onClick={onDownload}><DownloadIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Copy Shareable Link">
            <IconButton size="small" onClick={onShare}><ShareIcon fontSize="small" /></IconButton>
          </Tooltip>
        </ButtonGroup>

        {/* ---- Undo ---- */}
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton size="small" disabled={!canUndo} onClick={onUndo}>
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {/* ---- Clear All ---- */}
        <Button size="small" variant="outlined" color="error" startIcon={<DeleteSweepIcon />} onClick={onClear}>
          Clear All
        </Button>

        <Divider orientation="vertical" flexItem />

        {/* ---- AI Generate ---- */}
        <Button size="small" variant="contained" startIcon={<AutoAwesomeIcon />} onClick={onOpenAi}>
          AI Generate
        </Button>

        {/* ---- User Auth ---- */}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
          {user ? (
            <Stack direction="row" alignItems="center" spacing={1}>
              <Avatar sx={{ width: 28, height: 28, bgcolor: 'primary.main', fontSize: '0.875rem' }}>
                {user.email?.[0]?.toUpperCase() || 'U'}
              </Avatar>
              <Tooltip title="Sign out">
                <IconButton size="small" onClick={onSignOut}>
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={signingIn ? <CircularProgress size={16} /> : <LoginIcon />}
              onClick={onSignIn}
              disabled={signingIn}
            >
              {signingIn ? 'Signing in...' : 'Sign In'}
            </Button>
          )}
        </Box>

      </MuiToolbar>
    </AppBar>
  );
});
