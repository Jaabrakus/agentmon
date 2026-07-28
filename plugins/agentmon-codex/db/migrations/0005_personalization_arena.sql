ALTER TABLE arena_task_results
  ADD COLUMN generic_score INTEGER CHECK (generic_score IS NULL OR generic_score BETWEEN 0 AND 100);

ALTER TABLE arena_task_results
  ADD COLUMN generic_passed INTEGER CHECK (generic_passed IS NULL OR generic_passed IN (0, 1));
