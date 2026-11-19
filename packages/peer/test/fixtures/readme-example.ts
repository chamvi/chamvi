import { systemClock } from '@chamvi/core';
import type { IClock, IPeerResolver } from '@chamvi/core';
import { createPeerResolver } from '@chamvi/peer';

export function createPeers(options: { clock?: IClock; fetch?: typeof fetch } = {}): IPeerResolver {
    const { CHAMVI_PEER_DEV_TOKEN } = process.env;

    if (!CHAMVI_PEER_DEV_TOKEN) {
        throw new Error('Set CHAMVI_PEER_DEV_TOKEN.');
    }

    return createPeerResolver({
        peers: {
            dev: {
                // the peer's public URL: its origin plus its basePath
                url: 'https://dev.example',
                // the bearer this app sends to dev (a static token of dev's CHAMVI_TOKENS)
                outgoing: { token: CHAMVI_PEER_DEV_TOKEN },
                // dev calls this app as the static token principal "peer-dev"
                incoming: { token: 'peer-dev' },
            },
        },
        clock: options.clock ?? systemClock,
        fetch: options.fetch,
        // this app's approval link, shown to dev for runs it started here
        approvalUrl: ({ runId, approvalId }) => `https://assistants.example/ui/approvals?run=${encodeURIComponent(runId)}&approval=${encodeURIComponent(approvalId)}`,
    });
}
