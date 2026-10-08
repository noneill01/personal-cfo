# Local data and recovery

Personal CFO keeps financial records in the browser's IndexedDB database on the user's computer. The source repository contains application code, synthetic tests and static interface assets only.

## Safety routine

1. Open **Settings → Data & backup**.
2. Export a JSON backup before upgrades or material imports.
3. Store the file privately; backups are not encrypted.
4. Restore through onboarding or Settings when moving to another browser profile or computer.

Browser storage belongs to an origin. `http://localhost:3000` and `http://127.0.0.1:3000` therefore have separate databases. Use one address consistently.

## Repository boundaries

The ignore rules cover statement formats, backup folders, runtime output and OS metadata. Do not override them with `git add -f`.

`public/` is never private storage: its contents are copied into the client build. Private imports, generated baselines and backups must remain outside the repository.

Before a commit or source archive, review:

```bash
git status --short
git diff --cached --name-only
pnpm release:check
```

The release check requires a private, uncommitted term list for a full owner-specific scan. See the README for usage.

Current-format profiles contain their own accounts, categories, rules, planning configuration and optional feature-pack settings. Generic schema upgrades remain in the product. Recovery of pre-genericisation private backups that required embedded owner assumptions is deliberately confined to the private `pre-public-sanitisation` tag and is not a distributable dependency.
