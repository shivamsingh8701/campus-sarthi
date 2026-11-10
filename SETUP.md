# CampusSarthi — Environment Setup Guide

## Required API Keys & Services

### 1. Supabase (PostgreSQL database)

1. Go to https://supabase.com and create a new project
2. In Settings → API, copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`
3. In SQL Editor, run the contents of `supabase/migrations/001_initial_schema.sql`

### 2. Google Gemini API

1. Go to https://aistudio.google.com/app/apikey
2. Create an API key
3. Set `GEMINI_API_KEY=your-key`

### 3. OpenAI API

1. Go to https://platform.openai.com/api-keys
2. Create an API key
3. Set `OPENAI_API_KEY=your-key`

### 4. Email Configuration

#### Option A: Gmail App Password (Simplest)
1. Enable 2FA on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Create an app password for "Mail"
4. Set:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your@gmail.com
   SMTP_PASS=xxxx-xxxx-xxxx-xxxx  (the 16-char app password)
   ```

#### Option B: Gmail OAuth2 (More Secure)
1. Go to https://console.cloud.google.com
2. Create a project, enable Gmail API
3. Create OAuth2 credentials (Desktop app type)
4. Use OAuth playground to get refresh token for your email
5. Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

### 5. Security Keys (Generate Locally)

Generate `JWT_SECRET` (min 32 chars):
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Generate `ENCRYPTION_KEY` (exactly 32 bytes = 64 hex chars):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Generate `COOKIE_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Backend .env Template

```env
NODE_ENV=development
PORT=3001
JWT_SECRET=<generated-min-64-hex-chars>
JWT_EXPIRY=7d
COOKIE_SECRET=<generated-64-hex-chars>

SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

GEMINI_API_KEY=AIza...
OPENAI_API_KEY=sk-...

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx

ENCRYPTION_KEY=<64-hex-chars>
FRONTEND_URL=http://localhost:5173
LMS_BASE_URL=https://gulms.galgotiasuniversity.org
LMS_LOGIN_URL=https://gulms.galgotiasuniversity.org/login/index.php
SYNC_INTERVAL_MINUTES=60
```

## Playwright Chromium Setup

After installing dependencies, run:
```bash
cd backend
npx playwright install chromium
```

This downloads ~150MB Chromium binary — required for LMS automation.

## First Run Checklist

- [ ] Supabase project created + SQL migration run
- [ ] `backend/.env` file created with all required keys
- [ ] `npx playwright install chromium` completed in backend/
- [ ] Backend started: `cd backend && npm run dev`
- [ ] Frontend started: `cd frontend && npm run dev`
- [ ] Open http://localhost:5173
- [ ] Register with your admission number and email
- [ ] Verify email (check inbox)
- [ ] Connect LMS account in Settings
- [ ] Trigger manual sync

