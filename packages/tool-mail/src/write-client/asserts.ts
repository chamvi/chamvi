/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError } from '@chamvi/core';
import { isObject } from 'smob';
import { MAIL_SMTP_PORTS, MAIL_SMTP_SECURITY } from './constants.ts';
import type { MailSmtpNormalized, MailSmtpSettings } from './types.ts';

/** The SMTP settings checked (InvalidAgentDefinitionError naming the field, never a value), with their defaults. */
export function normalizeSmtp(value: unknown, field: string): MailSmtpNormalized {
    if (!isObject(value)) {
        throw new InvalidAgentDefinitionError(`${field} must be an object.`);
    }

    const settings = value as Partial<MailSmtpSettings>;

    if (typeof settings.host !== 'string' || settings.host.length === 0) {
        throw new InvalidAgentDefinitionError(`${field}.host must be a non-empty string.`);
    }

    const security = settings.security ?? 'tls';

    if (!MAIL_SMTP_SECURITY.includes(security)) {
        throw new InvalidAgentDefinitionError(`${field}.security must be one of ${MAIL_SMTP_SECURITY.join(', ')}.`);
    }

    const port = settings.port ?? MAIL_SMTP_PORTS[security];

    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
        throw new InvalidAgentDefinitionError(`${field}.port must be an integer from 1 to 65535.`);
    }

    return {
        host: settings.host,
        port,
        security,
    };
}
