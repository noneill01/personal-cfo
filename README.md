# Personal CFO

**A private, local-first personal finance operating system.**

Personal CFO runs on your own computer and keeps its working financial data in your browser profile. There is no Personal CFO account, hosted database, cloud sync service or bank connection.

> Personal CFO is a personal tracking and planning tool. It is not financial, investment, tax or legal advice.

## Project status

Personal CFO is an early public release. The core app is usable today, but some setup and helper tooling is still aimed at technical users. The current public baseline is **v0.1.1**.

## Features

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
- Optional UK Tax evidence workspace, disabled for new installations

Personal CFO does **not** currently provide bank API syncing, Open Banking, cloud sync, multi-user accounts or hosted authentication.

## Quick start

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

1. Add accounts and dated opening balances.
2. Import optional transaction history.
3. Confirm income sources and payday.
4. Confirm recurring commitments.
5. Review or rename categories.
6. Add optional goals.

Native provider adapters remain available, but the Generic CSV route is the provider-neutral option.

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
