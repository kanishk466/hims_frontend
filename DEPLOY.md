# Deploying this frontend (Vercel)

This is the frontend half only. The full three-service runbook (Neon database, Render backend,
Vercel frontend, in that order) lives in `DEPLOY.md` in the `hims-server` repo — start there, do
the backend first, then come back here for step 3.

Quick version, once the backend is live on Render:

1. Push this repo to its own GitHub repo.
2. [vercel.com](https://vercel.com) → connect GitHub → **Add New → Project** → pick this repo.
   Vercel auto-detects Vite; leave the proposed build settings as-is.
3. Before the first deploy, add an environment variable: `VITE_API_BASE_URL` =
   `https://<your-render-service>.onrender.com/api/v1`.
4. Deploy. `vercel.json` in this repo makes a hard refresh on a client-side route (e.g.
   `/opd/patients/new`) load correctly instead of 404ing.
5. Go back to the Render backend's `CORS_ORIGINS` env var and set it to the `https://....vercel.app`
   URL Vercel just gave you — without this, the frontend loads but every API call fails with a
   CORS error.
