# Xtream live URLs need an explicit route and container

**Problem, in one line:** Wolf TV rebuilt Xtream MPEG-TS channel URLs as extensionless `/{user}/{pass}/{stream_id}` paths, so many provider streams reached AVPlay through an ambiguous or unsupported route.

## Approach

1. Compare working code with the Xtream live-stream contract instead of treating every channel failure as a dead feed.
2. Test both playback backends: AVPlay needs the typed `/live/{user}/{pass}/{stream_id}.ts` route; browser HTML5 uses `/live/{user}/{pass}/{stream_id}.m3u8`.
3. Rebuild Xtream playback URLs when a channel is selected. Do not trust cached `channel.url` values because old caches preserve the broken route after an app update.
4. Leave ordinary M3U channels alone; their provider-supplied URLs remain authoritative.
5. Verify through a fake Xtream server and the actual browser app: load one channel, select it, then observe the requested `/live/...m3u8` route without using real provider credentials.

## Judgment calls

- Did not add retries across arbitrary URL shapes. Correcting the canonical route fixes the source error without hiding genuinely dead channels or doubling requests.
- Did not clear the playlist cache. Rebuilding only the playback URL preserves cached guide data, favorites, and startup speed.
- Did not log provider URLs. Xtream paths contain credentials; tests and smoke checks use fake values only.

## Reusable rule

When an API returns an identifier but playback needs a typed resource URL, construct the documented route at the playback boundary and never let persisted pre-fix URLs override it.

## Evidence

- `tests/test_xtream.mjs` proves MPEG-TS, HLS, and stale-cache routing.
- Browser smoke requested `/live/viewer/secret/417.m3u8` from a fake provider.
- Samsung AVPlay API reference: https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html
