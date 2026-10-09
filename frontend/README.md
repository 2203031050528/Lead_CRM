# Lead CRM — frontend

Next.js (App Router) + TypeScript + Tailwind, built as a **static export**.

```bash
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3000, proxies /api → Django on :8000
npm run lint && npx tsc --noEmit
npm run build        # production: writes static files to out/ (served by Nginx)
```

- No dynamic routes: detail pages use query params (`/leads/detail?id=42`).
- All API calls go through `src/lib/api/client.ts` (CSRF + redirect to login).
