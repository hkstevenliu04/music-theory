# Version Bumper Script - Increments cache-busting version numbers
# Usage: .\bump-version.ps1
# Or specify version: .\bump-version.ps1 -NewVersion "1.0.2"

param(
    [string]$NewVersion = ""
)

$htmlFiles = @(
    "index.html",
    "index-spa.html",
    "music-theory.html",
    "theory-index.html",
    "chord-progression.html",
    "progression-info.html"
)

# Function to parse version
function Get-CurrentVersion {
    param([string]$Content)
    $matches = [regex]::Matches($Content, '\?v=(\d+\.\d+\.\d+)')
    if ($matches.Count -gt 0) {
        return $matches[0].Groups[1].Value
    }
    return $null
}

# Function to increment version
function Increment-Version {
    param([string]$Version)
    $parts = $Version.Split('.')
    [int]$major = $parts[0]
    [int]$minor = $parts[1]
    [int]$patch = $parts[2]
    
    $patch++
    return "$major.$minor.$patch"
}

# Read first file to get current version
$firstFile = $htmlFiles[0]
if (Test-Path $firstFile) {
    $content = Get-Content $firstFile -Raw
    $currentVersion = Get-CurrentVersion $content
    
    if ($null -eq $currentVersion) {
        Write-Host "[ERROR] No version found in $firstFile"
        exit 1
    }
    
    # Determine new version
    if ([string]::IsNullOrEmpty($NewVersion)) {
        $newVersion = Increment-Version $currentVersion
    } else {
        $newVersion = $NewVersion
    }
    
    Write-Host "[*] Bumping version: $currentVersion > $newVersion"
    Write-Host ""
    
    # Update all HTML files
    $updatedCount = 0
    foreach ($file in $htmlFiles) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw
            $updatedContent = $content -replace "\?v=$currentVersion", "?v=$newVersion"
            
            if ($updatedContent -ne $content) {
                Set-Content $file $updatedContent
                Write-Host "[+] Updated $file"
                $updatedCount++
            }
        } else {
            Write-Host "[!] File not found: $file"
        }
    }
    
    Write-Host ""
    Write-Host "[SUCCESS] Updated $updatedCount files!"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  git add ."
    Write-Host "  git commit -m 'Bump: Version $newVersion'"
    Write-Host "  git push"
    
} else {
    Write-Host "[ERROR] index.html not found"
    exit 1
}
