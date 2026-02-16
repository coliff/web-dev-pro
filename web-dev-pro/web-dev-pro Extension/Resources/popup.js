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

function setStatus(text, isError = false) {
  const node = document.getElementById("status");
  node.textContent = text;
  node.classList.toggle("text-danger", isError);
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

function renderSEO(result) {
  const output = document.getElementById("seo-output");
  output.textContent = "";

  renderKeyValues("seo-output", {
    "Title length": result.titleLength,
    "Meta description length": result.metaDescriptionLength,
    "Canonical URL": result.canonicalUrl || "Missing",
    "Open Graph tags": result.openGraphCount,
    "Structured data": result.structuredData.join(", ") || "None",
  });

  appendList(output, "Warnings", result.warnings);
}

function renderA11y(result) {
  const output = document.getElementById("a11y-output");
  output.textContent = "";

  renderKeyValues("a11y-output", {
    "Missing alt count": result.missingAltCount,
    "Low contrast findings": result.lowContrastCount,
    "Headings found": result.headingTree.length,
    "ARIA inspect": "Enabled (tap page element)",
  });

  appendList(output, "Missing alt samples", result.missingAltSamples);
  appendList(output, "Heading tree", result.headingTree);
}

function renderPerf(result) {
  const safeResult = result && typeof result === "object" ? result : {};
  const largeImages = Array.isArray(safeResult.largeImages) ? safeResult.largeImages : [];
  const blockingHeadScripts = Array.isArray(safeResult.blockingHeadScripts)
    ? safeResult.blockingHeadScripts
    : [];

  const output = document.getElementById("perf-output");
  output.textContent = "";

  renderKeyValues("perf-output", {
    "Total DOM nodes": safeResult.domNodes ?? 0,
    "Page weight estimate": `${safeResult.pageWeightKb ?? 0} KB`,
    "External scripts": safeResult.externalScripts ?? 0,
    "Large images": largeImages.length,
    "Blocking <head> scripts": blockingHeadScripts.length,
  });

  appendList(output, "Large images", largeImages);
  appendList(output, "Blocking scripts", blockingHeadScripts);
}

function makeStorageRow(item) {
  const row = document.createElement("div");
  row.className = "storage-row rounded-3";

  const heading = document.createElement("strong");
  heading.textContent = `${item.kind} :: ${item.key}`;

  const value = document.createElement("code");
  value.textContent = item.value;

  const actions = document.createElement("div");
  actions.className = "storage-actions d-flex gap-1 mt-1";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "Copy";
  copyBtn.dataset.storageAction = "copy";
  copyBtn.dataset.kind = item.kind;
  copyBtn.dataset.key = item.key;

  actions.append(copyBtn);

  if (item.editable) {
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.dataset.storageAction = "edit";
    editBtn.dataset.kind = item.kind;
    editBtn.dataset.key = item.key;
    actions.append(editBtn);
  }

  if (item.deletable) {
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.dataset.storageAction = "delete";
    delBtn.dataset.kind = item.kind;
    delBtn.dataset.key = item.key;
    actions.append(delBtn);
  }

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
    setStatus(`Copied ${kind}:${key}`);
    return;
  }

  if (action === "edit") {
    const next = prompt(`Update ${kind}:${key}`, item.value);
    if (next === null) {
      return;
    }

    await sendToActiveTab({ action: "storage-set", kind, key, value: next });
    await loadStorage();
    setStatus(`Updated ${kind}:${key}`);
    return;
  }

  if (action === "delete") {
    const approved = confirm(`Delete ${kind}:${key}?`);
    if (!approved) {
      return;
    }

    await sendToActiveTab({ action: "storage-delete", kind, key });
    await loadStorage();
    setStatus(`Deleted ${kind}:${key}`);
  }
}

async function runAction(action) {
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
      await runAction(actionButton.dataset.action);
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
  void switchTab(currentTab);
}

void bindEvents();
