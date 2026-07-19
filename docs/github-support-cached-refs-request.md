# GitHub Support — cached commit-reference purge request

Draft message for GitHub Support after the secret-removal history rewrite of
2026-07-19. Submit at <https://support.github.com/contact> (category: "I have a
security concern" → sensitive data removal).

**Context / what already happened:**

- A file with secrets — `thezeeohh/server/.env` (Stripe **test** secret key,
  Stripe webhook secret, JWT secret) — had been committed to the repo.
- History was rewritten with `git-filter-repo --path thezeeohh/server/.env
  --invert-paths`, purging the file and its values from all branch histories.
- Both branches were force-pushed. A fresh clone confirms 0 history entries and
  0 blobs containing the secret values.
- The secrets are being rotated independently (test-tier, and the current
  `server/` no longer uses them).
- This ticket only asks GitHub to purge **cached commit views / PR-retained
  references**, which a force-push does not remove on its own.

---

## Message to send

**Subject:** Purge cached commit references after secret-removal history rewrite — TheeZeeOhh/injusticereformnetwork

Hello GitHub Support,

I recently force-pushed a rewritten history to my repository
**TheeZeeOhh/injusticereformnetwork** to remove a file that had been committed
with secrets (`thezeeohh/server/.env`, containing Stripe test keys, a webhook
secret, and a JWT secret). The file and its values have been fully purged from
the branch histories using `git-filter-repo`, and both branches were
force-updated.

Because force-pushing does not remove cached commit views or references retained
in pull requests, I'm requesting that GitHub **garbage-collect and purge the
stale/unreachable commit objects** for this repository so the removed secrets are
no longer accessible via old commit SHAs or PR pages.

**Repository:** https://github.com/TheeZeeOhh/injusticereformnetwork

**Old commits that contained the removed `.env` (please ensure these are no
longer accessible):**

- `1421d886851fc0518b1b370db661a9ef856ccdda`
- `512cc22e8f9fdcb38e0f3ea9cb20a9ad9a5bc407`
- `501b0fcbea7de308c2c7937bf444db04f794fd83`

**Branches were force-updated as follows:**

- `main`: `9fbb833` → `42593f1`
- `sanctuary-app`: `89aad8a` → `da33f51`

**Pull requests may still reference the old (pre-rewrite) commits** — please
purge any cached commit references associated with them: **#1, #2, #3, #4, #5,
#6, #7, #8, #9**.

Note: the exposed credentials were Stripe **test**-tier and are being rotated
independently, so this is a hygiene/cleanup request rather than an
active-credential emergency. I'd appreciate confirmation once the cached
references have been cleared.

Thank you,
Aziza Okoro
TheeZeeOhh

---

## Reminders

- **Rotation is the step that actually neutralizes the risk** — do it regardless
  of when Support responds (Stripe dashboard: roll the test secret key +
  regenerate the webhook secret; rotate JWT_SECRET wherever it is still used).
- Framed as hygiene, not emergency, because the keys are test-tier. If any had
  been `sk_live_`, escalate as urgent.
- The pre-commit hook now scans staged changes for secrets and refuses `.env`
  files, so this class of leak is blocked going forward.
