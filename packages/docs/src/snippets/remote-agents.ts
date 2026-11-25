import {
    agent,
    createApp,
    defineModelAgent,
    defineRemoteAgent,
    dispatchTools,
} from '@chamvi/app';
import { openclawModule } from '@chamvi/channel-openclaw/module';
import { peerModule } from '@chamvi/peer/module';

function requireEnv(name: string): string {
    const value = process.env[name];

    if (!value) {
        throw new Error(`Set ${name}.`);
    }

    return value;
}

// #region caller
// the app "assistants": alfred hands coding work to developer, which the app "dev" runs
const developer = defineRemoteAgent({
    name: 'developer',
    // the peer, and the agent and role there (default: the same name, role "default")
    peer: 'dev',
    agent: 'developer',
    // who may dispatch to the stand-in here, as for any local agent
    channels: [agent.on({ from: ['alfred'] })],
    // approvals of the remote run are announced here, never to a caller's source
    approvals: { channel: 'openclaw', address: 'owner' },
    // the whole remote run, approvals included (default 24 h)
    timeoutMs: 6 * 60 * 60 * 1000,
});

const alfred = defineModelAgent({
    name: 'alfred',
    instructions: 'Hand every coding task to the developer and report its outcome.',
    tools: dispatchTools({ agents: [{ agent: 'developer', roles: ['default'] }], wait: true }),
});

export const assistants = createApp({
    model: 'anthropic/claude-sonnet-5-5',
    agents: [alfred, developer],
    modules: [
        openclawModule(),
        peerModule({
            peers: {
                dev: {
                    // the peer's public URL: origin plus basePath
                    url: 'https://dev.example',
                    // the bearer this app sends to dev: a static token of dev's TOKENS
                    outgoing: { token: requireEnv('PEER_DEV_TOKEN') },
                    // dev calls back (wake, its own remote agents) as the static token "peer-dev" here
                    incoming: { token: 'peer-dev' },
                },
            },
        }),
    ],
});
// #endregion caller

// #region receiver
// the app "dev": developer accepts runs from alfred of the peer "assistants" only
const developerAtDev = defineModelAgent({
    name: 'developer',
    instructions: 'Implement the task in a workspace and open a pull request.',
    channels: [agent.on({ from: ['assistants/alfred'] })],
});

export const dev = createApp({
    model: 'anthropic/claude-sonnet-5-5',
    agents: [developerAtDev],
    modules: [
        peerModule({
            peers: {
                assistants: {
                    url: 'https://assistants.example',
                    // assistants calls here as the static token "peer-assistants" (narrow grants)
                    incoming: { token: 'peer-assistants' },
                    // dev wakes the stand-in when a run settles or waits on an approval
                    outgoing: { token: requireEnv('PEER_ASSISTANTS_TOKEN') },
                    // where dev announces approvals of runs assistants started (optional)
                    approvals: { channel: 'openclaw', address: 'owner' },
                },
            },
        }),
        openclawModule(),
    ],
});
// #endregion receiver

