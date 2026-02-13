# Supermarket Value Sort

[![Tests](https://github.com/mcsdevv/supermarket-best-value/actions/workflows/tests.yml/badge.svg)](https://github.com/mcsdevv/supermarket-best-value/actions/workflows/tests.yml)

A Chrome extension that adds a "Value (Unit Price)" sort option to UK supermarket websites. It sorts products from cheapest to most expensive per unit (per kg, per litre, per item, etc.) so you can find the best deal at a glance.

## How It Works

When you visit a [supported supermarket's](#supported-supermarkets) grocery pages, the extension:

1. Adds a "Value (Unit Price)" option to the site's existing sort dropdown
2. Automatically sorts products by unit price on page load
3. Re-sorts when you navigate between categories or load more products

The extension reads the unit price already shown on each product (e.g. "£4.34/kg") and normalises different formats so they can be compared fairly — for example, a product priced per 100g is compared correctly against one priced per kg.

Products without a unit price are moved to the bottom of the list.

## Supported Supermarkets

- [Tesco](https://www.tesco.com/groceries/)
- [Sainsbury's](https://www.sainsburys.co.uk/gol-ui/groceries/)
- [Waitrose](https://www.waitrose.com/ecom/shop/)

> **Note:** Morrisons, Ocado, and Asda already offer unit price sorting on their websites, so this extension is not needed for those stores.

## Known Limitations

- **Chrome only.** This is a Manifest V3 Chrome extension. It does not work in Firefox, Safari, or other browsers. Chromium-based browsers like Edge and Brave may work but are not tested.
- **Sorts only what's on the page.** The extension reorders products already loaded in the browser. It cannot fetch additional products or sort across multiple pages of results.
- **Requires unit prices to be displayed.** If a supermarket hides unit prices for certain products or categories, those products will appear at the bottom of the sorted list.
- **May break after site redesigns.** The extension relies on each supermarket's current page structure and CSS class names. When a supermarket updates their website, the extension may stop working until it is updated to match.
- **Limited to grocery browsing pages.** The extension activates on category and browse pages. It may not work on search results, offers pages, or other non-standard layouts where the sort dropdown or product grid differs.

## Install

1. Download or clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the `dist/` folder

## Build from Source

Requires [Bun](https://bun.sh/).

```sh
bun install
bun run build
```

The built extension files will be in `dist/`.

## Problems and Feature Requests

If something isn't working or you have an idea for an improvement, please [open an issue](https://github.com/mcsdevv/supermarket-best-value/issues/new/choose). Bug reports and feature requests both have templates to help you provide the right details.

## Privacy

This extension runs entirely in your browser. It makes no network requests, collects no data, and requires no special permissions beyond access to the supported supermarket pages.
