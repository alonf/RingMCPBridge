# Dependency Report: Iteration 001

**Schema**: v1
**Reviewed**: 2026-11-15
**Baseline Ref**: ae40fa10981259acab40787c0b60e38366a1cdde

> **⚠️ Review Evidence Warning** _(Form-vs-Meaning Gap Detected)_
>
> This iteration's task tracking declares **19 completed task(s)**, but the git diff against baseline `ae40fa10981259acab40787c0b60e38366a1cdde` contains **402 file(s)**.
>
> **Severity**: WARNING
> **Implication**: Review evidence may be incomplete or misleading.
>
> **Possible causes**:
>
> - Implementation work was not committed before scaffolding review artifacts
> - Task status markers in plan.md or review.md do not match actual progress
> - Baseline reference in state.md is stale or incorrect
>
> **Remediation**:
>
> 1. Verify implementation is committed: `git diff ae40fa10981259acab40787c0b60e38366a1cdde...HEAD --stat`
> 2. If uncommitted work exists: `git add . && git commit -m "Implementation complete"`
> 3. Re-run scaffolder with `-Force` flag to regenerate review artifacts after commit
> 4. Re-run `validate-governance.ps1` to clear pre-review commit gate error
>
> _See Proposal 073 (Review Evidence Integrity) for background on this validation._

---

## Dependency Delta

| Ecosystem | Package | Prior Version | New Version | Change Type | License | Owning Task |
| --------- | ------- | ------------- | ----------- | ----------- | ------- | ----------- |
| npm | typescript-eslint | none | 8.72.1 | added | unknown | CP-01 |
| npm | prettier | none | 3.9.10 | added | unknown | CP-01 |
| npm | @playwright/test | none | 1.64.1 | added | unknown | CP-01 |
| npm | dependency-cruiser | none | 18.7.0 | added | unknown | CP-01 |
| npm | @types/ws | none | 8.18.2 | added | unknown | CP-01 |
| npm | typescript | none | 6.0.3 | added | unknown | CP-01 |
| npm | @stryker-mutator/core | none | 10.1.1 | added | unknown | CP-01 |
| npm | @vitest/coverage-v8 | none | 5.0.5 | added | unknown | CP-01 |
| npm | @types/node | none | 26.6.6 | added | unknown | CP-01 |
| npm | vitest | none | 5.0.5 | added | unknown | CP-01 |
| npm | @stryker-mutator/vitest-runner | none | 10.1.1 | added | unknown | CP-01 |
| npm | eslint | none | 10.14.0 | added | unknown | CP-01 |
| npm | eslint-config-prettier | none | 10.1.8 | added | unknown | CP-01 |
| npm | vite | none | 8.3.5 | added | unknown | CP-01 |

## New-to-Project

- typescript-eslint
- prettier
- @playwright/test
- dependency-cruiser
- @types/ws
- typescript
- @stryker-mutator/core
- @vitest/coverage-v8
- @types/node
- vitest
- @stryker-mutator/vitest-runner
- eslint
- eslint-config-prettier
- vite

## Vulnerability Scan

- status: scanned
- tool: npm
- version: 11.9.0
- exit_code: 1
- high_critical_findings: 6

```text
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "@eslint/config-array": {
      "name": "@eslint/config-array",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        "minimatch"
      ],
      "effects": [],
      "range": "0.23.0 - 0.23.5",
      "nodes": [
        "node_modules/@eslint/config-array"
      ],
      "fixAvailable": true
    },
    "@stryker-mutator/core": {
      "name": "@stryker-mutator/core",
      "severity": "moderate",
      "isDirect": true,
      "via": [
        "minimatch"
      ],
      "effects": [
        "@stryker-mutator/vitest-runner"
      ],
      "range": ">=6.4.2",
      "nodes": [
        "node_modules/@stryker-mutator/core"
      ],
      "fixAvailable": false
    },
    "@stryker-mutator/vitest-runner": {
      "name": "@stryker-mutator/vitest-runner",
      "severity": "moderate",
      "isDirect": true,
      "via": [
        "@stryker-mutator/core"
      ],
      "effects": [],
      "range": "*",
      "nodes": [
        "node_modules/@stryker-mutator/vitest-runner"
      ],
      "fixAvailable": false
    },
    "@typescript-eslint/eslint-plugin": {
      "name": "@typescript-eslint/eslint-plugin",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        "@typescript-eslint/type-utils",
        "@typescript-eslint/utils"
      ],
      "effects": [],
      "range": "6.16.0 - 8.72.2",
      "nodes": [
        "node_modules/@typescript-eslint/eslint-plugin"
      ],
      "fixAvailable": true
    },
    "@typescript-eslint/parser": {
      "name": "@typescript-eslint/parser",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        "@typescript-eslint/typescript-estree"
      ],
      "effects": [
        "typescript-eslint"
      ],
      "range": "6.16.0 - 8.72.2",
      "nodes": [
        "node_modules/@typescript-eslint/parser"
      ],
      "fixAvailable": {
        "name": "typescript-eslint",
        "version": "8.36.0",
        "isSemVerMajor": true
      }
    },
    "@typescript-eslint/type-utils": {
      "name": "@typescript-eslint/type-utils",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        "@typescript-eslint/typescript-estree",
        "@typescript-eslint/utils"
      ],
      "effects": [
        "@typescript-eslint/eslint-plugin"
      ],
      "range": "6.16.0 - 8.72.2",
      "nodes": [
        "node_modules/@typescript-eslint/type-utils"
      ],
      "fixAvailable": true
    },
    "@typescript-eslint/typescript-estree": {
      "name": "@typescript-eslint/typescript-estree",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        "minimatch"
      ],
      "effects": [
        "@typescript-eslint/parser",
        "@typescript-eslint/type-utils",
        "@typescript-eslint/utils",
        "typescript-eslint"
      ],
      "range": "6.16.0 - 8.72.2",
      "nodes": [
        "node_modules/@typescript-eslint/typescript-estree"
      ],
      "fixAvailable": {
        "name": "typescript-eslint",
        "version": "8.36.0",
        "isSemVerMajor": true
      }
    },
    "@typescript-eslint/utils": {
      "name": "@typescript-eslint/utils",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        "@typescript-eslint/typescript-estree"
      ],
      "effects": [
        "typescript-eslint"
      ],
      "range": "6.16.0 - 8.72.2",
      "nodes": [
        "node_modules/@typescript-eslint/utils"
      ],
      "fixAvailable": {
        "name": "typescript-eslint",
        "version": "8.36.0",
        "isSemVerMajor": true
      }
    },
    "eslint": {
      "name": "eslint",
      "severity": "moderate",
      "isDirect": true,
      "via": [
        "minimatch"
      ],
      "effects": [],
      "range": "10.0.0-alpha.0 - 10.14.0",
      "nodes": [
        "node_modules/eslint"
      ],
      "fixAvailable": {
        "name": "eslint",
        "version": "10.15.0",
        "isSemVerMajor": false
      }
    },
    "ip": {
      "name": "ip",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1101851,
          "name": "ip",
          "dependency": "ip",
          "title": "ip SSRF improper categorization in isPublic",
          "url": "https://github.com/advisories/GHSA-2p57-rm9w-gvfp",
          "severity": "high",
          "cwe": [
            "CWE-918"
          ],
          "cvss": {
            "score": 8.1,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:H"
          },
          "range": "<=2.0.1"
        }
      ],
      "effects": [
        "werift"
      ],
      "range": "*",
      "nodes": [
        "node_modules/ip"
      ],
      "fixAvailable": {
        "name": "ring-client-api",
        "version": "9.13.0",
        "isSemVerMajor": true
      }
    },
    "minimatch": {
      "name": "minimatch",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        {
          "source": 1244623,
          "name": "minimatch",
          "dependency": "minimatch",
          "title": "minimatch has potential denial of service via globparts amplification",
          "url": "https://github.com/advisories/GHSA-g3hv-75wg-m249",
          "severity": "moderate",
          "cwe": [
            "CWE-405"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": ">=7.0.0 <11.0.1"
        }
      ],
      "effects": [
        "@eslint/config-array",
        "@stryker-mutator/core",
        "@typescript-eslint/typescript-estree",
        "eslint"
      ],
      "range": "7.0.0 - 11.0.0",
      "nodes": [
        "node_modules/minimatch"
      ],
      "fixAvailable": false
    },
    "qs": {
      "name": "qs",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        {
          "source": 1119502,
          "name": "qs",
          "dependency": "qs",
          "title": "qs has a remotely triggerable DoS: qs.stringify crashes with TypeError on null/undefined entries in comma-format arrays when encodeValuesOnly is set",
          "url": "https://github.com/advisories/GHSA-q8mj-m7cp-5q26",
          "severity": "moderate",
          "cwe": [
            "CWE-476"
          ],
          "cvss": {
            "score": 5.3,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"
          },
          "range": ">=6.11.1 <=6.15.1"
        },
        {
          "source": 1158506,
          "name": "qs",
          "dependency": "qs",
          "title": "qs array-limit bypass via bracket-key comma parsing",
          "url": "https://github.com/advisories/GHSA-x5fp-wj9c-mxmx",
          "severity": "moderate",
          "cwe": [
            "CWE-770"
          ],
          "cvss": {
            "score": 3.7,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:L"
          },
          "range": ">=6.14.2 <=6.15.3"
        },
        {
          "source": 1158507,
          "name": "qs",
          "dependency": "qs",
          "title": "qs: Denial of Service via Attacker Controlled isBuffer",
          "url": "https://github.com/advisories/GHSA-4mjr-xmp4-gh2g",
          "severity": "moderate",
          "cwe": [
            "CWE-248",
            "CWE-703"
          ],
          "cvss": {
            "score": 5.3,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"
          },
          "range": ">=2.2.5 <6.16.0"
        },
        {
          "source": 1243687,
          "name": "qs",
          "dependency": "qs",
          "title": "qs : qs.stringify with arrayFormat 'comma' throws an uncaught TypeError on array elements carrying a non-callable own toString (DoS)",
          "url": "https://github.com/advisories/GHSA-6pq8-jhm2-2vcw",
          "severity": "moderate",
          "cwe": [
            "CWE-248",
            "CWE-704"
          ],
          "cvss": {
            "score": 5.3,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"
          },
          "range": ">=6.7.0 <=6.16.0"
        }
      ],
      "effects": [
        "typed-rest-client"
      ],
      "range": "2.2.5 - 6.16.0",
      "nodes": [
        "node_modules/qs"
      ],
      "fixAvailable": true
    },
    "ring-client-api": {
      "name": "ring-client-api",
      "severity": "high",
      "isDirect": true,
      "via": [
        "werift"
      ],
      "effects": [],
      "range": "11.0.1 - 14.3.0",
      "nodes": [
        "node_modules/ring-client-api"
      ],
      "fixAvailable": {
        "name": "ring-client-api",
        "version": "9.13.0",
        "isSemVerMajor": true
      }
    },
    "typed-rest-client": {
      "name": "typed-rest-client",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        "qs"
      ],
      "effects": [],
      "range": "2.3.1 - 3.1.0",
      "nodes": [
        "node_modules/typed-rest-client"
      ],
      "fixAvailable": true
    },
    "typescript-eslint": {
      "name": "typescript-eslint",
      "severity": "moderate",
      "isDirect": true,
      "via": [
        "@typescript-eslint/eslint-plugin",
        "@typescript-eslint/parser",
        "@typescript-eslint/typescript-estree",
        "@typescript-eslint/utils"
      ],
      "effects": [],
      "range": "<=8.72.2",
      "nodes": [
        "node_modules/typescript-eslint"
      ],
      "fixAvailable": {
        "name": "typescript-eslint",
        "version": "8.36.0",
        "isSemVerMajor": true
      }
    },
    "werift": {
      "name": "werift",
      "severity": "high",
      "isDirect": false,
      "via": [
        "ip"
      ],
      "effects": [
        "ring-client-api"
      ],
      "range": "<=0.24.0",
      "nodes": [
        "node_modules/werift"
      ],
      "fixAvailable": {
        "name": "ring-client-api",
        "version": "9.13.0",
        "isSemVerMajor": true
      }
    }
  },
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 13,
      "high": 3,
      "critical": 0,
      "total": 16
    },
    "dependencies": {
      "prod": 231,
      "dev": 331,
      "optional": 27,
      "peer": 0,
      "peerOptional": 0,
      "total": 561
    }
  }
}
```

## Transitive Surface

- unresolved | No lockfile- or tool-backed transitive resolution signal was captured in v1.
