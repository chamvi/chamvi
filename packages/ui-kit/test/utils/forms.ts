/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import vuecs from '@vuecs/core';
import installForms from '@vuecs/forms';
import tailwind from '@vuecs/theme-tailwind';
import type { App } from 'vue';
import { FORM_THEME } from '../../src/shell/constants.ts';
import { installValidation } from '../../src/shell/validation.ts';

/** What mountPage installs for a form: vuecs with the form theme, its form components, the validation messages. */
export function installFormKit(app: App): void {
    app.use(vuecs, { themes: [tailwind(), FORM_THEME] });
    app.use(installForms);
    installValidation(app);
}
