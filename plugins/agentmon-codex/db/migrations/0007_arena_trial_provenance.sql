ALTER TABLE procedure_trials ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'automatic'));
ALTER TABLE procedure_trials ADD COLUMN run_id TEXT;
