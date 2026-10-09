import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Open windows, oldest first: Escape closes only the top one
const stack: symbol[] = [];

/**
 * Renders a modal window straight into <body>, so it always covers the whole screen and sits above
 * the header and tab bar, even when it is opened from inside a glass card (see index.css).
 * With onClose, the Escape key closes it (the top-most window first).
 */
export const Overlay: React.FC<{ children: React.ReactNode; onClose?: () => void }> = ({ children, onClose }) => {
  const id = useRef(Symbol('overlay')).current;
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    stack.push(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack[stack.length - 1] !== id || !close.current) return;
      e.preventDefault();
      close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(id), 1);
    };
  }, [id]);

  return createPortal(children, document.body);
};
