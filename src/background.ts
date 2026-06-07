import type { RuntimeMessage, StateResponse } from "./messages";

const STORAGE_PREFIX = "enabled:";
const ENABLED_BADGE_COLOR = "#7c3aed";
const SUPPORTED_HOSTS = new Set(["localhost", "127.0.0.1"]);

function storageKey(tabId: number): string {
  return `${STORAGE_PREFIX}${tabId}`;
}

async function getEnabled(tabId: number): Promise<boolean> {
  const key = storageKey(tabId);
  const result = await chrome.storage.session.get(key);
  return result[key] === true;
}

async function setEnabled(tabId: number, enabled: boolean): Promise<void> {
  await chrome.storage.session.set({ [storageKey(tabId)]: enabled });
}

async function updateBadge(tabId: number, enabled: boolean): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text: enabled ? "ON" : "" }),
    chrome.action.setBadgeBackgroundColor({
      tabId,
      color: ENABLED_BADGE_COLOR,
    }),
  ]);
}

function isSupportedUrl(url: string | undefined): boolean {
  if (url === undefined) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return (
      (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
      SUPPORTED_HOSTS.has(parsedUrl.hostname)
    );
  } catch {
    return false;
  }
}

async function injectInspector(tabId: number): Promise<void> {
  await chrome.scripting.insertCSS({
    target: { tabId },
    files: ["inspector.css"],
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["page-inspector.js"],
    world: "MAIN",
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
    world: "ISOLATED",
  });
}

async function notifyOrInject(
  tabId: number,
  enabled: boolean,
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "SET_ENABLED",
      enabled,
    } satisfies RuntimeMessage);
  } catch {
    if (!enabled) {
      return;
    }

    await injectInspector(tabId);
    await chrome.tabs.sendMessage(tabId, {
      type: "SET_ENABLED",
      enabled: true,
    } satisfies RuntimeMessage);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.action.setBadgeBackgroundColor({ color: ENABLED_BADGE_COLOR });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined || !isSupportedUrl(tab.url)) {
    return;
  }

  void (async () => {
    try {
      const enabled = !(await getEnabled(tab.id!));
      await setEnabled(tab.id!, enabled);
      await updateBadge(tab.id!, enabled);
      await notifyOrInject(tab.id!, enabled);
    } catch {
      await setEnabled(tab.id!, false);
      await updateBadge(tab.id!, false);
    }
  })();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void getEnabled(tabId).then((enabled) => updateBadge(tabId, enabled));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(storageKey(tabId));
});

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender,
    sendResponse: (response: StateResponse) => void,
  ) => {
    if (message.type !== "GET_STATE" || sender.tab?.id === undefined) {
      return false;
    }

    void getEnabled(sender.tab.id).then((enabled) => sendResponse({ enabled }));
    return true;
  },
);
