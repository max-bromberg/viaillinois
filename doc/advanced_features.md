# Advanced Database Features

## Trigger — `trg_auto_confirm_midterm`

Fires after each vote is inserted. If the total vote score for a midterm reaches 5, automatically confirms it.

```sql
DROP TRIGGER IF EXISTS trg_auto_confirm_midterm;

DELIMITER $$

CREATE TRIGGER trg_auto_confirm_midterm
AFTER INSERT ON Midterm_Votes
FOR EACH ROW
BEGIN
    DECLARE v_score INT DEFAULT 0;

    SELECT COALESCE(SUM(vote_value), 0) INTO v_score
    FROM Midterm_Votes
    WHERE midterm_id = NEW.midterm_id;

    IF v_score >= 5 THEN
        UPDATE Midterms
        SET status = 'Confirmed'
        WHERE midterm_id = NEW.midterm_id
          AND status = 'Pending';
    END IF;
END $$

DELIMITER ;
```

## Stored Procedure — `GetRSOStats`

Returns membership breakdown by role and top 5 event tags for a given RSO.

```sql
DROP PROCEDURE IF EXISTS GetRSOStats;

DELIMITER $$

CREATE PROCEDURE GetRSOStats(IN p_rso_id INT)
BEGIN
    DECLARE v_event_count INT DEFAULT 0;

    SELECT COUNT(*) INTO v_event_count
    FROM Events
    WHERE rso_id = p_rso_id;

    SELECT m.role, COUNT(*) AS count
    FROM RSO_Memberships m
    JOIN Users u ON m.net_id = u.net_id
    WHERE m.rso_id = p_rso_id
    GROUP BY m.role
    ORDER BY m.role;

    IF v_event_count > 0 THEN
        SELECT et.tag_name, COUNT(*) AS usage_count
        FROM Event_Tags et
        WHERE et.event_id IN (
            SELECT event_id FROM Events WHERE rso_id = p_rso_id
        )
        GROUP BY et.tag_name
        ORDER BY usage_count DESC
        LIMIT 5;
    ELSE
        SELECT NULL AS tag_name, 0 AS usage_count WHERE 1 = 0;
    END IF;
END $$

DELIMITER ;
```

## Transaction — `createEventTransactional`

Creates an event atomically under `SERIALIZABLE` isolation. Rolls back if the location is already booked or the user lacks RSO board/admin membership.

```sql
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
START TRANSACTION;

-- Advanced query 1
SELECT location_id FROM (
    SELECT location_id FROM Events
    WHERE location_id = ? AND start_time < ? AND end_time > ?
    UNION ALL
    SELECT location_id FROM Facility_Reservations
    WHERE location_id = ? AND start_time < ? AND end_time > ?
) AS occupied
LIMIT 1;

-- Advanced query 2
SELECT COUNT(*) AS count
FROM RSO_Memberships m
JOIN RSOs r ON m.rso_id = r.rso_id
WHERE m.net_id = ? AND m.rso_id = ? AND m.role IN ('Board', 'Admin');

INSERT INTO Events SET ...;
INSERT IGNORE INTO Tags (tag_name) VALUES ...;
INSERT INTO Event_Tags (event_id, tag_name) VALUES ...;

COMMIT;
```
