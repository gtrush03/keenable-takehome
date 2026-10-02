/* One place for deploy-specific settings. The cloud deploy edits only this file. */
window.DEMO_URL = window.DEMO_URL || "https://george-keenable-demo.trusynth.workers.dev/";
/* Code link (George ruling #12): public clean mirror (George chose option A, 2 Oct). Set REPO_PUBLIC = false to show "private, available on request". */
window.REPO_URL = window.REPO_URL || "https://github.com/gtrush03/keenable-takehome";
window.REPO_PUBLIC = window.REPO_PUBLIC !== false;
(function () {
  function apply() { document.querySelectorAll("[data-demo-link]").forEach(function (a) { a.href = window.DEMO_URL; }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply); else apply();
})();
