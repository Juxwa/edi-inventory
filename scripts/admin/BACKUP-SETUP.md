# Weekly database backups

Two layers, pick per budget:

## Recommended (production): Supabase Pro
Free tier has **no automated backups**. Supabase Pro ($25/mo) gives daily
automated backups + point-in-time recovery with nothing to maintain. For a
live medical app this should be the primary backup. Enable under
Project → Settings → Add-ons / Database → Backups.

## Local weekly dump (free, supplement or stopgap)
`scripts/admin/backup-db.ps1` writes a timestamped `edi-backup-<date>.zip`
(roles + schema + data) into `app/backups/` and keeps the last 8.

**Requirements:** Docker Desktop running, Supabase CLI (via npx), and
`SUPABASE_DB_PASSWORD` in `app/.env.local` (already present).

### Run once (test)
```powershell
cd "D:\Claude\EDI Inventory System\EDI Inventory\app"
powershell -ExecutionPolicy Bypass -File scripts\admin\backup-db.ps1
```

### Schedule weekly (Windows Task Scheduler)
Runs Sundays at 02:00. Run this ONCE in an **elevated** PowerShell:
```powershell
$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument '-ExecutionPolicy Bypass -File "D:\Claude\EDI Inventory System\EDI Inventory\app\scripts\admin\backup-db.ps1"'
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 2:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
  -RunOnlyIfNetworkAvailable
Register-ScheduledTask -TaskName "EDI DB Weekly Backup" `
  -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest
```
- `-StartWhenAvailable` runs a missed backup once the PC is next on.
- Docker Desktop must be running when it fires (set Docker to launch at
  login). If Docker is down the script exits with a clear error and no
  partial file.
- Verify / edit the job in Task Scheduler under **EDI DB Weekly Backup**.
- Remove with: `Unregister-ScheduledTask -TaskName "EDI DB Weekly Backup"`.

### Restore from a backup
Unzip and apply against the target project (roles → schema → data):
```powershell
Expand-Archive edi-backup-<date>.zip -DestinationPath restore
# then, with psql or supabase db query, run roles.sql, schema.sql, data.sql in order
```

## Security
`app/backups/` is gitignored — never commit dumps. They contain patient PII;
keep them on an encrypted / access-controlled disk and off any public sync.
Consider copying the weekly zip to a separate encrypted drive or private
cloud folder so a laptop loss doesn't take the backups with it.
