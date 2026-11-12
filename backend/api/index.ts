// ============================================================
// CampusSarthi — Vercel Serverless Express Entrypoint
// ============================================================

import 'dotenv/config';
import { createApp } from '../src/app';

const app = createApp();

export default app;

