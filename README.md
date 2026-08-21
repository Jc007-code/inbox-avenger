# Inbox Avenger

Inbox Avenger is a Chrome Manifest V3 extension that helps people identify suspicious, unwanted, promotional, transactional, and useful email. It combines transparent rule-based scoring with a small local Naive Bayes classifier and includes a demo mode that works without account access.

> This repository contains a working educational prototype. It supports safer review, but it is not a replacement for professional email security controls or careful human judgment.

## Highlights

- Rule-based and lightweight local machine-learning classification
- High Risk, Medium Risk, Spam, Promotional, Useful Deal, Transactional, and Normal categories
- Paste-in email analysis and an immediately usable demo scanner
- Conservative badges for Gmail rows currently visible in the browser
- Optional Gmail API scanning across multiple pages
- Scheduled scans using Chrome alarms
- Scan history, statistics, and confidence information
- Trusted and blocked sender lists
- Editable classification terms and correction-based learning
- Optional Gmail labels and high-risk notifications
- Settings import and export

## Version history

The complete development progression—from the Version 1 Lite prototype through Versions 2, 3, 4, the API-ready Version 5 scaffold, and the final Version 5.1 build—is preserved in [`versions/`](versions/README.md).

## Documentation wiki

The [`docs/`](docs/README.md) hub connects the current implementation, Version 5 notes, complete prototype history, and original ACO 494 academic documentation. The academic archive preserves the team project paper and final presentation with attribution to Jonathan Cagle, Benjamin Marshall, and Jordan Wishom.

## Privacy and permissions

Demo Mode and pasted-email analysis run inside the extension. Settings, history, corrections, and classifier data are stored with `chrome.storage.local` on the device.

Gmail API Mode is optional and requires the user to configure their own Google OAuth client. It requests Gmail modify access so it can read messages selected by the configured search and, when explicitly enabled, apply Inbox Avenger labels. Automatic label application is off by default. OAuth tokens are obtained through Chrome Identity and are not included in this repository.

## Install for development

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose this repository folder.
6. Pin Inbox Avenger and open it from the Chrome toolbar.

Start with **Demo Scan**. You can also paste the examples from [`test-emails.txt`](test-emails.txt) into the Analyze view.

## Optional Gmail API setup

True background Gmail scanning requires a Google Cloud OAuth client for a Chrome extension:

1. Load the unpacked extension once and copy its ID from `chrome://extensions`.
2. Create a Google Cloud OAuth client for a Chrome Extension using that ID.
3. Replace the placeholder `client_id` in [`manifest.json`](manifest.json) with your own client ID.
4. Reload the extension.
5. Select **Authorize Gmail API** in the popup.
6. Open Settings, switch to **Gmail API Mode**, and run an active scan.

Never commit a production credential, exported extension settings, scan history, or real email content.

## Project structure

- `classifier.js` — rules, local Naive Bayes model, scoring, and demo data
- `background.js` — service worker, scheduled scans, history, and notifications
- `gmailApi.js` — Gmail API requests, parsing, pagination, and labels
- `contentScript.js` / `contentStyle.css` — visible Gmail-row analysis and badges
- `popup.*` — analysis, scans, results, history, and status interface
- `options.*` — settings, word database, sender lists, and import/export
- `manifest.json` — Chrome Manifest V3 configuration
- `docs/` — project wiki and academic documentation

## Known limits

- Gmail API Mode requires user-supplied OAuth configuration.
- Without OAuth, Gmail analysis is limited to rendered rows plus pasted or demo messages.
- Manifest V3 service workers sleep when idle; recurring work is scheduled with `chrome.alarms`.
- Classifier results are advisory and can include false positives or false negatives.

See [`VERSION_NOTES.md`](VERSION_NOTES.md) for the Version 5.1 prototype notes.
