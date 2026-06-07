import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const listeners = {};
const calls = [];
const storage = {};
let messageAttempts = 0;

const chrome = {
  action: {
    onClicked: {
      addListener(listener) {
        listeners.onClicked = listener;
      },
    },
    async setBadgeBackgroundColor(details) {
      calls.push(["setBadgeBackgroundColor", details]);
    },
    async setBadgeText(details) {
      calls.push(["setBadgeText", details]);
    },
  },
  runtime: {
    onInstalled: {
      addListener(listener) {
        listeners.onInstalled = listener;
      },
    },
    onMessage: {
      addListener(listener) {
        listeners.onMessage = listener;
      },
    },
  },
  scripting: {
    async executeScript(details) {
      calls.push(["executeScript", details]);
    },
    async insertCSS(details) {
      calls.push(["insertCSS", details]);
    },
  },
  storage: {
    session: {
      async get(key) {
        return { [key]: storage[key] };
      },
      async remove(key) {
        delete storage[key];
      },
      async set(values) {
        Object.assign(storage, values);
      },
    },
  },
  tabs: {
    onActivated: {
      addListener(listener) {
        listeners.onActivated = listener;
      },
    },
    onRemoved: {
      addListener(listener) {
        listeners.onRemoved = listener;
      },
    },
    async sendMessage(tabId, message) {
      calls.push(["sendMessage", { tabId, message }]);
      messageAttempts += 1;
      if (messageAttempts === 1) {
        throw new Error("No receiving end");
      }
    },
  },
};

const code = await readFile(
  new URL("../dist/background.js", import.meta.url),
  "utf8",
);
vm.runInNewContext(code, { chrome, URL });

assert.equal(typeof listeners.onClicked, "function");
listeners.onClicked({ id: 42, url: "http://localhost:3004/dashboard" });

await new Promise((resolve) => setTimeout(resolve, 20));

assert.equal(storage["enabled:42"], true);
assert.deepEqual(
  calls
    .filter(([name]) => name === "executeScript")
    .map(([, details]) => [details.files[0], details.world]),
  [
    ["page-inspector.js", "MAIN"],
    ["content.js", "ISOLATED"],
  ],
);
assert.equal(
  calls.filter(([name]) => name === "insertCSS").length,
  1,
);
assert.equal(
  calls.filter(([name]) => name === "sendMessage").length,
  2,
);

console.log("Background reinjects the inspector into an already-open tab.");
