import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const storeSource = await readFile(new URL("../js/store.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

function loadStore(location, initialValues = {}) {
  const values = new Map(Object.entries(initialValues));
  const sandbox = {
    location,
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      removeItem(key) { values.delete(key); },
      setItem(key, value) { values.set(key, value); },
    },
  };
  sandbox.window = sandbox;
  runInNewContext(storeSource, sandbox);
  return { Store: sandbox.Store, values };
}

test("Wolf TV migrates settings from the original TizenBrew module", () => {
  const legacy = {
    "iptv.cfg": JSON.stringify({
      m3u: "https://example.test/list.m3u",
      epg: "https://example.test/guide.xml",
    }),
    "iptv.channels": JSON.stringify([{ id: "news", name: "News" }]),
    "iptv.cats": JSON.stringify(["All", "News"]),
    "iptv.stamp": JSON.stringify(123456),
    "iptv.favs": JSON.stringify({ "https://example.test/news.m3u8": 1 }),
    "iptv.last": JSON.stringify("https://example.test/news.m3u8"),
  };

  const { Store, values } = loadStore({ protocol: "file:" }, legacy);

  assert.deepEqual(JSON.parse(JSON.stringify(Store.getConfig())), {
    m3u: "https://example.test/list.m3u",
    epg: "https://example.test/guide.xml",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(Store.getCachedPlaylist())), {
    channels: [{ id: "news", name: "News" }],
    cats: ["All", "News"],
    stamp: 123456,
  });
  assert.equal(Store.isFav("https://example.test/news.m3u8"), true);
  assert.equal(Store.getLast(), "https://example.test/news.m3u8");
  for (const [legacyKey, value] of Object.entries(legacy)) {
    assert.equal(values.get(legacyKey), value);
    assert.equal(values.get(legacyKey.replace("iptv.", "wolf-tv.")), value);
  }
});

test("Wolf TV never overwrites settings already saved under its own keys", () => {
  const current = {
    "wolf-tv.cfg": JSON.stringify({ m3u: "https://current.test/list.m3u" }),
    "wolf-tv.channels": JSON.stringify([{ id: "current" }]),
    "wolf-tv.cats": "",
    "wolf-tv.stamp": JSON.stringify(999),
    "wolf-tv.favs": JSON.stringify({ current: 1 }),
    "wolf-tv.last": JSON.stringify("current"),
  };
  const legacy = {
    "iptv.cfg": JSON.stringify({ m3u: "https://old.test/list.m3u" }),
    "iptv.channels": JSON.stringify([{ id: "old" }]),
    "iptv.cats": JSON.stringify(["Old"]),
    "iptv.stamp": JSON.stringify(123),
    "iptv.favs": JSON.stringify({ old: 1 }),
    "iptv.last": JSON.stringify("old"),
  };

  const { Store, values } = loadStore(
    { protocol: "file:" },
    { ...legacy, ...current },
  );

  assert.equal(Store.getConfig().m3u, "https://current.test/list.m3u");
  for (const [key, value] of Object.entries(current)) {
    assert.equal(values.get(key), value);
  }
});

test("TizenBrew manifest launches Wolf TV as an app module", () => {
  assert.equal(manifest.appName, "Wolf TV");
  assert.equal(manifest.packageType, "app");
  assert.equal(manifest.appPath, "index.html");
  assert.ok(manifest.keys.includes("MediaPlayPause"));
});

test("TizenBrew's localhost module server is not mistaken for the phone relay", () => {
  const { Store } = loadStore({
    protocol: "http:",
    hostname: "127.0.0.1",
    port: "8081",
    pathname: "/module/gh%2Fcameronwolf-coder%2Ftizen-iptv/index.html",
    origin: "http://127.0.0.1:8081",
  });

  assert.equal(Store.isTizenBrew(), true);
  assert.equal(Store.getRelayUrl(), "");
});

test("ordinary HTTP previews still use their origin as the phone relay", () => {
  const { Store } = loadStore({
    protocol: "http:",
    hostname: "192.168.4.36",
    port: "8000",
    pathname: "/index.html",
    origin: "http://192.168.4.36:8000",
  });

  assert.equal(Store.isTizenBrew(), false);
  assert.equal(Store.getRelayUrl(), "http://192.168.4.36:8000");
});

test("Wolf TV keeps its browser storage separate from other TizenBrew modules", () => {
  const { Store, values } = loadStore({
    protocol: "http:",
    hostname: "127.0.0.1",
    port: "8081",
    pathname: "/module/gh%2Fcameronwolf-coder%2Ftizen-iptv/index.html",
    origin: "http://127.0.0.1:8081",
  });

  Store.setConfig({ type: "m3u", m3u: "https://example.test/list.m3u" });

  assert.ok(values.has("wolf-tv.cfg"));
  assert.equal(values.has("iptv.cfg"), false);
});
