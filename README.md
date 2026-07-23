# Schoolwork

Private multi-student ManageBac dashboard for classroom learnings, assignments,
discussion homework, images, files, due dates, calendars, and notifications.

Production: <https://advika-classroom-2026.go4chaitu.chatgpt.site>

## Privacy and persistence

This public repository contains application source, database migrations, and the
scheduled sync workflow. It intentionally contains no student records,
ManageBac passwords, sync secrets, or private site access tokens.

Student data is stored in the Cloudflare D1 database attached to the Sites
project and mirrored to `data/classroom` by the scheduled GitHub workflow:

- `classroom_snapshots` keeps the latest record for each student.
- `classroom_snapshot_history` appends every successful sync for long-term
  history.
- `data/classroom/<student>/latest.json` is the repository-backed read copy.
- `data/classroom/<student>/history` keeps one JSON file per successful sync.
- `data/classroom/<student>/assets` keeps authenticated copies of every image
  and attachment referenced by a snapshot. Snapshot links point to these copies
  and retain the ManageBac URL in `sourceUrl`.
- the classroom API reads GitHub first and falls back to D1 during repository
  propagation or an upstream outage.
- the site remains owner-only even though this source repository is public.

## Students

The application currently supports:

- Advika, using `MANAGEBAC_LOGIN` and `MANAGEBAC_PASSWORD`.
- Adrika, using `MANAGEBAC_ADRIKA_LOGIN` and
  `MANAGEBAC_ADRIKA_PASSWORD`.

All credential values must be configured as secrets in the Sites runtime. Do
not add them to `.env.example`, migrations, commits, workflow files, or logs.

## Scheduled sync

`.github/workflows/managebac-sync.yml` calls the protected production sync
endpoint at 7:00 AM, 11:00 AM, 3:00 PM, and 5:30 PM Asia/Kolkata, Monday
through Friday. Each archived item keeps the timestamp from the first snapshot
in which it appeared. Configure these GitHub Actions secrets:

- `SYNC_URL`
- `SYNC_SECRET`
- `SIWC_BYPASS_TOKEN`

The endpoint syncs every configured student in one run. It can also sync one
student with `?student=advika` or `?student=adrika`.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm test
```

Useful commands:

- `npm run build` builds the vinext application.
- `npm run lint` checks the source.
- `npm run db:generate` generates Drizzle migrations after schema changes.
- `scripts/run-managebac-sync.sh` invokes the protected production sync using
  `.secrets/managebac-sync.env`.
