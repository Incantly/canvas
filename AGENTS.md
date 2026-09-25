# Repository contribution rules

## Testing rules

- Never write unit tests after writing the code.
- Prefer end-to-end (E2E) tests as the main way to test.
- Use E2E tests to check that complex features work.
- Make E2E tests produce an artifact that can be checked and reproduced.
- If you need to test a system in isolation, first list all the ways it could fail. Then write the code.
- For complex features, use realistic E2E scenarios with medium or high complexity; do not test only the simplest successful case.
- Avoid tautological tests that only confirm what the code already says.
- Avoid tests that only detect whether code changed.
- For bug fixes, add a regression test only when existing behavior tests leave a real gap.

## Branch names

- Use a descriptive branch name without a `codex/` prefix.
- The string `codex` must not appear in branch names, commit messages, pull-request titles or bodies, or automation names/prompts for this repository.
- When renaming an existing branch, push the replacement branch and remove the old remote branch when it exists.
