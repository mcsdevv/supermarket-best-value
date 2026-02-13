# Privacy Policy — Supermarket Value Sort

**Last updated:** February 2026

## Data Collection

Supermarket Value Sort does **not** collect, transmit, or store any personal data. The extension:

- Makes **zero network requests** — no analytics, no tracking, no telemetry
- Does **not** access browsing history, cookies, or any data outside its matched supermarket pages
- Does **not** communicate with any external servers

## Local Storage

The extension stores a single preference — whether to automatically sort by value on page load — using `chrome.storage.local`. This data:

- Never leaves your device
- Is not shared with any third party
- Can be cleared at any time by uninstalling the extension

## Permissions

The extension requests only the `storage` permission, used solely for the auto-sort preference described above. It has no access to your tabs, browsing activity, or any other browser data.

## Content Scripts

The extension runs content scripts on the following supermarket websites only:

- tesco.com/groceries
- sainsburys.co.uk/gol-ui/groceries
- waitrose.com/ecom/shop/browse/groceries

These scripts read product pricing information displayed on the page to sort products by unit price. No data is extracted, saved, or transmitted.

## Changes

If this policy changes, the update will be published here alongside a new version of the extension.

## Contact

For questions about this privacy policy, open an issue on the [GitHub repository](https://github.com/mcsdevv/supermarket-value-sort).
