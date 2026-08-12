# 2026-08-11 — Ten-foot guide redesign

**The problem, in one line:** Redesign a Samsung Tizen IPTV guide for current ten-foot conventions without turning a fast single-provider channel browser into a streaming recommendation portal.

**The approach:**
1. Preserve the existing behavior contract first: groups, virtualized channels, selected-channel preview, favorites, search, settings, playback, and Back.
2. Compare first-party Samsung, Android TV, Apple TV, Fire TV, and Roku guidance. Keep only the convergent rules: overscan-safe margins, low density, large functional type, one obvious focus target, direct D-pad paths, and immediate feedback.
3. Rebuild the shell around three stable columns—groups, channels, context—so navigation remains spatially obvious and never requires a new home layer.
4. Add information that reduces uncertainty without adding navigation: position count, list scroll indicator, now/next progress, current time, and persistent remote hints.
5. Exercise the real rendered path in a browser: YELLOW search, filtering, group movement, OK playback, and Back. Run the complete Python and Node suites.
6. Review against the oldest supported Tizen engine, not desktop Chrome. Replace unsupported CSS such as `inset: 0` with equivalent longhands before release.

**The judgment calls:** A discovery-first home screen, carousels, recommendations, animation-heavy transitions, framework migration, and provider-specific branding were rejected. They increase choice and rendering work without helping the core job: finding a known live channel quickly. The existing vanilla-JS virtualization and playback model stayed intact. Accessibility work was limited to the actual remote contract—landmarks, listbox/option states, live status, readable scale, and a single visible focus—rather than desktop-only tab behavior.

**The reusable rule:** For TV redesigns, preserve the shortest D-pad route to the core job and validate every CSS primitive against the oldest target engine, not the development browser.
