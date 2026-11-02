-- Server-side sessions (NFR-15): sliding 30 days, absolute maximum 90 days.
-- Only a hash of the session token is stored, so a database leak does not hand out sessions.
CREATE TABLE sessions (
    id                  uuid PRIMARY KEY,
    user_id             uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash          bytea       NOT NULL UNIQUE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    -- Last use plus 30 days, never past absolute_expires_at.
    expires_at          timestamptz NOT NULL,
    -- Creation plus 90 days; never extended.
    absolute_expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
-- Supports deleting expired sessions.
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
