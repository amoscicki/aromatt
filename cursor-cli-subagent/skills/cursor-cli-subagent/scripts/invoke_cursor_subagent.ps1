[CmdletBinding(DefaultParameterSetName = "Run")]
param(
    [Parameter(ParameterSetName = "Run", Mandatory = $true)]
    [string] $Prompt,

    [Parameter(ParameterSetName = "Run")]
    [string] $Workspace = (Get-Location).Path,

    [Parameter(ParameterSetName = "Run")]
    [string] $Model = "composer-2.5",

    [Parameter(ParameterSetName = "Run")]
    [ValidateSet("text", "json", "stream-json")]
    [string] $OutputFormat = "text",

    [Parameter(ParameterSetName = "Run")]
    [ValidateSet("agent", "ask", "plan")]
    [string] $Mode = "agent",

    [Parameter(ParameterSetName = "Run")]
    [switch] $ForceWrites,

    [Parameter(ParameterSetName = "Run")]
    [ValidateSet("enabled", "disabled")]
    [string] $Sandbox,

    [Parameter(ParameterSetName = "Status")]
    [switch] $Status,

    [Parameter(ParameterSetName = "Models")]
    [switch] $Models,

    [Parameter(ParameterSetName = "Version")]
    [switch] $Version
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-CursorAgentPath {
    $localScript = Join-Path $env:LOCALAPPDATA "cursor-agent\cursor-agent.ps1"
    if (Test-Path -LiteralPath $localScript) {
        return $localScript
    }

    $command = Get-Command cursor-agent -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) {
        return $command.Source
    }

    throw "Cursor Agent CLI not found. Install with: irm 'https://cursor.com/install?win32=true' | iex"
}

function Invoke-CursorAgent {
    param([Parameter(Mandatory = $true)][string[]] $CursorArgs)

    $agentPath = Get-CursorAgentPath
    & $agentPath @CursorArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

if ($Version) {
    Invoke-CursorAgent @("--version")
    exit 0
}

if ($Status) {
    Invoke-CursorAgent @("status")
    exit 0
}

if ($Models) {
    Invoke-CursorAgent @("models")
    exit 0
}

$resolvedWorkspace = (Resolve-Path -LiteralPath $Workspace -ErrorAction Stop).Path
$args = @(
    "-p",
    "--output-format", $OutputFormat,
    "--model", $Model,
    "--trust",
    "--workspace", $resolvedWorkspace
)

if ($Mode -ne "agent") {
    $args += @("--mode", $Mode)
}

if ($ForceWrites) {
    $args += "--force"
}

if ($Sandbox) {
    $args += @("--sandbox", $Sandbox)
}

$args += $Prompt

Invoke-CursorAgent $args
