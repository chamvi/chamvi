/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { Theme } from '@vuecs/core';

/**
 * Stacked on the Tailwind theme: a `VCFormGroup` is a `.field` with the
 * mockup's label, hint and message classes (style.css), and a control of an
 * invalid field gets `is-invalid`. A pristine required field (severity
 * `warning`) keeps its plain border.
 */
export const FORM_THEME: Theme = {
    elements: {
        formGroup: {
            classes: {
                root: 'field',
                label: 'field-label',
                hint: 'hint',
                validationError: 'field-invalid',
                validationWarning: '',
            },
        },
        validationGroup: {
            classes: { item: 'field-msg' },
            variants: {
                severity: {
                    error: { item: 'field-msg-error' },
                    warning: { item: 'field-msg-warning' },
                    success: { item: '' },
                },
            },
        },
        formInput: { variants: { severity: { error: { root: 'is-invalid' }, warning: { root: '' } } } },
        formTextarea: { variants: { severity: { error: { root: 'is-invalid' }, warning: { root: '' } } } },
        formSelect: { variants: { severity: { error: { trigger: 'is-invalid' }, warning: { trigger: '' } } } },
    },
};
