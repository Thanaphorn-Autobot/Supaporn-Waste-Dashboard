# SUPAPORN WASTE DASHBOARD

Dashboard for injection-molding production waste with authenticated access, per-section permissions, CSV export, and controlled database imports.

## Private Google Sheets connection

The dashboard must use a private Google Sheets connection. Do not enable “Anyone with the link” on the workbook: the `User` tab contains password hashes and access permissions.

1. In Google Cloud, enable the Google Sheets API and create a service account with a JSON key.
2. Share the existing `Dashboard SPP` spreadsheet with the service account email as an Editor.
3. In Google Drive, set General access to **Restricted**. The service account remains able to read and update the spreadsheet.
4. Add these environment variables in Vercel (and in a local `.env` for local use):
   - `GOOGLE_SHEETS_ID`: the spreadsheet ID.
   - `GOOGLE_SHEETS_PRIVATE_CONFIRMED`: set to `true` only after General access is Restricted and only the owner and service account can access the file.
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: service account email from the JSON key.
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`: private key from the JSON key; keep it private. For Vercel, preserve the PEM header/footer and newline characters.
   - `AUTH_SECRET`: a random secret of at least 32 characters used to sign login sessions.
   - `INITIAL_ADMIN_USERNAME`: `Thaanpron.p` for the first setup.
   - `INITIAL_ADMIN_PASSWORD`: set the requested one-time initial password privately in Vercel. The system hashes it and requires a password change at first login. Clear this environment variable after the `User` tab and first Admin row have been initialized.
5. Redeploy the Vercel project after configuring the variables.

The first authenticated request creates a `User` tab with columns `UserID`, `PasswordHash`, `Role`, `Permissions`, `Active`, `MustChangePassword`, and `CreatedAt`, then adds the first Admin if the tab has no accounts. Passwords are stored as salted scrypt hashes and cannot be recovered from the sheet; an Admin can reset another user's password.

## Access and data management

- The Dashboard, waste records, and WasteRecord CSV export are available without signing in. Sign-in is requested only when entering System Data.
- Admins can create users, reset passwords, enable or disable accounts, and assign view/edit access for each database tab.
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

