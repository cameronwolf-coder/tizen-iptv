import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const appSource = await readFile(new URL("../js/app.js", import.meta.url), "utf8");

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

  toggle(name, force) {
    if (force) this.names.add(name);
    else this.names.delete(name);
  }
}

function loadSetup() {
  const listeners = {};
  const elements = new Map();
  const document = {
    activeElement: null,
    readyState: "loading",
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    getElementById(id) {
      if (!elements.has(id)) {
        const element = {
          id,
          value: "",
          textContent: "",
          classList: new ClassList(id === "setup" ? "hidden" : ""),
          addEventListener() {},
          focus() {
            document.activeElement = element;
          },
          blur() {
            if (document.activeElement === element) document.activeElement = null;
          },
        };
        elements.set(id, element);
      }
      return elements.get(id);
    },
  };
  const sandbox = {
    document,
    window: { addEventListener() {} },
    setInterval() {},
    setTimeout() {},
    clearTimeout() {},
    NAV: {
      KEY: { UP: 38, DOWN: 40, ENTER: 13, RETURN: 10009 },
      registerKeys() {},
    },
    Store: {
      getConfig: () => ({}),
      getRelayUrl: () => "",
      getCachedPlaylist: () => null,
      isTizenBrew: () => false,
    },
    Xtream: { parse: () => null },
    Player: { on() {} },
  };
  sandbox.window = Object.assign(sandbox.window, sandbox);
  vm.runInNewContext(appSource, sandbox);
  listeners.DOMContentLoaded();

  return {
    document,
    elements,
    press(keyCode) {
      listeners.keydown({ keyCode, preventDefault() {} });
    },
  };
}

test("moving from the last setup input focuses the Save button and dismisses the keyboard", () => {
  const setup = loadSetup();

  assert.equal(setup.document.activeElement.id, "cfg-m3u");
  setup.press(40);
  setup.press(40);
  setup.press(40);

  assert.equal(setup.document.activeElement.id, "cfg-save");
});
