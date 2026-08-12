# 2026-08-11 — AVPlay needs a bounded container fallback

**The problem, in one line:** A subset of Xtream live channels failed on Samsung AVPlay's primary MPEG-TS route, while Wolf TV neither tried the provider's HLS route nor exposed Samsung's detailed failure code.

## Approach

1. Keep the documented Xtream `.ts` live route as AVPlay's primary source because it already works for most channels.
2. When that source raises its first playback error, rebuild only the container suffix as `.m3u8` and retry once through the same AVPlay lifecycle.
3. Register Samsung's `onerrormsg` callback as well as `onerror` so a failed fallback can report the error code, codec, demuxer, resolution, frame rate, and decoder detail.
4. Parse only an allowlist of diagnostic fields. Never display or persist the raw error payload because Samsung can include the full credential-bearing stream URL and HTTP headers.
5. Use an attempt generation to ignore stale callbacks after fallback or stop, preventing old AVPlay events from corrupting the current playback state.

## Judgment calls

- No channel-name or stream-ID exception was added. The fallback is tied to the failing transport route, so it applies to every affected provider channel.
- The retry is deliberately bounded to one alternate container. Repeated retries would hide provider outages and create playback loops.
- Unsupported codecs still cannot be repaired client-side. If both routes fail, the sanitized AVPlay detail now distinguishes that case from connection and container failures.
- The exact physical result for `US| Cartoon Network EAST HD` remains a Samsung-TV check after release; the deterministic test proves route fallback and secret redaction, not the provider's current feed health.

## Reusable rule

For live media APIs that expose equivalent transport routes, retry one documented alternate container at the playback boundary and surface only allowlisted diagnostics when both fail.

## Evidence

- `tests/test_player_view.mjs` exercises `.ts` to `.m3u8` fallback, one-attempt behavior, and URL-secret redaction.
- Samsung AVPlay callback contract: https://developer.samsung.com/smarttv/develop/api-references/samsung-product-api-references/avplay-api.html#AVPlayPlaybackCallback-onerrormsg
