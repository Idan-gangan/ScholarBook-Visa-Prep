# Student demo accounts

For owner-authorized demonstrations, run this in the deployed Render service's Shell after deploying this change:

```sh
node scripts/create-demo.cjs OWNER_EMAIL philipp "Philipp Baar"
```

The command creates `philipp.demo@example.invalid` and prints a newly generated password only after the transaction commits. Save it privately and share the login with Philipp yourself. Sign in at https://visaatlasprep.com. No email is sent and no real email address is needed. The reserved address cannot receive password-reset mail; save the generated password. The script refuses repeat creation and never changes an existing password.

This creates a student account with clearly labelled fictional profile details for lessons, voice practice, and mock interviews. Review My Profile before practising. It grants no staff access or access to other students. Normal voice consent, session limits and rate guards apply.

Run only from the trusted deployment shell using its existing DATABASE_URL. There is no public provisioning endpoint, startup seeding, or password in source. An existing owner and owner credential must be present; the database transaction locks app state, inserts a salted password hash, creates the student profile and records the provisioning event. Failures roll back the transaction. The owner's email identifies the audit actor; possession of deployment-shell/database access is the administrative authority.

These demo accounts explicitly do not require mailbox verification, as they use a reserved non-deliverable address. They are not marked email-verified. Ordinary public signups still require verification for voice access. Creating this PR does not create any live account: the command must be run on the deployed service.
