$source = 'c:\Users\hi\Downloads\digiflaz'
$dest = 'c:\Users\hi\Downloads\digiflaz\_deploy_temp'
$zip = 'c:\Users\hi\Downloads\digiflaz\satusaku-corp-pella.zip'

# Cleanup
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
if (Test-Path $zip) { Remove-Item -Force $zip }

# Create temp dir
New-Item -ItemType Directory -Path $dest | Out-Null

# Copy items, excluding unwanted folders/files
$excludeNames = @('.git', '_deploy_temp', '.vscode', 'node_modules', 'start.bat', 'deploy.bat', 'create-deploy-zip.ps1', 'satusaku-corp-pella.zip')

Get-ChildItem -Path $source | Where-Object {
    $excludeNames -notcontains $_.Name
} | ForEach-Object {
    $target = Join-Path $dest $_.Name
    if ($_.PSIsContainer) {
        Copy-Item -Path $_.FullName -Destination $target -Recurse -Force
    } else {
        $skipExtensions = @('.db', '.shm', '.wal')
        if ($skipExtensions -notcontains $_.Extension -and $_.Name -ne 'deploy.zip') {
            Copy-Item -Path $_.FullName -Destination $target -Force
        }
    }
}

# Note: node_modules NOT included - Pella runs npm install automatically
# Including it would make ZIP unnecessarily large

# Remove database files from temp
Get-ChildItem -Path $dest -Recurse -Include '*.db', '*.db-shm', '*.db-wal', '*.db-journal' -ErrorAction SilentlyContinue | Remove-Item -Force

# Create ZIP
Write-Host "Creating ZIP..."
Compress-Archive -Path "$dest\*" -DestinationPath $zip -Force

# Cleanup temp
Remove-Item -Recurse -Force $dest

# Report
$size = (Get-Item $zip).Length / 1MB
Write-Host "ZIP created: $zip"
Write-Host "Size: $([math]::Round($size, 2)) MB"