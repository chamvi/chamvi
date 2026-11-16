/* eslint @tada5hi/type-declaration-location: "off" -- Keep the exported contract in the self-contained instructional snippet. */
// #region service
// src/core/note/service.ts: the permission checks and the validation live here, never in the controller
import { assertGranted } from '@chamvi/app';
import type { IClock, Principal } from '@chamvi/app';
import { BadRequestError, NotFoundError } from '@ebec/http';
import { isObject } from 'smob';

export type Note = {
    id: string;
    text: string;
};

// an app's own names: grant them as bindings, `"*"` covers chamvi's names only
export const NOTE_READ = 'note_read';
export const NOTE_WRITE = 'note_write';

export class NoteService {
    protected clock: IClock;

    // the app's own storage, e.g. a repository over its own TypeORM data source
    protected notes = new Map<string, Note>();

    constructor(ctx: { clock: IClock }) {
        this.clock = ctx.clock;
    }

    count(): number {
        return this.notes.size;
    }

    async getOne(principal: Principal, id: string): Promise<Note> {
        await assertGranted(principal, this.clock, NOTE_READ);

        const note = this.notes.get(id);

        if (!note) {
            throw new NotFoundError({ message: `The note "${id}" does not exist.` });
        }

        return note;
    }

    async create(principal: Principal, body: unknown): Promise<Note> {
        await assertGranted(principal, this.clock, NOTE_WRITE);

        if (!isObject(body) || typeof body.text !== 'string' || body.text.length === 0) {
            throw new BadRequestError({ message: 'text must be a non-empty string.' });
        }

        const note = { id: crypto.randomUUID(), text: body.text };

        this.notes.set(note.id, note);

        return note;
    }
}
// #endregion service
