// #region controller
// src/adapters/http/controllers/note.ts: reads the request, calls one service method
import { ForceLoggedInMiddleware, RequiredJsonBodyMiddleware, usePrincipal } from '@chamvi/app';
import {
    DBody,
    DContext,
    DController,
    DGet,
    DPath,
    DPost,
    DStatus,
} from '@routup/decorators';
import type { IAppEvent } from 'routup';
import type { Note, NoteService } from './service.ts';

@DController('/notes')
export class NoteController {
    protected service: NoteService;

    constructor(ctx: { service: NoteService }) {
        this.service = ctx.service;
    }

    // no middleware and no check in the service: unauthenticated.
    // Declared before /:id, which would otherwise answer GET /notes/count
    @DGet('/count')
    async count(): Promise<{ count: number }> {
        return { count: this.service.count() };
    }

    // 401 without a principal; the service answers 403 without note_read
    @DGet('/:id', [ForceLoggedInMiddleware])
    async get(@DPath('id') id: string, @DContext() event: IAppEvent): Promise<Note> {
        return this.service.getOne(await usePrincipal(event), id);
    }

    // logged in, a JSON body of at most the app's bodyLimit (400, 413, 415)
    @DPost('', [RequiredJsonBodyMiddleware])
    @DStatus(201)
    async create(@DBody() body: unknown, @DContext() event: IAppEvent): Promise<Note> {
        return this.service.create(await usePrincipal(event), body);
    }
}
// #endregion controller
