# Inbox Avenger Version 5 Final Notes

## Main Goal

This version is designed to be the most complete Version 5 prototype:

- retained predecessor features
- cleaner code structure
- lightweight machine learning
- background scheduled scanning
- multi-page Gmail API architecture
- fallback visible Gmail scanning
- demo-ready operation without OAuth

## Retained Features

- Chrome extension interface
- Gmail row badges
- search depth controls
- risk categories
- spam categories
- promotional categories
- useful deal categories
- settings page
- scan history
- correction learning
- word database
- trusted senders
- blocked senders
- customization

## New Final V5 Features

- Local Naive Bayes ML classifier
- ML confidence display
- combined rules + ML scoring
- scheduled background scanner
- Gmail API multi-page scan path
- optional Gmail label application
- high-risk notifications
- dashboard stats
- demo mode for reliable presentation
- cleaner service worker design

## Known Limits

- True background Gmail scanning requires OAuth setup.
- Without OAuth, Chrome can only scan visible Gmail page content plus demo emails.
- MV3 service workers cannot remain awake permanently; scheduled alarms are the correct replacement.
- Gmail API label application is off by default for safety.
