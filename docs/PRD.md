# School BPM — Product Requirements Document

| | |
|---|---|
| **Product** | School BPM — business process management platform for high schools |
| **Document version** | 1.0 |
| **Status** | Approved — MVP shipped |
| **Date** | 11 August 2026 |
| **Platform** | Web application (desktop-first, responsive) |
| **Technology** | Angular 20 · Node.js/Express · MongoDB |

## 1. Executive summary

High schools run dozens of recurring administrative processes — leave requests, purchase
requisitions, field-trip approvals, exam-paper moderation — usually over paper forms, chat
messages, and email threads. Approvals stall, records get lost, and leadership has no
visibility into what is pending where.

School BPM is a web platform on which a school defines its own processes and runs them
digitally. A process is a form plus an ordered approval chain: staff submit requests, the
right roles approve at each step, and every action is time-stamped in an auditable trail.
Roles, permissions, and the processes themselves are configured entirely from the admin UI —
the school never needs a developer to add a new workflow.

Version 1.0 (shipped) delivers the complete core loop: configurable role-based access
control, a process designer, the workflow engine with approve / reject / return-and-resubmit,
work queues, in-app notifications, dashboards, and an audit log — seeded with six roles and
five ready-made school processes.

## 2. Problem statement

- Requests travel by paper, WhatsApp, and email: there is no single source of truth, no
  status tracking, and no reliable record of who approved what.
- Approvals depend on physically finding the right person; a single absence stalls a request
  indefinitely.
- Governance-sensitive decisions (fee waivers, purchases, disciplinary steps) lack an audit
  trail.
- Every school's hierarchy differs (owner vs. proprietor vs. principal), so rigid
  off-the-shelf tools fit poorly, and custom software per process is unaffordable.

## 3. Goals & success metrics

| Goal | Success metric |
|---|---|
| Digitise recurring approval processes | ≥ 80% of target processes run on-platform within one term |
| Speed up decisions | Median request cycle time reduced ≥ 50% vs. paper baseline |
| Full accountability | 100% of decisions carry actor, role, timestamp, and mandatory comment on reject/return |
| Self-service configurability | A new process goes live in under 15 minutes with no developer involvement |
| Adoption | ≥ 90% of teaching and administrative staff active in the first month |

## 4. Non-goals (v1)

- Student- or parent-facing portals — the platform is for staff.
- File attachments on requests (roadmap v1.1).
- Email/SMS/push delivery of notifications — in-app only in v1 (email in v1.1).
- Parallel or conditional approval branches; SLA timers and escalation (roadmap v1.2).
- Reporting, exports, and analytics beyond dashboard counts (roadmap v2.0).
- SSO and self-service password reset by email (roadmap v2.0).
- Payroll, accounting, timetabling, or LMS features — this is a BPM product only.

## 5. Users & personas

| Persona | Description | Primary needs |
|---|---|---|
| Teacher | Teaching staff; the most frequent initiator | Quick forms, visible status, easy resubmission when returned |
| School Admin | Operational hub of the school office | A triage queue, first-line review, maintaining process definitions |
| Principal | Academic head | Approve academic/HR matters, school-wide visibility, audit |
| Proprietor | Financial authority | Budget sign-offs, oversight, audit |
| Owner | Ultimate oversight | Everything the proprietor sees plus process design |
| Super Admin | IT/platform administrator | Manage accounts and access — provably without reach into school operations |

## 6. Key user stories

- **US-1** As a teacher, I can pick a process, fill in its form, and submit it, receiving a reference number.
- **US-2** As a teacher, I can watch my request advance step by step and read approver comments.
- **US-3** As a teacher, when my request is returned, I can edit the data and resubmit; the chain restarts from step 1.
- **US-4** As an approver, I have a queue containing exactly the requests waiting for my role.
- **US-5** As an approver, I can approve, reject (mandatory comment), or return (mandatory comment) a request.
- **US-6** As an approver, I can see the full form data, chain position, and history before deciding.
- **US-7** As a principal/proprietor/owner, I can see all requests in the school and filter by status.
- **US-8** As a user with design rights, I can create a new process (fields + steps) and activate/deactivate it.
- **US-9** As a super admin, I can create users, assign roles, reset passwords, and deactivate accounts.
- **US-10** As a super admin, I can create roles and set their permissions from a checkbox matrix.
- **US-11** As any user, I receive in-app notifications when action is needed or a decision lands.
- **US-12** As leadership, I can review a chronological audit log of administrative actions.

## 7. Functional requirements

All requirements below are **shipped in v1.0**.

### 7.1 Authentication & accounts

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Email + password sign-in issuing a JWT session token (24-hour expiry) | P0 |
| FR-2 | Passwords stored as bcrypt hashes; minimum length 8 characters | P0 |
| FR-3 | Users created with a temporary password must change it at first sign-in before using the app | P1 |
| FR-4 | Users can change their own password (current password required) | P1 |
| FR-5 | Deactivated accounts can neither sign in nor keep using existing tokens | P0 |

### 7.2 Roles & permissions (configurable RBAC)

| ID | Requirement | Priority |
|---|---|---|
| FR-6 | Roles are data — name, description, permission set — created and edited in the UI | P0 |
| FR-7 | Permission catalogue: `users.manage`, `roles.manage`, `definitions.manage`, `instances.initiate`, `instances.act`, `instances.view_all`, `audit.view` | P0 |
| FR-8 | Every API endpoint enforces permissions server-side; navigation and screens are filtered by the same permissions | P0 |
| FR-9 | The Super Admin role is system-locked: not editable, not deletable, and holds only `users.manage` + `roles.manage` — structurally excluded from every process feature | P0 |
| FR-10 | A role cannot be deleted while users hold it or a process references it | P0 |
| FR-11 | Default roles seeded: Super Admin, Owner, Proprietor, Principal, Admin, Teacher — all but Super Admin fully editable | P0 |

### 7.3 User management

| ID | Requirement | Priority |
|---|---|---|
| FR-12 | `users.manage` grants: create user (name, email, role, temporary password), edit, change role, deactivate/reactivate, reset password | P0 |
| FR-13 | Users cannot deactivate their own account | P1 |
| FR-14 | Accounts are deactivated, never deleted — history referencing a user stays intact | P0 |

### 7.4 Process designer

| ID | Requirement | Priority |
|---|---|---|
| FR-15 | A process definition = name, unique 2–5-letter key (reference prefix), category, description, optional initiator-role restriction, ordered form fields, ordered approval steps | P0 |
| FR-16 | Field types: text, long text, number, date, dropdown (with options), checkbox; per-field required flag and placeholder | P0 |
| FR-17 | Each step names at least one approver role; a process has at least one step | P0 |
| FR-18 | Processes can be deactivated (hidden from the catalogue; existing requests unaffected) and deleted only while no requests exist | P0 |
| FR-19 | Server-side validation: unique name and key, valid field configurations, referenced roles must exist, dropdowns need options | P0 |

### 7.5 Workflow engine

| ID | Requirement | Priority |
|---|---|---|
| FR-20 | Initiating requires `instances.initiate` and membership of the process's initiator roles (when restricted); submitted data is validated against the field schema server-side | P0 |
| FR-21 | Every request receives a sequential reference (`LR-0001`) from an atomic per-process counter | P0 |
| FR-22 | Each request stores a frozen snapshot of its definition (fields, steps, role names); later edits to the process never alter existing requests | P0 |
| FR-23 | States: In progress → Approved / Rejected / Returned; approval on the final step completes the request | P0 |
| FR-24 | Reject and Return require a comment; Approve comments are optional | P0 |
| FR-25 | Only users whose role is on the current step and who hold `instances.act` may act; initiators can never act on their own request | P0 |
| FR-26 | Returned requests are editable by the initiator only; resubmission restarts the chain at step 1 with history preserved | P0 |
| FR-27 | Every action appends an immutable history entry: actor, role, step, action, comment, timestamp | P0 |

### 7.6 Queues & visibility

| ID | Requirement | Priority |
|---|---|---|
| FR-28 | "My requests": everything I initiated, with live status | P0 |
| FR-29 | "Approvals": requests whose current step targets my role, excluding my own | P0 |
| FR-30 | "All requests" for `instances.view_all` holders, filterable by status | P0 |
| FR-31 | Request detail shows form data, the approval chain with progress states, and the full timeline; action buttons appear only for the legitimate current approver | P0 |
| FR-32 | Detail access is limited to the initiator, `view_all` holders, and the process's step approvers | P0 |

### 7.7 Notifications

| ID | Requirement | Priority |
|---|---|---|
| FR-33 | In-app notifications: approvers notified when a request reaches their step; initiators notified of every decision | P0 |
| FR-34 | Notification bell with unread badge, list, mark-all-read, and click-through to the request | P1 |

### 7.8 Dashboard

| ID | Requirement | Priority |
|---|---|---|
| FR-35 | Personal counters (awaiting my action, my open requests); school-wide totals by status for `view_all` holders; recent activity | P1 |

### 7.9 Audit log

| ID | Requirement | Priority |
|---|---|---|
| FR-36 | Administrative and workflow actions (sign-ins, user/role/process changes, decisions) recorded and viewable latest-first by `audit.view` holders | P1 |

## 8. Non-functional requirements

- **Security** — bcrypt (cost 10) password hashing; HS256-signed JWTs with 24-hour expiry;
  permissions enforced by middleware on every route; the client is never trusted for
  authorisation; role changes take effect on the next request.
- **Data integrity** — definition snapshots on every request; atomic reference counters;
  deletion blocked for referenced roles/processes; deactivation instead of user deletion.
- **Usability** — any process startable in ≤ 3 clicks from the dashboard; dynamic forms with
  inline validation; responsive layout usable from ~360 px wide.
- **Performance** — p95 API response < 300 ms at expected school scale (≈ 200 staff,
  thousands of requests per term); approval queues served by indexed queries.
- **Compatibility** — evergreen desktop and mobile browsers (Chrome, Edge, Firefox, Safari).
- **Operations** — stateless API (horizontally scalable); MongoDB standalone or Atlas;
  idempotent seed script with a `--fresh` reset for staging environments.

## 9. System architecture

| Component | Technology | Responsibilities |
|---|---|---|
| Frontend SPA | Angular 20 + Angular Material | Permission-aware routing and menus, JWT interceptor, dynamic form renderer, admin consoles |
| REST API | Node.js + Express | Authentication, RBAC middleware, workflow engine, validation, notifications, audit |
| Database | MongoDB (Mongoose) | Documents for users, roles, definitions, requests, notifications, audit, counters |

**Collections:** `users`, `roles`, `processdefinitions`, `processinstances` (definition
snapshot, form data, current step, current approver roles, history), `notifications`,
`auditlogs`, `counters`.

**API surface:** `/api/auth`, `/api/users`, `/api/roles` (+ permission catalogue),
`/api/definitions`, `/api/instances` (+ `/mine`, `/tasks`, `/:id/action`, `/:id/resubmit`),
`/api/notifications`, `/api/dashboard/stats`, `/api/audit`.

## 10. Default configuration (seed)

### Roles → permissions

| Permission | Super Admin | Owner | Proprietor | Principal | Admin | Teacher |
|---|---|---|---|---|---|---|
| users.manage | ✓ | | | | | |
| roles.manage | ✓ | | | | | |
| definitions.manage | | ✓ | | ✓ | ✓ | |
| instances.initiate | | ✓ | ✓ | ✓ | ✓ | ✓ |
| instances.act | | ✓ | ✓ | ✓ | ✓ | ✓ |
| instances.view_all | | ✓ | ✓ | ✓ | ✓ | |
| audit.view | | ✓ | ✓ | ✓ | | |

### Seeded process templates

| Key | Template | Category | Approval chain |
|---|---|---|---|
| LR | Leave Request | Staff & HR | Admin review → Principal approval |
| PR | Purchase Requisition | Finance | Admin review → Principal approval → Budget approval (Proprietor/Owner) |
| FT | Field Trip Approval | Events | Principal approval → Proprietor sign-off (Proprietor/Owner) |
| MR | Maintenance Request | Operations | Admin action |
| EQ | Exam Question-Paper Moderation | Academic | Principal moderation |

The platform additionally supports — via the designer, without code — processes such as:
expense reimbursement, petty cash, budget approvals, fee waivers/scholarships, lesson-plan
approval, result approval, grade changes, timetable changes, admissions, transfers,
disciplinary workflows, venue booking, equipment checkout, IT support, incident reports,
event and guest-speaker approvals, and parent-circular sign-off.

## 11. Release plan & roadmap

| Version | Scope | Status |
|---|---|---|
| v1.0 | Everything in §7 — RBAC, designer, engine, queues, notifications, dashboard, audit, seed data | Shipped 11 Aug 2026 |
| v1.1 | File attachments on requests; email notification delivery; CSV export of All requests | Planned |
| v1.2 | Parallel approvers and conditional branches; SLA timers, reminders, escalation; approval delegation | Planned |
| v2.0 | Reporting & analytics; SSO (Google Workspace / Microsoft); parent/student-facing request types; multi-school tenancy | Planned |

## 12. Risks & mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Staff continue using paper side-channels | Medium | High | Leadership mandate; the five most-used processes seeded; ≤ 3-click submission |
| Mis-configured roles grant excessive access | Medium | High | Permission matrix UI, locked Super Admin role, audit log review |
| Single-approver bottleneck when someone is away | High | Medium | Multiple roles per step supported today; delegation and escalation in v1.2 |
| Notifications missed (in-app only) | Medium | Medium | Email delivery scheduled for v1.1 |
| Data loss on self-hosted MongoDB | Low | High | Documented backup guidance; managed Atlas as the recommended option |

## 13. Open questions

1. Hosting model: per-school self-hosted instance vs. managed cloud (and, later, multi-tenant)?
2. Retention policy for completed requests and audit entries — how long, and who may purge?
3. Should approvers ever be allowed to amend request data, or only initiators (current behaviour)?
4. Per-school branding/white-labelling — needed for v1.x?

## Appendix A — Demo environment

Local URL `http://localhost:4200` (API `http://localhost:4000`). All passwords `Passw0rd!`:
`superadmin@school.test`, `owner@school.test`, `proprietor@school.test`,
`principal@school.test`, `admin@school.test`, `teacher@school.test`.

## Appendix B — Glossary

- **Process definition** — the reusable template: form fields + approval steps.
- **Request (instance)** — one submitted run of a process, e.g. `FT-0001`.
- **Step** — a stage in the chain, owned by one or more roles.
- **Return** — send a request back to its initiator for changes (non-terminal).
- **Snapshot** — the frozen copy of a definition stored inside each request.
- **Permission** — an atomic capability string checked by the API and UI.
- **Role** — a named, editable set of permissions assigned to users.
