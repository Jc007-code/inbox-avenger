/*
Inbox Avenger V5 Final - Classifier
Rule engine + small local Naive Bayes model.
Works in popup, options, content script, and service worker.
*/

(function () {
  const root = typeof self !== "undefined" ? self : window;

  const LABELS = [
    "High Risk",
    "Medium Risk",
    "Spam",
    "Promotional",
    "Useful Deal",
    "Transactional",
    "Normal"
  ];

  const DEFAULT_DATABASE = {
    highRisk: [
      "verify your account",
      "account suspended",
      "account locked",
      "account disabled",
      "unusual sign-in",
      "unusual login",
      "confirm your identity",
      "validate your account",
      "restore access",
      "password expired",
      "password reset required",
      "security alert",
      "unauthorized access",
      "sign in immediately",
      "click below to restore",
      "final warning",
      "urgent action required",
      "avoid closure",
      "your mailbox is full",
      "payment failed",
      "update billing information",
      "billing problem",
      "limited time to respond",
      "act now",
      "confirm payment",
      "suspicious activity"
    ],
    scam: [
      "gift card",
      "steam card",
      "apple card",
      "google play card",
      "wire transfer",
      "western union",
      "cash app",
      "zelle",
      "venmo",
      "bitcoin",
      "crypto wallet",
      "usdt",
      "recovery phrase",
      "seed phrase",
      "claim your prize",
      "you have won",
      "lottery",
      "inheritance",
      "kindly send",
      "confidential transaction",
      "social security number",
      "bank account number",
      "routing number",
      "driver license",
      "passport",
      "irs refund",
      "court summons",
      "debt collection",
      "package held",
      "customs fee",
      "delivery failed",
      "urgent invoice",
      "pay immediately"
    ],
    attachmentRisk: [
      ".exe",
      ".scr",
      ".vbs",
      ".bat",
      ".cmd",
      ".jar",
      ".docm",
      ".xlsm",
      ".iso",
      "enable macros",
      "macro enabled",
      "password protected zip",
      "zip password",
      "open the attached file",
      "see attached invoice",
      "invoice attached",
      "download attachment",
      "secure document"
    ],
    spam: [
      "make money fast",
      "work from home",
      "risk free",
      "miracle",
      "guaranteed results",
      "no credit check",
      "pre-approved",
      "free trial",
      "winner",
      "congratulations",
      "exclusive invitation",
      "double your money",
      "weight loss",
      "limited seats",
      "as seen on tv",
      "once in a lifetime"
    ],
    promotional: [
      "sale",
      "discount",
      "promo",
      "promotion",
      "limited time offer",
      "clearance",
      "save",
      "bundle",
      "coupon",
      "newsletter",
      "new arrivals",
      "shop now",
      "deal",
      "exclusive offer",
      "flash sale",
      "black friday",
      "cyber monday",
      "free shipping",
      "reward points",
      "member offer",
      "buy now",
      "cart",
      "wishlist",
      "special offer"
    ],
    usefulDeals: [
      "coupon code",
      "price drop",
      "student discount",
      "free shipping",
      "clearance",
      "bundle deal",
      "cashback",
      "rebate",
      "lowest price",
      "limited stock",
      "save 50",
      "save 40",
      "save 30",
      "save 25",
      "buy one get one",
      "bogo",
      "deal ends",
      "valid through",
      "price match",
      "extra off",
      "exclusive code"
    ],
    safeBusiness: [
      "order confirmed",
      "receipt",
      "tracking number",
      "shipping confirmation",
      "appointment reminder",
      "ticket confirmation",
      "your statement is ready",
      "subscription renewal",
      "support ticket",
      "case number",
      "two-factor code",
      "verification code",
      "do not share this code",
      "meeting invite",
      "calendar invitation",
      "invoice paid",
      "payment received",
      "password changed",
      "login code"
    ],
    unsubscribeSignals: [
      "unsubscribe",
      "manage preferences",
      "email preferences",
      "view in browser",
      "marketing email",
      "you are receiving this email because",
      "update your preferences",
      "opt out",
      "opt-out"
    ],
    customGood: [],
    customBad: [],
    customDeal: []
  };

  const DEFAULT_SETTINGS = {
    mode: "demo",
    backgroundScanEnabled: true,
    scanIntervalMinutes: 5,
    maxPagesPerScan: 3,
    maxMessagesPerPage: 25,
    gmailSearchQuery: "newer_than:30d -in:chats",
    applyGmailLabels: false,
    notifyOnHighRisk: true,
    highRiskThreshold: 13,
    mediumRiskThreshold: 7,
    usefulDealThreshold: 5,
    promotionalThreshold: 4,
    spamThreshold: 5,
    mlWeight: 0.28,
    highRiskMlBoost: 5,
    maxVisibleRowsToScan: 80,
    scanDepthMode: "balanced",
    showGmailBadges: true,
    scanOpenEmailBody: true,
    scanInboxRows: true,
    showFloatingPanel: false,
    autoSaveScanHistory: true,
    trustedSenders: [
      "no-reply@amazon.com",
      "noreply@github.com",
      "security-noreply@google.com",
      "no-reply@accounts.google.com"
    ],
    blockedSenders: [],
    themeColor: "#2563eb",
    badgeStyle: "rounded",
    fontScale: 1,
    categoryVisibility: {
      highRisk: true,
      mediumRisk: true,
      spam: true,
      promotional: true,
      usefulDeal: true,
      transactional: true,
      normal: true
    }
  };

  const TRAINING_EXAMPLES = [
    { label: "High Risk", text: "urgent action required verify your account account locked password expired click below restore access update billing information" },
    { label: "High Risk", text: "security alert unusual sign-in confirm identity avoid account closure login immediately" },
    { label: "High Risk", text: "invoice attached password protected zip enable macros secure document urgent payment failed" },
    { label: "High Risk", text: "seed phrase crypto wallet unauthorized access restore your wallet verify your account" },

    { label: "Medium Risk", text: "payment issue review account details suspicious activity check sender before clicking" },
    { label: "Medium Risk", text: "delivery failed customs fee package held click to reschedule shipment" },
    { label: "Medium Risk", text: "billing problem update information review details unknown sender" },

    { label: "Spam", text: "congratulations winner make money fast work from home guaranteed results free trial" },
    { label: "Spam", text: "miracle results risk free no credit check exclusive invitation double your money" },
    { label: "Spam", text: "limited seats once in a lifetime pre-approved offer weight loss" },

    { label: "Promotional", text: "newsletter new arrivals sale discount limited time offer shop now reward points" },
    { label: "Promotional", text: "exclusive offer flash sale member offer save on cart wishlist promo" },
    { label: "Promotional", text: "marketing email manage preferences unsubscribe special offer" },

    { label: "Useful Deal", text: "coupon code price drop free shipping cashback save 30 valid through deal ends" },
    { label: "Useful Deal", text: "student discount bundle deal rebate lowest price price match bogo" },
    { label: "Useful Deal", text: "clearance extra off exclusive code limited stock save 50" },

    { label: "Transactional", text: "order confirmed receipt tracking number shipping confirmation support ticket case number" },
    { label: "Transactional", text: "appointment reminder ticket confirmation statement ready payment received subscription renewal" },
    { label: "Transactional", text: "verification code two-factor code do not share this code login code" },

    { label: "Normal", text: "hello following up on our conversation let me know what time works for the meeting" },
    { label: "Normal", text: "thanks for the update I reviewed the notes and will respond tomorrow" },
    { label: "Normal", text: "class project reminder please submit your final report by the deadline" }
  ];

  const DEMO_EMAILS = [
    {
      id: "demo-1",
      from: "security-alert@fake-bank-login.com",
      subject: "Urgent Action Required - Account Suspended",
      text: "Your account has been locked because of unusual sign-in activity. To avoid closure, click below to verify your account and update your billing information immediately. https://fake-bank-login.com/secure/verify-account"
    },
    {
      id: "demo-2",
      from: "deals@gamestore.com",
      subject: "Price Drop + Free Shipping on Gaming Accessories",
      text: "Your saved item just had a price drop. Use coupon code GAME20 for 20% off and free shipping. Deal ends tonight and is valid through this weekend only."
    },
    {
      id: "demo-3",
      from: "newsletter@shop-example.com",
      subject: "New Arrivals and Member Sale",
      text: "You are receiving this email because you signed up for our newsletter. Shop now for new arrivals, limited time offers, reward points, and exclusive member discounts. Unsubscribe or manage preferences."
    },
    {
      id: "demo-4",
      from: "no-reply@amazon.com",
      subject: "Order Confirmed",
      text: "Thank you for your order. Your receipt is ready and your tracking number will be sent when the package ships. Your support ticket case number is 49382."
    },
    {
      id: "demo-5",
      from: "billing@unknown-company-payments.com",
      subject: "Invoice Attached",
      text: "Please open the attached invoice. The zip file is password protected. Enable macros if the document does not load correctly."
    },
    {
      id: "demo-6",
      from: "winner@random-promo-example.com",
      subject: "Congratulations Winner",
      text: "Congratulations, you have been selected for a risk free opportunity. Make money fast from home with guaranteed results and no credit check."
    }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizeEmail(email) {
    return normalizeText(email).replace(/[<>]/g, "").trim();
  }

  function tokenize(text) {
    const stop = new Set([
      "the", "and", "for", "you", "your", "this", "that", "with", "from", "have", "has",
      "are", "was", "were", "will", "not", "but", "can", "our", "out", "into", "about",
      "because", "been", "then", "than", "they", "them", "their", "there", "here"
    ]);

    return normalizeText(text)
      .split(/[^a-z0-9$%.-]+/i)
      .map(t => t.trim())
      .filter(t => t.length > 2 && !stop.has(t))
      .slice(0, 600);
  }

  function unique(list) {
    return [...new Set((list || []).filter(Boolean))];
  }

  function mergeConfig(database, settings) {
    const mergedDatabase = clone(DEFAULT_DATABASE);
    const incomingDatabase = database || {};
    for (const key of Object.keys(mergedDatabase)) {
      if (Array.isArray(incomingDatabase[key])) mergedDatabase[key] = incomingDatabase[key];
    }

    const mergedSettings = { ...clone(DEFAULT_SETTINGS), ...(settings || {}) };
    mergedSettings.categoryVisibility = {
      ...clone(DEFAULT_SETTINGS.categoryVisibility),
      ...(settings?.categoryVisibility || {})
    };

    return { database: mergedDatabase, settings: mergedSettings };
  }

  function countMatches(text, terms) {
    const normalized = normalizeText(text);
    const hits = [];

    for (const rawTerm of terms || []) {
      const term = normalizeText(rawTerm);
      if (!term) continue;

      if (term.includes("*")) {
        const escaped = term
          .split("*")
          .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*");
        const re = new RegExp(escaped, "i");
        if (re.test(normalized)) hits.push(rawTerm);
      } else if (normalized.includes(term)) {
        hits.push(rawTerm);
      }
    }

    return unique(hits);
  }

  function extractLinks(textOrHtml) {
    const raw = String(textOrHtml || "");
    const links = [];

    const hrefRegex = /href=["']([^"']+)["']/gi;
    let hrefMatch;
    while ((hrefMatch = hrefRegex.exec(raw)) !== null) links.push(hrefMatch[1]);

    const urlRegex = /(https?:\/\/[^\s"'<>)]{4,}|www\.[^\s"'<>)]{4,})/gi;
    let urlMatch;
    while ((urlMatch = urlRegex.exec(raw)) !== null) links.push(urlMatch[1]);

    return unique(links).slice(0, 50);
  }

  function analyzeLinks(textOrHtml) {
    const links = extractLinks(textOrHtml);
    const suspicious = [];
    const unsubscribe = [];

    for (const link of links) {
      const lower = link.toLowerCase();

      if (
        lower.includes("unsubscribe") ||
        lower.includes("preferences") ||
        lower.includes("optout") ||
        lower.includes("opt-out")
      ) unsubscribe.push(link);

      if (
        lower.includes("bit.ly") ||
        lower.includes("tinyurl") ||
        lower.includes("t.co/") ||
        lower.includes("goo.gl") ||
        lower.includes("ow.ly") ||
        lower.includes("@") ||
        lower.includes("login") ||
        lower.includes("verify") ||
        lower.includes("secure") ||
        lower.includes("account") ||
        lower.includes("redirect")
      ) suspicious.push(link);
    }

    return {
      links,
      suspiciousLinks: unique(suspicious),
      unsubscribeLinks: unique(unsubscribe)
    };
  }

  function extractSender(text) {
    const raw = String(text || "");
    const fromLine = raw.match(/from:\s*([^\n<]+)?\s*<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i);
    if (fromLine) return normalizeEmail(fromLine[2]);

    const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return email ? normalizeEmail(email[0]) : "";
  }

  function extractMoneySignals(text) {
    const raw = String(text || "");
    const moneyHits = raw.match(/(\$|usd\s*)\d{1,6}([.,]\d{2})?/gi) || [];
    const percentHits = raw.match(/\b\d{1,2}%\s*(off|discount|cashback|back)\b/gi) || [];
    return unique([...moneyHits, ...percentHits]);
  }

  function senderStatus(sender, settings) {
    const normalizedSender = normalizeEmail(sender || "");
    if (!normalizedSender) return "unknown";

    const trusted = (settings.trustedSenders || []).map(normalizeEmail);
    const blocked = (settings.blockedSenders || []).map(normalizeEmail);

    if (blocked.some(item => normalizedSender.includes(item) || item.includes(normalizedSender))) return "blocked";
    if (trusted.some(item => normalizedSender.includes(item) || item.includes(normalizedSender))) return "trusted";
    return "unknown";
  }

  function buildTrainingRows(corrections) {
    const rows = TRAINING_EXAMPLES.slice();

    for (const correction of corrections || []) {
      if (LABELS.includes(correction.correctedLabel) && correction.selectedText) {
        rows.push({
          label: correction.correctedLabel,
          text: correction.selectedText
        });
      }
    }

    return rows;
  }

  function trainNaiveBayes(corrections) {
    const rows = buildTrainingRows(corrections);
    const labelCounts = {};
    const tokenCounts = {};
    const totalTokensByLabel = {};
    const vocabulary = new Set();

    for (const label of LABELS) {
      labelCounts[label] = 0;
      tokenCounts[label] = {};
      totalTokensByLabel[label] = 0;
    }

    for (const row of rows) {
      const label = LABELS.includes(row.label) ? row.label : "Normal";
      labelCounts[label] += 1;

      for (const token of tokenize(row.text)) {
        vocabulary.add(token);
        tokenCounts[label][token] = (tokenCounts[label][token] || 0) + 1;
        totalTokensByLabel[label] += 1;
      }
    }

    return {
      labelCounts,
      tokenCounts,
      totalTokensByLabel,
      vocabulary: Array.from(vocabulary),
      totalRows: rows.length
    };
  }

  function classifyNaiveBayes(text, model) {
    const tokens = tokenize(text);
    const vocabSize = Math.max(1, model.vocabulary.length);
    const scores = {};
    const totalRows = Math.max(1, model.totalRows);

    for (const label of LABELS) {
      const prior = Math.log((model.labelCounts[label] + 1) / (totalRows + LABELS.length));
      let score = prior;

      for (const token of tokens) {
        const count = model.tokenCounts[label][token] || 0;
        const denom = model.totalTokensByLabel[label] + vocabSize;
        score += Math.log((count + 1) / denom);
      }

      scores[label] = score;
    }

    const maxScore = Math.max(...Object.values(scores));
    const expScores = {};
    let total = 0;

    for (const [label, score] of Object.entries(scores)) {
      const value = Math.exp(score - maxScore);
      expScores[label] = value;
      total += value;
    }

    const probabilities = {};
    for (const label of LABELS) {
      probabilities[label] = expScores[label] / total;
    }

    const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
    return {
      label: sorted[0][0],
      confidence: Math.round(sorted[0][1] * 100),
      probabilities,
      top: sorted.slice(0, 3).map(([label, value]) => ({ label, probability: Math.round(value * 100) }))
    };
  }

  function classifyEmail(inputText, databaseInput, settingsInput, metadata = {}, corrections = []) {
    const { database, settings } = mergeConfig(databaseInput, settingsInput);
    const text = normalizeText(inputText);
    const sender = normalizeEmail(metadata.sender || metadata.from || extractSender(inputText));
    const senderTrust = senderStatus(sender, settings);

    const highRiskHits = countMatches(text, database.highRisk);
    const scamHits = countMatches(text, database.scam);
    const attachmentHits = countMatches(text, database.attachmentRisk);
    const spamHits = countMatches(text, database.spam);
    const promoHits = countMatches(text, database.promotional);
    const dealHits = countMatches(text, database.usefulDeals);
    const safeHits = countMatches(text, database.safeBusiness);
    const unsubscribeHits = countMatches(text, database.unsubscribeSignals);
    const customBadHits = countMatches(text, database.customBad);
    const customGoodHits = countMatches(text, database.customGood);
    const customDealHits = countMatches(text, database.customDeal);
    const linkInfo = analyzeLinks(inputText);
    const moneySignals = extractMoneySignals(inputText);

    const model = trainNaiveBayes(corrections);
    const ml = classifyNaiveBayes(`${metadata.subject || ""} ${sender} ${inputText}`, model);

    let riskScore = 0;
    riskScore += highRiskHits.length * 5;
    riskScore += scamHits.length * 4;
    riskScore += attachmentHits.length * 4;
    riskScore += spamHits.length * 2;
    riskScore += customBadHits.length * 5;
    riskScore += linkInfo.suspiciousLinks.length * 4;

    if (text.includes("urgent") && (text.includes("password") || text.includes("payment") || text.includes("account"))) riskScore += 4;
    if (text.includes("click") && (text.includes("verify") || text.includes("login") || text.includes("restore"))) riskScore += 4;

    if (ml.label === "High Risk" && ml.confidence >= 45) riskScore += settings.highRiskMlBoost;
    if (ml.label === "Medium Risk" && ml.confidence >= 45) riskScore += 3;
    if (ml.label === "Spam" && ml.confidence >= 45) riskScore += 1;

    if (senderTrust === "blocked") riskScore += 10;
    if (senderTrust === "trusted" && riskScore < settings.highRiskThreshold) riskScore = Math.max(0, riskScore - 4);
    if (safeHits.length > 0 && riskScore < settings.mediumRiskThreshold) riskScore = Math.max(0, riskScore - 2);
    if (customGoodHits.length > 0 && riskScore < settings.highRiskThreshold) riskScore = Math.max(0, riskScore - customGoodHits.length * 2);

    const spamScore = spamHits.length * 2 + customBadHits.length * 2 + (ml.label === "Spam" ? 2 : 0);
    const promoScore = promoHits.length * 2 + unsubscribeHits.length + (ml.label === "Promotional" ? 2 : 0);
    const dealScore = dealHits.length * 3 + customDealHits.length * 4 + moneySignals.length + (ml.label === "Useful Deal" ? 3 : 0);
    const transactionalScore = safeHits.length * 2 + customGoodHits.length * 2 + (ml.label === "Transactional" ? 2 : 0);

    let label = "Normal";
    let category = "General";
    let explanation = "No major risk, spam, promotion, or useful deal signals were found.";

    if (riskScore >= settings.highRiskThreshold) {
      label = "High Risk";
      category = "Phishing / Scam Risk";
      explanation = "This email has phishing, scam, suspicious link, attachment, urgency, machine-learning, or blocked-sender signals.";
    } else if (riskScore >= settings.mediumRiskThreshold) {
      label = "Medium Risk";
      category = "Needs Review";
      explanation = "This email has suspicious wording or link patterns and should be reviewed before clicking anything.";
    } else if (spamScore >= settings.spamThreshold && promoScore < 2) {
      label = "Spam";
      category = "Likely Spam";
      explanation = "This email contains spam-like wording but does not clearly look like a useful deal or normal transaction.";
    } else if (dealScore >= settings.usefulDealThreshold && promoScore >= 1) {
      label = "Useful Deal";
      category = "Promotional Deal";
      explanation = "This appears promotional, but it has useful deal signals like coupons, price drops, savings, cashback, or free shipping.";
    } else if (promoScore >= settings.promotionalThreshold) {
      label = "Promotional";
      category = "Marketing / Promo";
      explanation = "This looks like a marketing, newsletter, sale, or promotional email.";
    } else if (transactionalScore >= 2) {
      label = "Transactional";
      category = "Business / Receipt / Account Notice";
      explanation = "This looks like a normal transactional or business email.";
    } else if (ml.confidence >= 70 && ["Normal", "Transactional"].includes(ml.label)) {
      label = ml.label;
      category = ml.label === "Normal" ? "General" : "Business / Receipt / Account Notice";
      explanation = "The lightweight local ML model classified this as low risk.";
    }

    const confidence = Math.min(
      99,
      42 +
      highRiskHits.length * 9 +
      scamHits.length * 7 +
      attachmentHits.length * 7 +
      customBadHits.length * 8 +
      spamHits.length * 4 +
      promoHits.length * 3 +
      dealHits.length * 5 +
      customDealHits.length * 6 +
      safeHits.length * 4 +
      linkInfo.suspiciousLinks.length * 8 +
      Math.round(ml.confidence * settings.mlWeight) +
      (senderTrust === "trusted" || senderTrust === "blocked" ? 8 : 0)
    );

    const nextActions = [];
    if (label === "High Risk") {
      nextActions.push("Do not click links or open attachments.");
      nextActions.push("Verify the sender using a separate trusted site or app.");
      nextActions.push("Report, block, or delete if the sender is unknown.");
    } else if (label === "Medium Risk") {
      nextActions.push("Check the sender address and hover over links before clicking.");
      nextActions.push("Avoid logging in through links inside the email.");
    } else if (label === "Spam") {
      nextActions.push("Delete or mark as spam if the sender is not useful.");
    } else if (label === "Useful Deal") {
      nextActions.push("Check the deal on the official website before buying.");
      nextActions.push("Keep if the coupon, shipping offer, or price drop is useful.");
    } else if (label === "Promotional") {
      nextActions.push("Archive, delete, or use unsubscribe preview if you no longer want these emails.");
    } else if (label === "Transactional") {
      nextActions.push("No action needed unless the sender address looks wrong.");
    } else {
      nextActions.push("No action needed unless the sender looks unfamiliar.");
    }

    return {
      label,
      category,
      riskScore,
      spamScore,
      promoScore,
      dealScore,
      transactionalScore,
      confidence,
      sender,
      senderTrust,
      explanation,
      length: text.length,
      links: linkInfo.links,
      unsubscribeLinks: linkInfo.unsubscribeLinks,
      ml,
      matched: {
        highRisk: highRiskHits,
        scam: scamHits,
        attachmentRisk: attachmentHits,
        spam: spamHits,
        promotional: promoHits,
        usefulDeals: dealHits,
        safeBusiness: safeHits,
        unsubscribeSignals: unsubscribeHits,
        customBad: customBadHits,
        customGood: customGoodHits,
        customDeal: customDealHits,
        suspiciousLinks: linkInfo.suspiciousLinks,
        moneySignals
      },
      nextActions
    };
  }

  function classifyMany(items, database, settings, corrections) {
    return (items || []).map((item, index) => {
      const text = [item.subject, item.from, item.snippet, item.text].filter(Boolean).join("\n");
      return {
        index,
        id: item.id || String(index),
        subject: item.subject || "",
        from: item.from || "",
        snippet: item.snippet || item.text || "",
        result: classifyEmail(text, database, settings, item, corrections)
      };
    });
  }

  function getSearchDepthCount(mode, manualCount) {
    if (Number(manualCount) > 0) return Number(manualCount);
    if (mode === "light") return 35;
    if (mode === "deep") return 200;
    return 100;
  }

  function labelToKey(label) {
    const map = {
      "High Risk": "highRisk",
      "Medium Risk": "mediumRisk",
      "Spam": "spam",
      "Promotional": "promotional",
      "Useful Deal": "usefulDeal",
      "Transactional": "transactional",
      "Normal": "normal"
    };
    return map[label] || "normal";
  }

  function gmailLabelName(label) {
    return `Inbox Avenger/${label}`;
  }

  root.InboxAvengerClassifier = {
    LABELS,
    DEFAULT_DATABASE,
    DEFAULT_SETTINGS,
    TRAINING_EXAMPLES,
    DEMO_EMAILS,
    normalizeText,
    normalizeEmail,
    tokenize,
    mergeConfig,
    classifyEmail,
    classifyMany,
    trainNaiveBayes,
    classifyNaiveBayes,
    extractLinks,
    analyzeLinks,
    extractSender,
    getSearchDepthCount,
    labelToKey,
    gmailLabelName
  };
})();
