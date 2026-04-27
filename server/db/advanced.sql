USE via;

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
