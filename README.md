# ScholarBook Visa Prep — Working Demo

This package is a local working prototype with:

- Role-based demo accounts (athlete, visa prep agent, athlete manager, supervisor)
- Persistent local JSON data
- Athlete progress dashboards
- OpenAI Realtime voice mock interview over WebRTC
- Dynamic AI follow-up questions
- Transcript capture hooks
- GPT-5.6 readiness evaluation
- Human review by Efe-Sam / supervisor
- Athlete-manager visibility
- Readiness scoring only — never visa approval probability

## Requirements

- Node.js 18+ (Node 20+ recommended)
- An OpenAI API key with access to the models used
- Chrome or Edge for microphone/WebRTC testing
- Internet access while running the demo

## Run

Mac/Linux:

```bash
cd ScholarBook_Visa_Prep_Working_Demo
export OPENAI_API_KEY="YOUR_KEY"
node server.js
```

Windows PowerShell:

```powershell
cd ScholarBook_Visa_Prep_Working_Demo
$env:OPENAI_API_KEY="YOUR_KEY"
node server.js
```

Then open:

```text
http://localhost:3000
```

## Demo accounts

All demo passwords are:

```text
demo123
```

Accounts:

- Visa Prep Agent: `efe.sam@scholarbook.net`
- Athlete: `jackson@demo.scholarbook.net`
- Athlete Manager: `manager@demo.scholarbook.net`
- Supervisor: `supervisor@demo.scholarbook.net`

These are prototype credentials only. Do not use them in production.

## Important privacy/security notes

This is a prototype, not production software. Before using real ScholarBook athlete data, the company should approve:

- what athlete data may be stored
- retention/deletion rules
- access permissions by role
- recording/transcript consent
- encryption at rest and in transit
- production authentication/SSO
- audit logging
- hosting region and vendor agreements
- whether interview recordings may be retained

Do not store passport numbers, DS-160 content, financial documents, or other sensitive applicant data in this demo.

## OpenAI architecture

The browser microphone connects to the OpenAI Realtime API through WebRTC. The standard API key remains server-side. The server creates the Realtime call and forwards the SDP answer.

After the interview, the transcript is sent to the Responses API for a readiness evaluation. The evaluator is explicitly instructed never to predict visa approval or provide a visa approval probability.

## Production next steps

1. Replace JSON storage with PostgreSQL.
2. Replace demo sessions with ScholarBook SSO/OAuth.
3. Add explicit consent before recording/transcription.
4. Add encrypted object storage if recordings are retained.
5. Add audit logs and per-role permissions.
6. Validate the scoring rubric with ScholarBook leadership and visa-prep staff.
7. Run a limited pilot before company-wide deployment.
