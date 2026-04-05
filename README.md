# Plotimg

Plotimg is a split frontend/backend web app for turning uploaded portraits into plotter-friendly SVG artwork using a sine-wave drawing workflow inspired by PolarSketcher-style sin drawers.

## Architecture

- `frontend`
  - Next.js App Router frontend for Vercel.
  - Handles upload UX, starter-image selection, parameter controls, preview rendering, magnifier, checkout UI, and immediate download flow.
- `backend`
  - Fastify backend for Railway.
  - Handles uploads, preview jobs, SVG generation, coupon validation, Polar checkout creation, signed downloads, SMTP email delivery, and webhook reconciliation.

## Local development

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the env examples:

   ```bash
   cp frontend/.env.example frontend/.env.local
   cp backend/.env.example backend/.env
   ```

3. Start both apps:

   ```bash
   pnpm dev
   ```

4. Open the frontend at `http://localhost:3000`.

## Required environment variables

### Frontend (`frontend/.env.local`)

- `NEXT_PUBLIC_API_BASE_URL`

### Backend (`backend/.env`)

- `PORT`
- `FRONTEND_ORIGIN`
- `FRONTEND_ORIGIN_REGEX`
- `PUBLIC_APP_URL`
- `PUBLIC_API_URL`
- `STORAGE_DIR`
- `DOWNLOAD_TOKEN_SECRET`
- `POLAR_ACCESS_TOKEN`
- `POLAR_SERVER`
- `POLAR_PRODUCT_ID_USD`
- `POLAR_PRODUCT_ID_ILS`
- `POLAR_WEBHOOK_SECRET`
- `POLAR_ALLOW_DISCOUNT_CODES`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_SECURE`
- `EMAIL_FROM`
- `COUPON_CODE_CONFIG_JSON`

## Deployment

### Vercel frontend

- Import the repo into Vercel.
- Set the project root to `frontend`.
- Add `NEXT_PUBLIC_API_BASE_URL` pointing at the Railway backend URL.

### Railway backend

- Create a Railway service using `backend` as the service root.
- Railway can build directly from the included `backend/Dockerfile`.
- Mount persistent storage and point `STORAGE_DIR` at that mounted path.
- Set the exact production frontend URL in `FRONTEND_ORIGIN`.
- Add `FRONTEND_ORIGIN_REGEX` for Vercel preview deploys, for example `^https://plotimg-.*\\.vercel\\.app$`.
- Set the public URLs, Polar credentials, SMTP credentials, and webhook secret.
- Configure the Polar webhook to hit:

  ```text
  https://your-railway-app.example.com/webhooks/polar
  ```

## Verification

- `pnpm --filter @plotimg/backend lint`
- `pnpm --filter @plotimg/frontend lint`
- `pnpm build`

The backend was also smoke-tested locally through the FREE coupon flow:

- upload sample portrait
- queue preview job
- poll completed preview
- generate final SVG through coupon bypass
- fetch the signed download URL successfully
