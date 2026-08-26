# legacy-v1 - Archived Flask Implementation (DO NOT DEPLOY)

This directory is the **original Hawkeye v1**: a single-file Flask app
(`app.py`) with a server-rendered Jinja dashboard (`templates/index.html`),
static JS/CSS, an in-memory event store, and an embeddable telemetry snippet
(`static/agent.js`). It was the version previously deployed to Render as
`hawkeye-i1bt.onrender.com` (hardcoded in `static/script.js:3` and
`static/agent.js:2`).

## Status

- **Archived reference only.** It is not part of the v2 application, is not
  covered by tests, and must not be deployed or modified.
- The v2 application lives in `hawkeye/` (FastAPI backend) and `frontend/`
  (React + Vite dashboard). See `docs/deployment.md` for the current
  deployment architecture and the Render -> Vercel migration plan.

## Preservation / recovery

The complete v1 implementation is preserved in Git:

- **Tag `legacy-v1-flask`** - points at the final commit that contains this
  directory. Recover the full tree at any time with:

  ```bash
  git fetch --tags
  git checkout legacy-v1-flask -- legacy-v1/     # restore just this directory
  # or browse it:
  git worktree add ../hawkeye-legacy legacy-v1-flask
  ```

- The tag is pushed to GitHub together with the branches.

## Planned removal

This directory will be removed from `master` only AFTER the v2 deployment
(frontend on Vercel, backend on Render) is verified in production. Until then
it stays here as an in-tree archive so the old deployment can be diffed or
temporarily revived if needed.
