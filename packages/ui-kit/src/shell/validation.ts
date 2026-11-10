/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { install as installIlingoValidup } from '@ilingo/validup-vue';
import { install as installIlingo } from '@ilingo/vue';
import type { App } from 'vue';

/**
 * The validation messages of every form (`<IFieldValidation>` into
 * `<VCFormGroup :validation>`): ilingo first, then its validup catalog,
 * which looks the ilingo instance up.
 */
export function installValidation(app: App): void {
    // a fresh instance, locale en (its default); the catalog comes from the validup install
    installIlingo(app);
    installIlingoValidup(app);
}
