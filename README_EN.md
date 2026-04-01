# Free API Check-in

An extensible TypeScript project for **automated daily check-ins on public-benefit LLM API websites**.

The repository already includes:

- A general provider-based framework
- A side-effect-free `example` provider
- A real integrated check-in provider for `ice.v.ua`
- An auth-only provider for `elysiver.h-e.top`

The current `ice.v.ua` integration reuses the main-site `auth_token + user_id`, then completes the embedded sign-in flow through `signv.ice.v.ua` without browser automation.

The current `elysiver.h-e.top` integration only verifies whether auth restoration based on the site's NewAPI login state still works. Its custom daily sign-in logic has not been implemented yet.

## Features

- Unified entrypoint for multiple check-in sites
- Provider-based architecture for adding or removing sites
- Enable multiple providers via a comma-separated environment variable
- Optional global `--dry-run` / `CHECKIN_DRY_RUN`
- Designed for manual and scheduled GitHub Actions execution
- Includes a real `ice.v.ua` check-in implementation
- Includes auth restoration verification for `elysiver.h-e.top`
- Treats both `签到成功` and `今日已签到` as successful outcomes

## Tech Stack

- Node.js 22+
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
│  │  ├─ elysiver.ts
│  │  ├─ example.ts
│  │  ├─ ice.ts
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
CHECKIN_ENABLED=ice
# CHECKIN_DRY_RUN=true
ICE_SUB2API_AUTH_TOKEN=
ICE_SUB2API_USER_ID=
ELYSIVER_AUTH_TOKEN=
ELYSIVER_USER_ID=
```

Meaning:

- `CHECKIN_ENABLED`: comma-separated provider IDs, such as `ice`, `elysiver`, or `ice,elysiver`
- `CHECKIN_DRY_RUN`: optional; defaults to `false` when omitted, and only becomes `true` when explicitly set
- `ICE_SUB2API_AUTH_TOKEN`: copy from browser `localStorage.auth_token` after signing into `ice.v.ua`
- `ICE_SUB2API_USER_ID`: copy from `auth_user.id` or from the embedded page `user_id`
- `ELYSIVER_AUTH_TOKEN`: copy from the `elysiver.h-e.top` NewAPI login state or from an authenticated request header
- `ELYSIVER_USER_ID`: copy from `localStorage.user.id` after signing into `elysiver.h-e.top`

Notes:

- The current `ice.v.ua` approach depends on the main-site `auth_token`, which will expire over time. If you use it in GitHub Actions, you must manually refresh the matching secret when it expires.
- The current `elysiver.h-e.top` provider is only an auth restoration probe. It confirms that a manually copied login state still works, but it does not implement the real daily sign-in flow yet.

## Local Development

### Install dependencies

```powershell
npm install
```

### Build

```powershell
npm run build
```

### Run `ice` in dry-run mode

```powershell
$env:CHECKIN_ENABLED="ice"
$env:CHECKIN_DRY_RUN="true"
$env:ICE_SUB2API_AUTH_TOKEN="dummy-token"
$env:ICE_SUB2API_USER_ID="6702"
npm run checkin
```

### Run the `elysiver` auth probe in dry-run mode

```powershell
$env:CHECKIN_ENABLED="elysiver"
$env:CHECKIN_DRY_RUN="true"
$env:ELYSIVER_AUTH_TOKEN="dummy-token"
$env:ELYSIVER_USER_ID="123"
npm run checkin
```

### Run `ice` normally

```powershell
$env:CHECKIN_ENABLED="ice"
$env:ICE_SUB2API_AUTH_TOKEN="your-auth-token"
$env:ICE_SUB2API_USER_ID="6702"
npm run checkin
```

### Run the `elysiver` auth probe normally

```powershell
$env:CHECKIN_ENABLED="elysiver"
$env:ELYSIVER_AUTH_TOKEN="your-auth-token"
$env:ELYSIVER_USER_ID="123"
npm run checkin
```

Expected behavior:

- `ice` performs the real daily sign-in flow or reports that today's sign-in was already completed
- `elysiver` only verifies auth restoration and explicitly reports that daily check-in is not implemented yet

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

The current schedule is **00:30 Asia/Shanghai every day**.
Because GitHub Actions uses UTC, the cron expression is configured as `16:30 UTC` on the previous day.

At minimum, configure these repository secrets:

- `CHECKIN_ENABLED`: for example `ice`, `elysiver`, or `ice,elysiver`
- `ICE_SUB2API_AUTH_TOKEN`
- `ICE_SUB2API_USER_ID`
- `ELYSIVER_AUTH_TOKEN`
- `ELYSIVER_USER_ID`

`CHECKIN_DRY_RUN` is not needed as a normal secret for scheduled GitHub execution. It is mainly useful for local debugging or temporary manual verification.

Until the real `elysiver` sign-in flow is implemented, it is better to validate it through `workflow_dispatch` first instead of treating it as a fully automated scheduled provider.

## Current Status

The repository is no longer just a scaffold. It now includes:

- Shared runner logic
- Provider registry
- An `example` provider
- A real working `ice.v.ua` provider
- An auth-only `elysiver.h-e.top` provider
- Verified success semantics for the actual `ice` check-in flow

## Roadmap

- Implement the custom `elysiver.h-e.top` sign-in flow after packet capture
- Integrate more real public-benefit sites
- Support more session reuse patterns
- Introduce browser automation only if a real site requires it
- Improve logging and error categorization
- Evaluate a more stable token update strategy in the future

## Notes

This project should only be used for automation within your own authorized accounts and scope.
When integrating real sites, follow each website's terms of service and reasonable access limits.
