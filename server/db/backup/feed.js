import { createReadStream } from 'node:fs';

/**
 * Feed a dump file into a client process over its standard input.
 *
 * The client stops reading the moment it rejects a statement, which leaves the
 * writer holding a closed pipe. That write failure is not the one worth
 * reporting, because the client's exit code and stderr say what actually went
 * wrong. Node emits it on the stdin stream, and with no listener there it
 * becomes an uncaught exception that kills the process before the exit code
 * can be read at all, turning every restore failure into an unexplained EPIPE.
 *
 * A failure to read the dump is a real failure and is passed on. The client is
 * stopped in that case, because it would otherwise sit waiting on input that
 * is never coming and hold the process open behind it.
 *
 * @param {import('node:child_process').ChildProcess} child the client process
 * @param {string} path dump file to feed it
 * @param {(err: Error) => void} reject called on a failure worth reporting
 */
export function feedDump(child, path, reject) {
  const source = createReadStream(path);

  source.on('error', err => {
    child.kill();
    reject(err);
  });

  child.stdin.on('error', err => {
    if (err.code !== 'EPIPE' && err.code !== 'ERR_STREAM_DESTROYED') reject(err);
  });

  source.pipe(child.stdin);
}
