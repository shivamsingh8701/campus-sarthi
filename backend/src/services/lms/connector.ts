// ============================================================
// CampusPilot AI — Galgotias University Moodle LMS Connector (Playwright)
// Specifically tailored to gulms.galgotiasuniversity.org (ActiLearn)
// ============================================================

import { chromium, Browser, BrowserContext, Page, Cookie } from 'playwright';
import { logger } from '../../utils/logger';
import type {
  LoginResult,
  SessionCookie,
  CourseData,
  ActivityData,
  AssignmentDetails,
  QuizDetails,
  AssignmentAttachment,
} from '../../types';
import path from 'path';
import fs from 'fs';

// ─── LMS URL Constants ───────────────────────────────────────────────────────

const LMS_BASE = 'https://gulms.galgotiasuniversity.org';
const LOGIN_URL = `${LMS_BASE}/login/index.php`;
const DASHBOARD_URL = `${LMS_BASE}/my/`;
const MY_COURSES_URL = `${LMS_BASE}/my/courses.php`;
const CALENDAR_URL = `${LMS_BASE}/calendar/view.php?view=upcoming`;

// ─── Selector Constants ─────────────────────────────────────────────────────

const SEL = {
  usernameInput: '#username, input[name="username"]',
  passwordInput: '#password, input[name="password"]',
  loginBtn: '#loginbtn, input[type="submit"][value*="Log in"], button[type="submit"]',
  loginError: '#loginerrormessage, .loginerrors',
  userMenu: '.usermenu, [data-region="user-menu"], #action-menu-toggle-0, .userpicture',
  courseCard: '.dashboard-card, [data-region="course-content"], .coursebox, [data-region="card-item"]',
};

// ─── Date Parser Helper ─────────────────────────────────────────────────────

export function parseMoodleDate(raw: string | null | undefined): Date | null {
  if (!raw || raw.trim() === '-' || raw.trim() === '') return null;
  const cleaned = raw.trim();

  // Try direct parse
  let d = new Date(cleaned);
  if (!isNaN(d.getTime())) return d;

  // Try stripping leading day-of-week like "Friday, " or "Wednesday, "
  const strippedDay = cleaned.replace(/^[A-Za-z]+,\s*/, '');
  d = new Date(strippedDay);
  if (!isNaN(d.getTime())) return d;

  // Try replacing multiple commas
  const commaFixed = strippedDay.replace(/,\s*/g, ' ');
  d = new Date(commaFixed);
  if (!isNaN(d.getTime())) return d;

  return null;
}

export function extractIdFromUrl(url: string, param: string): string {
  try {
    const u = new URL(url);
    return u.searchParams.get(param) ?? '';
  } catch {
    const match = url.match(new RegExp(`[?&]${param}=(\\d+)`));
    return match ? match[1] ?? '' : '';
  }
}

// ─── LMSConnector ───────────────────────────────────────────────────────────

export interface LMSConnectorOptions {
  headless?: boolean;
  timeout?: number;
}

export class LMSConnector {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly headless: boolean;
  private readonly timeout: number;

  constructor(options: LMSConnectorOptions = {}) {
    this.headless = options.headless ?? true;
    this.timeout = options.timeout ?? 45_000;
  }

  static async probeReachability(timeoutMs = 7000): Promise<{
    reachable: boolean;
    statusCode?: number;
    latencyMs: number;
    hasLoginForm?: boolean;
    error?: string;
  }> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(LOGIN_URL, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': 'CampusSarthi-HealthProbe/1.0' },
      });
      const html = await res.text();
      const hasLoginForm = html.includes('id="login"') || html.includes('name="logintoken"');
      return {
        reachable: res.ok && hasLoginForm,
        statusCode: res.status,
        latencyMs: Date.now() - start,
        hasLoginForm,
      };
    } catch (err) {
      return {
        reachable: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async launch(): Promise<void> {
    logger.info('Launching LMS browser');
    let executablePath = process.env['CHROMIUM_EXECUTABLE_PATH'] || undefined;
    let launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ];
    let headless = this.headless;

    if (!executablePath && process.env['VERCEL'] === '1') {
      try {
        // Optional serverless Chromium binary when deployed on Vercel
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const sparticuz = require('@sparticuz/chromium') as {
          executablePath: () => Promise<string>;
          args: string[];
        };
        executablePath = await sparticuz.executablePath();
        launchArgs = [...sparticuz.args, '--disable-blink-features=AutomationControlled'];
        headless = true;
      } catch {
        logger.warn('VERCEL=1 detected without @sparticuz/chromium or CHROMIUM_EXECUTABLE_PATH; falling back to default Playwright Chromium');
      }
    }

    this.browser = await chromium.launch({
      headless,
      executablePath,
      args: launchArgs,
    });

    this.context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.timeout);
    logger.info('LMS browser launched');
  }

  private getPage(): Page {
    if (!this.page) throw new Error('Browser not launched. Call launch() first.');
    return this.page;
  }

  async close(): Promise<void> {
    logger.info('Closing LMS browser');
    try {
      if (this.context) {
        await this.context.clearCookies().catch(() => {});
        await this.context.close();
      }
      if (this.browser) await this.browser.close();
    } catch {
      // Ignored
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(username: string, password: string): Promise<LoginResult> {
    const page = this.getPage();
    logger.info('Navigating to Galgotias LMS login page', { url: LOGIN_URL });

    try {
      const response = await page
        .goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: this.timeout })
        .catch((err) => {
          throw new Error(`LMS_NETWORK_ERROR: ${err instanceof Error ? err.message : String(err)}`);
        });

      if (response && response.status() >= 500) {
        return {
          success: false,
          status: 'lms_unavailable',
          errorMessage: `Galgotias LMS returned HTTP ${response.status()}. The university portal may be experiencing downtime.`,
        };
      }

      // Inspect login page state before interaction
      const preCheck = await page.evaluate(() => {
        const bodyText = (document.body?.innerText || '').toLowerCase();
        const form = document.querySelector('form#login');
        const userInput = document.querySelector('#username, input[name="username"]');
        const passInput = document.querySelector('#password, input[name="password"]');
        const submitBtn = document.querySelector('#loginbtn, button[type="submit"]');
        const loginTokenEl = document.querySelector('form#login input[name="logintoken"], input[name="logintoken"]') as HTMLInputElement | null;
        const captchaEl = document.querySelector(
          'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha, #recaptcha, [name*="captcha"]'
        );
        const maintenance =
          Boolean(document.querySelector('.maintenance, #notice.maintenance')) ||
          bodyText.includes('site is currently undergoing maintenance') ||
          bodyText.includes('scheduled maintenance');

        return {
          hasForm: Boolean(form),
          hasUserInput: Boolean(userInput),
          hasPassInput: Boolean(passInput),
          hasSubmitBtn: Boolean(submitBtn),
          hasLoginToken: Boolean(loginTokenEl?.value),
          hasCaptcha: Boolean(captchaEl),
          maintenance,
        };
      });

      if (preCheck.maintenance) {
        return {
          success: false,
          status: 'lms_unavailable',
          errorMessage: 'Galgotias LMS is currently undergoing scheduled maintenance. Please try again later.',
        };
      }

      if (preCheck.hasCaptcha) {
        logger.warn('CAPTCHA detected on Galgotias LMS login page');
        return {
          success: false,
          status: 'requires_verification',
          verificationType: 'captcha',
          errorMessage:
            'Galgotias LMS is requesting a CAPTCHA verification. Please sign in directly on the university portal first and reconnect once verified.',
        };
      }

      if (!preCheck.hasUserInput || !preCheck.hasPassInput || !preCheck.hasSubmitBtn) {
        logger.error('Galgotias LMS login page structure changed', preCheck);
        return {
          success: false,
          status: 'page_changed',
          errorMessage:
            'Galgotias LMS login page layout appears to have changed. Please contact support or try reconnecting later.',
        };
      }

      logger.info('Galgotias LMS login form verified', {
        hasForm: preCheck.hasForm,
        hasLoginToken: preCheck.hasLoginToken,
      });

      // Fill exact Moodle form inputs and submit
      await page.fill(SEL.usernameInput, username.trim());
      await page.fill(SEL.passwordInput, password);

      await Promise.all([
        page.waitForNavigation({ timeout: this.timeout, waitUntil: 'domcontentloaded' }).catch(() => {}),
        page.click(SEL.loginBtn),
      ]);

      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await page
        .waitForSelector(
          `${SEL.loginError}, ${SEL.userMenu}, #page-my-index, nav.navbar a[href*="logout.php"], form#login`,
          { timeout: 8000 }
        )
        .catch(() => {});

      const postCheck = await page.evaluate(() => {
        const url = window.location.href;
        const bodyText = (document.body?.innerText || '').trim();
        const lowerBody = bodyText.toLowerCase();

        const loginFormVisible = Boolean(
          document.querySelector('form#login #username, form#login #password')
        );
        const errorEl = document.querySelector('#loginerrormessage, .loginerrors, .alert-danger');
        const errorText = errorEl?.textContent?.trim() || '';

        const hasCaptcha = Boolean(
          document.querySelector(
            'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, [name*="captcha"]'
          )
        );

        const hasOtpOrMfa =
          url.includes('/auth/') ||
          url.includes('/mfa') ||
          lowerBody.includes('one-time password') ||
          lowerBody.includes('verification code') ||
          lowerBody.includes('enter otp') ||
          lowerBody.includes('two-factor');

        const hasPolicyGate =
          url.includes('/admin/tool/policy') ||
          lowerBody.includes('site policy') && lowerBody.includes('agree');

        const w = window as unknown as { M?: { cfg?: { sesskey?: string; userid?: number } } };
        const hasSesskey = Boolean(w.M?.cfg?.sesskey);
        const hasLogoutLink = Boolean(document.querySelector('a[href*="login/logout.php"]'));
        const hasUserMenu = Boolean(
          document.querySelector('.usermenu, [data-region="user-menu"], [data-region="usermenu"], #action-menu-toggle-0')
        );
        const hasDashboardRoot = Boolean(
          document.querySelector('#page-my-index, #page-my-courses, #page-site-index.pagelayout-frontpage')
        );
        const loggedOutText =
          lowerBody.includes('you are not logged in') ||
          lowerBody.includes('your session has timed out');

        // Attempt to extract authenticated student's display name cleanly
        let studentName = '';
        const userTextEl = document.querySelector('.usertext, .usermenu .userbutton, [data-region="usermenu"] .avatar');
        if (userTextEl?.textContent?.trim()) {
          studentName = userTextEl.textContent.trim();
        }
        if (!studentName) {
          const heading = document.querySelector('#page-header h1, #page-header h2, .page-header-headings h1');
          const hText = heading?.textContent?.trim() || '';
          const hiMatch = hText.match(/^(?:Hi|Welcome back|Welcome),?\s+(.+?)[!.]?$/i);
          if (hiMatch && hiMatch[1]) studentName = hiMatch[1].trim();
        }
        const userIdAttr =
          document.querySelector('[data-userid]')?.getAttribute('data-userid') ||
          (w.M?.cfg?.userid ? String(w.M.cfg.userid) : '');

        return {
          url,
          loginFormVisible,
          errorText,
          lowerBody,
          hasCaptcha,
          hasOtpOrMfa,
          hasPolicyGate,
          hasSesskey,
          hasLogoutLink,
          hasUserMenu,
          hasDashboardRoot,
          loggedOutText,
          studentName,
          userIdAttr,
        };
      });

      logger.info('Post-login multi-indicator inspection', {
        url: postCheck.url,
        loginFormVisible: postCheck.loginFormVisible,
        hasSesskey: postCheck.hasSesskey,
        hasLogoutLink: postCheck.hasLogoutLink,
        hasUserMenu: postCheck.hasUserMenu,
        hasDashboardRoot: postCheck.hasDashboardRoot,
        hasCaptcha: postCheck.hasCaptcha,
        hasOtpOrMfa: postCheck.hasOtpOrMfa,
      });

      if (postCheck.hasCaptcha) {
        return {
          success: false,
          status: 'requires_verification',
          verificationType: 'captcha',
          errorMessage:
            'Galgotias LMS requested CAPTCHA verification. Please log in directly on gulms.galgotiasuniversity.org and retry.',
        };
      }

      if (postCheck.hasOtpOrMfa) {
        return {
          success: false,
          status: 'requires_verification',
          verificationType: 'otp',
          errorMessage:
            'Galgotias LMS is requesting OTP / multi-factor verification. Complete verification on the official portal first.',
        };
      }

      if (postCheck.hasPolicyGate) {
        return {
          success: false,
          status: 'requires_verification',
          verificationType: 'policy',
          errorMessage:
            'Galgotias LMS requires accepting an updated university policy before portal access. Please sign in directly on the LMS once to accept it.',
        };
      }

      const combinedError = (postCheck.errorText || '').toLowerCase();
      if (
        combinedError.includes('suspended') ||
        combinedError.includes('disabled') ||
        combinedError.includes('locked') ||
        postCheck.lowerBody.includes('account is suspended') ||
        postCheck.lowerBody.includes('too many failed login attempts')
      ) {
        return {
          success: false,
          status: 'account_disabled',
          errorMessage:
            postCheck.errorText ||
            'Your Galgotias LMS account appears temporarily locked or disabled. Please contact university IT support.',
        };
      }

      if (
        postCheck.url.includes('/login/index.php') ||
        postCheck.loginFormVisible ||
        postCheck.errorText ||
        postCheck.loggedOutText
      ) {
        const isInvalid =
          combinedError.includes('invalid login') ||
          postCheck.lowerBody.includes('invalid login');
        return {
          success: false,
          status: 'invalid_credentials',
          errorMessage:
            postCheck.errorText ||
            (isInvalid
              ? 'Invalid Galgotias LMS admission number or password. Please verify your credentials.'
              : 'Galgotias LMS did not establish an authenticated session.'),
        };
      }

      // Independent positive confirmation of authenticated Moodle portal
      const positiveSignals = [
        postCheck.hasSesskey,
        postCheck.hasLogoutLink,
        postCheck.hasUserMenu,
        postCheck.hasDashboardRoot,
      ].filter(Boolean).length;

      if (positiveSignals < 2) {
        // Double-check dashboard explicitly to confirm genuine session access
        await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: this.timeout });
        await page.waitForSelector(`${SEL.userMenu}, a[href*="login/logout.php"], form#login`, {
          timeout: 6000,
        }).catch(() => {});

        const dashVerified = await page.evaluate(() => {
          const url = window.location.href;
          const formStillThere = Boolean(document.querySelector('form#login #username'));
          const logoutLink = Boolean(document.querySelector('a[href*="login/logout.php"]'));
          const userMenu = Boolean(document.querySelector('.usermenu, [data-region="user-menu"], [data-region="usermenu"]'));
          return !url.includes('/login/index.php') && !formStillThere && (logoutLink || userMenu);
        });

        if (!dashVerified) {
          return {
            success: false,
            status: 'invalid_credentials',
            errorMessage: 'Unable to verify authenticated dashboard access on Galgotias LMS.',
          };
        }
      }

      // Collect session cookies
      const rawCookies: Cookie[] = await this.context!.cookies();
      const sessionCookies: SessionCookie[] = rawCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      }));

      logger.info('LMS login verified via multi-indicator check', {
        cookieCount: sessionCookies.length,
        hasStudentName: Boolean(postCheck.studentName),
      });

      return {
        success: true,
        status: 'authenticated',
        studentName: postCheck.studentName || undefined,
        lmsUserId: postCheck.userIdAttr || undefined,
        sessionCookies,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('LMS login threw exception', { error: message });
      if (message.startsWith('LMS_NETWORK_ERROR:') || message.includes('ERR_') || message.includes('Timeout')) {
        return {
          success: false,
          status: 'lms_unavailable',
          errorMessage: 'Could not reach Galgotias LMS (gulms.galgotiasuniversity.org). Check your network or university portal status.',
        };
      }
      return { success: false, status: 'error', errorMessage: `Login error: ${message}` };
    }
  }

  // ── Session Restoration ───────────────────────────────────────────────────

  async restoreSession(cookies: SessionCookie[]): Promise<void> {
    if (!this.context) throw new Error('Browser not launched.');
    await this.context.clearCookies();
    await this.context.addCookies(
      cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires > 0 ? c.expires : undefined,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: (c.sameSite as 'Strict' | 'Lax' | 'None') ?? 'Lax',
      }))
    );
  }

  async validateSession(): Promise<boolean> {
    const page = this.getPage();
    try {
      await page.goto(MY_COURSES_URL, { waitUntil: 'domcontentloaded', timeout: this.timeout });
      await page
        .waitForSelector(`${SEL.userMenu}, a[href*="login/logout.php"], form#login`, { timeout: 6000 })
        .catch(() => {});

      const status = await page.evaluate(() => {
        const url = window.location.href;
        const bodyLower = (document.body?.innerText || '').toLowerCase();
        const hasLoginForm = Boolean(document.querySelector('form#login #username'));
        const hasLogoutLink = Boolean(document.querySelector('a[href*="login/logout.php"]'));
        const hasUserMenu = Boolean(
          document.querySelector('.usermenu, [data-region="user-menu"], [data-region="usermenu"]')
        );
        return { url, bodyLower, hasLoginForm, hasLogoutLink, hasUserMenu };
      });

      if (status.url.includes('/login/index.php') || status.hasLoginForm) {
        logger.info('Session validation failed — login form or login URL present');
        return false;
      }

      if (
        status.bodyLower.includes('your session has timed out') ||
        status.bodyLower.includes('you are not logged in')
      ) {
        logger.info('Session validation failed — session timed out');
        return false;
      }

      if (!status.hasLogoutLink && !status.hasUserMenu) {
        logger.info('Session validation failed — authenticated Moodle navigation absent');
        return false;
      }

      logger.info('Session validation succeeded');
      return true;
    } catch (err) {
      logger.error('Session validation error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  // ── Courses Discovery ─────────────────────────────────────────────────────

  async getCourses(): Promise<CourseData[]> {
    const page = this.getPage();
    logger.info('Fetching enrolled courses from Galgotias LMS');

    const targets = [MY_COURSES_URL, DASHBOARD_URL];
    const courses: CourseData[] = [];
    const seenIds = new Set<string>();

    for (const targetUrl of targets) {
      try {
        if (!page.url().includes(targetUrl.replace(LMS_BASE, ''))) {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: this.timeout });
        }

        // Wait for course card deck or links to render (ActiLearn loads via client-side JS)
        await page
          .waitForSelector(
            '.dashboard-card, [data-region="course-content"], .coursebox, a[href*="/course/view.php?id="]',
            { timeout: 8000 }
          )
          .catch(() => {});

        // Extra grace period for Moodle 4 AJAX card deck rendering
        await page.waitForTimeout(3000);

        // Attempt 1: Check Moodle internal Web Service API via client session
        const apiCourses = await page.evaluate(async (base) => {
          try {
            const w = window as unknown as { M?: { cfg?: { sesskey?: string } } };
            const sesskey = w.M?.cfg?.sesskey;
            if (!sesskey) return null;

            const res = await fetch(
              `${base}/lib/ajax/service.php?sesskey=${sesskey}&info=core_course_get_enrolled_courses_by_timeline_classification`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([
                  {
                    index: 0,
                    methodname: 'core_course_get_enrolled_courses_by_timeline_classification',
                    args: { classification: 'all', limit: 0, offset: 0, sort: 'fullname' },
                  },
                ]),
              }
            );

            const data = await res.json();
            if (data && data[0] && data[0].data && Array.isArray(data[0].data.courses)) {
              return (data[0].data.courses as Array<{ id: number; fullname: string; shortname: string; viewurl: string }>).map((c) => ({
                lmsCourseId: String(c.id),
                name: (c.fullname || c.shortname || '').trim(),
                shortName: (c.shortname || c.fullname || '').trim(),
                fullName: (c.fullname || '').trim(),
                courseUrl: c.viewurl || `${base}/course/view.php?id=${c.id}`,
              }));
            }
          } catch {
            // Fall back to DOM
          }
          return null;
        }, LMS_BASE);

        if (apiCourses && apiCourses.length > 0) {
          for (const ac of apiCourses) {
            if (ac.lmsCourseId !== '1' && !seenIds.has(ac.lmsCourseId)) {
              seenIds.add(ac.lmsCourseId);
              courses.push(ac);
            }
          }
        }

        // Attempt 2: DOM Scraping of ActiLearn Course Cards
        const domCourses = await page.evaluate((base) => {
          const list: Array<{
            lmsCourseId: string;
            name: string;
            shortName: string;
            fullName: string;
            courseUrl: string;
          }> = [];

          // Query all anchor links pointing to courses
          const links = Array.from(document.querySelectorAll('a[href*="/course/view.php?id="]'));

          for (const a of links) {
            const href = a.getAttribute('href') || '';
            const match = href.match(/id=(\d+)/);
            if (!match) continue;
            const cid = match[1];
            if (!cid || cid === '1') continue;

            // Extract course title from various ActiLearn Moodle 4 selectors
            let title = '';

            // Check card container
            const card = a.closest(
              '.dashboard-card, [data-region="course-content"], .course-info-container, .coursebox, [data-region="card-item"]'
            );

            if (card) {
              const nameEl = card.querySelector(
                '.multiline, h3, h4, .coursename, .course-name, [data-region="coursename"]'
              );
              if (nameEl) title = (nameEl.textContent || '').trim();
            }

            if (!title) {
              title = (a.textContent || '').trim();
            }

            // Clean title: remove "0% complete", "GCET Fall ...", trailing newlines
            title = title
              .replace(/\s+/g, ' ')
              .replace(/\b\d+%\s*complete\b/gi, '')
              .replace(/\bGCET\s+Fall\s+[\d-]+\b/gi, '')
              .trim();

            if (!title || title.length < 2) continue;

            list.push({
              lmsCourseId: cid,
              name: title,
              shortName: title.slice(0, 60),
              fullName: title,
              courseUrl: href.startsWith('http') ? href : `${base}${href}`,
            });
          }
          return list;
        }, LMS_BASE);

        for (const dc of domCourses) {
          if (!seenIds.has(dc.lmsCourseId)) {
            seenIds.add(dc.lmsCourseId);
            courses.push(dc);
          }
        }

        if (courses.length > 0) {
          logger.info('Courses discovered successfully', { url: targetUrl, count: courses.length });
          break;
        }
      } catch (err) {
        logger.warn('Course discovery error on page', { url: targetUrl, error: String(err) });
      }
    }

    logger.info('Total courses fetched', { count: courses.length });
    return courses;
  }

  // ── Dashboard Calendar & Deadlines Discovery ─────────────────────────────
  // Scrapes live deadlines right from the Dashboard calendar (Screenshot 4)

  async getDashboardCalendarEvents(): Promise<
    Array<{
      type: 'assignment' | 'quiz';
      title: string;
      url: string;
      dueDate: Date | null;
      courseName?: string;
    }>
  > {
    const page = this.getPage();
    logger.info('Fetching calendar and deadline events from student dashboard');

    const results: Array<{
      type: 'assignment' | 'quiz';
      title: string;
      url: string;
      dueDate: Date | null;
      courseName?: string;
    }> = [];

    const seenUrls = new Set<string>();

    try {
      await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded', timeout: this.timeout });
      await page.waitForTimeout(3000);

      // Attempt Moodle Calendar AJAX
      const apiEvents = await page.evaluate(async (base) => {
        try {
          const w = window as unknown as { M?: { cfg?: { sesskey?: string } } };
          const sesskey = w.M?.cfg?.sesskey;
          if (!sesskey) return null;

          const res = await fetch(
            `${base}/lib/ajax/service.php?sesskey=${sesskey}&info=core_calendar_get_action_events_by_timesort`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify([
                {
                  index: 0,
                  methodname: 'core_calendar_get_action_events_by_timesort',
                  args: { limit: 50, timesortfrom: Math.floor(Date.now() / 1000) - 86400 * 14 },
                },
              ]),
            }
          );
          const data = await res.json();
          if (data && data[0] && data[0].data && Array.isArray(data[0].data.events)) {
            return (data[0].data.events as Array<{
              name: string;
              activityname?: string;
              timestart?: number;
              url?: string;
              action?: { url?: string };
              course?: { fullname?: string };
              modulename?: string;
            }>).map((ev) => ({
              type: (ev.modulename === 'quiz' || ev.name.toLowerCase().includes('quiz')) ? 'quiz' : 'assignment',
              title: ev.activityname || ev.name,
              url: ev.action?.url || ev.url || '',
              timestart: ev.timestart,
              courseName: ev.course?.fullname || '',
            }));
          }
        } catch {
          // Fall through
        }
        return null;
      }, LMS_BASE);

      if (apiEvents && apiEvents.length > 0) {
        for (const ev of apiEvents) {
          if (ev.url && !seenUrls.has(ev.url)) {
            seenUrls.add(ev.url);
            results.push({
              type: ev.type as 'assignment' | 'quiz',
              title: ev.title.trim(),
              url: ev.url,
              dueDate: ev.timestart ? new Date(ev.timestart * 1000) : null,
              courseName: ev.courseName,
            });
          }
        }
      }

      // Also scrape the DOM calendar block (as shown in Screenshot 4)
      const domEvents = await page.evaluate(() => {
        const list: Array<{
          type: 'assignment' | 'quiz';
          title: string;
          url: string;
          dateText: string;
        }> = [];

        // Query all assignment/quiz links in calendar / timeline
        const links = Array.from(
          document.querySelectorAll(
            'a[href*="/mod/assign/view.php?id="], a[href*="/mod/quiz/view.php?id="]'
          )
        );

        for (const a of links) {
          const href = (a.getAttribute('href') || '').trim();
          if (!href) continue;

          const isQuiz = href.includes('/mod/quiz/');
          const title = (a.textContent || '').trim().replace(/\s+/g, ' ');

          // Find date text in parent table cell or container
          const cell = a.closest('td, .calendar-event, [data-region="event-item"], .event');
          const dateText = cell ? (cell.textContent || '').trim() : '';

          list.push({
            type: isQuiz ? 'quiz' : 'assignment',
            title,
            url: href,
            dateText,
          });
        }
        return list;
      });

      for (const ev of domEvents) {
        if (!seenUrls.has(ev.url)) {
          seenUrls.add(ev.url);
          results.push({
            type: ev.type,
            title: ev.title,
            url: ev.url,
            dueDate: parseMoodleDate(ev.dateText),
          });
        }
      }

      logger.info('Calendar deadlines discovered', { count: results.length });
    } catch (err) {
      logger.warn('Calendar deadline discovery error', { error: String(err) });
    }

    return results;
  }

  // ── Course Activities Discovery ───────────────────────────────────────────
  // Scrapes activities from a specific course page (Screenshot 3)

  async getCourseActivities(courseId: string, courseUrl: string): Promise<ActivityData[]> {
    const page = this.getPage();
    logger.info('Fetching course activities', { courseId, courseUrl });

    try {
      await page.goto(courseUrl, { waitUntil: 'domcontentloaded', timeout: this.timeout });
      await page.waitForTimeout(2000);

      // Click "Expand all" if present so collapsed sections are opened (Screenshot 3)
      const expandBtn = await page.$(
        '.expandall, [data-action="expand-all"], a:has-text("Expand all"), button:has-text("Expand all")'
      );
      if (expandBtn) {
        await expandBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
      }

      // Check Moodle Web Service for course contents
      const apiActivities = await page.evaluate(
        async ({ base, cid }) => {
          try {
            const w = window as unknown as { M?: { cfg?: { sesskey?: string } } };
            const sesskey = w.M?.cfg?.sesskey;
            if (!sesskey) return null;

            const res = await fetch(
              `${base}/lib/ajax/service.php?sesskey=${sesskey}&info=core_course_get_contents`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([
                  {
                    index: 0,
                    methodname: 'core_course_get_contents',
                    args: { courseid: Number(cid) },
                  },
                ]),
              }
            );

            const data = await res.json();
            if (data && data[0] && Array.isArray(data[0].data)) {
              const items: Array<{
                type: 'assignment' | 'quiz' | 'resource' | 'unknown';
                name: string;
                url: string;
                section: string;
                dueDateStr?: string;
                closeDateStr?: string;
              }> = [];

              for (const sec of data[0].data) {
                const sectionName = (sec.name || 'General').trim();
                if (Array.isArray(sec.modules)) {
                  for (const mod of sec.modules) {
                    if (mod.modname === 'assign' || mod.modname === 'quiz') {
                      items.push({
                        type: mod.modname === 'assign' ? 'assignment' : 'quiz',
                        name: (mod.name || '').trim(),
                        url: mod.url || `${base}/mod/${mod.modname}/view.php?id=${mod.id}`,
                        section: sectionName,
                      });
                    }
                  }
                }
              }
              return items;
            }
          } catch {
            // Fall through
          }
          return null;
        },
        { base: LMS_BASE, cid: courseId }
      );

      if (apiActivities && apiActivities.length > 0) {
        logger.info('Course activities discovered via Moodle API', { courseId, count: apiActivities.length });
        return apiActivities.map((a) => ({
          type: a.type,
          name: a.name,
          url: a.url,
          section: a.section,
        }));
      }

      // DOM extraction (as seen in Screenshot 3)
      const activities: ActivityData[] = await page.evaluate(() => {
        const items: ActivityData[] = [];
        const seen = new Set<string>();

        const links = Array.from(
          document.querySelectorAll(
            'a[href*="/mod/assign/view.php?id="], a[href*="/mod/quiz/view.php?id="]'
          )
        );

        for (const a of links) {
          const href = a.getAttribute('href') || '';
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const isAssignment = href.includes('/mod/assign/');
          const isQuiz = href.includes('/mod/quiz/');

          // Title
          const instancename = a.querySelector('.instancename') || a;
          let name = (instancename.textContent || '').trim();
          name = name.replace(/\s*(Assignment|Quiz|File)\s*$/i, '').trim() || name;

          // Section header
          let section = 'Course Activities';
          const sectionEl = a.closest('li.section, [data-region="section"], .course-section, .section');
          if (sectionEl) {
            const h = sectionEl.querySelector('h3, .sectionname, .section-title, .contentheader');
            if (h) section = (h.textContent || '').trim();
          }

          // Container text for immediate date strings (Screenshot 3 shows Opened/Closed text under link)
          const parentItem = a.closest('.activity, li.activity, .activityinstance') || a.parentElement;
          const parentText = parentItem ? (parentItem.textContent || '') : '';

          let dueDateStr: string | null = null;
          let closeDateStr: string | null = null;

          const openMatch = parentText.match(/Opened:\s*([^,|]+,\s*[^,|]+,\s*[\d:]+\s*(?:AM|PM)?)/i);
          const closeMatch = parentText.match(/Close(?:d|s)?:\s*([^,|]+,\s*[^,|]+,\s*[\d:]+\s*(?:AM|PM)?)/i);
          const dueMatch = parentText.match(/Due:\s*([^,|]+,\s*[^,|]+,\s*[\d:]+\s*(?:AM|PM)?)/i);

          if (dueMatch) dueDateStr = dueMatch[1] ?? null;
          if (closeMatch) closeDateStr = closeMatch[1] ?? null;
          if (!closeDateStr && openMatch) closeDateStr = openMatch[1] ?? null;

          items.push({
            type: isAssignment ? 'assignment' : isQuiz ? 'quiz' : 'unknown',
            name,
            url: href,
            section,
            dueDate: dueDateStr ? new Date(dueDateStr) : null,
            closeDate: closeDateStr ? new Date(closeDateStr) : null,
          });
        }
        return items;
      });

      logger.info('Activities fetched from course DOM', { courseId, count: activities.length });
      return activities;
    } catch (err) {
      logger.error('Failed to get course activities', { courseId, error: String(err) });
      return [];
    }
  }

  // ── Assignment Details ────────────────────────────────────────────────────
  // Extracts detailed assignment view, attachment docx/pdf/doc, due dates

  async getAssignmentDetails(assignmentUrl: string): Promise<AssignmentDetails> {
    const page = this.getPage();
    logger.info('Fetching assignment details', { url: assignmentUrl });

    await page.goto(assignmentUrl, { waitUntil: 'domcontentloaded', timeout: this.timeout });
    await page.waitForTimeout(1500);

    // Detect expired Moodle session immediately before scraping
    const currentUrl = page.url();
    const hasLoginForm = (await page.$('input[name="logintoken"], #loginbtn, form[action*="login/index.php"]')) !== null;
    if (currentUrl.includes('/login/') || hasLoginForm) {
      throw new LMSSessionExpiredError(
        'Your Galgotias LMS session has expired. Please reconnect your LMS account and retry.'
      );
    }

    const lmsAssignmentId = extractIdFromUrl(assignmentUrl, 'id');

    // Title
    const title =
      (await page.textContent('h2, .page-header-headings h1, h1.h2'))?.trim() ??
      'Untitled Assignment';

    // Description & instructions (combining intro + activity description regions)
    const descBlocks = await page.evaluate(() => {
      const selectors = [
        '#intro',
        '.box.generalbox.intro',
        '[data-region="assign-intro"]',
        '.activity-description',
        '[data-region="activity-description"]',
      ];
      const parts: string[] = [];
      const seenText = new Set<string>();
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => {
          const txt = (el.textContent || '').trim();
          if (txt && !seenText.has(txt)) {
            seenText.add(txt);
            parts.push(txt);
          }
        });
      }
      return parts.join('\n\n').trim();
    });
    const description = descBlocks || null;

    // Dates extraction:
    // In Moodle 4 (Screenshot 5), dates appear in `.activity-dates` or header text:
    // "Opened: Friday, 30 October 2026, 12:00 AM"
    // "Due: Wednesday, 11 November 2026, 12:00 AM"
    let dueDate: Date | null = null;
    let openDate: Date | null = null;
    let maxGrade: number | null = null;
    let submissionStatus: string | null = null;

    const pageBodyText = (await page.textContent('body')) || '';

    const dueRegex = pageBodyText.match(/Due:\s*([A-Za-z]+,\s*\d+\s+[A-Za-z]+\s+\d+,\s*[\d:]+\s*(?:AM|PM)?)/i);
    if (dueRegex && dueRegex[1]) {
      dueDate = parseMoodleDate(dueRegex[1]);
    }

    const openRegex = pageBodyText.match(/Opened:\s*([A-Za-z]+,\s*\d+\s+[A-Za-z]+\s+\d+,\s*[\d:]+\s*(?:AM|PM)?)/i);
    if (openRegex && openRegex[1]) {
      openDate = parseMoodleDate(openRegex[1]);
    }

    // Inspect table rows for Submission Status (Screenshot 5: "Submission status: No submissions have been made yet")
    const tableRows = await page.$$('.generaltable tr, .submissionstatustable tr');
    for (const row of tableRows) {
      const cells = await row.$$('td, th');
      if (cells.length < 2) continue;
      const label = (await cells[0]?.textContent())?.toLowerCase().trim() ?? '';
      const value = (await cells[1]?.textContent())?.trim() ?? '';

      if (label.includes('submission status')) {
        submissionStatus = value;
      } else if (label.includes('due date') && !dueDate) {
        dueDate = parseMoodleDate(value);
      } else if (label.includes('allow submissions from') && !openDate) {
        openDate = parseMoodleDate(value);
      } else if (label.includes('grade') || label.includes('maximum')) {
        const n = parseFloat(value);
        if (!isNaN(n)) maxGrade = n;
      }
    }

    if (!submissionStatus) {
      if (pageBodyText.includes('Submitted for grading')) {
        submissionStatus = 'Submitted for grading';
      } else if (pageBodyText.includes('No submissions have been made yet')) {
        submissionStatus = 'No submissions have been made yet';
      }
    }

    // Attachments (Screenshot 5: red link / docx icon with "Home Assignment 2 (CO3).docx")
    const attachments: AssignmentAttachment[] = await page.evaluate((base) => {
      const items: Array<{
        url: string;
        filename: string;
        fileSize: number | null;
        mimeType: string | null;
      }> = [];
      const seen = new Set<string>();

      // Broad selector catching Moodle 4 assign view links, intro attachments, resource links, and document files
      const candidateSelectors = [
        'a[href*="/pluginfile.php/"]',
        'a[href*="/mod_assign/introattachment/"]',
        'a[href*="/mod_assign/intro/"]',
        'a[href*="forcedownload=1"]',
        'a[href*="/mod/resource/view.php"]',
        'a[href*=".docx"]',
        'a[href*=".doc"]',
        'a[href*=".pdf"]',
        'a[href*=".txt"]',
        '.fileuploadsubmission a',
        '.attachments a',
        '[data-region="activity-information"] a',
        '.activity-information a',
        '.intro a',
        '#intro a',
        '.box.generalbox a',
        '.submissionstatustable a',
      ];

      const links = Array.from(
        document.querySelectorAll<HTMLAnchorElement>(candidateSelectors.join(', '))
      );

      for (const a of links) {
        let href = (a.getAttribute('href') || '').trim();
        if (!href || href === '#' || href.startsWith('javascript:')) continue;

        // Skip user profile icons or standard Moodle UI sprites
        if (href.includes('/user/icon/') || href.includes('/pix/')) continue;

        // Convert relative URL to absolute
        if (!href.startsWith('http://') && !href.startsWith('https://')) {
          href = href.startsWith('/') ? `${base}${href}` : `${base}/${href}`;
        }

        if (seen.has(href)) continue;

        const rawText = (a.textContent || '').trim().replace(/\s+/g, ' ');
        const urlDecoded = decodeURIComponent(href.split('?')[0] || '');

        // Extract filename from URL or link text
        const extMatchFromUrl = urlDecoded.match(/([^\/\\]+\.(?:docx|doc|pdf|txt|zip|pptx|xlsx))$/i);
        const extMatchFromText = rawText.match(/([a-zA-Z0-9_\-\s\(\)\[\]\.]+\.(?:docx|doc|pdf|txt|zip|pptx|xlsx))/i);

        let filename = '';
        if (extMatchFromUrl && extMatchFromUrl[1]) {
          filename = extMatchFromUrl[1].trim();
        } else if (extMatchFromText && extMatchFromText[1]) {
          filename = extMatchFromText[1].trim();
        } else if (rawText && (rawText.toLowerCase().includes('.doc') || rawText.toLowerCase().includes('.pdf') || rawText.toLowerCase().includes('assignment'))) {
          filename = rawText;
        } else {
          const lastPart = urlDecoded.split('/').pop() || '';
          if (lastPart && (lastPart.includes('.') || lastPart.toLowerCase().includes('download'))) {
            filename = lastPart;
          }
        }

        // Sanitize filename for file systems (remove colons and illegal chars)
        filename = filename.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();

        // Reject non-document URLs such as view.php or scripts
        const lowerName = filename.toLowerCase();
        if (
          !filename ||
          lowerName.endsWith('.php') ||
          lowerName.endsWith('.html') ||
          lowerName.endsWith('.htm') ||
          lowerName.startsWith('view.php') ||
          href.includes('/mod/assign/view.php')
        ) {
          continue;
        }

        if (filename && filename.length >= 3) {
          seen.add(href);
          const lower = filename.toLowerCase();
          const mimeType = lower.endsWith('.pdf')
            ? 'application/pdf'
            : lower.endsWith('.docx')
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : lower.endsWith('.doc')
            ? 'application/msword'
            : lower.endsWith('.txt')
            ? 'text/plain'
            : null;

          items.push({
            url: href,
            filename,
            fileSize: null,
            mimeType,
          });
        }
      }

      return items;
    }, LMS_BASE);

    logger.info('Assignment details extracted', {
      lmsAssignmentId,
      title,
      hasDueDate: dueDate !== null,
      attachmentCount: attachments.length,
    });

    return {
      lmsAssignmentId,
      title,
      description,
      dueDate,
      openDate,
      maxGrade,
      submissionStatus,
      attachments,
    };
  }

  // ── Quiz Details ──────────────────────────────────────────────────────────

  async getQuizDetails(quizUrl: string): Promise<QuizDetails> {
    const page = this.getPage();
    logger.info('Fetching quiz details', { url: quizUrl });

    await page.goto(quizUrl, { waitUntil: 'domcontentloaded', timeout: this.timeout });
    await page.waitForTimeout(1500);

    const lmsQuizId = extractIdFromUrl(quizUrl, 'id');

    const title =
      (await page.textContent('h2, .page-header-headings h1, h1.h2'))?.trim() ?? 'Untitled Quiz';

    const descEl = await page.$('#intro, .quizinfo, .box.generalbox.intro');
    const description = descEl ? (await descEl.textContent())?.trim() ?? null : null;

    let openTime: Date | null = null;
    let closeTime: Date | null = null;
    let timeLimitSeconds: number | null = null;
    let maxAttempts: number | null = null;
    let totalQuestions: number | null = null;
    let status: string | null = null;

    const pageText = (await page.textContent('body')) || '';

    // Regex check for quiz dates
    const openMatch = pageText.match(/Opened?:\s*([A-Za-z]+,\s*\d+\s+[A-Za-z]+\s+\d+,\s*[\d:]+\s*(?:AM|PM)?)/i);
    if (openMatch && openMatch[1]) openTime = parseMoodleDate(openMatch[1]);

    const closeMatch = pageText.match(/Close(?:d|s)?:\s*([A-Za-z]+,\s*\d+\s+[A-Za-z]+\s+\d+,\s*[\d:]+\s*(?:AM|PM)?)/i);
    if (closeMatch && closeMatch[1]) closeTime = parseMoodleDate(closeMatch[1]);

    // Inspect summary table
    const tableRows = await page.$$('.generaltable tr, .quizattemptsummary tr');
    for (const row of tableRows) {
      const cells = await row.$$('td, th');
      if (cells.length < 2) continue;
      const label = (await cells[0]?.textContent())?.toLowerCase().trim() ?? '';
      const value = (await cells[1]?.textContent())?.trim() ?? '';

      if (label.includes('opens') && !openTime) {
        openTime = parseMoodleDate(value);
      } else if (label.includes('close') && !closeTime) {
        closeTime = parseMoodleDate(value);
      } else if (label.includes('time limit')) {
        let seconds = 0;
        const hours = value.match(/(\d+)\s*hour/i);
        const mins = value.match(/(\d+)\s*min/i);
        const secs = value.match(/(\d+)\s*sec/i);
        if (hours && hours[1]) seconds += parseInt(hours[1]) * 3600;
        if (mins && mins[1]) seconds += parseInt(mins[1]) * 60;
        if (secs && secs[1]) seconds += parseInt(secs[1]);
        timeLimitSeconds = seconds > 0 ? seconds : null;
      } else if (label.includes('attempts allowed') || label.includes('max')) {
        const n = parseInt(value);
        if (!isNaN(n)) maxAttempts = n;
      } else if (label.includes('questions')) {
        const n = parseInt(value);
        if (!isNaN(n)) totalQuestions = n;
      } else if (label.includes('state') || label.includes('status')) {
        status = value;
      }
    }

    // Determine status & attempts
    if (pageText.includes('Re-attempt quiz') || pageText.includes('Review') || pageText.includes('Finished')) {
      status = 'completed';
    } else if (pageText.includes('Attempt quiz now') || pageText.includes('Continue the last attempt')) {
      status = 'open';
    } else if (pageText.includes('This quiz closed on') || (closeTime && closeTime < new Date())) {
      status = 'closed';
    }

    logger.info('Quiz details extracted', { lmsQuizId, title, status });

    return {
      lmsQuizId,
      title,
      description,
      openTime,
      closeTime,
      timeLimitSeconds,
      maxAttempts,
      totalQuestions,
      status,
    };
  }
  // ── File Download ────────────────────────────────────────────────────────

  async downloadFileBuffer(fileUrl: string): Promise<{
    buffer: Buffer;
    filename: string;
    mimeType: string;
    finalUrl: string;
  }> {
    const page = this.getPage();
    logger.info('Downloading authentic file from LMS', { url: fileUrl });

    const fullUrl = fileUrl.startsWith('http://') || fileUrl.startsWith('https://')
      ? fileUrl
      : `${LMS_BASE}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;

    const parseContentDispositionFilename = (header?: string): string | null => {
      if (!header) return null;
      const utf8Match = header.match(/filename\*=UTF-8''([^;\n]+)/i);
      if (utf8Match && utf8Match[1]) {
        try {
          return decodeURIComponent(utf8Match[1].trim().replace(/['"]/g, ''));
        } catch {
          return utf8Match[1].trim().replace(/['"]/g, '');
        }
      }
      const basicMatch = header.match(/filename="?([^";\n]+)"?/i);
      return basicMatch && basicMatch[1] ? basicMatch[1].trim() : null;
    };

    const inferUrlFilename = (targetUrl: string): string => {
      try {
        const clean = decodeURIComponent(targetUrl.split('?')[0] || '');
        return (clean.split('/').pop() || 'assignment_document').replace(/[\\/:*?"<>|]/g, '_');
      } catch {
        return 'assignment_document';
      }
    };

    // Method 1: Authenticated Playwright APIRequestContext sharing browser session cookies
    try {
      const response = await page.request.get(fullUrl, { maxRedirects: 5, timeout: 30000 });
      const contentType = response.headers()['content-type'] || '';
      const contentDisposition = response.headers()['content-disposition'] || '';
      const finalUrl = response.url();

      if (finalUrl.includes('/login/') || contentType.toLowerCase().includes('text/html')) {
        // Double-check if response body is actually a login page
        const preview = (await response.body()).subarray(0, 2048).toString('utf-8').toLowerCase();
        if (preview.includes('/login/index.php') || preview.includes('logintoken') || preview.includes('<html')) {
          throw new LMSSessionExpiredError(
            'LMS session expired or redirected to login page while downloading attachment.'
          );
        }
      }

      if (!response.ok()) {
        throw new Error(`LMS returned HTTP ${response.status()} for attachment`);
      }

      const buffer = await response.body();
      if (!buffer || buffer.length === 0) {
        throw new Error('Downloaded attachment was empty (0 bytes)');
      }

      const head = buffer.subarray(0, 120).toString('utf-8').trimStart().toLowerCase();
      if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
        throw new LMSSessionExpiredError(
          'Received HTML login/error page instead of attachment file.'
        );
      }

      const detectedFilename =
        parseContentDispositionFilename(contentDisposition) || inferUrlFilename(finalUrl || fullUrl);

      logger.info('File buffer downloaded via page.request', {
        filename: detectedFilename,
        size: buffer.length,
        contentType,
      });

      return {
        buffer,
        filename: detectedFilename,
        mimeType: contentType || 'application/octet-stream',
        finalUrl,
      };
    } catch (apiErr) {
      if (apiErr instanceof LMSSessionExpiredError) {
        throw apiErr;
      }
      logger.warn('Direct authenticated request download failed, attempting browser download event', {
        error: String(apiErr),
      });
    }

    // Method 2: Playwright browser download trigger (handles Moodle forcedownload/redirect scripts)
    try {
      const tmpDownloadDir = path.join(process.env['TEMP'] ?? '/tmp', 'campussarthi', 'dl-stage');
      fs.mkdirSync(tmpDownloadDir, { recursive: true });
      const stagePath = path.join(tmpDownloadDir, `${Date.now()}_stage`);

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20000 }),
        page.goto(fullUrl).catch(() => {}),
      ]);

      await download.saveAs(stagePath);
      const buffer = fs.readFileSync(stagePath);
      fs.unlink(stagePath, () => {});

      if (page.url().includes('/login/')) {
        throw new LMSSessionExpiredError('LMS session expired during browser download redirect.');
      }

      const suggested = download.suggestedFilename() || inferUrlFilename(fullUrl);
      logger.info('File buffer downloaded via browser download event', {
        filename: suggested,
        size: buffer.length,
      });

      return {
        buffer,
        filename: suggested,
        mimeType: 'application/octet-stream',
        finalUrl: download.url() || fullUrl,
      };
    } catch (dlEventErr) {
      if (dlEventErr instanceof LMSSessionExpiredError) {
        throw dlEventErr;
      }
      if (page.url().includes('/login/')) {
        throw new LMSSessionExpiredError('LMS session expired. Please reconnect your university account.');
      }
      logger.error('All download methods failed', { url: fullUrl, error: String(dlEventErr) });
      throw new Error(`Failed to download authentic document from ${fullUrl}: ${String(dlEventErr)}`);
    }
  }

  async downloadFile(fileUrl: string, destPath: string): Promise<string> {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const result = await this.downloadFileBuffer(fileUrl);
    fs.writeFileSync(destPath, result.buffer);
    return destPath;
  }
}

export class LMSSessionExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LMSSessionExpiredError';
  }
}

export default LMSConnector;
