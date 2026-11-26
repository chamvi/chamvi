import { createApp } from '@chamvi/app';
import { notesDatabase, tagsDatabase } from './databases.ts';

// two databases: every migration command needs --database
export default createApp({ agents: [], modules: [notesDatabase(), tagsDatabase()] });
