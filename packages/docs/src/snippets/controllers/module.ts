// #region module
// src/app/modules/note.ts: builds the controller from the container's values
import { existsSync, readFileSync } from 'node:fs';
import { AppToken } from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import { NoteController } from './controller.ts';
import { NoteService } from './service.ts';

// written by `trapi generate` (trapi.config.ts), relative to the app's working directory
const OPENAPI_DOCUMENT = 'dist/openapi.json';

export function noteModule(): IModule {
    return {
        name: 'note',

        async setup(container: IContainer) {
            // the factory runs once, when the http module resolves the token in onReady
            // (start mode and a check), after every module's setup
            container.registerMany(AppToken.HTTP_CONTROLLERS, {
                useFactory: (c) => {
                    const service = new NoteService({ clock: c.resolve(AppToken.CLOCK) });

                    return new NoteController({ service });
                },
            });

            if (existsSync(OPENAPI_DOCUMENT)) {
                container.registerMany(AppToken.OPENAPI_DOCUMENTS, { useValue: JSON.parse(readFileSync(OPENAPI_DOCUMENT, 'utf8')) as object });
            }
        },
    };
}
// #endregion module
