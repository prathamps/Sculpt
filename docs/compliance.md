# Compliance

Sculpt is software, not a certified service: SOC 2, ISO 27001 and TPN assess
the organisation that runs it. This page lists the technical controls Sculpt
provides, maps them to the frameworks auditors use, and says plainly what stays
the deployer's job and where Sculpt's controls stop.

## Which frameworks apply

| Framework | Applies when |
| --- | --- |
| **GDPR / UK GDPR** | Almost always — Sculpt stores names, email addresses and IP addresses of people in the EU/UK. |
| **SOC 2 / ISO 27001** | You are a service provider whose customers ask for an attestation or certificate. |
| **TPN / MPA Content Security Best Practices** | You review unreleased film, TV or games content for studios. |
| **WCAG 2.1 AA / EN 301 549 / Section 508** | You sell to the public sector, or into the EU under the Accessibility Act. |
| **OWASP ASVS** | A technical benchmark many auditors accept for the application itself. |

PCI DSS does not apply (Sculpt takes no payments). Do not use Sculpt for
protected health information without a separate HIPAA assessment.

## Control matrix

| Control | How Sculpt provides it | SOC 2 | ISO 27001:2022 | GDPR | TPN | ASVS |
| --- | --- | --- | --- | --- | --- | --- |
| Role-based access | Project roles VIEWER < MEMBER < EDITOR < OWNER, checked at every route; admin console on a separate session | CC6.1, CC6.3 | A.5.15, A.8.3 | Art. 32 | Access control | V4 |
| Multi-factor authentication | TOTP with single-use recovery codes; required for admins by default, optionally for everyone; secrets AES-256-GCM encrypted | CC6.1 | A.8.5 | Art. 32 | MFA for content systems | V2.8 |
| Brute-force protection | Per-IP rate limits plus per-account lockout covering passwords and two-factor codes; timing-equalised unknown-account checks | CC6.1 | A.8.5 | Art. 32 | Account lockout | V2.2 |
| Session management | 1 h sliding idle timeout (configurable to 5 min), 7-day absolute limit, revocation on logout, password change, role change and two-factor change | CC6.1 | A.8.5 | — | Session timeout | V3 |
| Audit trail | Every data or access change, every permission refusal, every view and download of originals, proxies and attachments, every admin read; actor, target, IP, user agent, request id | CC7.2, CC7.3 | A.8.15 | Art. 30, 33 support | Content access logging | V7.1, V7.2 |
| Log integrity | Hash-chained, sequence-numbered entries; database trigger rejects updates; on-demand verification; independent copy on the log stream | CC7.2 | A.8.15 | — | Log protection | V7.3 |
| Monitoring | Prometheus metrics: audit events by action (sign-in failures, lockouts, refusals), audit-write failures, latency and queue depth; structured JSON logs with request ids | CC7.2 | A.8.16 | — | Monitoring | V7 |
| Encryption in transit | TLS deployment profile; Secure cookies on HTTPS; production refuses plain HTTP on a network address unless explicitly accepted; HSTS | CC6.7 | A.8.24 | Art. 32 | Encryption in transit | V9 |
| Encryption at rest | Two-factor secrets encrypted by the app; S3 server-side encryption (SSE-S3 or KMS) configurable; disks and database are the deployer's | CC6.7 | A.8.24 | Art. 32 | Encryption at rest | V6 |
| Download control | Per-project switch: when off, only editors and owners download originals, viewers stream the proxy, frame export is hidden | CC6.1 | A.8.3 | — | Download restriction | — |
| Watermarking | Per-project visible overlay of the viewer's email and date | — | — | — | Visible watermarking (see limits) | — |
| Expiring access | Share links expire after 7 days by default; operators can set a maximum; links are hashed at rest | CC6.2 | A.5.18 | — | Link expiry | V3 |
| Change history | Comment edits keep every previous version; review approvals survive account deletion | PI1 | A.8.15 | — | — | — |
| Data subject rights | Self-service export (Art. 15, 20), profile edit (Art. 16), account deletion (Art. 17) | P-series | A.5.34 | Art. 15–17, 20 | — | — |
| Storage limitation | Notifications pruned after 90 days; expired invitations, reset tokens and revoked sessions pruned; audit retention configurable | P4.2 | A.5.34 | Art. 5(1)(e) | — | — |
| Data minimisation in logs | Log lines carry ids, never comment text or emails | — | A.8.15 | Art. 5(1)(c) | — | V7.1 |
| Accessibility | Labelled controls, keyboard support, visible focus; axe-core checks in unit tests and the browser smoke suite | — | — | — | — | — |
| Secure development | CI runs typecheck, tests, zero-comment gate, dependency audit and browser smoke suite on every change | CC8.1 | A.8.25, A.8.28 | Art. 25 | SDLC | V1, V14 |

## What the audit trail answers

- **Who saw this file?** Filter by target id (the version) and action
  `media.accessed` or `media.downloaded`.
- **Who changed access?** Actions `project.member_*`, `share_link.*`,
  `project.invitation_*`, `user.role_changed` (with previous and new role).
- **What did this person do?** Filter by actor id; entries of deleted accounts
  keep the id.
- **What happened during this incident?** Filter by IP and date range; the
  request id ties an entry to the API's log lines.
- **Has anyone tampered with the trail?** **Verify integrity** at `/admin/audit`.

## Deployer responsibilities

Sculpt cannot do these for you:

- Written security, access-review, incident-response and retention policies.
- A data processing agreement with your customers, and a record of processing.
- Encrypted disks for the database and uploads volume (or SSE on S3), and
  encrypted, tested backups — see [backup-and-restore.md](backup-and-restore.md).
- Shipping the log stream to a store Sculpt's own credentials cannot modify,
  and alerting on `sculpt_audit_write_failures_total`, repeated
  `user.login_locked_out` and `access.denied`.
- A dedicated database role for Sculpt without `TRIGGER` or superuser rights,
  so the append-only trigger cannot be dropped by the application.
- Periodic access reviews of project owners and administrators.
- Patching: track releases and the advisories in [SECURITY.md](../SECURITY.md).

## Known limits

- **Watermarking is visible, not forensic.** The overlay deters and attributes
  screenshots; it is not embedded in the media, and an editor who may download
  originals receives them unmarked.
- **Originals without a proxy stay viewable.** When downloads are off, viewers
  are refused the original only where a browser-playable proxy exists (video
  and converted images). A JPEG or PDF is its own preview, so it is served —
  and a browser can save what it displays.
- **Access entries are coalesced.** Repeated access to the same file by the same
  person is recorded once per fifteen minutes per server instance.
- **Audit writes are best-effort.** A failed write never blocks the user; it is
  logged and counted so you can alert on it.
- **The chain proves integrity, not completeness against a database owner.**
  Someone with database superuser rights could rewrite the whole chain; the
  copy on your log stream is what detects that.
- **Entries from before this release are not chained.** Verification reports
  them separately.
- **Accessibility has automated coverage, not a formal audit.** Commission a
  manual WCAG 2.1 AA review before claiming conformance.
