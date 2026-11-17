import { createApp } from '@chamvi/app';
import { notesDatabase } from './databases.ts';

// one database: the migration commands use it without --database
export default createApp({ agents: [], modules: [notesDatabase()] });
