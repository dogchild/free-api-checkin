# Free API Check-in

A project for **automated daily check-ins on public-benefit LLM API websites**.

Currently supported sites:

- `ice.v.ua`
- `elysiver.h-e.top`

## GitHub Automation Usage

1. Fork or clone this repository into your own GitHub repository.
2. Configure the required Secrets in **Settings -> Secrets and variables -> Actions**.
3. Enable the GitHub Actions workflow.
4. Wait for the daily scheduled run, or trigger it manually once for verification.

Current workflow file:

- `.github/workflows/daily-checkin.yml`

Current default schedule:

- **00:30 Asia/Shanghai every day**

### Required Secrets

Shared variable:

- `CHECKIN_ENABLED`: set the enabled site IDs, such as `ice`, `elysiver`, or `ice,elysiver`

For `ice.v.ua`:

- `ICE_SUB2API_AUTH_TOKEN`
- `ICE_SUB2API_USER_ID`

For `elysiver.h-e.top`:

- `ELYSIVER_COOKIE`
- `ELYSIVER_USER_ID`

Notes:

- You only need to configure the variables for the sites you enable.
- If you enable multiple sites, configure the variables for all of them.
- These login materials still need to be copied from the browser manually and refreshed again after they expire.

## Current Status

- The project already works with GitHub Actions automation
- Two real public-benefit sites are already integrated
- Different sites require different login materials, so their Secrets must be configured separately

## Future Plan

More public-benefit sites will be added in the future, and the automation workflow will continue to be improved for better stability and maintainability.

## Notes

This project should only be used for automation within your own authorized accounts and scope.
When integrating real sites, please follow each website's terms of service and reasonable access limits.
