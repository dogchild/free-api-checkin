# Free API Check-in

An extensible project scaffold for **automated daily check-ins on public-benefit LLM API websites**.

The current version provides only the general framework and does not include any real site integrations yet. The goal is to add multiple supported sites over time and run them automatically every day with GitHub Actions.

## Features

- Unified entrypoint for multiple check-in sites
- Provider-based architecture for adding or removing sites
- Enable specific providers through environment variables
- Supports `--dry-run` mode
- Designed for daily execution in GitHub Actions
- Includes a side-effect-free example provider

## Tech Stack

- Node.js 20+
- TypeScript
- GitHub Actions

## Project Structure

```text
.
├─ .github/
│  └─ workflows/
│     └─ daily-checkin.yml
├─ src/
│  ├─ core/
│  │  ├─ config.ts
│  │  ├─ runner.ts
│  │  └─ types.ts
│  ├─ providers/
│  │  ├─ example.ts
│  │  └─ index.ts
│  └─ index.ts
├─ .env.example
├─ package.json
├─ tsconfig.json
├─ README.md
├─ README_EN.md
└─ CLAUDE.md
```

## How It Works

1. Read the enabled provider list from environment variables
2. Load registered providers from the registry
3. Select only the providers requested for execution
4. Validate required environment variables for each provider
5. Run providers sequentially
6. Print a summary and exit with a non-zero code if any provider fails

Main entrypoint: `src/index.ts`

## Configuration

See `.env.example`:

```env
CHECKIN_ENABLED=example
CHECKIN_DRY_RUN=false
```

Meaning:

- `CHECKIN_ENABLED`: comma-separated provider IDs
- `CHECKIN_DRY_RUN`: enables global dry-run mode

When real providers are added later, you can extend it with variables like:

```env
SITE_A_COOKIE=
SITE_A_TOKEN=
```

## Local Development

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run in dry-run mode

```bash
CHECKIN_ENABLED=example npm run checkin:dry
```

### Run normally

```bash
CHECKIN_ENABLED=example npm run checkin
```

## Add a New Provider

1. Create a new provider file under `src/providers/`
2. Implement the `CheckInProvider` interface
3. Register it in `src/providers/index.ts`
4. Add the required environment variables
5. Configure the matching GitHub Actions secrets

The interface definition is in `src/core/types.ts`.

## GitHub Actions

Workflow file: `.github/workflows/daily-checkin.yml`

Currently supported:
- Manual trigger via `workflow_dispatch`
- Daily scheduled execution via `schedule`

You should configure repository secrets such as:

- `CHECKIN_ENABLED`
- `CHECKIN_DRY_RUN`
- Future provider-specific values like `SITE_A_COOKIE`

## Current Status

The repository currently contains only the scaffold:

- Shared runner logic is in place
- Provider registry is in place
- Example provider is included
- No real public-benefit site has been integrated yet

## Roadmap

- Integrate the first real site
- Support different check-in styles such as Cookie / Token / page button
- Introduce browser automation only if a real site requires it
- Improve logging and error categorization

## Notes

This project should only be used for automation within your own authorized accounts and scope.
When integrating real sites, follow each website's terms of service and reasonable access limits.
