const ext = globalThis.browser ?? globalThis.chrome;

let lastStoragePayload = null;
let currentTab = "seo";

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
        reject(new Error(err.message));
        return;
      }
      resolve(response);
    });
  });
}

function setStatus(text, isError = false) {
  const node = document.getElementById("status");
  node.textContent = text;
  node.className = isError ? "fail" : "";
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
    empty.className = "ok";
    empty.textContent = "None";
    line.append(empty);
  } else {
    const detail = document.createElement("span");
    detail.className = "warn";
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
  const output = document.getElementById("perf-output");
  output.textContent = "";

  renderKeyValues("perf-output", {
    "Total DOM nodes": result.domNodes,
    "Page weight estimate": `${result.pageWeightKb} KB`,
    "External scripts": result.externalScripts,
    "Large images": result.largeImages.length,
    "Blocking <head> scripts": result.blockingHeadScripts.length,
  });

  appendList(output, "Large images", result.largeImages);
  appendList(output, "Blocking scripts", result.blockingHeadScripts);
}

function makeStorageRow(item) {
  const row = document.createElement("div");
  row.className = "storage-row";

  const heading = document.createElement("strong");
  heading.textContent = `${item.kind} :: ${item.key}`;

  const value = document.createElement("code");
  value.textContent = item.value;

  const actions = document.createElement("div");
  actions.className = "storage-actions";

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "Copy";
  copyBtn.dataset.storageAction = "copy";
  copyBtn.dataset.kind = item.kind;
  copyBtn.dataset.key = item.key;

  actions.append(copyBtn);

  if (item.editable) {
    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.dataset.storageAction = "edit";
    editBtn.dataset.kind = item.kind;
    editBtn.dataset.key = item.key;
    actions.append(editBtn);
  }

  if (item.deletable) {
    const delBtn = document.createElement("button");
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

async function handleStorageAction(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.storageAction;
  if (!action) {
    return;
  }

  const kind = target.dataset.kind;
  const key = target.dataset.key;

  if (!kind || !key || !lastStoragePayload) {
    return;
  }

  const item = lastStoragePayload.items.find(
    (entry) => entry.kind === kind && entry.key === key,
  );
  if (!item) {
    return;
  }

  if (action === "copy") {
    await navigator.clipboard.writeText(item.value);
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
  setStatus(`Running ${action}...`);

  try {
    if (action === "a11y-filter-none") {
      await sendToActiveTab({ action: "a11y-color-filter", filter: "none" });
    } else if (action === "a11y-filter-protanopia") {
      await sendToActiveTab({
        action: "a11y-color-filter",
        filter: "protanopia",
      });
    } else if (action === "a11y-filter-deuteranopia") {
      await sendToActiveTab({
        action: "a11y-color-filter",
        filter: "deuteranopia",
      });
    } else if (action === "a11y-filter-tritanopia") {
      await sendToActiveTab({
        action: "a11y-color-filter",
        filter: "tritanopia",
      });
    } else if (action === "seo") {
      const result = await sendToActiveTab({ action: "seo-snapshot" });
      renderSEO(result);
    } else if (action === "a11y") {
      const result = await sendToActiveTab({ action: "a11y-snapshot" });
      renderA11y(result);
    } else if (action === "perf") {
      const result = await sendToActiveTab({ action: "perf-snapshot" });
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

    setStatus(`${action} complete`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

async function toggleCssTool(button) {
  const tool = button.dataset.cssTool;
  if (!tool) {
    return;
  }

  try {
    const response = await sendToActiveTab({ action: "css-tool-toggle", tool });
    button.classList.toggle("active", response.active);
    setStatus(`${tool}: ${response.active ? "on" : "off"}`);
  } catch (error) {
    setStatus(error.message || String(error), true);
  }
}

async function switchTab(tabName) {
  if (!tabName) {
    return;
  }

  currentTab = tabName;

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });

  if (tabName === "seo") {
    await runAction("seo");
    return;
  }

  if (tabName === "perf") {
    await runAction("perf");
  }
}

function bindEvents() {
  document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.dataset.tab) {
      await switchTab(target.dataset.tab);
      return;
    }

    if (target.dataset.action) {
      await runAction(target.dataset.action);
      return;
    }

    if (target.dataset.cssTool) {
      await toggleCssTool(target);
      return;
    }

    await handleStorageAction(event);
  });
}

bindEvents();
