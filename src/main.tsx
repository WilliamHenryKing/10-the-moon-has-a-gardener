import "./styles.css";
import { createRoot } from "react-dom/client";
import { AudioEngine } from "./audio/engine";
import { worldReady } from "./loader";
import { GardenScene } from "./scene/stage";
import { App } from "./ui/App";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const root = document.getElementById("root");

if (root) {
  root.classList.add("relative");
  const stage = document.createElement("div");
  stage.className = "absolute inset-0";
  stage.setAttribute("role", "application");
  stage.setAttribute(
    "aria-label",
    "Lunar garden. Tap or click a soil tile to stand or lift a shade panel. Arrow keys move the cursor, Enter toggles a panel, square brackets turn the Sun, G grows a day.",
  );
  stage.tabIndex = 0;
  root.appendChild(stage);
  const ui = document.createElement("div");
  root.appendChild(ui);

  const scene = new GardenScene(stage, reduced, worldReady);
  // Audio starts on the first gesture, as browsers require; later gestures resume it.
  const audio = new AudioEngine();
  window.addEventListener("pointerdown", audio.unlock, true);
  window.addEventListener("keydown", audio.unlock, true);
  createRoot(ui).render(<App scene={scene} audio={audio} reduced={reduced} />);
}
