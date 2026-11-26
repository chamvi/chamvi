import { createApp } from '@chamvi/app';
import { echo } from './agents.ts';

export default createApp({ agents: [echo] });
