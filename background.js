importScripts("classifier.js", "gmailApi.js");

/*
Inbox Avenger V5 Final - Background Scanner
Manifest V3 cannot stay awake forever, so this uses chrome.alarms.
It wakes up on schedule, scans, stores results, optionally applies Gmail labels, then sleeps.
*/

const STATE_KEYS = [
  "avengerDatabase",
  "avengerSettings",
  "avengerScanHistory",
  "avengerCorrections",
  "avengerLastStatus",
  "avengerLastRun",
  "avengerLastResults",
  "avengerStats"
];

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(STATE_KEYS);

  if (!data.avengerDatabase) await chrome.storage.local.set({ avengerDatabase: InboxAvengerClassifier.DEFAULT_DATABASE });
  if (!data.avengerSettings) await chrome.storage.local.set({ avengerSettings: InboxAvengerClassifier.DEFAULT_SETTINGS });
  if (!Array.isArray(data.avengerScanHistory)) await chrome.storage.local.set({ avengerScanHistory: [] });
  if (!Array.isArray(data.avengerCorrections)) await chrome.storage.local.set({ avengerCorrections: [] });
  if (!Array.isArray(data.avengerLastResults)) await chrome.storage.local.set({ avengerLastResults: [] });
  if (!data.avengerStats) await chrome.storage.local.set({ avengerStats: emptyStats() });

  await resetAlarm();
  await setStatus("Installed. Demo mode is ready. Configure OAuth for true Gmail API background scans.", "ready");
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === "IA_BACKGROUND_SCAN") {
    await runScanner({ source: "scheduled alarm" });
  }
});

async function getConfig() {
  const data = await chrome.storage.local.get(STATE_KEYS);
  const merged = InboxAvengerClassifier.mergeConfig(data.avengerDatabase, data.avengerSettings);
  return {
    ...merged,
    history: Array.isArray(data.avengerScanHistory) ? data.avengerScanHistory : [],
    corrections: Array.isArray(data.avengerCorrections) ? data.avengerCorrections : [],
    lastResults: Array.isArray(data.avengerLastResults) ? data.avengerLastResults : [],
    stats: data.avengerStats || emptyStats(),
    status: data.avengerLastStatus || null
  };
}

async function resetAlarm() {
  const { settings } = await getConfig();
  await chrome.alarms.clear("IA_BACKGROUND_SCAN");

  if (settings.backgroundScanEnabled) {
    const periodInMinutes = Math.max(1, Number(settings.scanIntervalMinutes || 5));
    await chrome.alarms.create("IA_BACKGROUND_SCAN", { periodInMinutes });
  }
}

function emptyStats() {
  return {
    totalScanned: 0,
    highRisk: 0,
    mediumRisk: 0,
    spam: 0,
    promotional: 0,
    usefulDeal: 0,
    transactional: 0,
    normal: 0
  };
}

function addToStats(stats, result) {
  const next = { ...emptyStats(), ...(stats || {}) };
  next.totalScanned += 1;

  const key = InboxAvengerClassifier.labelToKey(result.label);
  if (key === "highRisk") next.highRisk += 1;
  else if (key === "mediumRisk") next.mediumRisk += 1;
  else if (key === "usefulDeal") next.usefulDeal += 1;
  else if (key === "transactional") next.transactional += 1;
  else next[key] = (next[key] || 0) + 1;

  return next;
}

async function setStatus(message, level = "info", extra = {}) {
  const status = {
    message,
    level,
    at: new Date().toISOString(),
    ...extra
  };

  await chrome.storage.local.set({ avengerLastStatus: status });
  return status;
}

async function saveResults(results, source) {
  const { history, stats } = await getConfig();

  let nextStats = stats || emptyStats();
  const historyItems = [];

  for (const item of results) {
    nextStats = addToStats(nextStats, item.result);
    historyItems.push({
      createdAt: new Date().toISOString(),
      source,
      id: item.id,
      from: item.from,
      subject: item.subject,
      result: item.result
    });
  }

  const nextHistory = [...historyItems, ...history].slice(0, 500);

  await chrome.storage.local.set({
    avengerScanHistory: nextHistory,
    avengerLastResults: results.slice(0, 200),
    avengerStats: nextStats,
    avengerLastRun: new Date().toISOString()
  });
}

async function getAuthToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, token => {
      const err = chrome.runtime.lastError;
      if (err || !token) reject(new Error(err?.message || "No OAuth token returned."));
      else resolve(token);
    });
  });
}

async function removeAuthToken() {
  try {
    const token = await getAuthToken(false);
    await new Promise(resolve => chrome.identity.removeCachedAuthToken({ token }, resolve));
    return true;
  } catch {
    return false;
  }
}

async function scanDemoEmails(config, source) {
  const items = InboxAvengerClassifier.DEMO_EMAILS.map(email => ({
    ...email,
    text: `From: ${email.from}\nSubject: ${email.subject}\n\n${email.text}`
  }));

  const results = InboxAvengerClassifier.classifyMany(
    items,
    config.database,
    config.settings,
    config.corrections
  );

  await saveResults(results, source);
  await setStatus(`Demo scan complete. ${results.length} sample emails classified.`, "success", { mode: "demo" });
  await maybeNotify(results);
  return results;
}

async function scanGmailApi(config, source, interactiveAuth = false) {
  const token = await getAuthToken(interactiveAuth);
  const allMessages = [];
  let pageToken = null;

  for (let page = 0; page < Number(config.settings.maxPagesPerScan || 3); page++) {
    const pageData = await InboxAvengerGmailApi.listMessages(
      token,
      config.settings.gmailSearchQuery,
      config.settings.maxMessagesPerPage,
      pageToken
    );

    const messages = pageData.messages || [];
    allMessages.push(...messages);
    pageToken = pageData.nextPageToken;

    if (!pageToken) break;
  }

  const parsedMessages = [];

  for (const message of allMessages) {
    try {
      const full = await InboxAvengerGmailApi.getMessage(token, message.id);
      parsedMessages.push(InboxAvengerGmailApi.parseMessage(full));
    } catch (error) {
      parsedMessages.push({
        id: message.id,
        from: "",
        subject: "Could not read message",
        snippet: String(error.message || error),
        text: ""
      });
    }
  }

  const results = InboxAvengerClassifier.classifyMany(
    parsedMessages,
    config.database,
    config.settings,
    config.corrections
  );

  if (config.settings.applyGmailLabels) {
    await applyGmailLabels(token, results);
  }

  await saveResults(results, source);
  await setStatus(`Gmail API scan complete. ${results.length} emails classified.`, "success", { mode: "api" });
  await maybeNotify(results);
  return results;
}

async function applyGmailLabels(token, results) {
  const labelCache = {};

  for (const item of results) {
    if (!item.id || !item.result?.label) continue;

    try {
      const labelName = InboxAvengerClassifier.gmailLabelName(item.result.label);
      const labelId = await InboxAvengerGmailApi.ensureLabel(token, labelName, labelCache);
      await InboxAvengerGmailApi.applyLabel(token, item.id, labelId);
    } catch (error) {
      console.warn("Could not apply Gmail label:", error);
    }
  }
}

async function maybeNotify(results) {
  const { settings } = await getConfig();
  if (!settings.notifyOnHighRisk) return;

  const highRiskCount = results.filter(item => item.result?.label === "High Risk").length;
  if (highRiskCount <= 0) return;

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title: "Inbox Avenger",
    message: `${highRiskCount} high-risk email(s) found.`
  });
}

async function runScanner(options = {}) {
  const config = await getConfig();

  if (!config.settings.backgroundScanEnabled && options.source === "scheduled alarm") {
    await setStatus("Scheduled scan skipped because background scanning is off.", "info");
    return [];
  }

  try {
    await setStatus("Scan started.", "running", { source: options.source || "manual" });

    if (config.settings.mode === "api") {
      return await scanGmailApi(config, options.source || "manual Gmail API scan", Boolean(options.interactiveAuth));
    }

    return await scanDemoEmails(config, options.source || "manual demo scan");
  } catch (error) {
    const message = String(error.message || error);
    await setStatus(`Scan failed: ${message}`, "error");

    // If API fails, do not crash the extension. Leave demo mode available.
    if (config.settings.mode === "api") {
      console.warn("Gmail API scan failed:", error);
    }

    return [];
  }
}

async function saveCorrection(message) {
  const data = await chrome.storage.local.get(["avengerCorrections", "avengerDatabase"]);
  const corrections = Array.isArray(data.avengerCorrections) ? data.avengerCorrections : [];
  const database = data.avengerDatabase || InboxAvengerClassifier.DEFAULT_DATABASE;

  const item = {
    createdAt: new Date().toISOString(),
    originalLabel: message.originalLabel || "",
    correctedLabel: message.correctedLabel || "",
    selectedText: message.selectedText || "",
    source: message.source || "manual"
  };

  corrections.unshift(item);

  // Simple learning helper: add the most meaningful words to custom lists.
  const words = InboxAvengerClassifier.tokenize(item.selectedText).slice(0, 10);

  if (["High Risk", "Medium Risk", "Spam"].includes(item.correctedLabel)) {
    database.customBad = [...new Set([...(database.customBad || []), ...words])];
  } else if (item.correctedLabel === "Useful Deal") {
    database.customDeal = [...new Set([...(database.customDeal || []), ...words])];
  } else if (["Transactional", "Normal"].includes(item.correctedLabel)) {
    database.customGood = [...new Set([...(database.customGood || []), ...words])];
  }

  await chrome.storage.local.set({
    avengerCorrections: corrections.slice(0, 500),
    avengerDatabase: database
  });

  return item;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!message || !message.type) return { ok: false, error: "Missing message type." };

    if (message.type === "IA_GET_STATE") {
      const config = await getConfig();
      return {
        ok: true,
        settings: config.settings,
        database: config.database,
        status: config.status,
        lastRun: (await chrome.storage.local.get(["avengerLastRun"])).avengerLastRun || null,
        lastResults: config.lastResults,
        history: config.history.slice(0, 100),
        stats: config.stats,
        corrections: config.corrections.slice(0, 50)
      };
    }

    if (message.type === "IA_RUN_SCAN") {
      const results = await runScanner({ source: "manual scan", interactiveAuth: Boolean(message.interactiveAuth) });
      return { ok: true, results };
    }

    if (message.type === "IA_RUN_DEMO_SCAN") {
      const config = await getConfig();
      const results = await scanDemoEmails(config, "manual demo scan");
      return { ok: true, results };
    }

    if (message.type === "IA_AUTH_INTERACTIVE") {
      const token = await getAuthToken(true);
      await setStatus("Gmail OAuth token received. Switch mode to Gmail API to scan real background emails.", "success");
      return { ok: true, tokenReceived: Boolean(token) };
    }

    if (message.type === "IA_LOG_OUT") {
      const removed = await removeAuthToken();
      await setStatus("Cached Gmail OAuth token cleared.", "info");
      return { ok: true, removed };
    }

    if (message.type === "IA_SAVE_SETTINGS") {
      const merged = InboxAvengerClassifier.mergeConfig(message.database, message.settings);
      await chrome.storage.local.set({
        avengerDatabase: merged.database,
        avengerSettings: merged.settings
      });
      await resetAlarm();
      await setStatus("Settings saved.", "success");
      return { ok: true };
    }

    if (message.type === "IA_SAVE_SCAN") {
      await saveResults([{ ...message.item, result: message.result }], message.source || "content script");
      return { ok: true };
    }

    if (message.type === "IA_SAVE_CORRECTION") {
      const item = await saveCorrection(message);
      return { ok: true, item };
    }

    if (message.type === "IA_CLEAR_HISTORY") {
      await chrome.storage.local.set({
        avengerScanHistory: [],
        avengerLastResults: [],
        avengerStats: emptyStats()
      });
      await setStatus("History cleared.", "info");
      return { ok: true };
    }

    if (message.type === "IA_RESET_DEFAULTS") {
      await chrome.storage.local.set({
        avengerDatabase: InboxAvengerClassifier.DEFAULT_DATABASE,
        avengerSettings: InboxAvengerClassifier.DEFAULT_SETTINGS,
        avengerScanHistory: [],
        avengerCorrections: [],
        avengerLastResults: [],
        avengerStats: emptyStats()
      });
      await resetAlarm();
      await setStatus("Reset to Version 5 Final defaults.", "success");
      return { ok: true };
    }

    return { ok: false, error: "Unknown message type." };
  })()
    .then(sendResponse)
    .catch(error => sendResponse({ ok: false, error: String(error.message || error) }));

  return true;
});
