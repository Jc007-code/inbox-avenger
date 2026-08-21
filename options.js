const databaseEditor = document.getElementById("databaseEditor");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importExportBox = document.getElementById("importExportBox");
const statusEl = document.getElementById("status");

const fieldDescriptions = {
  highRisk: "Strong phishing phrases, account warnings, fake login pressure, and urgent verification language.",
  scam: "Payment scams, identity theft, prize scams, fake package notices, and suspicious money requests.",
  attachmentRisk: "Attachment and file indicators that deserve extra caution.",
  spam: "General spam language that may not be phishing but is usually low-quality.",
  promotional: "Marketing and promotional words used to separate ads from real conversations.",
  usefulDeals: "Deal-quality signals used to separate useful deals from regular promotions.",
  safeBusiness: "Normal transactional or business signals that usually lower risk.",
  unsubscribeSignals: "Signals that an email is a newsletter or marketing list.",
  customGood: "Learned or manually added safe/normal words.",
  customBad: "Learned or manually added risky/spam words.",
  customDeal: "Learned or manually added useful deal words."
};

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function niceName(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
}

function listToText(list) {
  return (list || []).join("\n");
}

function textToList(text) {
  return text.split("\n").map(line => line.trim()).filter(Boolean);
}

function setStatus(text) {
  statusEl.textContent = text;
  setTimeout(() => {
    if (statusEl.textContent === text) statusEl.textContent = "";
  }, 4500);
}

async function getState() {
  const response = await send({ type: "IA_GET_STATE" });
  if (!response?.ok) throw new Error(response?.error || "Could not load settings.");
  return response;
}

async function loadOptions() {
  const state = await getState();
  const { database, settings } = state;

  for (const key of [
    "mode", "scanDepthMode", "badgeStyle"
  ]) {
    document.getElementById(key).value = settings[key];
  }

  for (const key of [
    "scanIntervalMinutes", "maxPagesPerScan", "maxMessagesPerPage",
    "highRiskThreshold", "mediumRiskThreshold", "usefulDealThreshold",
    "promotionalThreshold", "spamThreshold", "mlWeight", "highRiskMlBoost",
    "maxVisibleRowsToScan", "fontScale"
  ]) {
    document.getElementById(key).value = settings[key];
  }

  for (const key of [
    "backgroundScanEnabled", "applyGmailLabels", "notifyOnHighRisk",
    "showGmailBadges", "scanInboxRows", "scanOpenEmailBody", "autoSaveScanHistory"
  ]) {
    document.getElementById(key).checked = Boolean(settings[key]);
  }

  document.getElementById("gmailSearchQuery").value = settings.gmailSearchQuery;
  document.getElementById("themeColor").value = settings.themeColor;
  document.getElementById("trustedSenders").value = listToText(settings.trustedSenders);
  document.getElementById("blockedSenders").value = listToText(settings.blockedSenders);

  for (const [key, value] of Object.entries(settings.categoryVisibility)) {
    const el = document.getElementById(`vis-${key}`);
    if (el) el.checked = Boolean(value);
  }

  databaseEditor.innerHTML = "";

  for (const key of Object.keys(database)) {
    const card = document.createElement("div");
    card.className = "editorCard";

    const title = document.createElement("h3");
    title.textContent = niceName(key);

    const desc = document.createElement("p");
    desc.textContent = fieldDescriptions[key] || "Custom word list.";

    const textarea = document.createElement("textarea");
    textarea.id = `db-${key}`;
    textarea.value = listToText(database[key]);

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(textarea);
    databaseEditor.appendChild(card);
  }
}

function collectSettings() {
  return {
    mode: document.getElementById("mode").value,
    backgroundScanEnabled: document.getElementById("backgroundScanEnabled").checked,
    scanIntervalMinutes: Number(document.getElementById("scanIntervalMinutes").value || 5),
    maxPagesPerScan: Number(document.getElementById("maxPagesPerScan").value || 3),
    maxMessagesPerPage: Number(document.getElementById("maxMessagesPerPage").value || 25),
    gmailSearchQuery: document.getElementById("gmailSearchQuery").value || "newer_than:30d -in:chats",
    applyGmailLabels: document.getElementById("applyGmailLabels").checked,
    notifyOnHighRisk: document.getElementById("notifyOnHighRisk").checked,

    highRiskThreshold: Number(document.getElementById("highRiskThreshold").value || 13),
    mediumRiskThreshold: Number(document.getElementById("mediumRiskThreshold").value || 7),
    usefulDealThreshold: Number(document.getElementById("usefulDealThreshold").value || 5),
    promotionalThreshold: Number(document.getElementById("promotionalThreshold").value || 4),
    spamThreshold: Number(document.getElementById("spamThreshold").value || 5),
    mlWeight: Number(document.getElementById("mlWeight").value || 0.28),
    highRiskMlBoost: Number(document.getElementById("highRiskMlBoost").value || 5),

    scanDepthMode: document.getElementById("scanDepthMode").value,
    maxVisibleRowsToScan: Number(document.getElementById("maxVisibleRowsToScan").value || 80),
    showGmailBadges: document.getElementById("showGmailBadges").checked,
    scanInboxRows: document.getElementById("scanInboxRows").checked,
    scanOpenEmailBody: document.getElementById("scanOpenEmailBody").checked,
    showFloatingPanel: false,
    autoSaveScanHistory: document.getElementById("autoSaveScanHistory").checked,

    themeColor: document.getElementById("themeColor").value || "#2563eb",
    badgeStyle: document.getElementById("badgeStyle").value,
    fontScale: Number(document.getElementById("fontScale").value || 1),

    trustedSenders: textToList(document.getElementById("trustedSenders").value),
    blockedSenders: textToList(document.getElementById("blockedSenders").value),

    categoryVisibility: {
      highRisk: document.getElementById("vis-highRisk").checked,
      mediumRisk: document.getElementById("vis-mediumRisk").checked,
      spam: document.getElementById("vis-spam").checked,
      promotional: document.getElementById("vis-promotional").checked,
      usefulDeal: document.getElementById("vis-usefulDeal").checked,
      transactional: document.getElementById("vis-transactional").checked,
      normal: document.getElementById("vis-normal").checked
    }
  };
}

function collectDatabase() {
  const database = {};
  for (const key of Object.keys(InboxAvengerClassifier.DEFAULT_DATABASE)) {
    const textarea = document.getElementById(`db-${key}`);
    database[key] = textToList(textarea.value);
  }
  return database;
}

async function saveAll() {
  const response = await send({
    type: "IA_SAVE_SETTINGS",
    settings: collectSettings(),
    database: collectDatabase()
  });

  if (response?.ok) setStatus("Saved. Reload Gmail for visible-row badge changes.");
  else setStatus(response?.error || "Save failed.");
}

saveBtn.addEventListener("click", saveAll);

resetBtn.addEventListener("click", async () => {
  const response = await send({ type: "IA_RESET_DEFAULTS" });
  if (response?.ok) {
    await loadOptions();
    setStatus("Reset to Version 5 Final defaults.");
  }
});

exportBtn.addEventListener("click", async () => {
  const state = await getState();
  importExportBox.value = JSON.stringify({
    database: state.database,
    settings: state.settings
  }, null, 2);
  setStatus("Exported JSON into the box.");
});

importBtn.addEventListener("click", async () => {
  try {
    const parsed = JSON.parse(importExportBox.value);
    const response = await send({
      type: "IA_SAVE_SETTINGS",
      database: parsed.database,
      settings: parsed.settings
    });

    if (!response?.ok) throw new Error(response?.error || "Import failed.");

    await loadOptions();
    setStatus("Imported settings successfully.");
  } catch (error) {
    setStatus("Import failed. Check JSON formatting.");
  }
});

loadOptions().catch(error => setStatus(String(error.message || error)));
