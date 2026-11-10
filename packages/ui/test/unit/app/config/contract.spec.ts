/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { CONFIG_ELEMENT_ID } from '@chamvi/ui';
import { CONFIG_ELEMENT_ID as KIT_CONFIG_ELEMENT_ID, readConfig } from '@chamvi/ui-kit';
import type { UiConfig as KitUiConfig } from '@chamvi/ui-kit';
import { describe, expect, it } from 'vitest';
import type { UiConfig } from '../../../../src/config/types.ts';

// the server half (`uiRoutes`) and the browser half (the kit) of one wire contract
describe('the injected config block', () => {
    it('is read from the element the server writes', () => {
        expect(KIT_CONFIG_ELEMENT_ID).toBe(CONFIG_ELEMENT_ID);
    });

    it('has the shape the server writes', () => {
        const written: UiConfig = {
            apiBase: '/api',
            uiBase: '/api/ui',
            auth: { tokens: false, authup: { url: 'https://auth.example.com/api', clientId: 'chamvi' } },
        };
        const read: KitUiConfig = readConfig({ getElementById: () => ({ textContent: JSON.stringify(written) }) as never });
        const back: UiConfig = read;

        expect(back).toEqual(written);
    });
});
