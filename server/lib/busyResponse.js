/**
 * What VIA says when it will not serve a request.
 *
 * Both sentences live here and nowhere else, so that the shedding middleware,
 * the public budgets, the bounded database queue and the HTML shell all refuse
 * in the same words. A refusal is a message to a student, so it says what
 * happened and when to come back, in complete sentences.
 */

export const BUSY_MESSAGE = 'VIA is busy right now. Please try again in a moment.';
export const BUDGET_MESSAGE =
  'You are reading VIA faster than we can serve everyone. Please try again in a minute.';

/**
 * The load is real and temporary, so the answer is 503 and a retry window.
 * @param {import('express').Response} res
 * @param {number} retryAfterSeconds
 */
export function sendBusy(res, retryAfterSeconds) {
  res.set('Retry-After', String(retryAfterSeconds));
  return res.status(503).json({ error: BUSY_MESSAGE, retry_after_seconds: retryAfterSeconds });
}

/**
 * The caller is over a budget, which is neither an error on their part nor a
 * fault on ours, so the answer is 429 and a short window. Nothing here bans
 * anybody, and the window never grows.
 * @param {import('express').Response} res
 * @param {number} retryAfterSeconds
 */
export function sendBudgetExhausted(res, retryAfterSeconds) {
  res.set('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({ error: BUDGET_MESSAGE, retry_after_seconds: retryAfterSeconds });
}

/**
 * The same sentence for a browser that asked for a page rather than for JSON.
 * It fetches nothing, because whatever it fetched would be coming from the
 * server that is already struggling.
 */
export function busyHtml() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VIA is busy</title>
<style>
body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: flex;
       align-items: center; justify-content: center; background: #fafafa; color: #18181b; }
main { max-width: 32rem; padding: 2rem; text-align: center; }
h1 { font-size: 1.25rem; margin: 0 0 0.75rem; }
p { margin: 0; color: #52525b; line-height: 1.6; }
</style>
</head>
<body><main>
<h1>VIA is busy</h1>
<p>${BUSY_MESSAGE}</p>
</main></body>
</html>`;
}
