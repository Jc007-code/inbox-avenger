(() => {
  const DEFAULT_SETTINGS = {
    accentColor: "#2563eb",
    fontFamily: "Arial, sans-serif",
    scanDepth: 5,
    autoSort: true,
    adaptiveLearning: true
  };

  const WORD_DB = {
    risk: ["urgent","immediately","asap","suspended","verify","verification","password","login","signin","confirm","security","alert","compromised","breach","invoice","wire","giftcard","mailbox","expired","authenticate","crypto","bitcoin","refund","locked","disabled","actionrequired","finalnotice"],
    promo: ["sale","deal","deals","offer","offers","discount","clearance","promo","shop","buy","collection","unsubscribe","shipping","member","style","electronics","fashion","beauty"],
    deal: ["coupon","savings","save","promocode","freeshipping","cashback","bonus","bundle","bogo","markdown","pricedrop","rebate","voucher"],
    newsletter: ["newsletter","digest","reminder","update","announcement","recap","summary","weekly","daily","monthly","notification","bulletin","changelog"],
    important: ["meeting","calendar","assignment","project","professor","interview","recruiter","deadline","itinerary","booking","shipment","package","support"]
  };

  let settings = { ...DEFAULT_SETTINGS };
  let memory = { learnedTokens: {}, savedFilters: [], triageQueue: [] };
  let state = { messages: [], subscriptions: [], lastUpdated: null };

  const getStore = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  const setStore = (payload) => new Promise((resolve) => chrome.storage.local.set(payload, resolve));

  function keyify(word) {
    return String(word || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function tokenize(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9@._\-\s$%]/g, " ")
      .split(/\s+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function messageKey(m) {
    return m.threadId || m.messageId || [m.sender, m.subject, m.snippet].join(" | ").slice(0, 220);
  }

  function headerParts(row) {
    const sender =
      row.querySelector("span[email]")?.getAttribute("email") ||
      row.querySelector("span.yP, .yW span")?.textContent ||
      "";
    const subject = row.querySelector("span.bog")?.textContent || "";
    const snippet = row.querySelector("span.y2")?.textContent || row.innerText || "";
    const threadId = row.getAttribute("data-legacy-thread-id") || row.getAttribute("data-thread-id") || "";
    return {
      sender: sender.trim(),
      subject: subject.trim(),
      snippet: snippet.replace(/\s+/g, " ").trim(),
      threadId
    };
  }

  function inboxRows() {
    const rows = new Map();
    ["tr[data-legacy-thread-id]", "tr[role='row']"].forEach((selector) => {
      document.querySelectorAll(selector).forEach((row) => {
        if (!row.querySelector("td")) return;
        const text = row.innerText?.trim();
        if (!text) return;
        const parts = headerParts(row);
        rows.set(parts.threadId || text.slice(0, 180), row);
      });
    });
    return [...rows.values()];
  }

  function openMessageNodes() {
    const nodes = new Map();
    ["div[data-message-id]", "div[role='listitem'][data-message-id]"].forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        const id = node.getAttribute("data-message-id");
        if (id) nodes.set(id, node);
      });
    });
    return [...nodes.values()];
  }

  function extractLinks(container) {
    return [...container.querySelectorAll("a[href]")].map((a) => ({
      href: a.href,
      text: (a.textContent || "").trim()
    }));
  }

  function unsubscribeLinks(links) {
    return links.filter((l) => {
      const t = (l.text || "").toLowerCase();
      const h = (l.href || "").toLowerCase();
      return t.includes("unsubscribe") ||
             t.includes("opt out") ||
             t.includes("manage preferences") ||
             h.includes("unsubscribe") ||
             h.includes("preferences") ||
             h.startsWith("mailto:");
    }).slice(0, 8);
  }

  function parseOpenMessage(node) {
    const subject =
      document.querySelector("h2.hP")?.textContent?.trim() ||
      node.querySelector("h2.hP")?.textContent?.trim() ||
      "";
    const sender =
      node.querySelector("span[email]")?.getAttribute("email") ||
      node.querySelector(".gD")?.textContent ||
      "";
    const body =
      node.querySelector(".a3s")?.innerText ||
      node.querySelector(".ii.gt")?.innerText ||
      node.innerText ||
      "";
    const links = extractLinks(node);
    return {
      messageId: node.getAttribute("data-message-id") || "",
      sender: sender.trim(),
      subject: subject.trim(),
      snippet: body.replace(/\s+/g, " ").trim().slice(0, 260),
      fullText: body.replace(/\s+/g, " ").trim(),
      unsubscribeLinks: unsubscribeLinks(links)
    };
  }

  function classify(source) {
    const text = [source.sender || "", source.subject || "", source.snippet || "", source.fullText || ""]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const tokens = tokenize(text);
    let risk = 0, promo = 0, deal = 0, newsletter = 0, important = 0;

    tokens.forEach((token) => {
      const key = keyify(token);
      if (WORD_DB.risk.includes(key)) risk += 3;
      if (WORD_DB.promo.includes(key)) promo += 2;
      if (WORD_DB.deal.includes(key)) deal += 3;
      if (WORD_DB.newsletter.includes(key)) newsletter += 2;
      if (WORD_DB.important.includes(key)) important += 3;

      const learned = memory.learnedTokens[key];
      if (learned) {
        risk += (learned.high_risk || 0) * 0.4;
        promo += (learned.promo || 0) * 0.3;
        deal += (learned.deal || 0) * 0.3;
        newsletter += (learned.newsletter || 0) * 0.3;
        important += (learned.important || 0) * 0.3;
      }
    });

    if (/\b\d{1,3}%\s*off\b|\$\d+\s*off\b|\bbuy one get one\b|\bbogo\b/i.test(text)) deal += 6;
    if (/\bcoupon code\b|\bpromo code\b|\bfree shipping\b|\bprice drop\b/i.test(text)) deal += 5;
    if (/\baction required\b|\brespond immediately\b|\bfinal notice\b|\bkindly\b/i.test(text)) risk += 6;
    if (/\bverify\b|\bconfirm\b|\blog[ -]?in\b|\bsign[ -]?in\b|\bpassword\b|\bmfa\b|\b2fa\b/i.test(text)) risk += 6;
    if (/bit\.ly|tinyurl|rb\.gy|t\.co\//i.test(text)) risk += 7;
    if (/\bnewsletter\b|\bdigest\b|\bweekly update\b|\bmonthly update\b/i.test(text)) newsletter += 5;

    const riskFactor = Math.min(100, Math.round((risk * 8) + (promo * 1.5)));
    let category = "normal";

    if (riskFactor >= 72) category = "high_risk";
    else if (riskFactor >= 42) category = "medium_risk";
    else if (important >= 8) category = "important";
    else if (deal >= 7 && risk < 8) category = "deal";
    else if (newsletter >= 6 && risk < 8) category = "newsletter";
    else if (promo >= 6 && risk < 8) category = "promo";

    return {
      ...source,
      key: messageKey(source),
      category,
      riskFactor,
      wholeMessage: Boolean(source.fullText && source.fullText.length > 120),
      canUnsubscribe: Array.isArray(source.unsubscribeLinks) && source.unsubscribeLinks.length > 0,
      scoreBreakdown: { risk, promo, deal, newsletter, important }
    };
  }

  function mergeMessage(message) {
    const idx = state.messages.findIndex((m) => m.key === message.key);
    if (idx >= 0) state.messages[idx] = { ...state.messages[idx], ...message };
    else state.messages.push(message);
  }

  function rebuildSubscriptions() {
    state.subscriptions = state.messages.filter(
      (m) => m.canUnsubscribe || ["promo","deal","newsletter"].includes(m.category)
    );
  }

  function label(category) {
    return ({
      high_risk: "HIGH RISK",
      medium_risk: "MEDIUM RISK",
      important: "IMPORTANT",
      deal: "DEAL",
      promo: "PROMO",
      newsletter: "NEWSLETTER",
      normal: "NORMAL"
    })[category] || "NORMAL";
  }

  function className(category) {
    return ({
      high_risk: "ia4-high-risk",
      medium_risk: "ia4-medium-risk",
      important: "ia4-important",
      deal: "ia4-deal",
      promo: "ia4-promo",
      newsletter: "ia4-newsletter",
      normal: "ia4-normal"
    })[category] || "ia4-normal";
  }

  function removeDecor(row) {
    row.querySelectorAll(".ia4-badge").forEach((el) => el.remove());
    row.classList.remove(
      "ia4-high-risk","ia4-medium-risk","ia4-important",
      "ia4-deal","ia4-promo","ia4-newsletter","ia4-normal"
    );
  }

  function decorate(row, message) {
    const cell = row.querySelector("td");
    if (!cell) return;
    const badge = document.createElement("span");
    badge.className = `ia4-badge ${className(message.category)}`;
    badge.textContent = `${label(message.category)} • ${message.riskFactor}`;
    badge.title = `Risk ${message.scoreBreakdown.risk} | Promo ${message.scoreBreakdown.promo} | Deal ${message.scoreBreakdown.deal} | Newsletter ${message.scoreBreakdown.newsletter} | Important ${message.scoreBreakdown.important}`;
    cell.prepend(badge);
    row.classList.add(className(message.category));
    row.dataset.ia4Category = message.category;
    row.dataset.ia4Risk = String(message.riskFactor);
  }

  function sortRows(rows) {
    const order = { high_risk: 7, medium_risk: 6, important: 5, deal: 4, newsletter: 3, promo: 2, normal: 1 };
    const parent = rows[0]?.parentElement;
    if (!parent) return;
    [...rows].sort((a, b) => {
      const ca = a.dataset.ia4Category || "normal";
      const cb = b.dataset.ia4Category || "normal";
      const catDiff = (order[cb] || 0) - (order[ca] || 0);
      if (catDiff !== 0) return catDiff;
      return Number(b.dataset.ia4Risk || 0) - Number(a.dataset.ia4Risk || 0);
    }).forEach((row) => parent.appendChild(row));
  }

  function scrollContainer() {
    const main = document.querySelector("div[role='main']");
    if (main && main.scrollHeight > main.clientHeight + 200) return main;
    return document.scrollingElement || document.documentElement;
  }

  async function collectRows() {
    const container = scrollContainer();
    const original = container.scrollTop;
    const found = new Map();

    for (let i = 0; i < settings.scanDepth; i += 1) {
      inboxRows().forEach((row) => {
        const parts = headerParts(row);
        found.set(parts.threadId || row.innerText.slice(0, 180), row);
      });
      container.scrollTop += Math.max(450, Math.floor(container.clientHeight * 0.85));
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    container.scrollTop = original;
    return [...found.values()];
  }

  async function persist() {
    state.lastUpdated = new Date().toISOString();
    await setStore({
      inboxAvengerV4Settings: settings,
      inboxAvengerV4Memory: memory,
      inboxAvengerV4State: state
    });
  }

  async function scanInbox() {
    const rows = await collectRows();
    rows.forEach((row) => {
      removeDecor(row);
      const message = classify({
        ...headerParts(row),
        source: "inbox-row",
        fullText: "",
        unsubscribeLinks: []
      });
      mergeMessage(message);
      decorate(row, message);
    });

    if (settings.autoSort) {
      const visible = inboxRows();
      if (visible.length) sortRows(visible);
    }

    rebuildSubscriptions();
    await persist();
    return { scanned: rows.length };
  }

  async function scanOpenEmail() {
    const nodes = openMessageNodes();
    if (!nodes.length) return { scanned: 0 };

    nodes.forEach((node) => {
      const raw = parseOpenMessage(node);
      const message = classify({ ...raw, source: "open-message" });
      mergeMessage(message);

      tokenize([message.sender, message.subject, message.snippet, message.fullText].join(" "))
        .map(keyify)
        .filter(Boolean)
        .slice(0, 30)
        .forEach((token) => {
          memory.learnedTokens[token] = memory.learnedTokens[token] || {
            high_risk: 0, medium_risk: 0, promo: 0, deal: 0,
            newsletter: 0, important: 0, normal: 0
          };
          memory.learnedTokens[token][message.category] =
            (memory.learnedTokens[token][message.category] || 0) + 1;
        });
    });

    rebuildSubscriptions();
    await persist();
    return { scanned: nodes.length };
  }

  function createToolbar() {
    if (document.getElementById("ia4-toolbar")) return;

    const bar = document.createElement("div");
    bar.id = "ia4-toolbar";
    bar.innerHTML = `
      <div class="ia4-title">Inbox Avenger v4</div>
      <div class="ia4-actions">
        <button id="ia4-scan-inbox">Scan Inbox</button>
        <button id="ia4-scan-open">Scan Open</button>
      </div>
    `;

    document.body.appendChild(bar);
    bar.querySelector("#ia4-scan-inbox").addEventListener("click", scanInbox);
    bar.querySelector("#ia4-scan-open").addEventListener("click", scanOpenEmail);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      if (message?.type === "IA4_GET_STATE") return sendResponse({ ok: true, state, memory });
      if (message?.type === "IA4_SCAN_INBOX") return sendResponse({ ok: true, result: await scanInbox() });
      if (message?.type === "IA4_SCAN_OPEN") return sendResponse({ ok: true, result: await scanOpenEmail() });

      if (message?.type === "IA4_SAVE_FILTER" && message.filter) {
        memory.savedFilters.push(message.filter);
        await persist();
        return sendResponse({ ok: true });
      }

      if (message?.type === "IA4_QUEUE_KEYS" && Array.isArray(message.keys)) {
        memory.triageQueue = [...new Set([...memory.triageQueue, ...message.keys])];
        await persist();
        return sendResponse({ ok: true });
      }

      if (message?.type === "IA4_CLEAR_CACHE") {
        state = { messages: [], subscriptions: [], lastUpdated: null };
        await persist();
        return sendResponse({ ok: true });
      }

      sendResponse({ ok: false });
    })();
    return true;
  });

  async function init() {
    const stored = await getStore(["inboxAvengerV4Settings", "inboxAvengerV4Memory", "inboxAvengerV4State"]);
    settings = { ...DEFAULT_SETTINGS, ...(stored.inboxAvengerV4Settings || {}) };
    memory = { learnedTokens: {}, savedFilters: [], triageQueue: [], ...(stored.inboxAvengerV4Memory || {}) };
    state = { messages: [], subscriptions: [], lastUpdated: null, ...(stored.inboxAvengerV4State || {}) };

    document.documentElement.style.setProperty("--ia4-accent", settings.accentColor);
    document.documentElement.style.setProperty("--ia4-font", settings.fontFamily);
    createToolbar();
  }

  init();
})();
