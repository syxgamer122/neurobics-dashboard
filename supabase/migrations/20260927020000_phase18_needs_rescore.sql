-- migration
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS needs_rescore boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_sessions_needs_rescore
  ON training_sessions (needs_rescore) WHERE needs_rescore;
