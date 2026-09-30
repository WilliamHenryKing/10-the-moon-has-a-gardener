import { useEffect, useRef } from "react";

/** New nonmodal cards begin on their readable heading; closing returns to a connected opener. */
export function usePanelFocus<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!enabled) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus({ preventScroll: true });
    return () => {
      const previous = opener.current;
      const target =
        previous && previous !== document.body && previous.isConnected
          ? previous
          : document.querySelector<HTMLElement>("#root > canvas");
      if (target?.isConnected && !target.closest("[inert], [hidden]"))
        target.focus({ preventScroll: true });
    };
  }, [enabled]);
  return ref;
}
