# Personal CFO

**A private, local-first personal finance operating system.**

Personal CFO runs on your own computer and keeps its working financial data in your browser profile. There is no Personal CFO account, hosted database, cloud sync service or bank connection.

> Personal CFO is a personal tracking and planning tool. It is not financial, investment, tax or legal advice.

## Project status

Personal CFO is an early public release. The core app is usable today, but some setup and helper tooling is still aimed at technical users. The current public baseline is **v0.1.1**.

## Features

### Spending changes in Activity

Everyday spending analysis distinguishes routine discretionary purchases from
variable essentials, irregular discretionary costs, home/property costs and fixed
commitments. A Plan group such as `lifestyle` does not determine behaviour. Repairs
and travel therefore remain real spending without implying an everyday habit.
Settings → Categories provides category/subcategory **Spending analysis** choices;
an individual Activity record can override them under **Analysis preference**.
Unknown categories start unclassified. Existing accounting exclusions and confirmed
fixed commitments take precedence. No budget or Health Score formula is changed.

Small everyday purchases use a configurable default threshold of **30 base-currency
units** (Settings → Categories). This is a heuristic, not a recommended limit or
currency conversion. Net totals include refunds, but purchase counts and average
purchase size exclude refund credits; counts represent transactions, not visits.
The small-purchase diagnostic shows gross purchase outlays separately. Category,
subcategory and repeat-merchant comparisons expose the exact contributing records.
The complete breakdown reconciles every genuine spend to a behavioural bucket,
including property; work and non-spending movements retain existing exclusions.
Profile version 8 adds classification configuration only; version 7 financial
records, history, balances and planning values are retained unchanged. Backup
round-trips retain preferences and transaction overrides.

Below the transaction records, Spending changes compares the latest three completed,
covered, baseline-eligible pay periods with the preceding three. Twelve eligible
periods enable a six-versus-six view; two to five periods use equal smaller windows
and are labelled limited history. The live period is never used. Expand Evidence
to see exact dates and exclusions. Click a result to inspect its exact transactions;
Clear comparison restores the normal Activity records.

The analysis separates normal variable spending, recurring costs and explicitly
marked one-offs. It reuses personal-spending rules, nets refunds, and excludes
transfers, savings movements, card repayments, reimbursable work and known rental
activity. Confirmed recurring obligations are recognised without rewriting records.
Missing payments are not proof of cancellation; irregular or seasonal payments can
still require review. Large unmarked payments are flagged, not automatically
reclassified. Lower spending is not a claim that money was saved.

Material changes must exceed 1% of the larger overall spending baseline for
categories (0.5% for merchants) and 10% of their prior average. Percentage claims
are suppressed near zero. Consistency requires three consecutive recent periods
moving in the same direction, without a dominant payment or refund-driven reduction.
These thresholds are currency-independent and centralised in `CHANGE_RULES`.
All results are derived locally; no financial records or backup schemas change.

### Core capabilities

- Configurable current, savings, credit-card, mortgage, loan, investment, pension and property accounts
- Native import adapters for Monzo CSV and Barclaycard CSV/PDF
- Provider-neutral Generic CSV import with reusable column mappings
- Duplicate-safe import preview, rejected-row reporting and import undo
- Searchable transactions, categories, subcategories and merchant rules
- User-confirmed recurring commitments
- Pay-cycle planning with **Last cycle**, **Coming out** and **Your plan**
- Cash Runway based on current cash, fixed commitments and variable spending
- Monthly Review, cycle closeout and balance snapshots
- Configurable goals and account-coverage rules
- Portable JSON backups
- Profile-level country, currency and locale settings for regional money and date presentation
- Optional UK Tax evidence workspace, disabled for new installations

Personal CFO uses one base currency per profile and does not perform currency conversion. It does **not** currently provide bank API syncing, Open Banking, cloud sync, multi-user accounts or hosted authentication.

## Quick start

### Everyday workflow

- **Home:** your recorded financial position, pay-period totals, next action and net-worth trend. Detailed analysis remains expandable.
- **Activity:** search and filter records, then open **Details & edit** for categories, notes and transaction treatment.
- **Plan:** edit income, essential commitments, flexible spending and savings allowances. Current/next-period selection changes scheduled commitments; allowances carry forward until edited.
- **Review:** complete the outstanding checks, inspect the summary and close a finished period with a backup.
- **Settings:** accounts, payroll, recurring payments, imports and **Backup & privacy**. Use **Add data** from any screen for routine updates.

### Requirements

- Node.js 22.13 or newer
- pnpm

The core web app is standards-based. The supplied background-service scripts and PDFKit fallback are currently macOS-specific.

### Install

```bash
git clone https://github.com/noneill01/personal-cfo.git
cd personal-cfo
pnpm install
```

### Run in development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Development mode binds to `127.0.0.1`, not the local network.

### Run a production build locally

```bash
pnpm build
pnpm start
```

On macOS, `install-background.command` builds the app and installs a user LaunchAgent so it can run without an open Terminal. `restart-background.command` installs a rebuilt version, and `uninstall-background.command` removes automatic startup without deleting browser data.

## Try it without your own data

On a fresh install, choose **Explore with demo data** to load a completely fictional salary, accounts, transactions, recurring commitments, plan and emergency-fund goal. The demo is clearly labelled and can be discarded at any time with **Start with my data**.

This is the quickest way to understand Personal CFO before importing or entering any real financial information.

## First setup

A fresh installation starts with neutral onboarding and no accounts, transactions, employers, properties or financial targets.

Onboarding lets you:

1. Choose a country, currency and locale for presentation.
2. Add accounts and dated opening balances.
3. Import optional transaction history.
4. Confirm income sources and payday.
5. Confirm recurring commitments.
6. Review or rename categories.
7. Add optional goals.

Native provider adapters remain available, but the Generic CSV route is the provider-neutral option.

US profiles default new Generic CSV mappings to month/day/year. Other bundled regional presets default to day/month/year, and ISO can always be selected explicitly. Saved mappings keep their existing choice. Monzo and Barclaycard remain optional UK-oriented adapters.

## Regional scope

The finance core supports United Kingdom, Ireland, United States, Canada, Australia and New Zealand presets, plus custom ISO currency and BCP-47 locale values. Currency controls presentation only: changing it never changes balances, transactions, history or calculations. Multi-currency accounts and currency conversion are intentionally out of scope.

UK Tax is an optional UK-specific feature pack and remains disabled on fresh installations. Personal CFO does not attempt to calculate tax for other countries.

## Imports

### Native adapters

Current native import support includes:

- Monzo CSV
- Barclaycard CSV/PDF

### Generic CSV

The Generic CSV mapper supports:

- destination account
- transaction date and date format
- description/payee
- one signed amount column, or separate debit and credit columns
- optional reference, transaction type, source category and running balance

Mappings are saved locally and included in backups. Imports are previewed before commit, and malformed rows are reported rather than silently becoming zero-value transactions.

## Your monthly review

Open **Monthly Review** and choose the completed pay cycle. Its focused workspaces let you import account statements, add or check a payslip, update dated balances, review unclear or one-off spending, and adjust the next spending plan without leaving the review. Closing a cycle saves its summary, a balance snapshot and a downloadable backup.

A quiet week is not treated as missing transactions. If an export cannot establish the full period, check the account in your banking app and explicitly confirm the displayed interval. Imports with rejected rows still need correction.

Spending is net of refunds assigned to expense categories; a refund arriving in a later cycle credits that later cycle. Transfers, savings movements, card repayments and work reimbursements keep their separate meanings. Cash Runway compares the spending allowance once against purchases and refunds, while actual current cash changes when card payments leave the account.

The Health Score retains V4's weights and distinguishes missing balance evidence from a recorded zero. Its confidence also considers the age of the cash, debt and property balances it uses. Transaction account/search/category filters apply to the accompanying totals; activity tabs control which rows are shown.

## Privacy and local data

Financial records are stored locally in IndexedDB for the browser origin used to open the app. Personal CFO does not upload those records to a hosted Personal CFO service.

Important boundaries:

- Use the same address consistently, normally `http://localhost:3000`. Browser storage for `localhost` and `127.0.0.1` is separate.
- Clearing browser/site data deletes the working database. Export backups regularly.
- Downloaded JSON backups are portable but are not encrypted. Store them somewhere private.
- Files below `public/` are browser-accessible assets and must never contain statements, backups or personal data.
- The optional local PDF reader binds to `127.0.0.1` and deletes its temporary input after extraction.

## Back up and restore

Open **Settings → Data & backup** and choose **Export backup**. Keep the downloaded JSON outside the repository in private storage.

To restore, use **Restore backup** during onboarding or from Settings. Restoring replaces the app's working state after validation, so export the current state first when it matters.

Backups include accounts, balances, transactions, categories, rules, commitments, goals, imports, coverage settings, feature-pack settings and supported evidence metadata. Original statement and tax PDFs are never embedded.

## Optional UK Tax workspace

UK Tax is an opt-in evidence and planning feature and is disabled on a fresh install.

It can track supported payslip, P45 and P60 evidence, pension treatment and other user-entered facts for implemented tax years.

It is not filing software, does not submit a Self Assessment return and is not a substitute for HMRC guidance or professional advice. The current calculator has documented limits, including no Scottish-rate calculation and no complete treatment of every savings, dividend, capital-gains or pension-relief scenario.

## Development checks

Run the full test/build path with:

```bash
pnpm test
```

Additional release checks:

```bash
pnpm lint
pnpm audit --prod
pnpm release:check
```

The release gate scans tracked source and built static assets for private-capable data, credential patterns, prohibited files and other release risks.

When working against private development data, additional known private terms can be supplied locally without committing them:

```bash
PERSONAL_CFO_PRIVATE_TERMS='term-one|term-two' pnpm release:check
```

## Feedback

Bug reports and feature requests are welcome through GitHub Issues. Please use synthetic data only: never attach real statements, backups, tax documents, screenshots containing private information or account details to a public issue.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, privacy and pull-request guidance.

Please:

- use synthetic names, merchants, employers and amounts in tests and examples
- never commit statements, backups, screenshots, tax documents or browser exports
- add regression coverage for financial calculation changes
- run the full test suite, production build, dependency audit and release gate before proposing a release
- preserve migration compatibility identifiers unless a tested migration safely replaces them

## Known limitations

- Local browser storage is device- and origin-specific.
- Backups are manual unless the browser grants access to an automatic-backup directory.
- PDF parsing depends on statement layout and can require manual entry when an issuer changes its format.
- Native import support is intentionally limited; other institutions should use Generic CSV.
- Background-service and PDF fallback tooling is currently macOS-oriented.

## Licence

Personal CFO is released under the [MIT License](LICENSE).
