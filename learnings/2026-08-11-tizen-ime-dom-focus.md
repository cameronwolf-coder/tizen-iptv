# 2026-08-11 — Tizen keyboard persists on visually focused buttons

**The problem, in one line:** Wolf TV moved its custom focus ring to “Save and open guide” but left real DOM focus on the final URL input, so Samsung Tizen kept the virtual keyboard open and intercepted the continuation action.

**The approach:**

1. Trace the setup screen’s logical focus index separately from `document.activeElement`.
2. Reproduce the mismatch with the real `app.js` in a small DOM harness: after three Down events, `S.setupFocus` reached the button while `document.activeElement` remained `cfg-relay`.
3. Make the active setup control own both visual and DOM focus by calling `focus()` for every focus index, including the button.
4. Verify the regression test fails with `cfg-relay`, passes with `cfg-save`, then smoke the browser flow through Enter: setup hidden and guide visible.
5. Bump the module and script cache version so TizenBrew fetches the changed startup code.

**The judgment calls:** The fix does not add keyboard-specific timers, Tizen API calls, or a separate dismiss button. Moving DOM focus to a non-input already asks the platform to close its IME and keeps the app’s custom focus model aligned with browser behavior. The existing key handler still prevents default activation and performs one save, avoiding duplicate button activation.

**The reusable rule:** On TV web apps, never move only the focus ring—keep the navigation index, visual state, and `document.activeElement` on the same control so the platform keyboard lifecycle follows navigation.
