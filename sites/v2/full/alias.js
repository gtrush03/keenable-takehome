/* Ruling #16: slides cut from the Extended as repeats keep their old links working; #old → the slide that holds the same content.
   Load BEFORE full/shared/deck.js so the deck reads the corrected hash. */
(() => {
  const A = { "tk-clock": "two-buyers", "ask-found": "ask", "ask-gets": "ask", "numbers": "sx-mine", "q-plan": "oc-days", "q-product": "fd-a",
    "tk-f-targets": "pp-fintech", "tk-f-accounts": "pp-fintech", "tk-g-targets": "pp-galactica", "tk-g-accounts": "pp-galactica", "tk-f-demo": "fx-flip", "fx-live": "fx-flip" };
  const fix = () => { let id = ""; try { id = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
    if (A[id]) history.replaceState(history.state, "", location.pathname + location.search + "#" + A[id]); };
  fix(); addEventListener("hashchange", fix, true);
})();
