# Wolf TV — Tizen app for Samsung TVs

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
js/remote.js       TV-side bridge for the LAN companion remote
js/app.js          orchestrator: virtualized list, nav, playback
remote/            phone remote page and its design-system stylesheet
```

## Remote controls
- **Up/Down**: move in list or category  •  **Left/Right**: switch groups/list
- **OK**: play channel  •  **Return**: back / stop playback
- **Up/Down or Ch+/Ch-** while playing: zap channels  •  **Info/OK**: show OSD
- **RED**: toggle favorite  •  **GREEN**: settings  •  **YELLOW**: search

The guide restores focus to the last-watched channel, keeps favorites in the
first group, and shows a position count plus scroll indicator for long lists.

## First run
On first launch (no config) the Setup screen asks for your **M3U URL** and an
optional **XMLTV EPG URL**. They're stored locally on the TV; the playlist is then
cached so subsequent launches are instant.

## Install on the TV

### TizenBrew (recommended)

1. In the TV's **Apps** screen, type `12345`, enable Developer Mode, set
   **Host PC IP** to `127.0.0.1`, and fully restart the TV.
2. Open TizenBrew and press the **GREEN** button for Module Manager.
3. Choose **Add GitHub Module**.
4. Enter `cameronwolf-coder/tizen-iptv`.
5. Launch **Wolf TV** from the TizenBrew home screen.

TizenBrew loads the app from a **public** GitHub repository through jsDelivr.
Future releases only need a GitHub push and a TizenBrew refresh—no Samsung
certificate rebuild.

Wolf TV 1.0.2 automatically imports the original module's on-device playlist,
EPG, favorites, cached guide, and last-watched settings on first launch. Existing
Wolf TV settings win, and the original data is left untouched.

### Native widget fallback

Install Tizen Studio, create a Samsung author/distributor certificate, enable
Developer Mode on the TV with the Mac's LAN IP, then run `tizen build-web`,
`tizen package -t wgt -s <profile>`, `sdb connect <tv-ip>`, and `tizen install`.

## Local UI preview (no TV)
Serve the folder and open in a desktop browser; arrow keys + Enter drive it.
HLS playback in the browser needs `js/hls.min.js` (drop it in and reference it in
index.html); on the TV, AVPlay handles streams natively with no extra library.

## TV design approach

Wolf TV 1.1 uses a low-density, overscan-safe 1920×1080 shell with one visible
focus target, predictable row/column movement, 28px-or-larger functional text,
and immediate D-pad feedback. The guide remains the center of the product:
groups, channels, and now/next context stay on one screen rather than adding a
recommendation-heavy home page.

The interaction model follows the converging guidance in
[Samsung Smart TV design principles](https://developer.samsung.com/smarttv/design/design-principles.html),
[Android TV's focus system](https://developer.android.com/design/ui/tv/guides/styles/focus-system),
[Apple's focus and selection guidance](https://developer.apple.com/design/human-interface-guidelines/focus-and-selection),
[Fire TV's ten-foot guidelines](https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html),
and [Roku's key design principles](https://developer.roku.com/dev/docs/key-design-principles).

## Phone remote on your LAN

Run the relay from this project directory:

```bash
uv run --with uvicorn uvicorn remote_server:app --host 0.0.0.0 --port 8000
```

Open `http://<computer-LAN-IP>:8000/remote/` on the phone while it is on the same
LAN. On the TV, open **Setup** with the GREEN button and enter the LAN relay URL
(for example, `http://<computer-LAN-IP>:8000`) in **Phone relay URL**. This is
required under TizenBrew because its `http://127.0.0.1:8081` module server is
inside the TV, not the Mac relay. A normal desktop HTTP preview still uses its
own origin automatically.

After the TV loads its playlist, the preview panel shows a six-digit phone pairing
code. Enter that code on the phone, then search or filter the safe channel guide and
tap a channel. The phone sends only a channel key; stream URLs and provider
credentials remain on the TV.
