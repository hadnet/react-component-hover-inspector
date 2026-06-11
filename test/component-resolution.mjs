import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const listeners = new Map();
const responses = [];

class MockElement {
  constructor() {
    this.parentElement = null;
  }
}

class MockCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
    this.target = null;
  }
}

const document = {
  addEventListener(type, listener) {
    listeners.set(type, listener);
  },
  dispatchEvent(event) {
    responses.push(event);
    return true;
  },
};

const window = {};
const code = await readFile(
  new URL("../dist/page-inspector.js", import.meta.url),
  "utf8",
);

vm.runInNewContext(code, {
  CustomEvent: MockCustomEvent,
  Element: MockElement,
  Set,
  document,
  window,
});

const inspect = listeners.get("rchi:inspect-request");
assert.equal(typeof inspect, "function");

function componentNameFor(element) {
  const event = new MockCustomEvent("rchi:inspect-request", {
    detail: JSON.stringify({ requestId: responses.length + 1 }),
  });
  event.target = element;
  inspect(event);
  return JSON.parse(responses.at(-1).detail).componentName;
}

function SegmentViewNode() {}
function DashboardCard() {}
function CourseCard() {}
function LinkComponent() {}
function Navbar() {}
function MotionComponent() {}

const serverComponentElement = new MockElement();
serverComponentElement.__reactFiber$fixture = {
  type: "div",
  stateNode: { constructor: SegmentViewNode },
  _debugInfo: [
    { name: "Dashboard", env: "Server" },
    { name: "InfoCard", env: "Server" },
  ],
  return: {
    type: SegmentViewNode,
    return: null,
  },
};

assert.equal(componentNameFor(serverComponentElement), "InfoCard");

const clientComponentElement = new MockElement();
clientComponentElement.__reactFiber$fixture = {
  type: "button",
  return: {
    type: DashboardCard,
    return: null,
  },
};

assert.equal(componentNameFor(clientComponentElement), "DashboardCard");

const internalOnlyElement = new MockElement();
internalOnlyElement.__reactFiber$fixture = {
  type: "div",
  stateNode: { constructor: SegmentViewNode },
  return: {
    type: SegmentViewNode,
    return: null,
  },
};

assert.equal(
  componentNameFor(internalOnlyElement),
  "Unknown React component",
);

const motionElement = new MockElement();
motionElement.__reactFiber$fixture = {
  type: "div",
  return: {
    type: {
      displayName: "motion.div",
      render: MotionComponent,
    },
    return: {
      type: Navbar,
      return: null,
    },
  },
};

assert.equal(componentNameFor(motionElement), "Navbar");

const nextLinkElement = new MockElement();
nextLinkElement.__reactFiber$fixture = {
  type: "img",
  return: {
    type: LinkComponent,
    return: {
      type: CourseCard,
      return: null,
    },
  },
};

assert.equal(componentNameFor(nextLinkElement), "CourseCard");

window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  reactDevtoolsAgent: {
    getComponentNameForHostInstance() {
      return "InfoCardFromReactDevTools";
    },
  },
};

assert.equal(
  componentNameFor(internalOnlyElement),
  "InfoCardFromReactDevTools",
);

window.__REACT_DEVTOOLS_GLOBAL_HOOK__.reactDevtoolsAgent
  .getComponentNameForHostInstance = () => "LinkComponent";

assert.equal(componentNameFor(nextLinkElement), "CourseCard");

window.__REACT_DEVTOOLS_GLOBAL_HOOK__.reactDevtoolsAgent
  .getComponentNameForHostInstance = () => "motion.div";

assert.equal(componentNameFor(motionElement), "Navbar");

console.log(
  "Component resolver skips framework wrappers and preserves user component names.",
);
