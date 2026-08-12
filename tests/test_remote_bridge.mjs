import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../js/remote.js", import.meta.url), "utf8");

function bridgeHarness(outcomes) {
  const requests = [];
  const timers = [];
  const statuses = [];

  class XMLHttpRequestFake {
    open(method, url) {
      this.method = method;
      this.url = url;
    }

    setRequestHeader() {}

    send(body) {
      requests.push({ method: this.method, url: this.url, body });
      const outcome = outcomes.shift();
      if (outcome === "network-error") {
        this.onerror();
        return;
      }
      this.status = 201;
      this.responseText = JSON.stringify(outcome);
      this.onload();
    }
  }

  const sandbox = {
    XMLHttpRequest: XMLHttpRequestFake,
    Promise,
    Store: {
      clearRemoteTV() {},
      getRemoteTV() { return null; },
      setRemoteTV() { return true; },
    },
    clearTimeout() {},
    setTimeout(action, delay) {
      timers.push({ action, delay });
      return timers.length;
    },
  };
  sandbox.window = sandbox;
  runInNewContext(source, sandbox);
  const bridge = sandbox.RemoteBridge.create({
    name: "QA television",
    getRelayUrl: () => "http://relay.test",
    onPlay() {},
    onStatus: (message) => statuses.push(message),
    onStop() {},
  });
  return { bridge, requests, statuses, timers };
}

test("registration retries without exposing a stream URL", async () => {
  const harness = bridgeHarness([
    "network-error",
    { tv_token: "tv-token", pairing_code: "123456" },
  ]);
  harness.bridge.sync([
    {
      num: 7,
      name: "Local News",
      group: "News",
      url: "http://provider.invalid/private-stream",
    },
  ]);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.requests.length, 1);
  assert.equal(harness.timers[0].delay, 5000);
  harness.timers.shift().action();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.requests.length, 2);
  const payload = JSON.parse(harness.requests[1].body);
  assert.deepEqual(Object.keys(payload.catalog[0]).sort(), [
    "group",
    "key",
    "name",
    "number",
  ]);
  assert.equal(harness.statuses.at(-1), "Phone pairing code: 123456");
});
