import { useContext, useRef, createContext } from 'react';

type FocusManagementContextType = {
  setFocus: (element: HTMLElement | null) => void;
  restoreFocus: () => void;
};

const FocusManagementContext = createContext<FocusManagementContextType | null>(null);

export function useFocusManagement(): {
  setFocus: (element: HTMLElement | null) => void;
  restoreFocus: () => void;
} {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const context = useContext(FocusManagementContext);

  if (context) return context;

  const setFocus = (element: HTMLElement | null) => {
    if (element) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      element.focus();
    }
  };

  const restoreFocus = () => {
    previousFocusRef.current?.focus();
  };

  return { setFocus, restoreFocus };
}
