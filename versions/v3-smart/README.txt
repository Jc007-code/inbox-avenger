Inbox Avenger Smart Prototype v3

What this version adds
- Separate categories for High Risk, Medium Risk, Deal, Promo, Newsletter, and Normal
- Deeper inbox scanning using multiple scroll passes
- Whole-message analysis when an email thread is open in Gmail
- Local cache of scanned messages
- Search and category filtering inside the popup
- Subscription Center view that shows:
  - what the email is
  - who it is from
  - what category it fell into
  - captured unsubscribe links if found in the open email body
- Buttons that open unsubscribe URLs or mailto unsubscribe actions

What it can do right now
- Scan visible inbox rows
- Scan the currently open email as a whole
- Distinguish concrete deals from more general promo/newsletter mail using separate rule sets
- Store results locally in Chrome extension storage
- Show likely subscription or spam-like mail in one place

Important limitations
- This version still works from the Gmail webpage DOM, not the Gmail API
- "Actual unsubscribe" means it can open the sender-provided unsubscribe link or mailto action that it finds
- It cannot guarantee every sender supports a reliable unsubscribe path
- It cannot truly apply Gmail labels or scan the entire mailbox history without Gmail API OAuth
- Gmail DOM structure can change, so selectors may need adjustment later

How to use
1. Unzip the folder
2. Go to chrome://extensions
3. Turn on Developer mode
4. Click Load unpacked
5. Select this folder
6. Open Gmail
7. Use the popup or floating toolbar:
   - Scan Inbox
   - Scan Open Email
   - Full Scan
8. In the popup, open the Subscriptions tab to view unsubscribe candidates

Files included
- manifest.json
- content.js
- styles.css
- popup.html
- popup.js
- popup.css
- README.txt

Best next upgrade
For real Gmail labels, full-mailbox scanning, and header-based unsubscribe discovery, move this prototype to Gmail API + OAuth.
