import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../js/xtream.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../js/app.js", import.meta.url), "utf8");

function loadXtream() {
  const sandbox = {
    window: {},
    Promise,
    XMLHttpRequest: function () {},
    encodeURIComponent,
    decodeURIComponent,
    escape,
    atob: (value) => Buffer.from(value, "base64").toString("binary"),
  };
  runInNewContext(source, sandbox);
  return sandbox.window.Xtream;
}

class ClassList {
  constructor() {
    this.names = new Set();
  }

  add(name) {
    this.names.add(name);
  }

  remove(name) {
    this.names.delete(name);
  }

  toggle(name, force) {
    if (force) this.names.add(name);
    else this.names.delete(name);
  }
}

function playCachedXtreamChannel(channel) {
  const Xtream = loadXtream();
  Xtream.prototype.liveCategories = () => new Promise(() => {});
  Xtream.prototype.liveStreams = () => new Promise(() => {});
  Xtream.prototype.shortEpg = () => Promise.resolve({});

  const listeners = {};
  const elements = new Map();
  const document = {
    readyState: "loading",
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          id,
          value: "",
          textContent: "",
          style: {},
          children: [],
          classList: new ClassList(),
          addEventListener() {},
          focus() {},
          blur() {},
        });
      }
      return elements.get(id);
    },
  };
  const played = [];
  let remoteOptions;
  const sandbox = {
    document,
    window: { addEventListener() {} },
    setInterval() {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    NAV: {
      KEY: {},
      registerKeys() {},
    },
    Store: {
      getConfig: () => ({
        type: "xtream",
        base: "https://provider.test:443",
        user: "viewer",
        pass: "secret",
      }),
      getRelayUrl: () => "",
      getCachedPlaylist: () => null,
      setLast() {},
      isTizenBrew: () => false,
    },
    Xtream,
    Player: {
      backend: "avplay",
      on() {},
      play(url) {
        played.push(url);
      },
    },
    RemoteBridge: {
      create(options) {
        remoteOptions = options;
        return { sync() {} };
      },
    },
  };
  sandbox.window = Object.assign(sandbox.window, sandbox);
  runInNewContext(appSource, sandbox);
  listeners.DOMContentLoaded();
  remoteOptions.onPlay(channel);
  return played[0];
}

test("Xtream MPEG-TS streams use the standard typed live route", () => {
  const Xtream = loadXtream();
  const client = new Xtream({
    base: "https://provider.test:443",
    user: "viewer",
    pass: "secret",
  });

  assert.equal(
    client.streamUrl(417, false),
    "https://provider.test:443/live/viewer/secret/417.ts",
  );
});

test("Xtream HLS streams use the standard typed live route", () => {
  const Xtream = loadXtream();
  const client = new Xtream({
    base: "https://provider.test:443",
    user: "viewer",
    pass: "secret",
  });

  assert.equal(
    client.streamUrl(417, true),
    "https://provider.test:443/live/viewer/secret/417.m3u8",
  );
});

test("cached Xtream channels are rebuilt with the current typed live route", () => {
  assert.equal(
    playCachedXtreamChannel({
      name: "ABC Houston DirecTV GO",
      logo: "",
      stream_id: 417,
      url: "https://provider.test:443/viewer/secret/417",
    }),
    "https://provider.test:443/live/viewer/secret/417.ts",
  );
});
