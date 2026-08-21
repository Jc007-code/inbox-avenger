const statusText = document.getElementById("statusText");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");

function setStatus(text) { statusText.textContent = text; }

async function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

async function loadIndex() {
  const stored = await chrome.storage.local.get(["inboxAvengerV5Index"]);
  return stored.inboxAvengerV5Index || {
    messages: [],
    sync: { lastSync: null, indexedCount: 0 }
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

async function performSearch() {
  const response = await send("IA5_SEARCH_INDEX", {
    query: searchInput.value.trim(),
    category: categoryFilter.value
  });
  return response.result || [];
}

function resultCard(item) {
  return `
    <div class="card">
      <div class="cardTop">
        <span class="pill ${item.category}">${pretty(item.category)}</span>
        <span class="risk">Risk ${item.riskFactor}</span>
      </div>
      <div class="subject">${esc(item.subject || "(no subject)")}</div>
      <div class="sender">${esc(item.from || "(unknown sender)")}</div>
      <div class="snippet">${esc(item.snippet || "")}</div>
      <div class="meta">${esc(item.domain || "no-domain")}</div>
    </div>
  `;
}

function unsubCard(item) {
  const links = item.unsubscribeLinks?.length
    ? item.unsubscribeLinks.map((link) => `<button class="linkBtn" data-url="${encodeURIComponent(link)}">${link.startsWith("mailto:") ? "Email unsubscribe" : "Open unsubscribe"}</button>`).join("")
    : `<div class="muted">No unsubscribe action captured</div>`;

  return `
    <div class="card">
      <div class="cardTop">
        <span class="pill ${item.category}">${pretty(item.category)}</span>
        <span class="risk">Risk ${item.riskFactor}</span>
      </div>
      <div class="subject">${esc(item.subject || "(no subject)")}</div>
      <div class="sender">${esc(item.from || "(unknown sender)")}</div>
      <div class="linkGroup">${links}</div>
    </div>
  `;
}

async function render() {
  const index = await loadIndex();
  const results = await performSearch();

  document.getElementById("overview").innerHTML = `
    <div class="note">Indexed messages: ${index.messages?.length || 0}</div>
    <div class="note">${index.sync?.lastSync ? "Last sync: " + new Date(index.sync.lastSync).toLocaleString() : "No mailbox sync yet."}</div>
  `;

  document.getElementById("results").innerHTML =
    results.length ? results.map(resultCard).join("") : `<div class="empty">No indexed messages match the current search.</div>`;

  const unsubItems = (index.messages || []).filter((m) => (m.unsubscribeLinks || []).length);
  document.getElementById("unsubscribe").innerHTML =
    unsubItems.length ? unsubItems.map(unsubCard).join("") : `<div class="empty">No unsubscribe actions found in the indexed messages.</div>`;

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

document.getElementById("syncBtn").addEventListener("click", async () => {
  try {
    setStatus("Syncing mailbox...");
    const response = await send("IA5_SYNC_MAILBOX");
    if (!response.ok) throw new Error(response.error || "Sync failed");
    await render();
    setStatus("Mailbox sync complete");
  } catch (error) {
    setStatus(error.message);
  }
});

document.getElementById("refreshBtn").addEventListener("click", async () => {
  await render();
  setStatus("View refreshed");
});

document.getElementById("createLabelBtn").addEventListener("click", async () => {
  try {
    const name = document.getElementById("labelName").value.trim();
    if (!name) return setStatus("Enter a label name first");
    const response = await send("IA5_CREATE_LABEL", { name });
    if (!response.ok) throw new Error(response.error || "Label creation failed");
    setStatus("Label request sent");
  } catch (error) {
    setStatus(error.message);
  }
});

searchInput.addEventListener("input", render);
categoryFilter.addEventListener("change", render);
render();
