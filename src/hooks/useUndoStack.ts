/**
 * useUndoStack – Manages an undo history for SVG code strings.
 * Limited to 50 entries to prevent unbounded memory growth.
 */

import { useState, useCallback, useRef } from 'react';

const MAX_UNDO = 50;

export function useUndoStack() {
  const stackRef = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  /** Push a snapshot onto the undo stack if it differs from the top. */
  const pushUndo = useCallback((state: string) => {
    const stack = stackRef.current;
    if (stack.length > 0 && stack[stack.length - 1] === state) return;
    stack.push(state);
    if (stack.length > MAX_UNDO) stack.shift();
    setCanUndo(true);
  }, []);

  /** Pop and return the last undo state. Returns null if empty. */
  const popUndo = useCallback((): string | null => {
    const stack = stackRef.current;
    if (stack.length === 0) return null;
    const popped = stack.pop()!;
    setCanUndo(stack.length > 0);
    return popped;
  }, []);

  return { canUndo, pushUndo, popUndo };
}
