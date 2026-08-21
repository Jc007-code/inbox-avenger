(() => {
  const TOOLBAR_ID = "ia-toolbar";
  const PANEL_ID = "ia-panel";
  const SUMMARY_ID = "ia-summary";
  const TOAST_ID = "ia-toast";
  const STYLE_ROOT = document.documentElement;

  const DEFAULT_SETTINGS = {
    accentColor: "#1f6feb",
    highRiskColor: "#ffd6d6",
    lowPriorityColor: "#fff1bf",
    promoColor: "#dcecff",
    normalColor: "#dcfce7",
    fontFamily: "Arial, sans-serif",
    scanDepth: 3,
    adaptiveLearning: true,
    autoSort: true
  };

  const FONT_OPTIONS = [
    "Arial, sans-serif",
    "Verdana, sans-serif",
    "Georgia, serif",
    "Trebuchet MS, sans-serif",
    "Tahoma, sans-serif",
    "Courier New, monospace"
  ];

  const STOPWORDS = new Set([
    "the","and","for","with","that","this","from","your","you","are","was","were","have","has","had",
    "will","would","can","could","into","about","there","their","they","them","then","than","when",
    "what","where","which","while","been","being","also","just","more","most","much","many","some",
    "our","out","not","all","but","too","its","it's","who","why","how","his","her","she","him",
    "himself","herself","within","onto","upon","after","before","because","using","used","use","via"
  ]);

  const SEEDED_TOKEN_DB = {
    highRisk: {
      urgent: 2.0, immediately: 2.0, asap: 2.0, verify: 2.2, verification: 2.2, login: 2.0,
      password: 2.3, reset: 1.2, suspended: 2.5, locked: 2.3, unusual: 1.5, signin: 1.7,
      security: 1.6, alert: 1.6, compromised: 2.5, invoice: 1.6, overdue: 1.8, payment: 1.4,
      payroll: 1.9, bank: 1.7, wire: 2.0, crypto: 1.8, refund: 1.5, giftcard: 2.1, tax: 1.3,
      ssn: 2.2, document: 0.8, attachment: 0.8, action: 1.0, failure: 1.0, denied: 1.5,
      release: 0.6, authenticate: 1.7, authentication: 1.7, microsoft: 0.8, google: 0.8,
      quota: 1.5, mailbox: 1.5, expired: 1.6, expiration: 1.6, breach: 2.0, confirm: 1.4,
      confirmidentity: 2.2, suspendedaccount: 2.5, bill: 1.1, transfer: 1.7
    },
    promo: {
      sale: 2.0, deal: 2.0, deals: 2.0, coupon: 2.2, offer: 1.8, offers: 1.8, discount: 2.0,
      clearance: 2.2, bundle: 1.4, savings: 1.5, save: 1.2, shipping: 1.3, freeshipping: 2.0,
      today: 0.5, tonight: 0.7, exclusive: 1.3, flash: 1.6, limited: 1.1, shop: 1.3,
      buy: 1.2, cart: 1.1, checkout: 1.0, launch: 0.8, merch: 1.2, promo: 1.8,
      code: 0.7, percent: 0.8, markdown: 1.5, blackfriday: 2.5, cybermonday: 2.5
    },
    lowPriority: {
      newsletter: 2.0, digest: 2.0, reminder: 1.2, reminders: 1.2, update: 1.0, updates: 1.0,
      notification: 1.5, notifications: 1.5, announcement: 1.4, announcements: 1.4,
      social: 1.3, community: 1.0, forum: 1.0, noreply: 1.3, automated: 1.4,
      summary: 1.2, receipt: 0.7, recap: 1.1, event: 0.8, invitation: 0.8, digestemail: 1.8,
      weekly: 0.8, monthly: 0.8, daily: 0.8
    },
    normal: {}
  };

  const REGEX_RULES = {
    highRisk: [
      { regex: /\burgent\b|\bimmediately\b|\basap\b|\bfinal notice\b|\baction required\b/i, points: 2.2, reason: "urgent language" },
      { regex: /\bverify\b|\bconfirm\b|\blogin\b|\bsign in\b|\bpassword\b|\bmfa\b|\b2fa\b/i, points: 2.2, reason: "account verification wording" },
      { regex: /\bsecurity alert\b|\bunusual sign\-?in\b|\bcompromised\b|\bbreach\b/i, points: 2.4, reason: "security incident wording" },
      { regex: /\binvoice\b|\bpayment due\b|\bwire transfer\b|\bbank\b|\bgift card\b|\bpayroll\b/i, points: 2.0, reason: "financial pressure wording" },
      { regex: /bit\.ly|tinyurl|rb\.gy|t\.co\//i, points: 2.0, reason: "shortened link pattern" },
      { regex: /\bmailbox quota\b|\baccount suspended\b|\bmailbox disabled\b|\bpassword expires\b/i, points: 2.5, reason: "mail account threat wording" }
    ],
    promo: [
      { regex: /\bunsubscribe\b|\bnewsletter\b|\bpromotions?\b/i, points: 2.0, reason: "newsletter or promo language" },
      { regex: /\bsale\b|\bdeal\b|\bcoupon\b|\boffer\b|\bdiscount\b|\bclearance\b/i, points: 2.0, reason: "marketing language" },
      { regex: /\blimited time\b|\bshop now\b|\bbuy now\b|\bends tonight\b|\bfree shipping\b/i, points: 2.0, reason: "marketing urgency" }
    ],
    lowPriority: [
      { regex: /\bnotification\b|\breminder\b|\bdigest\b|\bannouncement\b|\bsummary\b/i, points: 1.5, reason: "bulk informational language" },
      { regex: /\bno\-reply\b|\bnoreply\b|\bdo not reply\b|\bautomated\b/i, points: 1.3, reason: "automated sender wording" }
    ]
  };

  let settings = { ...DEFAULT_SETTINGS };
  let memory = {
    learnedTokens: {},
    senderMemory: {},
    scanHistory: { totalScans: 0, lastCounts: null }
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const storageGet = (keys) =>
    new Promise((resolve) => chrome.storage.local.get(keys, resolve));

  const storageSet = (data) =>
    new Promise((resolve) => chrome.storage.local.set(data, resolve));

  function sanitizeNumber(value, min, max, fallback) {
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return Math.min(max, Math.max(min, Math.round(num)));
  }

  function normalizeCategory(category) {
    const cleaned = String(category || "").toLowerCase().replace(/[\s_-]+/g, "");
    const map = {
      risk: "highRisk",
      highrisk: "highRisk",
      promo: "promo",
      promotion: "promo",
      lowpriority: "lowPriority",
      low: "lowPriority",
      normal: "normal",
      safe: "normal"
    };
    return map[cleaned] || "normal";
  }

  function categoryLabel(category) {
    return {
      highRisk: "HIGH RISK",
      promo: "PROMO",
      lowPriority: "LOW PRIORITY",
      normal: "NORMAL"
    }[category] || "NORMAL";
  }

  function categoryClass(category) {
    return {
      highRisk: "ia-high-risk",
      promo: "ia-promo",
      lowPriority: "ia-low-priority",
      normal: "ia-normal"
    }[category] || "ia-normal";
  }

  function getSettingsFormValues(panel) {
    return {
      accentColor: panel.querySelector("#ia-accent-color")?.value || DEFAULT_SETTINGS.accentColor,
      highRiskColor: panel.querySelector("#ia-risk-color")?.value || DEFAULT_SETTINGS.highRiskColor,
      lowPriorityColor: panel.querySelector("#ia-low-color")?.value || DEFAULT_SETTINGS.lowPriorityColor,
      promoColor: panel.querySelector("#ia-promo-color")?.value || DEFAULT_SETTINGS.promoColor,
      normalColor: panel.querySelector("#ia-normal-color")?.value || DEFAULT_SETTINGS.normalColor,
      fontFamily: panel.querySelector("#ia-font-family")?.value || DEFAULT_SETTINGS.fontFamily,
      scanDepth: sanitizeNumber(panel.querySelector("#ia-scan-depth")?.value, 1, 10, DEFAULT_SETTINGS.scanDepth),
      adaptiveLearning: Boolean(panel.querySelector("#ia-adaptive-learning")?.checked),
      autoSort: Boolean(panel.querySelector("#ia-auto-sort")?.checked)
    };
  }

  function applyTheme() {
    STYLE_ROOT.style.setProperty("--ia-accent-color", settings.accentColor);
    STYLE_ROOT.style.setProperty("--ia-high-risk-color", settings.highRiskColor);
    STYLE_ROOT.style.setProperty("--ia-low-priority-color", settings.lowPriorityColor);
    STYLE_ROOT.style.setProperty("--ia-promo-color", settings.promoColor);
    STYLE_ROOT.style.setProperty("--ia-normal-color", settings.normalColor);
    STYLE_ROOT.style.setProperty("--ia-font-family", settings.fontFamily);
  }

  function fillSettingsForm() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.querySelector("#ia-accent-color").value = settings.accentColor;
    panel.querySelector("#ia-risk-color").value = settings.highRiskColor;
    panel.querySelector("#ia-low-color").value = settings.lowPriorityColor;
    panel.querySelector("#ia-promo-color").value = settings.promoColor;
    panel.querySelector("#ia-normal-color").value = settings.normalColor;
    panel.querySelector("#ia-font-family").value = settings.fontFamily;
    panel.querySelector("#ia-scan-depth").value = settings.scanDepth;
    panel.querySelector("#ia-adaptive-learning").checked = settings.adaptiveLearning;
    panel.querySelector("#ia-auto-sort").checked = settings.autoSort;
  }

  function showToast(message) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("ia-show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove("ia-show"), 2200);
  }

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9@._\-\s]/g, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && word.length <= 30)
      .filter((word) => !STOPWORDS.has(word))
      .filter((word) => !/^\d+$/.test(word));
  }

  function compressToken(word) {
    return String(word || "").replace(/[^a-z0-9]/g, "");
  }

  function extractSenderKey(text) {
    const emailMatch = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) return emailMatch[0].toLowerCase();
    const senderGuess = String(text || "").split(/\n|\t/)[0]?.trim().toLowerCase() || "";
    return senderGuess.slice(0, 80);
  }

  function buildRowKey(row) {
    return (
      row.getAttribute("data-legacy-thread-id") ||
      row.getAttribute("data-thread-id") ||
      row.innerText.slice(0, 180)
    );
  }

  function getInboxRows() {
    const selectorList = [
      "tr[data-legacy-thread-id]",
      "tr[role='row']"
    ];

    const seen = new Set();
    const rows = [];

    selectorList.forEach((selector) => {
      document.querySelectorAll(selector).forEach((row) => {
        const text = row.innerText?.trim();
        if (!text) return;
        if (!row.querySelector("td")) return;
        const key = buildRowKey(row);
        if (seen.has(key)) return;
        seen.add(key);
        rows.push(row);
      });
    });

    return rows;
  }

  function getBestScrollContainer() {
    const preferred = document.querySelector("div[role='main']");
    if (preferred && preferred.scrollHeight > preferred.clientHeight + 300) return preferred;

    const candidates = [...document.querySelectorAll("div")].filter((el) => {
      const style = getComputedStyle(el);
      return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 300;
    });

    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return candidates[0] || document.scrollingElement || document.documentElement;
  }

  async function collectRowsByDepth(depth) {
    const container = getBestScrollContainer();
    const original = container.scrollTop;
    const collected = new Map();

    for (let pass = 0; pass < depth; pass += 1) {
      getInboxRows().forEach((row) => collected.set(buildRowKey(row), row));
      container.scrollTop += Math.max(500, Math.floor(container.clientHeight * 0.9));
      await wait(700);
    }

    getInboxRows().forEach((row) => collected.set(buildRowKey(row), row));
    container.scrollTop = original;
    await wait(250);
    return [...collected.values()];
  }

  function createBaseScores() {
    return {
      highRisk: 0,
      promo: 0,
      lowPriority: 0,
      normal: 0,
      reasons: []
    };
  }

  function scoreFromRegex(text, scores) {
    Object.entries(REGEX_RULES).forEach(([category, rules]) => {
      rules.forEach((rule) => {
        if (rule.regex.test(text)) {
          scores[category] += rule.points;
          scores.reasons.push(rule.reason);
        }
      });
    });
  }

  function scoreFromSeededTokens(tokens, scores) {
    Object.entries(SEEDED_TOKEN_DB).forEach(([category, dictionary]) => {
      tokens.forEach((token) => {
        const compressed = compressToken(token);
        const points = dictionary[token] ?? dictionary[compressed];
        if (points) {
          scores[category] += points;
          scores.reasons.push(`seeded ${categoryLabel(category)} token: ${token}`);
        }
      });
    });
  }

  function scoreFromLearnedTokens(tokens, scores) {
    if (!settings.adaptiveLearning) return;
    tokens.forEach((token) => {
      const key = compressToken(token);
      const entry = memory.learnedTokens[key];
      if (!entry) return;
      ["highRisk", "promo", "lowPriority", "normal"].forEach((category) => {
        const count = Number(entry[category] || 0);
        if (count > 0) {
          scores[category] += Math.min(2.5, count * 0.35);
        }
      });
      const strongCategory = ["highRisk", "promo", "lowPriority", "normal"].sort(
        (a, b) => (entry[b] || 0) - (entry[a] || 0)
      )[0];
      if (entry[strongCategory] >= 2) {
        scores.reasons.push(`learned token: ${token}`);
      }
    });
  }

  function scoreFromSenderMemory(senderKey, scores) {
    if (!settings.adaptiveLearning || !senderKey) return;
    const entry = memory.senderMemory[senderKey];
    if (!entry) return;
    ["highRisk", "promo", "lowPriority", "normal"].forEach((category) => {
      const count = Number(entry[category] || 0);
      if (count > 0) scores[category] += Math.min(2.0, count * 0.45);
    });
    const strongCategory = ["highRisk", "promo", "lowPriority", "normal"].sort(
      (a, b) => (entry[b] || 0) - (entry[a] || 0)
    )[0];
    if (entry[strongCategory] >= 2) {
      scores.reasons.push(`learned sender pattern: ${senderKey}`);
    }
  }

  function decideCategory(scores) {
    if (scores.highRisk >= 5) return "highRisk";
    if (scores.promo >= 5 && scores.highRisk < 4) return "promo";
    if (
      scores.lowPriority >= 3 ||
      (scores.promo >= 2.5 && scores.highRisk < 5) ||
      (scores.highRisk >= 2.5 && scores.highRisk < 5)
    ) {
      return "lowPriority";
    }
    if (scores.normal >= 1.5 && scores.highRisk < 2 && scores.promo < 2) return "normal";
    return "normal";
  }

  function scoreEmail(text) {
    const normalizedText = String(text || "").toLowerCase();
    const tokens = tokenize(normalizedText);
    const senderKey = extractSenderKey(text);
    const scores = createBaseScores();

    scoreFromRegex(normalizedText, scores);
    scoreFromSeededTokens(tokens, scores);
    scoreFromLearnedTokens(tokens, scores);
    scoreFromSenderMemory(senderKey, scores);

    const category = decideCategory(scores);

    return {
      category,
      senderKey,
      scores: {
        highRisk: Number(scores.highRisk.toFixed(2)),
        promo: Number(scores.promo.toFixed(2)),
        lowPriority: Number(scores.lowPriority.toFixed(2)),
        normal: Number(scores.normal.toFixed(2))
      },
      reasons: [...new Set(scores.reasons)].slice(0, 8)
    };
  }

  function removeOldDecorations(row) {
    row.querySelectorAll(".ia-badge, .ia-train-box").forEach((el) => el.remove());
    row.classList.remove("ia-high-risk", "ia-low-priority", "ia-promo", "ia-normal");
    delete row.dataset.iaCategory;
    delete row.dataset.iaRisk;
    delete row.dataset.iaPromo;
    delete row.dataset.iaLow;
  }

  function totalMemoryWeight(entry) {
    return Number(entry.highRisk || 0) + Number(entry.promo || 0) + Number(entry.lowPriority || 0) + Number(entry.normal || 0);
  }

  function pruneMemory() {
    const tokenEntries = Object.entries(memory.learnedTokens);
    if (tokenEntries.length > 1500) {
      tokenEntries
        .sort((a, b) => totalMemoryWeight(b[1]) - totalMemoryWeight(a[1]))
        .slice(1500)
        .forEach(([token]) => delete memory.learnedTokens[token]);
    }

    const senderEntries = Object.entries(memory.senderMemory);
    if (senderEntries.length > 600) {
      senderEntries
        .sort((a, b) => totalMemoryWeight(b[1]) - totalMemoryWeight(a[1]))
        .slice(600)
        .forEach(([sender]) => delete memory.senderMemory[sender]);
    }
  }

  function trainFromText(text, senderKey, category) {
    const normalized = normalizeCategory(category);
    const tokens = tokenize(text)
      .map(compressToken)
      .filter(Boolean)
      .slice(0, 30);

    tokens.forEach((token) => {
      memory.learnedTokens[token] = memory.learnedTokens[token] || {
        highRisk: 0,
        promo: 0,
        lowPriority: 0,
        normal: 0
      };
      memory.learnedTokens[token][normalized] += 1;
    });

    if (senderKey) {
      memory.senderMemory[senderKey] = memory.senderMemory[senderKey] || {
        highRisk: 0,
        promo: 0,
        lowPriority: 0,
        normal: 0
      };
      memory.senderMemory[senderKey][normalized] += 1;
    }

    pruneMemory();
    storageSet({ inboxAvengerMemory: memory });
  }

  function attachTrainingBox(row, result) {
    const anchorCell = row.querySelector("td");
    if (!anchorCell) return;

    const box = document.createElement("div");
    box.className = "ia-train-box";
    box.innerHTML = `
      <button data-ia-train="highRisk" title="Teach this as High Risk">Teach Risk</button>
      <button data-ia-train="promo" title="Teach this as Promo">Teach Promo</button>
      <button data-ia-train="lowPriority" title="Teach this as Low Priority">Teach Low</button>
      <button data-ia-train="normal" title="Teach this as Normal">Teach Normal</button>
    `;

    box.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const category = target.getAttribute("data-ia-train");
      if (!category) return;
      event.preventDefault();
      event.stopPropagation();
      trainFromText(row.innerText || "", result.senderKey, category);
      showToast(`Learned this message as ${categoryLabel(category)}`);
      const rescored = scoreEmail(row.innerText || "");
      removeOldDecorations(row);
      decorateRow(row, rescored);
      updatePanelMemoryStats();
    });

    anchorCell.appendChild(box);
  }

  function decorateRow(row, result) {
    const firstCell = row.querySelector("td");
    if (!firstCell) return;

    const badge = document.createElement("span");
    badge.className = `ia-badge ${categoryClass(result.category)}`;
    badge.textContent = categoryLabel(result.category);
    badge.title = [
      `High Risk Score: ${result.scores.highRisk}`,
      `Promo Score: ${result.scores.promo}`,
      `Low Priority Score: ${result.scores.lowPriority}`,
      `Normal Score: ${result.scores.normal}`,
      result.reasons.length ? `Reasons: ${result.reasons.join(", ")}` : "No strong indicators"
    ].join("\n");

    firstCell.prepend(badge);
    row.classList.add(categoryClass(result.category));
    row.dataset.iaCategory = result.category;
    row.dataset.iaRisk = String(result.scores.highRisk);
    row.dataset.iaPromo = String(result.scores.promo);
    row.dataset.iaLow = String(result.scores.lowPriority);
    attachTrainingBox(row, result);
  }

  function sortRows(rows) {
    const priority = { highRisk: 4, lowPriority: 3, normal: 2, promo: 1 };
    const parent = rows[0]?.parentElement;
    if (!parent) return;

    [...rows]
      .sort((a, b) => {
        const aCategory = a.dataset.iaCategory || "normal";
        const bCategory = b.dataset.iaCategory || "normal";
        const categoryDiff = (priority[bCategory] || 0) - (priority[aCategory] || 0);
        if (categoryDiff !== 0) return categoryDiff;
        const aRisk = Number(a.dataset.iaRisk || 0);
        const bRisk = Number(b.dataset.iaRisk || 0);
        return bRisk - aRisk;
      })
      .forEach((row) => parent.appendChild(row));
  }

  function renderSummary(counts, scannedRows) {
    const summary = document.getElementById(SUMMARY_ID);
    if (!summary) return;

    summary.innerHTML = `
      <div class="ia-summary-title">Last Scan</div>
      <div>Scanned Rows: <strong>${scannedRows}</strong></div>
      <div>High Risk: <strong>${counts.highRisk}</strong></div>
      <div>Low Priority: <strong>${counts.lowPriority}</strong></div>
      <div>Normal: <strong>${counts.normal}</strong></div>
      <div>Promo: <strong>${counts.promo}</strong></div>
      <div>Total Scans Saved: <strong>${memory.scanHistory.totalScans}</strong></div>
    `;
  }

  function updatePanelMemoryStats() {
    const statEl = document.querySelector("#ia-memory-stats");
    if (!statEl) return;
    statEl.innerHTML = `Learned tokens: <strong>${Object.keys(memory.learnedTokens).length}</strong><br>Known senders: <strong>${Object.keys(memory.senderMemory).length}</strong>`;
  }

  async function scanInbox() {
    showToast(`Scanning Gmail with depth ${settings.scanDepth}...`);
    const rows = await collectRowsByDepth(settings.scanDepth);

    if (!rows.length) {
      showToast("No Gmail inbox rows found. Open your inbox and try again.");
      return;
    }

    const counts = { highRisk: 0, lowPriority: 0, normal: 0, promo: 0 };

    rows.forEach((row) => {
      removeOldDecorations(row);
      const result = scoreEmail(row.innerText || "");
      decorateRow(row, result);
      counts[result.category] += 1;
    });

    if (settings.autoSort) {
      const visibleRows = getInboxRows();
      if (visibleRows.length) sortRows(visibleRows);
    }

    memory.scanHistory.totalScans += 1;
    memory.scanHistory.lastCounts = counts;
    await storageSet({ inboxAvengerMemory: memory });

    renderSummary(counts, rows.length);
    updatePanelMemoryStats();
    showToast("Inbox Avenger scan complete.");
  }

  function resetLearning() {
    memory.learnedTokens = {};
    memory.senderMemory = {};
    storageSet({ inboxAvengerMemory: memory });
    updatePanelMemoryStats();
    showToast("Adaptive learning memory reset.");
  }

  async function saveSettings() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    settings = getSettingsFormValues(panel);
    applyTheme();
    await storageSet({ inboxAvengerSettings: settings });
    showToast("Settings saved.");
  }

  function createToolbar() {
    if (document.getElementById(TOOLBAR_ID)) return;

    const toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.innerHTML = `
      <div class="ia-toolbar-title">Inbox Avenger</div>
      <div class="ia-toolbar-actions">
        <button id="ia-scan-btn">Scan Inbox</button>
        <button id="ia-toggle-settings">Settings</button>
      </div>
    `;

    document.body.appendChild(toolbar);

    toolbar.querySelector("#ia-scan-btn")?.addEventListener("click", scanInbox);
    toolbar.querySelector("#ia-toggle-settings")?.addEventListener("click", () => {
      const panel = document.getElementById(PANEL_ID);
      if (!panel) return;
      panel.classList.toggle("ia-open");
    });
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ia-panel-header">
        <div>
          <div class="ia-panel-title">Prototype Controls</div>
          <div class="ia-panel-subtitle">Customize theme, scan depth, and local learning.</div>
        </div>
      </div>

      <div class="ia-section">
        <div class="ia-section-title">Theme</div>
        <label>Accent Color <input type="color" id="ia-accent-color"></label>
        <label>High Risk Color <input type="color" id="ia-risk-color"></label>
        <label>Low Priority Color <input type="color" id="ia-low-color"></label>
        <label>Promo Color <input type="color" id="ia-promo-color"></label>
        <label>Normal Color <input type="color" id="ia-normal-color"></label>
        <label>
          Font Family
          <select id="ia-font-family">
            ${FONT_OPTIONS.map((font) => `<option value="${font}">${font}</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="ia-section">
        <div class="ia-section-title">Scan Settings</div>
        <label>Scan Depth (loaded screen passes)
          <input type="number" id="ia-scan-depth" min="1" max="10" step="1">
        </label>
        <label class="ia-checkbox-row"><input type="checkbox" id="ia-adaptive-learning"> Enable adaptive learning</label>
        <label class="ia-checkbox-row"><input type="checkbox" id="ia-auto-sort"> Auto sort visible rows after scan</label>
      </div>

      <div class="ia-section">
        <div class="ia-section-title">Memory</div>
        <div id="ia-memory-stats"></div>
        <div class="ia-inline-buttons">
          <button id="ia-reset-learning" class="ia-secondary">Reset Learning</button>
        </div>
      </div>

      <div id="ia-summary" class="ia-section"></div>

      <div class="ia-inline-buttons ia-footer-buttons">
        <button id="ia-save-settings">Save Settings</button>
        <button id="ia-scan-panel-btn" class="ia-secondary">Scan Now</button>
      </div>
    `;

    document.body.appendChild(panel);

    panel.querySelector("#ia-save-settings")?.addEventListener("click", saveSettings);
    panel.querySelector("#ia-scan-panel-btn")?.addEventListener("click", scanInbox);
    panel.querySelector("#ia-reset-learning")?.addEventListener("click", resetLearning);
  }

  async function loadState() {
    const stored = await storageGet(["inboxAvengerSettings", "inboxAvengerMemory"]);
    settings = { ...DEFAULT_SETTINGS, ...(stored.inboxAvengerSettings || {}) };
    memory = {
      learnedTokens: {},
      senderMemory: {},
      scanHistory: { totalScans: 0, lastCounts: null },
      ...(stored.inboxAvengerMemory || {})
    };
  }

  async function init() {
    await loadState();
    createToolbar();
    createPanel();
    fillSettingsForm();
    applyTheme();
    updatePanelMemoryStats();
    if (memory.scanHistory.lastCounts) {
      renderSummary(memory.scanHistory.lastCounts, "previous");
    }
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById(TOOLBAR_ID)) createToolbar();
    if (!document.getElementById(PANEL_ID)) {
      createPanel();
      fillSettingsForm();
      applyTheme();
      updatePanelMemoryStats();
    }
  });

  init();
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
