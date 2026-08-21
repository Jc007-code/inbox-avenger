const els = {
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".tabPanel"),
  modePill: document.getElementById("modePill"),
  statusText: document.getElementById("statusText"),
  lastRunText: document.getElementById("lastRunText"),
  statsGrid: document.getElementById("statsGrid"),
  latestResults: document.getElementById("latestResults"),
  resultFilter: document.getElementById("resultFilter"),
  runScanBtn: document.getElementById("runScanBtn"),
  demoScanBtn: document.getElementById("demoScanBtn"),
  emailText: document.getElementById("emailText"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  clearTextBtn: document.getElementById("clearTextBtn"),
  resultCard: document.getElementById("resultCard"),
  resultLabel: document.getElementById("resultLabel"),
  resultScore: document.getElementById("resultScore"),
  resultCategory: document.getElementById("resultCategory"),
  resultExplanation: document.getElementById("resultExplanation"),
  riskMeter: document.getElementById("riskMeter"),
  spamMeter: document.getElementById("spamMeter"),
  promoMeter: document.getElementById("promoMeter"),
  dealMeter: document.getElementById("dealMeter"),
  mlBox: document.getElementById("mlBox"),
  matchesList: document.getElementById("matchesList"),
  unsubscribeBox: document.getElementById("unsubscribeBox"),
  actionsList: document.getElementById("actionsList"),
  correctionSelect: document.getElementById("correctionSelect"),
  saveCorrectionBtn: document.getElementById("saveCorrectionBtn"),
  authBtn: document.getElementById("authBtn"),
  visibleScanBtn: document.getElementById("visibleScanBtn"),
  openOptionsBtn: document.getElementById("openOptionsBtn"),
  historyFilter: document.getElementById("historyFilter"),
  historyList: document.getElementById("historyList"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  optionsBtn: document.getElementById("optionsBtn")
};

let state = null;
let lastResult = null;
let lastText = "";

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function setActiveTab(name) {
  els.tabs.forEach(tab => tab.classList.toggle("active", tab.dataset.tab === name));
  els.panels.forEach(panel => panel.classList.toggle("active", panel.id === `tab-${name}`));
}

els.tabs.forEach(tab => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));

function labelClass(label) {
  if (label === "High Risk") return "high";
  if (label === "Medium Risk") return "medium";
  if (label === "Spam") return "spam";
  if (label === "Useful Deal") return "deal";
  if (label === "Promotional") return "promo";
  return "low";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtDate(value) {
  if (!value) return "Never";
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

async function refreshState() {
  const response = await send({ type: "IA_GET_STATE" });
  if (!response?.ok) throw new Error(response?.error || "Could not get state.");
  state = response;

  els.modePill.textContent = state.settings.mode === "api" ? "Gmail API Mode" : "Demo Mode";
  els.statusText.textContent = state.status?.message || "Ready.";
  els.lastRunText.textContent = `Last run: ${fmtDate(state.lastRun)}`;

  renderStats();
  renderLatestResults();
  renderHistory();
}

function renderStats() {
  const stats = state?.stats || {};
  const rows = [
    ["Total", stats.totalScanned || 0],
    ["High Risk", stats.highRisk || 0],
    ["Medium", stats.mediumRisk || 0],
    ["Spam", stats.spam || 0],
    ["Promo", stats.promotional || 0],
    ["Deals", stats.usefulDeal || 0],
    ["Trans.", stats.transactional || 0],
    ["Normal", stats.normal || 0]
  ];

  els.statsGrid.innerHTML = "";
  rows.forEach(([label, count]) => {
    const div = document.createElement("div");
    div.className = "summaryBox";
    div.innerHTML = `<b>${count}</b><span>${label}</span>`;
    els.statsGrid.appendChild(div);
  });
}

function renderResultList(container, items, filterText = "") {
  const search = filterText.trim().toLowerCase();
  const filtered = (items || []).filter(item => {
    const text = `${item.from || ""} ${item.subject || ""} ${item.snippet || ""} ${item.result?.label || ""} ${item.result?.category || ""}`.toLowerCase();
    return !search || text.includes(search);
  });

  container.innerHTML = "";

  if (!filtered.length) {
    container.textContent = items?.length ? "No results match this search." : "No results yet.";
    return;
  }

  filtered.slice(0, 80).forEach(item => {
    const div = document.createElement("div");
    div.className = "scanItem";
    div.innerHTML = `
      <strong>${escapeHtml(item.result?.label || "Unknown")}</strong> — ${escapeHtml(item.result?.category || "")}<br>
      Risk ${item.result?.riskScore ?? "?"} | ML ${escapeHtml(item.result?.ml?.label || "?")} ${item.result?.ml?.confidence ?? "?"}% | Confidence ${item.result?.confidence ?? "?"}%<br>
      <strong>${escapeHtml(item.subject || "No subject")}</strong><br>
      ${escapeHtml(item.from || "")}<br>
      ${escapeHtml((item.snippet || "").slice(0, 220))}
    `;
    container.appendChild(div);
  });
}

function renderLatestResults() {
  renderResultList(els.latestResults, state?.lastResults || [], els.resultFilter.value);
}

function renderHistory() {
  renderResultList(els.historyList, state?.history || [], els.historyFilter.value);
}

function renderSingleResult(result) {
  lastResult = result;
  els.resultCard.classList.remove("hidden");
  els.resultLabel.textContent = result.label;
  els.resultLabel.className = `resultLabel ${labelClass(result.label)}`;
  els.resultScore.textContent = `Risk ${result.riskScore} | Confidence ${result.confidence}%`;
  els.resultCategory.textContent = `${result.category}${result.sender ? " | Sender: " + result.sender : ""}`;
  els.resultExplanation.textContent = result.explanation;

  els.riskMeter.value = Math.min(35, result.riskScore);
  els.spamMeter.value = Math.min(20, result.spamScore);
  els.promoMeter.value = Math.min(20, result.promoScore);
  els.dealMeter.value = Math.min(20, result.dealScore);

  els.mlBox.innerHTML = `
    <strong>${escapeHtml(result.ml.label)}</strong> at ${result.ml.confidence}% confidence<br>
    Top guesses: ${result.ml.top.map(x => `${escapeHtml(x.label)} ${x.probability}%`).join(", ")}
  `;

  els.matchesList.innerHTML = "";
  const entries = Object.entries(result.matched).filter(([, value]) => Array.isArray(value) && value.length);
  if (!entries.length) {
    const li = document.createElement("li");
    li.textContent = "No strong keyword or link matches found.";
    els.matchesList.appendChild(li);
  } else {
    entries.forEach(([group, values]) => {
      const li = document.createElement("li");
      li.textContent = `${group}: ${values.slice(0, 8).join(", ")}`;
      els.matchesList.appendChild(li);
    });
  }

  els.unsubscribeBox.innerHTML = "";
  if (result.unsubscribeLinks?.length) {
    result.unsubscribeLinks.forEach(link => {
      const div = document.createElement("div");
      div.textContent = link;
      els.unsubscribeBox.appendChild(div);
    });
  } else if (result.matched.unsubscribeSignals.length) {
    els.unsubscribeBox.textContent = "Unsubscribe wording was detected, but no direct unsubscribe URL was found in the pasted text.";
  } else {
    els.unsubscribeBox.textContent = "No unsubscribe link detected.";
  }

  els.actionsList.innerHTML = "";
  result.nextActions.forEach(action => {
    const li = document.createElement("li");
    li.textContent = action;
    els.actionsList.appendChild(li);
  });
}

async function analyzeText() {
  const text = els.emailText.value.trim();
  if (!text) return;

  const { database, settings, corrections } = state;
  const result = InboxAvengerClassifier.classifyEmail(text, database, settings, {}, corrections);
  lastText = text;
  renderSingleResult(result);
}

async function runScan(interactiveAuth = false) {
  els.statusText.textContent = "Running scan...";
  const response = await send({ type: "IA_RUN_SCAN", interactiveAuth });
  if (!response?.ok) {
    els.statusText.textContent = response?.error || "Scan failed.";
    return;
  }
  await refreshState();
}

async function runDemoScan() {
  els.statusText.textContent = "Running demo scan...";
  const response = await send({ type: "IA_RUN_DEMO_SCAN" });
  if (!response?.ok) {
    els.statusText.textContent = response?.error || "Demo scan failed.";
    return;
  }
  await refreshState();
}

async function authorize() {
  els.statusText.textContent = "Opening Gmail authorization...";
  const response = await send({ type: "IA_AUTH_INTERACTIVE" });
  if (!response?.ok) {
    els.statusText.textContent = response?.error || "Authorization failed. Check OAuth client ID in manifest.json.";
    return;
  }
  await refreshState();
}

async function scanVisibleRows() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "IA_SCAN_VISIBLE_GMAIL" });
    if (!response?.ok) throw new Error(response?.error || "Visible scan failed.");
    state.lastResults = response.results || [];
    renderLatestResults();
    els.statusText.textContent = `Visible Gmail scan complete. ${state.lastResults.length} rows checked.`;
  } catch (error) {
    els.statusText.textContent = "Open or refresh Gmail, then try visible scan again.";
  }
}

async function saveCorrection() {
  if (!lastResult || !lastText) return;
  const correctedLabel = els.correctionSelect.value;
  if (!correctedLabel) return;

  const response = await send({
    type: "IA_SAVE_CORRECTION",
    originalLabel: lastResult.label,
    correctedLabel,
    selectedText: lastText.slice(0, 1000),
    source: "popup correction"
  });

  if (response?.ok) {
    els.correctionSelect.value = "";
    await refreshState();
    els.statusText.textContent = "Correction saved. The local ML model and custom word lists will use it.";
  }
}

async function clearHistory() {
  await send({ type: "IA_CLEAR_HISTORY" });
  await refreshState();
}

function openOptions() {
  chrome.runtime.openOptionsPage();
}

els.runScanBtn.addEventListener("click", () => runScan(false));
els.demoScanBtn.addEventListener("click", runDemoScan);
els.analyzeBtn.addEventListener("click", analyzeText);
els.clearTextBtn.addEventListener("click", () => {
  els.emailText.value = "";
  els.resultCard.classList.add("hidden");
});
els.saveCorrectionBtn.addEventListener("click", saveCorrection);
els.authBtn.addEventListener("click", authorize);
els.visibleScanBtn.addEventListener("click", scanVisibleRows);
els.openOptionsBtn.addEventListener("click", openOptions);
els.optionsBtn.addEventListener("click", openOptions);
els.clearHistoryBtn.addEventListener("click", clearHistory);
els.resultFilter.addEventListener("input", renderLatestResults);
els.historyFilter.addEventListener("input", renderHistory);

refreshState().catch(error => {
  els.statusText.textContent = String(error.message || error);
});
