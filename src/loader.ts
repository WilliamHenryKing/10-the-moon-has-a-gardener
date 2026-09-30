// The veil stays until a real first frame, even on a slow connection.
let revealed = false;
let failed = false;
let removeTimer = 0;
const slowTimer = window.setTimeout(() => {
  if (!revealed && !failed) recovery("Still preparing the lunar basin…", false);
}, 30_000);

function recovery(message: string, focus: boolean) {
  let veil = document.getElementById("arrival");
  if (!veil) {
    veil = document.createElement("div");
    veil.id = "arrival";
    document.body.append(veil);
  }
  veil.classList.remove("is-done");
  veil.setAttribute("role", "status");
  veil.setAttribute("aria-live", "polite");
  veil.replaceChildren();
  const title = document.createElement("p");
  title.textContent = message;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Reload";
  button.style.cssText =
    "font:600 16px system-ui;padding:14px 24px;border:1px solid #f3daaa;border-radius:8px;background:#181a22;color:#f4efe4;cursor:pointer";
  button.onclick = () => location.reload();
  veil.append(title, button);
  if (focus) button.focus();
}

export function worldReady() {
  if (revealed || failed) return;
  revealed = true;
  clearTimeout(slowTimer);
  const root = document.getElementById("root");
  if (root) root.inert = false;
  const veil = document.getElementById("arrival");
  if (!veil) return;
  veil.classList.add("is-done");
  removeTimer = window.setTimeout(() => veil.remove(), 700);
}

export function worldFailed() {
  failed = true;
  clearTimeout(slowTimer);
  clearTimeout(removeTimer);
  recovery("The lunar basin could not load. Please try again.", true);
}

import.meta.hot?.dispose(() => {
  clearTimeout(slowTimer);
  clearTimeout(removeTimer);
});
