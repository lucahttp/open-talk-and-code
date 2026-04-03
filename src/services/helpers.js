/** @module helpers */

/**
 * Check if an object is 'empty'.
 * @param {any} o The object to check.
 * @return {boolean} True if the object is empty.
 */
export const isEmpty = (o) => {
    return (
        o === null ||
        o === undefined ||
        o === '' ||
        o === 'null' ||
        (Array.isArray(o) && o.length === 0) ||
        (typeof o === 'object' &&
            o.constructor.name === 'Object' &&
            Object.getOwnPropertyNames(o).length === 0)
    );
};

/**
 * Returns a promise that resolves after a given number of milliseconds.
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
