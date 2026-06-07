import {
  INSPECT_REQUEST_EVENT,
  INSPECT_RESPONSE_EVENT,
  type InspectRequest,
  type InspectResponse,
  type RuntimeMessage,
  type StateResponse,
} from "./messages";

const HIGHLIGHT_ID = "rchi-highlight";
const TOOLTIP_ID = "rchi-tooltip";
const INSTALLATION_KEY = "__RCHI_CONTENT_INSPECTOR_INSTALLED__";
const UNKNOWN_COMPONENT = "Unknown React component";
const TOOLTIP_GAP = 6;
const VIEWPORT_MARGIN = 8;

let enabled = false;
let frameId: number | null = null;
let requestId = 0;
let currentElement: Element | null = null;
let pointerX = 0;
let pointerY = 0;
let highlight: HTMLDivElement | null = null;
let tooltip: HTMLDivElement | null = null;

function ensureOverlay(): void {
  if (highlight?.isConnected && tooltip?.isConnected) {
    return;
  }

  highlight = document.createElement("div");
  highlight.id = HIGHLIGHT_ID;
  highlight.setAttribute("aria-hidden", "true");

  tooltip = document.createElement("div");
  tooltip.id = TOOLTIP_ID;
  tooltip.setAttribute("aria-hidden", "true");

  document.documentElement.append(highlight, tooltip);
}

function hideOverlay(): void {
  highlight?.classList.remove("rchi-visible");
  tooltip?.classList.remove("rchi-visible");
  currentElement = null;
}

function setImportantStyle(
  element: HTMLElement,
  property: string,
  value: string,
): void {
  element.style.setProperty(property, value, "important");
}

function positionHighlight(element: Element): void {
  if (highlight === null) {
    return;
  }

  const rect = element.getBoundingClientRect();
  setImportantStyle(highlight, "left", `${rect.left}px`);
  setImportantStyle(highlight, "top", `${rect.top}px`);
  setImportantStyle(highlight, "width", `${rect.width}px`);
  setImportantStyle(highlight, "height", `${rect.height}px`);
  highlight.classList.add("rchi-visible");
}

function setTooltipContent(
  element: Element,
  componentName: string,
): void {
  if (tooltip === null) {
    return;
  }

  const rect = element.getBoundingClientRect();
  const tagName = element.tagName.toLowerCase();
  const elementLabel = document.createElement("span");
  const contextLabel = document.createElement("span");
  const componentLabel = document.createElement("span");
  const separator = document.createElement("span");
  const dimensions = document.createElement("span");

  elementLabel.className = "rchi-element";
  contextLabel.className = "rchi-context";
  componentLabel.className = "rchi-component";
  separator.className = "rchi-separator";
  dimensions.className = "rchi-dimensions";

  elementLabel.textContent = tagName;
  contextLabel.textContent = "(in";
  componentLabel.textContent = componentName;
  separator.textContent = ") |";
  dimensions.textContent = `${Math.round(rect.width)}px × ${Math.round(rect.height)}px`;

  tooltip.replaceChildren(
    elementLabel,
    contextLabel,
    componentLabel,
    separator,
    dimensions,
  );
}

function positionTooltip(element: Element): void {
  if (tooltip === null) {
    return;
  }

  const elementRect = element.getBoundingClientRect();
  const rect = tooltip.getBoundingClientRect();
  let left = elementRect.left;
  let top = elementRect.bottom + TOOLTIP_GAP;

  if (left + rect.width > window.innerWidth - VIEWPORT_MARGIN) {
    left = window.innerWidth - rect.width - VIEWPORT_MARGIN;
  }
  if (top + rect.height > window.innerHeight - VIEWPORT_MARGIN) {
    top = elementRect.top - rect.height - TOOLTIP_GAP;
  }

  setImportantStyle(
    tooltip,
    "left",
    `${Math.max(VIEWPORT_MARGIN, left)}px`,
  );
  setImportantStyle(tooltip, "top", `${Math.max(VIEWPORT_MARGIN, top)}px`);
}

function requestComponentName(element: Element): void {
  const detail: InspectRequest = { requestId: ++requestId };
  element.dispatchEvent(
    new CustomEvent(INSPECT_REQUEST_EVENT, {
      bubbles: false,
      detail: JSON.stringify(detail),
    }),
  );
}

function inspectAtPointer(): void {
  frameId = null;
  if (!enabled) {
    return;
  }

  ensureOverlay();
  const element = document.elementFromPoint(pointerX, pointerY);

  if (
    element === null ||
    element === highlight ||
    element === tooltip ||
    element.closest(`#${HIGHLIGHT_ID}, #${TOOLTIP_ID}`) !== null
  ) {
    hideOverlay();
    return;
  }

  currentElement = element;
  positionHighlight(element);
  setTooltipContent(element, UNKNOWN_COMPONENT);
  tooltip?.classList.add("rchi-visible");
  positionTooltip(element);
  requestComponentName(element);
}

function onPointerMove(event: PointerEvent): void {
  pointerX = event.clientX;
  pointerY = event.clientY;

  if (frameId === null) {
    frameId = requestAnimationFrame(inspectAtPointer);
  }
}

function onInspectResponse(event: Event): void {
  if (
    !enabled ||
    !(event instanceof CustomEvent) ||
    tooltip === null ||
    currentElement === null
  ) {
    return;
  }

  if (typeof event.detail !== "string") {
    return;
  }

  let response: InspectResponse;
  try {
    response = JSON.parse(event.detail) as InspectResponse;
  } catch {
    return;
  }

  if (
    typeof response?.requestId !== "number" ||
    response.requestId !== requestId ||
    typeof response.componentName !== "string"
  ) {
    return;
  }

  setTooltipContent(currentElement, response.componentName);
  positionTooltip(currentElement);
}

function setEnabled(nextEnabled: boolean): void {
  if (enabled === nextEnabled) {
    return;
  }

  enabled = nextEnabled;
  if (enabled) {
    ensureOverlay();
    document.addEventListener("pointermove", onPointerMove, { passive: true });
  } else {
    document.removeEventListener("pointermove", onPointerMove);
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    hideOverlay();
  }
}

const contentWindow = window as Window & {
  __RCHI_CONTENT_INSPECTOR_INSTALLED__?: boolean;
};
if (contentWindow[INSTALLATION_KEY] !== true) {
  contentWindow[INSTALLATION_KEY] = true;

  document.addEventListener(INSPECT_RESPONSE_EVENT, onInspectResponse);
  window.addEventListener("blur", hideOverlay);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hideOverlay();
    }
  });

  chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
    if (message.type === "SET_ENABLED") {
      setEnabled(message.enabled);
    }
  });

  void chrome.runtime
    .sendMessage<RuntimeMessage, StateResponse>({ type: "GET_STATE" })
    .then((response) => setEnabled(response.enabled))
    .catch(() => {
      // A toolbar click can reinject the inspector if the extension was
      // reloaded while this page remained open.
    });
}
