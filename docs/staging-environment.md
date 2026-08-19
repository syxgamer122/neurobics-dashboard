# Staging Environment Setup

To ensure stability on the `main` branch, MindGem utilizes a Staging environment where new features, architectural changes, and migration tests are conducted before rolling out to Production.

## Infrastructure
- **Hosting:** Vercel (Preview Deployments for Pull Requests)
- **Database:** Supabase Staging Project (an exact schema replica of Production, but with seeded/anonymized data).
- **Branch:** Changes pushed to the `staging` branch automatically deploy to the Supabase Staging project.

## How to Test on Staging
- Checkout the `staging` branch.
- Ensure your environment configuration is pointed to the Supabase Staging URL and Anon Key.
- Commit and push your changes to GitHub. The CI will automatically deploy migrations and edge functions to the staging project.
- Run `pnpm run build` and test the application against the staging environment.
- Perform manual QA, focusing especially on any edge cases identified during development.

## Merging to Production
Once a feature has passed CI (`pnpm run check`) and manual QA on Staging, open a Pull Request from `staging` to `main`.
The CI pipeline on `main` will run the `db:migrate:smoke` step to guarantee that the production database migrations will apply cleanly.
