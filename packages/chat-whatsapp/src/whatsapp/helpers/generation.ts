/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { SignalDataSet, SignalDataTypeMap, SignalKeyStore } from 'baileys';
import { InvalidRunStateError } from '@chamvi/core';
import type { WhatsAppConnectionRun, WhatsAppGeneration } from '../types.ts';

/**
 * Runs an auth call of the generation, tracked until it settles; refused
 * (InvalidRunStateError) once the generation stopped admitting.
 */
export function admit<T>(generation: WhatsAppGeneration, call: () => T | Promise<T>): Promise<T> {
    if (!generation.admitting) {
        return Promise.reject(new InvalidRunStateError('The WhatsApp auth lease of this connection has ended; the auth call is refused.'));
    }

    let task: Promise<T>;

    try {
        task = Promise.resolve(call());
    } catch (error) {
        task = Promise.reject(error);
    }

    generation.writes.add(task);

    const forget = () => generation.writes.delete(task);

    task.then(forget, forget);

    return task;
}

/** The lease's key store behind the generation guard: Baileys gets this one only. */
export function guardKeys(generation: WhatsAppGeneration, keys: SignalKeyStore): SignalKeyStore {
    return {
        get: <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => admit(generation, () => keys.get(type, ids)),
        set: (data: SignalDataSet) => admit(generation, () => keys.set(data)),
        ...(keys.clear ? { clear: () => admit(generation, () => keys.clear!()) } : {}),
    };
}

export function clearRetry(run: WhatsAppConnectionRun): void {
    run.retry?.clear();
    delete run.retry;
}
