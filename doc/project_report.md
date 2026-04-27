# CS 411 Final Project Report
**Project:** Virtually Integrated Agenda (VIA)  
**Team:** Team001-TableForFour  
**Members:** Max Bromberg, Meenakshi De, Jonathan Martinez-herrada, Zainab Memon

---

## 1. Changes in Project Direction

The core mission of VIA remained unchanged: a centralized event management platform for UIUC ECE department RSOs, replacing the fragmented combination of email lists, Discord servers, and Instagram posts that RSOs currently rely on. The two-view architecture from the proposal, a Public Feed for students and a Logistics Dashboard for RSO admins, was fully realized.

A major addition was automated **data ingestion** from live UIUC sources. Rather than manually maintaining a static rooms database, we wrote scrapers that pull facility reservation data from the UIUC Astra and Tableau scheduling systems, and course section data from the UIUC Course Explorer. This gives VIA real-time awareness of which rooms are occupied and when, a requirement for the intelligent scheduler to work correctly.

---

## 2. Application Usefulness

VIA achieved its core usefulness goals. Students visiting the Public Feed can discover all ECE RSO events in one place, filter by tag, keyword, date range, or RSO, and see confirmed midterm exams on a shared calendar. RSO board members can create events through a guided form that automatically prevents double-booking against both other RSO events and facility reservations scraped from UIUC's own scheduling systems.

The intelligent scheduler, which takes a set of user constraints (duration, date range, preferred time of day, target courses, midterm sensitivity) and returns a ranked list of available ECE rooms with conflict-awareness scores, represents meaningful utility beyond what any current UIUC tool offers for student organizations.

---

## 3. Schema and Data Source Changes

**Data sources:** The original proposal identified manually curated RSO and event data as the primary source, with the suggestion of supplementing from a public API. In the final implementation, the primary data sources became automated:
- **UIUC Course Explorer API**: scraped to populate `Courses` and `Course_Sections` (~3,500+ section rows)
- **UIUC Astra scheduling system**: scraped to populate `Facility_Reservations` (~10,000+ rows)
- **UIUC Tableau facility viewer**: secondary source for `Facility_Reservations`
- **Seed data**: RSOs, users, events, tags, midterms, RSVPs manually seeded for demo purposes

**Schema changes from Stage 2:** The final schema added several tables and columns that were not in the original ER diagram:
- `LocalAccounts`: separated password hashes from `Users` so the `Users` table can be populated from Azure AD without requiring a local password
- `Facility_Reservations`: present in the original design as a placeholder; substantially expanded with `source` (SET type distinguishing Astra vs. Tableau scrapers), `customer`, `event_name`, and `scraped_at` fields
- `Poll_Log` and `Unknown_Building_Codes`: operational tables added to track data ingestion health; not in the original ER diagram

---

## 4. ER Diagram and Table Implementation Differences

The original ER diagram modeled a simpler system: Users, RSOs, Events, Locations, Midterms, and Tags, with RSVPs as the main interaction. The final schema has thirteen tables.

The most notable structural difference is the treatment of authentication. Originally, `Users` stored credentials directly. The final design separates `LocalAccounts` (password hashes) from `Users` (identity), which more accurately reflects how modern applications handle multiple auth providers, `Users` can be populated from Azure AD, Google, or any provider without touching the credentials table.

The `Facility_Reservations` table's `source` column using a `SET` type rather than a `VARCHAR` enum is a deliberate constraint choice: it allows a reservation to be attributed to multiple sources if seen in both Astra and Tableau, while still being constrained to known values. This is more suitable than a plain string for a field with a small fixed domain.

---

## 5. Functionalities Added or Removed

**Added:**
- **Intelligent Scheduler**: the creative component; takes user constraints and returns ranked available time slots with conflict-awareness scoring
- **Venue Recommender**: lightweight feature that suggests available rooms fitting attendance and AV requirements for a proposed event time
- **Kiosk view**: a minimal full-screen display of upcoming events suitable for a lobby monitor
- **Admin observability dashboard**: shows data ingestion health (poll logs, unknown building codes, row counts) for debugging the scrapers
- **RSVP system**: users can mark Going / Maybe / Not Going on events
- **Automated data ingestion**: background pollers for courses, Astra reservations, and Tableau reservations

**Removed:**
- **Announcements / news feed**: originally planned as a separate RSO communication channel; removed in favor of focusing on the events/calendar model
- **Public event ratings/comments**: dropped in favor of the simpler RSVP system

---

## 6. How Advanced Database Programs Complement the Application

**Transaction (`createEventTransactional`):** Event creation is the most write-critical operation in the system. A race condition where two RSO board members submit events for the same room at the same time could silently corrupt the schedule. The SERIALIZABLE transaction prevents this by atomically checking for conflicts across both `Events` and `Facility_Reservations` (using a `UNION ALL` to cover both sources in a single query) and verifying RSO membership authorization before committing the insert. The rollback paths return structured error codes that the frontend translates into user-facing messages ("this room is already booked"). Without this transaction, the application would need application-level locking or risk silent double-bookings.

**Stored Procedure (`GetRSOStats`):** The Dashboard Insights tab is intended for RSO board members who want to understand their organization's activity patterns, which member roles are represented, which event topics have been most popular. This requires aggregating across multiple related tables in ways that are awkward to express in a single parameterized query from application code. The procedure encapsulates both the membership breakdown (JOIN + GROUP BY) and the tag frequency analysis (subquery + GROUP BY with LIMIT), returning two result sets in one round-trip. The conditional branch (`IF v_event_count > 0`) prevents the tag query from running on a new RSO with no events and returning a confusing empty-plus-null result.

**Trigger (`trg_auto_confirm_midterm`):** Midterm confirmation is a community process: students upvote or downvote a submitted midterm entry, and the entry should be "confirmed" once enough students have vouched for it. Enforcing this in application code would require every vote endpoint to re-query the total score and conditionally issue an UPDATE, which is duplicated logic across any future clients. The trigger implements this rule once in the database, fires automatically on every insert to `Midterm_Votes`, and is guaranteed to execute even if the application server crashes between the vote insert and the status update. The `AND status = 'Pending'` guard in the UPDATE prevents re-confirming or un-cancelling an exam that was manually overridden by an admin.

---

## 7. Technical Challenges

**Max Bromberg:** The most persistent challenge was building a correct and performant conflict detection query that spans two tables (`Events` and `Facility_Reservations`). A first approach of running two separate queries and comparing in application code creates a race condition: both queries could return "no conflict" before either insert commits. Moving the check into a `UNION ALL` subquery inside the transaction, so that the same snapshot is read for both sources under SERIALIZABLE isolation, was the correct solution, but required understanding how using SERIALIZABLE mode. Future teams working on any reservation or booking system should architect the conflict check as part of the write transaction from the start, not as a pre-check.

**Meenakshi De:**

**Jonathan Martinez-herrada:**

**Zainab Memon:**

---

## 8. Other Changes from the Original Proposal

The original proposal did not anticipate the complexity of room data. We assumed room availability could be maintained manually. In practice, UIUC buildings are used by courses, university events, and external reservations simultaneously, and only the Astra/Tableau scheduling systems have the authoritative picture. Building the automated scrapers, normalizing inconsistent building code formats across sources, and handling scraper failures gracefully (the `Poll_Log` and `Unknown_Building_Codes` tables) consumed a significant portion of the implementation effort.

---

## 9. Future Work

- **Push notifications**: the architecture supports it (users are stored, RSVPs track intent); a notification service could alert students when an RSVP'd event changes location or time
- **RSO cross-event conflict detection**: currently the scheduler prevents room double-booking; a future feature could warn when two RSOs are scheduling competing events (similar audience, same time window)
- **Attendance analytics**: RSVP data accumulates over time; aggregating RSVP-to-actual-attendance ratios (if check-in is added) would give RSOs meaningful feedback on event sizing
- **Multi-semester support**: `Course_Sections` has a `semester` column, but the current UI only shows the current semester's data; filtering and historical comparison across semesters would be valuable

---

## 10. Division of Labor

