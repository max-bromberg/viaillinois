CREATE DATABASE IF NOT EXISTS via;
USE via;

CREATE TABLE Users (
  net_id       VARCHAR(20)  NOT NULL,
  full_name    VARCHAR(100) NOT NULL,
  email        VARCHAR(100) NOT NULL,
  is_global_admin BOOLEAN  NOT NULL DEFAULT FALSE,
  PRIMARY KEY (net_id),
  UNIQUE KEY uq_email (email)
);

CREATE TABLE LocalAccounts (
  net_id        VARCHAR(20)  NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  PRIMARY KEY (net_id),
  FOREIGN KEY (net_id) REFERENCES Users(net_id) ON DELETE CASCADE
);

CREATE TABLE RSOs (
  rso_id       INT          NOT NULL AUTO_INCREMENT,
  name         VARCHAR(100) NOT NULL,
  description  TEXT,
  logo_color   VARCHAR(7)   NOT NULL DEFAULT '#000000',
  founded_year INT,
  PRIMARY KEY (rso_id)
);

CREATE TABLE RSO_Memberships (
  net_id    VARCHAR(20) NOT NULL,
  rso_id    INT         NOT NULL,
  role      VARCHAR(20) NOT NULL DEFAULT 'Member',
  joined_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (net_id, rso_id),
  FOREIGN KEY (net_id)  REFERENCES Users(net_id) ON DELETE CASCADE,
  FOREIGN KEY (rso_id)  REFERENCES RSOs(rso_id)  ON DELETE CASCADE,
  CONSTRAINT chk_membership_role CHECK (role IN ('Member', 'Board', 'Admin'))
);

CREATE TABLE Locations (
  location_id     INT          NOT NULL AUTO_INCREMENT,
  building        VARCHAR(50)  NOT NULL,
  room_number     VARCHAR(20)  NOT NULL,
  max_capacity    INT          NOT NULL,
  has_av_equipment BOOLEAN     NOT NULL DEFAULT FALSE,
  PRIMARY KEY (location_id),
  UNIQUE KEY uq_room (building, room_number)
);

CREATE TABLE Courses (
  course_code VARCHAR(20)  NOT NULL,
  title       VARCHAR(200) NOT NULL,
  PRIMARY KEY (course_code)
);

CREATE TABLE Course_Sections (
  section_id   INT         NOT NULL AUTO_INCREMENT,
  course_code  VARCHAR(20) NOT NULL,
  location_id  INT         NOT NULL,
  day_of_week  VARCHAR(20) NOT NULL,
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  semester     VARCHAR(20) NOT NULL,
  section_type VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (section_id),
  FOREIGN KEY (course_code) REFERENCES Courses(course_code)   ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES Locations(location_id) ON DELETE CASCADE,
  UNIQUE KEY uq_section (course_code, location_id, day_of_week, start_time, end_time, semester)
);

CREATE TABLE Events (
  event_id    INT          NOT NULL AUTO_INCREMENT,
  rso_id      INT          NOT NULL,
  created_by  VARCHAR(20)  NOT NULL,
  location_id INT          NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  start_time  DATETIME     NOT NULL,
  end_time    DATETIME     NOT NULL,
  is_private  BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (event_id),
  FOREIGN KEY (rso_id)      REFERENCES RSOs(rso_id)           ON DELETE CASCADE,
  FOREIGN KEY (created_by)  REFERENCES Users(net_id)          ON DELETE CASCADE,
  FOREIGN KEY (location_id) REFERENCES Locations(location_id) ON DELETE CASCADE,
  CONSTRAINT chk_event_times CHECK (end_time > start_time)
);

CREATE TABLE Tags (
  tag_name VARCHAR(50) NOT NULL,
  PRIMARY KEY (tag_name)
);

CREATE TABLE Event_Tags (
  event_id INT         NOT NULL,
  tag_name VARCHAR(50) NOT NULL,
  PRIMARY KEY (event_id, tag_name),
  FOREIGN KEY (event_id) REFERENCES Events(event_id) ON DELETE CASCADE,
  FOREIGN KEY (tag_name) REFERENCES Tags(tag_name)   ON DELETE CASCADE
);

CREATE TABLE RSVPs (
  net_id   VARCHAR(20) NOT NULL,
  event_id INT         NOT NULL,
  status   VARCHAR(20) NOT NULL DEFAULT 'Going',
  PRIMARY KEY (net_id, event_id),
  FOREIGN KEY (net_id)   REFERENCES Users(net_id)   ON DELETE CASCADE,
  FOREIGN KEY (event_id) REFERENCES Events(event_id) ON DELETE CASCADE,
  CONSTRAINT chk_rsvp_status CHECK (status IN ('Going', 'Maybe', 'Not Going'))
);

CREATE TABLE Midterms (
  midterm_id  INT         NOT NULL AUTO_INCREMENT,
  course_code VARCHAR(20) NOT NULL,
  submitted_by VARCHAR(20) NOT NULL,
  location_id INT         NOT NULL,
  title       VARCHAR(200) NOT NULL,
  start_time  DATETIME    NOT NULL,
  end_time    DATETIME    NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'Pending',
  PRIMARY KEY (midterm_id),
  FOREIGN KEY (course_code)  REFERENCES Courses(course_code)   ON DELETE CASCADE,
  FOREIGN KEY (submitted_by) REFERENCES Users(net_id)          ON DELETE CASCADE,
  FOREIGN KEY (location_id)  REFERENCES Locations(location_id) ON DELETE CASCADE,
  CONSTRAINT chk_midterm_times  CHECK (end_time > start_time),
  CONSTRAINT chk_midterm_status CHECK (status IN ('Pending', 'Confirmed', 'Cancelled'))
);

CREATE TABLE Midterm_Votes (
  midterm_id INT         NOT NULL,
  net_id     VARCHAR(20) NOT NULL,
  vote_value INT         NOT NULL,
  PRIMARY KEY (midterm_id, net_id),
  FOREIGN KEY (midterm_id) REFERENCES Midterms(midterm_id) ON DELETE CASCADE,
  FOREIGN KEY (net_id)     REFERENCES Users(net_id)        ON DELETE CASCADE,
  CONSTRAINT chk_vote_value CHECK (vote_value IN (-1, 1))
);

CREATE TABLE Facility_Reservations (
  reservation_id INT          NOT NULL AUTO_INCREMENT,
  location_id    INT          NOT NULL,
  customer       VARCHAR(255) NOT NULL DEFAULT '',
  event_name     VARCHAR(500) NOT NULL DEFAULT '',
  start_time     DATETIME     NOT NULL,
  end_time       DATETIME     NOT NULL,
  source         SET('tableau','astra') NOT NULL DEFAULT 'astra',
  scraped_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (reservation_id),
  FOREIGN KEY (location_id) REFERENCES Locations(location_id) ON DELETE CASCADE,
  UNIQUE KEY uq_reservation (location_id, start_time, end_time),
  CONSTRAINT chk_reservation_times CHECK (end_time > start_time)
);

CREATE TABLE Poll_Log (
  log_id         INT          NOT NULL AUTO_INCREMENT,
  service        ENUM('courses','facilities','astra') NOT NULL,
  started_at     DATETIME     NOT NULL,
  finished_at    DATETIME,
  rows_processed INT          NOT NULL DEFAULT 0,
  rows_skipped   INT          NOT NULL DEFAULT 0,
  error_count    INT          NOT NULL DEFAULT 0,
  last_error     TEXT,
  metadata       JSON,
  PRIMARY KEY (log_id),
  INDEX idx_poll_log_service (service),
  INDEX idx_poll_log_started (started_at)
);

CREATE TABLE Unknown_Building_Codes (
  code_id  INT          NOT NULL AUTO_INCREMENT,
  log_id   INT          NOT NULL,
  raw_code VARCHAR(50)  NOT NULL,
  seen_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (code_id),
  FOREIGN KEY (log_id) REFERENCES Poll_Log(log_id) ON DELETE CASCADE,
  INDEX idx_ubc_log_id (log_id),
  INDEX idx_ubc_raw_code (raw_code)
);
