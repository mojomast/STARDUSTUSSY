import React, { useEffect, useRef } from 'react';

interface VisuallyHiddenProps {
  children: React.ReactNode;
  as?: React.ElementType;
}

export function SkipLink(): React.ReactElement {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
    >
      Skip to main content
    </a>
  );
}

export function VisuallyHidden({ children, as: Component = 'span' }: VisuallyHiddenProps): React.ReactElement {
  return React.createElement(
    Component,
    {
      className: 'sr-only'
    },
    children
  );
}

interface FocusTrapProps {
  children: React.ReactNode;
  active: boolean;
  onEscape?: () => void;
}

export function FocusTrap({ children, active, onEscape }: FocusTrapProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previousActiveElement.current = document.activeElement as HTMLElement;
    const container = containerRef.current;

    if (!container) return;

    const focusableElements = container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscape?.();
      }
    };

    document.addEventListener('keydown', handleTab);
    document.addEventListener('keydown', handleEscape);

    firstElement?.focus();

    return () => {
      document.removeEventListener('keydown', handleTab);
      document.removeEventListener('keydown', handleEscape);
      previousActiveElement.current?.focus();
    };
  }, [active, onEscape]);

  return <div ref={containerRef} tabIndex={-1}>{children}</div>;
}

interface LiveRegionProps {
  children: React.ReactNode;
  priority?: 'polite' | 'assertive';
  atomic?: boolean;
}

export function LiveRegion({ children, priority = 'polite', atomic = false }: LiveRegionProps): React.ReactElement {
  return (
    <div
      role="status"
      aria-live={priority}
      aria-atomic={atomic}
      className="sr-only"
    >
      {typeof children === 'string' ? children : ''}
    </div>
  );
}

interface FocusTrapWrapperProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export function FocusTrapWrapper({ isOpen, onClose, children }: FocusTrapWrapperProps): React.ReactElement {
  if (!isOpen) return <>{children}</>;

  return (
    <FocusTrap active={isOpen} onEscape={onClose}>
      {children}
    </FocusTrap>
  );
}

/* eslint-disable react-refresh/only-export-components */
export { useFocusManagement, useKeyboardNavigation } from './useFocusManagement';
/* eslint-enable react-refresh/only-export-components */

interface AnnouncerProps {
  message: string;
  priority?: 'polite' | 'assertive';
}

export function Announcer({ message, priority = 'polite' }: AnnouncerProps): React.ReactElement {
  return (
    <div
      role="status"
      aria-live={priority}
      className="sr-only"
      aria-atomic="true"
    >
      {message}
    </div>
  );
}
