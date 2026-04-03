/** @module mutex */

/**
 * A mutex (mutual exclusion) lock.
 */
export class MutexLock {
    constructor() {
        this.holder = Promise.resolve();
    }

    /**
     * Acquires the lock.
     * @returns {Promise<Function>} A promise that resolves when the lock is acquired.
     * Responds with a callable that releases the lock.
     */
    acquire() {
        let awaitResolve;
        const temporaryPromise = new Promise((resolve) => {
            awaitResolve = () => resolve();
        });
        const returnValue = this.holder.then(() => awaitResolve);
        this.holder = temporaryPromise;
        return returnValue;
    }
}
