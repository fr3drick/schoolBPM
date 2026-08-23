# School BPM

A multi-tenant business process management platform for high schools. Each onboarded school
gets its own users, roles, and processes: teachers and administrators start requests (leave,
purchases, field trips, …) that route through configurable approval chains. Roles,
permissions, and the processes themselves are all managed from the school's admin UI — adding
a new process never requires code.

**Stack:** Node.js + Express + Mongoose (`server/`) · Angular 20 + Angular Material (`client/`) · MongoDB

## Features

- **Multi-school tenancy** — a Platform Admin onboards schools from a console (school +
  its first Super Admin + default roles + optional starter templates) and can suspend or
  reactivate a school. Every school-scoped record carries a `school` reference and every
  query is tenant-filtered; role names, process names/keys, and reference counters are
  unique *per school* (two schools can both have `LR-0001`). Platform staff hold no school
  role, so they can never see any school's data.
- **Process designer** — build a process from form fields (text, long text, number, date,
  dropdown, checkbox) and ordered approval steps, each assigned to one or more roles.
- **Workflow engine** — submit → step-by-step approval → approved / rejected / returned.
  Returned requests can be edited and resubmitted (the chain restarts). Rejections and returns
  require a comment. Nobody can act on their own request.
- **Configurable RBAC** — roles are data, not code. Each role holds a set of permissions;
  the API enforces them and the UI menu/screens adapt. New roles can be created any time.
- **Super Admin (per school)** — manages the school's users and roles only; has no access to
  any process (cannot view, start, approve, or design). This role is locked and cannot be
  edited or deleted.
- **Timeline & audit** — every instance keeps a full history (who, role, step, comment, when);
  admin actions land in a global audit log.
- **Notifications** — in-app bell plus email: approvers are notified of new tasks, initiators of
  decisions. Email goes through a durable outbox with retries, so a mail outage never blocks or
  loses a workflow action (see [Email](#email)).
- **Reference numbers** — each process has a key (e.g. `LR`) producing refs like `LR-0001`.
- **Definition snapshots** — instances freeze a copy of the form + steps at submission,
  so editing a process later never corrupts old requests.

## Permissions

| Permission | Grants |
|---|---|
| `users.manage` | Create/edit/deactivate users, reset passwords |
| `roles.manage` | Create/edit/delete roles, assign permissions |
| `definitions.manage` | Process designer (create/edit/deactivate processes) |
| `instances.initiate` | Start requests |
| `instances.act` | Approve/reject/return steps assigned to your role |
| `instances.view_all` | See every request, not just your own |
| `audit.view` | Read the audit log |
| `email.view` | View email delivery health and requeue failed messages |

`email.view` is granted by default to **Super Admin**, **Owner** and **Proprietor**; like every
permission it can be reassigned to any role from the Roles screen (except on the locked Super
Admin role).

Roles seeded per school: **Super Admin** (users + roles only), **Owner**, **Proprietor**,
**Principal**, **Admin**, **Teacher** — all editable except Super Admin. The Platform Admin
sits outside this model entirely: no school, no role, only the school-onboarding console.

## Getting started

Prerequisites: Node.js ≥ 22.12, and MongoDB (Docker is the easiest).

```bash
# 1. MongoDB (Docker)
docker run -d --name schoolbpm-mongo -p 27017:27017 -v schoolbpm-data:/data/db mongo:7

# 2. API
cd server
npm install
cp .env.example .env        # set a strong JWT_SECRET
npm run seed                # platform admin + 2 demo schools with roles, users, templates
npm run dev                 # http://localhost:4000

# 3. Frontend (new terminal)
cd client
npm install
npm start                   # http://localhost:4200 (proxies /api to :4000)
```

`npm run seed:fresh` (in `server/`) drops the database and reseeds from scratch.

## Demo accounts

All passwords: `Passw0rd!`

| Email | Role | Tenant |
|---|---|---|
| `platform@school.test` | **Platform Admin** | — (onboards schools) |
| `superadmin@school.test` | Super Admin | Sunrise High School |
| `owner@school.test` | Owner | Sunrise High School |
| `proprietor@school.test` | Proprietor | Sunrise High School |
| `principal@school.test` | Principal | Sunrise High School |
| `admin@school.test` | Admin | Sunrise High School |
| `teacher@school.test` | Teacher | Sunrise High School |
| `superadmin@hillcrest.test` | Super Admin | Hillcrest College |
| `principal@hillcrest.test` | Principal | Hillcrest College |
| `teacher@hillcrest.test` | Teacher | Hillcrest College |

Process templates seeded for each school: Leave Request (`LR`), Purchase Requisition (`PR`),
Field Trip Approval (`FT`), Maintenance Request (`MR`), Exam Question-Paper Moderation (`EQ`).
Sign-in is by email alone (emails are globally unique), so there is no school picker.

## API overview

All endpoints are under `/api`, JWT via `Authorization: Bearer <token>`.

All school-scoped endpoints act on the signed-in user's school only.

- `POST /auth/login` · `GET /auth/me` · `POST /auth/change-password`
- `GET|POST /schools` · `PUT /schools/:id` (activate/suspend) ·
  `POST /schools/:id/reset-user-password` — platform admin only
- `GET|POST /users` · `PUT /users/:id` · `POST /users/:id/reset-password`
- `GET|POST /roles` · `GET /roles/permissions` · `PUT|DELETE /roles/:id`
- `GET|POST /definitions` (`?all=1` for designers) · `GET|PUT|DELETE /definitions/:id`
- `POST /instances` · `GET /instances/mine` · `GET /instances/tasks` (my approval queue) ·
  `GET /instances` (view_all) · `GET /instances/:id` ·
  `POST /instances/:id/action` (`approve|reject|return` + comment) · `POST /instances/:id/resubmit`
- `GET /notifications` · `POST /notifications/read-all` · `POST /notifications/:id/read`
- `GET /dashboard/stats` · `GET /audit`
- `GET /emails` (defaults to failed + skipped) · `POST /emails/:id/retry` — needs `email.view`

## Project layout

```
server/src/
  models/        School, User, Role, ProcessDefinition, ProcessInstance, Notification,
                 EmailOutbox, AuditLog, Counter
  middleware/    JWT auth + permission checks + platform/school guards
  services/      workflow engine helpers, school provisioning, notifications, audit
  services/mail/ transport (console|smtp|resend), templates, outbox worker
  routes/        auth, schools (platform), users, roles, definitions, instances,
                 notifications, dashboard, audit, emails
  scripts/       backfill-email-permission.js (grants email.view to existing schools)
  seed.js        platform admin + demo schools (roles, users, templates)
client/src/app/
  core/          auth service, API client, interceptor, guards, models
  layout/        app shell (sidenav with tenant name, toolbar, notifications)
  features/      login, dashboard, catalog, request form (dynamic), my requests,
                 instance detail, approvals, all requests, admin (users, roles,
                 process designer, email delivery), audit, platform (schools console)
```

## Email

Workflow events (submitted, awaiting approval, approved, rejected, returned, resubmitted) are
emailed alongside the in-app notification. Both are written from the same call in
`services/notify.js`, so the two channels cannot drift.

**How it works.** The workflow writes a row to the `emailoutboxes` collection in the same
operation that creates the notification; a background worker claims due rows and sends them.
This avoids the dual-writes problem — an SMTP call inside the request path can time out
ambiguously, leaving an approval recorded with no mail sent. Instead there is one local write,
then an at-least-once send with exponential backoff (1, 5, 15, 60, 180 min over 5 attempts) and
a unique `dedupeKey` per (event, recipient, occurrence) so retries cannot duplicate a message.

**Tenancy.** All mail leaves from one verified platform domain; the school's name is the
display name and its `contactEmail` is the reply-to, so no per-school domain verification is
needed. Mail for a suspended school is skipped at send time, not enqueue time.

**Privacy.** Emails carry the reference, process name and a deep link — never the submitted
form data, which stays behind authentication.

**Delivery health.** *Administration → Email delivery* lists messages that failed or were
skipped, with the recipient, subject, attempt count and provider error, and a Retry button that
requeues one. It is school-scoped and needs `email.view`. The stored HTML body is never
returned by the API — the screen is about delivery, not message contents.

### Configuration

`MAIL_PROVIDER` selects the backend:

| Value | Behaviour |
|---|---|
| `console` (default) | Logs a summary, sends nothing — the app runs unconfigured |
| `smtp` | Nodemailer; use for local Mailpit or any SMTP provider |
| `resend` | Resend HTTP API, with an idempotency key per message |

For local development, run a mail catcher and set `MAIL_PROVIDER=smtp`:

```bash
docker run -d --name schoolbpm-mail -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Everything sent is then visible at http://localhost:8025 and nothing leaves your machine.

For production, verify a domain with Resend, then set `MAIL_PROVIDER=resend`,
`RESEND_API_KEY`, `MAIL_FROM` (a mailbox on the verified domain), and `APP_BASE_URL` so the
deep links resolve. See `.env.example` for the full key list and worker tuning
(`MAIL_POLL_MS`, `MAIL_BATCH_SIZE`, `MAIL_MAX_ATTEMPTS`, `MAIL_WORKER_ENABLED`).

## Not yet included (by design, architecture allows later)

File attachments, PDF export of completed approvals, forgot-password, parallel/conditional
steps, SLA reminders, reports/exports, SSO.
