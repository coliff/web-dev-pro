const ext = globalThis.browser ?? globalThis.chrome;

let lastStoragePayload = null;
let lastCssOverviewPayload = null;
let lastNetworkPayload = null;
let lastRenderedNetworkItems = [];
let currentStorageKind = "cookie";
let currentNetworkSubtab = "doc";
let currentNetworkSort = "time";
let currentNetworkFilter = "all";
let currentNetworkShowImages = false;
let hideNetworkInfoAlert = false;
let currentTab = "seo";
const popupTabKey = "popup.lastActiveTab";
const cssSubtabKey = "popup.lastCssSubtab";
const a11ySubtabKey = "popup.lastA11ySubtab";
const renderingSubtabKey = "popup.lastRenderingSubtab";
const networkSubtabKey = "popup.lastNetworkSubtab";
const networkSortKey = "popup.network.sort";
const networkFilterKey = "popup.network.filter";
const networkShowImagesKey = "popup.network.showImages";
const networkInfoAlertKey = "popup.network.infoAlertDismissed";
const moreToolsAlertKey = "popup.moreToolsAlertDismissed";
const settingsSubtabKey = "popup.lastSettingsSubtab";
const themePreferenceKey = "popup.themePreference";
const legacyDarkModeKey = "popup.darkModeEnabled";
const a11yAriaInspectKey = "popup.a11y.ariaInspectEnabled";
const a11yAltOverlayKey = "popup.a11y.altOverlayEnabled";
const validTabs = new Set(["a11y", "css", "network", "perf", "rendering", "seo", "settings", "storage"]);
const validThemePreferences = new Set(["system", "dark", "light"]);
const popupStoragePrefix = "popup.";
const mockNetworkDebugKey = "popup.debug.mockNetwork";
let activeThemePreference = "dark";
const systemThemeMediaQuery = globalThis.matchMedia
  ? globalThis.matchMedia("(prefers-color-scheme: dark)")
  : null;

function isIpadExtensionPopupContext() {
  const ua = String(navigator.userAgent || "");
  const isIpadLike = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && Number(navigator.maxTouchPoints) > 1);
  if (!isIpadLike) {
    return false;
  }
  const protocol = String(globalThis.location?.protocol || "");
  return protocol === "safari-web-extension:"
    || protocol === "chrome-extension:"
    || protocol === "moz-extension:"
    || protocol === "ms-browser-extension:";
}

function isMockNetworkModeEnabled() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || "");
    const queryValue = params.get("mockNetwork");
    if (queryValue === "1" || queryValue === "true") {
      return true;
    }
    if (queryValue === "0" || queryValue === "false") {
      return false;
    }
  } catch {
    // Ignore URL parsing failures.
  }

  try {
    const stored = globalThis.localStorage?.getItem(mockNetworkDebugKey);
    return stored === "true";
  } catch {
    return false;
  }
}

function getMockNetworkSnapshot() {
  return {
    items: [
      {
        type: "doc",
        name: "index.html",
        url: "https://demo.local/index.html",
        mimeType: "text/html; charset=utf-8",
        initiatorType: "navigation",
        sizeKb: 18.7,
        transferSizeKb: 20.2,
        encodedBodySizeKb: 18.7,
        decodedBodySizeKb: 65.4,
        timeMs: 6.2,
        durationMs: 24.5,
        nextHopProtocol: "h3",
        isThirdParty: false,
      },
      {
        type: "css",
        name: "app.css",
        url: "https://demo.local/assets/app.css",
        mimeType: "text/css",
        initiatorType: "link",
        sizeKb: 42.3,
        transferSizeKb: 12.8,
        encodedBodySizeKb: 11.9,
        decodedBodySizeKb: 42.3,
        timeMs: 11.4,
        durationMs: 29.1,
        nextHopProtocol: "h3",
        isThirdParty: false,
      },
      {
        type: "js",
        name: "runtime.mjs",
        url: "https://demo.local/assets/runtime.mjs",
        mimeType: "application/javascript",
        initiatorType: "script",
        sizeKb: 88.6,
        transferSizeKb: 30.4,
        encodedBodySizeKb: 28.1,
        decodedBodySizeKb: 88.6,
        timeMs: 14.3,
        durationMs: 36.9,
        nextHopProtocol: "h2",
        scriptAsync: true,
        scriptDefer: false,
        isThirdParty: false,
      },
      {
        type: "font",
        name: "inter-v12-latin.woff2",
        url: "https://demo.local/fonts/inter-v12-latin.woff2",
        mimeType: "font/woff2",
        initiatorType: "css",
        sizeKb: 98.3,
        transferSizeKb: 41.7,
        encodedBodySizeKb: 40.9,
        decodedBodySizeKb: 98.3,
        timeMs: 15.7,
        durationMs: 44.2,
        nextHopProtocol: "h3",
        isThirdParty: false,
      },
      {
        type: "images",
        name: "favicon.svg",
        url: "https://demo.local/favicon.svg",
        mimeType: "image/svg+xml",
        initiatorType: "link",
        sizeKb: 2.8,
        transferSizeKb: 1.4,
        encodedBodySizeKb: 1.3,
        decodedBodySizeKb: 2.8,
        timeMs: 4.1,
        durationMs: 10.5,
        nextHopProtocol: "h3",
        imageLoading: "eager",
        imageFetchPriority: "high",
        imageDecoding: "sync",
        isThirdParty: false,
      },
      {
        type: "images",
        name: "hero.webp",
        url: "https://images.example-cdn.com/hero.webp",
        mimeType: "image/webp",
        initiatorType: "img",
        sizeKb: 224.9,
        transferSizeKb: 110.7,
        encodedBodySizeKb: 109.8,
        decodedBodySizeKb: 224.9,
        timeMs: 33.9,
        durationMs: 86.4,
        nextHopProtocol: "h2",
        imageLoading: "lazy",
        imageFetchPriority: "auto",
        imageDecoding: "async",
        isThirdParty: true,
      },
      {
        type: "xhr-fetch",
        name: "api/products?page=1",
        url: "https://api.demo.local/products?page=1",
        mimeType: "application/json",
        initiatorType: "fetch",
        sizeKb: 54.2,
        transferSizeKb: 20.1,
        encodedBodySizeKb: 19.3,
        decodedBodySizeKb: 54.2,
        timeMs: 24.7,
        durationMs: 58.3,
        nextHopProtocol: "h3",
        isThirdParty: false,
      },
      {
        type: "other",
        name: "tracking-pixel",
        url: "https://analytics.example.com/pixel?id=123",
        mimeType: "application/octet-stream",
        initiatorType: "beacon",
        sizeKb: 0.7,
        transferSizeKb: 0.7,
        encodedBodySizeKb: 0.7,
        decodedBodySizeKb: 0.7,
        timeMs: 41.1,
        durationMs: 72.9,
        nextHopProtocol: "h2",
        isThirdParty: true,
      },
    ],
  };
}

async function getActiveTabId() {
  if (ext.tabs.query.length === 1) {
    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0]?.id;
  }

  return await new Promise((resolve) => {
    ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs?.[0]?.id);
    });
  });
}

async function getActiveTabUrl() {
  if (ext.tabs.query.length === 1) {
    const tabs = await ext.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0]?.url ?? "";
  }
  return await new Promise((resolve) => {
    ext.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs?.[0]?.url ?? "");
    });
  });
}

function openInNewTab(url) {
  if (ext.tabs?.create) {
    ext.tabs.create({ url });
  } else {
    globalThis.open(url, "_blank", "noopener");
  }
}

async function openMoreTools(tool) {
  const pageUrl = await getActiveTabUrl();
  if (!pageUrl || pageUrl.startsWith("chrome:") || pageUrl.startsWith("edge:") || pageUrl.startsWith("about:")) {
    return;
  }
  const encoded = encodeURIComponent(pageUrl);
  if (tool === "lighthouse") {
    openInNewTab(
      `https://googlechrome.github.io/lighthouse/viewer/?psiurl=${encoded}&strategy=desktop&category=performance&category=accessibility&category=best-practices&locale=en-GB&utm_source=lh-chrome-ext`
    );
  } else if (tool === "nu-validator") {
    openInNewTab(`https://validator.w3.org/nu/?doc=${encoded}`);
  } else if (tool === "security-headers") {
    openInNewTab(`https://securityheaders.com/?q=${encoded}&hide=on&followRedirects=on`);
  } else if (tool === "pagespeed") {
    openInNewTab(`https://pagespeed.web.dev/analysis?url=${encoded}&form_factor=mobile`);
  } else if (tool === "mozilla-observatory") {
    const host = new URL(pageUrl).hostname;
    openInNewTab(`https://developer.mozilla.org/en-US/observatory/analyze?host=${encodeURIComponent(host)}`);
  }
}

async function sendToActiveTab(message) {
  const tabId = await getActiveTabId();

  if (!tabId) {
    throw new Error("No active tab found.");
  }

  if (ext.tabs.sendMessage.length === 2) {
    return await ext.tabs.sendMessage(tabId, message);
  }

  return await new Promise((resolve, reject) => {
    ext.tabs.sendMessage(tabId, message, (response) => {
      const err = ext.runtime?.lastError;
      if (err) {
        reject(new Error(err.message || "Request failed."));
        return;
      }
      resolve(response);
    });
  });
}

async function loadStoredValue(key) {
  try {
    const localValue = globalThis.localStorage?.getItem(key);
    if (localValue) {
      return localValue;
    }
  } catch {
    // Ignore localStorage access failures and continue to extension storage.
  }

  if (!ext.storage?.local) {
    return null;
  }

  try {
    if (typeof ext.storage.local.get === "function" && ext.storage.local.get.length <= 1) {
      const result = await ext.storage.local.get(key);
      return result?.[key] ?? null;
    }

    return await new Promise((resolve) => {
      ext.storage.local.get([key], (result) => {
        resolve(result?.[key] ?? null);
      });
    });
  } catch {
    return null;
  }
}

async function saveStoredValue(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Ignore localStorage access failures and continue to extension storage.
  }

  if (!ext.storage?.local) {
    return;
  }

  const payload = { [key]: value };
  try {
    if (typeof ext.storage.local.set === "function" && ext.storage.local.set.length <= 1) {
      await ext.storage.local.set(payload);
      return;
    }

    await new Promise((resolve) => {
      ext.storage.local.set(payload, () => resolve());
    });
  } catch {
    // localStorage fallback already handled above.
  }
}

async function removeStoredValues(keys) {
  if (!Array.isArray(keys) || !keys.length) {
    return;
  }

  try {
    if (globalThis.localStorage) {
      for (const key of keys) {
        globalThis.localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore localStorage access failures and continue to extension storage.
  }

  if (!ext.storage?.local) {
    return;
  }

  try {
    if (typeof ext.storage.local.remove === "function" && ext.storage.local.remove.length <= 1) {
      await ext.storage.local.remove(keys);
      return;
    }

    await new Promise((resolve) => {
      ext.storage.local.remove(keys, () => resolve());
    });
  } catch {
    // localStorage fallback already handled above.
  }
}

function listPopupSettingKeys() {
  const localKeys = [];
  try {
    if (globalThis.localStorage) {
      for (let i = 0; i < globalThis.localStorage.length; i += 1) {
        const key = globalThis.localStorage.key(i);
        if (key && key.startsWith(popupStoragePrefix)) {
          localKeys.push(key);
        }
      }
    }
  } catch {
    // Ignore localStorage access failures.
  }

  return [...new Set([
    ...localKeys,
    popupTabKey,
    cssSubtabKey,
    a11ySubtabKey,
    renderingSubtabKey,
    networkSubtabKey,
    networkSortKey,
    networkFilterKey,
    networkShowImagesKey,
    settingsSubtabKey,
    themePreferenceKey,
    legacyDarkModeKey,
    a11yAriaInspectKey,
    a11yAltOverlayKey,
    "popup.rendering.prefersColorScheme",
    "popup.rendering.prefersReducedMotion",
    "popup.rendering.prefersContrast",
    "popup.rendering.mediaType",
    "popup.rendering.disableAvif",
    "popup.rendering.disableWebp",
    networkInfoAlertKey,
    moreToolsAlertKey,
  ])];
}

async function loadSavedTab() {
  return await loadStoredValue(popupTabKey);
}

async function saveTab(tabName) {
  await saveStoredValue(popupTabKey, tabName);
}

async function loadCssSubtab() {
  const stored = await loadStoredValue(cssSubtabKey);
  return stored === "overview" ? "overview" : "quick-tools";
}

async function saveCssSubtab(subtab) {
  await saveStoredValue(cssSubtabKey, subtab === "overview" ? "overview" : "quick-tools");
}

function switchCssSubtab(subtabName) {
  const isOverview = subtabName === "overview";
  document.querySelectorAll("[data-css-subtab]").forEach((btn) => {
    const active = (btn instanceof HTMLElement && btn.dataset.cssSubtab === subtabName);
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
    if (active) {
      btn.dataset.current = "true";
    } else {
      delete btn.dataset.current;
    }
  });
  document.querySelectorAll("[data-css-subpanel]").forEach((panel) => {
    const show = panel instanceof HTMLElement && panel.dataset.cssSubpanel === subtabName;
    panel.classList.toggle("d-none", !show);
    if (show) {
      panel.classList.add("d-flex", "flex-column");
    } else {
      panel.classList.remove("d-flex", "flex-column");
    }
  });
  void saveCssSubtab(subtabName);
  if (isOverview) {
    void runAction("css-overview");
  }
}

const validA11ySubtabs = new Set(["debug", "info", "audits"]);

async function loadA11ySubtab() {
  const stored = await loadStoredValue(a11ySubtabKey);
  return validA11ySubtabs.has(stored) ? stored : "debug";
}

async function saveA11ySubtab(subtab) {
  await saveStoredValue(a11ySubtabKey, validA11ySubtabs.has(subtab) ? subtab : "debug");
}

function switchA11ySubtab(subtabName) {
  const name = validA11ySubtabs.has(subtabName) ? subtabName : "debug";
  document.querySelectorAll("[data-a11y-subtab]").forEach((btn) => {
    const active = btn instanceof HTMLElement && btn.dataset.a11ySubtab === name;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll("[data-a11y-subpanel]").forEach((panel) => {
    const show = panel instanceof HTMLElement && panel.dataset.a11ySubpanel === name;
    panel.classList.toggle("d-none", !show);
    panel.classList.toggle("d-flex", show);
    panel.classList.toggle("flex-column", show);
  });
  void saveA11ySubtab(name);
}

const validRenderingSubtabs = new Set(["test", "media-queries"]);

async function loadRenderingSubtab() {
  const stored = await loadStoredValue(renderingSubtabKey);
  return validRenderingSubtabs.has(stored) ? stored : "test";
}

async function saveRenderingSubtab(subtab) {
  await saveStoredValue(renderingSubtabKey, validRenderingSubtabs.has(subtab) ? subtab : "test");
}

function switchRenderingSubtab(subtabName) {
  const name = validRenderingSubtabs.has(subtabName) ? subtabName : "test";
  document.querySelectorAll("[data-rendering-subtab]").forEach((btn) => {
    const active = btn instanceof HTMLElement && btn.dataset.renderingSubtab === name;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll("[data-rendering-subpanel]").forEach((panel) => {
    const show = panel instanceof HTMLElement && panel.dataset.renderingSubpanel === name;
    panel.classList.toggle("d-none", !show);
    panel.classList.toggle("d-flex", show);
    panel.classList.toggle("flex-column", show);
  });
  void saveRenderingSubtab(name);
}

const validNetworkSubtabs = new Set(["doc", "css", "js", "font", "images", "xhr-fetch", "other"]);

async function loadNetworkSubtab() {
  const stored = await loadStoredValue(networkSubtabKey);
  return validNetworkSubtabs.has(stored) ? stored : "doc";
}

async function saveNetworkSubtab(subtab) {
  await saveStoredValue(networkSubtabKey, validNetworkSubtabs.has(subtab) ? subtab : "doc");
}

function switchNetworkSubtab(subtabName) {
  const name = validNetworkSubtabs.has(subtabName) ? subtabName : "doc";
  currentNetworkSubtab = name;
  document.querySelectorAll("[data-network-subtab]").forEach((btn) => {
    const active = btn instanceof HTMLElement && btn.dataset.networkSubtab === name;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  const showImagesWrap = document.getElementById("network-show-images-wrap");
  showImagesWrap?.classList.toggle("d-none", name !== "images");
  void saveNetworkSubtab(name);
  if (lastNetworkPayload) {
    renderNetwork(lastNetworkPayload);
  }
}

const validSettingsSubtabs = new Set(["options", "credits", "device-info", "more-tools"]);

async function loadSettingsSubtab() {
  const stored = await loadStoredValue(settingsSubtabKey);
  return validSettingsSubtabs.has(stored) ? stored : "options";
}

async function saveSettingsSubtab(subtab) {
  await saveStoredValue(settingsSubtabKey, validSettingsSubtabs.has(subtab) ? subtab : "options");
}

function switchSettingsSubtab(subtabName) {
  const name = validSettingsSubtabs.has(subtabName) ? subtabName : "options";
  document.querySelectorAll("[data-settings-subtab]").forEach((btn) => {
    const active = btn instanceof HTMLElement && btn.dataset.settingsSubtab === name;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll("[data-settings-subpanel]").forEach((panel) => {
    const show = panel instanceof HTMLElement && panel.dataset.settingsSubpanel === name;
    panel.classList.toggle("d-none", !show);
    panel.classList.toggle("d-flex", show);
    panel.classList.toggle("flex-column", show);
  });
  void saveSettingsSubtab(name);
}

function showWelcomeScreen() {
  document.getElementById("welcome-panel")?.classList.remove("hidden");
  document.getElementById("main-content")?.classList.add("hidden");
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.remove("active");
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.remove("active", "d-flex", "flex-column");
  });
}

function showMainScreen() {
  document.getElementById("welcome-panel")?.classList.add("hidden");
  document.getElementById("main-content")?.classList.remove("hidden");
}

async function resetAllPopupSettings() {
  const keys = listPopupSettingKeys();
  await removeStoredValues(keys);

  const themeSelect = document.getElementById("theme-select");
  if (themeSelect instanceof HTMLSelectElement) {
    themeSelect.value = "dark";
  }
  activeThemePreference = "dark";
  applyTheme("dark");

  const ariaInspectSwitch = document.getElementById("a11y-aria-inspect-switch");
  const altOverlaySwitch = document.getElementById("a11y-alt-overlay-switch");
  if (ariaInspectSwitch instanceof HTMLInputElement) {
    ariaInspectSwitch.checked = false;
  }
  if (altOverlaySwitch instanceof HTMLInputElement) {
    altOverlaySwitch.checked = false;
  }

  const colorSchemeSelect = document.getElementById("rendering-color-scheme-select");
  if (colorSchemeSelect instanceof HTMLSelectElement) {
    colorSchemeSelect.value = "no-emulation";
  }
  const reducedMotionSelect = document.getElementById("rendering-reduced-motion-select");
  if (reducedMotionSelect instanceof HTMLSelectElement) {
    reducedMotionSelect.value = "no-emulation";
  }
  const contrastSelect = document.getElementById("rendering-contrast-select");
  if (contrastSelect instanceof HTMLSelectElement) {
    contrastSelect.value = "no-emulation";
  }
  const networkFilterSelect = document.getElementById("network-filter-select");
  if (networkFilterSelect instanceof HTMLSelectElement) {
    networkFilterSelect.value = "all";
  }
  currentNetworkFilter = "all";
  const networkShowImagesSwitch = document.getElementById("network-show-images-switch");
  if (networkShowImagesSwitch instanceof HTMLInputElement) {
    networkShowImagesSwitch.checked = false;
  }
  currentNetworkShowImages = false;
  const mediaTypeSelect = document.getElementById("rendering-media-type-select");
  if (mediaTypeSelect instanceof HTMLSelectElement) {
    mediaTypeSelect.value = "no-emulation";
  }
  const avifSwitch = document.getElementById("rendering-disable-avif");
  const webpSwitch = document.getElementById("rendering-disable-webp");
  if (avifSwitch instanceof HTMLInputElement) {
    avifSwitch.checked = false;
  }
  if (webpSwitch instanceof HTMLInputElement) {
    webpSwitch.checked = false;
  }

  const visionSelect = document.getElementById("rendering-vision-select");
  if (visionSelect instanceof HTMLSelectElement) {
    visionSelect.value = "none";
  }

  try {
    await sendToActiveTab({ action: "a11y-aria-inspector", enabled: false });
    await sendToActiveTab({ action: "a11y-alt-overlay", enabled: false });
    await sendToActiveTab({ action: "prefers-color-scheme", value: null });
    await sendToActiveTab({ action: "prefers-reduced-motion", value: null });
    await sendToActiveTab({ action: "prefers-contrast", value: null });
    await sendToActiveTab({ action: "media-type", value: null });
    await sendToActiveTab({ action: "rendering-format", format: "avif", disable: false });
    await sendToActiveTab({ action: "rendering-format", format: "webp", disable: false });
    await sendToActiveTab({ action: "a11y-color-filter", filter: "none" });
  } catch {
    // Ignore pages that do not accept messages (e.g. browser internal pages).
  }

  showWelcomeScreen();
  setStatus("All settings reset.");
}

function getSystemThemeMode() {
  return systemThemeMediaQuery?.matches ? "dark" : "light";
}

function resolveThemeMode(preference) {
  if (preference === "system") {
    return getSystemThemeMode();
  }
  return preference === "light" ? "light" : "dark";
}

async function loadThemePreference() {
  const stored = await loadStoredValue(themePreferenceKey);
  if (stored && validThemePreferences.has(stored)) {
    return stored;
  }

  const legacyStored = await loadStoredValue(legacyDarkModeKey);
  if (legacyStored === "true") {
    return "dark";
  }
  if (legacyStored === "false") {
    return "light";
  }
  return "dark";
}

async function saveThemePreference(preference) {
  if (!validThemePreferences.has(preference)) {
    return;
  }
  await saveStoredValue(themePreferenceKey, preference);
}

async function loadA11yAriaInspectEnabled() {
  const stored = await loadStoredValue(a11yAriaInspectKey);
  return stored === "true";
}

async function saveA11yAriaInspectEnabled(enabled) {
  await saveStoredValue(a11yAriaInspectKey, String(Boolean(enabled)));
}

async function loadA11yAltOverlayEnabled() {
  const stored = await loadStoredValue(a11yAltOverlayKey);
  return stored === "true";
}

async function saveA11yAltOverlayEnabled(enabled) {
  await saveStoredValue(a11yAltOverlayKey, String(Boolean(enabled)));
}

function applyTheme(themePreference) {
  const mode = resolveThemeMode(themePreference);
  document.documentElement.dataset.bsTheme = mode;
  document.body.classList.toggle("light-mode", mode === "light");
}

function renderBuildInfo() {
  const versionNode = document.getElementById("settings-build-version");
  const dateNode = document.getElementById("settings-build-date");
  if (!versionNode || !dateNode) {
    return;
  }

  const parsedDate = new Date(document.lastModified);
  const buildDate = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsedDate.toISOString().slice(0, 10);

  versionNode.textContent = "";
  dateNode.textContent = `Build ${buildDate}`;
}

function getOsVersionFromUserAgent(userAgent) {
  if (typeof userAgent !== "string") {
    return "Unknown";
  }

  // Check for new iOS 26+ format: "(iPhone; 26.3 Mobile)" or "(iPad; 26.3 Mobile)"
  const iosNewMatch = userAgent.match(/\((?:iPhone|iPad);\s*(\d+(?:\.\d+)*)\s+Mobile\)/i);
  if (iosNewMatch?.[1]) {
    return `iOS/iPadOS ${iosNewMatch[1]}`;
  }

  // Check for older iOS format: "OS 15_0 like Mac OS X"
  const iosMatch = userAgent.match(/OS (\d+(?:[_\.]\d+)*) like Mac OS X/i);
  if (iosMatch?.[1]) {
    return `iOS/iPadOS ${iosMatch[1].replace(/_/g, ".")}`;
  }

  const macMatch = userAgent.match(/Mac OS X (\d+(?:[_\.]\d+)*)/i);
  if (macMatch?.[1]) {
    return `macOS ${macMatch[1].replace(/_/g, ".")}`;
  }

  const androidMatch = userAgent.match(/Android (\d+(?:\.\d+)*)/i);
  if (androidMatch?.[1]) {
    return `Android ${androidMatch[1]}`;
  }

  const windowsMatch = userAgent.match(/Windows NT (\d+(?:\.\d+)*)/i);
  if (windowsMatch?.[1]) {
    return `Windows NT ${windowsMatch[1]}`;
  }

  return "Unknown";
}

function formatPlatformVersion(version) {
  const raw = String(version || "").trim();
  if (!raw) {
    return "";
  }
  const parts = raw.split(".").filter((part) => /^\d+$/.test(part));
  if (!parts.length) {
    return raw;
  }
  const major = parts[0];
  const minor = parts[1] && parts[1] !== "0" ? `.${parts[1]}` : "";
  return `${major}${minor}`;
}

async function resolveOsVersion(userAgent) {
  const uaData = navigator.userAgentData;
  if (uaData) {
    try {
      let platform = uaData.platform || "";
      let platformVersion = uaData.platformVersion || "";

      if (typeof uaData.getHighEntropyValues === "function") {
        const highEntropy = await uaData.getHighEntropyValues(["platform", "platformVersion"]);
        platform = highEntropy?.platform || platform;
        platformVersion = highEntropy?.platformVersion || platformVersion;
      }

      const normalizedPlatform = String(platform).toLowerCase();
      const normalizedVersion = formatPlatformVersion(platformVersion);
      if (normalizedVersion) {
        if (normalizedPlatform.includes("ipad") || normalizedPlatform.includes("ios")) {
          return `iOS/iPadOS ${normalizedVersion}`;
        }
        if (normalizedPlatform.includes("mac")) {
          return `macOS ${normalizedVersion}`;
        }
        if (normalizedPlatform.includes("android")) {
          return `Android ${normalizedVersion}`;
        }
        if (normalizedPlatform.includes("windows")) {
          return `Windows ${normalizedVersion}`;
        }
      }
    } catch {
      // Fall back to UA parsing below.
    }
  }

  return getOsVersionFromUserAgent(userAgent);
}

function getOrientationLabel() {
  const orientation = screen.orientation;
  if (orientation && typeof orientation.type === "string") {
    const type = orientation.type.startsWith("portrait") ? "portrait" : "landscape";
    const angle = Number.isFinite(orientation.angle) ? orientation.angle : 0;
    return `${type} (${angle}deg)`;
  }

  if (typeof window.orientation === "number") {
    const angle = window.orientation;
    const type = Math.abs(angle) === 90 ? "landscape" : "portrait";
    return `${type} (${angle}deg)`;
  }

  return "Unavailable";
}

function mediaQueryMatches(query) {
  if (!globalThis.matchMedia) {
    return false;
  }
  try {
    return globalThis.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function getReducedMotionLabel() {
  if (!globalThis.matchMedia) {
    return "Unavailable";
  }
  return mediaQueryMatches("(prefers-reduced-motion: reduce)") ? "reduce" : "no-preference";
}

function getColorSchemeLabel() {
  if (!globalThis.matchMedia) {
    return "Unavailable";
  }
  if (mediaQueryMatches("(prefers-color-scheme: dark)")) {
    return "dark (system)";
  }
  if (mediaQueryMatches("(prefers-color-scheme: light)")) {
    return "light (system)";
  }
  return "system (no explicit preference)";
}

function getPrefersContrastLabel() {
  if (!globalThis.matchMedia) {
    return "Unavailable";
  }
  if (mediaQueryMatches("(prefers-contrast: more)")) {
    return "more";
  }
  if (mediaQueryMatches("(prefers-contrast: less)")) {
    return "less";
  }
  if (mediaQueryMatches("(prefers-contrast: custom)")) {
    return "custom";
  }
  if (mediaQueryMatches("(prefers-contrast: no-preference)")) {
    return "no-preference";
  }
  return "Unavailable";
}

function getColorGamutLabel() {
  if (!globalThis.matchMedia) {
    return "Unavailable";
  }
  if (mediaQueryMatches("(color-gamut: rec2020)")) {
    return "rec2020";
  }
  if (mediaQueryMatches("(color-gamut: p3)")) {
    return "p3";
  }
  if (mediaQueryMatches("(color-gamut: srgb)")) {
    return "srgb";
  }
  return "Unavailable";
}

function getDynamicRangeLabel() {
  if (!globalThis.matchMedia) {
    return "Unavailable";
  }
  if (mediaQueryMatches("(dynamic-range: high)")) {
    return "high";
  }
  if (mediaQueryMatches("(dynamic-range: standard)")) {
    return "standard";
  }
  return "Unavailable";
}

function getTimezoneLabel() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
  const offsetMinutes = -new Date().getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const minutes = String(absMinutes % 60).padStart(2, "0");
  return `${timezone} (UTC${sign}${hours}:${minutes})`;
}

function getConnectionTypeLabel() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) {
    return "Unavailable";
  }

  const parts = [];
  if (typeof connection.type === "string" && connection.type) {
    parts.push(connection.type);
  }
  if (typeof connection.effectiveType === "string" && connection.effectiveType) {
    parts.push(connection.effectiveType);
  }
  if (typeof connection.downlink === "number" && Number.isFinite(connection.downlink)) {
    parts.push(`${connection.downlink} Mbps`);
  }
  return parts.length ? parts.join(" / ") : "Unavailable";
}

async function resolveNetworkDetails() {
  const fallback = {
    ip: "Unavailable",
    location: "Unavailable",
    isp: "Unavailable",
  };

  const providers = [
    {
      url: "https://ipwho.is/",
      parse: (data) => ({
        ip: data?.ip ? String(data.ip) : "Unavailable",
        location: [data?.city, data?.region, data?.country].filter(Boolean).join(", ") || "Unavailable",
        isp: data?.connection?.isp ? String(data.connection.isp) : "Unavailable",
      }),
    },
    {
      url: "https://ipapi.co/json/",
      parse: (data) => ({
        ip: data?.ip ? String(data.ip) : "Unavailable",
        location: [data?.city, data?.region, data?.country_name].filter(Boolean).join(", ") || "Unavailable",
        isp: data?.org ? String(data.org) : (data?.asn ? String(data.asn) : "Unavailable"),
      }),
    },
  ];

  for (const provider of providers) {
    try {
      const timeoutMs = 4000;
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(provider.url, {
        cache: "no-store",
        signal: controller.signal,
      });
      globalThis.clearTimeout(timeoutId);
      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const parsed = provider.parse(data);
      const ip = parsed.ip || "Unavailable";
      const location = parsed.location || "Unavailable";
      const isp = parsed.isp || "Unavailable";
      if (ip !== "Unavailable" || location !== "Unavailable" || isp !== "Unavailable") {
        return { ip, location, isp };
      }
    } catch {
      // Try next provider.
    }
  }

  return fallback;
}

async function renderDeviceInfo() {
  const setText = (id, value) => {
    const node = document.getElementById(id);
    if (node) {
      const textValue = String(value ?? "Unavailable");
      node.textContent = textValue;
      if (id.startsWith("device-network-")) {
        node.classList.toggle("opacity-75", textValue.trim().toLowerCase() === "unavailable");
      }
    }
  };
  const setHtml = (id, value) => {
    const node = document.getElementById(id);
    if (node) {
      node.innerHTML = String(value ?? "Unavailable");
    }
  };

  const fallbackIds = [
    "device-browser-user-agent",
    "device-browser-os-version",
    "device-browser-device",
    "device-browser-language",
    "device-display-resolution",
    "device-display-dpr",
    "device-display-color-depth",
    "device-display-orientation",
    "device-display-reduced-motion",
    "device-display-prefers-contrast",
    "device-display-color-scheme",
    "device-display-color-gamut",
    "device-display-dynamic-range",
    "device-network-ip",
    "device-network-location",
    "device-network-isp",
    "device-network-connection",
    "device-network-effective-type",
    "device-network-downlink",
    "device-network-rtt",
    "device-network-data-saver",
    "device-network-timezone",
  ];
  for (const id of fallbackIds) {
    setText(id, "Unavailable");
  }

  try {
    const userAgent = navigator.userAgent || "Unknown";
    const uaData = navigator.userAgentData;
    const language = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages.join(", ")
      : (navigator.language || "Unknown");
    const platform = uaData?.platform || navigator.platform || "Unknown";
    const mobileHint = uaData?.mobile === true || /iphone|ipad|android/i.test(userAgent) ? "mobile" : "desktop";

    setText("device-browser-user-agent", userAgent);
    setText("device-browser-device", `${platform} (${mobileHint})`);
    setText("device-browser-language", language);

    let osVersion = "Unknown";
    try {
      osVersion = await resolveOsVersion(userAgent);
    } catch {
      osVersion = "Unknown";
    }
    setText("device-browser-os-version", osVersion);

    const logicalWidth = Number.isFinite(screen.width) ? screen.width : 0;
    const logicalHeight = Number.isFinite(screen.height) ? screen.height : 0;
    const dpr = Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
    const physicalWidth = Math.round(logicalWidth * dpr);
    const physicalHeight = Math.round(logicalHeight * dpr);
    const colorDepth = Number.isFinite(screen.colorDepth) ? `${screen.colorDepth}-bit` : "Unavailable";
    const orientationLabel = getOrientationLabel();
    const reducedMotion = getReducedMotionLabel();
    const colorScheme = getColorSchemeLabel();
    const prefersContrast = getPrefersContrastLabel();
    const colorGamut = getColorGamutLabel();
    const dynamicRange = getDynamicRangeLabel();
    const connectionType = getConnectionTypeLabel();
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const effectiveType = typeof connection?.effectiveType === "string" && connection.effectiveType
      ? connection.effectiveType
      : (typeof connection?.type === "string" && connection.type ? connection.type : "Unavailable");
    const downlink = typeof connection?.downlink === "number" && Number.isFinite(connection.downlink)
      ? `${connection.downlink} Mbps`
      : "Unavailable";
    const rtt = typeof connection?.rtt === "number" && Number.isFinite(connection.rtt)
      ? `${connection.rtt} ms`
      : "Unavailable";
    const dataSaver = typeof connection?.saveData === "boolean"
      ? (connection.saveData ? "On" : "Off")
      : "Unavailable";
    const timezone = getTimezoneLabel();
    setHtml("device-display-resolution", `${logicalWidth}x${logicalHeight} logical<br>${physicalWidth}x${physicalHeight} physical`);
    setText("device-display-dpr", `${dpr.toFixed(2)}x`);
    setText("device-display-color-depth", colorDepth);
    setText("device-display-orientation", orientationLabel);
    setText("device-display-reduced-motion", reducedMotion);
    setText("device-display-prefers-contrast", prefersContrast);
    setText("device-display-color-scheme", colorScheme);
    setText("device-display-color-gamut", colorGamut);
    setText("device-display-dynamic-range", dynamicRange);
    setText("device-network-connection", connectionType);
    setText("device-network-effective-type", effectiveType);
    setText("device-network-downlink", downlink);
    setText("device-network-rtt", rtt);
    setText("device-network-data-saver", dataSaver);
    setText("device-network-timezone", timezone);
    setText("device-network-ip", "Loading...");
    setText("device-network-location", "Loading...");
    setText("device-network-isp", "Loading...");

    try {
      const network = await resolveNetworkDetails();
      setText("device-network-ip", network.ip);
      setText("device-network-location", network.location);
      setText("device-network-isp", network.isp);
    } catch {
      setText("device-network-ip", "Unavailable");
      setText("device-network-location", "Unavailable");
      setText("device-network-isp", "Unavailable");
    }
  } catch {
    // Keep fallback values so the table is never blank.
  }
}

function buildDeviceInfoClipboardText() {
  const read = (id) => {
    const node = document.getElementById(id);
    return node?.textContent?.trim() || "Unknown";
  };

  return [
    "Browser Details",
    `User Agent: ${read("device-browser-user-agent")}`,
    `OS Version: ${read("device-browser-os-version")}`,
    `Device: ${read("device-browser-device")}`,
    `Language: ${read("device-browser-language")}`,
    "",
    "Display",
    `Screen resolution: ${read("device-display-resolution")}`,
    `Pixel density: ${read("device-display-dpr")}`,
    `Color depth: ${read("device-display-color-depth")}`,
    `Orientation: ${read("device-display-orientation")}`,
    `Reduced motion: ${read("device-display-reduced-motion")}`,
    `Prefers contrast: ${read("device-display-prefers-contrast")}`,
    `Color scheme: ${read("device-display-color-scheme")}`,
    `Color gamut: ${read("device-display-color-gamut")}`,
    `Dynamic range: ${read("device-display-dynamic-range")}`,
    "",
    "Network",
    `IP address: ${read("device-network-ip")}`,
    `Location: ${read("device-network-location")}`,
    `ISP: ${read("device-network-isp")}`,
    `Connection type: ${read("device-network-connection")}`,
    `Effective type: ${read("device-network-effective-type")}`,
    `Downlink: ${read("device-network-downlink")}`,
    `RTT: ${read("device-network-rtt")}`,
    `Data saver: ${read("device-network-data-saver")}`,
    `Timezone: ${read("device-network-timezone")}`,
  ].join("\n");
}

function setStatus(text, isError = false) {
  const node = document.getElementById("status");
  node.textContent = text;
  node.classList.toggle("text-danger", isError);
}

function flashButtonLabel(button, nextLabel, timeoutMs = 900) {
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  const original = button.textContent;
  button.textContent = nextLabel;
  button.disabled = true;
  globalThis.setTimeout(() => {
    button.textContent = original;
    button.disabled = false;
  }, timeoutMs);
}

function showDialogShell(title) {
  const panel = document.createElement("div");
  panel.className = "modal-content rounded-2 p-2 bg-body border text-body shadow-sm w-100";
  panel.style.maxWidth = "330px";
  panel.style.minHeight = "256px";

  const heading = document.createElement("div");
  heading.className = "modal-title small fw-semibold mb-2";
  heading.textContent = title;
  panel.append(heading);

  if (typeof HTMLDialogElement !== "undefined") {
    const dialog = document.createElement("dialog");
    dialog.className = "wdt-dialog modal d-block border-0 p-0 m-0 vw-100 vh-100 mw-100 mh-100 bg-transparent overflow-visible";
    if (isIpadExtensionPopupContext()) {
      dialog.classList.add("wdt-dialog-ipad-popup");
    }

    const overlay = document.createElement("div");
    overlay.className = "position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-start justify-content-center p-2 w-100 h-100 bg-transparent";

    const dialogWrap = document.createElement("div");
    dialogWrap.className = "d-flex justify-content-center w-100";

    const closeDialog = () => {
      if (dialog.open) {
        dialog.close();
      }
      dialog.remove();
    };

    const nativeRemove = overlay.remove.bind(overlay);
    overlay.remove = () => {
      closeDialog();
      nativeRemove();
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeDialog();
      }
    });

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeDialog();
    });

    dialogWrap.append(panel);
    overlay.append(dialogWrap);
    dialog.append(overlay);
    document.body.append(dialog);
    dialog.showModal();
    return { overlay, panel };
  }

  const overlay = document.createElement("div");
  overlay.className = "position-fixed top-0 start-0 end-0 bottom-0 d-flex align-items-start justify-content-center p-2";
  overlay.style.background = "rgba(2, 6, 23, 0.45)";
  overlay.style.backdropFilter = "blur(6px)";
  overlay.style.webkitBackdropFilter = "blur(6px)";
  overlay.style.zIndex = "2147483647";
  overlay.append(panel);
  document.body.append(overlay);
  return { overlay, panel };
}

function showTextPrompt(title, initialValue) {
  return new Promise((resolve) => {
    const { overlay, panel } = showDialogShell(title);

    const input = document.createElement("textarea");
    input.className = "form-control form-control-sm mb-2";
    input.rows = 5;
    input.value = String(initialValue ?? "");

    const actions = document.createElement("div");
    actions.className = "d-flex gap-1 justify-content-end";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-sm btn-outline-secondary";
    cancelBtn.textContent = "Cancel";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn btn-sm btn-primary";
    saveBtn.textContent = "Save";

    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };

    cancelBtn.addEventListener("click", () => finish(null));
    saveBtn.addEventListener("click", () => finish(input.value));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finish(null);
      }
    });

    actions.append(cancelBtn, saveBtn);
    panel.append(input, actions);
    input.focus();
    input.select();
  });
}

function showConfirmDialog(message) {
  return new Promise((resolve) => {
    const { overlay, panel } = showDialogShell("Confirm");

    const text = document.createElement("p");
    text.className = "small mb-2";
    text.textContent = message;

    const actions = document.createElement("div");
    actions.className = "d-flex gap-3 justify-content-end";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-sm btn-outline-secondary";
    cancelBtn.textContent = "Cancel";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-sm btn-danger";
    deleteBtn.textContent = "Delete";

    const finish = (approved) => {
      overlay.remove();
      resolve(approved);
    };

    cancelBtn.addEventListener("click", () => finish(false));
    deleteBtn.addEventListener("click", () => finish(true));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        finish(false);
      }
    });

    actions.append(cancelBtn, deleteBtn);
    panel.append(text, actions);
  });
}

function renderKeyValues(targetId, data) {
  const root = document.getElementById(targetId);
  root.textContent = "";

  const entries = Object.entries(data);
  if (!entries.length) {
    root.textContent = "No data available.";
    return;
  }

  for (const [label, value] of entries) {
    const line = document.createElement("div");
    line.className = "metric";

    const key = document.createElement("strong");
    key.textContent = `${label}: `;

    const val = document.createElement("span");
    if (typeof value === "object") {
      val.textContent = JSON.stringify(value);
    } else {
      val.textContent = String(value);
    }

    line.append(key, val);
    root.append(line);
  }
}

function appendList(root, title, items) {
  const line = document.createElement("div");
  line.className = "metric";

  const head = document.createElement("strong");
  head.textContent = `${title}: `;
  line.append(head);

  if (!items || items.length === 0) {
    const empty = document.createElement("span");
    empty.className = "text-success";
    empty.textContent = "None";
    line.append(empty);
  } else {
    const detail = document.createElement("span");
    detail.className = "text-warning";
    detail.textContent = items.join(" | ");
    line.append(detail);
  }

  root.append(line);
}

function appendBulletList(root, title, items, listClassName = "") {
  const line = document.createElement("div");
  line.className = "metric";

  const head = document.createElement("strong");
  head.textContent = `${title}:`;
  line.append(head);

  if (!items || items.length === 0) {
    const empty = document.createElement("span");
    empty.className = "text-success";
    empty.textContent = " None";
    line.append(empty);
    root.append(line);
    return;
  }

  const list = document.createElement("ul");
  list.className = `small mb-0 mt-1 ps-3 ${listClassName}`.trim();

  for (const item of items) {
    const entry = document.createElement("li");
    entry.textContent = item;
    list.append(entry);
  }

  line.append(list);
  root.append(line);
}

function appendCollapsibleBulletList(root, title, items) {
  const line = document.createElement("div");
  line.className = "metric";

  if (!items || items.length === 0) {
    const head = document.createElement("strong");
    head.textContent = `${title}: `;
    const empty = document.createElement("span");
    empty.className = "text-success";
    empty.textContent = "None";
    line.append(head, empty);
    root.append(line);
    return;
  }

  const details = document.createElement("details");
  details.className = "mt-1";

  const summary = document.createElement("summary");
  summary.className = "small text-secondary";
  summary.textContent = `${title} (${items.length})`;

  const list = document.createElement("ul");
  list.className = "small text-secondary mb-0 mt-1 ps-3";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  }

  details.append(summary, list);
  line.append(details);
  root.append(line);
}

function appendHeadingTree(root, items) {
  const line = document.createElement("div");
  line.className = "metric";

  if (!items || items.length === 0) {
    const head = document.createElement("strong");
    head.textContent = "Heading tree: ";
    const empty = document.createElement("span");
    empty.className = "text-success";
    empty.textContent = "None";
    line.append(head, empty);
    root.append(line);
    return;
  }

  const details = document.createElement("details");
  details.className = "mt-1";

  const summary = document.createElement("summary");
  summary.className = "small text-secondary";
  summary.textContent = `Heading tree (${items.length})`;

  const wrap = document.createElement("div");
  wrap.className = "small text-secondary mt-1";

  for (const raw of items) {
    const text = String(raw ?? "");
    const match = text.match(/^h([1-6])\s*:\s*(.*)$/i);
    const level = match ? Number(match[1]) : 1;
    const label = match ? `H${level} ${match[2]}` : text;

    const item = document.createElement("div");
    item.textContent = label;
    const indent = Math.max(0, level - 1) * 18;
    item.style.marginLeft = `${indent}px`;
    if (level > 1) {
      item.style.borderLeft = "1px solid var(--bs-border-color)";
      item.style.paddingLeft = "8px";
    }
    wrap.append(item);
  }

  details.append(summary, wrap);
  line.append(details);
  root.append(line);
}

function lockAccordionWhenEmpty(details, summary, count) {
  if (count > 0) {
    return;
  }

  summary.classList.add("pe-none", "no-expand");
  details.open = false;
  details.addEventListener("toggle", () => {
    if (details.open) {
      details.open = false;
    }
  });
}

class AccordionAnimator {
  constructor(details) {
    this.details = details;
    this.summary = details.querySelector("summary");
    this.content = details.querySelector(".accordion-body");
    this.animation = null;
    this.isClosing = false;
    this.isExpanding = false;
    if (!(this.summary instanceof HTMLElement) || !(this.content instanceof HTMLElement)) {
      return;
    }
    this.summary.addEventListener("click", (event) => this.onClick(event));
  }

  onClick(event) {
    if (!(this.summary instanceof HTMLElement) || !(this.content instanceof HTMLElement)) {
      return;
    }
    if (this.summary.classList.contains("pe-none") || this.summary.classList.contains("no-expand")) {
      return;
    }
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      return;
    }
    event.preventDefault();
    this.details.style.overflow = "hidden";
    if (this.isClosing || !this.details.open) {
      this.open();
      return;
    }
    if (this.isExpanding || this.details.open) {
      this.shrink();
    }
  }

  shrink() {
    this.isClosing = true;
    const startHeight = `${this.details.offsetHeight}px`;
    const endHeight = `${this.summary.offsetHeight}px`;

    if (this.animation) {
      this.animation.cancel();
    }
    this.animation = this.details.animate(
      { height: [startHeight, endHeight] },
      { duration: 220, easing: "ease-in-out" }
    );
    this.animation.onfinish = () => this.onAnimationFinish(false);
    this.animation.oncancel = () => {
      this.isClosing = false;
    };
  }

  open() {
    this.details.style.height = `${this.details.offsetHeight}px`;
    this.details.open = true;
    globalThis.requestAnimationFrame(() => this.expand());
  }

  expand() {
    if (!(this.summary instanceof HTMLElement) || !(this.content instanceof HTMLElement)) {
      return;
    }
    this.isExpanding = true;
    const startHeight = `${this.details.offsetHeight}px`;
    const endHeight = `${this.summary.offsetHeight + this.content.offsetHeight}px`;
    if (this.animation) {
      this.animation.cancel();
    }
    this.animation = this.details.animate(
      { height: [startHeight, endHeight] },
      { duration: 320, easing: "ease-out" }
    );
    this.animation.onfinish = () => this.onAnimationFinish(true);
    this.animation.oncancel = () => {
      this.isExpanding = false;
    };
  }

  onAnimationFinish(open) {
    this.details.open = open;
    this.animation = null;
    this.isClosing = false;
    this.isExpanding = false;
    this.details.style.height = "";
    this.details.style.overflow = "";
  }
}

function initializeAccordionAnimations(root = document) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return;
  }
  root.querySelectorAll("details.accordion-item").forEach((details) => {
    if (!(details instanceof HTMLDetailsElement)) {
      return;
    }
    if (details.dataset.waapiAccordion === "true") {
      return;
    }
    details.dataset.waapiAccordion = "true";
    // eslint-disable-next-line no-new
    new AccordionAnimator(details);
  });
}

function renderSEO(result) {
  const output = document.getElementById("seo-output");
  output.textContent = "";
  const openGraphTags = Array.isArray(result?.openGraphTags) ? result.openGraphTags : [];
  const twitterTags = Array.isArray(result?.twitterTags) ? result.twitterTags : [];
  const structuredDataItems = Array.isArray(result?.structuredDataItems) ? result.structuredDataItems : [];
  const iconLinks = Array.isArray(result?.iconLinks) ? result.iconLinks : [];

  const accordion = document.createElement("div");
  accordion.className = "accordion border-bottom-0";

  const metaDetails = document.createElement("details");
  metaDetails.className = "accordion-item border-bottom-0";
  metaDetails.setAttribute("name", "seo-issues");
  metaDetails.open = true;
  const metaSummary = document.createElement("summary");
  metaSummary.className = "accordion-button rounded-top";
  const metaHeader = document.createElement("h2");
  metaHeader.className = "accordion-header user-select-none fs-6 text-body";
  metaHeader.textContent = "Meta tags";
  metaSummary.append(metaHeader);
  metaDetails.append(metaSummary);

  const metaBody = document.createElement("div");
  metaBody.className = "accordion-body border-bottom p-2";
  const metaList = document.createElement("ul");
  metaList.className = "small mb-0 ps-3";

  const titleItem = document.createElement("li");
  const titleLabel = document.createElement("strong");
  titleLabel.textContent = "Title: ";
  titleItem.append(titleLabel, document.createTextNode(result.title || "(missing)"));
  metaList.append(titleItem);

  const metaDescription = typeof result?.metaDescription === "string" ? result.metaDescription.trim() : "";
  if (metaDescription) {
    const descriptionItem = document.createElement("li");
    const descriptionLabel = document.createElement("strong");
    descriptionLabel.textContent = "Meta description: ";
    descriptionItem.append(descriptionLabel, document.createTextNode(metaDescription));
    metaList.append(descriptionItem);
  }

  const canonicalUrl = typeof result?.canonicalUrl === "string" ? result.canonicalUrl.trim() : "";
  if (/^https?:\/\//i.test(canonicalUrl)) {
    const canonicalItem = document.createElement("li");
    const canonicalLabel = document.createElement("strong");
    canonicalLabel.textContent = "Canonical URL: ";
    canonicalItem.append(canonicalLabel);
    const link = document.createElement("a");
    link.href = canonicalUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = canonicalUrl;
    canonicalItem.append(link);
    metaList.append(canonicalItem);
  }

  const authorLink = typeof result?.authorLink === "string" ? result.authorLink.trim() : "";
  if (authorLink) {
    const authorItem = document.createElement("li");
    const authorLabel = document.createElement("strong");
    authorLabel.textContent = "Author: ";
    authorItem.append(authorLabel);
    if (authorLink.startsWith("https://")) {
      const link = document.createElement("a");
      link.href = authorLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = authorLink;
      authorItem.append(link);
    } else {
      authorItem.append(document.createTextNode(authorLink));
    }
    metaList.append(authorItem);
  }

  const monetizationLink = typeof result?.monetizationLink === "string" ? result.monetizationLink.trim() : "";
  if (monetizationLink) {
    const monetizationItem = document.createElement("li");
    const monetizationLabel = document.createElement("strong");
    monetizationLabel.textContent = "Monetization: ";
    monetizationItem.append(monetizationLabel);
    if (/^https?:\/\//i.test(monetizationLink)) {
      const link = document.createElement("a");
      link.href = monetizationLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = monetizationLink;
      monetizationItem.append(link);
    } else {
      monetizationItem.append(document.createTextNode(monetizationLink));
    }
    metaList.append(monetizationItem);
  }

  const alternateFeeds = Array.isArray(result?.alternateFeeds) ? result.alternateFeeds : [];
  if (alternateFeeds.length > 0) {
    const alternateItem = document.createElement("li");
    const alternateLabel = document.createElement("strong");
    alternateLabel.textContent = "Alternate (RSS): ";
    alternateItem.append(alternateLabel);

    const feedList = document.createElement("ul");
    feedList.className = "small mb-0 mt-1 ps-3";
    for (const feed of alternateFeeds) {
      const entry = document.createElement("li");
      const href = typeof feed?.href === "string" ? feed.href.trim() : "";
      const type = typeof feed?.type === "string" ? feed.type.trim() : "";
      const title = typeof feed?.title === "string" ? feed.title.trim() : "";
      const label = title || type || href || "(unknown feed)";

      if (/^https?:\/\//i.test(href)) {
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = label;
        entry.append(link);
      } else {
        entry.textContent = label;
      }
      feedList.append(entry);
    }
    alternateItem.append(feedList);
    metaList.append(alternateItem);
  }

  const pingbackLink = typeof result?.pingbackLink === "string" ? result.pingbackLink.trim() : "";
  if (pingbackLink) {
    const pingbackItem = document.createElement("li");
    const pingbackLabel = document.createElement("strong");
    pingbackLabel.textContent = "Pingback: ";
    pingbackItem.append(pingbackLabel);
    if (/^https?:\/\//i.test(pingbackLink)) {
      const link = document.createElement("a");
      link.href = pingbackLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = pingbackLink;
      pingbackItem.append(link);
    } else {
      pingbackItem.append(document.createTextNode(pingbackLink));
    }
    metaList.append(pingbackItem);
  }

  const webmentionLink = typeof result?.webmentionLink === "string" ? result.webmentionLink.trim() : "";
  if (webmentionLink) {
    const webmentionItem = document.createElement("li");
    const webmentionLabel = document.createElement("strong");
    webmentionLabel.textContent = "Webmention: ";
    webmentionItem.append(webmentionLabel);
    if (/^https?:\/\//i.test(webmentionLink)) {
      const link = document.createElement("a");
      link.href = webmentionLink;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = webmentionLink;
      webmentionItem.append(link);
    } else {
      webmentionItem.append(document.createTextNode(webmentionLink));
    }
    metaList.append(webmentionItem);
  }

  const fediverseCreator = typeof result?.fediverseCreator === "string" ? result.fediverseCreator.trim() : "";
  if (fediverseCreator) {
    const fediverseItem = document.createElement("li");
    const fediverseLabel = document.createElement("strong");
    fediverseLabel.textContent = "Fediverse creator: ";
    fediverseItem.append(fediverseLabel);

    let profileUrl = "";
    if (/^https?:\/\//i.test(fediverseCreator)) {
      profileUrl = fediverseCreator;
    } else {
      const acct = fediverseCreator.replace(/^acct:/i, "");
      const match = acct.match(/^@?([^@\s]+)@([^@\s]+)$/);
      if (match) {
        profileUrl = `https://${match[2]}/@${match[1]}`;
      }
    }

    if (profileUrl) {
      const link = document.createElement("a");
      link.href = profileUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = fediverseCreator;
      fediverseItem.append(link);
    } else {
      fediverseItem.append(document.createTextNode(fediverseCreator));
    }
    metaList.append(fediverseItem);
  }

  const generator = typeof result?.generator === "string" ? result.generator.trim() : "";
  if (generator) {
    const generatorItem = document.createElement("li");
    const generatorLabel = document.createElement("strong");
    generatorLabel.textContent = "Generator: ";
    generatorItem.append(generatorLabel, document.createTextNode(generator));
    metaList.append(generatorItem);
  }

  const lastModified = typeof result?.lastModified === "string" ? result.lastModified.trim() : "";
  if (lastModified) {
    const lastModifiedItem = document.createElement("li");
    const lastModifiedLabel = document.createElement("strong");
    lastModifiedLabel.textContent = "Last modified: ";
    lastModifiedItem.append(lastModifiedLabel, document.createTextNode(lastModified));
    metaList.append(lastModifiedItem);
  }

  const themeColor = typeof result?.themeColor === "string" ? result.themeColor.trim() : "";
  if (themeColor) {
    const themeColorItem = document.createElement("li");
    const themeColorLabel = document.createElement("strong");
    themeColorLabel.textContent = "Theme color: ";
    themeColorItem.append(themeColorLabel);

    const themeColorValue = document.createElement("code");
    themeColorValue.className = "font-monospace";
    themeColorValue.textContent = themeColor;
    themeColorItem.append(themeColorValue);

    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("color", themeColor)) {
      const swatch = document.createElement("span");
      swatch.className = "d-inline-block rounded-circle border ms-2 align-middle";
      swatch.style.width = "0.75rem";
      swatch.style.height = "0.75rem";
      swatch.style.backgroundColor = themeColor;
      themeColorItem.append(swatch);
    }

    metaList.append(themeColorItem);
  }

  const colorScheme = typeof result?.colorScheme === "string" ? result.colorScheme.trim() : "";
  if (colorScheme) {
    const colorSchemeItem = document.createElement("li");
    const colorSchemeLabel = document.createElement("strong");
    colorSchemeLabel.textContent = "Color scheme: ";
    const colorSchemeValue = document.createElement("code");
    colorSchemeValue.className = "font-monospace";
    colorSchemeValue.textContent = colorScheme;
    colorSchemeItem.append(colorSchemeLabel, colorSchemeValue);
    metaList.append(colorSchemeItem);
  }

  const metaRobots = typeof result?.metaRobots === "string" ? result.metaRobots.trim() : "";
  if (metaRobots) {
    const metaRobotsItem = document.createElement("li");
    const metaRobotsLabel = document.createElement("strong");
    metaRobotsLabel.textContent = "Meta robots: ";
    const metaRobotsValue = document.createElement("code");
    metaRobotsValue.className = "font-monospace";
    metaRobotsValue.textContent = metaRobots;
    metaRobotsItem.append(metaRobotsLabel, metaRobotsValue);
    metaList.append(metaRobotsItem);
  }

  const metaReferrer = typeof result?.metaReferrer === "string" ? result.metaReferrer.trim() : "";
  if (metaReferrer) {
    const metaReferrerItem = document.createElement("li");
    const metaReferrerLabel = document.createElement("strong");
    metaReferrerLabel.textContent = "Meta referrer: ";
    const metaReferrerValue = document.createElement("code");
    metaReferrerValue.className = "font-monospace";
    metaReferrerValue.textContent = metaReferrer;
    metaReferrerItem.append(metaReferrerLabel, metaReferrerValue);
    metaList.append(metaReferrerItem);
  }

  metaBody.append(metaList);

  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  if (warnings.length) {
    const warn = document.createElement("div");
    warn.className = "alert alert-warning mt-2 mb-0 py-2 px-2";

    const warnTitle = document.createElement("div");
    warnTitle.className = "fw-semibold small mb-1";
    warnTitle.textContent = "Warnings";
    warn.append(warnTitle);

    const warnList = document.createElement("ul");
    warnList.className = "small mb-0 ps-3";
    for (const message of warnings) {
      const li = document.createElement("li");
      li.textContent = message;
      warnList.append(li);
    }
    warn.append(warnList);
    metaBody.append(warn);
  }

  metaDetails.append(metaBody);
  accordion.append(metaDetails);

  const ogDetails = document.createElement("details");
  ogDetails.className = "accordion-item border-bottom-0";
  ogDetails.setAttribute("name", "seo-issues");
  const ogSummary = document.createElement("summary");
  ogSummary.className = "accordion-button rounded-top";
  const ogHeader = document.createElement("h2");
  ogHeader.className = "accordion-header user-select-none fs-6 text-body";
  ogHeader.append(document.createTextNode("Open Graph "));
  const ogCount = document.createElement("span");
  ogCount.className = "opacity-50";
  ogCount.textContent = `(${openGraphTags.length})`;
  ogHeader.append(ogCount);
  ogSummary.append(ogHeader);
  lockAccordionWhenEmpty(ogDetails, ogSummary, openGraphTags.length);
  ogDetails.append(ogSummary);
  const ogBody = document.createElement("div");
  ogBody.className = "accordion-body border-bottom p-2";
  const ogList = document.createElement("ul");
  ogList.className = "small mb-0 ps-3";
  const sortedOpenGraphTags = [...openGraphTags].sort((a, b) => {
    const aKey = String((a && typeof a === "object" ? a.property : a) || "").toLowerCase();
    const bKey = String((b && typeof b === "object" ? b.property : b) || "").toLowerCase();
    return aKey.localeCompare(bKey);
  });

  for (const tag of sortedOpenGraphTags) {
    const li = document.createElement("li");
    const property = typeof tag === "object" && tag
      ? String(tag.property || "og:*")
      : String(tag ?? "").split(": ").shift() || "og:*";
    const content = typeof tag === "object" && tag
      ? String(tag.content || "(empty)")
      : String(tag ?? "").replace(/^[^:]+:\s*/, "") || "(empty)";

    const propStrong = document.createElement("strong");
    propStrong.textContent = property;
    li.append(propStrong, document.createTextNode(": "));

    if (property === "og:url" || property === "og:image") {
      const link = document.createElement("a");
      link.href = content;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = content;
      li.append(link);
      if (property === "og:image" && content && content !== "(empty)") {
        const imgWrap = document.createElement("div");
        imgWrap.className = "mt-2";
        const img = document.createElement("img");
        img.src = content;
        img.alt = "Open Graph image";
        img.className = "shadow border rounded bg-secondary bg-opacity-25 img-fluid mb-2";
        img.style.maxWidth = "90%";
        img.loading = "lazy";
        img.onerror = () => { imgWrap.remove(); };
        imgWrap.append(img);
        li.append(imgWrap);
        (async () => {
          const parseLength = (value) => {
            const parsed = Number.parseInt(String(value || ""), 10);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
          };
          const controller = new AbortController();
          const timeoutId = globalThis.setTimeout(() => controller.abort(), 5000);
          let bytes = null;
          try {
            const headResponse = await fetch(content, { method: "HEAD", cache: "no-store", credentials: "omit", signal: controller.signal });
            bytes = parseLength(headResponse.headers.get("content-length"));
          } catch (_error) {
            // Continue to range request fallback.
          }
          if (bytes === null && !controller.signal.aborted) {
            try {
              const rangeResponse = await fetch(content, {
                method: "GET",
                cache: "no-store",
                credentials: "omit",
                headers: { Range: "bytes=0-0" },
                signal: controller.signal
              });
              const contentRange = rangeResponse.headers.get("content-range");
              if (contentRange) {
                const match = contentRange.match(/\/(\d+)\s*$/);
                if (match?.[1]) {
                  bytes = parseLength(match[1]);
                }
              }
              if (bytes === null) {
                bytes = parseLength(rangeResponse.headers.get("content-length"));
              }
            } catch (_error) {
              // Can't get size, display nothing.
            }
          }
          globalThis.clearTimeout(timeoutId);
          if (bytes !== null) {
            const sizeKb = bytes / 1024;
            const rounded = sizeKb >= 100 ? Math.round(sizeKb) : Number(sizeKb.toFixed(1));
            const sizeSpan = document.createElement("span");
            sizeSpan.className = "opacity-75";
            sizeSpan.textContent = ` (${rounded} KB)`;
            li.insertBefore(sizeSpan, imgWrap);
          }
        })();
      }
    } else {
      li.append(document.createTextNode(content));
    }
    ogList.append(li);
  }
  if (!openGraphTags.length) {
    const empty = document.createElement("div");
    empty.className = "small text-success";
    empty.textContent = "None";
    ogBody.append(empty);
  } else {
    ogBody.append(ogList);
  }
  ogDetails.append(ogBody);
  accordion.append(ogDetails);

  if (twitterTags.length > 0) {
    const twitterDetails = document.createElement("details");
    twitterDetails.className = "accordion-item border-bottom-0";
    twitterDetails.setAttribute("name", "seo-issues");
    const twitterSummary = document.createElement("summary");
    twitterSummary.className = "accordion-button rounded-top";
    const twitterHeader = document.createElement("h2");
    twitterHeader.className = "accordion-header user-select-none fs-6 text-body";
    twitterHeader.append(document.createTextNode("Twitter Cards "));
    const twitterCount = document.createElement("span");
    twitterCount.className = "opacity-50";
    twitterCount.textContent = `(${twitterTags.length})`;
    twitterHeader.append(twitterCount);
    twitterSummary.append(twitterHeader);
    twitterDetails.append(twitterSummary);
    const twitterBody = document.createElement("div");
    twitterBody.className = "accordion-body border-bottom p-2";
    const twitterList = document.createElement("ul");
    twitterList.className = "small mb-0 ps-3";
    const sortedTwitterTags = [...twitterTags].sort((a, b) => {
      const aKey = String((a && typeof a === "object" ? a.name : a) || "").toLowerCase();
      const bKey = String((b && typeof b === "object" ? b.name : b) || "").toLowerCase();
      return aKey.localeCompare(bKey);
    });

    for (const tag of sortedTwitterTags) {
      const li = document.createElement("li");
      const name = typeof tag === "object" && tag
        ? String(tag.name || "twitter:*")
        : String(tag ?? "").split(": ").shift() || "twitter:*";
      const content = typeof tag === "object" && tag
        ? String(tag.content || "(empty)")
        : String(tag ?? "").replace(/^[^:]+:\s*/, "") || "(empty)";

      const nameStrong = document.createElement("strong");
      nameStrong.textContent = name;
      li.append(nameStrong, document.createTextNode(": "));

      if (name === "twitter:url" || name === "twitter:image") {
        const link = document.createElement("a");
        link.href = content;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = content;
        li.append(link);
      } else {
        li.append(document.createTextNode(content));
      }
      twitterList.append(li);
    }

    twitterBody.append(twitterList);
    twitterDetails.append(twitterBody);
    accordion.append(twitterDetails);
  }

  if (structuredDataItems.length > 0) {
    const sdDetails = document.createElement("details");
    sdDetails.className = "accordion-item border-bottom-0";
    sdDetails.setAttribute("name", "seo-issues");
    const sdSummary = document.createElement("summary");
    sdSummary.className = "accordion-button rounded-top";
    const sdHeader = document.createElement("h2");
    sdHeader.className = "accordion-header user-select-none fs-6 text-body";
    sdHeader.append(document.createTextNode("Structured data "));
    const sdCount = document.createElement("span");
    sdCount.className = "opacity-50";
    sdCount.textContent = `(${structuredDataItems.length})`;
    sdHeader.append(sdCount);
    sdSummary.append(sdHeader);
    sdDetails.append(sdSummary);
    const sdBody = document.createElement("div");
    sdBody.className = "accordion-body border-bottom p-2";
    const sdList = document.createElement("ul");
    sdList.className = "small mb-0 ps-3";
    for (const item of structuredDataItems) {
      const li = document.createElement("li");
      const text = String(item ?? "");
      const match = text.match(/^Microdata:\s*(.+)$/i);
      if (match && /^https?:\/\//i.test(match[1])) {
        li.append(document.createTextNode("Microdata: "));
        const link = document.createElement("a");
        link.href = match[1];
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = match[1];
        li.append(link);
      } else {
        li.textContent = text;
      }
      sdList.append(li);
    }
    sdBody.append(sdList);
    sdDetails.append(sdBody);
    accordion.append(sdDetails);
  }

  const iconsDetails = document.createElement("details");
  iconsDetails.className = "accordion-item border-bottom-0";
  iconsDetails.setAttribute("name", "seo-issues");
  const iconsSummary = document.createElement("summary");
  iconsSummary.className = "accordion-button rounded-top";
  const iconsHeader = document.createElement("h2");
  iconsHeader.className = "accordion-header user-select-none fs-6 text-body";
  iconsHeader.append(document.createTextNode("Icons "));
  const iconsCount = document.createElement("span");
  iconsCount.className = "opacity-50";
  iconsCount.textContent = `(${iconLinks.length})`;
  iconsHeader.append(iconsCount);
  iconsSummary.append(iconsHeader);
  lockAccordionWhenEmpty(iconsDetails, iconsSummary, iconLinks.length);
  iconsDetails.append(iconsSummary);

  const iconsBody = document.createElement("div");
  iconsBody.className = "accordion-body border-bottom p-2";
  if (!iconLinks.length) {
    const empty = document.createElement("div");
    empty.className = "small text-success";
    empty.textContent = "None";
    iconsBody.append(empty);
  } else {
    const tableWrap = document.createElement("div");
    tableWrap.className = "table-responsive";
    const table = document.createElement("table");
    table.className = "table table-sm table-bordered align-middle mb-0";
    const thead = document.createElement("thead");
    thead.className = "visually-hidden";
    thead.innerHTML = "<tr><th scope=\"col\">Icon</th><th scope=\"col\">Info</th></tr>";
    table.append(thead);
    const tbody = document.createElement("tbody");

    const formatSize = (sizeKb) => {
      const numeric = Number(sizeKb);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return "Unavailable";
      }
      if (numeric >= 100) {
        return `${Math.round(numeric)} KB`;
      }
      return `${numeric.toFixed(1)} KB`;
    };

    for (const icon of iconLinks) {
      const href = String(icon?.href || "").trim();
      const row = document.createElement("tr");

      const iconCell = document.createElement("td");
      iconCell.className = "text-center";
      iconCell.style.width = "46px";
      iconCell.style.minWidth = "46px";
      iconCell.style.maxWidth = "46px";
      if (href) {
        const img = document.createElement("img");
        img.src = href;
        img.alt = String(icon?.filename || "Icon");
        img.loading = "lazy";
        img.fetchPriority = "low";
        img.className = "mx-auto d-block";
        img.style.width = "32px";
        img.style.height = "32px";
        img.style.objectFit = "contain";
        iconCell.append(img);
      } else {
        const fallback = document.createElement("span");
        fallback.className = "small text-secondary";
        fallback.textContent = "—";
        iconCell.append(fallback);
      }

      const infoCell = document.createElement("td");
      infoCell.className = "small";

      const appendInfoLine = (label, value) => {
        const line = document.createElement("div");
        const key = document.createElement("span");
        key.className = "opacity-75";
        key.textContent = `${label}: `;
        line.append(key, document.createTextNode(String(value || "Unavailable")));
        infoCell.append(line);
      };
      appendInfoLine("Filename", icon?.filename);
      const dimensions = String(icon?.sizes || "").trim();
      if (dimensions) {
        appendInfoLine("Dimensions", dimensions);
      }
      const sizeValue = formatSize(icon?.sizeKb);
      if (sizeValue.toLowerCase() !== "unavailable") {
        appendInfoLine("Size", sizeValue);
      }
      appendInfoLine("Type", icon?.type);
      appendInfoLine("MIME type", icon?.mimeType);

      row.append(iconCell, infoCell);
      tbody.append(row);
    }
    table.append(tbody);
    tableWrap.append(table);
    iconsBody.append(tableWrap);
  }
  iconsDetails.append(iconsBody);
  accordion.append(iconsDetails);

  output.append(accordion);
  initializeAccordionAnimations(output);
}

function renderA11y(result) {
  const infoOutput = document.getElementById("a11y-info-output");
  const auditsOutput = document.getElementById("a11y-audits-output");
  if (!infoOutput || !auditsOutput) {
    return;
  }
  infoOutput.textContent = "";
  auditsOutput.textContent = "";

  const missingAltSamples = Array.isArray(result?.missingAltSamples) ? result.missingAltSamples : [];
  const lowContrastSamples = Array.isArray(result?.lowContrastSamples) ? result.lowContrastSamples : [];
  const headingTree = Array.isArray(result?.headingTree) ? result.headingTree : [];
  const htmlLangMissing = Boolean(result?.htmlLangMissing);
  const htmlLangValue = typeof result?.htmlLangValue === "string" ? result.htmlLangValue : null;

  const auditsAccordion = document.createElement("div");
  auditsAccordion.className = "accordion border-bottom-0";
  let auditIssueCount = 0;

  if (htmlLangMissing) {
    const htmlLangDetails = document.createElement("details");
    htmlLangDetails.className = "accordion-item border-bottom-0";
    htmlLangDetails.setAttribute("name", "a11y-issues");
    const htmlLangSummary = document.createElement("summary");
    htmlLangSummary.className = "accordion-button rounded-top";
    const htmlLangHeader = document.createElement("h2");
    htmlLangHeader.className = "accordion-header user-select-none fs-6 text-body";
    htmlLangHeader.textContent = "Missing HTML lang attribute";
    htmlLangSummary.append(htmlLangHeader);
    htmlLangDetails.append(htmlLangSummary);
    const htmlLangBody = document.createElement("div");
    htmlLangBody.className = "accordion-body border-bottom p-2";
    const htmlLangText = document.createElement("p");
    htmlLangText.className = "small mb-0";
    if (htmlLangValue) {
      htmlLangText.append("The page has an invalid or empty ");
      const langCode = document.createElement("code");
      langCode.className = "font-monospace";
      langCode.textContent = "lang";
      htmlLangText.append(langCode, ` attribute: "${htmlLangValue}". Use a valid BCP 47 language tag (e.g. en, en-US) on `);
      const htmlCode = document.createElement("code");
      htmlCode.className = "font-monospace";
      htmlCode.textContent = "<html>";
      htmlLangText.append(htmlCode, ".");
    } else {
      htmlLangText.append("The page is missing a ");
      const langCode = document.createElement("code");
      langCode.className = "font-monospace";
      langCode.textContent = "lang";
      htmlLangText.append(langCode, " attribute on ");
      const htmlCode = document.createElement("code");
      htmlCode.className = "font-monospace";
      htmlCode.textContent = "<html>";
      htmlLangText.append(htmlCode, ". Add a valid BCP 47 language tag (e.g. en, en-US).");
    }
    htmlLangBody.append(htmlLangText);
    htmlLangDetails.append(htmlLangBody);
    auditsAccordion.append(htmlLangDetails);
    auditIssueCount += 1;
  }

  if (missingAltSamples.length > 0) {
    const missingAltDetails = document.createElement("details");
    missingAltDetails.className = "accordion-item border-bottom-0";
    missingAltDetails.setAttribute("name", "a11y-issues");
    const missingAltSummary = document.createElement("summary");
    missingAltSummary.className = "accordion-button rounded-top";
    const missingAltHeader = document.createElement("h2");
    missingAltHeader.className = "accordion-header user-select-none fs-6 text-body";
    missingAltHeader.textContent = `Missing alt tags (${missingAltSamples.length})`;
    missingAltSummary.append(missingAltHeader);
    missingAltDetails.append(missingAltSummary);
    const missingAltBody = document.createElement("div");
    missingAltBody.className = "accordion-body border-bottom p-2";
    const missingAltList = document.createElement("ul");
    missingAltList.className = "small mb-0 ps-3";
    for (const sample of missingAltSamples) {
      const li = document.createElement("li");
      const raw = String(sample ?? "");
      if (/^https?:\/\//i.test(raw)) {
        const link = document.createElement("a");
        link.href = raw;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = raw;
        li.append(link);
      } else {
        li.textContent = raw;
      }
      missingAltList.append(li);
    }
    missingAltBody.append(missingAltList);
    missingAltDetails.append(missingAltBody);
    auditsAccordion.append(missingAltDetails);
    auditIssueCount += missingAltSamples.length;
  }

  if (lowContrastSamples.length > 0) {
    const lowContrastDetails = document.createElement("details");
    lowContrastDetails.className = "accordion-item border-bottom-0";
    lowContrastDetails.setAttribute("name", "a11y-issues");
    const lowContrastSummary = document.createElement("summary");
    lowContrastSummary.className = "accordion-button rounded-top";
    const lowContrastHeader = document.createElement("h2");
    lowContrastHeader.className = "accordion-header user-select-none fs-6 text-body";
    lowContrastHeader.append(
      "Low contrast findings ",
      Object.assign(document.createElement("span"), { className: "opacity-75", textContent: `(${lowContrastSamples.length})` })
    );
    lowContrastSummary.append(lowContrastHeader);
    lowContrastDetails.append(lowContrastSummary);
    const lowContrastBody = document.createElement("div");
    lowContrastBody.className = "accordion-body border-bottom p-2";
    const lowContrastList = document.createElement("ul");
    lowContrastList.className = "small mb-0 ps-3";
    for (const sample of lowContrastSamples) {
      const li = document.createElement("li");
      const text = String(sample ?? "");
      const match = text.match(/^(.*)\s(\(contrast\s[\d.]+:1\))$/i);
      if (match) {
        li.append(document.createTextNode(`${match[1]} `));
        const meta = document.createElement("span");
        meta.className = "opacity-75";
        meta.textContent = match[2];
        li.append(meta);
      } else {
        li.textContent = text;
      }
      lowContrastList.append(li);
    }
    lowContrastBody.append(lowContrastList);
    lowContrastDetails.append(lowContrastBody);
    auditsAccordion.append(lowContrastDetails);
    auditIssueCount += lowContrastSamples.length;
  }

  if (auditIssueCount === 0) {
    const empty = document.createElement("p");
    empty.className = "small text-success mb-0";
    empty.textContent = "No accessibility issues discovered.";
    auditsOutput.append(empty);
  } else {
    auditsOutput.append(auditsAccordion);
  }

  const infoAccordion = document.createElement("div");
  infoAccordion.className = "accordion border-bottom-0";
  const headingTreeDetails = document.createElement("details");
  headingTreeDetails.className = "accordion-item border-bottom-0";
  headingTreeDetails.setAttribute("name", "a11y-info");
  headingTreeDetails.open = true;
  const headingTreeSummary = document.createElement("summary");
  headingTreeSummary.className = "accordion-button rounded-top";
  const headingTreeHeader = document.createElement("h2");
  headingTreeHeader.className = "accordion-header user-select-none fs-6 text-body";
  headingTreeHeader.append(document.createTextNode("Heading tree "));
  const headingTreeCount = document.createElement("span");
  headingTreeCount.className = "opacity-75";
  headingTreeCount.textContent = `(${headingTree.length})`;
  headingTreeHeader.append(headingTreeCount);
  headingTreeSummary.append(headingTreeHeader);
  lockAccordionWhenEmpty(headingTreeDetails, headingTreeSummary, headingTree.length);
  headingTreeDetails.append(headingTreeSummary);
  const headingTreeBody = document.createElement("div");
  headingTreeBody.className = "accordion-body border-bottom p-2";
  const headingTreeWrap = document.createElement("div");
  headingTreeWrap.className = "small";
  for (const raw of headingTree) {
    const text = String(raw ?? "");
    const match = text.match(/^h([1-6])\s*:\s*(.*)$/i);
    const level = match ? Number(match[1]) : 1;
    const headingTag = `H${level}`;
    const headingText = match ? match[2] : text;
    const item = document.createElement("div");
    item.className = "d-flex align-items-start gap-2";
    const badge = document.createElement("span");
    badge.className = "badge text-bg-secondary";
    badge.textContent = headingTag;
    const label = document.createElement("span");
    label.className = "text-break";
    label.textContent = headingText;
    item.append(badge, label);
    const indent = Math.max(0, level - 1) * 18;
    item.style.marginLeft = `${indent}px`;
    if (level > 1) {
      item.style.borderLeft = "1px solid var(--bs-border-color)";
      item.style.paddingLeft = "8px";
    }
    headingTreeWrap.append(item);
  }
  if (!headingTree.length) {
    const empty = document.createElement("div");
    empty.className = "small text-success";
    empty.textContent = "None";
    headingTreeBody.append(empty);
  } else {
    headingTreeBody.append(headingTreeWrap);
  }
  headingTreeDetails.append(headingTreeBody);
  infoAccordion.append(headingTreeDetails);

  infoOutput.append(infoAccordion);
  initializeAccordionAnimations(auditsOutput);
  initializeAccordionAnimations(infoOutput);
}

function renderPerf(result) {
  const safeResult = result && typeof result === "object" ? result : {};
  const largeImages = Array.isArray(safeResult.largeImages) ? safeResult.largeImages : [];
  const blockingHeadScripts = Array.isArray(safeResult.blockingHeadScripts)
    ? safeResult.blockingHeadScripts
    : [];
  const externalScripts = Array.isArray(safeResult.externalScripts)
    ? safeResult.externalScripts
    : [];
  const domNodes = safeResult.domNodes ?? 0;
  const pageWeightKb = safeResult.pageWeightKb ?? 0;

  const output = document.getElementById("perf-output");
  output.textContent = "";

  const summaryCards = document.createElement("div");
  summaryCards.className = "row row-cols-2 g-2 mb-2";
  summaryCards.append(
    createCssOverviewMetricCard("Total DOM nodes", domNodes),
    createCssOverviewMetricCard("Page weight estimate", `${pageWeightKb} KB`)
  );

  const accordion = document.createElement("div");
  accordion.className = "accordion border-bottom-0";

  if (externalScripts.length > 0) {
    const externalDetails = document.createElement("details");
    externalDetails.className = "accordion-item border-bottom-0";
    externalDetails.setAttribute("name", "accordion");
    const externalSummary = document.createElement("summary");
    externalSummary.className = "accordion-button rounded-top";
    const externalHeader = document.createElement("h2");
    externalHeader.className = "accordion-header user-select-none fs-6 text-body";
    externalHeader.append("External scripts ");
    const externalCount = document.createElement("span");
    externalCount.className = "opacity-75";
    externalCount.textContent = `(${externalScripts.length})`;
    externalHeader.append(externalCount);
    externalSummary.append(externalHeader);
    externalDetails.append(externalSummary);
    const externalBody = document.createElement("div");
    externalBody.className = "accordion-body border-bottom p-2";
    const externalList = document.createElement("ul");
    externalList.className = "small mb-0 ps-3";
    for (const scriptInfo of externalScripts) {
      const rawUrl = typeof scriptInfo === "object" && scriptInfo
        ? String(scriptInfo.url || "")
        : String(scriptInfo || "");
      const url = rawUrl;
      const sizeKb = typeof scriptInfo === "object" && scriptInfo
        ? scriptInfo.sizeKb
        : null;
      const sizeLabel = sizeKb === null || sizeKb === undefined
        ? "size unavailable"
        : `${sizeKb} KB`;

      const li = document.createElement("li");
      if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = url;
        li.append(link);
      } else {
        li.textContent = "(unknown script URL)";
      }
      const size = document.createElement("span");
      size.className = "opacity-75 small";
      size.textContent = ` (${sizeLabel})`;
      li.append(size);
      externalList.append(li);
    }
    externalBody.append(externalList);
    externalDetails.append(externalBody);
    accordion.append(externalDetails);
  }

  const blockingDetails = document.createElement("details");
  blockingDetails.className = "accordion-item border-bottom-0";
  blockingDetails.setAttribute("name", "accordion");
  const blockingSummary = document.createElement("summary");
  blockingSummary.className = "accordion-button rounded-top";
    const blockingHeader = document.createElement("h2");
    blockingHeader.className = "accordion-header user-select-none fs-6 text-body";
    blockingHeader.append("Blocking <head> scripts ");
    const blockingCount = document.createElement("span");
    blockingCount.className = "opacity-75";
    blockingCount.textContent = `(${blockingHeadScripts.length})`;
    blockingHeader.append(blockingCount);
    blockingSummary.append(blockingHeader);
  lockAccordionWhenEmpty(blockingDetails, blockingSummary, blockingHeadScripts.length);
  blockingDetails.append(blockingSummary);
  const blockingBody = document.createElement("div");
  blockingBody.className = "accordion-body border-bottom p-2";
  const blockingList = document.createElement("ul");
  blockingList.className = "small mb-0 ps-3";
  for (const src of blockingHeadScripts) {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = src;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = src;
    li.append(link);
    blockingList.append(li);
  }
  blockingBody.append(blockingList);
  blockingDetails.append(blockingBody);
  accordion.append(blockingDetails);

  if (largeImages.length > 0) {
    const largeDetails = document.createElement("details");
    largeDetails.className = "accordion-item border-bottom-0";
    largeDetails.setAttribute("name", "accordion");
    const largeSummary = document.createElement("summary");
    largeSummary.className = "accordion-button rounded-top";
    const largeHeader = document.createElement("h2");
    largeHeader.className = "accordion-header user-select-none fs-6 text-body";
    largeHeader.append("Large images ");
    const largeCount = document.createElement("span");
    largeCount.className = "opacity-75";
    largeCount.textContent = `(${largeImages.length})`;
    largeHeader.append(largeCount);
    largeSummary.append(largeHeader);
    largeDetails.append(largeSummary);
    const largeBody = document.createElement("div");
    largeBody.className = "accordion-body border-bottom p-2";
    const largeList = document.createElement("ul");
    largeList.className = "mb-0 ps-3";
    for (const imageInfo of largeImages) {
      const url = typeof imageInfo === "object" && imageInfo
        ? String(imageInfo.url || "")
        : String(imageInfo || "");
      const label = typeof imageInfo === "object" && imageInfo
        ? String(imageInfo.label || url)
        : url;
      const sizeText = typeof imageInfo === "object" && imageInfo
        ? String(imageInfo.sizeText || "")
        : "";

      const li = document.createElement("li");
      li.className = "small";

      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = label;
      li.append(link);

      if (sizeText) {
        li.append(document.createTextNode(" "));
        const meta = document.createElement("span");
        meta.className = "small opacity-75";
        meta.textContent = `(${sizeText})`;
        li.append(meta);
      }

      largeList.append(li);
    }
    largeBody.append(largeList);
    largeDetails.append(largeBody);
    accordion.append(largeDetails);
  }

  output.append(summaryCards, accordion);
  initializeAccordionAnimations(output);
}

function formatNetworkSizeKb(sizeKb) {
  const numeric = Number(sizeKb);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }
  if (numeric >= 100) {
    return `${Math.round(numeric)} KB`;
  }
  return `${numeric.toFixed(1)} KB`;
}

function formatNetworkTimeMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "";
  }
  return `${numeric.toFixed(1)} ms`;
}

function formatNetworkProtocol(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }
  if (raw === "h2") {
    return "HTTP/2";
  }
  if (raw === "h3") {
    return "HTTP/3";
  }
  if (raw === "h1" || raw === "http/1.1") {
    return "HTTP/1.1";
  }
  if (raw === "h2c") {
    return "HTTP/2 (cleartext)";
  }
  if (raw === "http/3" || raw === "http/2") {
    return raw.toUpperCase();
  }
  return String(value);
}

function isNetworkImageAsset(item) {
  if (item?.type === "images") {
    return true;
  }
  const mime = String(item?.mimeType || "").toLowerCase().trim();
  if (mime.startsWith("image/")) {
    return true;
  }
  const ext = getNetworkAssetExtension(item);
  return ["svg", "jpg", "jpeg", "jfif", "pjpeg", "pjp", "gif", "webp", "png", "avif", "bmp", "ico", "tif", "tiff"].includes(ext);
}

function isNetworkVideoAsset(item) {
  const mime = String(item?.mimeType || "").toLowerCase().trim();
  if (mime.startsWith("video/")) {
    return true;
  }
  const ext = getNetworkAssetExtension(item);
  return ["mp4", "webm", "ogg", "ogv", "mov", "m4v", "m3u8", "mpd"].includes(ext);
}

function isNetworkSourceAsset(item) {
  const mime = String(item?.mimeType || "").toLowerCase().trim();
  if (
    mime.startsWith("text/")
    || mime.includes("json")
    || mime.includes("xml")
    || mime.includes("javascript")
    || mime.includes("ecmascript")
    || mime.includes("svg")
  ) {
    return true;
  }
  const ext = getNetworkAssetExtension(item);
  const sourceExts = new Set([
    "html", "htm", "css", "js", "mjs", "cjs", "json", "map", "xml", "svg",
    "txt", "md", "csv", "ts", "tsx", "jsx", "yml", "yaml", "webmanifest",
  ]);
  const binaryExts = new Set([
    "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "ico", "tif", "tiff",
    "mp4", "webm", "ogg", "ogv", "mov", "m4v", "m3u8", "mpd",
    "woff", "woff2", "ttf", "otf", "eot", "pdf", "zip", "gz", "br",
  ]);
  if (binaryExts.has(ext)) {
    return false;
  }
  return sourceExts.has(ext);
}

function escapeHtml(input) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getNetworkSourceLanguage(mimeType = "", fileName = "") {
  const normalizedMime = String(mimeType || "").toLowerCase();
  const ext = String(fileName || "")
    .trim()
    .toLowerCase()
    .split("?")[0]
    .split("#")[0]
    .split(".")
    .pop();

  if (
    normalizedMime.includes("json")
    || normalizedMime.includes("manifest")
    || normalizedMime.includes("webmanifest")
    || ext === "json"
    || ext === "webmanifest"
  ) {
    return "json";
  }
  if (
    normalizedMime.includes("html")
    || normalizedMime.includes("xml")
    || normalizedMime.includes("svg")
    || ["html", "htm", "xml", "svg"].includes(ext)
  ) {
    return "markup";
  }
  if (normalizedMime.includes("css") || ext === "css") {
    return "css";
  }
  if (
    normalizedMime.includes("javascript")
    || normalizedMime.includes("ecmascript")
    || normalizedMime.includes("typescript")
    || ["js", "mjs", "cjs", "jsx", "ts", "tsx"].includes(ext)
  ) {
    return "javascript";
  }
  return "plain";
}

function formatSourceWithPrettierLikeRules(sourceText, mimeType = "", fileName = "") {
  const text = String(sourceText ?? "");
  const language = getNetworkSourceLanguage(mimeType, fileName);
  const normalizeLineEndings = (value) => value.replaceAll("\r\n", "\n");

  const formatBracketLanguage = (value, breakSemicolons = true) => {
    const input = normalizeLineEndings(value);
    let formatted = "";
    let indentLevel = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let escaped = false;
    let lastNonSpace = "";

    const pushIndent = () => {
      formatted += "  ".repeat(Math.max(0, indentLevel));
    };

    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      const next = input[i + 1] || "";

      if (escaped) {
        formatted += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        formatted += char;
        escaped = true;
        continue;
      }

      if (!inDouble && !inTemplate && char === "'" && !inSingle) {
        inSingle = true;
        formatted += char;
        continue;
      }
      if (inSingle && char === "'") {
        inSingle = false;
        formatted += char;
        continue;
      }
      if (!inSingle && !inTemplate && char === "\"" && !inDouble) {
        inDouble = true;
        formatted += char;
        continue;
      }
      if (inDouble && char === "\"") {
        inDouble = false;
        formatted += char;
        continue;
      }
      if (!inSingle && !inDouble && char === "`") {
        inTemplate = !inTemplate;
        formatted += char;
        continue;
      }

      if (inSingle || inDouble || inTemplate) {
        formatted += char;
        continue;
      }

      if (char === "{" || char === "[") {
        if (!formatted.endsWith("\n")) {
          formatted += "\n";
        }
        pushIndent();
        formatted += char;
        formatted += "\n";
        indentLevel += 1;
        pushIndent();
        lastNonSpace = char;
        continue;
      }

      if (char === "}" || char === "]") {
        indentLevel = Math.max(0, indentLevel - 1);
        if (!formatted.endsWith("\n")) {
          formatted += "\n";
        }
        pushIndent();
        formatted += char;
        if (next && next !== "," && next !== "\n" && next !== ";") {
          formatted += "\n";
          pushIndent();
        }
        lastNonSpace = char;
        continue;
      }

      if (char === "," || (breakSemicolons && char === ";")) {
        formatted += char;
        formatted += "\n";
        pushIndent();
        lastNonSpace = char;
        continue;
      }

      if (char === "\n") {
        if (!formatted.endsWith("\n")) {
          formatted += "\n";
        }
        pushIndent();
        continue;
      }

      if (char === ":" && language === "css") {
        formatted += ": ";
        lastNonSpace = char;
        continue;
      }

      if (char === " " || char === "\t") {
        if (lastNonSpace && !formatted.endsWith(" ") && !formatted.endsWith("\n")) {
          formatted += " ";
        }
        continue;
      }

      formatted += char;
      if (char.trim()) {
        lastNonSpace = char;
      }
    }

    return formatted
      .split("\n")
      .map((line) => line.replace(/\s+$/g, ""))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  if (language === "json") {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  }

  if (language === "css") {
    return formatBracketLanguage(text, true);
  }

  if (language === "javascript") {
    return formatBracketLanguage(text, true);
  }

  if (language === "markup") {
    const lines = normalizeLineEndings(text)
      .replace(/>\s+</g, ">\n<")
      .split("\n");
    let indentLevel = 0;
    const indented = lines.map((rawLine) => {
      const line = rawLine.trim();
      if (!line) {
        return "";
      }
      if (/^<\//.test(line)) {
        indentLevel = Math.max(0, indentLevel - 1);
      }
      const result = `${"  ".repeat(indentLevel)}${line}`;
      if (/^<[^!?/][^>]*[^/]?>$/.test(line) && !line.includes("</")) {
        indentLevel += 1;
      }
      return result;
    });
    return indented.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return normalizeLineEndings(text).trimEnd();
}

function makeSourceFrameDoc(codeText, mimeType = "", fileName = "") {
  const escapedCode = escapeHtml(codeText);
  const language = getNetworkSourceLanguage(mimeType, fileName);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html, body { margin: 0; width: 100%; height: 100%; background: #0b0f14; color: #d7dde7; }
  pre {
    margin: 0;
    padding: 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    overflow: auto;
    height: 100%;
    box-sizing: border-box;
    tab-size: 2;
  }
  code { font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, monospace; }
  .tok-comment { color: #6c7a89; }
  .tok-keyword { color: #ff9d5c; }
  .tok-string { color: #a5d76e; }
  .tok-number { color: #6bc1ff; }
  .tok-operator { color: #ffd166; }
  .tok-tag { color: #67d4ff; }
  .tok-attr { color: #f7c06a; }
</style>
</head>
<body>
  <pre data-language="${language}"><code id="source-code">${escapedCode}</code></pre>
  <script>
    (() => {
      const codeNode = document.getElementById("source-code");
      if (!(codeNode instanceof HTMLElement)) {
        return;
      }
      const pre = codeNode.closest("pre");
      const language = pre?.dataset?.language || "plain";
      const source = codeNode.textContent || "";
      const esc = (text) => String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");

      const wrap = (regex, className, input) => input.replace(regex, '<span class="' + className + '">$&</span>');

      const highlightMarkup = (text) => {
        let out = esc(text);
        out = wrap(/&lt;!--[\s\S]*?--&gt;/g, "tok-comment", out);
        out = out.replace(/(&lt;\/?)([a-zA-Z][\w:-]*)([^&]*?)(\/?&gt;)/g, (_, open, tag, attrs, close) => {
          const highlightedAttrs = attrs.replace(/\s([a-zA-Z_:][\w:.-]*)(\s*=\s*)(\"[^\"]*\"|\'[^\']*\')/g, (match, name, eq, value) => {
            return " " + '<span class="tok-attr">' + name + "</span>" + eq + '<span class="tok-string">' + value + "</span>";
          });
          return open + '<span class="tok-tag">' + tag + "</span>" + highlightedAttrs + close;
        });
        return out;
      };

      const highlightJson = (text) => {
        let out = esc(text);
        out = wrap(/\"(?:\\.|[^\"\\])*\"(?=\s*:)/g, "tok-attr", out);
        out = wrap(/\"(?:\\.|[^\"\\])*\"/g, "tok-string", out);
        out = wrap(/\b(?:true|false|null)\b/g, "tok-keyword", out);
        out = wrap(/-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, "tok-number", out);
        return out;
      };

      const highlightCode = (text, keywordRegex) => {
        let out = esc(text);
        out = wrap(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "tok-comment", out);
        out = wrap(/\"(?:\\.|[^\"\\])*\"|\'(?:\\.|[^\'\\])*\'|\`(?:\\.|[^\`\\])*\`/g, "tok-string", out);
        if (keywordRegex) {
          out = wrap(keywordRegex, "tok-keyword", out);
        }
        out = wrap(/-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g, "tok-number", out);
        out = wrap(/[{}()[\];,.:+\-*/%=<>!&|?]/g, "tok-operator", out);
        return out;
      };

      if (language === "markup") {
        codeNode.innerHTML = highlightMarkup(source);
        return;
      }
      if (language === "json") {
        codeNode.innerHTML = highlightJson(source);
        return;
      }
      if (language === "css") {
        codeNode.innerHTML = highlightCode(source, /\b(?:@media|@supports|@keyframes|from|to|important)\b/g);
        return;
      }
      if (language === "javascript") {
        codeNode.innerHTML = highlightCode(source, /\b(?:const|let|var|function|return|if|else|for|while|switch|case|break|continue|try|catch|finally|throw|new|class|extends|import|export|async|await|true|false|null|undefined)\b/g);
        return;
      }
      codeNode.innerHTML = highlightCode(source, /\b(?:true|false|null|undefined|yes|no|on|off)\b/g);
    })();
  </script>
</body>
</html>`;
}

function createNetworkInfoCard(label, value) {
  const col = document.createElement("div");
  col.className = "col";

  const card = document.createElement("div");
  card.className = "card rounded-2 bg-transparent h-100 shadow-sm border";

  const header = document.createElement("div");
  header.className = "card-header py-1 px-2 bg-secondary bg-opacity-10 border-0";

  const labelNode = document.createElement("div");
  labelNode.className = "card-title small opacity-75 mb-0";
  labelNode.textContent = label;

  const valueNode = document.createElement("div");
  valueNode.className = "card-body p-2 small text-break font-monospace";
  const textValue = String(value ?? "");
  valueNode.textContent = textValue;
  if (textValue.trim().toLowerCase() === "unavailable") {
    valueNode.classList.add("opacity-75");
  }

  header.append(labelNode);
  card.append(header, valueNode);
  col.append(card);
  return col;
}

function showNetworkAssetDetails(item) {
  const rawName = String(item?.name || "Asset");
  const title = rawName.length > 42 ? `${rawName.slice(0, 42)}...` : rawName;
  const { overlay, panel } = showDialogShell(title);
  panel.style.maxWidth = "360px";
  panel.style.maxHeight = "92vh";
  panel.classList.add("d-flex", "flex-column", "overflow-hidden");

  const errorBlock = document.createElement("pre");
  errorBlock.className = "small text-danger border rounded p-2 mt-2 mb-0 d-none overflow-auto";
  errorBlock.style.whiteSpace = "pre-wrap";
  errorBlock.style.maxHeight = "120px";

  const showModalError = (context, error) => {
    const message = String(error?.message || error || "Unknown error");
    const stack = typeof error?.stack === "string" ? error.stack : "";
    const detail = stack ? `${message}\n${stack}` : message;
    errorBlock.textContent = `[${context}] ${detail}`;
    errorBlock.classList.remove("d-none");
  };

  try {
    const heading = panel.querySelector(".small.fw-semibold.mb-2");
    const hasSourceTab = isNetworkSourceAsset(item) && Boolean(item?.url);
    const hasFontPreviewTab = item?.type === "font" && Boolean(item?.url);
    const sourceState = {
      loaded: false,
      loading: false,
      text: "",
      renderedText: "",
      mimeType: String(item?.mimeType || ""),
    };
    const sourceFileName = String(item?.name || item?.url || "");
    let sourcePaneToolbar = null;
    let sourceMimeNode = null;
    let copyBtn = null;
    let prettierBtn = null;
    const fontPreviewState = { loaded: false, loading: false };

    const header = document.createElement("div");
    header.className = "d-flex align-items-start justify-content-between mb-2";
    if (heading instanceof HTMLElement) {
      heading.className = "small fw-semibold mb-0 text-truncate pe-2";
      heading.style.maxWidth = "calc(100% - 96px)";
      if (heading.parentNode) {
        heading.parentNode.removeChild(heading);
      }
      header.appendChild(heading);
    }
    const rightActions = document.createElement("div");
    rightActions.className = "d-flex align-items-center gap-1";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", () => overlay.remove());
    rightActions.append(closeBtn);
    header.append(rightActions);
    panel.insertBefore(header, panel.firstChild);

    const body = document.createElement("div");
    body.className = "d-flex flex-column flex-grow-1 min-h-0 overflow-auto overflow-x-hidden bg-body";
    body.style.webkitOverflowScrolling = "touch";
    panel.append(body);

    const tabs = document.createElement("nav");
    tabs.className = "nav nav-tabs nav-fill mb-2";
    const infoTabBtn = document.createElement("button");
    infoTabBtn.type = "button";
    infoTabBtn.className = "nav-link active py-1 small text-body";
    infoTabBtn.textContent = "Info";
    tabs.append(infoTabBtn);
    let sourceTabBtn = null;
    let previewTabBtn = null;
    if (hasSourceTab) {
      sourceTabBtn = document.createElement("button");
      sourceTabBtn.type = "button";
      sourceTabBtn.className = "nav-link py-1 small text-body";
      sourceTabBtn.textContent = "Source";
      tabs.append(sourceTabBtn);
    }
    if (hasFontPreviewTab) {
      previewTabBtn = document.createElement("button");
      previewTabBtn.type = "button";
      previewTabBtn.className = "nav-link py-1 small text-body";
      previewTabBtn.textContent = "Preview";
      tabs.append(previewTabBtn);
    }
    body.append(tabs);

    const infoPane = document.createElement("div");
    infoPane.className = "d-block";
    const sourcePane = document.createElement("div");
    sourcePane.className = "d-none flex-grow-1 min-h-0";
    const previewPane = document.createElement("div");
    previewPane.className = "d-none flex-grow-1 min-h-0";
    body.append(infoPane, sourcePane, previewPane);
    body.append(errorBlock);

    const setModalTab = async (tabName) => {
      try {
        const isInfo = tabName === "info";
        const isSource = tabName === "source";
        const isPreview = tabName === "preview";
        infoTabBtn.classList.toggle("active", isInfo);
        infoPane.classList.toggle("d-none", !isInfo);
        if (sourceTabBtn) {
          sourceTabBtn.classList.toggle("active", isSource);
        }
        if (previewTabBtn) {
          previewTabBtn.classList.toggle("active", isPreview);
        }
        sourcePane.classList.toggle("d-none", !isSource);
        previewPane.classList.toggle("d-none", !isPreview);

        if (sourcePaneToolbar) {
          sourcePaneToolbar.classList.toggle("d-none", !isSource);
        }

        if (isSource && hasSourceTab && !sourceState.loaded && !sourceState.loading) {
          sourceState.loading = true;
          sourcePane.textContent = "";
          const loading = document.createElement("div");
          loading.className = "small opacity-75";
          loading.textContent = "Loading source...";
          sourcePane.append(loading);
          try {
            const response = await fetch(String(item.url), { cache: "no-store" });
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            const contentType = response.headers.get("content-type");
            if (contentType) {
              sourceState.mimeType = contentType;
            }
            sourceState.text = await response.text();
            sourceState.renderedText = sourceState.text;
            sourceState.loaded = true;
            sourcePane.textContent = "";
            if (sourceMimeNode) {
              sourceMimeNode.textContent = sourceState.mimeType || "text/plain";
            }
            const frame = document.createElement("iframe");
            frame.className = "w-100 h-100 border rounded bg-body";
            frame.style.minHeight = "56vh";
            frame.setAttribute("sandbox", "allow-scripts");
            frame.setAttribute("title", "Asset source");
            frame.srcdoc = makeSourceFrameDoc(sourceState.renderedText, sourceState.mimeType, sourceFileName);
            sourcePane.append(frame);
            if (sourcePaneToolbar) {
              sourcePaneToolbar.classList.remove("d-none");
            }
            if (copyBtn) {
              copyBtn.disabled = false;
            }
            if (prettierBtn) {
              prettierBtn.disabled = false;
            }
          } catch (error) {
            sourcePane.textContent = "";
            const msg = document.createElement("div");
            msg.className = "small text-danger";
            msg.textContent = String(error?.message || error || "Could not load source.");
            sourcePane.append(msg);
            if (sourcePaneToolbar) {
              sourcePaneToolbar.classList.remove("d-none");
            }
            if (copyBtn) {
              copyBtn.disabled = true;
            }
            if (prettierBtn) {
              prettierBtn.disabled = true;
            }
          } finally {
            sourceState.loading = false;
          }
        }

        if (isPreview && hasFontPreviewTab && !fontPreviewState.loaded && !fontPreviewState.loading) {
          fontPreviewState.loading = true;
          previewPane.textContent = "";
          const loading = document.createElement("div");
          loading.className = "small opacity-75";
          loading.textContent = "Loading font preview...";
          previewPane.append(loading);
          try {
            const baseFamily = String(item?.name || "Font Preview")
              .replace(/\.[a-z0-9]+$/i, "")
              .replace(/[^\w -]/g, "")
              .trim() || "Font Preview";
            const familyName = `WDT Preview ${baseFamily}`;
            const fontFace = new FontFace(familyName, `url("${String(item.url)}")`);
            await fontFace.load();
            document.fonts.add(fontFace);

            previewPane.textContent = "";
            const previewCard = document.createElement("div");
            previewCard.className = "border rounded p-3 bg-body-secondary bg-opacity-10";

            const titleNode = document.createElement("div");
            titleNode.className = "small text-body-secondary mb-2";
            titleNode.textContent = familyName;

            const lineLarge = document.createElement("p");
            lineLarge.className = "mb-2";
            lineLarge.style.fontFamily = `"${familyName}", sans-serif`;
            lineLarge.style.fontSize = "24px";
            lineLarge.style.lineHeight = "1.3";
            lineLarge.textContent = "The quick brown fox jumps over the lazy dog";

            const lineSmall = document.createElement("p");
            lineSmall.className = "mb-0";
            lineSmall.style.fontFamily = `"${familyName}", sans-serif`;
            lineSmall.style.fontSize = "16px";
            lineSmall.style.lineHeight = "1.4";
            lineSmall.textContent = "The quick brown fox jumps over the lazy dog";

            previewCard.append(titleNode, lineLarge, lineSmall);
            previewPane.append(previewCard);
            fontPreviewState.loaded = true;
          } catch (error) {
            previewPane.textContent = "";
            const msg = document.createElement("div");
            msg.className = "small text-danger";
            msg.textContent = `Could not load font preview: ${String(error?.message || error || "Unknown error")}`;
            previewPane.append(msg);
          } finally {
            fontPreviewState.loading = false;
          }
        }
      } catch (error) {
        showModalError("setModalTab", error);
      }
    };

    infoTabBtn.addEventListener("click", () => {
      void setModalTab("info");
    });
    if (sourceTabBtn) {
      sourceTabBtn.addEventListener("click", () => {
        void setModalTab("source");
      });
    }
    if (previewTabBtn) {
      previewTabBtn.addEventListener("click", () => {
        void setModalTab("preview");
      });
    }

    if (hasSourceTab) {
      sourcePaneToolbar = document.createElement("div");
      sourcePaneToolbar.className = "d-none d-flex align-items-center justify-content-between gap-2 mb-1";
      sourceMimeNode = document.createElement("div");
      sourceMimeNode.className = "small text-body-secondary font-monospace text-truncate";
      sourceMimeNode.textContent = sourceState.mimeType || "text/plain";
      sourceMimeNode.style.maxWidth = "62%";

      const sourceActions = document.createElement("div");
      sourceActions.className = "d-flex align-items-center gap-1";

      copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "btn btn-sm btn-secondary py-0 px-2";
      copyBtn.textContent = "Copy";
      copyBtn.disabled = true;
      copyBtn.addEventListener("click", async () => {
        if (!sourceState.renderedText) {
          return;
        }
        try {
          await navigator.clipboard.writeText(sourceState.renderedText);
          flashButtonLabel(copyBtn, "Copied");
        } catch {
          setStatus("Could not copy source.", true);
        }
      });

      prettierBtn = document.createElement("button");
      prettierBtn.type = "button";
      prettierBtn.className = "btn btn-sm btn-secondary py-0 px-2";
      prettierBtn.textContent = "Prettier";
      prettierBtn.disabled = true;
      prettierBtn.addEventListener("click", () => {
        if (!sourceState.loaded || !sourceState.text) {
          return;
        }
        try {
          sourceState.renderedText = formatSourceWithPrettierLikeRules(
            sourceState.text,
            sourceState.mimeType,
            sourceFileName,
          );
          sourcePane.textContent = "";
          const frame = document.createElement("iframe");
          frame.className = "w-100 h-100 border rounded bg-body";
          frame.style.minHeight = "56vh";
          frame.setAttribute("sandbox", "");
          frame.setAttribute("title", "Asset source");
          frame.srcdoc = makeSourceFrameDoc(sourceState.renderedText, sourceState.mimeType, sourceFileName);
          sourcePane.append(frame);
          flashButtonLabel(prettierBtn, "Formatted");
        } catch (error) {
          setStatus(`Prettier failed: ${String(error?.message || error || "Unknown error")}`, true);
        }
      });

      sourceActions.append(copyBtn, prettierBtn);
      sourcePaneToolbar.append(sourceMimeNode, sourceActions);
      body.insertBefore(sourcePaneToolbar, sourcePane);
    }

    if (isNetworkImageAsset(item) && item?.url) {
      const previewWrap = document.createElement("div");
      previewWrap.className = "mb-2 text-center";
      const preview = document.createElement("img");
      preview.src = String(item.url);
      preview.alt = String(item.name || "Image preview");
      preview.setAttribute("loading", "lazy");
      preview.setAttribute("fetchpriority", "low");
      preview.className = "img-fluid rounded";
      preview.style.maxHeight = "180px";
      previewWrap.append(preview);
      infoPane.append(previewWrap);
    }
    if (isNetworkVideoAsset(item) && item?.url) {
      const previewWrap = document.createElement("div");
      previewWrap.className = "mb-2";
      const video = document.createElement("video");
      video.src = String(item.url);
      video.controls = true;
      video.autoplay = false;
      video.setAttribute("preload", "metadata");
      video.setAttribute("playsinline", "");
      video.className = "w-100 rounded border";
      video.style.maxHeight = "220px";
      previewWrap.append(video);
      infoPane.append(previewWrap);
    }

    const cards = document.createElement("div");
    cards.className = "row row-cols-3 g-1 mb-2";
    const withFallback = (value) => {
      const text = String(value ?? "").trim();
      return text ? text : "Unavailable";
    };
    const imageAsset = isNetworkImageAsset(item);
    const appendCard = (label, value) => {
      const normalized = withFallback(value);
      if (normalized === "Unavailable") {
        return;
      }
      cards.append(createNetworkInfoCard(label, normalized));
    };
    appendCard("MIME type", item?.mimeType);
    appendCard("Initiator", item?.initiatorType);
    appendCard("Size", formatNetworkSizeKb(item?.sizeKb));
    appendCard("Start time", formatNetworkTimeMs(item?.timeMs));
    appendCard("Duration", formatNetworkTimeMs(item?.durationMs));
    appendCard("Protocol", formatNetworkProtocol(item?.nextHopProtocol));
    appendCard("Transfer", formatNetworkSizeKb(item?.transferSizeKb));
    appendCard("Encoded", formatNetworkSizeKb(item?.encodedBodySizeKb));
    appendCard("Decoded", formatNetworkSizeKb(item?.decodedBodySizeKb));
    if (imageAsset) {
      appendCard("Loading", item?.imageLoading);
      appendCard("Fetch Priority", item?.imageFetchPriority);
      appendCard("Decoding", item?.imageDecoding);
    }
    if (item?.type === "js") {
      appendCard("Async", item?.scriptAsync === true ? "Yes" : "Unavailable");
      appendCard("Defer", item?.scriptDefer === true ? "Yes" : "Unavailable");
    }
    if (cards.childElementCount > 0) {
      infoPane.append(cards);
    }

    const urlValue = String(item?.url || "");
    if (urlValue) {
      const urlWrap = document.createElement("div");
      urlWrap.className = "small mt-2";
      const a = document.createElement("a");
      a.href = urlValue;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "small text-break";
      a.textContent = urlValue;
      urlWrap.append(a);
      infoPane.append(urlWrap);
    }

    void setModalTab("info");
  } catch (error) {
    panel.append(errorBlock);
    showModalError("showNetworkAssetDetails", error);
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });
}

function getNetworkAssetExtension(item) {
  const source = String(item?.url || item?.name || "");
  const clean = source.split("#")[0].split("?")[0];
  const filename = clean.split("/").pop() || "";
  const match = filename.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() || "";
}

function createNetworkTypeIcon(item) {
  const type = String(item?.type || "");
  const icon = document.createElement("span");
  icon.className = "network-type-icon rounded-2 text-uppercase";
  if (type === "doc") {
    icon.textContent = "D";
    icon.classList.add("network-type-doc");
  } else if (type === "css") {
    icon.textContent = "C";
    icon.classList.add("network-type-css");
  } else if (type === "js") {
    icon.textContent = "J";
    icon.classList.add("network-type-js");
  } else if (type === "font") {
    const ext = getNetworkAssetExtension(item);
    if (ext === "woff2") {
      icon.textContent = "W";
      icon.classList.add("network-type-font-woff2");
    } else {
      icon.textContent = "F";
      icon.classList.add("network-type-font");
    }
  } else if (type === "images") {
    const ext = getNetworkAssetExtension(item);
    if (ext === "svg") {
      icon.textContent = "S";
      icon.classList.add("network-type-image-svg");
    } else if (ext === "jpg" || ext === "jpeg" || ext === "jfif" || ext === "pjpeg" || ext === "pjp") {
      icon.textContent = "J";
      icon.classList.add("network-type-image-jpeg");
    } else if (ext === "gif") {
      icon.textContent = "G";
      icon.classList.add("network-type-image-gif");
    } else if (ext === "webp") {
      icon.textContent = "W";
      icon.classList.add("network-type-image-webp");
    } else if (ext === "png") {
      icon.textContent = "P";
      icon.classList.add("network-type-image-png");
    } else if (ext === "avif") {
      icon.textContent = "A";
      icon.classList.add("network-type-image-avif");
    } else {
      icon.textContent = "I";
      icon.classList.add("network-type-images");
    }
  } else {
    if (type === "xhr-fetch") {
      icon.textContent = "X";
      icon.classList.add("network-type-xhr-fetch");
    } else {
      icon.textContent = "O";
      icon.classList.add("network-type-other");
    }
  }
  return icon;
}

function renderNetwork(payload) {
  const output = document.getElementById("network-output");
  const sortWrap = document.getElementById("network-sort-wrap");
  const filterWrap = document.getElementById("network-filter-wrap");
  if (!output) {
    return;
  }
  output.textContent = "";

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const isDocTab = currentNetworkSubtab === "doc";
  const applyThirdPartyFilter = currentNetworkFilter === "third-party" && !isDocTab;
  const applyExcludeThirdPartyFilter = currentNetworkFilter === "exclude-third-party" && !isDocTab;
  const filtered = items.filter((item) => {
    if (item?.type !== currentNetworkSubtab) {
      return false;
    }
    if (applyThirdPartyFilter) {
      return item?.isThirdParty === true;
    }
    if (applyExcludeThirdPartyFilter) {
      return item?.isThirdParty !== true;
    }
    return true;
  });
  if (currentNetworkSort === "name") {
    filtered.sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" }));
  } else if (currentNetworkSort === "type") {
    filtered.sort((a, b) => {
      const aExt = getNetworkAssetExtension(a);
      const bExt = getNetworkAssetExtension(b);
      if (aExt && bExt && aExt !== bExt) {
        return aExt.localeCompare(bExt);
      }
      if (aExt && !bExt) {
        return -1;
      }
      if (!aExt && bExt) {
        return 1;
      }
      return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
    });
  } else if (currentNetworkSort === "filesize") {
    filtered.sort((a, b) => {
      const aSize = Number(a?.sizeKb);
      const bSize = Number(b?.sizeKb);
      const aValue = Number.isFinite(aSize) ? aSize : -1;
      const bValue = Number.isFinite(bSize) ? bSize : -1;
      return bValue - aValue;
    });
  } else {
    filtered.sort((a, b) => {
      const aTime = Number(a?.timeMs);
      const bTime = Number(b?.timeMs);
      const aValue = Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER;
      const bValue = Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER;
      return aValue - bValue;
    });
  }

  const showImagesWrap = document.getElementById("network-show-images-wrap");
  if (!filtered.length) {
    lastRenderedNetworkItems = [];
    sortWrap?.classList.add("d-none");
    filterWrap?.classList.add("d-none");
    showImagesWrap?.classList.add("d-none");
    const empty = document.createElement("p");
    empty.className = "small text-secondary text-center mb-0";
    empty.textContent = "No matching requests found.";
    output.append(empty);
    return;
  }

  if (!hideNetworkInfoAlert) {
    const info = document.createElement("div");
    info.className = "alert alert-info fade show py-2 px-2 mb-2 d-flex align-items-start gap-2";
    info.role = "alert";

    const message = document.createElement("span");
    message.className = "small flex-grow-1";
    message.textContent = "Tap on an asset to view more details.";
    info.append(message);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn-close opacity-75";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.dataset.networkDismissInfo = "true";
    info.append(closeBtn);
    output.append(info);
  }

  if (isDocTab) {
    sortWrap?.classList.add("d-none");
    filterWrap?.classList.add("d-none");
  } else {
    sortWrap?.classList.remove("d-none");
    filterWrap?.classList.remove("d-none");
  }
  showImagesWrap?.classList.toggle("d-none", currentNetworkSubtab !== "images");
  lastRenderedNetworkItems = filtered;

  const tableWrap = document.createElement("div");
  tableWrap.className = "table-responsive";
  const table = document.createElement("table");
  table.className = "table table-bordered table-striped table-sm align-middle mb-0 network-assets-table";

  const thead = document.createElement("thead");
  thead.className = "visually-hidden";
  const headRow = document.createElement("tr");
  headRow.innerHTML = "<th scope=\"col\" class=\"text-center\" style=\"width: 32px; min-width: 32px; max-width: 32px;\">Type</th><th scope=\"col\">Asset info</th>";
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  filtered.forEach((item, index) => {
    const row = document.createElement("tr");

    const iconCell = document.createElement("td");
    iconCell.className = "text-center align-top";
    iconCell.style.minWidth = "32px";
    iconCell.style.maxWidth = "32px";
    iconCell.style.width = "32px";
    if (currentNetworkSubtab === "images" && currentNetworkShowImages && item?.url) {
      const preview = document.createElement("img");
      preview.src = String(item.url);
      preview.alt = String(item.name || "Image thumbnail");
      preview.setAttribute("loading", "lazy");
      preview.setAttribute("fetchpriority", "low");
      preview.className = "network-table-thumb mx-auto d-block";
      preview.addEventListener("error", () => {
        preview.replaceWith(createNetworkTypeIcon(item));
      }, { once: true });
      iconCell.append(preview);
    } else {
      const icon = createNetworkTypeIcon(item);
      iconCell.append(icon);
    }

    const infoCell = document.createElement("td");
    const nameLine = document.createElement("button");
    nameLine.type = "button";
    nameLine.className = "btn p-0 border-0 bg-transparent text-body text-start text-break align-baseline";
    nameLine.style.fontSize = "0.75rem";
    nameLine.style.fontWeight = "400";
    nameLine.dataset.networkAssetIndex = String(index);
    nameLine.textContent = String(item.name || "(unknown)");
    infoCell.append(nameLine);

    const sizeLabel = formatNetworkSizeKb(item.sizeKb);
    if (sizeLabel) {
      const sizeLine = document.createElement("div");
      sizeLine.className = "small opacity-75";
      sizeLine.textContent = sizeLabel;
      infoCell.append(sizeLine);
    }

    row.append(iconCell, infoCell);
    tbody.append(row);
  });
  table.append(tbody);
  tableWrap.append(table);
  output.append(tableWrap);
}

function createCssOverviewStaticRow(label, value) {
  const item = document.createElement("div");
  item.className = "accordion-item border-bottom-0";
  const header = document.createElement("div");
  header.className = "accordion-button rounded-top no-expand";
  header.setAttribute("aria-disabled", "true");
  const title = document.createElement("h2");
  title.className = "accordion-header user-select-none fs-6 text-body mb-0";
  title.append(document.createTextNode(`${label} `));
  const countSpan = document.createElement("span");
  countSpan.className = "opacity-50";
  countSpan.textContent = `(${value})`;
  title.append(countSpan);
  header.append(title);
  item.append(header);
  return item;
}

function createCssOverviewExpandableRow(label, value, bodyContent) {
  const details = document.createElement("details");
  details.className = "accordion-item border-bottom-0";
  details.setAttribute("name", "accordion");
  const summary = document.createElement("summary");
  summary.className = "accordion-button rounded-top";
  const title = document.createElement("h2");
  title.className = "accordion-header user-select-none fs-6 text-body mb-0";
  title.append(document.createTextNode(`${label} `));
  const countSpan = document.createElement("span");
  countSpan.className = (label === "Font families" || label === "Font sizes") ? "opacity-75" : "opacity-50";
  countSpan.textContent = `(${value})`;
  title.append(countSpan);
  summary.append(title);
  const body = document.createElement("div");
  body.className = "accordion-body border-bottom p-2";
  body.append(bodyContent);
  details.append(summary, body);
  return details;
}

function createCssOverviewMetricCard(label, value) {
  const col = document.createElement("div");
  col.className = "col";

  const card = document.createElement("div");
  card.className = "card h-100 bg-transparent border";

  const body = document.createElement("div");
  body.className = "card-body p-2";

  const title = document.createElement("div");
  title.className = "small opacity-75 mb-1";
  title.textContent = label;

  const count = document.createElement("div");
  count.className = "fw-semibold";
  count.textContent = String(value ?? 0);

  body.append(title, count);
  card.append(body);
  col.append(card);
  return col;
}

function createStylesheetUrlList(entries) {
  const wrap = document.createElement("div");
  wrap.className = "d-flex flex-column gap-1";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "text-secondary small";
    empty.textContent = "No external stylesheets.";
    wrap.append(empty);
    return wrap;
  }
  for (const entry of entries) {
    const url = typeof entry === "string" ? entry : String(entry?.url || "");
    if (!url) {
      continue;
    }
    const sizeKbRaw = typeof entry === "string" ? null : entry?.sizeKb;
    const sizeKb = Number.isFinite(Number(sizeKbRaw)) && Number(sizeKbRaw) > 0
      ? Number(sizeKbRaw)
      : null;
    const row = document.createElement("div");
    row.className = "small text-break";

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "small text-break";
    a.textContent = url;
    row.append(a);

    if (sizeKb !== null) {
      const rounded = sizeKb >= 100 ? Math.round(sizeKb) : Number(sizeKb.toFixed(1));
      const size = document.createElement("span");
      size.className = "opacity-75";
      size.textContent = ` (${rounded} KB)`;
      row.append(size);
    }
    wrap.append(row);
  }
  return wrap;
}

function createColorListContent(entries) {
  const wrap = document.createElement("div");
  wrap.className = "row row-cols-2 g-1";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "text-secondary small col-12";
    empty.textContent = "No colors found.";
    wrap.append(empty);
    return wrap;
  }
  for (const entry of entries) {
    const col = document.createElement("div");
    col.className = "col";

    const row = document.createElement("div");
    row.className = "d-flex align-items-center justify-content-between rounded-3 bg-secondary bg-opacity-10 px-2 py-1 h-100";

    const left = document.createElement("div");
    left.className = "d-flex align-items-center gap-2";

    const swatch = document.createElement("span");
    swatch.className = "d-inline-block rounded-circle border";
    swatch.style.width = "0.9rem";
    swatch.style.height = "0.9rem";
    swatch.style.backgroundColor = entry.value;

    const value = document.createElement("code");
    value.className = "font-monospace small";
    value.textContent = entry.value;

    left.append(swatch, value);

    const count = document.createElement("span");
    count.className = "opacity-75 small";
    count.textContent = `${entry.count}`;

    row.append(left, count);
    col.append(row);
    wrap.append(col);
  }
  return wrap;
}

function createFontListContent(entries) {
  const wrap = document.createElement("ul");
  wrap.className = "small mb-0 ps-3";
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "text-secondary";
    empty.textContent = "No data found.";
    wrap.append(empty);
    return wrap;
  }
  for (const entry of entries) {
    const item = document.createElement("li");
    const value = document.createElement("span");
    value.className = "font-monospace";
    value.textContent = entry.value;
    const count = document.createElement("span");
    count.className = "opacity-75";
    count.textContent = ` (${entry.count})`;
    item.append(value, count);
    wrap.append(item);
  }
  return wrap;
}

function createMediaQueriesContent(entries) {
  const wrap = document.createElement("div");
  wrap.className = "d-flex flex-column gap-2";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "text-secondary small";
    empty.textContent = "No media queries found.";
    wrap.append(empty);
    return wrap;
  }
  const maxCount = Math.max(...entries.map((e) => e.count), 1);
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "d-flex align-items-center gap-2 flex-wrap";
    const condition = document.createElement("code");
    condition.className = "font-monospace small text-break";
    condition.textContent = entry.condition;
    const label = document.createElement("span");
    label.className = "opacity-50 small text-nowrap";
    label.textContent = entry.count === 1 ? "1 occurrence" : `${entry.count} occurrences`;
    const barWrap = document.createElement("div");
    barWrap.className = "flex-grow-1 min-w-0";
    barWrap.style.minWidth = "4rem";
    const bar = document.createElement("div");
    bar.className = "rounded bg-primary";
    bar.style.height = "0.5rem";
    bar.style.width = `${(entry.count / maxCount) * 100}%`;
    barWrap.append(bar);
    row.append(condition, label, barWrap);
    wrap.append(row);
  }
  return wrap;
}

function renderCssOverview(payload) {
  const output = document.getElementById("css-overview-output");
  if (!output) {
    return;
  }

  lastCssOverviewPayload = payload;
  output.textContent = "";

  if (!payload || typeof payload !== "object") {
    output.textContent = "CSS overview unavailable on this page.";
    return;
  }

  const overview = payload?.overview && typeof payload.overview === "object" ? payload.overview : {};
  const colors = payload?.colors && typeof payload.colors === "object" ? payload.colors : {};
  const fontInfo = payload?.fontInfo && typeof payload.fontInfo === "object" ? payload.fontInfo : {};
  const stylesheetUrls = Array.isArray(overview.stylesheetUrls) ? overview.stylesheetUrls : [];
  const stylesheetEntries = Array.isArray(overview.stylesheetEntries)
    ? overview.stylesheetEntries
    : stylesheetUrls.map((url) => ({ url, sizeKb: null }));
  const mediaQueries = Array.isArray(payload.mediaQueries) ? payload.mediaQueries : [];

  const summaryCards = document.createElement("div");
  summaryCards.className = "row row-cols-3 g-2 mb-2";
  summaryCards.append(
    createCssOverviewMetricCard("Elements", overview.totalElements ?? 0),
    createCssOverviewMetricCard("Inline Styles", overview.inlineStyleElements ?? 0),
    createCssOverviewMetricCard("Style rules", overview.styleRules ?? 0)
  );

  const accordion = document.createElement("div");
  accordion.className = "accordion border-bottom-0";

  const accordionRows = [
    createCssOverviewExpandableRow(
      "Stylesheets",
      overview.stylesheets ?? 0,
      createStylesheetUrlList(stylesheetEntries)
    ),
    createCssOverviewExpandableRow(
      "Text colors",
      overview.uniqueTextColors ?? 0,
      createColorListContent(Array.isArray(colors.text) ? colors.text : [])
    ),
    createCssOverviewExpandableRow(
      "Background colors",
      overview.uniqueBackgroundColors ?? 0,
      createColorListContent(Array.isArray(colors.background) ? colors.background : [])
    ),
    createCssOverviewExpandableRow(
      "Border colors",
      overview.uniqueBorderColors ?? 0,
      createColorListContent(Array.isArray(colors.border) ? colors.border : [])
    ),
  ];

  if ((overview.uniqueFillColors ?? 0) > 0) {
    accordionRows.push(
      createCssOverviewExpandableRow(
        "Fill colors",
        overview.uniqueFillColors ?? 0,
        createColorListContent(Array.isArray(colors.fill) ? colors.fill : [])
      )
    );
  }

  accordionRows.push(
    createCssOverviewExpandableRow(
      "Font families",
      overview.uniqueFontFamilies ?? 0,
      createFontListContent(Array.isArray(fontInfo.families) ? fontInfo.families : [])
    ),
    createCssOverviewExpandableRow(
      "Font sizes",
      overview.uniqueFontSizes ?? 0,
      createFontListContent(Array.isArray(fontInfo.sizes) ? fontInfo.sizes : [])
    ),
    createCssOverviewExpandableRow(
      "Media queries",
      mediaQueries.length,
      createMediaQueriesContent(mediaQueries)
    )
  );

  accordion.append(...accordionRows);

  output.append(summaryCards, accordion);
  initializeAccordionAnimations(output);
}

function makeStorageRow(item) {
  const row = document.createElement("div");
  row.className = "storage-row rounded-3 bg-secondary bg-opacity-25";

  const heading = document.createElement("strong");
  heading.textContent = `${item.kind} :: ${item.key}`;

  const value = document.createElement("code");
  value.textContent = item.value;

  const actions = document.createElement("div");
  actions.className = "storage-actions d-flex gap-1 mt-1";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn btn-sm btn-secondary py-0 px-2";
  copyBtn.textContent = "Copy";
  copyBtn.dataset.storageAction = "copy";
  copyBtn.dataset.kind = item.kind;
  copyBtn.dataset.key = item.key;

  actions.append(copyBtn);

  row.append(heading, value, actions);
  return row;
}

function getFilteredStorageItems(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.filter((item) => item?.kind === currentStorageKind);
}

function renderStorageKindTabs() {
  document.querySelectorAll("[data-storage-kind-tab]").forEach((button) => {
    const isActive = button instanceof HTMLElement && button.dataset.storageKindTab === currentStorageKind;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function renderStorage(payload) {
  const output = document.getElementById("storage-output");
  const copyJsonBtn = document.querySelector('[data-action="storage-copy"]');
  output.textContent = "";
  renderStorageKindTabs();

  const allItems = Array.isArray(payload?.items) ? payload.items : [];
  const items = getFilteredStorageItems(payload);

  if (!allItems.length) {
    if (copyJsonBtn instanceof HTMLButtonElement) {
      copyJsonBtn.disabled = true;
    }
    const empty = document.createElement("p");
    empty.className = "text-center mb-0";
    empty.textContent = "No storage items found.";
    output.append(empty);
    return;
  }

  if (copyJsonBtn instanceof HTMLButtonElement) {
    copyJsonBtn.disabled = false;
  }

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "text-center mb-0";
    if (currentStorageKind === "localStorage") {
      empty.textContent = "No localStorage items found.";
    } else if (currentStorageKind === "cookie") {
      empty.textContent = "No cookie items found.";
    } else {
      empty.textContent = "No sessionStorage items found.";
    }
    output.append(empty);
    return;
  }

  for (const item of items) {
    output.append(makeStorageRow(item));
  }
}

async function loadStorage() {
  const response = await sendToActiveTab({ action: "storage-snapshot" });
  lastStoragePayload = response;
  renderStorage(response);
}

async function handleStorageAction(source) {
  const startNode = source instanceof HTMLElement ? source : source?.target;
  if (!(startNode instanceof HTMLElement)) {
    return;
  }

  const target = startNode.closest("[data-storage-action]");
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.storageAction;
  if (!action) {
    return;
  }

  const kind = target.dataset.kind;
  const key = target.dataset.key;

  if (!kind || !key) {
    return;
  }

  if (!lastStoragePayload) {
    await loadStorage();
  }

  const item = lastStoragePayload?.items?.find(
    (entry) => entry.kind === kind && entry.key === key,
  );
  if (!item) {
    return;
  }

  if (action === "copy") {
    await navigator.clipboard.writeText(String(item.value ?? ""));
    flashButtonLabel(target, "Copied");
    setStatus(`Copied ${kind}:${key}`);
    return;
  }
}

async function runAction(action, sourceButton = null) {
  try {
    if (action === "seo") {
      const result = await sendToActiveTab({ action: "seo-snapshot" });
      renderSEO(result);
    } else if (action === "network") {
      const result = isMockNetworkModeEnabled()
        ? getMockNetworkSnapshot()
        : await sendToActiveTab({ action: "network-snapshot" });
      if (!result || !Array.isArray(result.items)) {
        throw new Error("Network snapshot unavailable. Refresh the page and try again.");
      }
      lastNetworkPayload = result;
      renderNetwork(result);
      if (isMockNetworkModeEnabled()) {
        setStatus("Mock Network data loaded.");
      }
    } else if (action === "css-overview") {
      const result = await sendToActiveTab({ action: "css-overview-snapshot" });
      renderCssOverview(result);
    } else if (action === "a11y") {
      const result = await sendToActiveTab({ action: "a11y-snapshot" });
      renderA11y(result);
    } else if (action === "perf") {
      const result = await sendToActiveTab({ action: "perf-snapshot" });
      if (!result || typeof result !== "object") {
        throw new Error("Performance snapshot unavailable on this page.");
      }
      renderPerf(result);
    } else if (action === "storage") {
      await loadStorage();
    } else if (action === "storage-copy") {
      if (!lastStoragePayload) {
        await loadStorage();
      }
      if (!lastStoragePayload?.items?.length) {
        setStatus("No storage items found.", true);
        return;
      }
      await navigator.clipboard.writeText(
        JSON.stringify(lastStoragePayload, null, 2),
      );
      flashButtonLabel(sourceButton, "Copied");
      setStatus("Storage JSON copied.");
      return;
    } else if (action === "device-copy") {
      await navigator.clipboard.writeText(buildDeviceInfoClipboardText());
      flashButtonLabel(sourceButton, "Copied");
      setStatus("Device info copied.");
      return;
    } else if (action === "dismiss-more-tools-alert") {
      const alert = document.getElementById("more-tools-alert");
      if (alert) {
        alert.classList.add("d-none");
      }
      await saveStoredValue(moreToolsAlertKey, "true");
      return;
    }

  } catch (error) {
    const message =
      (error && typeof error === "object" && "message" in error && error.message)
      || String(error)
      || "Request failed.";
    setStatus(message, true);
  }
}

function registerDebugHelpers() {
  globalThis.webDevToolsDebug = {
    enableMockNetwork() {
      try {
        globalThis.localStorage?.setItem(mockNetworkDebugKey, "true");
      } catch {
        // Ignore storage failures in helper mode.
      }
      globalThis.location?.reload();
    },
    disableMockNetwork() {
      try {
        globalThis.localStorage?.setItem(mockNetworkDebugKey, "false");
      } catch {
        // Ignore storage failures in helper mode.
      }
      globalThis.location?.reload();
    },
    mockNetworkEnabled() {
      return isMockNetworkModeEnabled();
    },
  };
}

async function toggleCssTool(control) {
  const tool = control.dataset.cssTool;
  if (!tool) {
    return;
  }

  const priorValue =
    control instanceof HTMLInputElement ? !control.checked : undefined;

  try {
    const response = await sendToActiveTab({ action: "css-tool-toggle", tool });
    const isActive = Boolean(response?.active);

    if (control instanceof HTMLInputElement) {
      control.checked = isActive;
    } else {
      control.classList.toggle("active", isActive);
    }

    setStatus(`${tool}: ${isActive ? "on" : "off"}`);
  } catch (error) {
    if (control instanceof HTMLInputElement && typeof priorValue === "boolean") {
      control.checked = priorValue;
    }
    const message =
      (error && typeof error === "object" && "message" in error && error.message)
      || String(error)
      || "Request failed.";
    setStatus(message, true);
  }
}

function applyTabSelection(tabName) {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  document.querySelectorAll("[data-panel]").forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle("active", isActive);
    panel.classList.toggle("d-flex", isActive);
    panel.classList.toggle("flex-column", isActive);
  });
}

async function runWithTopTabViewTransition(updateUi) {
  if (typeof document.startViewTransition !== "function") {
    updateUi();
    return;
  }
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    updateUi();
    return;
  }

  const transition = document.startViewTransition(() => {
    updateUi();
  });
  try {
    await transition.finished;
  } catch {
    // Continue even if transition is cancelled.
  }
}

async function switchTab(tabName, options = {}) {
  if (!tabName || !validTabs.has(tabName)) {
    return;
  }

  currentTab = tabName;
  void saveTab(tabName);

  if (options.animate === true) {
    await runWithTopTabViewTransition(() => {
      applyTabSelection(tabName);
    });
  } else {
    applyTabSelection(tabName);
  }

  if (tabName === "seo") {
    await runAction("seo");
    return;
  }

  if (tabName === "a11y") {
    await runAction("a11y");
    const subtab = await loadA11ySubtab();
    switchA11ySubtab(subtab);
    const ariaSwitch = document.getElementById("a11y-aria-inspect-switch");
    const altOverlaySwitch = document.getElementById("a11y-alt-overlay-switch");
    try {
      if (altOverlaySwitch instanceof HTMLInputElement && altOverlaySwitch.checked) {
        await sendToActiveTab({ action: "a11y-alt-overlay", enabled: true });
      }
      if (ariaSwitch instanceof HTMLInputElement && ariaSwitch.checked) {
        await sendToActiveTab({ action: "a11y-aria-inspector", enabled: true });
      }
    } catch {
      // Ignore unsupported pages.
    }
    return;
  }

  if (tabName === "perf") {
    await runAction("perf");
    return;
  }

  if (tabName === "network") {
    const subtab = await loadNetworkSubtab();
    switchNetworkSubtab(subtab);
    await runAction("network");
    return;
  }

  if (tabName === "css") {
    const subtab = await loadCssSubtab();
    switchCssSubtab(subtab);
    return;
  }

  if (tabName === "settings") {
    const subtab = await loadSettingsSubtab();
    switchSettingsSubtab(subtab);
    return;
  }

  if (tabName === "storage") {
    await runAction("storage");
    return;
  }

  if (tabName === "rendering") {
    const subtab = await loadRenderingSubtab();
    switchRenderingSubtab(subtab);
    const avifSwitch = document.getElementById("rendering-disable-avif");
    const webpSwitch = document.getElementById("rendering-disable-webp");
    const colorSchemeSelect = document.getElementById("rendering-color-scheme-select");
    const reducedMotionSelect = document.getElementById("rendering-reduced-motion-select");
    const contrastSelect = document.getElementById("rendering-contrast-select");
    const mediaTypeSelect = document.getElementById("rendering-media-type-select");
    try {
      if (avifSwitch instanceof HTMLInputElement && avifSwitch.checked) {
        await sendToActiveTab({ action: "rendering-format", format: "avif", disable: true });
      }
      if (webpSwitch instanceof HTMLInputElement && webpSwitch.checked) {
        await sendToActiveTab({ action: "rendering-format", format: "webp", disable: true });
      }
      if (colorSchemeSelect instanceof HTMLSelectElement && colorSchemeSelect.value !== "no-emulation") {
        await sendToActiveTab({
          action: "prefers-color-scheme",
          value: colorSchemeSelect.value,
        });
      }
      if (reducedMotionSelect instanceof HTMLSelectElement && reducedMotionSelect.value !== "no-emulation") {
        await sendToActiveTab({
          action: "prefers-reduced-motion",
          value: reducedMotionSelect.value,
        });
      }
      if (contrastSelect instanceof HTMLSelectElement && contrastSelect.value !== "no-emulation") {
        await sendToActiveTab({
          action: "prefers-contrast",
          value: contrastSelect.value,
        });
      }
      if (mediaTypeSelect instanceof HTMLSelectElement && mediaTypeSelect.value !== "no-emulation") {
        await sendToActiveTab({
          action: "media-type",
          value: mediaTypeSelect.value,
        });
      }
    } catch {
      // Ignore if tab doesn't accept (e.g. chrome://)
    }
  }
}

async function bindEvents() {
  registerDebugHelpers();

  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const storageActionButton = target.closest("[data-storage-action]");
    if (storageActionButton instanceof HTMLElement) {
      await handleStorageAction(storageActionButton);
      return;
    }

    const storageKindTab = target.closest("[data-storage-kind-tab]");
    if (storageKindTab instanceof HTMLElement && storageKindTab.dataset.storageKindTab) {
      currentStorageKind = storageKindTab.dataset.storageKindTab;
      if (lastStoragePayload) {
        renderStorage(lastStoragePayload);
      } else {
        await loadStorage();
      }
      return;
    }

    const cssSubtabButton = target.closest("[data-css-subtab]");
    if (cssSubtabButton instanceof HTMLElement && cssSubtabButton.dataset.cssSubtab) {
      switchCssSubtab(cssSubtabButton.dataset.cssSubtab);
      return;
    }

    const a11ySubtabButton = target.closest("[data-a11y-subtab]");
    if (a11ySubtabButton instanceof HTMLElement && a11ySubtabButton.dataset.a11ySubtab) {
      switchA11ySubtab(a11ySubtabButton.dataset.a11ySubtab);
      return;
    }

    const renderingSubtabButton = target.closest("[data-rendering-subtab]");
    if (renderingSubtabButton instanceof HTMLElement && renderingSubtabButton.dataset.renderingSubtab) {
      switchRenderingSubtab(renderingSubtabButton.dataset.renderingSubtab);
      return;
    }

    const networkSubtabButton = target.closest("[data-network-subtab]");
    if (networkSubtabButton instanceof HTMLElement && networkSubtabButton.dataset.networkSubtab) {
      switchNetworkSubtab(networkSubtabButton.dataset.networkSubtab);
      return;
    }

    const dismissNetworkInfoButton = target.closest("[data-network-dismiss-info]");
    if (dismissNetworkInfoButton instanceof HTMLElement) {
      hideNetworkInfoAlert = true;
      await saveStoredValue(networkInfoAlertKey, "true");
      if (lastNetworkPayload) {
        renderNetwork(lastNetworkPayload);
      }
      return;
    }

    const networkAssetButton = target.closest("[data-network-asset-index]");
    if (networkAssetButton instanceof HTMLElement && networkAssetButton.dataset.networkAssetIndex) {
      const index = Number(networkAssetButton.dataset.networkAssetIndex);
      if (Number.isInteger(index) && index >= 0 && index < lastRenderedNetworkItems.length) {
        showNetworkAssetDetails(lastRenderedNetworkItems[index]);
      }
      return;
    }

    const settingsSubtabButton = target.closest("[data-settings-subtab]");
    if (settingsSubtabButton instanceof HTMLElement && settingsSubtabButton.dataset.settingsSubtab) {
      switchSettingsSubtab(settingsSubtabButton.dataset.settingsSubtab);
      return;
    }

    const tabButton = target.closest("[data-tab]");
    if (tabButton instanceof HTMLElement && tabButton.dataset.tab) {
      const tabName = tabButton.dataset.tab;
      const wasOnWelcome = document.getElementById("main-content")?.classList.contains("hidden") === true;
      if (validTabs.has(tabName) && wasOnWelcome) {
        showMainScreen();
      }
      const shouldAnimate = tabButton.classList.contains("tab") && !wasOnWelcome;
      await switchTab(tabName, { animate: shouldAnimate });
      return;
    }

    const moreToolsButton = target.closest("[data-more-tools]");
    if (moreToolsButton instanceof HTMLElement && moreToolsButton.dataset.moreTools) {
      await openMoreTools(moreToolsButton.dataset.moreTools);
      return;
    }

    const actionButton = target.closest("[data-action]");
    if (actionButton instanceof HTMLElement && actionButton.dataset.action) {
      await runAction(actionButton.dataset.action, actionButton);
      return;
    }

    await handleStorageAction(target);
  });

  document.querySelectorAll("input[data-css-tool]").forEach((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    input.addEventListener("change", async () => {
      await toggleCssTool(input);
    });
  });

  const visionSelect = document.getElementById("rendering-vision-select");
  if (visionSelect instanceof HTMLSelectElement) {
    visionSelect.addEventListener("change", async () => {
      try {
        await sendToActiveTab({
          action: "a11y-color-filter",
          filter: visionSelect.value,
        });
      } catch (error) {
        const message =
          (error && typeof error === "object" && "message" in error && error.message)
          || String(error)
          || "Request failed.";
        setStatus(message, true);
      }
    });
  }

  const colorSchemeKey = "popup.rendering.prefersColorScheme";
  const reducedMotionKey = "popup.rendering.prefersReducedMotion";
  const contrastKey = "popup.rendering.prefersContrast";
  const mediaTypeKey = "popup.rendering.mediaType";
  const colorSchemeSelect = document.getElementById("rendering-color-scheme-select");
  if (colorSchemeSelect instanceof HTMLSelectElement) {
    const stored = await loadStoredValue(colorSchemeKey);
    if (stored === "light" || stored === "dark" || stored === "no-emulation") {
      colorSchemeSelect.value = stored;
    }
    colorSchemeSelect.addEventListener("change", async () => {
      const value = colorSchemeSelect.value;
      await saveStoredValue(colorSchemeKey, value);
      try {
        await sendToActiveTab({
          action: "prefers-color-scheme",
          value: value === "no-emulation" ? null : value,
        });
      } catch (error) {
        setStatus("Could not apply prefers-color-scheme.", true);
      }
    });
  }
  const reducedMotionSelect = document.getElementById("rendering-reduced-motion-select");
  if (reducedMotionSelect instanceof HTMLSelectElement) {
    const stored = await loadStoredValue(reducedMotionKey);
    if (stored === "reduce" || stored === "no-preference" || stored === "no-emulation") {
      reducedMotionSelect.value = stored;
    }
    reducedMotionSelect.addEventListener("change", async () => {
      const value = reducedMotionSelect.value;
      await saveStoredValue(reducedMotionKey, value);
      try {
        await sendToActiveTab({
          action: "prefers-reduced-motion",
          value: value === "no-emulation" ? null : value,
        });
      } catch {
        setStatus("Could not apply prefers-reduced-motion.", true);
      }
    });
  }
  const contrastSelect = document.getElementById("rendering-contrast-select");
  if (contrastSelect instanceof HTMLSelectElement) {
    const stored = await loadStoredValue(contrastKey);
    if (stored === "more" || stored === "less" || stored === "no-preference" || stored === "no-emulation") {
      contrastSelect.value = stored;
    }
    contrastSelect.addEventListener("change", async () => {
      const value = contrastSelect.value;
      await saveStoredValue(contrastKey, value);
      try {
        await sendToActiveTab({
          action: "prefers-contrast",
          value: value === "no-emulation" ? null : value,
        });
      } catch {
        setStatus("Could not apply prefers-contrast.", true);
      }
    });
  }
  const mediaTypeSelect = document.getElementById("rendering-media-type-select");
  if (mediaTypeSelect instanceof HTMLSelectElement) {
    const stored = await loadStoredValue(mediaTypeKey);
    if (stored === "print" || stored === "screen" || stored === "no-emulation") {
      mediaTypeSelect.value = stored;
    }
    mediaTypeSelect.addEventListener("change", async () => {
      const value = mediaTypeSelect.value;
      await saveStoredValue(mediaTypeKey, value);
      try {
        await sendToActiveTab({
          action: "media-type",
          value: value === "no-emulation" ? null : value,
        });
      } catch {
        setStatus("Could not apply media type emulation.", true);
      }
    });
  }

  const disableAvifKey = "popup.rendering.disableAvif";
  const disableWebpKey = "popup.rendering.disableWebp";
  const avifSwitch = document.getElementById("rendering-disable-avif");
  const webpSwitch = document.getElementById("rendering-disable-webp");

  if (avifSwitch instanceof HTMLInputElement) {
    const stored = await loadStoredValue(disableAvifKey);
    avifSwitch.checked = stored === "true";
    avifSwitch.addEventListener("change", async () => {
      const enabled = avifSwitch.checked;
      await saveStoredValue(disableAvifKey, String(enabled));
      try {
        await sendToActiveTab({ action: "rendering-format", format: "avif", disable: enabled });
      } catch (e) {
        setStatus("Could not apply AVIF setting.", true);
      }
    });
  }
  if (webpSwitch instanceof HTMLInputElement) {
    const stored = await loadStoredValue(disableWebpKey);
    webpSwitch.checked = stored === "true";
    webpSwitch.addEventListener("change", async () => {
      const enabled = webpSwitch.checked;
      await saveStoredValue(disableWebpKey, String(enabled));
      try {
        await sendToActiveTab({ action: "rendering-format", format: "webp", disable: enabled });
      } catch (e) {
        setStatus("Could not apply WebP setting.", true);
      }
    });
  }

  const networkSortSelect = document.getElementById("network-sort-select");
  if (networkSortSelect instanceof HTMLSelectElement) {
    const stored = await loadStoredValue(networkSortKey);
    if (stored === "time" || stored === "filesize" || stored === "type" || stored === "name") {
      currentNetworkSort = stored;
      networkSortSelect.value = stored;
    } else {
      currentNetworkSort = "time";
      networkSortSelect.value = "time";
    }
    networkSortSelect.addEventListener("change", async () => {
      const value = networkSortSelect.value;
      currentNetworkSort = value === "filesize" || value === "type" || value === "name" ? value : "time";
      await saveStoredValue(networkSortKey, currentNetworkSort);
      if (lastNetworkPayload) {
        renderNetwork(lastNetworkPayload);
      }
    });
  }
  const networkShowImagesSwitch = document.getElementById("network-show-images-switch");
  if (networkShowImagesSwitch instanceof HTMLInputElement) {
    const stored = await loadStoredValue(networkShowImagesKey);
    currentNetworkShowImages = stored === "true";
    networkShowImagesSwitch.checked = currentNetworkShowImages;
    networkShowImagesSwitch.addEventListener("change", async () => {
      currentNetworkShowImages = networkShowImagesSwitch.checked;
      await saveStoredValue(networkShowImagesKey, String(currentNetworkShowImages));
      if (lastNetworkPayload) {
        renderNetwork(lastNetworkPayload);
      }
    });
  }
  const networkFilterSelect = document.getElementById("network-filter-select");
  if (networkFilterSelect instanceof HTMLSelectElement) {
    const stored = await loadStoredValue(networkFilterKey);
    if (stored === "third-party" || stored === "exclude-third-party" || stored === "all") {
      currentNetworkFilter = stored;
      networkFilterSelect.value = stored;
    } else {
      currentNetworkFilter = "all";
      networkFilterSelect.value = "all";
    }
    networkFilterSelect.addEventListener("change", async () => {
      const value = networkFilterSelect.value;
      currentNetworkFilter = value === "third-party" || value === "exclude-third-party" ? value : "all";
      await saveStoredValue(networkFilterKey, currentNetworkFilter);
      if (lastNetworkPayload) {
        renderNetwork(lastNetworkPayload);
      }
    });
  }

  hideNetworkInfoAlert = (await loadStoredValue(networkInfoAlertKey)) === "true";

  if ((await loadStoredValue(moreToolsAlertKey)) === "true") {
    const moreToolsAlert = document.getElementById("more-tools-alert");
    if (moreToolsAlert) {
      moreToolsAlert.classList.add("d-none");
    }
  }

  let savedTab = await loadSavedTab();
  if (savedTab === "css-overview") {
    savedTab = "css";
    await saveTab("css");
    await saveCssSubtab("overview");
  }
  if (savedTab && validTabs.has(savedTab)) {
    currentTab = savedTab;
    showMainScreen();
    applyTabSelection(currentTab);
  } else {
    showWelcomeScreen();
  }

  const ariaInspectSwitch = document.getElementById("a11y-aria-inspect-switch");
  const altOverlaySwitch = document.getElementById("a11y-alt-overlay-switch");
  if (altOverlaySwitch instanceof HTMLInputElement) {
    altOverlaySwitch.checked = await loadA11yAltOverlayEnabled();
    altOverlaySwitch.addEventListener("change", async () => {
      const enabled = altOverlaySwitch.checked;
      await saveA11yAltOverlayEnabled(enabled);
      if (enabled && ariaInspectSwitch instanceof HTMLInputElement && ariaInspectSwitch.checked) {
        ariaInspectSwitch.checked = false;
        await saveA11yAriaInspectEnabled(false);
        try {
          await sendToActiveTab({ action: "a11y-aria-inspector", enabled: false });
        } catch {
          // Ignore.
        }
      }
      try {
        await sendToActiveTab({ action: "a11y-alt-overlay", enabled });
      } catch {
        setStatus("Could not update img alt overlay on this page.", true);
      }
    });
  }
  if (ariaInspectSwitch instanceof HTMLInputElement) {
    ariaInspectSwitch.checked = await loadA11yAriaInspectEnabled();
    ariaInspectSwitch.addEventListener("change", async () => {
      const enabled = ariaInspectSwitch.checked;
      await saveA11yAriaInspectEnabled(enabled);
      if (enabled && altOverlaySwitch instanceof HTMLInputElement && altOverlaySwitch.checked) {
        altOverlaySwitch.checked = false;
        await saveA11yAltOverlayEnabled(false);
        try {
          await sendToActiveTab({ action: "a11y-alt-overlay", enabled: false });
        } catch {
          // Ignore.
        }
      }
      try {
        await sendToActiveTab({
          action: "a11y-aria-inspector",
          enabled,
        });
      } catch {
        setStatus("Could not update ARIA inspect on this page.", true);
      }
    });
  }

  const resetAllSwitch = document.getElementById("settings-reset-all-switch");
  if (resetAllSwitch instanceof HTMLInputElement) {
    resetAllSwitch.checked = false;
    resetAllSwitch.addEventListener("change", async () => {
      if (!resetAllSwitch.checked) {
        return;
      }
      const approved = await showConfirmDialog("Reset all saved settings and return to the Welcome screen?");
      if (!approved) {
        resetAllSwitch.checked = false;
        return;
      }
      await resetAllPopupSettings();
      resetAllSwitch.checked = false;
    });
  }

  const themeSelect = document.getElementById("theme-select");
  if (themeSelect instanceof HTMLSelectElement) {
    const savedPreference = await loadThemePreference();
    activeThemePreference = savedPreference;
    themeSelect.value = savedPreference;
    applyTheme(savedPreference);

    themeSelect.addEventListener("change", () => {
      const selectedPreference = validThemePreferences.has(themeSelect.value)
        ? themeSelect.value
        : "system";
      activeThemePreference = selectedPreference;
      applyTheme(selectedPreference);
      void saveThemePreference(selectedPreference);
    });

  if (systemThemeMediaQuery) {
      const onSystemThemeChange = () => {
        if (activeThemePreference === "system") {
          applyTheme("system");
        }
      };
      if (typeof systemThemeMediaQuery.addEventListener === "function") {
        systemThemeMediaQuery.addEventListener("change", onSystemThemeChange);
      } else if (typeof systemThemeMediaQuery.addListener === "function") {
        systemThemeMediaQuery.addListener(onSystemThemeChange);
      }
    }
  }

  function updateOrientationDisplay() {
    const orientationNode = document.getElementById("device-display-orientation");
    if (orientationNode) {
      orientationNode.textContent = getOrientationLabel();
    }
  }

  window.addEventListener("orientationchange", updateOrientationDisplay);
  if (screen.orientation && typeof screen.orientation.addEventListener === "function") {
    screen.orientation.addEventListener("change", updateOrientationDisplay);
  }

  renderBuildInfo();
  initializeAccordionAnimations(document);
  void renderDeviceInfo();
  if (document.getElementById("main-content")?.classList.contains("hidden") === false) {
    void switchTab(currentTab);
  }
}

void bindEvents();
