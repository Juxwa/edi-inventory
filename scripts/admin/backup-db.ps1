# Weekly local backup of the linked Supabase database.
# Produces a single timestamped .zip containing roles + schema + data dumps,
# suitable for a full restore. Keeps the last $KeepCount backups.
#
# Requires: Docker Desktop running (supabase db dump uses it for pg_dump),
# the Supabase CLI (via npx), and SUPABASE_DB_PASSWORD in app/.env.local.
#
# Run manually:   powershell -ExecutionPolicy Bypass -File scripts\admin\backup-db.ps1
# Schedule it:    see scripts\admin\BACKUP-SETUP.md
#
# NOTE: dumps contain patient PII. They are written under app\backups\ which
# is gitignored. Keep the backup folder on an encrypted / access-controlled
# disk, and off any synced-to-public location.

$ErrorActionPreference = "Stop"

# Resolve app root (this script lives in app\scripts\admin).
$AppRoot   = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$EnvFile   = Join-Path $AppRoot ".env.local"
$BackupDir = Join-Path $AppRoot "backups"
$KeepCount = 8   # retain this many most-recent backups

if (-not (Test-Path $EnvFile)) { throw ".env.local not found at $EnvFile" }

# Read SUPABASE_DB_PASSWORD from .env.local.
$dbPassword = $null
foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*SUPABASE_DB_PASSWORD\s*=\s*(.*)$') {
        $dbPassword = $Matches[1].Trim().Trim('"').Trim("'")
    }
}
if ([string]::IsNullOrWhiteSpace($dbPassword)) {
    throw "SUPABASE_DB_PASSWORD not set in .env.local"
}

# Fail early with a clear message if Docker isn't up (db dump needs it).
try { docker info *> $null } catch { throw "Docker Desktop is not running - start it and retry." }

$stamp   = Get-Date -Format "yyyy-MM-dd_HHmmss"
$workDir = Join-Path $BackupDir "edi-backup-$stamp"
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

# supabase db dump is a native exe; $ErrorActionPreference does not catch a
# nonzero exit, so check $LASTEXITCODE ourselves. Retry each dump a few times
# because the remote connection can drop mid-dump (SSL EOF) on large tables.
function Invoke-Dump {
    param([string]$Label, [string[]]$ExtraArgs, [string]$OutFile)
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        Write-Host "Dumping $Label (attempt $attempt)..."
        npx supabase db dump --linked -p $dbPassword @ExtraArgs -f $OutFile
        if ($LASTEXITCODE -eq 0 -and (Test-Path $OutFile) -and (Get-Item $OutFile).Length -gt 0) {
            return
        }
        Write-Host "  $Label dump failed (exit $LASTEXITCODE); retrying..."
        Start-Sleep -Seconds 5
    }
    throw "$Label dump failed after 3 attempts - backup aborted, no zip written."
}

Push-Location $AppRoot
try {
    Invoke-Dump -Label "roles"  -ExtraArgs @("--role-only") -OutFile (Join-Path $workDir "roles.sql")
    Invoke-Dump -Label "schema" -ExtraArgs @()              -OutFile (Join-Path $workDir "schema.sql")
    Invoke-Dump -Label "data"   -ExtraArgs @("--data-only") -OutFile (Join-Path $workDir "data.sql")
}
finally {
    Pop-Location
}

# Zip the three files, then drop the working folder.
$zipPath = Join-Path $BackupDir "edi-backup-$stamp.zip"
Compress-Archive -Path (Join-Path $workDir "*.sql") -DestinationPath $zipPath -Force
Remove-Item -Recurse -Force $workDir

$sizeMB = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Backup written: $zipPath ($sizeMB MB)"

# Rotation: keep only the newest $KeepCount zips.
$old = Get-ChildItem $BackupDir -Filter "edi-backup-*.zip" |
       Sort-Object LastWriteTime -Descending |
       Select-Object -Skip $KeepCount
foreach ($f in $old) {
    Remove-Item -Force $f.FullName
    Write-Host "Pruned old backup: $($f.Name)"
}

Write-Host "Done."
