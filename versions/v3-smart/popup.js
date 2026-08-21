const statusText = document.getElementById("statusText");
const messagesPanel = document.getElementById("messages");
const subscriptionsPanel = document.getElementById("subscriptions");
const overviewPanel = document.getElementById("overview");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");

function setStatus(text) {
  statusText.textContent = text;
}

async function getActiveGmailTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith("https://mail.google.com/")) {
    throw new Error("Open Gmail in the active tab first.");
  }
  return tab;
}

async function sendToActive(type) {
  const tab = await getActiveGmailTab();
  return chrome.tabs.sendMessage(tab.id, { type });
}

async function loadState() {
  const stored = await chrome.storage.local.get(["inboxAvengerState"]);
  return stored.inboxAvengerState || { messages: [], subscriptions: [], lastUpdated: null };
}

function prettyCategory(category) {
  return {
    high_risk: "High Risk",
    medium_risk: "Medium Risk",
    deal: "Deal",
    promo: "Promo",
    newsletter: "Newsletter",
    normal: "Normal"
  }[category] || "Normal";
}

function countByCategory(items) {
  const counts = {
    high_risk: 0,
    medium_risk: 0,
    deal: 0,
    promo: 0,
    newsletter: 0,
    normal: 0
  };
  items.forEach((item) => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });
  return counts;
}

function messageCard(item) {
  return `
    <div class="card">
      <div class="cardTop">
        <span class="pill ${item.category}">${prettyCategory(item.category)}</span>
        <span class="risk">Risk ${item.riskFactor}</span>
      </div>
      <div class="subject">${escapeHtml(item.subject || "(no subject)")}</div>
      <div class="sender">${escapeHtml(item.sender || "(unknown sender)")}</div>
      <div class="snippet">${escapeHtml(item.snippet || "")}</div>
      <div class="meta">
        <span>${item.scannedWholeMessage ? "Whole message scanned" : "Row/snippet scan"}</span>
        <span>${item.canUnsubscribe ? "Unsubscribe found" : "No unsubscribe found"}</span>
      </div>
    </div>
  `;
}

function subscriptionCard(item) {
  const buttons = item.unsubscribeLinks?.length
    ? item.unsubscribeLinks.map((link, index) => `
        <button class="openLinkBtn" data-url="${encodeURIComponent(link.href)}">
          ${link.href.startsWith("mailto:") ? "Email unsubscribe" : "Open unsubscribe"}
        </button>
        <div class="linkLabel">${escapeHtml(link.text || link.href)}</div>
      `).join("")
    : `<div class="muted">No unsubscribe link captured yet. Open that email and run “Scan Open Email”.</div>`;

  return `
    <div class="card">
      <div class="cardTop">
        <span class="pill ${item.category}">${prettyCategory(item.category)}</span>
        <span class="risk">Risk ${item.riskFactor}</span>
      </div>
      <div class="subject">${escapeHtml(item.subject || "(no subject)")}</div>
      <div class="sender">${escapeHtml(item.sender || "(unknown sender)")}</div>
      <div class="snippet">${escapeHtml(item.snippet || "")}</div>
      <div class="meta">
        <span>This is what you would unsubscribe from</span>
      </div>
      <div class="linkGroup">${buttons}</div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function applyFilters(items) {
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;

  return items.filter((item) => {
    const categoryOk = category === "all" || item.category === category;
    if (!categoryOk) return false;

    if (!query) return true;

    const haystack = [
      item.sender || "",
      item.subject || "",
      item.snippet || ""
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  });
}

async function render() {
  const state = await loadState();
  const filteredMessages = applyFilters(state.messages || []);
  const filteredSubs = applyFilters(state.subscriptions || []);
  const counts = countByCategory(state.messages || []);

  overviewPanel.innerHTML = `
    <div class="summaryGrid">
      <div class="summaryCard"><strong>${state.messages?.length || 0}</strong><span>Cached Messages</span></div>
      <div class="summaryCard"><strong>${counts.high_risk}</strong><span>High Risk</span></div>
      <div class="summaryCard"><strong>${counts.medium_risk}</strong><span>Medium Risk</span></div>
      <div class="summaryCard"><strong>${counts.deal}</strong><span>Deals</span></div>
      <div class="summaryCard"><strong>${counts.promo}</strong><span>Promo</span></div>
      <div class="summaryCard"><strong>${counts.newsletter}</strong><span>Newsletters</span></div>
    </div>
    <div class="note">
      <strong>Subscription Center:</strong> ${state.subscriptions?.filter((x) => x.canUnsubscribe).length || 0} messages currently have captured unsubscribe actions.
    </div>
    <div class="note">
      ${state.lastUpdated ? `Last updated: ${new Date(state.lastUpdated).toLocaleString()}` : "No scans yet."}
    </div>
  `;

  messagesPanel.innerHTML = filteredMessages.length
    ? filteredMessages.map(messageCard).join("")
    : `<div class="empty">No messages match the current filter.</div>`;

  subscriptionsPanel.innerHTML = filteredSubs.length
    ? filteredSubs.map(subscriptionCard).join("")
    : `<div class="empty">No subscription-like messages match the current filter.</div>`;

  subscriptionsPanel.querySelectorAll(".openLinkBtn").forEach((button) => {
    button.addEventListener("click", async () => {
      const url = decodeURIComponent(button.dataset.url);
      await chrome.tabs.create({ url });
    });
  });
}

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab).classList.add("active");
  });
});

document.getElementById("scanInboxBtn").addEventListener("click", async () => {
  try {
    setStatus("Scanning inbox...");
    await sendToActive("IA_SCAN_INBOX");
    await render();
    setStatus("Inbox scan complete");
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById("scanOpenBtn").addEventListener("click", async () => {
  try {
    setStatus("Scanning open email...");
    await sendToActive("IA_SCAN_OPEN_MESSAGE");
    await render();
    setStatus("Open-email scan complete");
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById("fullScanBtn").addEventListener("click", async () => {
  try {
    setStatus("Running full scan...");
    await sendToActive("IA_FULL_SCAN");
    await render();
    setStatus("Full scan complete");
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById("clearBtn").addEventListener("click", async () => {
  try {
    setStatus("Clearing cache...");
    await sendToActive("IA_CLEAR_CACHE");
    await render();
    setStatus("Cache cleared");
  } catch (error) {
    setStatus(error.message);
  }
});

searchInput.addEventListener("input", render);
categoryFilter.addEventListener("change", render);

render();
