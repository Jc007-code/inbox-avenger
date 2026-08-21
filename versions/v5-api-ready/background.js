const DEFAULT_SETTINGS = {
  indexPageSize: 100,
  maxPagesPerSync: 5,
  highRiskThreshold: 72,
  mediumRiskThreshold: 42
};

const STOPWORDS = new Set([
  "the","and","for","with","that","this","from","your","you","are","was","were",
  "have","has","had","will","would","can","could","into","about"
]);

const WORD_DB = {
  risk: ["urgent","immediately","suspended","verify","verification","password","login","signin","confirm","security","alert","compromised","breach","invoice","wire","giftcard","mailbox","expired","authenticate","bitcoin"],
  promo: ["sale","deal","deals","offer","offers","discount","clearance","promo","shop","buy","unsubscribe","shipping"],
  deal: ["coupon","savings","save","promocode","freeshipping","cashback","bonus","bundle","bogo","markdown","pricedrop","rebate","voucher"],
  newsletter: ["newsletter","digest","reminder","update","announcement","recap","summary","weekly","daily","monthly","notification"],
  important: ["meeting","calendar","assignment","project","professor","interview","recruiter","deadline","itinerary","booking","shipment","package"]
};

function keyify(word) {
  return String(word || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9@._\-\s$%]/g, " ")
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !STOPWORDS.has(s));
}

function senderDomain(sender) {
  const match = String(sender || "").match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
  return match ? match[1].toLowerCase() : "";
}

function decodeBase64Url(input) {
  if (!input) return "";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 ? "=".repeat(4 - (normalized.length % 4)) : "";
  try { return atob(normalized + pad); } catch { return ""; }
}

function extractBodyText(payload) {
  if (!payload) return "";
  const parts = [];

  function walk(part) {
    if (!part) return;
    if (part.body?.data && (part.mimeType === "text/plain" || part.mimeType === "text/html")) {
      parts.push(decodeBase64Url(part.body.data));
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  }

  walk(payload);
  return parts.join("\n").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function unsubscribeFromPayload(payload) {
  const headers = payload?.headers || [];
  const listUnsub = headers.find((h) => h.name?.toLowerCase() === "list-unsubscribe")?.value || "";
  const links = [];

  if (listUnsub) {
    const matches = listUnsub.match(/<([^>]+)>/g) || [];
    matches.forEach((m) => links.push(m.replace(/[<>]/g, "")));
  }

  const bodyText = extractBodyText(payload);
  [...bodyText.matchAll(/https?:\/\/[^\s<>"']+/g)].forEach((m) => {
    const link = m[0];
    const lower = link.toLowerCase();
    if (lower.includes("unsubscribe") || lower.includes("optout") || lower.includes("preferences")) {
      links.push(link);
    }
  });

  return [...new Set(links)].slice(0, 8);
}

function classifyMessage(message, settings = DEFAULT_SETTINGS) {
  const text = [message.from || "", message.subject || "", message.snippet || "", message.bodyText || ""]
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
  });

  if (/\b\d{1,3}%\s*off\b|\$\d+\s*off\b|\bbuy one get one\b|\bbogo\b/i.test(text)) deal += 6;
  if (/\bcoupon code\b|\bpromo code\b|\bfree shipping\b|\bprice drop\b/i.test(text)) deal += 5;
  if (/\baction required\b|\brespond immediately\b|\bfinal notice\b|\bkindly\b/i.test(text)) risk += 6;
  if (/\bverify\b|\bconfirm\b|\blog[ -]?in\b|\bsign[ -]?in\b|\bpassword\b|\bmfa\b|\b2fa\b/i.test(text)) risk += 6;
  if (/bit\.ly|tinyurl|rb\.gy|t\.co\//i.test(text)) risk += 7;
  if (/\bnewsletter\b|\bdigest\b|\bweekly update\b|\bmonthly update\b/i.test(text)) newsletter += 5;

  const riskFactor = Math.min(100, Math.round((risk * 8) + (promo * 1.5)));
  let category = "normal";

  if (riskFactor >= settings.highRiskThreshold) category = "high_risk";
  else if (riskFactor >= settings.mediumRiskThreshold) category = "medium_risk";
  else if (important >= 8) category = "important";
  else if (deal >= 7 && risk < 8) category = "deal";
  else if (newsletter >= 6 && risk < 8) category = "newsletter";
  else if (promo >= 6 && risk < 8) category = "promo";

  return { category, riskFactor, domain: senderDomain(message.from) };
}

async function getAuthToken(interactive = true) {
  return chrome.identity.getAuthToken({ interactive });
}

async function gmailFetch(path, token, options = {}) {
  const response = await fetch(`https://www.googleapis.com/gmail/v1/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) throw new Error(`Gmail API error ${response.status}`);
  return response.json();
}

async function getIndex() {
  const stored = await chrome.storage.local.get(["inboxAvengerV5Index"]);
  return stored.inboxAvengerV5Index || {
    messages: [],
    sync: { lastSync: null, indexedCount: 0 }
  };
}

async function saveIndex(index) {
  await chrome.storage.local.set({ inboxAvengerV5Index: index });
}

async function syncMailbox() {
  const token = await getAuthToken(true);
  const index = await getIndex();
  let nextPageToken = null;
  let pages = 0;
  const messages = new Map(index.messages.map((m) => [m.id, m]));

  do {
    const params = new URLSearchParams();
    params.set("maxResults", String(DEFAULT_SETTINGS.indexPageSize));
    if (nextPageToken) params.set("pageToken", nextPageToken);

    const list = await gmailFetch(`users/me/messages?${params.toString()}`, token);
    const ids = (list.messages || []).map((m) => m.id);

    for (const id of ids) {
      const msg = await gmailFetch(`users/me/messages/${id}?format=full`, token);
      const headers = msg.payload?.headers || [];
      const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
      const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value || "";
      const bodyText = extractBodyText(msg.payload);
      const classified = classifyMessage({
        from,
        subject,
        snippet: msg.snippet || "",
        bodyText
      });

      messages.set(id, {
        id,
        threadId: msg.threadId,
        from,
        subject,
        snippet: msg.snippet || "",
        bodyTextPreview: bodyText.slice(0, 1000),
        unsubscribeLinks: unsubscribeFromPayload(msg.payload),
        labelIds: msg.labelIds || [],
        indexedAt: new Date().toISOString(),
        ...classified
      });
    }

    nextPageToken = list.nextPageToken || null;
    pages += 1;
  } while (nextPageToken && pages < DEFAULT_SETTINGS.maxPagesPerSync);

  index.messages = [...messages.values()];
  index.sync.lastSync = new Date().toISOString();
  index.sync.indexedCount = index.messages.length;
  await saveIndex(index);

  return {
    indexedCount: index.messages.length,
    lastSync: index.sync.lastSync
  };
}

async function searchIndex(query = "", category = "all") {
  const index = await getIndex();
  const q = String(query || "").trim().toLowerCase();
  let items = index.messages || [];

  if (category !== "all") items = items.filter((m) => m.category === category);

  if (q) {
    items = items.filter((m) =>
      [m.from, m.subject, m.snippet, m.bodyTextPreview, m.domain]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }

  return items.slice(0, 500);
}

async function createLabel(name) {
  const token = await getAuthToken(true);
  return gmailFetch("users/me/labels", token, {
    method: "POST",
    body: JSON.stringify({
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show"
    })
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "IA5_SYNC_MAILBOX") {
        return sendResponse({ ok: true, result: await syncMailbox() });
      }
      if (message?.type === "IA5_SEARCH_INDEX") {
        return sendResponse({ ok: true, result: await searchIndex(message.query, message.category) });
      }
      if (message?.type === "IA5_CREATE_LABEL") {
        return sendResponse({ ok: true, result: await createLabel(message.name) });
      }
      sendResponse({ ok: false, error: "Unknown action" });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  })();
  return true;
});
