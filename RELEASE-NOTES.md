# Release notes

## Unreleased — accuracy and monthly review

- Simplify navigation to Home, Activity, Plan, Review and Settings, with optional Tax and a global Add data menu.
- Show a concise Home summary, ranked spending and an interactive net-worth trend; retain deeper analysis in disclosures.
- Put transaction records before charts, keep detailed editing expandable, and open the planning editor directly.
- Separate specialist planning screens and presentation selectors; surface the next review task and move backup tools into their own settings section.

- Net expense refunds into spending, category actuals and cycle comparisons.
- Count credit-card purchases against Cash Runway once, with repayments reflected only as cash movements.
- Distinguish missing or stale balance evidence in V4 without changing its weights or saved historical scores.
- Accept quiet account periods and explicit reviewed intervals while retaining rejected-import guards.
- Scope transaction totals and charts to configured account, search and category filters.
- Add focused Monthly Review workspaces and one cycle-closeout workflow.
- Correct allocation and cycle labels, mobile button text and keyboard dialog focus.
- Extract shared financial selectors and the reusable payslip editor.
- Read provider-named pension columns and distinguish employer names from payroll table headings; corrected re-uploads replace uniquely matching placeholder records.
- Show all saved payslips with an immediate saved-record confirmation, and collapse optional planning, review and configuration detail.

## Public-release preparation

- Rebranded the visible product as Personal CFO while retaining private storage identifiers required for existing installations.
- Added neutral first-run onboarding, configurable accounts and user-owned categories.
- Isolated the optional UK Tax feature pack; it is disabled for fresh installations.
- Added provider-neutral import adapters and Generic CSV mappings.
- Added recurring-commitment, coverage, backup and migration compatibility layers.
- Added release archive and static-output privacy guards.
- Removed the former owner's migration payload from distributable source. Current profiles remain self-contained; generic migrations remain supported, while ancient owner-specific recovery stays at the private `pre-public-sanitisation` tag.

Historical development notes are intentionally omitted because they described one private installation. Git history from the private development repository is not suitable for publication; a future public repository must start from a sanitized snapshot with fresh history.
