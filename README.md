# Tulja Bhavani Chitti App

Chitti group, member, and monthly payment management.

## Run the app and manage accounts

From the repository root, start the API in one PowerShell terminal:

```powershell
cd Backend
py -m pip install fastapi uvicorn pandas openpyxl
py -m uvicorn main:app --reload
```

Start the GUI in a second terminal:

```powershell
cd Frontend\chitti-frontend
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). The owner account is `kranthikumar0895@gmail.com`; when upgrading an existing database, the app promotes this matching account to owner on startup. Sign in using its existing password. On a new database, create the initial account with this exact username to become the owner. Usernames must be at least 3 characters and passwords at least 10 characters.

Every signed-in account can change its own password from **Change password** in the header by confirming the current password. Anyone who has forgotten a password can choose **Forgot password?** on the sign-in page, request a one-time email code, and set a new password with that code. Codes expire after 10 minutes, allow at most five attempts, and can be re-requested once per minute. A successful reset signs out all devices. Recovery email addresses are collected for new accounts; existing usernames that are email addresses are automatically used as recovery emails when the database upgrades. For an older account without a recovery email, the owner can verify the address with the account holder and set it in **Manage users**. Only the owner can create accounts; account creation is also restricted by the backend. Set `CHITTI_OWNER_USERNAME` to the exact owner login username in the backend environment. On startup, the matching account is promoted to owner; if a different username is configured, that account remains a customer.

Email-code recovery requires `CHITTI_SMTP_HOST` and `CHITTI_SMTP_FROM`; set `CHITTI_SMTP_USERNAME` and `CHITTI_SMTP_PASSWORD` together if your provider requires authentication. The default port 587 uses STARTTLS; set `CHITTI_SMTP_USE_SSL=true` for an SSL SMTP endpoint such as port 465. In Render, set these values in the backend service's Environment settings; keep the SMTP password private and use an email-provider app password where required. Until SMTP is configured, the reset endpoint reports that recovery email is unavailable.

The Dashboard, Chitti Groups, Chitti Details, and Monthly Payments pages read and update the same saved data. New groups can use any schedule from 1 to 60 months. Each group calculates its monthly value from its selected total and duration: value = total amount ÷ months; commission = 5% of value; amount = value − commission; payable = commission + amount + optional custom amount. Record the amount actually paid each month; partial payments are supported and are applied to the oldest outstanding month first. Unpaid balances carry forward and are shown separately from the current month's due. Comments are saved separately for each member and month. On upgrade, existing months marked paid are migrated as a full monthly payment. You can edit an existing group's total and duration from its details page; schedules are recalculated while saved payments are retained. Shortening a schedule is blocked if it would remove months with recorded payments or custom amounts. Member names can be edited on the group details page. Payments, comments, and custom amounts are saved in the database and included in the Excel export.

User records and password hashes are stored in `Backend/chitti_auth.db`; keep this database private and back it up securely. Sessions expire after 12 hours. The current setup is intended for local use; use HTTPS and review the authentication/storage approach before exposing the app publicly.

## Deploy for phone and web access (Render)

This repository includes a Render Blueprint for the FastAPI backend. It attaches a persistent disk at `/var/data`, so customer accounts and chitti records survive service restarts and redeploys. The backend's persistent disk and always-on service require a paid Render plan; creating these files does not deploy the app or incur charges.

1. Push this repository to a private GitHub repository and create or sign in to a Render account.
2. In Render, choose **New → Blueprint**, select the repository, and deploy `render.yaml`. The API will be created in the Singapore region with persistent SQLite storage. Record its HTTPS URL, for example `https://tulja-bhavani-chitti-api.onrender.com`.
3. In the backend service's Environment settings, set `CHITTI_ALLOWED_ORIGINS` to the exact HTTPS origin of the frontend (no path or trailing slash), then redeploy. Do not use `*`.
4. Create a Render **Static Site** from the same repository. Set its root directory to `Frontend/chitti-frontend`, build command to `npm ci && npm run build`, and publish directory to `build`. Add the build environment variable `REACT_APP_API_URL` with the API URL plus `/api`, for example `https://tulja-bhavani-chitti-api.onrender.com/api`. Add a rewrite rule from `/*` to `/index.html` with action **Rewrite** so direct links and refreshes work.
5. After the static site is created, copy its HTTPS origin into the backend's `CHITTI_ALLOWED_ORIGINS` setting and redeploy the backend. This enables browser access only from your frontend domain.
6. Open the frontend URL on Android Chrome or iPhone Safari and use the browser's **Install app** or **Add to Home Screen** option.

Keep the backend disk attached and run a single backend instance; SQLite on this disk is not configured for multiple instances. Do not replace it with ephemeral storage or commit the SQLite database to GitHub. Back up the database before making hosting or storage changes. Your existing local database is not automatically uploaded; migrate it only through a secure, deliberate backup/restore process. The first hosted account should use `kranthikumar0895@gmail.com` and your existing password only if that account's database has been securely migrated; otherwise the hosted database starts empty and you will need to create the initial owner account there.

## Available scripts

- `npm start` — run the development app at [http://localhost:3000](http://localhost:3000).
- `npm test` — run the frontend tests.
- `npm run build` — create a production build in `build`.
