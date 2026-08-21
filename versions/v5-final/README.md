# Inbox Avenger - Version 5 Final

This is the cleaned-up final Version 5 prototype.

It includes:

- Rule-based email classification
- A small local machine-learning model using Naive Bayes
- Manual pasted-email analysis
- Demo scanner that works immediately
- Scheduled background scanner using Chrome alarms
- Gmail API scanning path for real multi-page background inbox scanning
- Visible Gmail row scanner fallback
- Scan history
- Risk, spam, promotional, useful deal, transactional, and normal categories
- Trusted sender list
- Blocked sender list
- Editable word database
- Correction learning workflow
- Optional Gmail label application
- High-risk notifications
- Import/export settings

## Important Reality

Chrome Manifest V3 service workers cannot stay awake forever. They wake up when needed, run, then sleep. This version uses `chrome.alarms` so the scanner wakes up on a schedule.

## What Works Immediately

The extension works immediately in **Demo Mode**.

Demo Mode is useful for class presentation because it proves:

- the classifier works
- the lightweight ML model works
- the background service worker works
- scan history works
- statistics work
- labels/categories work
- correction learning works

## What Requires OAuth Setup

True Gmail background scanning beyond what is visible on screen requires Gmail API access.

To enable that:

1. Load the extension unpacked once.
2. Go to `chrome://extensions`.
3. Copy the extension ID.
4. Create a Google Cloud OAuth Client for a Chrome Extension.
5. Use the copied extension ID.
6. Copy the generated OAuth client ID.
7. Open `manifest.json`.
8. Replace this placeholder:

```json
"000000000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apps.googleusercontent.com"
```

with your real OAuth client ID.

9. Reload the extension.
10. Open the extension popup.
11. Click **Authorize Gmail API**.
12. Open Settings and switch Mode from **Demo Mode** to **Gmail API Mode**.
13. Click **Run Active Scan**.

## Installation

1. Unzip `InboxAvenger_V5_Final_Foolproof.zip`.
2. Open Chrome.
3. Go to `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the unzipped `InboxAvenger_V5_Final_Foolproof` folder.
7. Pin the extension.
8. Click the extension icon.

## Best Testing Order

1. Run **Demo Scan**.
2. Paste a test email into **Analyze**.
3. Try the correction/learning feature.
4. Open Settings and review the word database.
5. Open Gmail and click **Scan Visible Gmail Rows**.
6. Configure OAuth only if you need real Gmail API scanning.

## Why Gmail API Mode Matters

The visible Gmail row scanner can only see what Gmail has rendered on the page. Gmail API Mode can scan multiple pages of emails in the background, using:

- Gmail search query
- max pages per scan
- max messages per page
- scheduled Chrome alarms

## Safe Defaults

By default:

- Demo Mode is on
- Gmail labels are not automatically applied
- background scanning is on for demo scans
- high-risk notifications are on
- visible Gmail badge scanning is conservative

## Files

- `manifest.json`
- `classifier.js`
- `gmailApi.js`
- `background.js`
- `contentScript.js`
- `contentStyle.css`
- `popup.html`
- `popup.css`
- `popup.js`
- `options.html`
- `options.css`
- `options.js`
- `test-emails.txt`
- `VERSION_NOTES.md`

## Academic Documentation

The original ACO 494 project paper and final status presentation are preserved in the repository’s [academic documentation archive](../../docs/academic/README.md). They document the team’s development process and the progression that led to this final Version 5 prototype.
