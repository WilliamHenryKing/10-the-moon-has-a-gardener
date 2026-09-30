import { introActions, useHud } from "./hud-store";

export function SoundButton({ className = "btn btn-ghost" }: { className?: string }) {
  const muted = useHud((s) => s.muted);
  return (
    <button
      type="button"
      className={className}
      aria-pressed={!muted}
      onClick={() => introActions.mute()}
    >
      {muted ? "Sound off" : "Sound on"}
    </button>
  );
}
