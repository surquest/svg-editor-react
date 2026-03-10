/**
 * useToast – Simple toast notification manager.
 * Provides a queue of auto-dismissing messages rendered by ToastContainer.
 */

import { useState, useCallback, useRef } from 'react';
import type { ToastMessage, ToastSeverity } from '@/types/editor';

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, severity: ToastSeverity = 'info') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, severity }]);
    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, removeToast };
}
