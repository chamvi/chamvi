/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { ConnectionNotConfiguredError, ErrorCode } from '@chamvi/core';
import { createDeferredGithubApp } from '../../../src/app/deferred.ts';

describe('createDeferredGithubApp', () => {
    it('names its connection while unbound', () => {
        const app = createDeferredGithubApp({ connection: 'acme' });

        expect(() => app.appId).toThrow(ConnectionNotConfiguredError);
        expect(() => app.appId).toThrow('The connection "acme" is not configured.');
    });

    it('for an agent no connection serves, names the agent and no connection, with the not-configured code', () => {
        const app = createDeferredGithubApp({ agent: 'stranger' });
        const error = (() => {
            try {
                return app.appId;
            } catch (caught) {
                return caught;
            }
        })();

        expect(error).toMatchObject({ code: ErrorCode.CONNECTION_NOT_CONFIGURED });
        expect((error as Error).message).toMatch(/^No GitHub connection is available to the agent "stranger"/);
        expect((error as Error).message).not.toContain('connection "');
    });
});
