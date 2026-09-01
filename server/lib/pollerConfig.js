/**
 * Whether the background pollers should run.
 *
 * They talk to Course Explorer and Ad Astra the moment the server boots, which
 * is right in production and wrong on a local preview, where it means traffic
 * to the university every time someone starts the app.
 *
 * The default is on. Only an explicit "false" or "0" turns them off, so a
 * misspelled value cannot quietly stop ingestion in production.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function pollersEnabled(env) {
  const value = env.POLLERS_ENABLED;
  return value !== 'false' && value !== '0';
}
