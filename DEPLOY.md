# VisaAtlas deployment

## Configuration

Use Render's environment settings (or a local environment for development). Never commit real values.

| Variable | Purpose |
| --- | --- |
| DATABASE_URL | PostgreSQL connection string; required |
| OPENAI_API_KEY | Server-side OpenAI credential for voice and feedback |
| RESEND_API_KEY | Email verification and password recovery delivery |
| RESEND_FROM | Verified sending address |
| APP_BASE_URL | Canonical HTTPS origin, normally https://visaatlasprep.com |
| PASSWORD_RESET_SECRET | Optional dedicated secret of at least 32 characters; recovery otherwise uses the Resend key |
| COACH_EMAIL / COACH_PASSWORD | Optional initial coach bootstrap; password must be 15–128 characters |
| EVALUATION_MODEL | Optional report model override |
| PORT | Supplied by hosting; defaults to 3000 |
| NODE_ENV | Set to production for production deployments |

Existing coach passwords are preserved at startup. Changing COACH_PASSWORD does not reset an existing account. Use password recovery or the authenticated password-change flow. Owner activation is documented in OWNER_ACCESS.md.

Build: npm ci
Start: npm start

Startup creates missing tables and inserts seed state only if no app_state row exists. Preserve DATABASE_URL across deployments. This application uses PostgreSQL, not a local JSON file for ongoing persistence.

## Release checks

1. Back up the production database and verify who can restore it.
2. Review and merge the intended PR; wait for Render to finish deployment.
3. Confirm registration, verification email, sign-in and recovery using an authorized test account.
4. Confirm the per-session voice notice appears for tutoring and mocks. Cancel must not request microphone access; accepting must allow the normal browser permission prompt.
5. Finish a short mock and confirm its transcript/report and profile persist after reloading.
6. Confirm students cannot read or write another student's records, and only intended staff have access.
7. Test iPhone Safari and a desktop browser with real microphones. Unit tests do not establish live speech quality.
8. Check provider usage and charges: daily attempt limits are removed, so increased usage can increase costs.

Changing repository visibility requires GitHub administrative access. Verify the Render GitHub integration is authorized for the private repository before relying on future auto-deploys. Do not remove the integration accidentally when removing a person.

## Boundaries of the code review

No production database, active account credential audit, provider retention configuration, database encryption setting or restore test was inspected from this workspace. Application changes become effective only after deployment. Restarting clears the in-memory sign-in sessions.

The voice confirmation is UI-only and is not a durable consent audit. Retention/deletion policies and full audit coverage remain outstanding. See PILOT_AND_REVIEW.md.

