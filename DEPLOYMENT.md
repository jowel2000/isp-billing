# ISP Billing — Deployment Summary

Smart ISP billing software — deployed fully on free cloud services (no VPS, no local server required).

## Live services

| Service | Provider | URL |
|---|---|---|
| Web (Next.js) | Vercel | https://isp-billing-rose.vercel.app |
| API (NestJS) | Render | https://isp-billing-api-genx.onrender.com |
| Database (PostgreSQL) | Neon | `neondb` (connection string is in `.env`, never commit it) |

Health check: `https://isp-billing-api-genx.onrender.com/api/v1/health`

## Login

- **Login ID:** `superadmin`
- **Password:** `ChangeMe123!`

> ⚠️ Change the password immediately after the first login.

## Code update workflow (most common)

When you change any code (features, bug fixes, UI):

```powershell
cd "D:\LISP PROJECT\isp-billing"
git add .
git commit -m "short description of the change"
git push
```

After `git push`, both services redeploy automatically:

- **Vercel** deploys the web app (~1–2 min)
- **Render** deploys the API (~2–4 min)

Check the deployment status:

- Vercel → Dashboard → Project → **Deployments** → status **Ready** (green)
- Render → Dashboard → **isp-billing-api** → **Events / Logs** → "Deploy finished successfully"

## Database (Prisma) changes

If you edit `packages/db/prisma/schema.prisma` (new fields/tables):

```powershell
npm run db:push      # syncs schema to Neon (uses .env DATABASE_URL)
git add .
git commit -m "update db schema"
git push
```

> Run `db:push` **before** pushing, so the database matches the new code.

## ⚙️ Environment variables

These are **secrets** — stored in `.env` locally and in the cloud dashboards.
They are **never** committed to GitHub (`.gitignore` handles this).

### Vercel (Web)
`NEXT_PUBLIC_API_URL` = `https://isp-billing-api-genx.onrender.com/api/v1`

> ⚠️ After changing it in Vercel → Settings → Environment Variables, you must **Redeploy** (Deployments → "..." → Redeploy).

### Render (API)
- `DATABASE_URL` — Neon PostgreSQL connection string
- `CORS_ORIGIN` = `https://isp-billing-rose.vercel.app`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `SETTINGS_KEY` — used for AES encryption of SMS API keys
- `SMS_FORWARD_SECRET`

> ⚠️ After changing Render environment variables, do **Manual Deploy → Clear build cache & deploy**.

## Important reminders

1. **Never commit `.env` files** — they contain database passwords and JWT secrets.
2. **Render free tier** spins down after ~15 minutes of inactivity → first request can take 30–60 seconds.
   - Fix: **UptimeRobot** free monitor pinging `https://isp-billing-api-genx.onrender.com/api/v1/health` every 5 minutes.
3. **Change the default superadmin password** after the first login.
4. **No local server needed** — your PC can be off; the site runs entirely in the cloud.

## Git quick reference

| Situation | Command / action |
|---|---|
| Code/feature change | `git add .` → `git commit -m "..."` → `git push` |
| DB schema change | `npm run db:push` first, then the 3 git commands |
| Secret / URL changed | Update in Vercel or Render dashboard, then **Redeploy / Manual Deploy** |
| See what changed | `git status` |
| Undo last commit (before push) | `git revert HEAD` |

## Backup note

The database lives on Neon (free tier). For production use, consider exporting a backup periodically from the Neon dashboard and storing it somewhere safe.
