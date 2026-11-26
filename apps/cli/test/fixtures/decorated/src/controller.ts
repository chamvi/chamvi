/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { DController, DGet } from '@routup/decorators';

@DController('/notes')
export class NoteController {
    @DGet('')
    list(): string[] {
        return [];
    }

    fail(): never {
        throw new Error('the decorated fixture fails');
    }
}
