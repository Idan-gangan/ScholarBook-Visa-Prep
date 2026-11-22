# VisaAtlas Private SEVIS I-901 Intake

## Scope
- This is a **private document-intake service**, not a U.S. government form or SEVIS payment processor.
- Only Owner-authorized adult students can submit with a seven-day, one-use, random 256-bit invitation.
- Student provides name, SEVIS ID, school, date of birth, contact, current address, complete I-20 PDF (max 4 MB) and passport biodata JPG/PNG (max 3 MB).
- Use only for approved SEVIS I-901 fee assistance. **Never enter card details or upload additional passport pages.**
- No link from the public landing page or student profile. Owner UI available only behind Owner session at /owner-sevis.html.
- Every invitation, case review, file download, and case deletion requires the Owner's fresh account password.
- Submitted personal details and file bytes are encrypted with AES-256-GCM and random IVs at the application layer before storing in PostgreSQL. Encryption key stays in the Render environment, never GitHub/HTML/response.
- Documents are retrievable only by authenticated Owner via password-confirmed POST, with no-store and attachment headers; not visible to coaches, staff, other students, public reviews, AI tutor or Paystack.
- Automatic cleanup every six hours removes submitted case files after 30 days; also purged on server start and Owner case listing. Older database backups may retain data for the provider's separate backup retention period.
- Owner can delete cases earlier and revoke unused invitations. All uploads are immutable after submission.
- First rollout caps concurrent saved case files to 40 and active invitations to 100.

## Deployment gate — require all before handling real passports
1. Run the billing suite, general Node tests and PostgreSQL integration suite. Run synthetic API tests for invalid link, expired link, replay, CSRF/origin rejection, non-Owner access, Owner password, oversize, malicious-format files and response no-store. Confirm no PII appears in public routes or server logs.
2. Configure the Render web service using **encrypted environment secrets** (never commit):
   - SEVIS_INTAKE_ENABLED=true
   - SEVIS_INTAKE_ORIGIN=https://visaatlasprep.com
   - SEVIS_INTAKE_ENCRYPTION_KEY=64 hexadecimal characters representing 32 **cryptographically random** bytes.
3. **Back up the encryption key in approved company secret storage.** Losing or replacing this key makes existing encrypted documents permanently unreadable. Rotating requires a planned migration (or waiting for 30-day retention to complete).
4. Confirm PostgreSQL storage, backup and recovery capacity before accepting client documents. 40 cases x up to 7 MB ~= 280 MB just for encrypted file bytes; make sure actual DB plan and backup capacity are adequate.
5. Review updated privacy notice, legal basis for processing passport and immigration identifiers, safeguarding and cross-border disclosure obligations, plus internal retention/deletion procedures. Require guardian-assisted manual intake for clients under 18 until a verified guardian workflow is built.
6. Prefer company-managed secure devices for document download, with OS disk encryption and malware scanning; uploaded PDFs/images are untrusted data.
7. Test using synthetic documents, NOT a real client passport: Owner creates a private link, student submits test data, Owner views and downloads, then deletes case; verify replay and non-Owner denial.
8. Give Jeffrey his private link only after the above gates pass. Secure links are bearer secrets. Share them directly to the intended email, not on public social posts.

## Owner workflow
1. Log in as VisaAtlas Owner.
2. Visit /owner-sevis.html and enter student's email and current Owner password; select **Create private link**.
3. Copy the one-time URL while visible. Send it directly to the student.
4. Student uploads their complete I-20, passport biodata page, address and contact, reviews the consent notice, submits.
5. Owner opens the case, re-enters Owner password, reviews the fields and documents, and processes payment separately on the official FMJFee website after verification.
6. Once the official I-901 payment receipt is delivered, delete the intake case as soon as it is no longer needed. Keep any legally necessary payment bookkeeping/receipt outside this identity document system.

## Limitations
- This initial controlled-release service does not send an automatic confirmation email or automate Form I-901 submission.
- Uploaded files are validated by format signature and size, but **there is no antivirus/content-disarm engine in this version**; use secured workstations and malware scanning when opening documents.
- Owner-only access relies on current password plus existing authenticated Owner session, not phishing-resistant MFA. Add MFA before wider adoption.
- Invite email addresses are stored in plaintext in a private database table for operational tracking; the personal application details and documents are encrypted.
- Invitation links have no per-invite PIN; possession of a link is the authorization to submit. Send them only through a private trusted channel.
- PostgreSQL data is automatically removed from the live database, but provider backups and logs can outlive live rows.
- Any company accountant or contractor access must be separately authorized; no private documents are automatically shared with payment intermediaries.
