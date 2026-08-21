(() => {
  const TOOLBAR_ID = "ia-toolbar";
  const PANEL_ID = "ia-panel";
  const SUMMARY_ID = "ia-summary";
  const TOAST_ID = "ia-toast";
  const ROOT = document.documentElement;

  const DEFAULT_SETTINGS = {
    accentColor: "#1f6feb",
    highRiskColor: "#ffd6d6",
    mediumRiskColor: "#ffe8bf",
    promoColor: "#e6ecff",
    dealColor: "#dcfce7",
    newsletterColor: "#f0e7ff",
    normalColor: "#edf2f7",
    fontFamily: "Arial, sans-serif",
    scanDepth: 4,
    autoSort: true,
    adaptiveLearning: true
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
    "himself","herself","within","onto","upon","after","before","because","using","used","use","via",
    "get","got","new","today","tomorrow","hello","thanks","thank","regards","dear"
  ]);

  const TOKEN_DB = {
    risk: {
      urgent: 2.1, immediately: 2.0, asap: 2.0, suspended: 2.6, verify: 2.4, verification: 2.2,
      password: 2.6, login: 2.2, signin: 2.1, confirm: 1.7, security: 1.8, alert: 1.7,
      compromise: 2.3, compromised: 2.4, breach: 2.4, invoice: 1.6, overdue: 1.8, wire: 2.2,
      payroll: 1.8, bank: 1.7, transfer: 1.8, giftcard: 2.4, quota: 1.8, mailbox: 1.7,
      expired: 1.7, expiration: 1.7, authenticate: 1.8, authentication: 1.8, failure: 1.1,
      reset: 1.3, document: 0.7, attachment: 0.7, denial: 1.4, release: 0.6, action: 0.9
    },
    promo: {
      sale: 1.9, deal: 1.6, deals: 1.6, offer: 1.6, offers: 1.6, discount: 1.9, clearance: 2.1,
      limited: 1.0, exclusive: 1.2, launch: 0.9, promo: 1.8, merch: 1.3, shop: 1.2, buy: 1.1,
      collection: 1.0, brand: 0.8, style: 0.8, trending: 0.9, cart: 1.0, checkout: 1.0,
      unsubscribe: 1.8, shipping: 1.0, member: 0.8
    },
    deal: {
      coupon: 2.5, savings: 1.8, save: 1.2, percent: 1.2, code: 0.8, promo_code: 1.8,
      free: 0.7, freeshipping: 2.2, cashback: 2.2, off: 0.7, bonus: 1.0, bundle: 1.2,
      bogo: 2.4, markdown: 1.8, price: 1.0, pricedrop: 2.1, deal: 1.8, deals: 1.8
    },
    newsletter: {
      newsletter: 2.3, digest: 2.2, reminder: 1.3, reminders: 1.3, update: 1.0, updates: 1.0,
      announcement: 1.4, announcements: 1.4, recap: 1.2, summary: 1.3, social: 1.2,
      community: 1.0, forum: 1.0, weekly: 0.9, daily: 0.9, monthly: 0.9, no_reply: 1.4,
      noreply: 1.4, automated: 1.4, notification: 1.5, notifications: 1.5
    },
    normal: {}
  };

  const REGEX_RULES = {
    risk: [
      { regex: /\burgent\b|\bfinal notice\b|\baction required\b|\brespond immediately\b/i, points: 2.3, reason: "urgent language" },
      { regex: /\bverify\b|\bconfirm\b|\blog[ -]?in\b|\bsign[ -]?in\b|\bpassword\b|\bmfa\b|\b2fa\b/i, points: 2.3, reason: "account verification wording" },
      { regex: /\bsecurity alert\b|\bunusual sign[ -]?in\b|\bcompromised\b|\bbreach\b|\baccount locked\b/i, points: 2.5, reason: "security incident wording" },
      { regex: /\binvoice\b|\bpayment due\b|\bwire transfer\b|\bbank\b|\bgift card\b|\bpayroll\b/i, points: 2.0, reason: "financial pressure wording" },
      { regex: /bit\.ly|tinyurl|rb\.gy|t\.co\//i, points: 2.1, reason: "shortened link pattern" },
      { regex: /\bmailbox quota\b|\baccount suspended\b|\bmailbox disabled\b|\bpassword expires\b/i, points: 2.5, reason: "mail account threat wording" }
    ],
    promo: [
      { regex: /\bsale\b|\bdeal\b|\boffer\b|\bdiscount\b|\bclearance\b|\bshop now\b/i, points: 1.9, reason: "marketing language" },
      { regex: /\blimited time\b|\bends tonight\b|\bnew drop\b|\bjust dropped\b/i, points: 1.8, reason: "promotional urgency" }
    ],
    deal: [
      { regex: /\b\d{1,3}%\s*off\b|\$\d+\s*off\b|\bbuy one get one\b|\bbogo\b/i, points: 2.7, reason: "concrete deal amount" },
      { regex: /\bcoupon code\b|\bpromo code\b|\bfree shipping\b|\bprice drop\b/i, points: 2.4, reason: "deal mechanics" }
    ],
    newsletter: [
      { regex: /\bnewsletter\b|\bdigest\b|\bsummary\b|\bweekly update\b|\bmonthly update\b/i, points: 2.0, reason: "newsletter wording" },
      { regex: /\bnotification\b|\breminder\b|\bannouncement\b|\bcommunity update\b/i, points: 1.4, reason: "bulk informational wording" }
    ]
  };

  let settings = { ...DEFAULT_SETTINGS };
  let memory = {
    learnedTokens: {},
    scanHistory: { totalScans: 0, lastCounts: null }
  };

  let state = {
    messages: [],
    subscriptions: [],
    lastUpdated: null
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const storageSet = (payload) => new Promise((resolve) => chrome.storage.local.set(payload, resolve));

  function sanitizeNumber(value, min, max, fallback) {
    const n = Number(value);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function classifyLabel(category) {
    return {
      high_risk: "HIGH RISK",
      medium_risk: "MEDIUM RISK",
      deal: "DEAL",
      promo: "PROMO",
      newsletter: "NEWSLETTER",
      normal: "NORMAL"
    }[category] || "NORMAL";
  }

  function className(category) {
    return {
      high_risk: "ia-high-risk",
      medium_risk: "ia-medium-risk",
      deal: "ia-deal",
      promo: "ia-promo",
      newsletter: "ia-newsletter",
      normal: "ia-normal"
    }[category] || "ia-normal";
  }

  function applyTheme() {
    ROOT.style.setProperty("--ia-accent-color", settings.accentColor);
    ROOT.style.setProperty("--ia-high-risk-color", settings.highRiskColor);
    ROOT.style.setProperty("--ia-medium-risk-color", settings.mediumRiskColor);
    ROOT.style.setProperty("--ia-promo-color", settings.promoColor);
    ROOT.style.setProperty("--ia-deal-color", settings.dealColor);
    ROOT.style.setProperty("--ia-newsletter-color", settings.newsletterColor);
    ROOT.style.setProperty("--ia-normal-color", settings.normalColor);
    ROOT.style.setProperty("--ia-font-family", settings.fontFamily);
  }

  function fillSettingsForm() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const assign = (id, value, checked = false) => {
      const el = panel.querySelector(id);
      if (!el) return;
      if (checked) el.checked = value;
      else el.value = value;
    };
    assign("#ia-accent-color", settings.accentColor);
    assign("#ia-risk-color", settings.highRiskColor);
    assign("#ia-medium-color", settings.mediumRiskColor);
    assign("#ia-promo-color", settings.promoColor);
    assign("#ia-deal-color", settings.dealColor);
    assign("#ia-newsletter-color", settings.newsletterColor);
    assign("#ia-normal-color", settings.normalColor);
    assign("#ia-font-family", settings.fontFamily);
    assign("#ia-scan-depth", settings.scanDepth);
    assign("#ia-auto-sort", settings.autoSort, true);
    assign("#ia-adaptive-learning", settings.adaptiveLearning, true);
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
      .replace(/[^a-z0-9@._\-\s$%]/g, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && word.length <= 32)
      .filter((word) => !STOPWORDS.has(word))
      .filter((word) => !/^\d+$/.test(word));
  }

  function compressToken(word) {
    return String(word || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
  }

  function buildMessageKey(source) {
    return (
      source.threadId ||
      source.messageId ||
      [source.sender, source.subject, source.snippet].join(" | ").slice(0, 220)
    );
  }

  function getHeaderLikeParts(row) {
    const sender =
      row.querySelector("span[email]")?.getAttribute("email") ||
      row.querySelector("span[email]")?.textContent ||
      row.querySelector("span.yP, span[email], .yW span")?.textContent ||
      "";

    const subject =
      row.querySelector("span.bog")?.textContent ||
      row.querySelector("td.xY.a4W span")?.textContent ||
      "";

    const snippet =
      row.querySelector("span.y2")?.textContent ||
      row.querySelector(".y2")?.textContent ||
      row.innerText ||
      "";

    const threadId = row.getAttribute("data-legacy-thread-id") || row.getAttribute("data-thread-id") || "";

    return {
      sender: sender.trim(),
      subject: subject.trim(),
      snippet: snippet.replace(/\s+/g, " ").trim(),
      threadId
    };
  }

  function getInboxRows() {
    const selectors = [
      "tr[data-legacy-thread-id]",
      "tr[role='row']"
    ];

    const unique = new Map();
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((row) => {
        if (!row.querySelector("td")) return;
        const text = row.innerText?.trim();
        if (!text) return;
        const parts = getHeaderLikeParts(row);
        const key = parts.threadId || text.slice(0, 180);
        if (!unique.has(key)) unique.set(key, row);
      });
    });
    return [...unique.values()];
  }

  function getScrollContainer() {
    const main = document.querySelector("div[role='main']");
    if (main && main.scrollHeight > main.clientHeight + 200) return main;
    const candidates = [...document.querySelectorAll("div")].filter((el) => {
      const style = getComputedStyle(el);
      return /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 200;
    });
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    return candidates[0] || document.scrollingElement || document.documentElement;
  }

  async function collectRowsByDepth(depth) {
    const container = getScrollContainer();
    const originalScroll = container.scrollTop;
    const collected = new Map();

    for (let i = 0; i < depth; i += 1) {
      getInboxRows().forEach((row) => {
        const parts = getHeaderLikeParts(row);
        const key = parts.threadId || row.innerText.slice(0, 180);
        collected.set(key, row);
      });
      container.scrollTop += Math.max(500, Math.floor(container.clientHeight * 0.9));
      await wait(650);
    }

    getInboxRows().forEach((row) => {
      const parts = getHeaderLikeParts(row);
      const key = parts.threadId || row.innerText.slice(0, 180);
      collected.set(key, row);
    });

    container.scrollTop = originalScroll;
    await wait(250);
    return [...collected.values()];
  }

  function getVisibleOpenMessages() {
    const selectors = [
      "div[data-message-id]",
      "div[role='listitem'][data-message-id]"
    ];
    const items = new Map();
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        const id = node.getAttribute("data-message-id");
        if (id && !items.has(id)) items.set(id, node);
      });
    });
    return [...items.values()];
  }

  function extractLinks(container) {
    return [...container.querySelectorAll("a[href]")].map((a) => ({
      text: (a.textContent || "").replace(/\s+/g, " ").trim(),
      href: a.href
    }));
  }

  function findUnsubscribeLinks(links) {
    const results = [];
    links.forEach((link) => {
      const text = (link.text || "").toLowerCase();
      const href = (link.href || "").toLowerCase();
      if (
        text.includes("unsubscribe") ||
        text.includes("opt out") ||
        text.includes("manage preferences") ||
        href.includes("unsubscribe") ||
        href.includes("optout") ||
        href.includes("preferences") ||
        href.startsWith("mailto:")
      ) {
        results.push(link);
      }
    });

    const unique = new Map();
    results.forEach((item) => {
      const key = item.href || item.text;
      if (!unique.has(key)) unique.set(key, item);
    });
    return [...unique.values()].slice(0, 6);
  }

  function extractOpenMessageData(node) {
    const subject =
      document.querySelector("h2.hP")?.textContent?.trim() ||
      node.querySelector("h2.hP")?.textContent?.trim() ||
      "";

    const sender =
      node.querySelector("span[email]")?.getAttribute("email") ||
      node.querySelector("h3 span[email]")?.textContent ||
      node.querySelector(".gD")?.textContent ||
      "";

    const body =
      node.querySelector(".a3s")?.innerText ||
      node.querySelector(".ii.gt")?.innerText ||
      node.innerText ||
      "";

    const links = extractLinks(node);
    const unsubscribeLinks = findUnsubscribeLinks(links);

    return {
      messageId: node.getAttribute("data-message-id") || "",
      sender: sender.trim(),
      subject: subject.trim(),
      snippet: body.replace(/\s+/g, " ").trim().slice(0, 260),
      fullText: body.replace(/\s+/g, " ").trim(),
      unsubscribeLinks
    };
  }

  function baseScores() {
    return {
      risk: 0,
      promo: 0,
      deal: 0,
      newsletter: 0,
      normal: 0,
      reasons: []
    };
  }

  function addRegexScores(text, scores) {
    Object.entries(REGEX_RULES).forEach(([bucket, rules]) => {
      rules.forEach((rule) => {
        if (rule.regex.test(text)) {
          scores[bucket] += rule.points;
          scores.reasons.push(rule.reason);
        }
      });
    });
  }

  function addTokenScores(tokens, scores) {
    Object.entries(TOKEN_DB).forEach(([bucket, db]) => {
      tokens.forEach((token) => {
        const key = compressToken(token);
        const points = db[token] ?? db[key];
        if (points) {
          scores[bucket] += points;
        }
      });
    });
  }

  function addLearnedScores(tokens, scores) {
    if (!settings.adaptiveLearning) return;
    tokens.forEach((token) => {
      const entry = memory.learnedTokens[compressToken(token)];
      if (!entry) return;
      scores.risk += Math.min(2.0, (entry.high_risk || 0) * 0.35);
      scores.promo += Math.min(1.8, (entry.promo || 0) * 0.35);
      scores.deal += Math.min(1.8, (entry.deal || 0) * 0.35);
      scores.newsletter += Math.min(1.8, (entry.newsletter || 0) * 0.35);
      scores.normal += Math.min(1.8, (entry.normal || 0) * 0.35);
    });
  }

  function addStructureSignals(text, scores) {
    const lowered = text.toLowerCase();

    if (/\$\d+/.test(lowered)) scores.deal += 1.0;
    if (/\b\d{1,3}%\s*off\b/.test(lowered)) scores.deal += 1.5;
    if (/\bfree shipping\b/.test(lowered)) scores.deal += 1.7;
    if (/\bunsubscribe\b/.test(lowered)) scores.promo += 0.8;
    if (/\bnewsletter\b|\bdigest\b/.test(lowered)) scores.newsletter += 1.2;
    if (/\bmeeting\b|\bcalendar\b|\bassignment\b|\bproject\b/.test(lowered)) scores.normal += 0.8;
    if (/\bkindly\b|\bdear customer\b|\bact now\b/.test(lowered)) scores.risk += 1.2;
  }

  function decideCategory(scores) {
    const riskFactor = Math.min(100, Math.round((scores.risk * 12) + ((scores.risk > 4 ? 10 : 0))));
    if (scores.risk >= 5.5) return { category: "high_risk", riskFactor };
    if (scores.risk >= 3.2) return { category: "medium_risk", riskFactor };
    if (scores.deal >= 4.5 && scores.risk < 3.2) return { category: "deal", riskFactor };
    if (scores.newsletter >= 3.6 && scores.risk < 3.2) return { category: "newsletter", riskFactor };
    if (scores.promo >= 3.8 && scores.risk < 3.2) return { category: "promo", riskFactor };
    return { category: "normal", riskFactor };
  }

  function analyzeMessage(source) {
    const combinedText = [
      source.sender || "",
      source.subject || "",
      source.snippet || "",
      source.fullText || ""
    ].join(" ").replace(/\s+/g, " ").trim();

    const lowered = combinedText.toLowerCase();
    const tokens = tokenize(lowered);
    const scores = baseScores();

    addRegexScores(lowered, scores);
    addTokenScores(tokens, scores);
    addLearnedScores(tokens, scores);
    addStructureSignals(lowered, scores);

    const decision = decideCategory(scores);

    return {
      ...source,
      key: buildMessageKey(source),
      category: decision.category,
      riskFactor: decision.riskFactor,
      reasons: [...new Set(scores.reasons)].slice(0, 8),
      scoreBreakdown: {
        risk: Number(scores.risk.toFixed(2)),
        promo: Number(scores.promo.toFixed(2)),
        deal: Number(scores.deal.toFixed(2)),
        newsletter: Number(scores.newsletter.toFixed(2)),
        normal: Number(scores.normal.toFixed(2))
      },
      canUnsubscribe: Array.isArray(source.unsubscribeLinks) && source.unsubscribeLinks.length > 0,
      scannedWholeMessage: Boolean(source.fullText && source.fullText.length > 120)
    };
  }

  function removeDecorations(row) {
    row.querySelectorAll(".ia-badge").forEach((el) => el.remove());
    row.classList.remove("ia-high-risk", "ia-medium-risk", "ia-promo", "ia-deal", "ia-newsletter", "ia-normal");
    delete row.dataset.iaCategory;
    delete row.dataset.iaRiskFactor;
  }

  function decorateRow(row, analysis) {
    const cell = row.querySelector("td");
    if (!cell) return;
    const badge = document.createElement("span");
    badge.className = `ia-badge ${className(analysis.category)}`;
    badge.textContent = `${classifyLabel(analysis.category)} • ${analysis.riskFactor}`;
    badge.title = [
      `Category: ${classifyLabel(analysis.category)}`,
      `Risk Factor: ${analysis.riskFactor}`,
      `Whole Message: ${analysis.scannedWholeMessage ? "Yes" : "No"}`,
      `Risk Score: ${analysis.scoreBreakdown.risk}`,
      `Promo Score: ${analysis.scoreBreakdown.promo}`,
      `Deal Score: ${analysis.scoreBreakdown.deal}`,
      `Newsletter Score: ${analysis.scoreBreakdown.newsletter}`,
      analysis.reasons.length ? `Reasons: ${analysis.reasons.join(", ")}` : "No strong rules triggered"
    ].join("\n");

    cell.prepend(badge);
    row.classList.add(className(analysis.category));
    row.dataset.iaCategory = analysis.category;
    row.dataset.iaRiskFactor = String(analysis.riskFactor);
  }

  function sortRows(rows) {
    const priority = {
      high_risk: 6,
      medium_risk: 5,
      deal: 4,
      newsletter: 3,
      promo: 2,
      normal: 1
    };

    const parent = rows[0]?.parentElement;
    if (!parent) return;

    [...rows]
      .sort((a, b) => {
        const aCat = a.dataset.iaCategory || "normal";
        const bCat = b.dataset.iaCategory || "normal";
        const catDiff = (priority[bCat] || 0) - (priority[aCat] || 0);
        if (catDiff !== 0) return catDiff;
        return Number(b.dataset.iaRiskFactor || 0) - Number(a.dataset.iaRiskFactor || 0);
      })
      .forEach((row) => parent.appendChild(row));
  }

  function mergeStateMessage(message) {
    const existingIndex = state.messages.findIndex((m) => m.key === message.key);
    if (existingIndex >= 0) {
      state.messages[existingIndex] = {
        ...state.messages[existingIndex],
        ...message,
        unsubscribeLinks: message.unsubscribeLinks?.length ? message.unsubscribeLinks : (state.messages[existingIndex].unsubscribeLinks || [])
      };
    } else {
      state.messages.push(message);
    }
  }

  function rebuildSubscriptions() {
    state.subscriptions = state.messages
      .filter((m) => m.canUnsubscribe || ["promo", "deal", "newsletter"].includes(m.category))
      .map((m) => ({
        key: m.key,
        sender: m.sender || "(unknown sender)",
        subject: m.subject || "(no subject)",
        category: m.category,
        riskFactor: m.riskFactor,
        snippet: m.snippet || "",
        unsubscribeLinks: m.unsubscribeLinks || [],
        canUnsubscribe: Boolean(m.unsubscribeLinks?.length)
      }));
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

  async function persistState() {
    state.lastUpdated = new Date().toISOString();
    await storageSet({
      inboxAvengerState: state,
      inboxAvengerMemory: memory,
      inboxAvengerSettings: settings
    });
    renderSummary();
  }

  function renderSummary() {
    const summary = document.getElementById(SUMMARY_ID);
    if (!summary) return;
    const counts = countByCategory(state.messages);
    summary.innerHTML = `
      <div class="ia-summary-title">Mailbox Snapshot</div>
      <div>Messages Cached: <strong>${state.messages.length}</strong></div>
      <div>High Risk: <strong>${counts.high_risk}</strong></div>
      <div>Medium Risk: <strong>${counts.medium_risk}</strong></div>
      <div>Deals: <strong>${counts.deal}</strong></div>
      <div>Promos: <strong>${counts.promo}</strong></div>
      <div>Newsletters: <strong>${counts.newsletter}</strong></div>
      <div>Unsubscribe Candidates: <strong>${state.subscriptions.filter((s) => s.canUnsubscribe).length}</strong></div>
    `;
  }

  function updateLearningFromMessage(message, category) {
    const tokens = tokenize([message.sender, message.subject, message.snippet, message.fullText].join(" "))
      .map(compressToken)
      .filter(Boolean)
      .slice(0, 30);

    tokens.forEach((token) => {
      memory.learnedTokens[token] = memory.learnedTokens[token] || {
        high_risk: 0, medium_risk: 0, promo: 0, deal: 0, newsletter: 0, normal: 0
      };
      memory.learnedTokens[token][category] = (memory.learnedTokens[token][category] || 0) + 1;
    });
  }

  async function scanInboxRows() {
    showToast(`Scanning inbox depth ${settings.scanDepth}...`);
    const rows = await collectRowsByDepth(settings.scanDepth);

    rows.forEach((row) => {
      removeDecorations(row);
      const parts = getHeaderLikeParts(row);
      const analysis = analyzeMessage({
        sender: parts.sender,
        subject: parts.subject,
        snippet: parts.snippet,
        threadId: parts.threadId,
        source: "inbox-row",
        fullText: ""
      });
      mergeStateMessage(analysis);
      decorateRow(row, analysis);
    });

    if (settings.autoSort) {
      const visibleRows = getInboxRows();
      if (visibleRows.length) sortRows(visibleRows);
    }

    memory.scanHistory.totalScans += 1;
    memory.scanHistory.lastCounts = countByCategory(state.messages);
    rebuildSubscriptions();
    await persistState();
    showToast("Inbox scan complete.");
    return { scanned: rows.length };
  }

  async function scanOpenMessages() {
    const nodes = getVisibleOpenMessages();
    if (!nodes.length) {
      showToast("Open an email thread to scan the full message.");
      return { scanned: 0 };
    }

    nodes.forEach((node) => {
      const raw = extractOpenMessageData(node);
      const analysis = analyzeMessage({
        ...raw,
        source: "open-message"
      });
      mergeStateMessage(analysis);
      updateLearningFromMessage(analysis, analysis.category);
    });

    rebuildSubscriptions();
    await persistState();
    showToast(`Whole-message scan complete for ${nodes.length} open email(s).`);
    return { scanned: nodes.length };
  }

  async function fullScan() {
    const inboxResult = await scanInboxRows();
    const openResult = await scanOpenMessages();
    return { inboxRows: inboxResult.scanned, openMessages: openResult.scanned };
  }

  async function clearState() {
    state = { messages: [], subscriptions: [], lastUpdated: null };
    await storageSet({ inboxAvengerState: state });
    renderSummary();
    showToast("Cached results cleared.");
  }

  async function loadState() {
    const stored = await storageGet(["inboxAvengerSettings", "inboxAvengerMemory", "inboxAvengerState"]);
    settings = { ...DEFAULT_SETTINGS, ...(stored.inboxAvengerSettings || {}) };
    memory = {
      learnedTokens: {},
      scanHistory: { totalScans: 0, lastCounts: null },
      ...(stored.inboxAvengerMemory || {})
    };
    state = {
      messages: [],
      subscriptions: [],
      lastUpdated: null,
      ...(stored.inboxAvengerState || {})
    };
  }

  function createToolbar() {
    if (document.getElementById(TOOLBAR_ID)) return;

    const toolbar = document.createElement("div");
    toolbar.id = TOOLBAR_ID;
    toolbar.innerHTML = `
      <div class="ia-toolbar-title">Inbox Avenger</div>
      <div class="ia-toolbar-actions">
        <button id="ia-scan-inbox-btn">Scan Inbox</button>
        <button id="ia-scan-open-btn">Scan Open Email</button>
        <button id="ia-toggle-settings" class="ia-secondary">Panel</button>
      </div>
    `;
    document.body.appendChild(toolbar);

    toolbar.querySelector("#ia-scan-inbox-btn")?.addEventListener("click", scanInboxRows);
    toolbar.querySelector("#ia-scan-open-btn")?.addEventListener("click", scanOpenMessages);
    toolbar.querySelector("#ia-toggle-settings")?.addEventListener("click", () => {
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.classList.toggle("ia-open");
    });
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ia-panel-header">
        <div class="ia-panel-title">Inbox Avenger Smart Panel</div>
        <div class="ia-panel-subtitle">Deeper scan, message-level analysis, and subscription discovery.</div>
      </div>

      <div class="ia-section">
        <div class="ia-section-title">Theme</div>
        <label>Accent <input type="color" id="ia-accent-color"></label>
        <label>High Risk <input type="color" id="ia-risk-color"></label>
        <label>Medium Risk <input type="color" id="ia-medium-color"></label>
        <label>Promo <input type="color" id="ia-promo-color"></label>
        <label>Deal <input type="color" id="ia-deal-color"></label>
        <label>Newsletter <input type="color" id="ia-newsletter-color"></label>
        <label>Normal <input type="color" id="ia-normal-color"></label>
        <label>Font
          <select id="ia-font-family">
            ${FONT_OPTIONS.map((font) => `<option value="${font}">${font}</option>`).join("")}
          </select>
        </label>
      </div>

      <div class="ia-section">
        <div class="ia-section-title">Analysis</div>
        <label>Scan Depth
          <input type="number" id="ia-scan-depth" min="1" max="10" step="1">
        </label>
        <label class="ia-checkbox-row"><input type="checkbox" id="ia-auto-sort"> Auto-sort visible rows</label>
        <label class="ia-checkbox-row"><input type="checkbox" id="ia-adaptive-learning"> Adaptive local learning</label>
      </div>

      <div id="ia-summary" class="ia-section"></div>

      <div class="ia-inline-buttons">
        <button id="ia-panel-scan-inbox">Scan Inbox</button>
        <button id="ia-panel-scan-open" class="ia-secondary">Scan Open</button>
      </div>

      <div class="ia-inline-buttons">
        <button id="ia-panel-save">Save Settings</button>
        <button id="ia-panel-full" class="ia-secondary">Full Scan</button>
      </div>

      <div class="ia-inline-buttons">
        <button id="ia-panel-clear" class="ia-secondary">Clear Cache</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector("#ia-panel-scan-inbox")?.addEventListener("click", scanInboxRows);
    panel.querySelector("#ia-panel-scan-open")?.addEventListener("click", scanOpenMessages);
    panel.querySelector("#ia-panel-full")?.addEventListener("click", fullScan);
    panel.querySelector("#ia-panel-clear")?.addEventListener("click", clearState);
    panel.querySelector("#ia-panel-save")?.addEventListener("click", async () => {
      settings = {
        accentColor: panel.querySelector("#ia-accent-color")?.value || DEFAULT_SETTINGS.accentColor,
        highRiskColor: panel.querySelector("#ia-risk-color")?.value || DEFAULT_SETTINGS.highRiskColor,
        mediumRiskColor: panel.querySelector("#ia-medium-color")?.value || DEFAULT_SETTINGS.mediumRiskColor,
        promoColor: panel.querySelector("#ia-promo-color")?.value || DEFAULT_SETTINGS.promoColor,
        dealColor: panel.querySelector("#ia-deal-color")?.value || DEFAULT_SETTINGS.dealColor,
        newsletterColor: panel.querySelector("#ia-newsletter-color")?.value || DEFAULT_SETTINGS.newsletterColor,
        normalColor: panel.querySelector("#ia-normal-color")?.value || DEFAULT_SETTINGS.normalColor,
        fontFamily: panel.querySelector("#ia-font-family")?.value || DEFAULT_SETTINGS.fontFamily,
        scanDepth: sanitizeNumber(panel.querySelector("#ia-scan-depth")?.value, 1, 10, DEFAULT_SETTINGS.scanDepth),
        autoSort: Boolean(panel.querySelector("#ia-auto-sort")?.checked),
        adaptiveLearning: Boolean(panel.querySelector("#ia-adaptive-learning")?.checked)
      };
      applyTheme();
      await persistState();
      showToast("Settings saved.");
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (message?.type === "IA_GET_STATE") {
        await loadState();
        sendResponse({ ok: true, state, settings });
        return;
      }
      if (message?.type === "IA_SCAN_INBOX") {
        const result = await scanInboxRows();
        sendResponse({ ok: true, result });
        return;
      }
      if (message?.type === "IA_SCAN_OPEN_MESSAGE") {
        const result = await scanOpenMessages();
        sendResponse({ ok: true, result });
        return;
      }
      if (message?.type === "IA_FULL_SCAN") {
        const result = await fullScan();
        sendResponse({ ok: true, result });
        return;
      }
      if (message?.type === "IA_CLEAR_CACHE") {
        await clearState();
        sendResponse({ ok: true });
        return;
      }
      sendResponse({ ok: false });
    })();
    return true;
  });

  const observer = new MutationObserver(() => {
    if (!document.getElementById(TOOLBAR_ID)) createToolbar();
    if (!document.getElementById(PANEL_ID)) {
      createPanel();
      fillSettingsForm();
      applyTheme();
      renderSummary();
    }
  });

  async function init() {
    await loadState();
    createToolbar();
    createPanel();
    fillSettingsForm();
    applyTheme();
    renderSummary();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  init();
})();
