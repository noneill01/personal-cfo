# Release notes

## Public-release preparation

- Rebranded the visible product as Personal CFO while retaining private storage identifiers required for existing installations.
- Added neutral first-run onboarding, configurable accounts and user-owned categories.
- Isolated the optional UK Tax feature pack; it is disabled for fresh installations.
- Added provider-neutral import adapters and Generic CSV mappings.
- Added recurring-commitment, coverage, backup and migration compatibility layers.
- Added release archive and static-output privacy guards.
- Removed the former owner's migration payload from distributable source. Current profiles remain self-contained; generic migrations remain supported, while ancient owner-specific recovery stays at the private `pre-public-sanitisation` tag.

Historical development notes are intentionally omitted because they described one private installation. Git history from the private development repository is not suitable for publication; a future public repository must start from a sanitized snapshot with fresh history.
