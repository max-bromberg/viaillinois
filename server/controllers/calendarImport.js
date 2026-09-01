import {
  planEventImport, applyEventImport, planMidtermImport, applyMidtermImport,
} from '../services/calendarImport.js';
import { checkRsoEditor, checkAnyRsoBoard } from '../middleware/auth.js';

/**
 * Importing a calendar file.
 *
 * The file arrives as text in the request body rather than as a multipart
 * upload. The browser reads the .ics the admin picked and sends its contents,
 * which keeps the server free of an upload parser and of any temporary files.
 *
 * Both endpoints take a preview flag. With it, nothing is written and the plan
 * comes back for the admin to look at first.
 */

/** A malformed calendar is the sender's mistake, not a server fault. */
function respondToImportError(err, res, next) {
  if (/calendar/i.test(err.message)) return res.status(400).json({ error: err.message });
  return next(err);
}

export async function importEvents(req, res, next) {
  try {
    const { rso_id, ics, preview = false } = req.body;
    if (!ics || !rso_id) {
      return res.status(400).json({ error: 'rso_id and ics required' });
    }
    const rsoId = parseInt(rso_id);

    // Importing writes events for one RSO, so it needs that RSO's permission.
    // requireRSOAdmin reads the id from the path, and this one is in the body.
    const permitted = req.user.is_global_admin || await checkRsoEditor(req.user.net_id, rsoId);
    if (!permitted) return res.status(403).json({ error: 'RSO editor access required' });

    if (preview) {
      return res.json(await planEventImport({ ics, rsoId }));
    }
    res.json(await applyEventImport({ ics, rsoId, createdBy: req.user.net_id }));
  } catch (err) { respondToImportError(err, res, next); }
}

/**
 * An import writes the shared exam schedule, so it is held to the same bar as
 * deleting from it: a global admin, or anyone who sits on an RSO board. The
 * schedule belongs to no single RSO, so there is no RSO to be on the board of
 * for a given exam, and sitting on any board is the bar. An ordinary member
 * cannot import, and neither can an editor, whose remit is that RSO's own
 * events. Every import previews first, so nothing is written unseen.
 */
export async function importMidterms(req, res, next) {
  try {
    const permitted = req.user?.is_global_admin || await checkAnyRsoBoard(req.user.net_id);
    if (!permitted) return res.status(403).json({ error: 'Global admin or RSO board access required' });
    const { ics, preview = false } = req.body;
    if (!ics) return res.status(400).json({ error: 'ics required' });

    if (preview) {
      return res.json(await planMidtermImport({ ics }));
    }
    res.json(await applyMidtermImport({ ics }));
  } catch (err) { respondToImportError(err, res, next); }
}
