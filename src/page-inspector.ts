import {
  INSPECT_REQUEST_EVENT,
  INSPECT_RESPONSE_EVENT,
  type InspectRequest,
  type InspectResponse,
  type HighlightBounds,
  type SourceLocation,
} from "./messages";

interface FiberLike {
  child?: FiberLike | null;
  sibling?: FiberLike | null;
  return?: FiberLike | null;
  stateNode?: unknown;
  type?: unknown;
  elementType?: unknown;
  _debugOwner?: FiberLike | null;
  _debugInfo?: unknown;
  _debugSource?: unknown;
  _debugStack?: unknown;
}

interface NamedType {
  displayName?: unknown;
  name?: unknown;
  type?: unknown;
  render?: unknown;
}

interface ReactDevToolsAgent {
  getComponentNameForHostInstance?: (element: Element) => unknown;
}

interface ReactDevToolsHook {
  reactDevtoolsAgent?: ReactDevToolsAgent | null;
}

interface ComponentMatch {
  name: string;
  fiber: FiberLike | null;
}

const FIBER_PROPERTY_PREFIXES = [
  "__reactFiber$",
  "__reactInternalInstance$",
] as const;
const PROPS_PROPERTY_PREFIX = "__reactProps$";
const CODE_INSPECTOR_PATH = "data-insp-path";
const DEFAULT_CODE_INSPECTOR_PORT = 5_678;
const UNKNOWN_COMPONENT = "Unknown React component";
const INSTALLATION_KEY = "__RCHI_PAGE_INSPECTOR_INSTALLED__";
const UNHELPFUL_NAMES = new Set([
  "",
  "anonymous",
  "component",
  "unknown",
  "fragment",
  "strictmode",
  "suspense",
]);
const FRAMEWORK_INTERNAL_NAMES = new Set([
  "AppRouter",
  "DevRootHTTPAccessFallbackBoundary",
  "ErrorBoundary",
  "HTTPAccessFallbackBoundary",
  "HotReload",
  "InnerLayoutRouter",
  "InnerScrollAndFocusHandler",
  "LayoutRouter",
  "LinkComponent",
  "LoadingBoundary",
  "OuterLayoutRouter",
  "RedirectBoundary",
  "RedirectErrorBoundary",
  "RenderFromTemplateContext",
  "ScrollAndFocusHandler",
  "SegmentBoundaryTriggerNode",
  "SegmentStateProvider",
  "SegmentTrieNode",
  "SegmentViewNode",
  "SegmentViewStateNode",
]);
// Distinctive implementation-layer names used by Radix Primitives. Avoid
// generic exports such as Portal or Arrow because user components often share
// those names.
const RADIX_INTERNAL_NAMES = new Set([
  "AccordionImpl",
  "AccordionImplMultiple",
  "AccordionImplSingle",
  "CheckboxBubbleInput",
  "CheckboxTrigger",
  "CollapsibleContentImpl",
  "CollectionInit",
  "CollectionItemSlot",
  "CollectionProvider",
  "CollectionProviderImpl",
  "CollectionSlot",
  "DialogContentImpl",
  "DialogContentModal",
  "DialogContentNonModal",
  "DialogOverlayImpl",
  "DismissableLayer",
  "DismissableLayerBranch",
  "FocusScope",
  "FormMessageImpl",
  "HoverCardContentImpl",
  "MenuAnchor",
  "MenuContentImpl",
  "MenuItemImpl",
  "MenuRootContentModal",
  "MenuRootContentNonModal",
  "NavigationMenuContentImpl",
  "NavigationMenuIndicatorImpl",
  "NavigationMenuViewportImpl",
  "PopoverContentImpl",
  "PopoverContentModal",
  "PopoverContentNonModal",
  "Popper",
  "PopperAnchor",
  "PopperArrow",
  "PopperContent",
  "Presence",
  "RadioBubbleInput",
  "RadioGroupItemBubbleInput",
  "RadioGroupItemTrigger",
  "RadioTrigger",
  "RovingFocusGroupImpl",
  "ScrollAreaCornerImpl",
  "ScrollAreaScrollbarImpl",
  "ScrollAreaThumbImpl",
  "ScrollAreaViewportStyle",
  "SelectBubbleInput",
  "SelectContentFragment",
  "SelectContentImpl",
  "SelectItemAlignedPosition",
  "SelectPopperPosition",
  "SelectScrollButtonImpl",
  "SliderBubbleInput",
  "SliderHorizontal",
  "SliderImpl",
  "SliderThumbTrigger",
  "SliderVertical",
  "SwitchBubbleInput",
  "SwitchTrigger",
  "ToastImpl",
  "ToggleGroupImpl",
  "ToggleGroupImplMultiple",
  "ToggleGroupImplSingle",
  "ToggleGroupItemImpl",
  "TooltipContentHoverable",
  "TooltipContentImpl",
  "ViewportContentMounter",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ownPropertyWithPrefix(
  value: object,
  prefixes: readonly string[],
): unknown {
  const key = Object.getOwnPropertyNames(value).find((propertyName) =>
    prefixes.some((prefix) => propertyName.startsWith(prefix)),
  );

  return key === undefined
    ? undefined
    : (value as Record<string, unknown>)[key];
}

function findFiber(element: Element): FiberLike | null {
  let current: Element | null = element;

  while (current !== null) {
    const fiber = ownPropertyWithPrefix(current, FIBER_PROPERTY_PREFIXES);
    if (isRecord(fiber)) {
      return fiber as FiberLike;
    }

    // Reading this property ensures compatibility with builds that expose only
    // the React props expando. Props alone do not provide an owner Fiber.
    ownPropertyWithPrefix(current, [PROPS_PROPERTY_PREFIX]);
    current = current.parentElement;
  }

  return null;
}

function findCodeInspectorPort(): number {
  const inspector = document.querySelector("code-inspector-component") as
    | (Element & { port?: unknown })
    | null;
  return typeof inspector?.port === "number" && inspector.port > 0
    ? inspector.port
    : DEFAULT_CODE_INSPECTOR_PORT;
}

function parseSourceLocation(value: unknown): SourceLocation | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^(.*):(\d+):(\d+):([^:]+)$/);
  if (match === null) {
    return null;
  }

  const [, file, line, column, nodeName] = match;
  if (
    file === undefined ||
    file.length === 0 ||
    line === undefined ||
    column === undefined ||
    nodeName === undefined
  ) {
    return null;
  }

  return {
    file,
    line: Number(line),
    column: Number(column),
    nodeName,
    serverPort: findCodeInspectorPort(),
  };
}

function findSourceLocation(element: Element): SourceLocation | null {
  let current: Element | null = element;

  while (current !== null) {
    const pageValue = (current as Element & {
      [CODE_INSPECTOR_PATH]?: unknown;
    })[CODE_INSPECTOR_PATH];
    const sourceLocation =
      parseSourceLocation(current.getAttribute(CODE_INSPECTOR_PATH)) ??
      parseSourceLocation(pageValue);
    if (sourceLocation !== null) {
      return sourceLocation;
    }
    current = current.parentElement;
  }

  return null;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const name = value.trim();
  if (
    UNHELPFUL_NAMES.has(name.toLowerCase()) ||
    FRAMEWORK_INTERNAL_NAMES.has(name) ||
    RADIX_INTERNAL_NAMES.has(name) ||
    /Collection(?:Provider(?:Impl)?|Init|Slot|ItemSlot)$/.test(name) ||
    name.includes(".") ||
    name.startsWith("_") ||
    !/^[A-Z]/.test(name)
  ) {
    return null;
  }

  return name;
}

function containsNodeModules(value: unknown): boolean {
  if (typeof value === "string") {
    return /(^|[/\\])node_modules([/\\]|$)/.test(value);
  }

  if (value instanceof Error) {
    return containsNodeModules(value.stack);
  }

  if (!isRecord(value)) {
    return false;
  }

  return (
    containsNodeModules(value.fileName) ||
    containsNodeModules(value.filename) ||
    containsNodeModules(value.source) ||
    containsNodeModules(value.stack)
  );
}

function isNodeModulesFiber(fiber: FiberLike): boolean {
  return (
    containsNodeModules(fiber._debugSource) ||
    containsNodeModules(fiber._debugStack)
  );
}

function nameFromType(type: unknown, seen = new Set<unknown>()): string | null {
  if ((typeof type !== "function" && !isRecord(type)) || seen.has(type)) {
    return null;
  }

  seen.add(type);
  const namedType = type as NamedType;

  if (typeof namedType.displayName === "string") {
    // An explicit displayName describes the wrapper itself. If it is an
    // intrinsic-style library wrapper such as "motion.div" or "styled.div",
    // reject the whole wrapper rather than exposing its internal render
    // function (for example "MotionComponent").
    return cleanName(namedType.displayName);
  }

  const functionName = cleanName(namedType.name);
  if (functionName !== null) {
    return functionName;
  }

  return (
    nameFromType(namedType.type, seen) ?? nameFromType(namedType.render, seen)
  );
}

function nameFromReactDevTools(element: Element): string | null {
  const inspectorWindow = window as Window & {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevToolsHook;
  };
  const resolver =
    inspectorWindow.__REACT_DEVTOOLS_GLOBAL_HOOK__?.reactDevtoolsAgent
      ?.getComponentNameForHostInstance;

  if (typeof resolver !== "function") {
    return null;
  }

  try {
    return cleanName(
      resolver.call(
        inspectorWindow.__REACT_DEVTOOLS_GLOBAL_HOOK__?.reactDevtoolsAgent,
        element,
      ),
    );
  } catch {
    return null;
  }
}

function namesFromDebugInfo(fiber: FiberLike): string[] {
  if (!Array.isArray(fiber._debugInfo)) {
    return [];
  }

  const names: string[] = [];
  // React stores Server Component ancestry from outermost to innermost.
  // React DevTools models these entries as virtual Fibers, so the last named
  // entry is the component nearest to this host element.
  for (let index = fiber._debugInfo.length - 1; index >= 0; index -= 1) {
    const entry = fiber._debugInfo[index];
    if (!isRecord(entry) || "awaited" in entry) {
      continue;
    }

    const name = cleanName(entry.name);
    if (name !== null && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}

function nameFromFiberType(fiber: FiberLike): string | null {
  if (isNodeModulesFiber(fiber)) {
    return null;
  }

  return nameFromType(fiber.type) ?? nameFromType(fiber.elementType);
}

function addComponentMatch(
  matches: ComponentMatch[],
  name: string | null,
  fiber: FiberLike | null,
): void {
  if (name !== null && !matches.some((match) => match.name === name)) {
    matches.push({ name, fiber });
  }
}

function addFiberComponentMatches(
  matches: ComponentMatch[],
  fiber: FiberLike,
): void {
  if (isNodeModulesFiber(fiber)) {
    return;
  }

  for (const name of namesFromDebugInfo(fiber)) {
    addComponentMatch(matches, name, fiber);
  }
  addComponentMatch(matches, nameFromFiberType(fiber), fiber);
}

function findComponentMatches(element: Element): ComponentMatch[] {
  const startingFiber = findFiber(element);
  if (startingFiber === null) {
    const devToolsName = nameFromReactDevTools(element);
    return devToolsName === null
      ? []
      : [{ name: devToolsName, fiber: null }];
  }

  const matches: ComponentMatch[] = [];
  const visited = new Set<FiberLike>();
  let fiber: FiberLike | null | undefined = startingFiber;

  while (fiber !== null && fiber !== undefined && !visited.has(fiber)) {
    visited.add(fiber);

    addFiberComponentMatches(matches, fiber);

    fiber = fiber.return;
  }

  // Older development builds can expose an owner even when return pointers are
  // unavailable on the discovered internal instance.
  fiber = startingFiber._debugOwner;
  while (fiber !== null && fiber !== undefined && !visited.has(fiber)) {
    visited.add(fiber);
    addFiberComponentMatches(matches, fiber);
    fiber = fiber._debugOwner;
  }

  if (matches.length === 0) {
    addComponentMatch(
      matches,
      nameFromReactDevTools(element),
      startingFiber,
    );
  }

  return matches;
}

function collectHostElements(
  fiber: FiberLike,
  elements: Element[],
  visited: Set<FiberLike>,
): void {
  if (visited.has(fiber)) {
    return;
  }
  visited.add(fiber);

  if (fiber.stateNode instanceof Element) {
    elements.push(fiber.stateNode);
    return;
  }

  let child = fiber.child;
  while (child !== null && child !== undefined) {
    collectHostElements(child, elements, visited);
    child = child.sibling;
  }
}

function boundsForMatch(
  match: ComponentMatch | undefined,
  fallbackElement: Element,
): HighlightBounds {
  const elements: Element[] = [];
  if (match?.fiber !== null && match?.fiber !== undefined) {
    collectHostElements(match.fiber, elements, new Set());
  }
  if (elements.length === 0) {
    elements.push(fallbackElement);
  }

  const rects = elements.map((element) => element.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

function onInspectRequest(event: Event): void {
  if (!(event instanceof CustomEvent) || !(event.target instanceof Element)) {
    return;
  }

  if (typeof event.detail !== "string") {
    return;
  }

  let request: InspectRequest;
  try {
    request = JSON.parse(event.detail) as InspectRequest;
  } catch {
    return;
  }

  if (typeof request?.requestId !== "number") {
    return;
  }

  const componentMatches = findComponentMatches(event.target);
  const requestedIndex =
    typeof request.componentIndex === "number" ? request.componentIndex : 0;
  const componentIndex = Math.min(
    Math.max(0, requestedIndex),
    Math.max(0, componentMatches.length - 1),
  );
  const componentMatch = componentMatches[componentIndex];
  const response: InspectResponse = {
    requestId: request.requestId,
    componentName: componentMatch?.name ?? UNKNOWN_COMPONENT,
    componentIndex,
    componentCount: componentMatches.length,
    highlightBounds: boundsForMatch(componentMatch, event.target),
    sourceLocation: findSourceLocation(event.target),
  };

  document.dispatchEvent(
    new CustomEvent(INSPECT_RESPONSE_EVENT, {
      detail: JSON.stringify(response),
    }),
  );
}

const inspectorWindow = window as Window & {
  __RCHI_PAGE_INSPECTOR_INSTALLED__?: boolean;
};
if (inspectorWindow[INSTALLATION_KEY] !== true) {
  inspectorWindow[INSTALLATION_KEY] = true;
  document.addEventListener(INSPECT_REQUEST_EVENT, onInspectRequest, true);
}
