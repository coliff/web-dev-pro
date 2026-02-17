const ext = globalThis.browser ?? globalThis.chrome;

let lastStoragePayload = null;
let currentStorageKind = "cookie";
let currentTab = "seo";
const popupTabKey = "popup.lastActiveTab";
const themePreferenceKey = "popup.themePreference";
const legacyDarkModeKey = "popup.darkModeEnabled";
const a11yAriaInspectKey = "popup.a11y.ariaInspectEnabled";
const validTabs = new Set(["a11y", "css", "perf", "rendering", "seo", "settings", "storage"]);
const validThemePreferences = new Set(["system", "dark", "light"]);
let activeThemePreference = "system";
const systemThemeMediaQuery = globalThis.matchMedia
  ? globalThis.matchMedia("(prefers-color-scheme: dark)")
  : null;

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

async function loadSavedTab() {
  return await loadStoredValue(popupTabKey);
}

async function saveTab(tabName) {
  await saveStoredValue(popupTabKey, tabName);
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
  return "system";
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

function getReducedMotionLabel() {
  if (!globalThis.matchMedia) {
    return "Unavailable";
  }
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduce" : "no-preference";
}

function getColorSchemeLabel() {
  if (!globalThis.matchMedia) {
    return "Unavailable";
  }
  if (globalThis.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark (system)";
  }
  if (globalThis.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light (system)";
  }
  return "system (no explicit preference)";
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

  try {
    const timeoutMs = 3500;
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch("https://ipapi.co/json/", {
      cache: "no-store",
      signal: controller.signal,
    });
    globalThis.clearTimeout(timeoutId);

    if (!response.ok) {
      return fallback;
    }

    const data = await response.json();
    const ip = data?.ip ? String(data.ip) : "Unavailable";
    const city = data?.city ? String(data.city) : "";
    const region = data?.region ? String(data.region) : "";
    const country = data?.country_name ? String(data.country_name) : "";
    const location = [city, region, country].filter(Boolean).join(", ") || "Unavailable";
    const isp = data?.org ? String(data.org) : (data?.asn ? String(data.asn) : "Unavailable");

    return { ip, location, isp };
  } catch {
    return fallback;
  }
}

async function renderDeviceInfo() {
  const userAgent = navigator.userAgent || "Unknown";
  const uaData = navigator.userAgentData;
  const language = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages.join(", ")
    : (navigator.language || "Unknown");
  const platform = uaData?.platform || navigator.platform || "Unknown";
  const mobileHint = uaData?.mobile === true || /iphone|ipad|android/i.test(userAgent) ? "mobile" : "desktop";
  const osVersion = await resolveOsVersion(userAgent);
  const logicalWidth = Number.isFinite(screen.width) ? screen.width : 0;
  const logicalHeight = Number.isFinite(screen.height) ? screen.height : 0;
  const dpr = Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
  const physicalWidth = Math.round(logicalWidth * dpr);
  const physicalHeight = Math.round(logicalHeight * dpr);
  const colorDepth = Number.isFinite(screen.colorDepth) ? `${screen.colorDepth}-bit` : "Unavailable";
  const orientationLabel = getOrientationLabel();
  const reducedMotion = getReducedMotionLabel();
  const colorScheme = getColorSchemeLabel();
  const connectionType = getConnectionTypeLabel();
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const onlineState = navigator.onLine ? "Online" : "Offline";
  const effectiveType = typeof connection?.effectiveType === "string" && connection.effectiveType
    ? connection.effectiveType
    : "Unavailable";
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

  const uaNode = document.getElementById("device-browser-user-agent");
  const osVersionNode = document.getElementById("device-browser-os-version");
  const deviceNode = document.getElementById("device-browser-device");
  const languageNode = document.getElementById("device-browser-language");
  const resolutionNode = document.getElementById("device-display-resolution");
  const dprNode = document.getElementById("device-display-dpr");
  const colorDepthNode = document.getElementById("device-display-color-depth");
  const orientationNode = document.getElementById("device-display-orientation");
  const reducedMotionNode = document.getElementById("device-display-reduced-motion");
  const colorSchemeNode = document.getElementById("device-display-color-scheme");
  const ipNode = document.getElementById("device-network-ip");
  const locationNode = document.getElementById("device-network-location");
  const ispNode = document.getElementById("device-network-isp");
  const connectionNode = document.getElementById("device-network-connection");
  const onlineStateNode = document.getElementById("device-network-online-state");
  const effectiveTypeNode = document.getElementById("device-network-effective-type");
  const downlinkNode = document.getElementById("device-network-downlink");
  const rttNode = document.getElementById("device-network-rtt");
  const dataSaverNode = document.getElementById("device-network-data-saver");
  const timezoneNode = document.getElementById("device-network-timezone");

  if (
    !uaNode || !osVersionNode || !deviceNode || !languageNode || !resolutionNode || !dprNode || !colorDepthNode
    || !orientationNode || !reducedMotionNode || !colorSchemeNode
    || !ipNode || !locationNode || !ispNode || !connectionNode
    || !onlineStateNode || !effectiveTypeNode || !downlinkNode || !rttNode || !dataSaverNode || !timezoneNode
  ) {
    return;
  }

  uaNode.textContent = userAgent;
  osVersionNode.textContent = osVersion;
  deviceNode.textContent = `${platform} (${mobileHint})`;
  languageNode.textContent = language;
  resolutionNode.textContent = `${logicalWidth}x${logicalHeight} logical, ${physicalWidth}x${physicalHeight} physical`;
  dprNode.textContent = `${dpr.toFixed(2)}x`;
  colorDepthNode.textContent = colorDepth;
  orientationNode.textContent = orientationLabel;
  reducedMotionNode.textContent = reducedMotion;
  colorSchemeNode.textContent = colorScheme;
  connectionNode.textContent = connectionType;
  onlineStateNode.textContent = onlineState;
  effectiveTypeNode.textContent = effectiveType;
  downlinkNode.textContent = downlink;
  rttNode.textContent = rtt;
  dataSaverNode.textContent = dataSaver;
  timezoneNode.textContent = timezone;
  ipNode.textContent = "Loading...";
  locationNode.textContent = "Loading...";
  ispNode.textContent = "Loading...";

  const network = await resolveNetworkDetails();
  ipNode.textContent = network.ip;
  locationNode.textContent = network.location;
  ispNode.textContent = network.isp;
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
    `Color scheme: ${read("device-display-color-scheme")}`,
    "",
    "Network",
    `IP address: ${read("device-network-ip")}`,
    `Location: ${read("device-network-location")}`,
    `ISP: ${read("device-network-isp")}`,
    `Connection type: ${read("device-network-connection")}`,
    `Online state: ${read("device-network-online-state")}`,
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
  const overlay = document.createElement("div");
  overlay.className = "position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center p-2";
  overlay.style.background = "rgba(2, 6, 23, 0.7)";
  overlay.style.zIndex = "2147483647";

  const panel = document.createElement("div");
  panel.className = "rounded-3 p-2";
  panel.style.width = "100%";
  panel.style.maxWidth = "330px";
  panel.style.background = "var(--panel)";
  panel.style.border = "1px solid var(--line)";
  panel.style.color = "var(--text)";

  const heading = document.createElement("div");
  heading.className = "small fw-semibold mb-2";
  heading.textContent = title;

  panel.append(heading);
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
    actions.className = "d-flex gap-1 justify-content-end";

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

function renderSEO(result) {
  const output = document.getElementById("seo-output");
  output.textContent = "";
  const openGraphTags = Array.isArray(result?.openGraphTags) ? result.openGraphTags : [];
  const structuredDataItems = Array.isArray(result?.structuredDataItems) ? result.structuredDataItems : [];

  renderKeyValues("seo-output", {
    "Title": result.title || "(missing)",
    "Meta description length": result.metaDescriptionLength,
    "Canonical URL": result.canonicalUrl || "Missing",
  });

  const accordion = document.createElement("div");
  accordion.className = "accordion border-bottom-0 mt-2";

  const ogDetails = document.createElement("details");
  ogDetails.className = "accordion-item border-bottom-0";
  ogDetails.setAttribute("name", "seo-issues");
  const ogSummary = document.createElement("summary");
  ogSummary.className = "accordion-button rounded-top";
  const ogHeader = document.createElement("h2");
  ogHeader.className = "accordion-header user-select-none fs-6 text-body";
  ogHeader.textContent = `Open Graph tags (${openGraphTags.length})`;
  ogSummary.append(ogHeader);
  lockAccordionWhenEmpty(ogDetails, ogSummary, openGraphTags.length);
  ogDetails.append(ogSummary);
  const ogBody = document.createElement("div");
  ogBody.className = "accordion-body border-bottom p-2";
  const ogList = document.createElement("ul");
  ogList.className = "small mb-0 ps-3";
  for (const tag of openGraphTags) {
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

  const sdDetails = document.createElement("details");
  sdDetails.className = "accordion-item border-bottom-0";
  sdDetails.setAttribute("name", "seo-issues");
  const sdSummary = document.createElement("summary");
  sdSummary.className = "accordion-button rounded-top";
  const sdHeader = document.createElement("h2");
  sdHeader.className = "accordion-header user-select-none fs-6 text-body";
  sdHeader.textContent = `Structured data (${structuredDataItems.length})`;
  sdSummary.append(sdHeader);
  lockAccordionWhenEmpty(sdDetails, sdSummary, structuredDataItems.length);
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
  if (!structuredDataItems.length) {
    const empty = document.createElement("div");
    empty.className = "small text-success";
    empty.textContent = "None";
    sdBody.append(empty);
  } else {
    sdBody.append(sdList);
  }
  sdDetails.append(sdBody);
  accordion.append(sdDetails);

  output.append(accordion);

  const warnings = Array.isArray(result?.warnings) ? result.warnings : [];
  if (warnings.length) {
    const warn = document.createElement("div");
    warn.className = "alert alert-warning mt-3 mb-0 py-2 px-2";

    const title = document.createElement("div");
    title.className = "fw-semibold small mb-1";
    title.textContent = "Warnings";
    warn.append(title);

    const list = document.createElement("ul");
    list.className = "small mb-0 ps-3";
    for (const message of warnings) {
      const li = document.createElement("li");
      li.textContent = message;
      list.append(li);
    }
    warn.append(list);
    output.append(warn);
  }
}

function renderA11y(result) {
  const output = document.getElementById("a11y-output");
  output.textContent = "";

  const missingAltSamples = Array.isArray(result?.missingAltSamples) ? result.missingAltSamples : [];
  const lowContrastSamples = Array.isArray(result?.lowContrastSamples) ? result.lowContrastSamples : [];
  const headingTree = Array.isArray(result?.headingTree) ? result.headingTree : [];

  const accordion = document.createElement("div");
  accordion.className = "accordion border-bottom-0";

  const missingAltDetails = document.createElement("details");
  missingAltDetails.className = "accordion-item border-bottom-0";
  missingAltDetails.setAttribute("name", "a11y-issues");
  const missingAltSummary = document.createElement("summary");
  missingAltSummary.className = "accordion-button rounded-top";
  const missingAltHeader = document.createElement("h2");
  missingAltHeader.className = "accordion-header user-select-none fs-6 text-body";
  missingAltHeader.textContent = `Missing alt tags (${missingAltSamples.length})`;
  missingAltSummary.append(missingAltHeader);
  lockAccordionWhenEmpty(missingAltDetails, missingAltSummary, missingAltSamples.length);
  missingAltDetails.append(missingAltSummary);
  const missingAltBody = document.createElement("div");
  missingAltBody.className = "accordion-body border-bottom p-2";
  const missingAltList = document.createElement("ul");
  missingAltList.className = "small mb-0 ps-3";
  for (const sample of missingAltSamples) {
    const li = document.createElement("li");
    li.textContent = sample;
    missingAltList.append(li);
  }
  if (!missingAltSamples.length) {
    const empty = document.createElement("div");
    empty.className = "small text-success";
    empty.textContent = "None";
    missingAltBody.append(empty);
  } else {
    missingAltBody.append(missingAltList);
  }
  missingAltDetails.append(missingAltBody);
  accordion.append(missingAltDetails);

  const lowContrastDetails = document.createElement("details");
  lowContrastDetails.className = "accordion-item border-bottom-0";
  lowContrastDetails.setAttribute("name", "a11y-issues");
  const lowContrastSummary = document.createElement("summary");
  lowContrastSummary.className = "accordion-button rounded-top";
  const lowContrastHeader = document.createElement("h2");
  lowContrastHeader.className = "accordion-header user-select-none fs-6 text-body";
  lowContrastHeader.textContent = `Low contrast findings (${lowContrastSamples.length})`;
  lowContrastSummary.append(lowContrastHeader);
  lockAccordionWhenEmpty(lowContrastDetails, lowContrastSummary, lowContrastSamples.length);
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
  if (!lowContrastSamples.length) {
    const empty = document.createElement("div");
    empty.className = "small text-success";
    empty.textContent = "None";
    lowContrastBody.append(empty);
  } else {
    lowContrastBody.append(lowContrastList);
  }
  lowContrastDetails.append(lowContrastBody);
  accordion.append(lowContrastDetails);

  const headingTreeDetails = document.createElement("details");
  headingTreeDetails.className = "accordion-item border-bottom-0";
  headingTreeDetails.setAttribute("name", "a11y-issues");
  const headingTreeSummary = document.createElement("summary");
  headingTreeSummary.className = "accordion-button rounded-top";
  const headingTreeHeader = document.createElement("h2");
  headingTreeHeader.className = "accordion-header user-select-none fs-6 text-body";
  headingTreeHeader.textContent = `Heading tree (${headingTree.length})`;
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
    const label = match ? `H${level} ${match[2]}` : text;
    const item = document.createElement("div");
    item.textContent = label;
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
  accordion.append(headingTreeDetails);

  output.append(accordion);
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

  const accordion = document.createElement("div");
  accordion.className = "accordion border-bottom-0";

  const domDetails = document.createElement("details");
  domDetails.className = "accordion-item border-bottom-0";
  const domSummary = document.createElement("summary");
  domSummary.className = "accordion-button rounded-top pe-none no-expand";
  const domHeader = document.createElement("h2");
  domHeader.className = "accordion-header user-select-none fs-6 text-body";
  domHeader.textContent = `Total DOM nodes: ${domNodes}`;
  domSummary.append(domHeader);
  domDetails.append(domSummary);
  accordion.append(domDetails);

  const weightDetails = document.createElement("details");
  weightDetails.className = "accordion-item border-bottom-0";
  const weightSummary = document.createElement("summary");
  weightSummary.className = "accordion-button rounded-top pe-none no-expand";
  const weightHeader = document.createElement("h2");
  weightHeader.className = "accordion-header user-select-none fs-6 text-body";
  weightHeader.textContent = `Page weight estimate: ${pageWeightKb} KB`;
  weightSummary.append(weightHeader);
  weightDetails.append(weightSummary);
  accordion.append(weightDetails);

  const externalDetails = document.createElement("details");
  externalDetails.className = "accordion-item border-bottom-0";
  externalDetails.setAttribute("name", "accordion");
  const externalSummary = document.createElement("summary");
  externalSummary.className = "accordion-button rounded-top";
  const externalHeader = document.createElement("h2");
  externalHeader.className = "accordion-header user-select-none fs-6 text-body";
  externalHeader.textContent = `External scripts (${externalScripts.length})`;
  externalSummary.append(externalHeader);
  lockAccordionWhenEmpty(externalDetails, externalSummary, externalScripts.length);
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

  const blockingDetails = document.createElement("details");
  blockingDetails.className = "accordion-item border-bottom-0";
  blockingDetails.setAttribute("name", "accordion");
  const blockingSummary = document.createElement("summary");
  blockingSummary.className = "accordion-button rounded-top";
  const blockingHeader = document.createElement("h2");
  blockingHeader.className = "accordion-header user-select-none fs-6 text-body";
  blockingHeader.textContent = `Blocking <head> scripts (${blockingHeadScripts.length})`;
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

  const largeDetails = document.createElement("details");
  largeDetails.className = "accordion-item border-bottom-0";
  largeDetails.setAttribute("name", "accordion");
  const largeSummary = document.createElement("summary");
  largeSummary.className = "accordion-button rounded-top";
  const largeHeader = document.createElement("h2");
  largeHeader.className = "accordion-header user-select-none fs-6 text-body";
  largeHeader.textContent = `Large images (${largeImages.length})`;
  largeSummary.append(largeHeader);
  lockAccordionWhenEmpty(largeDetails, largeSummary, largeImages.length);
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

  output.append(accordion);
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
    output.textContent = "No storage items found.";
    return;
  }

  if (copyJsonBtn instanceof HTMLButtonElement) {
    copyJsonBtn.disabled = false;
  }

  if (!items.length) {
    if (currentStorageKind === "localStorage") {
      output.textContent = "No localStorage items found.";
    } else if (currentStorageKind === "cookie") {
      output.textContent = "No cookie items found.";
    } else {
      output.textContent = "No sessionStorage items found.";
    }
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
    }

  } catch (error) {
    const message =
      (error && typeof error === "object" && "message" in error && error.message)
      || String(error)
      || "Request failed.";
    setStatus(message, true);
  }
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

async function switchTab(tabName) {
  if (!tabName || !validTabs.has(tabName)) {
    return;
  }

  currentTab = tabName;
  void saveTab(tabName);

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  document.querySelectorAll("[data-panel]").forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle("active", isActive);
    panel.classList.toggle("d-flex", isActive);
    panel.classList.toggle("flex-column", isActive);
  });

  if (tabName === "seo") {
    await runAction("seo");
    return;
  }

  if (tabName === "a11y") {
    await runAction("a11y");
    const ariaSwitch = document.getElementById("a11y-aria-inspect-switch");
    if (ariaSwitch instanceof HTMLInputElement) {
      try {
        await sendToActiveTab({
          action: "a11y-aria-inspector",
          enabled: ariaSwitch.checked,
        });
      } catch {
        // Ignore unsupported pages.
      }
    }
    return;
  }

  if (tabName === "perf") {
    await runAction("perf");
    return;
  }

  if (tabName === "storage") {
    await runAction("storage");
    return;
  }

  if (tabName === "rendering") {
    const avifSwitch = document.getElementById("rendering-disable-avif");
    const webpSwitch = document.getElementById("rendering-disable-webp");
    const colorSchemeSelect = document.getElementById("rendering-color-scheme-select");
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
    } catch {
      // Ignore if tab doesn't accept (e.g. chrome://)
    }
  }
}

async function bindEvents() {
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

    const tabButton = target.closest("[data-tab]");
    if (tabButton instanceof HTMLElement && tabButton.dataset.tab) {
      await switchTab(tabButton.dataset.tab);
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

  const savedTab = await loadSavedTab();
  if (savedTab && validTabs.has(savedTab)) {
    currentTab = savedTab;
  }

  const ariaInspectSwitch = document.getElementById("a11y-aria-inspect-switch");
  if (ariaInspectSwitch instanceof HTMLInputElement) {
    ariaInspectSwitch.checked = await loadA11yAriaInspectEnabled();
    ariaInspectSwitch.addEventListener("change", async () => {
      const enabled = ariaInspectSwitch.checked;
      await saveA11yAriaInspectEnabled(enabled);
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
      systemThemeMediaQuery.addEventListener("change", () => {
        if (activeThemePreference === "system") {
          applyTheme("system");
        }
      });
    }
  }

  renderBuildInfo();
  void renderDeviceInfo();
  void switchTab(currentTab);
}

void bindEvents();
