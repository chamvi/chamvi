import type { PermissionHolder } from '@chamvi/access';
import { Permission, can, canSome } from '@chamvi/access';

// an authup attributes policy over the resource
const onlyTriage = { type: 'attributes', query: { name: 'triage' } };

// may run every agent, and read only the agent "triage"
const principal: PermissionHolder = {
    permissions: [
        { permission: { name: Permission.AGENT_RUN } },
        { permission: { name: Permission.AGENT_READ }, policies: [onlyTriage] },
    ],
};

export async function checks() {
    const triage = { name: 'triage', private: false };
    const other = { name: 'other', private: false };

    return {
        runTriage: await can(principal, Permission.AGENT_RUN, { attributes: triage }),
        readTriage: await can(principal, Permission.AGENT_READ, { attributes: triage }),
        readOther: await can(principal, Permission.AGENT_READ, { attributes: other }),
        // a list route: may the principal read some agent?
        readSome: await canSome(principal, Permission.AGENT_READ),
    };
}
