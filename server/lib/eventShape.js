/**
 * One event in the shape the internal service API answers with, whichever
 * query produced the row, so that a list entry, an event's own answer and the
 * snapshot an outbox entry carries are the same object with the same fields.
 *
 * The Discord bot reads all three, and a field that appeared in one of them
 * and not in the others would be a difference the bot has to know about.
 *
 * @param {object} row a row in the EVENT_COLUMNS shape, or the row getEventById returns
 */
export function presentEvent(row) {
  return {
    event_id:      row.event_id,
    rso_id:        row.rso_id,
    rso_name:      row.rso_name ?? null,
    title:         row.title,
    description:   row.description ?? null,
    start_time:    row.start_time,
    end_time:      row.end_time,
    is_private:    Boolean(row.is_private),
    cancelled_at:  row.cancelled_at ?? null,
    location_id:   row.location_id ?? null,
    building:      row.building ?? null,
    room_number:   row.room_number ?? null,
    location_text: row.location_text ?? null,
    location_note: row.location_note ?? null,
    series_id:             row.series_id ?? null,
    series_frequency:      row.series_frequency ?? null,
    series_interval_weeks: row.series_interval_weeks ?? null,
    series_days_of_week:   row.series_days_of_week ?? null,
    series_ends_on:        row.series_ends_on ?? null,
    interest_count: Number(row.interest_count ?? 0),
  };
}
