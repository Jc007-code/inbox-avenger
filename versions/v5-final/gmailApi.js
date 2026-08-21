/*
Inbox Avenger V5 Final - Gmail API helper.
This only works after the user configures a real OAuth client_id in manifest.json.
*/

(function () {
  const root = typeof self !== "undefined" ? self : window;
  const GMAIL_BASE = "https://www.googleapis.com/gmail/v1/users/me";

  async function request(token, path, options = {}) {
    const response = await fetch(`${GMAIL_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gmail API ${response.status}: ${text.slice(0, 300)}`);
    }

    if (response.status === 204) return {};
    return response.json();
  }

  async function listMessages(token, query, maxResults, pageToken) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("maxResults", String(maxResults || 25));
    if (pageToken) params.set("pageToken", pageToken);

    return request(token, `/messages?${params.toString()}`);
  }

  async function getMessage(token, id) {
    return request(token, `/messages/${id}?format=full`);
  }

  function decodeBase64Url(data) {
    if (!data) return "";
    try {
      const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
      return decodeURIComponent(
        atob(padded)
          .split("")
          .map(char => "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
    } catch (error) {
      try {
        return atob(data.replace(/-/g, "+").replace(/_/g, "/"));
      } catch {
        return "";
      }
    }
  }

  function flattenParts(payload, output = []) {
    if (!payload) return output;
    output.push(payload);
    for (const part of payload.parts || []) flattenParts(part, output);
    return output;
  }

  function parseMessage(message) {
    const headers = message.payload?.headers || [];
    const header = name => {
      const found = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return found ? found.value : "";
    };

    const parts = flattenParts(message.payload);
    const bodyText = parts
      .map(part => decodeBase64Url(part.body?.data || ""))
      .filter(Boolean)
      .join("\n\n");

    return {
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds || [],
      from: header("From"),
      to: header("To"),
      subject: header("Subject"),
      date: header("Date"),
      snippet: message.snippet || "",
      text: bodyText || message.snippet || ""
    };
  }

  async function listLabels(token) {
    const data = await request(token, "/labels");
    return data.labels || [];
  }

  async function ensureLabel(token, name, cache) {
    if (cache[name]) return cache[name];

    const labels = await listLabels(token);
    const found = labels.find(label => label.name === name);
    if (found) {
      cache[name] = found.id;
      return found.id;
    }

    const created = await request(token, "/labels", {
      method: "POST",
      body: JSON.stringify({
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show"
      })
    });

    cache[name] = created.id;
    return created.id;
  }

  async function applyLabel(token, messageId, labelId) {
    return request(token, `/messages/${messageId}/modify`, {
      method: "POST",
      body: JSON.stringify({
        addLabelIds: [labelId],
        removeLabelIds: []
      })
    });
  }

  root.InboxAvengerGmailApi = {
    request,
    listMessages,
    getMessage,
    parseMessage,
    listLabels,
    ensureLabel,
    applyLabel
  };
})();
