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

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async launch(): Promise<void> {
    logger.info('Launching LMS browser');
    this.browser = await chromium.launch({
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
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
      if (this.context) await this.context.close();
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
    logger.info('Navigating to LMS login page', { url: LOGIN_URL });

    try {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: this.timeout });
      await page.waitForSelector(SEL.usernameInput, { timeout: this.timeout });

      // Fill credentials
      await page.fill(SEL.usernameInput, username);
      await page.fill(SEL.passwordInput, password);

      // Click login and wait for navigation
      await Promise.all([
        page.waitForNavigation({ timeout: this.timeout, waitUntil: 'domcontentloaded' }).catch(() => {}),
        page.click(SEL.loginBtn),
      ]);

      await page.waitForTimeout(3000);

      const currentUrl = page.url();
      logger.info('Post-login URL', { url: currentUrl });

      // PRIMARY CHECK: If we're still on the login page, login failed
      if (currentUrl.includes('/login/index.php')) {
        const errorEl = await page.$('#loginerrormessage, .loginerrors');
        if (errorEl) {
          const errorText = await errorEl.textContent();
          logger.warn('LMS login failed (error element)', { error: errorText });
          return { success: false, errorMessage: errorText?.trim() ?? 'Invalid login credentials' };
        }
        const bodyText = await page.textContent('body');
        const hasError = bodyText?.toLowerCase().includes('invalid login');
        logger.warn('LMS login failed (still on login page)', { hasError });
        return {
          success: false,
          errorMessage: hasError
            ? 'Invalid login, please check your university admission number and password.'
            : 'Login failed — could not access Galgotias LMS dashboard.',
        };
      }

      logger.info('LMS login: successfully redirected to student portal');

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

      logger.info('LMS login succeeded', { cookieCount: sessionCookies.length });
      return { success: true, sessionCookies };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('LMS login threw exception', { error: message });
      return { success: false, errorMessage: `Login error: ${message}` };
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
      await page.waitForTimeout(2000);
      const url = page.url();

      if (url.includes('/login/index.php')) {
        logger.info('Session validation failed — redirected to login');
        return false;
      }

      const bodyText = (await page.textContent('body')) || '';
      if (bodyText.includes('Your session has timed out') || bodyText.includes('Log in to ActiLearn')) {
        logger.info('Session validation failed — session timed out');
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
  // Extracts detailed assignment view, attachment docx, due dates (Screenshot 5)

  async getAssignmentDetails(assignmentUrl: string): Promise<AssignmentDetails> {
    const page = this.getPage();
    logger.info('Fetching assignment details', { url: assignmentUrl });

    await page.goto(assignmentUrl, { waitUntil: 'domcontentloaded', timeout: this.timeout });
    await page.waitForTimeout(1500);

    const lmsAssignmentId = extractIdFromUrl(assignmentUrl, 'id');

    // Title (Screenshot 5: "Home Assignment 2 (CO3)")
    const title =
      (await page.textContent('h2, .page-header-headings h1, h1.h2'))?.trim() ??
      'Untitled Assignment';

    // Description
    const descEl = await page.$('#intro, .box.generalbox.intro, [data-region="assign-intro"]');
    const description = descEl ? (await descEl.textContent())?.trim() ?? null : null;

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

      // Broad selector catching Moodle 4 assign view links, intro attachments, and document files
      const candidateSelectors = [
        'a[href*="/pluginfile.php/"]',
        'a[href*="/mod_assign/introattachment/"]',
        'a[href*="/mod_assign/intro/"]',
        'a[href*=".docx"]',
        'a[href*=".doc"]',
        'a[href*=".pdf"]',
        'a[href*=".txt"]',
        '.fileuploadsubmission a',
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

  async downloadFile(fileUrl: string, destPath: string): Promise<string> {
    const page = this.getPage();
    logger.info('Downloading file from LMS', { url: fileUrl, destPath });

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const fullUrl = fileUrl.startsWith('http://') || fileUrl.startsWith('https://')
      ? fileUrl
      : `${LMS_BASE}${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;

    // Method 1: authenticated request context
    try {
      const response = await page.request.get(fullUrl);
      const contentType = response.headers()['content-type'] || '';
      const finalUrl = response.url();

      if (finalUrl.includes('/login/') || contentType.includes('text/html')) {
        throw new Error('LMS session expired or redirected to university login page');
      }

      if (response.ok()) {
        const buffer = await response.body();
        if (buffer && buffer.length > 0) {
          const head = buffer.subarray(0, 50).toString('utf-8').toLowerCase();
          if (head.includes('<!doctype html') || head.includes('<html')) {
            throw new Error('Received HTML instead of binary document (session timed out)');
          }

          fs.writeFileSync(destPath, buffer);
          logger.info('File downloaded successfully via page.request', { destPath, size: buffer.length });
          return destPath;
        }
      }
    } catch (apiErr) {
      logger.warn('Direct request download failed, attempting browser download trigger', {
        error: String(apiErr),
      });
    }

    // Method 2: Playwright download event trigger
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15000 }),
        page.goto(fullUrl).catch(() => {}),
      ]);
      await download.saveAs(destPath);
      logger.info('File downloaded successfully via browser download event', { destPath });
      return destPath;
    } catch (dlEventErr) {
      logger.error('All download methods failed', { url: fullUrl, error: String(dlEventErr) });
      throw new Error(`Failed to download file from ${fullUrl}`);
    }
  }
}

export default LMSConnector;
