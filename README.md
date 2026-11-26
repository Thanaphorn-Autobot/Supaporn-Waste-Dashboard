# SUPAPORN WASTE DASHBOARD

Dashboard for injection-molding production waste with public read-only views, one Admin password, CSV export, and controlled database imports.

## Google Sheets setup

The Dashboard reads `WasteRecord`, `Part`, and `Part.Materials` through Google Sheets' read-only published endpoint. Those data tabs must be viewable by anyone with the link. The `User` sheet is not used. The Admin password is kept in Vercel, not in the workbook or source code.

1. Set `ADMIN_PASSWORD` to `00000` in Vercel to enable the requested single-password Admin login. Keep the value out of the repository.
2. To enable CSV imports and database updates, enable the Google Sheets API, create a service account, share the spreadsheet with it as an Editor, and set `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` in Vercel. These two settings are only needed for write operations; dashboard reading does not need them.
3. Set `GOOGLE_SHEETS_ID` only if using a different spreadsheet.
4. Redeploy after changing environment variables.

There is one Admin login and it asks for a password only. The Admin password is kept in the deployment environment and is never written to the workbook or source code.

## Access and data management

- The Dashboard, waste records, and WasteRecord CSV export are available without signing in. Sign-in is requested only when entering System Data.
- The Admin can view, import, and update the database tabs after signing in.
- The system data page supports per-tab CSV templates, a full data JSON download, tab previews, and CSV import preview with duplicate and reference checks. Replace imports require confirmation; warnings require explicit acknowledgement.
- WasteRecord export supports a date range or all records and omits column B.
- Sheets available for database management: `Part`, `Material`, `Part.Materials`, `Machine`, and `WasteRecord`.

## Run locally

Use the Vercel CLI from this directory. `ADMIN_PASSWORD` is required for Admin sign-in; service-account credentials are needed only for database imports/updates:

```sh
vercel dev
```

## Deploy

The `main` branch is connected to the Vercel project for automatic production deployments. Set `ADMIN_PASSWORD` in Vercel before using the Admin page.

