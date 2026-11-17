import { createApp, databaseModule } from '@chamvi/app';
import { EntitySchema } from 'typeorm';

// a built entry: its migrations directory would be the build's, never the sources'
const notes = new EntitySchema({
    name: 'note',
    tableName: 'notes',
    columns: { id: { type: 'varchar', primary: true } },
});

export default createApp({
    agents: [],
    modules: [databaseModule({
        name: 'notes',
        entities: [notes],
        migrations: [],
        migrationsDirectory: new URL('./dist/migrations/', import.meta.url),
        migrationsTableName: 'notes_migrations',
    })],
});
