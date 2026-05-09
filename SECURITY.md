# Security Policy

Klemm is alpha software. Please do not use it to supervise high-value external actions without reviewing the decision queue and trust reports.

## Reporting Issues

Open a GitHub issue with:

- affected command or adapter
- expected behavior
- observed behavior
- whether secrets were exposed
- minimal reproduction steps

Do not include real secrets, tokens, private chat exports, or private logs in public issues.

## Security Model

Klemm is local-first and uses deterministic safety rules before softer judgment. It should queue or block risky actions including pushes, deploys, OAuth changes, credentials, external sends, financial/legal/reputation actions, and destructive filesystem work.

Imported context is evidence only. It does not become authority without review.

Dogfood exports, saved-me reports, debriefs, and trust reports should be treated as potentially sensitive local artifacts. Redact before sharing them publicly.

## Known Security Gaps

- External security review is still needed.
- Endpoint Security blocking is capability-gated and unavailable on machines without the required entitlement/root/TCC state.
- Unmanaged agents can be observed and recommended for wrapping, but not fully controlled.

## Alpha Security Feedback

Please report:

- secrets appearing in logs, trust reports, debriefs, adapter envelopes, or dogfood exports
- risky actions allowed silently
- unreviewed imported text becoming policy
- uninstall leaving sensitive artifacts behind
- adapter hooks bypassing Klemm authority checks
