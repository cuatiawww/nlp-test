# Project AGENTS.md — NLP Penyakit (ABVC Surveillance)

This workspace contains the KEMKES / ASEAN Disease Surveillance System.

## Architecture & Repositories
- Core shared pipeline in `services/nlp-python/app/pipeline.py`
- Multi-event extractor: `services/nlp-python/app/multi_event_extractor.py`
- Surveillance extraction: `services/nlp-python/app/surveillance_extraction.py`
- Bounded analysis & budgets: `services/nlp-python/app/stage_budget.py`, `bounded_analysis.py`
- Database schemas & migrations: `database/init/`
- Frontend: `services/frontend-next/`
- Backend: `services/backend-rust/`

## Core Rules for Agents
- **Shared Core**: All analysis paths (manual URL analyze, continuous crawling, background batch) must invoke the single shared pipeline core (`pipeline.run`). Never create parallel pipelines.
- **Surgical Commits**: Only modify code required for the assigned slice/task.
- **Verification**: Run regression tests under `services/nlp-python/app/tests/` before completing tasks.
- **Zero Slop**: No placeholder code, no unnecessary wrappers, no verbose sycophancy.
