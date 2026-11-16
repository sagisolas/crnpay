## Implementation

- Code requires extra safety as it works with payments
- Add logging to significant events in code using industry standard libs. Dont write tests for logging.
- Extract reusable UI components (such as buttons, lists) and make them configurable as required by current code

## Workflow

- Run tests after making non cosmetical changes
- Run formatting before commit

## Style

- Dont add ticket id in commit message

## Docs

- Technical decisions go in docs/adr
- Domain decisions go in docs/domain

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), recorded as `Status:` lines in issue files. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md`, `docs/domain/` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
