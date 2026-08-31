/**
 * A backup destination.
 *
 * Implementations move a finished dump file to durable storage and manage
 * retention there. The on-box implementation is the only one today. An
 * off-box implementation (object storage) is planned and is the reason this
 * is an interface rather than inline file handling: adding one should be a
 * new class, not a change to the cutover script.
 *
 * @typedef {object} Destination
 * @property {(tmpPath: string, name: string) => Promise<string>} store
 *   Moves the dump into place and returns its final path.
 * @property {() => Promise<string[]>} list
 *   Returns stored dump paths, newest first.
 * @property {() => Promise<void>} prune
 *   Removes dumps beyond the retention policy.
 */
export {};
