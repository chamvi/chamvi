/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { Container } from 'validup';
import { describe, expect, it } from 'vitest';
import { isFilled, isPayload } from '../../../../app/forms/validators.ts';

function check(validator: ReturnType<typeof isFilled>, value: unknown) {
    const container = new Container<{ value: unknown }>();

    container.mount('value', validator);

    return container.safeRun({ value });
}

describe('form validators', () => {
    it('isFilled refuses a blank token without echoing it and trims a filled one', async () => {
        const blank = await check(isFilled(), ' \t ');

        expect(blank.success).toBe(false);
        expect(blank.success ? [] : blank.error.issues.map((issue) => issue.code)).toEqual(['required']);
        expect(JSON.stringify(blank.success ? undefined : blank.error.issues)).not.toContain('\\t');

        const filled = await check(isFilled(), '  secret ');

        expect(filled).toMatchObject({ success: true, data: { value: 'secret' } });
    });

    it('isPayload reads JSON, an empty payload as {}, and refuses anything else', async () => {
        expect(await check(isPayload(), '{ "env": "staging" }')).toMatchObject({ success: true, data: { value: { env: 'staging' } } });
        expect(await check(isPayload(), '  ')).toMatchObject({ success: true, data: { value: {} } });

        const invalid = await check(isPayload(), '{ nope');

        expect(invalid.success).toBe(false);
        expect(invalid.success ? [] : invalid.error.issues.map((issue) => [issue.code, issue.path])).toEqual([['json', ['value']]]);
    });
});
