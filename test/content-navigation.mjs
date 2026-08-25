import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

class MockEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.target = options.target ?? null;
    this.clientX = options.clientX ?? 0;
    this.clientY = options.clientY ?? 0;
    this.key = options.key ?? "";
    this.ctrlKey = options.ctrlKey ?? false;
    this.shiftKey = options.shiftKey ?? false;
    this.altKey = options.altKey ?? false;
    this.metaKey = options.metaKey ?? false;
  }

  preventDefault() {}
  stopPropagation() {}
  stopImmediatePropagation() {}
}

class MockCustomEvent extends MockEvent {
  constructor(type, options = {}) {
    super(type, options);
    this.detail = options.detail;
  }
}

class MockClassList {
  constructor(element) {
    this.element = element;
  }

  add(...names) {
    const classes = new Set(this.element.className.split(/\s+/).filter(Boolean));
    for (const name of names) classes.add(name);
    this.element.className = [...classes].join(" ");
  }

  remove(...names) {
    const removed = new Set(names);
    this.element.className = this.element.className
      .split(/\s+/)
      .filter((name) => name && !removed.has(name))
      .join(" ");
  }

  toggle(name, force) {
    if (force) this.add(name);
    else this.remove(name);
  }
}

class MockStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(property, value) {
    this.values.set(property, value);
  }

  getPropertyValue(property) {
    return this.values.get(property) ?? "";
  }
}

class MockElement {
  constructor(tagName = "div", rect = {}) {
    this.tagName = tagName.toUpperCase();
    this.parentElement = null;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.className = "";
    this.classList = new MockClassList(this);
    this.style = new MockStyle();
    this.id = "";
    this.disabled = false;
    this.isConnected = false;
    this.rect = {
      left: rect.left ?? 0,
      top: rect.top ?? 0,
      width: rect.width ?? 0,
      height: rect.height ?? 0,
    };
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    event.target ??= this;
    for (const listener of documentListeners.get(event.type) ?? []) {
      listener(event);
    }
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      child.isConnected = this.isConnected;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  contains(element) {
    return (
      element === this ||
      this.children.some((child) => child.contains(element))
    );
  }

  closest(selector) {
    let element = this;
    while (element !== null) {
      if (selector.startsWith("#") && element.id === selector.slice(1)) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  getBoundingClientRect() {
    return {
      ...this.rect,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height,
    };
  }
}

const documentListeners = new Map();
const documentElement = new MockElement("html");
documentElement.isConnected = true;
const inspectedElement = new MockElement("div", {
  left: 10,
  top: 20,
  width: 100,
  height: 50,
});
inspectedElement.isConnected = true;
const ownerElement = new MockElement("div", {
  left: 200,
  top: 100,
  width: 300,
  height: 180,
});

function ComponentA() {}
function ComponentB() {}

const componentAHostFiber = {
  type: "div",
  stateNode: ownerElement,
};
const componentBHostFiber = {
  type: "div",
  stateNode: inspectedElement,
};
const componentAFiber = {
  type: ComponentA,
  child: componentAHostFiber,
  return: null,
};
const componentBFiber = {
  type: ComponentB,
  child: componentBHostFiber,
  return: componentAHostFiber,
};
componentAHostFiber.child = componentBFiber;
componentAHostFiber.return = componentAFiber;
componentBHostFiber.return = componentBFiber;
inspectedElement.__reactFiber$fixture = componentBHostFiber;

const requests = [];
inspectedElement.addEventListener("rchi:inspect-request", (event) => {
  requests.push(JSON.parse(event.detail));
});

const document = {
  documentElement,
  hidden: false,
  createElement(tagName) {
    return new MockElement(tagName);
  },
  createElementNS(_namespace, tagName) {
    return new MockElement(tagName);
  },
  addEventListener(type, listener) {
    const listeners = documentListeners.get(type) ?? [];
    listeners.push(listener);
    documentListeners.set(type, listeners);
  },
  removeEventListener() {},
  dispatchEvent(event) {
    for (const listener of documentListeners.get(event.type) ?? []) listener(event);
    return true;
  },
  elementFromPoint() {
    return inspectedElement;
  },
  querySelector() {
    return null;
  },
};

const window = {
  innerWidth: 1_000,
  innerHeight: 800,
  addEventListener() {},
  removeEventListener() {},
  setTimeout,
  clearTimeout,
};

const runtimeListeners = [];
const chrome = {
  runtime: {
    onMessage: {
      addListener(listener) {
        runtimeListeners.push(listener);
      },
    },
    sendMessage(message) {
      if (message.type === "GET_STATE") {
        return Promise.resolve({ enabled: true });
      }
      return Promise.resolve({ ok: true });
    },
  },
};

const context = vm.createContext({
  chrome,
  clearTimeout,
  CustomEvent: MockCustomEvent,
  document,
  Element: MockElement,
  navigator: {},
  requestAnimationFrame(callback) {
    callback();
    return 1;
  },
  cancelAnimationFrame() {},
  setTimeout,
  window,
});
const pageInspectorCode = await readFile(
  new URL("../dist/page-inspector.js", import.meta.url),
  "utf8",
);
const contentCode = await readFile(
  new URL("../dist/content.js", import.meta.url),
  "utf8",
);
vm.runInContext(pageInspectorCode, context);
vm.runInContext(contentCode, context);

await Promise.resolve();
await Promise.resolve();

document.dispatchEvent(
  new MockEvent("click", {
    target: inspectedElement,
    clientX: 20,
    clientY: 30,
  }),
);
assert.equal(requests.length, 1);

const tooltip = documentElement.children.find(
  (element) => element.id === "rchi-tooltip",
);
const highlight = documentElement.children.find(
  (element) => element.id === "rchi-highlight",
);
const upButton = tooltip.children.find((element) =>
  element.className.split(/\s+/).includes("rchi-navigation-up-button"),
);
assert.ok(upButton);
upButton.dispatchEvent(new MockEvent("click", { target: upButton }));
assert.equal(requests.length, 2);

assert.deepEqual(
  ["left", "top", "width", "height"].map((property) =>
    highlight.style.getPropertyValue(property),
  ),
  ["200px", "100px", "300px", "180px"],
);

const downButton = tooltip.children.find((element) =>
  element.className.split(/\s+/).includes("rchi-navigation-down-button"),
);
assert.ok(downButton);
downButton.dispatchEvent(new MockEvent("click", { target: downButton }));
assert.equal(requests.length, 3);
assert.deepEqual(
  ["left", "top", "width", "height"].map((property) =>
    highlight.style.getPropertyValue(property),
  ),
  ["10px", "20px", "100px", "50px"],
);

console.log("Component navigation moves the highlight with the selected owner.");
