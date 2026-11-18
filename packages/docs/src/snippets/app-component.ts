import { AppToken } from '@chamvi/app';
import type { IContainer, IModule } from '@chamvi/app';
import { defineIntervalComponent } from 'hubwire';

// #region component
export function reportModule(): IModule {
    return {
        name: 'report',

        async setup(container: IContainer) {
            const context = container.resolve(AppToken.CONTEXT);

            // components run in start mode only: a check, a job or a migrate contributes none
            if (context.mode !== 'start' || context.check) {
                return;
            }

            const logger = container.resolve(AppToken.LOGGER);

            container.registerMany(AppToken.COMPONENTS, {
                useValue: {
                    // agent-name rule, unique per app; listed by GET /components
                    name: 'nightly-report',
                    component: defineIntervalComponent({
                        name: 'nightly-report',
                        intervalMs: 60 * 60 * 1000,
                        // the app clock, so tests step it with a ControllableClock
                        clock: container.resolve(AppToken.CLOCK),
                        // never hold the process open for a background job
                        unref: true,
                        handler: async ({ signal }) => {
                            signal.throwIfAborted();
                            // a throw after logging marks the pass failed in the status
                            logger.info('report written');
                        },
                    }),
                },
            });
        },
    };
}
// #endregion component
