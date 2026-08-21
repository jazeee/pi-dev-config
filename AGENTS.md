# Global instructions

Most of what follows exists because you are never the only instance of pi
running: other instances may be working in the same repository at the same time,
and these rules keep them from colliding. The comment rules are separate, and
apply to every line of code you write.

## Comments

- Default to no comment.
- A comment that restates the code is noise. Delete it.
- Write a comment only when it is necessary and the reason is not already
  obvious from the code: a non-obvious constraint, a deliberate omission, a
  workaround for someone else's bug.
- When a comment is warranted, keep it to one line.
- Never narrate history, tradeoffs, or migration context in the source. A
  dependency upgrade, a deprecated API, a version skew: that is PR-description
  and commit-message material, not a code comment.
- Do not restate a rationale at every call site. State it once, where the thing
  is defined.
- Use `/**` JSDoc for documenting the API of a function, not for explaining why
  the function exists.

## Frontend file organization

- One component per file. Always. No exceptions for "small" helper components,
  row renderers, dialog bodies, or column definitions.
- Create a named directory per feature/area and let the path carry the
  namespace. The filename says what the thing is, the directory says whose it
  is.
- Keep the full path non-redundant: `Flows/Definitions/Page.tsx`, not
  `Flows/Definitions/FlowDefinitionsPage.tsx`.
- The export name must still be namespaced and never generic. The filename is
  short because the directory supplies the context; the imported symbol must be
  unique and self-describing at the call site.

```typescript
// Flows/Definitions/Page.tsx
export function FlowDefinitionsPage() {}
// Flows/Definitions/Table.tsx
export function FlowDefinitionsTable() {}

import { FlowDefinitionsPage } from './Flows/Definitions/Page';

// Wrong: generic export name
export function Table() {}
// Wrong: redundant path segments
import { FlowDefinitionsPage } from './Flows/Definitions/FlowDefinitionsPage';
```

- A file reaching ~200 lines is a strong signal it must be split. Split by
  concern, not by arbitrary line count: page shell, table, row, filters,
  dialogs, hooks, and types each get their own file.
- `index.ts` is for barrel exports only; never put logic there.
- When editing an oversized existing file, extract the part you are touching
  rather than growing the file further.

Why this matters:

1. Hot module reloading. HMR is more efficient and useful when code lives in
   separate files. Editing a file resets state within that file but not its
   parents, so dialogs stay open and forms stay hydrated as you iterate.
2. Code splitting and lazy loading. The web ecosystem relies on lazy-loadable,
   code-splittable modules; smaller files mean faster front end load times.
3. PR review. Isolated files are far easier to review and re-review; once a file
   is in good shape, GitHub's `Viewed` checkbox keeps attention on the rest.
   Large files are hard to review at all.
4. Single concern. Code split by concern is easier to understand, for both
   humans and AI, and produces smaller, more precise context windows.

The same principles apply to backend code where practical: one route, model,
controller, or job per file, grouped in named directories.

## Branches

- Never do work on `main`, and never hold/occupy `main`. Always create your own
  branch first.
- Create a git worktree when it helps keep your work isolated from other
  instances.

## Git

- Never use `git stash`. It is global shared state and will clobber, or be
  clobbered by, other instances.

## Pull requests

- Always open pull requests in draft mode (`gh pr create --draft --fill-first`). Let a human
  mark them ready for review. Make sure to set the pr title and body as well if you are in a stacked branch.
- Never wait or poll for CI to go green. Open the pull request, report the URL,
  and hand back control. Do not `sleep` in a loop waiting on checks.
- Verify locally instead: run the relevant lint, typecheck, build and tests
  before pushing. CI is the human's signal to read, not yours to babysit.
- Only inspect CI when the user asks, or when you already know a specific check
  failed and are fixing it.

## GitHub references

- Always hydrate GitHub references as full URLs, everywhere: chat replies, PR
  descriptions, issue bodies, commit messages, and comments.
- Never leave a bare `#81795`, `GH-81795`, or `owner/repo#81795`. Write the full
  `https://github.com/owner/repo/pull/81795` URL, optionally as a markdown link
  such as `[#81795](https://github.com/owner/repo/pull/81795)`.
- This applies to pull requests, issues, commits, discussions, and comparison or
  permalink references.

## Temporary files

- When creating temp files, always create a directory with
  `mktemp -d --tmpdir` first, then place all temp files for that session inside
  the returned directory.
- Do not scatter temp files in the project working directory or other locations.
