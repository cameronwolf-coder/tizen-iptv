# Smart IPTV — Tizen app for Samsung TVs

A fast, M3U-based IPTV player for Samsung Tizen TVs, built to fix the four things
that make typical IPTV apps painful on a weak SoC (e.g. the CU7000):

- **Laggy UI** → vanilla JS, no framework; the channel list is **virtualized**
  (a small reused pool of DOM rows) so a 15,000-channel playlist scrolls smoothly.
  Parsed playlist is cached in `localStorage` for near-instant startup.
- **Hard to navigate** → categories sidebar, **favorites** (RED button), live
  **search**, channel numbers, D-pad spatial navigation.
- **Buffering** → native **AVPlay** backend (hardware-decoded TS/HLS) with adaptive
  bitrate, fast channel zapping (Up/Down or Ch+/Ch-), and error toasts.
- **Bad EPG** → XMLTV parser with now/next on the preview pane and the playback OSD.

## Layout
```
config.xml         Tizen manifest (privileges: internet, AVPlay)
index.html         shell + video planes + views
css/style.css      1920x1080 TV styling, focus highlight
js/store.js        config, favorites, playlist cache
js/m3u.js          M3U / M3U-plus parser
js/epg.js          XMLTV parser + now/next lookup
js/nav.js          remote keycodes + key registration
js/player.js       AVPlay backend (+ HTML5/hls.js fallback for browser testing)
js/app.js          orchestrator: virtualized list, nav, playback
```

## Remote controls
- **Up/Down**: move in list or category  •  **Left/Right**: switch sidebar/list
- **OK**: play channel  •  **Return**: back / stop playback
- **Up/Down or Ch+/Ch-** while playing: zap channels  •  **Info/OK**: show OSD
- **RED**: toggle favorite  •  **GREEN**: open settings (M3U / EPG URLs)

## First run
On first launch (no config) the Setup screen asks for your **M3U URL** and an
optional **XMLTV EPG URL**. They're stored locally on the TV; the playlist is then
cached so subsequent launches are instant.

## Build & deploy (see deploy section in chat)
1. Install Tizen CLI (Tizen Studio).
2. Create a Samsung signing certificate (author + distributor) via `tizen certificate` / `tizen security-profiles`.
3. Enable **Developer Mode** on the TV: Apps screen → type `12345` → turn on, set PC IP = omen-llm.
4. `tizen build-web` → `tizen package -t wgt -s <profile>` → `sdb connect <tv-ip>` → `tizen install`.

## Local UI preview (no TV)
Serve the folder and open in a desktop browser; arrow keys + Enter drive it.
HLS playback in the browser needs `js/hls.min.js` (drop it in and reference it in
index.html); on the TV, AVPlay handles streams natively with no extra library.
