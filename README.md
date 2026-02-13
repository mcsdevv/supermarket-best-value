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

## Privacy

This extension runs entirely in your browser. It makes no network requests, collects no data, and requires no special permissions beyond access to the supported supermarket pages.
