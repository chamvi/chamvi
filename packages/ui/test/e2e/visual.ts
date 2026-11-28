/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Locator, Page, Request } from '@playwright/test';
import { E2E_TOKEN } from './demo/constants.ts';

// The same file in every Playwright suite of a dashboard package (ui, tool-mail-ui, chat-whatsapp-ui):
// each suite's `demo/constants.ts` exports its `E2E_TOKEN`.

/** The attributes `renderedText()` lists after the text: what a screen reader or a tooltip shows. */
const TEXT_ATTRIBUTES = ['aria-label', 'title', 'placeholder', 'alt'];

/**
 * The text of every visible text node, whitespace collapsed, in document
 * order, one line per node; then `[attribute=value]` for every element that
 * carries one of `TEXT_ATTRIBUTES`.
 */
export async function renderedText(page: Page): Promise<string> {
    return page.evaluate((attributes) => {
        const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();
        const lines: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const text = collapse(node.textContent ?? '');
            const parent = node.parentElement;

            if (text && parent && !parent.closest('script, style, template') && parent.checkVisibility({ visibilityProperty: true })) {
                lines.push(text);
            }
        }

        const selector = attributes.map((name) => `[${name}]`).join(', ');

        for (const element of Array.from(document.body.querySelectorAll(selector))) {
            for (const name of attributes) {
                const value = element.getAttribute(name);

                if (value !== null && collapse(value)) {
                    lines.push(`[${name}=${collapse(value)}]`);
                }
            }
        }

        return lines.join('\n');
    }, TEXT_ATTRIBUTES);
}

const DISTANCE = '(?:less than |about |over |almost )?(?:a|an|\\d+) (?:second|minute|hour|day|week|month|year)s?';

/** Ordered: a longer form is replaced before a shorter form inside it. */
const PATTERNS: Array<[RegExp, string]> = [
    // the release the login page names
    [/\bchamvi \d+\.\d+(?:\.\d+)?(?:-[\w.]+)?/g, 'chamvi <version>'],
    [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>'],
    // ISO date-times and dates
    [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?/g, '<date>'],
    // Intl fire times: `Mon, Nov 30, 08:00 AM GMT+1`, `Thu 22 Oct, 08:00 CET`, `Mo., 30. Nov., 08:00 MEZ`
    [/\b[A-Z][a-z]{1,2}\.?,? (?:[A-Z][a-z]{2,3}\.? \d{1,2}|\d{1,2}\.? [A-Z][a-z]{2,3}\.?),? \d{1,2}:\d{2}(?: ?[AP]M)?(?: [A-Z]{2,5}(?:[+-]\d{1,2}(?::\d{2})?)?)?/g, '<date>'],
    // toLocaleString: `11/28/2026, 10:03:12 AM`, `28.11.2026, 10:03:12`
    [/\b\d{1,2}[./]\d{1,2}[./]\d{4},? \d{1,2}:\d{2}(?::\d{2})?(?: ?[AP]M)?/g, '<date>'],
    [/\b\d{4}-\d{2}-\d{2}\b/g, '<date>'],
    [/\b\d{1,2}[./]\d{1,2}[./]\d{4}\b/g, '<date>'],
    // date-fns distances: `less than a minute ago`, `in about 5 hours` (a span without either, `Last 7 days`, stays)
    [new RegExp(`\\bin ${DISTANCE}\\b|\\b${DISTANCE} ago\\b`, 'g'), '<rel>'],
    // countdowns `1d 02:03:04`: one form whatever is left, so a run that crosses a day boundary reads the same
    [/\b(?:\d+d )?\d{1,2}:\d{2}:\d{2}(?: ?[AP]M)?\b/g, '<time>'],
    [/\b\d{1,2}:\d{2}(?: ?[AP]M)?\b/g, '<time>'],
    // measured durations: `350 ms`, `1.2 s` (a configured one, `polling · 5 s`, stays)
    [/\b\d+(?:\.\d+)? ?ms\b/g, '<dur>'],
    [/\b\d+\.\d+ ?s\b/g, '<dur>'],
    [/\b[0-9a-f]{8}\b/g, '<id>'],
];

/** `text` with its run-dependent values replaced by placeholders, so a pin holds from run to run. */
export function normalize(text: string): string {
    return PATTERNS.reduce((output, [pattern, placeholder]) => output.replace(pattern, placeholder), text);
}

/**
 * Stops the page's clock (no countdown, relative time or poll changes the
 * page any more; it needs `page.clock.install()` before the page loaded) and
 * writes the `normalize()`d form into every text node once the requests the
 * jump fired have settled, so a value that differs from run to run cannot
 * shift the layout around it.
 */
export async function freeze(page: Page): Promise<void> {
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    // a poll the jump fired would answer after the rewrite and bring the raw text back
    await settle(page);
    await page.evaluate((patterns) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            node.textContent = patterns.reduce(
                (output, [source, flags, placeholder]) => output.replace(new RegExp(source, flags), placeholder),
                node.textContent ?? '',
            );
        }
    }, PATTERNS.map(([pattern, placeholder]) => [pattern.source, pattern.flags, placeholder] as [string, string, string]));
}

/**
 * What a screenshot masks: values that change with the clock or the run. A
 * relative time, a 24 h strip with run marks (a mark moves left as time
 * passes; an empty strip stays in the picture), a run's Time meter bar (it
 * fills with the run's age) and a pairing QR (a new code per pairing).
 */
export const VOLATILE = (page: Page): Locator[] => [
    page.locator('time'),
    page.getByTestId('activity').filter({ has: page.locator('i') }),
    page.getByTestId('usage-meter').filter({ hasText: /^Time/ }).locator('i').locator('..'),
    page.getByTestId('connection-qr'),
];

/** How long no request may be open before the network counts as idle. */
const IDLE_MS = 500;

/** The requests each page has open, tracked from the first `settle()` on and kept for the page's life. */
const OPEN_REQUESTS = new WeakMap<Page, Set<Request>>();

function trackRequests(page: Page): Set<Request> {
    let open = OPEN_REQUESTS.get(page);

    if (!open) {
        const requests = new Set<Request>();
        const onDone = (request: Request) => requests.delete(request);

        page.on('request', (request) => {
            // a stream stays open while the page shows
            if (request.headers().accept !== 'text/event-stream') {
                requests.add(request);
            }
        });
        page.on('requestfinished', onDone);
        page.on('requestfailed', onDone);
        OPEN_REQUESTS.set(page, requests);
        open = requests;
    }

    return open;
}

/**
 * Waits until the fonts loaded and the network is idle: no request open for
 * `IDLE_MS`. A stream (`text/event-stream`) stays open while the page shows,
 * so it does not count, which `waitForLoadState('networkidle')` cannot leave out.
 * The first call starts tracking the page's requests; a later call also sees
 * one that started before it (a poll `freeze()`'s clock jump fired).
 */
export async function settle(page: Page): Promise<void> {
    const open = trackRequests(page);

    await page.waitForLoadState('load');

    let quietSince = Date.now();

    while (Date.now() - quietSince < IDLE_MS) {
        await page.waitForTimeout(50);

        if (open.size > 0) {
            quietSince = Date.now();
        }
    }

    await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Signs the page in before it loads: the token the login page would keep. */
export async function signInBeforeLoad(page: Page): Promise<void> {
    await page.addInitScript((token) => {
        sessionStorage.setItem('chamvi.token', token);
    }, E2E_TOKEN);
}
