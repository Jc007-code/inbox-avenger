Inbox Avenger Adaptive Prototype

What changed in this version:
- Added a floating settings panel
- Added customizable colors for accent, high-risk, low-priority, promo, and normal messages
- Added a font-family menu
- Added scan depth so the extension tries to scan farther down the loaded Gmail inbox
- Added a larger seeded keyword database for phishing-style words, promo words, and low-priority words
- Added local adaptive learning with "Teach Risk", "Teach Promo", "Teach Low", and "Teach Normal" buttons
- Added local memory for learned tokens and sender patterns
- Added a reset-learning button

Important notes:
- This is still a prototype.
- It works on the Gmail page DOM, not the Gmail API.
- Scan depth improves the amount of loaded rows examined, but it is still limited by how Gmail renders the page.
- The learning system is local heuristic memory stored in Chrome extension storage. It is not true machine-learning training.

How to install:
1. Unzip this folder.
2. Open Chrome and go to chrome://extensions
3. Turn on Developer mode
4. Click Load unpacked
5. Select the unzipped folder
6. Open Gmail
7. Use the Inbox Avenger box in the bottom-right corner

Files:
- manifest.json
- content.js
- styles.css
- README.txt
