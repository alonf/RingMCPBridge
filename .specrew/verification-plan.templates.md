# Verification plan - templates

`.specrew/verification-plan.json` is yours to edit. It starts with one command: Specrew's own
governance validation, which is the only check that works in every project without configuration.

**Add the command that builds and tests YOUR project.** Until you do, a review verifies that your
governance records are consistent - it does not verify that your code works.

Copy one of these into the `commands` array and adjust it.

## .NET

```json
{
  "command_id": "dotnet-test",
  "executable": "dotnet",
  "arguments": ["test", "--configuration", "Release", "--nologo"],
  "timeout_seconds": 900,
  "env_refs": ["PATH", "PATHEXT", "SYSTEMROOT", "COMSPEC", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA", "DOTNET_CLI_HOME", "NUGET_PACKAGES"],
  "provenance": { "kind": "project-config", "source": ".specrew/verification-plan.json" },
  "label": "Build and test"
}
```

## Node / npm

```json
{
  "command_id": "npm-test",
  "executable": "npm",
  "arguments": ["test"],
  "timeout_seconds": 900,
  "env_refs": ["PATH", "PATHEXT", "SYSTEMROOT", "COMSPEC", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA", "npm_config_cache"],
  "provenance": { "kind": "project-config", "source": ".specrew/verification-plan.json" },
  "label": "Build and test"
}
```

## Two rules worth knowing before you edit

**Environment variables are declared by NAME, never by value.** `env_refs` lists the names a command is
allowed to inherit. A literal `env` or `environment` map is refused, so that no plan can carry a secret.
If a command needs something not listed, add its NAME to `env_refs`.

**Every command must finish inside the review's time window.** The sum of the `timeout_seconds` values
has to fit within the window a review round is given, or a slow day ends in a failure that reports the
window rather than your tests. A timeout is a hang-catcher, not an estimate: set it well above how long
the command really takes, and still well inside the round.