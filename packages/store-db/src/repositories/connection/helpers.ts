/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import type { DeepPartial } from 'typeorm';
import type { ConnectionEntryRecord, ConnectionRecord, ConnectionSecretRecord } from '@chamvi/store';
import type { ConnectionEntity, ConnectionEntryEntity, ConnectionSecretEntity } from '../../entities/index.ts';

/** A copy of stored bytes into a plain Uint8Array: a Buffer would leak its toJSON. */
const plain = (value: Uint8Array) => new Uint8Array(value);

/** Bytes as the bytea parameter the driver expects; absent stays absent. */
const bytea = (value: Uint8Array | undefined) => (value === undefined ? undefined : Buffer.from(value));

/**
 * The columns of a (partial) connection: an absent property maps to an
 * absent column. The record type requires `settings` and
 * `configRevision`, so a whole record never leaves a column to its
 * database default.
 */
export function toConnectionEntity(value: Partial<ConnectionRecord>): DeepPartial<ConnectionEntity> {
    return {
        id: value.id,
        name: value.name,
        type: value.type,
        keyId: value.keyId,
        wrappedKey: bytea(value.wrappedKey),
        settings: value.settings,
        configRevision: value.configRevision,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
    } as DeepPartial<ConnectionEntity>;
}

export function fromConnectionEntity(entity: ConnectionEntity): ConnectionRecord {
    return {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        keyId: entity.keyId,
        wrappedKey: plain(entity.wrappedKey),
        settings: entity.settings,
        configRevision: entity.configRevision,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    };
}

export function toConnectionEntryEntity(value: Partial<ConnectionEntryRecord>): DeepPartial<ConnectionEntryEntity> {
    return {
        id: value.id,
        connectionId: value.connectionId,
        key: value.key,
        value: bytea(value.value),
    } as DeepPartial<ConnectionEntryEntity>;
}

export function fromConnectionEntryEntity(entity: ConnectionEntryEntity): ConnectionEntryRecord {
    return {
        id: entity.id,
        connectionId: entity.connectionId,
        key: entity.key,
        value: plain(entity.value),
    };
}

export function toConnectionSecretEntity(value: Partial<ConnectionSecretRecord>): DeepPartial<ConnectionSecretEntity> {
    return {
        id: value.id,
        connectionId: value.connectionId,
        name: value.name,
        value: bytea(value.value),
    } as DeepPartial<ConnectionSecretEntity>;
}

export function fromConnectionSecretEntity(entity: ConnectionSecretEntity): ConnectionSecretRecord {
    return {
        id: entity.id,
        connectionId: entity.connectionId,
        name: entity.name,
        value: plain(entity.value),
    };
}
