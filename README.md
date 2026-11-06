# Plastic Waste Dashboard

Public Vercel dashboard for injection-molding production waste. The dashboard reads the public `WasteRecord`, `Part`, and `Part.Materials` tabs. PO numbers, remarks, and machine numbers are excluded from its output.

## Features

- Production quality overview with date and part search filters
- Waste record table with text search, date filters, scrolling, and detail cards
- Part details with defect charts
- Estimated material waste by material in kilograms

## Material estimate

Estimated material waste is calculated as `(part weight + runner weight) × NG quantity`, distributed by each part's material ratios. Duplicate part/material rows are combined and the ratios are normalized for the estimate. The chart is an estimate and does not include the `Loss (%)` field. Parts without a valid part/material mapping are omitted from the material chart.

## Run locally

Use the Vercel CLI from this directory:

```sh
vercel dev
```

The Google Sheet must remain viewable by anyone with the link for the API route to refresh data. Results are cached at the edge for five minutes.

## Deploy

The `main` branch is connected to the Vercel project for automatic production deployments.
