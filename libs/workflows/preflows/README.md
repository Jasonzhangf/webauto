# Preflows

This folder holds pre-execution workflows. All main workflows must run only after all enabled preflows complete successfully.

- Configure enabled preflows in `workflows/preflows/enabled.json` as an array of workflow file paths.
- Each entry should be a valid workflow JSON (same schema as other workflows).
- If any preflow fails, the main workflow will not run.

Examples
- `workflows/preflows/enabled.json`
  - ["workflows/preflows/1688-login-preflow.json"]

