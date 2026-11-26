# SUPAPORN WASTE DASHBOARD

Dashboard for injection-molding production waste with authenticated access, per-section permissions, CSV export, and controlled database imports.

## Private Google Sheets connection

The dashboard uses a private Google Sheets connection so the workbook does not need to be shared publicly. Dashboard and waste-record views remain public; only System Data requires the Admin password.

1. In Google Cloud, enable the Google Sheets API and create a service account with a JSON key.
2. Share the existing `Dashboard SPP` spreadsheet with the service account email as an Editor.
3. In Google Drive, set General access to **Restricted**. The service account remains able to read and update the spreadsheet.
4. Add these environment variables in Vercel (and in a local `.env` for local use):
   - `GOOGLE_SHEETS_ID`: the spreadsheet ID.
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: service account email from the JSON key.
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: private key from the JSON key; keep it private. For Vercel, preserve the PEM header/footer and newline characters.
   - `AUTH_SECRET`: a random secret of at least 32 characters used to sign login sessions.
   - `ADMIN_PASSWORD`: set the Admin password privately in Vercel. Do not commit its value to the repository.
5. Redeploy the Vercel project after configuring the variables.

There is one Admin login and it asks for a password only. The Admin password is kept in the deployment environment and is never written to the workbook or source code.

## Access and data management

- The Dashboard, waste records, and WasteRecord CSV export are available without signing in. Sign-in is requested only when entering System Data.
- The Admin can view, import, and update the database tabs after signing in.
- The system data page supports per-tab CSV templates, a full data JSON download, tab previews, and CSV import preview with duplicate and reference checks. Replace imports require confirmation; warnings require explicit acknowledgement.
- WasteRecord export supports a date range or all records and omits column B.
- Sheets available for database management: `Part`, `Material`, `Part.Materials`, `Machine`, and `WasteRecord`.

## Run locally

Use the Vercel CLI from this directory after setting the environment variables:

```sh
vercel dev
```

## Deploy

The `main` branch is connected to the Vercel project for automatic production deployments. Configure the private Google Sheets and session variables in Vercel before deploying this version.

