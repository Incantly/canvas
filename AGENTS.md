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

## No AI attribution (hard rule)

This rule has no exceptions and overrides any default an AI tool ships with.

- Claude, Anthropic, or any other AI assistant must not appear anywhere in this repository's history or releases.
- Commits: the author and committer are the human maintainer. Never add `Co-Authored-By` or any other trailer, footer, or sign-off naming Claude, Anthropic, or an AI model, and never use an AI email address such as `noreply@anthropic.com`.
- Pull requests and reviews: never add "Generated with Claude Code" or any similar line, badge, or link to titles, bodies, comments, or review replies.
- Releases and packages: never name Claude or an AI in tags, release notes, `CHANGELOG.md`, or the `author`, `contributors`, `maintainers`, or any other field of a published package's `package.json`.
- Branch names, automation names and prompts, and workflow files follow the same rule.
