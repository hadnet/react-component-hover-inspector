import {
  INSPECT_REQUEST_EVENT,
  INSPECT_RESPONSE_EVENT,
  type InspectRequest,
  type InspectResponse,
  type OpenSourceResponse,
  type RuntimeMessage,
  type SourceLocation,
  type StateResponse,
} from "./messages";

const HIGHLIGHT_ID = "rchi-highlight";
const TOOLTIP_ID = "rchi-tooltip";
const INSTALLATION_KEY = "__RCHI_CONTENT_INSPECTOR_INSTALLED__";
const UNKNOWN_COMPONENT = "Unknown React component";
const TOOLTIP_GAP = 6;
const VIEWPORT_MARGIN = 8;
const COPY_FEEDBACK_DURATION = 1_200;
const OPEN_SOURCE_FEEDBACK_DURATION = 1_500;
const NAVIGATE_SHORTCUT_LABEL = "Ctrl+Shift+X";

let enabled = false;
let frameId: number | null = null;
let positionFrameId: number | null = null;
let requestId = 0;
let currentElement: Element | null = null;
let pinnedElement: Element | null = null;
let currentComponentName = UNKNOWN_COMPONENT;
let currentComponentIndex = 0;
let currentComponentCount = 0;
let currentSourceLocation: SourceLocation | null = null;
let copyFeedbackTimeout: number | null = null;
let sourceFeedbackTimeout: number | null = null;
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

  document.documentElement.append(highlight, tooltip);
}

function hideOverlay(): void {
  if (copyFeedbackTimeout !== null) {
    window.clearTimeout(copyFeedbackTimeout);
    copyFeedbackTimeout = null;
  }
  if (sourceFeedbackTimeout !== null) {
    window.clearTimeout(sourceFeedbackTimeout);
    sourceFeedbackTimeout = null;
  }
  highlight?.classList.remove("rchi-visible", "rchi-pinned");
  tooltip?.classList.remove("rchi-visible", "rchi-pinned");
  currentElement = null;
  pinnedElement = null;
  currentComponentName = UNKNOWN_COMPONENT;
  currentComponentIndex = 0;
  currentComponentCount = 0;
  currentSourceLocation = null;
}

function setPinned(element: Element | null): void {
  pinnedElement = element;
  highlight?.classList.toggle("rchi-pinned", element !== null);
  tooltip?.classList.toggle("rchi-pinned", element !== null);
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

function createClipboardIcon(): SVGSVGElement {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  const back = document.createElementNS(svgNamespace, "rect");
  const front = document.createElementNS(svgNamespace, "rect");

  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  back.setAttribute("x", "8");
  back.setAttribute("y", "3");
  back.setAttribute("width", "11");
  back.setAttribute("height", "13");
  back.setAttribute("rx", "2");
  front.setAttribute("x", "5");
  front.setAttribute("y", "8");
  front.setAttribute("width", "11");
  front.setAttribute("height", "13");
  front.setAttribute("rx", "2");
  icon.append(back, front);

  return icon;
}

function createSourceIcon(): SVGSVGElement {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  const path = document.createElementNS(svgNamespace, "path");
  const arrow = document.createElementNS(svgNamespace, "path");

  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  path.setAttribute("d", "M14 3h7v7M21 3l-9 9");
  arrow.setAttribute(
    "d",
    "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  );
  icon.append(path, arrow);

  return icon;
}

function createNavigationIcon(direction: "up" | "down"): SVGSVGElement {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  const path = document.createElementNS(svgNamespace, "path");

  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  path.setAttribute(
    "d",
    direction === "up" ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6",
  );
  icon.append(path);

  return icon;
}

function navigateComponent(offset: -1 | 1): void {
  if (currentElement === null || currentComponentCount < 2) {
    return;
  }

  const nextIndex = Math.min(
    Math.max(0, currentComponentIndex + offset),
    currentComponentCount - 1,
  );
  if (nextIndex !== currentComponentIndex) {
    requestComponentName(currentElement, nextIndex);
  }
}

function createNavigationButton(
  direction: "up" | "down",
  disabled: boolean,
): HTMLButtonElement {
  const button = document.createElement("button");
  const isUp = direction === "up";
  const label = isUp
    ? "Navigate up to parent component"
    : "Navigate down to child component";

  button.className = `rchi-action-button rchi-navigation-button rchi-navigation-${direction}-button`;
  button.type = "button";
  button.disabled = disabled;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(createNavigationIcon(direction));

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    navigateComponent(isUp ? 1 : -1);
  });

  return button;
}

function copyTextWithCommand(text: string): void {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  setImportantStyle(input, "position", "fixed");
  setImportantStyle(input, "left", "-9999px");
  setImportantStyle(input, "opacity", "0");
  document.documentElement.append(input);
  input.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command was rejected");
    }
  } finally {
    input.remove();
  }
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Content scripts can expose the Clipboard API while the page denies its
      // permission. The user-initiated copy command remains available.
    }
  }

  copyTextWithCommand(text);
}

function createCopyButton(componentName: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "rchi-action-button rchi-copy-button";
  button.type = "button";
  button.title = `Copy ${componentName}`;
  button.setAttribute("aria-label", `Copy component name ${componentName}`);
  button.append(createClipboardIcon());

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    void copyText(componentName)
      .then(() => {
        button.classList.add("rchi-copied");
        button.title = "Copied";
        button.setAttribute("aria-label", `Copied ${componentName}`);

        if (copyFeedbackTimeout !== null) {
          window.clearTimeout(copyFeedbackTimeout);
        }
        copyFeedbackTimeout = window.setTimeout(() => {
          button.classList.remove("rchi-copied");
          button.title = `Copy ${componentName}`;
          button.setAttribute(
            "aria-label",
            `Copy component name ${componentName}`,
          );
          copyFeedbackTimeout = null;
        }, COPY_FEEDBACK_DURATION);
      })
      .catch(() => {
        button.classList.add("rchi-copy-error");
        button.title = "Unable to copy";
      });
  });

  return button;
}

async function openSource(location: SourceLocation): Promise<void> {
  const response = await chrome.runtime.sendMessage<
    RuntimeMessage,
    OpenSourceResponse
  >({
    type: "OPEN_SOURCE",
    sourceLocation: location,
  });
  if (!response.ok) {
    throw new Error("Open source request failed");
  }
}

function createSourceButton(
  sourceLocation: SourceLocation | null,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "rchi-action-button rchi-source-button";
  button.type = "button";
  button.append(createSourceIcon());

  if (sourceLocation === null) {
    button.disabled = true;
    button.title =
      "JSX source unavailable. Install and configure code-inspector-plugin.";
    button.setAttribute("aria-label", "JSX source unavailable");
    return button;
  }

  button.title = `Open JSX source: ${sourceLocation.file}:${sourceLocation.line}`;
  button.setAttribute(
    "aria-label",
    `Open JSX source ${sourceLocation.file} line ${sourceLocation.line}`,
  );
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    button.classList.remove("rchi-source-error", "rchi-source-opened");

    void openSource(sourceLocation)
      .then(() => {
        button.classList.remove("rchi-source-error");
        button.classList.add("rchi-source-opened");
        button.title = "Opened JSX source";

        if (sourceFeedbackTimeout !== null) {
          window.clearTimeout(sourceFeedbackTimeout);
        }
        sourceFeedbackTimeout = window.setTimeout(() => {
          button.classList.remove("rchi-source-opened");
          button.title = `Open JSX source: ${sourceLocation.file}:${sourceLocation.line}`;
          sourceFeedbackTimeout = null;
        }, OPEN_SOURCE_FEEDBACK_DURATION);
      })
      .catch(() => {
        button.classList.remove("rchi-source-opened");
        button.classList.add("rchi-source-error");
        button.title =
          `Unable to open source. Is code-inspector-plugin running on port ${sourceLocation.serverPort}?`;
      });
  });

  return button;
}

function setTooltipContent(
  element: Element,
  componentName: string,
  componentIndex = currentComponentIndex,
  componentCount = currentComponentCount,
  sourceLocation = currentSourceLocation,
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
  const ancestry = document.createElement("span");
  const navigateUpButton = createNavigationButton(
    "up",
    componentCount < 2 || componentIndex >= componentCount - 1,
  );
  const navigateDownButton = createNavigationButton(
    "down",
    componentCount < 2 || componentIndex <= 0,
  );
  const sourceButton = createSourceButton(sourceLocation);
  const copyButton = createCopyButton(componentName);

  elementLabel.className = "rchi-element";
  contextLabel.className = "rchi-context";
  componentLabel.className = "rchi-component";
  separator.className = "rchi-separator";
  dimensions.className = "rchi-dimensions";
  ancestry.className = "rchi-ancestry";

  elementLabel.textContent = tagName;
  contextLabel.textContent = "(in";
  componentLabel.textContent = componentName;
  separator.textContent = ") |";
  dimensions.textContent = `${Math.round(rect.width)}px × ${Math.round(rect.height)}px`;
  ancestry.textContent =
    componentCount > 1 ? `${componentIndex + 1}/${componentCount}` : "";
  ancestry.title = `Next React owner: ${NAVIGATE_SHORTCUT_LABEL}`;

  const children: Node[] = [
    elementLabel,
    contextLabel,
    componentLabel,
    separator,
    dimensions,
  ];
  if (componentCount > 1) {
    children.push(ancestry);
  }
  children.push(
    navigateUpButton,
    navigateDownButton,
    sourceButton,
    copyButton,
  );
  tooltip.replaceChildren(...children);
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

function requestComponentName(element: Element, componentIndex = 0): void {
  const detail: InspectRequest = {
    requestId: ++requestId,
    componentIndex,
  };
  element.dispatchEvent(
    new CustomEvent(INSPECT_REQUEST_EVENT, {
      bubbles: false,
      detail: JSON.stringify(detail),
    }),
  );
}

function inspectElement(element: Element): void {
  currentElement = element;
  currentComponentName = UNKNOWN_COMPONENT;
  currentComponentIndex = 0;
  currentComponentCount = 0;
  currentSourceLocation = null;
  positionHighlight(element);
  setTooltipContent(element, currentComponentName);
  tooltip?.classList.add("rchi-visible");
  positionTooltip(element);
  requestComponentName(element);
}

function inspectAtPointer(): void {
  frameId = null;
  if (!enabled || pinnedElement !== null) {
    return;
  }

  ensureOverlay();
  const element = document.elementFromPoint(pointerX, pointerY);

  if (
    element === null ||
    element === highlight
  ) {
    hideOverlay();
    return;
  }

  if (element === tooltip || element.closest(`#${TOOLTIP_ID}`) !== null) {
    return;
  }

  inspectElement(element);
}

function onPointerMove(event: PointerEvent): void {
  pointerX = event.clientX;
  pointerY = event.clientY;

  if (pinnedElement === null && frameId === null) {
    frameId = requestAnimationFrame(inspectAtPointer);
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (
    !enabled ||
    currentElement === null ||
    event.key.toLowerCase() !== "x" ||
    !event.ctrlKey ||
    !event.shiftKey ||
    event.altKey ||
    event.metaKey
  ) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  navigateComponent(1);
}

function onDocumentClick(event: MouseEvent): void {
  if (!enabled || !(event.target instanceof Element)) {
    return;
  }

  const target = event.target;
  if (target === tooltip || target.closest(`#${TOOLTIP_ID}`) !== null) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  pointerX = event.clientX;
  pointerY = event.clientY;

  if (pinnedElement === target || pinnedElement?.contains(target) === true) {
    setPinned(null);
    inspectAtPointer();
    return;
  }

  ensureOverlay();
  setPinned(target);
  inspectElement(target);
}

function updatePinnedOverlay(): void {
  positionFrameId = null;
  if (!enabled || pinnedElement === null) {
    return;
  }

  if (!pinnedElement.isConnected) {
    hideOverlay();
    return;
  }

  positionHighlight(pinnedElement);
  setTooltipContent(pinnedElement, currentComponentName);
  positionTooltip(pinnedElement);
}

function onViewportChange(): void {
  if (pinnedElement !== null && positionFrameId === null) {
    positionFrameId = requestAnimationFrame(updatePinnedOverlay);
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
    typeof response.componentName !== "string" ||
    typeof response.componentIndex !== "number" ||
    typeof response.componentCount !== "number" ||
    !(
      response.sourceLocation === null ||
      (typeof response.sourceLocation === "object" &&
        typeof response.sourceLocation.file === "string" &&
        typeof response.sourceLocation.line === "number" &&
        typeof response.sourceLocation.column === "number" &&
        typeof response.sourceLocation.nodeName === "string" &&
        typeof response.sourceLocation.serverPort === "number")
    )
  ) {
    return;
  }

  currentComponentName = response.componentName;
  currentComponentIndex = response.componentIndex;
  currentComponentCount = response.componentCount;
  currentSourceLocation = response.sourceLocation;
  setTooltipContent(
    currentElement,
    response.componentName,
    response.componentIndex,
    response.componentCount,
    response.sourceLocation,
  );
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
    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("scroll", onViewportChange, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", onViewportChange, { passive: true });
  } else {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("scroll", onViewportChange, true);
    window.removeEventListener("resize", onViewportChange);
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    if (positionFrameId !== null) {
      cancelAnimationFrame(positionFrameId);
      positionFrameId = null;
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
