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

function loadPlayer() {
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
