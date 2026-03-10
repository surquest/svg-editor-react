'use client';

/**
 * Root page – renders the SVG Editor as a client-side SPA.
 * Uses dynamic import with ssr: false because the editor relies on
 * browser-only APIs (DOM manipulation, SVG, Clipboard, etc.).
 */
import dynamic from 'next/dynamic';

const SvgEditorApp = dynamic(() => import('@/components/SvgEditorApp'), {
  ssr: false,
});

export default function Home() {
  return <SvgEditorApp />;
}
