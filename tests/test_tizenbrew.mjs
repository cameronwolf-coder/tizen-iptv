import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const storeSource = await readFile(new URL("../js/store.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

function loadStore(location) {
  const values = new Map();
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
