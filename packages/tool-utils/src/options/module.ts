/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { InvalidAgentDefinitionError, ValidationError } from '@chamvi/core';
import { isObject } from 'smob';
import { UTILITY_TOOL_NAMES } from '../tools/constants.ts';
import { resolveZone } from '../tools/zone.ts';
import { DEFAULT_TIMEZONE, TIMEZONE_VARIABLE } from './constants.ts';
import type { UtilityToolName, UtilityToolsOptions, UtilityToolsOptionsNormalized } from './types.ts';

function zoneOf(value: string, source: string): string {
    try {
        return resolveZone(value, source);
    } catch (error) {
        if (error instanceof ValidationError) {
            throw new InvalidAgentDefinitionError(`utilityTools() ${error.message}`);
        }

        throw error;
    }
}

/** The options checked, with their defaults (InvalidAgentDefinitionError). */
export function normalizeOptions(options: UtilityToolsOptions): UtilityToolsOptionsNormalized {
    if (!isObject(options)) {
        throw new InvalidAgentDefinitionError('utilityTools() options must be an object.');
    }

    let timezone = DEFAULT_TIMEZONE;
    const fromEnv = (options.env ?? process.env)[TIMEZONE_VARIABLE];

    if (options.timezone !== undefined) {
        timezone = zoneOf(options.timezone, 'timezone');
    } else if (fromEnv !== undefined && fromEnv.trim() !== '') {
        timezone = zoneOf(fromEnv.trim(), TIMEZONE_VARIABLE);
    }

    let include: UtilityToolName[] = [...UTILITY_TOOL_NAMES];

    if (options.include !== undefined) {
        if (!Array.isArray(options.include) || options.include.length === 0) {
            throw new InvalidAgentDefinitionError('utilityTools() include must be a non-empty array of tool names.');
        }

        for (const name of options.include) {
            if (!UTILITY_TOOL_NAMES.includes(name)) {
                throw new InvalidAgentDefinitionError(
                    `utilityTools() include names an unknown tool "${String(name)}"; known: ${UTILITY_TOOL_NAMES.join(', ')}.`,
                );
            }
        }

        include = [...options.include];
    }

    return { timezone, include };
}
