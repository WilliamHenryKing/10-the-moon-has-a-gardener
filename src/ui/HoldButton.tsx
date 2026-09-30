import { useEffect, useId, useRef } from "react";
import { cancelButton, onInputReset, pulseButton, setButton } from "../engine/input";

/** Own one pointer and each native activation key; a canceled tap cannot become a later action. */
export function HoldButton({
  name,
  label,
  children,
  className,
}: {
  name: "jump" | "interact";
  label: string;
  children: React.ReactNode;
  className: string;
}) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const pointer = useRef<number | null>(null);
  const keys = useRef(new Set<string>());
  const pointerOwner = `${id}:pointer`;
  const cancelPointer = useRef(() => {});
  const cancel = useRef(() => {});
  cancelPointer.current = () => {
    const owned = pointer.current;
    pointer.current = null;
    cancelButton(name, pointerOwner);
    if (owned !== null) {
      try {
        if (ref.current?.hasPointerCapture(owned)) ref.current.releasePointerCapture(owned);
      } catch {
        /* Capture may already be gone. */
      }
    }
  };
  cancel.current = () => {
    cancelPointer.current();
    for (const key of keys.current) cancelButton(name, `${id}:${key}`);
    keys.current.clear();
  };
  useEffect(() => {
    const clear = () => cancel.current();
    const unsubscribe = onInputReset(clear);
    return () => {
      unsubscribe();
      clear();
    };
  }, []);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={className}
      onPointerDown={(event) => {
        if (pointer.current !== null || event.button !== 0) return;
        pointer.current = event.pointerId;
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          cancelPointer.current();
          return;
        }
        event.preventDefault();
        setButton(name, true, pointerOwner);
      }}
      onPointerUp={(event) => {
        if (pointer.current !== event.pointerId) return;
        pointer.current = null;
        setButton(name, false, pointerOwner);
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          /* Already released. */
        }
      }}
      onPointerCancel={(event) => {
        if (pointer.current === event.pointerId) cancelPointer.current();
      }}
      onLostPointerCapture={(event) => {
        if (pointer.current === event.pointerId) cancelPointer.current();
      }}
      onKeyDown={(event) => {
        if (event.key !== " " && event.key !== "Enter") return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        if (event.repeat || keys.current.has(event.key)) return;
        keys.current.add(event.key);
        setButton(name, true, `${id}:${event.key}`);
      }}
      onKeyUp={(event) => {
        if (!keys.current.delete(event.key)) return;
        setButton(name, false, `${id}:${event.key}`);
      }}
      onBlur={() => {
        for (const key of keys.current) cancelButton(name, `${id}:${key}`);
        keys.current.clear();
      }}
      onClick={(event) => {
        if (event.detail === 0) pulseButton(name, `${id}:click`);
      }}
    >
      {children}
    </button>
  );
}
