# School Email Sync

The dashboard merges `school-communications.json` with ManageBac notifications.
The GitHub workflow runs at 3:00 PM and 4:30 PM IST on weekdays and archives
all matching Gaudium email, including downloadable attachments.

The workflow needs these repository secrets:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`

Create a Google OAuth desktop client with the
`https://www.googleapis.com/auth/gmail.readonly` scope, authorize the parent
mailbox, and store the resulting client values and refresh token as GitHub
Actions secrets. No Gmail credential is stored in source or dashboard data.

The default search is:

```text
from:thegaudium.com after:2026/07/01
```

Override `SCHOOL_EMAIL_QUERY` in the workflow when the school changes its
sending domain or a new academic year starts.
