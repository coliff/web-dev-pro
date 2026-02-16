const ext = globalThis.browser ?? globalThis.chrome;

let lastStoragePayload = null;
let currentTab = "seo";
const popupTabKey = "popup.lastActiveTab";
const darkModeKey = "popup.darkModeEnabled";
const validTabs = new Set(["a11y", "css", "perf", "rendering", "seo", "settings", "storage"]);

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

async function loadDarkModeEnabled() {
  const stored = await loadStoredValue(darkModeKey);
  if (stored === null) {
    return true;
  }
  return stored === "true";
}

async function saveDarkModeEnabled(enabled) {
  await saveStoredValue(darkModeKey, String(enabled));
}

function applyTheme(isDarkMode) {
  document.documentElement.dataset.bsTheme = isDarkMode ? "dark" : "light";
  document.body.classList.toggle("light-mode", !isDarkMode);
}

function renderBuildInfo() {
  const versionNode = document.getElementById("settings-build-version");
  const dateNode = document.getElementById("settings-build-date");
  if (!versionNode || !dateNode) {
    return;
  }

  const manifest = ext.runtime?.getManifest?.();
  const version = manifest?.version ?? "unknown";

  const parsedDate = new Date(document.lastModified);
  const buildDate = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString().slice(0, 10)
    : parsedDate.toISOString().slice(0, 10);

  versionNode.textContent = `Version ${version}`;
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

function renderDeviceInfo() {
  const userAgent = navigator.userAgent || "Unknown";
  const uaData = navigator.userAgentData;

  const osNode = document.getElementById("device-os-version");
  const nameNode = document.getElementById("device-name");
  const uaNode = document.getElementById("device-user-agent");
  const displayNode = document.getElementById("device-display");
  const dprNode = document.getElementById("device-dpr");

  if (!osNode || !nameNode || !uaNode || !displayNode || !dprNode) {
    return;
  }

  const platform = uaData?.platform || navigator.platform || "Unknown";
  const mobileHint = uaData?.mobile === true || /iphone|ipad|android/i.test(userAgent) ? "mobile" : "desktop";
  const logicalWidth = Number.isFinite(screen.width) ? screen.width : 0;
  const logicalHeight = Number.isFinite(screen.height) ? screen.height : 0;
  const dpr = Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
  const physicalWidth = Math.round(logicalWidth * dpr);
  const physicalHeight = Math.round(logicalHeight * dpr);

  osNode.textContent = getOsVersionFromUserAgent(userAgent);
  nameNode.textContent = `${platform} (${mobileHint})`;
  uaNode.textContent = userAgent;
  displayNode.textContent = `${logicalWidth}x${logicalHeight} logical, ${physicalWidth}x${physicalHeight} physical`;
  dprNode.textContent = `${dpr.toFixed(2)}x`;
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

  renderKeyValues("seo-output", {
    "Title": result.title || "(missing)",
    "Meta description length": result.metaDescriptionLength,
    "Canonical URL": result.canonicalUrl || "Missing",
    "Open Graph tags": result.openGraphCount,
    "Structured data": result.structuredData.join(", ") || "None",
  });

  appendBulletList(output, "Warnings", result.warnings, "text-secondary");
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
  missingAltHeader.textContent = `Missing alt samples (${missingAltSamples.length})`;
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

  const ariaInfo = document.createElement("div");
  ariaInfo.className = "alert alert-info py-1 px-2 small mt-3 mb-0";
  ariaInfo.textContent = "ARIA inspect enabled: tap any page element to view ARIA attributes.";
  output.append(ariaInfo);
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

  const output = document.getElementById("perf-output");
  output.textContent = "";

  renderKeyValues("perf-output", {
    "Total DOM nodes": safeResult.domNodes ?? 0,
    "Page weight estimate": `${safeResult.pageWeightKb ?? 0} KB`,
  });

  const accordion = document.createElement("div");
  accordion.className = "accordion border-bottom-0";

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
  for (const src of externalScripts) {
    const li = document.createElement("li");
    li.textContent = src;
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
    li.textContent = src;
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
  largeList.className = "small mb-0 ps-3";
  for (const src of largeImages) {
    const li = document.createElement("li");
    li.textContent = src;
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
  copyBtn.className = "btn btn-sm btn-secondary";
  copyBtn.textContent = "Copy";
  copyBtn.dataset.storageAction = "copy";
  copyBtn.dataset.kind = item.kind;
  copyBtn.dataset.key = item.key;

  actions.append(copyBtn);

  row.append(heading, value, actions);
  return row;
}

function renderStorage(payload) {
  const output = document.getElementById("storage-output");
  output.textContent = "";

  if (!payload.items.length) {
    output.textContent = "No storage items found.";
    return;
  }

  for (const item of payload.items) {
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
      await navigator.clipboard.writeText(
        JSON.stringify(lastStoragePayload, null, 2),
      );
      flashButtonLabel(sourceButton, "Copied");
      setStatus("Storage JSON copied.");
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
    return;
  }

  if (tabName === "perf") {
    await runAction("perf");
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

  const darkModeSwitch = document.getElementById("dark-mode-switch");
  if (darkModeSwitch instanceof HTMLInputElement) {
    const darkModeEnabled = await loadDarkModeEnabled();
    darkModeSwitch.checked = darkModeEnabled;
    applyTheme(darkModeEnabled);

    darkModeSwitch.addEventListener("change", () => {
      const enabled = darkModeSwitch.checked;
      applyTheme(enabled);
      void saveDarkModeEnabled(enabled);
    });
  }

  renderBuildInfo();
  renderDeviceInfo();
  void switchTab(currentTab);
}

void bindEvents();
