/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { UiPage } from '@chamvi/http';
import type { APIRequestOptions } from '../types.ts';

/** One entry of `GET /ui-pages`; `path` carries the app's `basePath`, so a plain link works. */
export type UiPageWire = UiPage;

export interface IUiPageAPI {
    getMany(options?: APIRequestOptions): Promise<UiPageWire[]>;
}
