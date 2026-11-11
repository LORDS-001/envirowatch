import { useRef } from "react";

/**
 * Focus return for Radix Dialog content. Radix gives focus back to the element that opened it;
 * when that element is gone (an alert row that left a filtered list once resolved, a button that
 * changed into another), focus would drop to <body>. Fall back to the main region instead.
 */
export function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      // Fires before Radix moves focus in, so this is still the opener.
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (e: Event) => {
      e.preventDefault();
      const target = opener.current?.isConnected && opener.current !== document.body ? opener.current : document.getElementById("main");
      target?.focus();
    },
  };
}
