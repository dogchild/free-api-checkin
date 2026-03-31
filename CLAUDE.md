# CLAUDE.md

This repository is an extensible automation project for daily check-ins on public-benefit LLM API websites.

## Project Goal

Build a provider-based check-in system that can support multiple websites and run automatically through GitHub Actions.

At the current stage:
- the repository already includes the reusable framework
- one real website integration has been implemented: `ice.v.ua`
- provider registration is explicit and centralized
- configuration is environment-variable based
- the current GitHub Actions schedule runs daily at 00:30 Asia/Shanghai

## Key Files

- `src/index.ts` — main entrypoint
- `src/core/types.ts` — shared types and provider contract
- `src/core/config.ts` — environment loading and config parsing
- `src/core/runner.ts` — provider execution and summary reporting
- `src/providers/index.ts` — provider registry
- `src/providers/example.ts` — placeholder provider
- `src/providers/ice.ts` — real `ice.v.ua` provider using main-site auth token reuse
- `.github/workflows/daily-checkin.yml` — scheduled/manual GitHub Actions workflow
- `.env.example` — environment variable template

## Architecture Rules

1. Each real site should be implemented as its own provider file under `src/providers/`.
2. Every provider must implement the `CheckInProvider` interface from `src/core/types.ts`.
3. Providers must be registered explicitly in `src/providers/index.ts`.
4. Keep the core runner generic; site-specific logic belongs inside providers.
5. Use environment variables for secrets and runtime toggles.
6. Prefer the smallest possible change when adding a new site.
7. Do not introduce browser automation unless a real site actually requires it.

## Provider Conventions

When adding a provider:
- use a stable lowercase `id`
- keep `displayName` readable
- declare all required secrets in `requiredEnv`
- return standardized `success`, `skip`, or `fail` results
- log through the provided `context.log()` function

Current real provider semantics:
- `ice` uses `ICE_SUB2API_AUTH_TOKEN` and `ICE_SUB2API_USER_ID`
- `ice` treats both `签到成功` and `今日已签到` as successful outcomes
- `ice` currently depends on reusing a manually obtained main-site auth token rather than automating upstream OAuth

## Configuration Conventions

Current shared variables:
- `CHECKIN_ENABLED`
- `CHECKIN_DRY_RUN` (optional; omitted means `false`)

Current `ice` provider variables:
- `ICE_SUB2API_AUTH_TOKEN`
- `ICE_SUB2API_USER_ID`

Future provider-specific variables should use uppercase prefixes, for example:
- `SITE_A_COOKIE`
- `SITE_A_TOKEN`

## GitHub Actions Conventions

The workflow should remain simple:
- checkout
- setup Node.js
- install dependencies
- run the check-in command

Any new provider secret needed by the runtime should be mapped in `.github/workflows/daily-checkin.yml`.

For the current `ice` integration, the workflow expects these repository secrets:
- `CHECKIN_ENABLED`
- `ICE_SUB2API_AUTH_TOKEN`
- `ICE_SUB2API_USER_ID`

`CHECKIN_DRY_RUN` is mainly for local or manual verification and is not required as a normal scheduled workflow secret.

## Implementation Guidance

When modifying this project:
- preserve the provider-based structure
- prefer sequential execution unless concurrency becomes necessary
- keep logs clear for GitHub Actions output
- avoid overengineering or premature abstractions
- keep code and comments in English
- keep documentation aligned with the actual project state

## Current Limitation

This repository already contains one real site integration, but it is still not a complete universal check-in solution.

Current practical limitations:
- only `ice.v.ua` is implemented as a real provider
- the `ice` provider currently relies on a manually refreshed main-site auth token
- long-term unattended token rotation has not been solved yet
