(() => {
  const BUTTON_ID = "ia-scan-button";
  const PANEL_ID = "ia-summary-panel";

  const SORT_WEIGHT = {
    "high-risk": 3,
    "normal": 2,
    "low-priority": 1,
    "promo": 0
  };

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
        if (seen.has(row)) return;
        if (!row.querySelector("td")) return;
        seen.add(row);
        rows.push(row);
      });
    });

    return rows;
  }

  function scoreEmail(text) {
    const lower = text.toLowerCase();

    let risk = 0;
    let promo = 0;
    const reasons = [];

    const riskChecks = [
      {
        regex: /\burgent\b|\bimmediately\b|\basap\b|\bfinal notice\b|\bsuspended\b/,
        points: 2,
        reason: "urgent language"
      },
      {
        regex: /\bverify\b|\blogin\b|\bpassword\b|\bsecurity alert\b|\bconfirm\b/,
        points: 2,
        reason: "account/security language"
      },
      {
        regex: /\binvoice\b|\bpayment\b|\bbank\b|\bwire\b|\bgift card\b/,
        points: 2,
        reason: "financial pressure wording"
      },
      {
        regex: /bit\.ly|tinyurl|t\.co|rb\.gy/,
        points: 2,
        reason: "shortened link pattern"
      },
      {
        regex: /\bno-reply\b|\bnoreply\b|\bmailer-daemon\b/,
        points: 1,
        reason: "automated sender pattern"
      }
    ];

    const promoChecks = [
      {
        regex: /\bunsubscribe\b|\bnewsletter\b|\bpromotions?\b/,
        points: 2,
        reason: "newsletter/promo pattern"
      },
      {
        regex: /\bsale\b|\bdeal\b|\bcoupon\b|\boffer\b|\bdiscount\b|\bclearance\b/,
        points: 2,
        reason: "deal/marketing language"
      },
      {
        regex: /\blimited time\b|\bshop now\b|\bbuy now\b|\bends tonight\b/,
        points: 2,
        reason: "marketing urgency"
      }
    ];

    for (const check of riskChecks) {
      if (check.regex.test(lower)) {
        risk += check.points;
        reasons.push(check.reason);
      }
    }

    for (const check of promoChecks) {
      if (check.regex.test(lower)) {
        promo += check.points;
        reasons.push(check.reason);
      }
    }

    let category = "normal";

    if (risk >= 4) {
      category = "high-risk";
    } else if (promo >= 4) {
      category = "promo";
    } else if (risk >= 2 || promo >= 2) {
      category = "low-priority";
    }

    return {
      risk,
      promo,
      category,
      reasons: [...new Set(reasons)]
    };
  }

  function removeOldBadges(row) {
    row.querySelectorAll(".ia-badge").forEach((el) => el.remove());
    row.classList.remove(
      "ia-high-risk",
      "ia-normal",
      "ia-low-priority",
      "ia-promo"
    );
  }

  function addBadge(row, result) {
    const firstCell = row.querySelector("td");
    if (!firstCell) return;

    const badge = document.createElement("span");
    badge.className = `ia-badge ia-${result.category}`;
    badge.textContent =
      result.category === "high-risk"
        ? "HIGH RISK"
        : result.category === "promo"
        ? "PROMO"
        : result.category === "low-priority"
        ? "LOW PRIORITY"
        : "NORMAL";

    badge.title = result.reasons.length
      ? `Reasons: ${result.reasons.join(", ")}`
      : "No strong indicators";

    firstCell.prepend(badge);
    row.classList.add(`ia-${result.category}`);
    row.dataset.iaCategory = result.category;
    row.dataset.iaReasons = result.reasons.join(", ");
  }

  function sortRows(rows) {
    if (!rows.length) return;

    const parent = rows[0].parentElement;
    if (!parent) return;

    const sorted = [...rows].sort((a, b) => {
      const aWeight = SORT_WEIGHT[a.dataset.iaCategory || "normal"] ?? 0;
      const bWeight = SORT_WEIGHT[b.dataset.iaCategory || "normal"] ?? 0;
      return bWeight - aWeight;
    });

    sorted.forEach((row) => parent.appendChild(row));
  }

  function showSummary(counts) {
    let panel = document.getElementById(PANEL_ID);

    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      document.body.appendChild(panel);
    }

    panel.innerHTML = `
      <div><strong>Inbox Avenger Scan Complete</strong></div>
      <div>High Risk: ${counts["high-risk"] || 0}</div>
      <div>Normal: ${counts["normal"] || 0}</div>
      <div>Low Priority: ${counts["low-priority"] || 0}</div>
      <div>Promo: ${counts["promo"] || 0}</div>
    `;
  }

  function scanInbox() {
    const rows = getInboxRows();

    if (!rows.length) {
      alert("Inbox Avenger: no visible Gmail rows found yet. Open your inbox first.");
      return;
    }

    const counts = {
      "high-risk": 0,
      "normal": 0,
      "low-priority": 0,
      "promo": 0
    };

    rows.forEach((row) => {
      removeOldBadges(row);
      const result = scoreEmail(row.innerText || "");
      addBadge(row, result);
      counts[result.category] += 1;
    });

    sortRows(rows);
    showSummary(counts);
  }

  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.textContent = "Scan with Inbox Avenger";
    button.addEventListener("click", scanInbox);

    document.body.appendChild(button);
  }

  function init() {
    createButton();
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById(BUTTON_ID)) {
      createButton();
    }
  });

  init();
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
