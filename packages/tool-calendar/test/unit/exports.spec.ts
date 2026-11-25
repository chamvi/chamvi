/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import * as calendar from '@chamvi/tool-calendar';
import * as module from '@chamvi/tool-calendar/module';

describe('public api', () => {
    it('exports the tools, the client, the context pair and the limits', () => {
        expect(calendar.calendarTools).toBeTypeOf('function');
        expect(calendar.createCalendarClient).toBeTypeOf('function');
        expect(calendar.provideCalendarContext).toBeTypeOf('function');
        expect(calendar.injectCalendarContext).toBeTypeOf('function');
        expect(calendar.CALENDAR_REQUEST_ERROR_CODE).toBe('calendar_request');
        expect(calendar.CALENDAR_DEFAULT_TIMEZONE).toBe('Europe/Berlin');
        expect(calendar.CALENDAR_TIMEOUT_MS).toBe(30_000);
        expect(calendar.CALENDAR_RANGE_MAX_DAYS).toBe(92);
        expect(calendar.CALENDAR_EVENTS_DEFAULT_LIMIT).toBe(100);
        expect(calendar.CALENDAR_EVENTS_MAX_LIMIT).toBe(500);
        expect(calendar.CALENDAR_DESCRIPTION_MAX_CHARS).toBe(2000);
        expect(calendar.CALENDAR_EXPAND_MAX_ITERATIONS).toBe(10_000);
        expect(calendar.CALENDAR_FIELD_MAX_CHARS).toBe(500);
        expect(calendar.createCalendarWriteClient).toBeTypeOf('function');
        expect(calendar.CALENDAR_WRITE_ALLOWED_METHODS).toEqual(['PROPFIND', 'GET', 'PUT', 'DELETE']);
        expect(calendar.CALENDAR_EVENT_MAX_BYTES).toBe(1_048_576);
        expect(calendar.CALENDAR_CHANGED_MESSAGE).toMatch(/^calendar_delete: the event changed/);
        expect(calendar.calendarWriteTools).toBeTypeOf('function');
        expect(calendar.provideCalendarWriteContext).toBeTypeOf('function');
        expect(calendar.injectCalendarWriteContext).toBeTypeOf('function');
        expect(calendar.CALENDAR_ADDRESS_PATTERN.test('a@example.com')).toBe(true);
        expect(calendar.CALENDAR_CREATE_MAX_ATTENDEES).toBe(50);
        expect(calendar.CALENDAR_CREATE_MAX_DAYS).toBe(366);
        expect(calendar.CALENDAR_CREATE_LIMIT_MAX).toBe(20);
        expect(calendar.CALENDAR_CREATE_LIMIT_WINDOW_MS).toBe(3_600_000);
        expect(calendar.CALENDAR_CREATE_LIMIT_BUCKET).toBe('creates');
        expect(calendar.CALENDAR_DELETE_LIMIT_MAX).toBe(20);
        expect(calendar.CALENDAR_DELETE_LIMIT_WINDOW_MS).toBe(3_600_000);
        expect(calendar.CALENDAR_DELETE_LIMIT_BUCKET).toBe('deletes');
    });

    it('keeps the internals internal', () => {
        expect(Object.keys(calendar).sort()).toEqual([
            'CALENDAR_ADDRESS_PATTERN',
            'CALENDAR_CHANGED_MESSAGE',
            'CALENDAR_CREATE_LIMIT_BUCKET',
            'CALENDAR_CREATE_LIMIT_MAX',
            'CALENDAR_CREATE_LIMIT_WINDOW_MS',
            'CALENDAR_CREATE_MAX_ATTENDEES',
            'CALENDAR_CREATE_MAX_DAYS',
            'CALENDAR_DEFAULT_TIMEZONE',
            'CALENDAR_DELETE_LIMIT_BUCKET',
            'CALENDAR_DELETE_LIMIT_MAX',
            'CALENDAR_DELETE_LIMIT_WINDOW_MS',
            'CALENDAR_DESCRIPTION_MAX_CHARS',
            'CALENDAR_EVENTS_DEFAULT_LIMIT',
            'CALENDAR_EVENTS_MAX_LIMIT',
            'CALENDAR_EVENT_MAX_BYTES',
            'CALENDAR_EXPAND_MAX_ITERATIONS',
            'CALENDAR_FIELD_MAX_CHARS',
            'CALENDAR_RANGE_MAX_DAYS',
            'CALENDAR_REQUEST_ERROR_CODE',
            'CALENDAR_TIMEOUT_MS',
            'CALENDAR_WRITE_ALLOWED_METHODS',
            'calendarTools',
            'calendarWriteTools',
            'createCalendarClient',
            'createCalendarWriteClient',
            'injectCalendarContext',
            'injectCalendarWriteContext',
            'provideCalendarContext',
            'provideCalendarWriteContext',
        ]);
    });

    it('exports the module, its name and variables, never the env helpers', () => {
        expect(module.CALENDAR_ACCOUNTS_VARIABLE).toBe('CALENDAR_ACCOUNTS');
        expect(module.CALENDAR_TIMEZONE_VARIABLE).toBe('CALENDAR_TIMEZONE');
        expect(module.CALENDAR_CONNECTION_TYPE).toBe('calendar');
        expect(module.TOOL_CALENDAR_MODULE_NAME).toBe('chamvi:tool-calendar');
        expect(Object.keys(module).sort()).toEqual([
            'CALENDAR_ACCOUNTS_VARIABLE',
            'CALENDAR_CONNECTION_TYPE',
            'CALENDAR_TIMEZONE_VARIABLE',
            'TOOL_CALENDAR_MODULE_NAME',
            'ToolCalendarModule',
            'toolCalendarModule',
        ]);
    });
});
