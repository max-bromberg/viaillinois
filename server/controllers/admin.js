import bcrypt from 'bcryptjs';
import * as usersDb from '../db/queries/users.js';
import * as pollLogDb from '../db/queries/pollLog.js';
import * as accessDenialsDb from '../db/queries/accessDenials.js';
import { startPollerRun } from '../lib/pollerUtils.js';
import * as astraPoller from '../services/astraPoller.js';
import * as coursesPoller from '../services/coursesPoller.js';
import * as facilitiesPoller from '../services/facilitiesPoller.js';

export async function listUsers(req, res, next) {
  try {
    const users = await usersDb.getAllLocalUsers();
    res.json({ users });
  } catch (err) { next(err); }
}

export async function createUser(req, res, next) {
  try {
    const { net_id, full_name, email, password } = req.body;
    if (!net_id || !full_name || !email || !password) {
      return res.status(400).json({ error: 'net_id, full_name, email, password required' });
    }
    await usersDb.upsertUser({ net_id, full_name, email });
    const hash = await bcrypt.hash(password, 10);
    await usersDb.createLocalAccount(net_id, hash);
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
}

export async function updateUser(req, res, next) {
  try {
    const { netId } = req.params;
    const { full_name, email } = req.body;
    await usersDb.updateUser(netId, { full_name, email });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function resetPassword(req, res, next) {
  try {
    const { netId } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'password required' });
    const hash = await bcrypt.hash(password, 10);
    await usersDb.updateLocalPassword(netId, hash);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function deleteUser(req, res, next) {
  try {
    const { netId } = req.params;
    const result = await usersDb.deleteUser(netId);
    if (!result.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

const POLLER_MAP = {
  astra:      astraPoller.runOnce,
  facilities: facilitiesPoller.runOnce,
  courses:    coursesPoller.runOnce,
};
const POLLER_INSTANCES = {
  astra:      astraPoller,
  facilities: facilitiesPoller,
  courses:    coursesPoller,
};
const VALID_SERVICES = new Set(Object.keys(POLLER_MAP));

export async function getPollStatus(req, res, next) {
  try {
    const pollStatus = await pollLogDb.getLatestRunPerService();
    res.json({ pollStatus });
  } catch (err) { next(err); }
}

export async function getPollHistory(req, res, next) {
  try {
    const { service } = req.params;
    if (!VALID_SERVICES.has(service)) {
      return res.status(400).json({ error: `Unknown service: ${service}` });
    }
    const history = await pollLogDb.getRunHistory(service, 20);
    res.json({ history });
  } catch (err) { next(err); }
}

export async function getUnknownCodes(req, res, next) {
  try {
    const unknownCodes = await pollLogDb.getUnknownCodeFrequency();
    res.json({ unknownCodes });
  } catch (err) { next(err); }
}

export async function triggerPoll(req, res, next) {
  try {
    const { service } = req.params;
    if (!VALID_SERVICES.has(service)) {
      return res.status(400).json({ error: `Unknown service: ${service}` });
    }
    if (POLLER_INSTANCES[service]?.isRunning()) {
      return res.status(409).json({ error: `${service} poller is already running` });
    }
    const logId = await startPollerRun(service, POLLER_MAP[service]);
    res.json({ ok: true, logId });
  } catch (err) { next(err); }
}

/**
 * What VIA refused to serve, by day and reason.
 *
 * This is the surface the operator reads to answer whether the budgets and the
 * shedding thresholds are set anywhere near right. A week of nothing means the
 * limits are not touching real readers. A week of row_budget refusals against
 * the feed means they are too tight and the environment variables should move.
 */
export async function getDenials(req, res, next) {
  try {
    const raw = req.query.days;
    const days = raw === undefined ? 7 : Number(raw);
    if (!Number.isInteger(days) || days < 1) {
      return res.status(400).json({ error: 'days must be a whole number of one or more.' });
    }
    // Retention is ninety days, so a longer window would only scan the table
    // for rows that are not there.
    const denials = await accessDenialsDb.getDenialSeries(Math.min(days, 90));
    res.json({ denials });
  } catch (err) { next(err); }
}
