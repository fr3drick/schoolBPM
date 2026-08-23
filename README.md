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
  reactivate a school. Schools can also [register themselves](#self-onboarding).
  Every school-scoped record carries a `school` reference and every
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
- **Password reset** — self-service "forgot password" with single-use, hashed, expiring tokens.
  A reset also revokes sessions already signed in (see [Passwords & sessions](#passwords--sessions)).
- **Self-onboarding** — a school owner or administrator registers their own school from the
  sign-in page, verifies their email with a code that expires in an hour, then describes the
  school. It lands in the platform console as a pending review; approval emails them that the
  school is live and they can start inviting staff (see [Self-onboarding](#self-onboarding)).
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

`email.view` is granted by default to **Owner** and **Proprietor**, and can be reassigned to any
role from the Roles screen. It is deliberately withheld from Super Admin, whose remit is user
and role management only — the delivery log would otherwise reveal request references and who
was asked to approve them.

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
- `POST /auth/forgot-password` · `GET /auth/reset-password/:token` (validity probe) ·
  `POST /auth/reset-password`
- `POST /signup` · `POST /signup/verify` · `POST /signup/resend` · `POST /signup/school` —
  public, no token
- `GET|POST /schools` · `PUT /schools/:id` (activate/suspend) ·
  `POST /schools/:id/approve` · `POST /schools/:id/reject` ·
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
  models/        School, SchoolSignup, User, Role, ProcessDefinition, ProcessInstance,
                 Notification, EmailOutbox, PasswordReset, AuditLog, Counter
  middleware/    JWT auth + permission checks + platform/school guards, rate limits
  services/      workflow engine helpers, school provisioning, notifications, audit,
                 password-reset tokens, signup OTPs, onboarding review mail
  services/mail/ transport (console|smtp|resend), templates, outbox worker
  routes/        auth, signup (public), schools (platform), users, roles, definitions,
                 instances, notifications, dashboard, audit, emails
  scripts/       sync-email-permission.js (aligns email.view on existing schools)
  seed.js        platform admin + demo schools (roles, users, templates)
client/src/app/
  core/          auth service, API client, interceptor, guards, models
  layout/        app shell (sidenav with tenant name, toolbar, notifications)
  features/      login, signup, pending approval, forgot/reset password, dashboard, catalog,
                 request form (dynamic), my requests,
                 instance detail, approvals, all requests, admin (users, roles,
                 process designer, email delivery), audit, platform (schools console)
```

## Passwords & sessions

Staff can reset their own password from the sign-in page.

**Tokens.** A reset generates 32 random bytes; only its SHA-256 hash is stored, so a leaked
database backup cannot be used to seize accounts. Tokens are single-use, expire after
`PASSWORD_RESET_TTL_MINUTES` (default 45), and requesting a new one invalidates any
outstanding link. Mongo sweeps expired rows via a TTL index.

**No enumeration.** `POST /auth/forgot-password` returns the same response whether or not the
address belongs to an account — otherwise the endpoint becomes a way to discover which staff
emails are registered. The UI mirrors this, showing the same confirmation in every case,
including on error.

**Session revocation.** Each user carries a `tokenVersion` stamped into their JWT and checked
on every request. A password reset bumps it, so sessions opened with the old password stop
working immediately rather than surviving until the token expires — which matters, since the
usual reason to reset is that someone else knows the old password. Admin-initiated resets
(school Super Admin, or the platform rescue hatch) bump it too. Changing your own password
also bumps it but returns a fresh token, so the tab you are working in is not signed out.

**Rate limits.** Sign-in counts only *failed* attempts, keyed per account, because a school's
staff share one public IP behind NAT — a per-IP cap on all sign-ins would lock out a whole
staff room at 8am. Forgot-password is capped per email (5/hour) and per IP (30/15min).
Counters are in-process, so they are per API instance; behind a proxy set `TRUST_PROXY` so
`req.ip` is the real client.

## Self-onboarding

A school does not have to wait for the platform team to create it. *Register your school* on
the sign-in page — labelled for **school owners and administrators**, because staff accounts
are created by their own school — walks through three steps:

1. **Your details.** Name, work email, and a password the applicant chooses. This becomes the
   school's Super Admin account.
2. **Verify email.** A six-digit code is emailed and must be entered to continue. It expires
   after `SIGNUP_OTP_TTL_MINUTES` (default 60), survives at most
   `SIGNUP_OTP_MAX_ATTEMPTS` (default 6) wrong guesses, and can be replaced on request.
3. **Your school.** Name, contact email, phone, address, city and country, plus optional
   state, website and staff count. The slug is derived from the name — nobody is asked for one.

Submitting creates the school with `status: 'pending'`, its six default roles, and the Super
Admin account. It then appears in *Platform console → Schools* under **Pending review**, with
the details supplied and the account that registered it.

**Nothing is live before a human says so.** A pending school's Super Admin can sign in — they
are shown where their registration has got to — but `requireAuth` refuses every school-scoped
endpoint until approval, so no users can be invited and no process started. **Approving**
activates the school, lays down the five starter process templates, and emails the Super Admin
that they can begin adding staff. **Rejecting** requires a reason, which is emailed and shown
at sign-in; the account survives so the decision can be reversed without registering again.

`status` is not `active`. `status` is the decision on whether the tenant should exist at all;
`active` is the platform suspending one it already approved. Schools created from the console
are `approved` by default, so everything that predates this feature is unaffected — including
rows written before the field existed, which Mongoose hydrates to `approved`.

Codes are stored as SHA-256 hashes, never in the clear, and the chosen password reaches the
`users` collection as the same bcrypt hash it was written with — a self-registered Super Admin
is never issued a temporary credential, so there is nothing to force a change of at first
sign-in. Abandoned registrations are swept by a TTL index after seven days; converted ones are
kept as the record of how that school arrived.

Unlike forgot-password, registration says plainly when an email already has an account. A form
that answers "check your email" for an address that will never receive a code mainly traps
people who forgot they already have an account, and the code step makes the pretence
unsustainable anyway; the rate limits are what keep the endpoint from becoming an address
oracle.

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

File attachments, parallel/conditional steps, SLA reminders, reports/exports, SSO.
