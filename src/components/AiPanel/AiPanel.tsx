/**
 * AiPanel – Drawer panel for AI-powered SVG generation via Gemini API.
 *
 * Calls Gemini / Vertex AI REST API directly from the browser
 * using either an API key or a user-supplied OAuth access token.
 * No server-side API route needed – safe for static GitHub Pages export.
 */
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Drawer,
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  CircularProgress,
  Alert,
  Divider,
  Collapse,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SendIcon from '@mui/icons-material/Send';
import ImageIcon from '@mui/icons-material/Image';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import SettingsIcon from '@mui/icons-material/Settings';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

import { ALLOWED_MODELS, generateSvg, type GeminiCredentials } from '@/lib/gemini-client';
import type { OAuthToken } from '@/lib/google-oauth';

const STORAGE_KEY = 'svg-studio-ai-credentials';

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are an SVG generation assistant. Return ONLY a single valid SVG string wrapped in <svg> tags. No markdown, no explanation, raw SVG only.';

interface AiPanelProps {
  open: boolean;
  onClose: () => void;
  onApply: (svgCode: string) => void;
  oauthToken?: OAuthToken | null;
}

function loadCredentials(): GeminiCredentials {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { mode: 'apikey', apiKey: '' };
}

function saveCredentials(c: GeminiCredentials) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch { /* ignore */ }
}

export default function AiPanel({ open, onClose, onApply, oauthToken }: AiPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [systemInstruction, setSystemInstruction] = useState(DEFAULT_SYSTEM_INSTRUCTION);
  const [model, setModel] = useState(ALLOWED_MODELS[0].value);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [credentials, setCredentials] = useState<GeminiCredentials>(loadCredentials);

  useEffect(() => {
    saveCredentials(credentials);
  }, [credentials]);

  const updateCred = useCallback(<K extends keyof GeminiCredentials>(key: K, val: GeminiCredentials[K]) => {
    setCredentials((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setImageData(reader.result as string);
      setImageName(file.name);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const removeImage = useCallback(() => {
    setImageData(null);
    setImageName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
          setError('Image must be under 10 MB');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          setImageData(reader.result as string);
          setImageName(file.name || 'pasted-image.png');
          setError(null);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    const useOAuth = !!oauthToken && !!process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT?.trim();
    const useApiKey = !!credentials.apiKey?.trim();

    if (!useOAuth && !useApiKey) {
      setError('Please configure API credentials in Settings or Environment Variables');
      setShowSettings(true);
      return;
    }

    const effectiveCredentials: GeminiCredentials = useOAuth
      ? { ...credentials, mode: 'oauth', accessToken: oauthToken!.accessToken }
      : { ...credentials, mode: 'apikey' };

    setLoading(true);
    setError(null);
    setGeneratedSvg(null);

    try {
      const svg = await generateSvg({
        prompt: prompt.trim(),
        systemInstruction: systemInstruction.trim() || undefined,
        model,
        image: imageData || undefined,
        credentials: effectiveCredentials,
      });
      setGeneratedSvg(svg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }, [prompt, systemInstruction, model, imageData, credentials, oauthToken]);

  const handleApply = useCallback(() => {
    if (generatedSvg) {
      onApply(generatedSvg);
      onClose();
    }
  }, [generatedSvg, onApply, onClose]);

  const credentialsConfigured =
    !!credentials.apiKey?.trim() ||
    (!!oauthToken && !!process.env.NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT?.trim());

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 480 }, display: 'flex', flexDirection: 'column' },
      }}
    >
      {/* Header */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, bgcolor: 'primary.main', color: 'white' }}
      >
        <Stack direction="row" alignItems="center" spacing={1}>
          <AutoAwesomeIcon />
          <Typography variant="subtitle1" fontWeight="bold">
            AI SVG Generator
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <IconButton size="small" onClick={() => setShowSettings((v) => !v)} sx={{ color: 'white' }}>
            <SettingsIcon />
          </IconButton>
          <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Stack>
      </Stack>

      {/* Scrollable form content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        <Stack spacing={2.5}>
          {/* ---- Credentials settings ---- */}
          <Collapse in={showSettings || !credentialsConfigured}>
            <Stack spacing={2} sx={{ p: 1.5, border: 1, borderColor: 'grey.300', borderRadius: 1, bgcolor: 'grey.50' }}>
              <Typography variant="subtitle2" color="text.secondary">
                API Credentials
              </Typography>

              {oauthToken ? (
                <Alert severity="success" sx={{ py: 0 }}>
                  Signed in{oauthToken.email ? ` as ${oauthToken.email}` : ''} — using Vertex AI
                </Alert>
              ) : (
                <Alert severity="info" sx={{ py: 0 }}>
                  Sign in from the toolbar for Vertex AI, or use an API Key below
                </Alert>
              )}

              <TextField
                label="Gemini API Key"
                type="password"
                size="small"
                fullWidth
                value={credentials.apiKey || ''}
                onChange={(e) => updateCred('apiKey', e.target.value)}
                placeholder="AIza..."
                helperText={oauthToken ? 'Optional when signed in with Google' : 'Required when not signed in'}
              />

              {credentialsConfigured && (
                <Button size="small" onClick={() => setShowSettings(false)}>
                  Hide settings
                </Button>
              )}
            </Stack>
          </Collapse>

          {/* Prompt */}
          <TextField
            label="Prompt"
            placeholder="Describe the SVG you want to generate..."
            multiline
            minRows={3}
            maxRows={6}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPaste={handlePaste}
            fullWidth
          />

          {/* System Instructions */}
          <TextField
            label="System Instructions"
            placeholder="Override default system instructions..."
            multiline
            minRows={2}
            maxRows={4}
            value={systemInstruction}
            onChange={(e) => setSystemInstruction(e.target.value)}
            fullWidth
            size="small"
          />

          {/* Model */}
          <FormControl fullWidth size="small">
            <InputLabel>Model</InputLabel>
            <Select
              value={model}
              label="Model"
              onChange={(e) => setModel(e.target.value)}
            >
              {ALLOWED_MODELS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Image Upload */}
          <Box>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageUpload}
            />
            {imageData ? (
              <Stack direction="row" alignItems="center" spacing={1}>
                <ImageIcon color="primary" fontSize="small" />
                <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                  {imageName}
                </Typography>
                <IconButton size="small" onClick={removeImage}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Stack>
            ) : (
              <Button
                variant="outlined"
                size="small"
                startIcon={<ImageIcon />}
                onClick={() => fileInputRef.current?.click()}
              >
                Attach Reference Image
              </Button>
            )}
          </Box>

          {/* Generate button */}
          <Button
            variant="contained"
            size="large"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SendIcon />}
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            fullWidth
          >
            {loading ? 'Generating...' : 'Generate SVG'}
          </Button>

          {/* Error */}
          {error && <Alert severity="error">{error}</Alert>}

          {/* Preview */}
          {generatedSvg && (
            <>
              <Divider />
              <Typography variant="subtitle2" color="text.secondary">
                Preview
              </Typography>
              <Box
                sx={{
                  border: 1,
                  borderColor: 'grey.300',
                  borderRadius: 1,
                  bgcolor: 'white',
                  p: 1,
                  minHeight: 200,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  '& svg': { maxWidth: '100%', maxHeight: 300 },
                }}
                dangerouslySetInnerHTML={{ __html: generatedSvg }}
              />

              <Box sx={{ position: 'relative' }}>
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  maxRows={8}
                  value={generatedSvg}
                  InputProps={{
                    readOnly: true,
                    style: { fontFamily: 'monospace', fontSize: '0.8rem' }
                  }}
                />
                <IconButton
                  onClick={() => navigator.clipboard.writeText(generatedSvg)}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    bgcolor: 'background.paper',
                    boxShadow: 1,
                    '&:hover': { bgcolor: 'grey.100' }
                  }}
                  size="small"
                  title="Copy SVG to clipboard"
                >
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Box>

              {/* Apply to Editor button */}
              <Button
                variant="contained"
                color="success"
                size="large"
                startIcon={<CheckIcon />}
                onClick={handleApply}
                fullWidth
              >
                Apply to Editor
              </Button>
            </>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}
