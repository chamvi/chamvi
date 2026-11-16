/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

export enum NoteStatus {
    Open = 'open',
    Done = 'done',
}

/** The `design:type` name of each decorated property, by property key. */
export const COLUMNS: Record<string, string> = {};

function Column(): PropertyDecorator {
    return (target, key) => {
        const type: unknown = Reflect.getMetadata('design:type', target, key);

        COLUMNS[String(key)] = typeof type === 'function' ? type.name : String(type);
    };
}

export class Note {
    @Column()
    title!: string;

    status: NoteStatus = NoteStatus.Open;
}
