import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const playerSource = await readFile(new URL("../js/player.js", import.meta.url), "utf8");

class ClassList {
  constructor(...names) {
    this.names = new Set(names);
  }

  add(name) {
    this.names.add(name);
  }

  remove(name) {
    this.names.delete(name);
  }

  contains(name) {
    return this.names.has(name);
  }
}

function loadPlayer(avplay = null) {
  const elements = {
    "av-player": { style: {} },
    "html5-player": {
      style: {},
      play: () => ({ catch: () => {} }),
      pause: () => {},
      removeAttribute: () => {},
      load: () => {},
    },
    browser: { classList: new ClassList() },
    "player-overlay": { classList: new ClassList("hidden") },
  };
  const sandbox = {
    document: { getElementById: (id) => elements[id] },
  };
  if (avplay) sandbox.webapis = { avplay };
  sandbox.window = sandbox;
  vm.runInNewContext(playerSource, sandbox);
  return { Player: sandbox.Player, elements };
}

test("playback reveals the video surface and Back restores the guide", () => {
  const { Player, elements } = loadPlayer();

  Player.play("https://example.test/live.mp4");

  assert.equal(elements.browser.classList.contains("hidden"), true);
  assert.equal(elements["player-overlay"].classList.contains("hidden"), false);

  Player.stop();

  assert.equal(elements.browser.classList.contains("hidden"), false);
  assert.equal(elements["player-overlay"].classList.contains("hidden"), true);
});

test("AVPlay retries an Xtream transport stream as HLS once", () => {
  const opened = [];
  const listeners = [];
  const avplay = {
    stop: () => {},
    close: () => {},
    open: (url) => opened.push(url),
    setDisplayRect: () => {},
    setStreamingProperty: () => {},
    setListener: (listener) => listeners.push(listener),
    prepareAsync: (ready) => ready(),
    play: () => {},
  };
  const { Player } = loadPlayer(avplay);
  const errors = [];
  Player.on("error", (error) => errors.push(error));

  Player.play("https://provider.test/live/viewer/secret/417.ts");
  listeners[0].onerror("PLAYER_ERROR_CONNECTION_FAILED");

  assert.deepEqual(opened, [
    "https://provider.test/live/viewer/secret/417.ts",
    "https://provider.test/live/viewer/secret/417.m3u8",
  ]);
  assert.deepEqual(errors, []);

  listeners[1].onerrormsg(
    "mediaError",
    JSON.stringify({
      error_code: "PLAYER_ERROR_NOT_SUPPORTED_FORMAT",
      codec: "h264",
      detail_info: "decoder error",
      url: "https://provider.test/live/viewer/secret/417.m3u8",
    }),
  );

  assert.deepEqual(errors, [
    "PLAYER_ERROR_NOT_SUPPORTED_FORMAT · h264 · decoder error",
  ]);
  assert.equal(errors[0].includes("viewer"), false);
  assert.equal(errors[0].includes("secret"), false);
});
