# Contributing to Personal CFO

Thanks for considering a contribution.

## Privacy first

Personal CFO handles sensitive financial information, so public contributions must use synthetic data only.

Do not commit or attach:

- bank or card statements
- exported backups
- payslips, P45s, P60s or other tax documents
- account numbers or personal identifiers
- screenshots containing real financial data
- private merchant, employer or property names taken from a real profile

Use fictional names and amounts in tests, screenshots and bug reports.

## Development setup

```bash
git clone https://github.com/noneill01/personal-cfo.git
cd personal-cfo
pnpm install
pnpm dev
```

## Before opening a pull request

Run:

```bash
pnpm test
pnpm lint
pnpm audit --prod
pnpm release:check
```

Financial calculation changes should include regression tests and should preserve the explanation shown to users.

## Pull requests

Keep changes focused and explain:

- the user problem being solved
- any migration or backup compatibility impact
- how the change was tested
- any privacy or data-handling implications

For UI changes, screenshots should use the built-in fictional demo profile.
