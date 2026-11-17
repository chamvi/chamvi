/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** One recall setting of the golden file: the two bounds the recall stops at. */
export type RecallSetting = {
    name: string;
    maxItems: number;
    maxHistoryBytes: number;
};

/** What a recall chose: the item ids, how many sent items it left out and the sha256 of its messages. */
export type RecallResult = {
    itemIds: string[];
    omitted: number;
    messages: string;
};

/** An item of the plan: its UTF-8 size and its character (an index into RECALL_CHARACTERS). */
export type RecallItemPlan = [bytes: number, character: number];

/**
 * The golden file `conversation-recall.json`: a seeded plan of 300
 * transcript items (turns of one user item and up to three replies, each
 * reply confirmed or not), the recall settings, and the recall each
 * setting gave on the implementation it was recorded from.
 */
export type RecallGolden = {
    seed: number;
    turns: { user: RecallItemPlan; replies: [bytes: number, character: number, confirmed: number][] }[];
    settings: RecallSetting[];
    /** Per setting, the recall recorded from the in-memory and the PostgreSQL store before the service. */
    expected: Record<string, RecallResult>;
};

/** One, two, three and four UTF-8 bytes per character. */
const RECALL_CHARACTERS = ['a', 'é', '€', '😀'];

export function loadRecallGolden(): RecallGolden {
    return JSON.parse(readFileSync(new URL('./conversation-recall.json', import.meta.url), 'utf8')) as RecallGolden;
}

/** The text of a planned item: a unique label, then its character up to about its size. */
export function recallText(label: string, [bytes, character]: readonly [number, number]): string {
    const prefix = `${label} `;
    const char = RECALL_CHARACTERS[character]!;
    const count = Math.max(1, Math.floor((bytes - Buffer.byteLength(prefix, 'utf8')) / Buffer.byteLength(char, 'utf8')));

    return prefix + char.repeat(count);
}

/** The run of the turn at `index`: a uuid, so the same plan seeds a database. */
export function recallRunId(index: number): string {
    return `00000000-0000-7000-8000-${(index + 1).toString(16).padStart(12, '0')}`;
}

/** The run that recalls with setting `index`. */
export function recallProbeRunId(index: number): string {
    return `00000000-0000-7000-9000-${(index + 1).toString(16).padStart(12, '0')}`;
}

/** The turn operations the plan is seeded through: begin (it must be ready), one emit, end. */
export type RecallSeeder = {
    begin(runId: string, text: string): Promise<void>;
    emit(runId: string, id: string, text: string): Promise<void>;
    end(runId: string, confirmed: string[]): Promise<void>;
};

/** Seed every planned turn: its user item, its replies (pending), then the end confirming the confirmed ones. */
export async function seedRecall(golden: RecallGolden, seeder: RecallSeeder): Promise<void> {
    for (const [index, turn] of golden.turns.entries()) {
        const runId = recallRunId(index);

        await seeder.begin(runId, recallText(`u${index}`, turn.user));

        const confirmed: string[] = [];

        for (const [n, [bytes, character, sent]] of turn.replies.entries()) {
            const id = `assistant:${index}:${n}`;

            await seeder.emit(runId, id, recallText(`a${index}.${n}`, [bytes, character]));

            if (sent === 1) {
                confirmed.push(id);
            }
        }

        await seeder.end(runId, confirmed);
    }
}

/** The recorded form of a snapshot's recall. */
export function recallResultOf(snapshot: {
    itemIds: string[];
    omitted: number;
    messages: unknown;
}): RecallResult {
    return {
        itemIds: [...snapshot.itemIds],
        omitted: snapshot.omitted,
        messages: createHash('sha256').update(JSON.stringify(snapshot.messages)).digest('hex'),
    };
}
