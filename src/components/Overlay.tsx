import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders a modal window straight into <body>, so it always covers the whole screen and sits above
 * the header and tab bar, even when it is opened from inside a glass card (see index.css).
 */
export const Overlay: React.FC<{ children: React.ReactNode }> = ({ children }) => createPortal(children, document.body);
