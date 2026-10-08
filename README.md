# Personal CFO

Personal CFO is a private, local-first personal finance operating system. It runs as a web app on your own computer and stores its working data in that browser profile. No account, hosted database or cloud service is required.

## What it does

- Configurable current, savings, credit-card, mortgage, loan, investment, pension and property accounts
- Native transaction import adapters for Monzo CSV and Barclaycard CSV/PDF
- A provider-neutral Generic CSV importer with reusable column mappings
- Duplicate-safe import preview, rejected-row reporting and import undo
- Searchable transactions, categories, subcategories and reusable merchant rules
- User-confirmed recurring commitments and a pay-cycle Plan
- Cash Runway based on current cash, fixed commitments and variable spending
- Monthly Review, cycle closeout, balance snapshots and backups
- Configurable goals and account-coverage rules
- Optional UK Tax evidence workspace, disabled for new installations

Personal CFO does not provide bank API syncing, Open Banking, cloud sync, multi-user accounts or hosted authentication.

## Privacy model

Financial records are stored in IndexedDB for the exact browser origin used to open the app. The app does not upload those records. When the canonical database is empty, a compatible older local database or local-storage record can be discovered by its schema and copied without embedding a private historical identifier in source.

Important boundaries:

- Use the same address consistently, normally `http://localhost:3000`. Browser storage for `localhost` and `127.0.0.1` is separate.
- Clearing browser/site data deletes the working database. Export backups regularly.
- Downloaded JSON backups are portable but are not encrypted. Store them somewhere private.
- Files below `public/` are browser-accessible assets and must never contain statements, backups or personal data.
- The optional local PDF reader binds to `127.0.0.1` and deletes its temporary input after extraction.

## Requirements

- macOS for the background-service scripts and PDFKit fallback
- Node.js 22.13 or newer
- pnpm

The web app itself is standards-based, but the supplied one-click background service is currently macOS-specific.

## Install

```bash
git clone <repository-url>
cd Finance-Webapp
pnpm install
```

No financial data is included. A first run starts with neutral onboarding and no accounts, transactions, employers, properties or targets.

## Run the development version

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Development mode binds to `127.0.0.1`, not the local network.

## Run the production version locally

```bash
pnpm build
pnpm start
```

On macOS, `install-background.command` builds the app and installs a user LaunchAgent so it can run without an open Terminal. `restart-background.command` installs a rebuilt version; `uninstall-background.command` removes automatic startup without deleting browser data.

## First setup

Onboarding lets you:

1. Add accounts and dated opening balances.
2. Import optional transaction history.
3. Confirm income sources and payday.
4. Confirm recurring commitments.
5. Review or rename categories.
6. Add optional goals.

Fresh installations do not infer personal defaults. Native provider adapters remain available, but the Generic CSV route is the provider-neutral option.

## Generic CSV imports

The mapping screen identifies:

- destination account
- transaction date and date format
- description/payee
- one signed amount column, or separate debit and credit columns
- optional reference, transaction type, source category and running balance

Mappings are saved locally and included in backups. Imports are previewed before commit; malformed rows are reported instead of becoming zero-value transactions.

## Back up and restore

Open **Settings → Data & backup** and choose **Export backup**. Keep the downloaded JSON outside the repository in private storage.

To restore, use **Restore backup** on onboarding or in Settings. Restoring replaces the app's working state after validation, so export the current state first when it matters.

Backups include accounts, balances, transactions, categories, rules, commitments, goals, imports, coverage settings, feature-pack settings and supported evidence metadata. Original statement and tax PDFs are never embedded.

## Optional UK Tax workspace

UK Tax is an opt-in evidence and planning feature. It is disabled on a fresh install. It can track supported payslip/P45/P60 evidence, pension treatment and other user-entered facts for implemented tax years.

It is not filing software, does not submit a Self Assessment return and is not a substitute for HMRC guidance or professional advice. The current calculator has deliberately documented limits, including no Scottish-rate calculation and no complete treatment of every savings, dividend, capital-gains or pension-relief scenario.

## Development checks

```bash
pnpm run typecheck
pnpm run test:logic
pnpm build
pnpm audit --prod
```

The release gate additionally scans tracked source and built static assets:

```bash
PERSONAL_CFO_PRIVATE_TERMS='term-one|term-two' pnpm release:check
```

Supply the owner's known names, properties and distinctive private terms locally. Do not commit that list. The check deliberately refuses to certify a dirty tree or a build containing source maps, private-capable data assets, credential patterns or configured private terms.

## Contributing

- Use synthetic names, merchants, employers and amounts in tests and examples.
- Never commit statements, backups, screenshots, tax documents or browser exports.
- Add regression coverage for financial calculation changes.
- Run type checking, the full test suite, production build, dependency audit and release gate before proposing a release.
- Preserve migration compatibility identifiers unless a tested migration safely replaces them.

## Known limitations

- Local browser storage is device- and origin-specific.
- Backups are manual unless the browser grants access to an automatic-backup directory.
- PDF parsing depends on statement layout and can require manual entry when an issuer changes its format.
- Native import support is intentionally limited; other institutions should use Generic CSV.
- No software licence has been selected yet. Do not assume permission to redistribute until the repository owner chooses one.

## Legacy recovery boundary

Current Personal CFO profiles are self-contained, and generic historical schema migrations remain supported. Pre-genericisation backups that depended on one owner's embedded employers, properties, categories or financial assumptions are intentionally not supported by distributable source. Those ancient private backups remain recoverable only with the private historical repository at the `pre-public-sanitisation` tag. Personal CFO has no hidden local profile module or permanent private compatibility dependency.

## Preparing a public repository

Do not publish the development repository's historical Git objects. Create a sanitized tracked-source snapshot, verify it with the release gate, and use that snapshot as the first commit of a new repository with fresh history.
