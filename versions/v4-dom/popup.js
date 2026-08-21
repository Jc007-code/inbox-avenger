const statusText = document.getElementById("statusText");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");

function setStatus(text) { statusText.textContent = text; }

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith("https://mail.google.com/")) {
    throw new Error("Open Gmail in the active tab first.");
  }
  return tab;
}

async function send(type, extra = {}) {
  const tab = await activeTab();
  return chrome.tabs.sendMessage(tab.id, { type, ...extra });
}

async function loadState() {
  const stored = await chrome.storage.local.get(["inboxAvengerV4State", "inboxAvengerV4Memory"]);
  return {
    state: stored.inboxAvengerV4State || { messages: [], subscriptions: [], lastUpdated: null },
    memory: stored.inboxAvengerV4Memory || { savedFilters: [], triageQueue: [] }
  };
}

function pretty(category) {
  return {
    high_risk: "High Risk",
    medium_risk: "Medium Risk",
    important: "Important",
    deal: "Deal",
    promo: "Promo",
    newsletter: "Newsletter",
    normal: "Normal"
  }[category] || "Normal";
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function filtered(items) {
  const q = searchInput.value.trim().toLowerCase();
  const cat = categoryFilter.value;
  return items.filter((item) => {
    if (cat !== "all" && item.category !== cat) return false;
    if (!q) return true;
    const hay = [item.sender, item.subject, item.snippet].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

function messageCard(item) {
  return `
    <div class="card">
      <div class="cardTop">
        <span class="pill ${item.category}">${pretty(item.category)}</span>
        <span class="risk">Risk ${item.riskFactor}</span>
      </div>
      <div class="subject">${esc(item.subject || "(no subject)")}</div>
      <div class="sender">${esc(item.sender || "(unknown sender)")}</div>
      <div class="snippet">${esc(item.snippet || "")}</div>
      <div class="rowActions">
        <button class="queueBtn secondary" data-key="${esc(item.key)}">Add to Triage</button>
      </div>
    </div>
  `;
}

function subscriptionCard(item) {
  const links = item.unsubscribeLinks?.length
    ? item.unsubscribeLinks.map((link) => `
      <button class="linkBtn" data-url="${encodeURIComponent(link.href)}">${link.href.startsWith("mailto:") ? "Email unsubscribe" : "Open unsubscribe"}</button>
      <div class="linkLabel">${esc(link.text || link.href)}</div>
    `).join("")
    : `<div class="muted">No unsubscribe link captured yet. Open the email and run Scan Open Email.</div>`;

  return `
    <div class="card">
      <div class="cardTop">
        <span class="pill ${item.category}">${pretty(item.category)}</span>
        <span class="risk">Risk ${item.riskFactor}</span>
      </div>
      <div class="subject">${esc(item.subject || "(no subject)")}</div>
      <div class="sender">${esc(item.sender || "(unknown sender)")}</div>
      <div class="snippet">${esc(item.snippet || "")}</div>
      <div class="linkGroup">${links}</div>
    </div>
  `;
}

async function render() {
  const { state, memory } = await loadState();
  const msgs = filtered(state.messages || []);
  const subs = filtered(state.subscriptions || []);
  const triage = (state.messages || []).filter((m) => (memory.triageQueue || []).includes(m.key));

  document.getElementById("overview").innerHTML = `
    <div class="note">Cached messages: ${state.messages?.length || 0}</div>
    <div class="note">Saved filters: ${(memory.savedFilters || []).length}</div>
    <div class="note">${state.lastUpdated ? "Last updated: " + new Date(state.lastUpdated).toLocaleString() : "No scans yet."}</div>
  `;

  document.getElementById("messages").innerHTML =
    msgs.length ? msgs.map(messageCard).join("") : `<div class="empty">No messages match the current filter.</div>`;

  document.getElementById("subscriptions").innerHTML =
    subs.length ? subs.map(subscriptionCard).join("") : `<div class="empty">No subscription-like messages match the current filter.</div>`;

  document.getElementById("triage").innerHTML =
    triage.length ? triage.map(messageCard).join("") : `<div class="empty">No messages in the triage queue.</div>`;

  document.querySelectorAll(".queueBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await send("IA4_QUEUE_KEYS", { keys: [btn.dataset.key] });
      setStatus("Added to triage");
      await render();
    });
  });

  document.querySelectorAll(".linkBtn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await chrome.tabs.create({ url: decodeURIComponent(btn.dataset.url) });
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
    await send("IA4_SCAN_INBOX");
    await render();
    setStatus("Inbox scan complete");
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById("scanOpenBtn").addEventListener("click", async () => {
  try {
    setStatus("Scanning open email...");
    await send("IA4_SCAN_OPEN");
    await render();
    setStatus("Open-email scan complete");
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById("clearBtn").addEventListener("click", async () => {
  try {
    setStatus("Clearing cache...");
    await send("IA4_CLEAR_CACHE");
    await render();
    setStatus("Cache cleared");
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById("saveFilterBtn").addEventListener("click", async () => {
  try {
    const name = document.getElementById("saveFilterName").value.trim();
    if (!name) return setStatus("Enter a filter name first");

    await send("IA4_SAVE_FILTER", {
      filter: { name, query: searchInput.value.trim(), category: categoryFilter.value }
    });

    document.getElementById("saveFilterName").value = "";
    setStatus("Saved filter");
    await render();
  } catch (error) {
    setStatus(error.message);
  }
});

searchInput.addEventListener("input", render);
categoryFilter.addEventListener("change", render);
render();
