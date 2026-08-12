# Tizen AVPlay layering — 2026-08-11

## Problem

Wolf TV played audio but showed only the channel guide because Samsung AVPlay renders on a hardware plane behind the HTML page while the opaque guide stayed visible above it.

## Reusable approach

1. Trace the playback call from the guide action into the player backend before changing CSS.
2. Identify which element owns each visual plane: AVPlay/HTML5 video, guide, and playback OSD.
3. Put visibility transitions at the player boundary so every caller gets the same behavior.
4. On play, hide the guide and show the transparent playback overlay; on stop, reverse both changes.
5. Add a regression test that exercises the public `Player.play`/`Player.stop` contract, then smoke-test play and Back in a browser.
6. Cache-bust the changed scripts because jsDelivr and the installed TizenBrew module can otherwise retain old JavaScript under unchanged URLs.

## Judgment calls

- Did not raise the video element's `z-index`: AVPlay is a native hardware plane, so normal DOM stacking cannot pull it above an opaque page.
- Did not make the whole guide transparent: that would leak video through the browsing UI and weaken readability.
- Did not keep visibility changes in `app.js`: the player owns the playback lifecycle, and centralizing the transition prevents backend or caller drift.

## Rule

When a native video plane sits behind web content, hide the opaque application surface during playback and keep only the transparent OSD above it.
