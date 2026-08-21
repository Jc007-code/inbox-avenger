# Inbox Avenger Version 5 API-ready

This 0.5.0 snapshot is the first Gmail API-oriented architecture from the project’s original master packet. It includes mailbox indexing, search, unsubscribe review, and Gmail label scaffolding.

## Important setup note

The OAuth client ID in `manifest.json` is intentionally a placeholder. Gmail API features require your own Google Cloud OAuth client for the unpacked Chrome extension. Never commit a real credential or real email data to this archive.

## Install

1. Configure your own OAuth client ID in `manifest.json`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose this folder.

This is a historical architectural prototype. Use the repository root for the maintained Version 5.1 build.
