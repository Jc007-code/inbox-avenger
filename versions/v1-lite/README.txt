# Inbox Avenger Lite

A simple Chrome extension prototype for Gmail that:
- scans visible Gmail inbox rows
- adds badges like HIGH RISK, LOW PRIORITY, PROMO, or NORMAL
- reorders visible rows based on a simple rule-based score

## Files
- manifest.json
- content.js
- styles.css

## How to install in Chrome
1. Download and unzip the project folder.
2. Open Chrome.
3. Go to `chrome://extensions`
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the unzipped `inbox-avenger-lite` folder.
7. Open Gmail and click **Scan with Inbox Avenger**.

## Notes
This is a prototype that works by reading the Gmail page structure in your browser.
It does not connect to the Gmail API and does not permanently relabel messages.
