/*
Inbox Avenger V5 Final - Gmail DOM fallback scanner.
This is intentionally conservative:
- it scans visible Gmail rows only
- it does not repeatedly open panels
- it ignores its own badges
The real background scanner uses Gmail API mode after OAuth is configured.
*/

let scanTimer = null;
let observer = null;
let scanInProgress = false;

async function getConfig() {
  const data = await chrome.storage.local.get(["avengerDatabase", "avengerSettings", "avengerCorrections"]);
  const merged = InboxAvengerClassifier.mergeConfig(data.avengerDatabase, data.avengerSettings);
  return {
    ...merged,
    corrections: Array.isArray(data.avengerCorrections) ? data.avengerCorrections : []
  };
}

function labelClass(label) {
  if (label === "High Risk") return "ia-high";
  if (label === "Medium Risk") return "ia-medium";
  if (label === "Spam") return "ia-spam";
  if (label === "Useful Deal") return "ia-deal";
  if (label === "Promotional") return "ia-promo";
  return "ia-low";
}

function badgeText(result) {
  if (result.label === "High Risk") return `⚠ High Risk ${result.riskScore}`;
  if (result.label === "Medium Risk") return `⚠ Review ${result.riskScore}`;
  if (result.label === "Spam") return "Spam";
  if (result.label === "Useful Deal") return "✓ Useful Deal";
  if (result.label === "Promotional") return "Promo";
  if (result.label === "Transactional") return "Receipt/Info";
  return "Low Risk";
}

function isOwnUi(node) {
  if (!node || node.nodeType !== 1) return false;
  return Boolean(
    node.closest?.(".inbox-avenger-badge") ||
    node.classList?.contains("inbox-avenger-badge")
  );
}

function cleanText(element) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll?.(".inbox-avenger-badge").forEach(node => node.remove());
  return (clone.innerText || clone.textContent || "").trim();
}

function simpleHash(text) {
  const value = String(text || "");
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function shouldShowCategory(label, settings) {
  const key = InboxAvengerClassifier.labelToKey(label);
  return settings.categoryVisibility?.[key] !== false;
}

function looksLikeEmailRow(row) {
  if (!row || isOwnUi(row)) return false;
  const text = cleanText(row);
  if (text.length < 18 || text.length > 1800) return false;
  const role = row.getAttribute("role");
  const className = row.className ? String(row.className) : "";
  return row.tagName === "TR" || role === "row" || className.includes("zA");
}

function getRows(settings) {
  const maxRows = InboxAvengerClassifier.getSearchDepthCount(
    settings.scanDepthMode,
    settings.maxVisibleRowsToScan
  );

  return [...new Set(Array.from(document.querySelectorAll("tr.zA, tr[role='row'], .zA")))]
    .filter(looksLikeEmailRow)
    .slice(0, maxRows);
}

function createBadge(result, settings) {
  const badge = document.createElement("span");
  const styleClass = settings.badgeStyle === "square" ? "ia-square" : settings.badgeStyle === "minimal" ? "ia-minimal" : "";
  badge.className = `inbox-avenger-badge ${labelClass(result.label)} ${styleClass}`;
  badge.textContent = badgeText(result);
  badge.title = `${result.category}: ${result.explanation} | ML: ${result.ml.label} ${result.ml.confidence}%`;
  badge.style.fontSize = `${11 * (settings.fontScale || 1)}px`;
  return badge;
}

function attachBadge(row, result, settings, text) {
  const existing = row.querySelector(".inbox-avenger-badge");

  if (!settings.showGmailBadges || !shouldShowCategory(result.label, settings)) {
    if (existing) existing.remove();
    return;
  }

  const hash = simpleHash(`${text}|${result.label}|${result.riskScore}|${result.ml.label}|${result.ml.confidence}`);
  if (existing && row.dataset.iaHash === hash) return;
  if (existing) existing.remove();

  const subjectArea =
    row.querySelector(".bog") ||
    row.querySelector("[data-thread-id]") ||
    row.querySelector("td:nth-child(6)") ||
    row.querySelector("td:nth-child(5)") ||
    row;

  subjectArea.appendChild(createBadge(result, settings));
  row.dataset.iaHash = hash;
}

function pauseObserver() {
  if (observer) observer.disconnect();
}

function resumeObserver() {
  if (!observer) return;
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

async function scanVisibleGmailRows() {
  if (scanInProgress) return [];
  scanInProgress = true;
  pauseObserver();

  try {
    const { database, settings, corrections } = await getConfig();
    if (!settings.scanInboxRows) return [];

    const results = [];

    for (const row of getRows(settings)) {
      const text = cleanText(row);
      const result = InboxAvengerClassifier.classifyEmail(text, database, settings, {}, corrections);
      attachBadge(row, result, settings, text);

      results.push({
        id: String(results.length),
        subject: text.slice(0, 120),
        from: "",
        snippet: text.slice(0, 260),
        result
      });
    }

    return results;
  } finally {
    scanInProgress = false;
    setTimeout(resumeObserver, 250);
  }
}

function scheduleScan(mutations = []) {
  if (mutations.length) {
    const ownChanges = mutations.every(mutation => {
      const targetOwn = isOwnUi(mutation.target);
      const addedOwn = Array.from(mutation.addedNodes || []).every(node => node.nodeType !== 1 || isOwnUi(node));
      return targetOwn || addedOwn;
    });
    if (ownChanges) return;
  }

  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    scanVisibleGmailRows().catch(error => console.warn("Inbox Avenger visible scan failed:", error));
  }, 1800);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "IA_SCAN_VISIBLE_GMAIL") {
    scanVisibleGmailRows()
      .then(results => sendResponse({ ok: true, results }))
      .catch(error => sendResponse({ ok: false, error: String(error.message || error) }));
    return true;
  }
});

observer = new MutationObserver(scheduleScan);
resumeObserver();
scheduleScan();
