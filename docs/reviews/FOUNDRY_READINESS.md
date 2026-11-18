# Foundry Readiness

Bounded local inspection only; no installs, fetches, servers, WSL, PATH changes, or application edits.

## Exact findings

- `Get-Command forge,cast,anvil,node,pnpm`: `forge`, `cast`, and `anvil` were not found. `node` resolves to `C:\Program Files\nodejs\node.exe`, version `22.22.3.0`. `pnpm` resolves to `C:\Users\ADMIN\AppData\Roaming\npm\pnpm.ps1`.
- `C:\Users\ADMIN\.foundry\bin`: missing.
- `C:\Program Files\Git\bin\bash.exe`: present.
- `C:\AI-workspace\commitpot\.tools`: missing.
- Missing capability: Foundry CLI (`forge`, `cast`, `anvil`); no current Foundry owner or dependency route was selected.

## Executed commands

- `Get-Command forge,cast,anvil,node,pnpm -ErrorAction SilentlyContinue`
- Exact `Test-Path`/`Get-Item` checks for the three paths above.
- `forge --version`: not executed because `forge` was unavailable.
