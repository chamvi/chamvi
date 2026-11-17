/*
 * Copyright (c) 2026.
 * Author Peter Placzek (tada5hi)
 * For the full copyright and license information,
 * view the LICENSE file that was distributed with this source code.
 */

import { describe, expect, it } from 'vitest';
import { EntityDeadlockError } from '@chamvi/store';
import { MemoryRegistry } from '@chamvi/store-memory';

describe('memory registry locks', () => {
    it('a request in the tick of a handoff sees no cycle that does not exist', async () => {
        const registry = new MemoryRegistry();
        const t1 = registry.begin();
        const t2 = registry.begin();
        const t3 = registry.begin();

        await registry.lockRow('e', 'L', t1);
        await registry.lockRow('e', 'M', t2);

        const t2OnL = registry.lockRow('e', 'L', t2);
        const t3OnL = registry.lockRow('e', 'L', t3);

        // L goes to t2; in the same tick t3 asks for M: t3 waits for t2 only, no cycle
        registry.commit(t1);

        const t3OnM = registry.lockRow('e', 'M', t3);

        await t2OnL;
        registry.commit(t2);

        await expect(t3OnM).resolves.toBeUndefined();
        await expect(t3OnL).resolves.toBeUndefined();
        registry.commit(t3);
    });

    it('a request in the tick of a refusal sees no cycle that does not exist', async () => {
        const registry = new MemoryRegistry();
        const a = registry.begin();
        const t = registry.begin();
        const r = registry.begin();
        const b = registry.begin();

        await registry.lockRow('e', 'L', a);
        await registry.lockRow('e', 'M', t);
        await registry.lockRow('e', 'N', b);

        const tOnL = registry.lockRow('e', 'L', t);
        const rOnL = registry.lockRow('e', 'L', r);
        const bOnM = registry.lockRow('e', 'M', b);

        // t -> b -> t: refused, and t's wait on L is dropped
        const tOnN = registry.lockRow('e', 'N', t);

        // in the same tick r, waiting on L (owner a), asks for M (owner t, b ahead): no cycle
        const rOnM = registry.lockRow('e', 'M', r);

        await expect(tOnN).rejects.toBeInstanceOf(EntityDeadlockError);
        await expect(tOnL).rejects.toBeInstanceOf(EntityDeadlockError);

        registry.rollback(t);
        await bOnM;
        registry.commit(a);
        await rOnL;
        registry.commit(b);

        await expect(rOnM).resolves.toBeUndefined();
        registry.commit(r);
    });
});
