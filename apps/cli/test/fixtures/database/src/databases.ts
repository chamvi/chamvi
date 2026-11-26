import { databaseModule } from '@chamvi/app';
import { notes, tags } from './entities.ts';
import { Init1795000000000 } from './migrations/notes/1795000000000-init.ts';

export const notesDatabase = () => databaseModule({
    name: 'notes',
    entities: [notes],
    migrations: [Init1795000000000],
    migrationsDirectory: new URL('./migrations/notes/', import.meta.url),
    migrationsTableName: 'notes_migrations',
});

export const tagsDatabase = () => databaseModule({
    name: 'tags',
    entities: [tags],
    migrations: [],
    migrationsDirectory: new URL('./migrations/tags/', import.meta.url),
    migrationsTableName: 'tags_migrations',
});
