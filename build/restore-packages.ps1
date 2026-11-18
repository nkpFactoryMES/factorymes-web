<#
목적: build/package-lock.json에 고정한 FactoryMES 공유 패키지(nupkg)를 .packages 폴더에 준비한다.
입력:
  -SeedDirectory  (선택) 이미 받아 둔 nupkg가 있는 폴더. 최초 로컬 검증에서 platform이 만든 파일을 쓴다.
                  없으면 공개 GitHub Release 자산을 내려받는다(토큰 불필요).
처리:
  1. 패키지마다 .packages/<file>이 이미 있고 SHA-256이 맞으면 그대로 둔다.
  2. 없으면 SeedDirectory에서 복사하거나 Release 주소에서 내려받는다.
  3. SHA-256이 잠금 값과 다르면 파일을 지우고 실패한다(다른 내용의 같은 버전을 쓰지 않는다).
결과: 성공하면 0, 실패하면 오류로 멈춘다. 비밀 값이나 토큰을 읽지 않는다.
잠금 형식(schemaVersion 1): packages[{id, version, file, repo, tag, sha256}].
  자산 주소 = https://github.com/nkpFactoryMES/<repo>/releases/download/<tag>/<file>
#>
param(
    [string]$SeedDirectory = ""
)

$ErrorActionPreference = "Stop"
$owner = "nkpFactoryMES"

$root = Split-Path -Parent $PSScriptRoot
$lock = Get-Content -Raw -Path (Join-Path $PSScriptRoot "package-lock.json") | ConvertFrom-Json
if ($lock.schemaVersion -ne 1) {
    throw "Unsupported build/package-lock.json schemaVersion: $($lock.schemaVersion)"
}
$target = Join-Path $root ".packages"
New-Item -ItemType Directory -Force -Path $target | Out-Null

function Get-Sha256([string]$path) {
    return (Get-FileHash -Algorithm SHA256 -Path $path).Hash.ToLowerInvariant()
}

foreach ($package in $lock.packages) {
    $expected = "$($package.sha256)".ToLowerInvariant()
    if ($expected -notmatch "^[0-9a-f]{64}$") {
        throw "$($package.id) $($package.version): " `
            + "SHA-256 is not pinned in build/package-lock.json."
    }

    $file = Join-Path $target $package.file
    if ((Test-Path $file) -and (Get-Sha256 $file) -eq $expected) {
        Write-Host "OK (cached) $($package.file)"
        continue
    }

    if ($SeedDirectory -ne "") {
        $seed = Join-Path $SeedDirectory $package.file
        if (-not (Test-Path $seed)) {
            throw "Seed file not found: $($package.file)"
        }
        Copy-Item -Force -Path $seed -Destination $file
        Write-Host "Copied from seed $($package.file)"
    }
    else {
        $url = "https://github.com/$owner/$($package.repo)/releases/download/" `
            + "$($package.tag)/$($package.file)"
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $file
        Write-Host "Downloaded $($package.file) from $owner/$($package.repo) $($package.tag)"
    }

    $actual = Get-Sha256 $file
    if ($actual -ne $expected) {
        Remove-Item -Force -Path $file
        throw "$($package.file): SHA-256 mismatch (expected $expected, got $actual)."
    }

    Write-Host "OK $($package.file)"
}
