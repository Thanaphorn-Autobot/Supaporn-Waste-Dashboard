# Plastic Waste Dashboard

Public Vercel dashboard for injection-molding production waste. The page reads the public `WasteRecord` tab and only returns production date, part identifiers/names, produced quantity, NG quantity, and defect counts. PO numbers, remarks, and machine numbers are excluded.

## Run locally

Use the Vercel CLI from this directory:

```sh
vercel dev
```

The Google Sheet must remain viewable by anyone with the link for the API route to refresh data. Results are cached at the edge for five minutes.

## Deploy

Connect this repository to a Vercel project and deploy the `main` branch to production. The Vercel site can be public.

## Data note

Material composition is not included in the dashboard yet. The source `Part.Materials` tab currently contains repeated PartID/MaterialID pairs and ratios that do not total 1 for some parts, so joining it would overstate material quantities.

