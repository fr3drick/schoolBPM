# School BPM

A business process management platform for a high school. Teachers and administrators start
requests (leave, purchases, field trips, …) that route through configurable approval chains.
Roles, permissions, and the processes themselves are all managed from the admin UI — adding a
new process never requires code.

**Stack:** Node.js + Express + Mongoose (`server/`) · Angular 20 + Angular Material (`client/`) · MongoDB

## Features

- **Process designer** — build a process from form fields (text, long text, number, date,
  dropdown, checkbox) and ordered approval steps, each assigned to one or more roles.
- **Workflow engine** — submit → step-by-step approval → approved / rejected / returned.
  Returned requests can be edited and resubmitted (the chain restarts). Rejections and returns
  require a comment. Nobody can act on their own request.
- **Configurable RBAC** — roles are data, not code. Each role holds a set of permissions;
  the API enforces them and the UI menu/screens adapt. New roles can be created any time.
- **Super Admin** — manages users and roles only; has no access to any process (cannot view,
  start, approve, or design). This role is locked and cannot be edited or deleted.
- **Timeline & audit** — every instance keeps a full history (who, role, step, comment, when);
  admin actions land in a global audit log.
- **Notifications** — in-app bell: approvers are notified of new tasks, initiators of decisions.
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

Seeded roles: **Super Admin** (users + roles only), **Owner**, **Proprietor**, **Principal**,
**Admin**, **Teacher** — all editable except Super Admin.

## Getting started

Prerequisites: Node.js ≥ 22.12, and MongoDB (Docker is the easiest).

```bash
# 1. MongoDB (Docker)
docker run -d --name schoolbpm-mongo -p 27017:27017 -v schoolbpm-data:/data/db mongo:7

# 2. API
cd server
npm install
cp .env.example .env        # set a strong JWT_SECRET
npm run seed                # roles, demo users, 5 process templates
npm run dev                 # http://localhost:4000

# 3. Frontend (new terminal)
cd client
npm install
npm start                   # http://localhost:4200 (proxies /api to :4000)
```

`npm run seed:fresh` (in `server/`) drops the database and reseeds from scratch.

## Demo accounts

All passwords: `Passw0rd!`

| Email | Role |
|---|---|
| `superadmin@school.test` | Super Admin |
| `owner@school.test` | Owner |
| `proprietor@school.test` | Proprietor |
| `principal@school.test` | Principal |
| `admin@school.test` | Admin |
| `teacher@school.test` | Teacher |

Seeded process templates: Leave Request (`LR`), Purchase Requisition (`PR`), Field Trip
Approval (`FT`), Maintenance Request (`MR`), Exam Question-Paper Moderation (`EQ`).

## API overview

All endpoints are under `/api`, JWT via `Authorization: Bearer <token>`.

- `POST /auth/login` · `GET /auth/me` · `POST /auth/change-password`
- `GET|POST /users` · `PUT /users/:id` · `POST /users/:id/reset-password`
- `GET|POST /roles` · `GET /roles/permissions` · `PUT|DELETE /roles/:id`
- `GET|POST /definitions` (`?all=1` for designers) · `GET|PUT|DELETE /definitions/:id`
- `POST /instances` · `GET /instances/mine` · `GET /instances/tasks` (my approval queue) ·
  `GET /instances` (view_all) · `GET /instances/:id` ·
  `POST /instances/:id/action` (`approve|reject|return` + comment) · `POST /instances/:id/resubmit`
- `GET /notifications` · `POST /notifications/read-all` · `POST /notifications/:id/read`
- `GET /dashboard/stats` · `GET /audit`

## Project layout

```
server/src/
  models/        User, Role, ProcessDefinition, ProcessInstance, Notification, AuditLog, Counter
  middleware/    JWT auth + permission checks
  services/      workflow engine helpers, notifications, audit
  routes/        auth, users, roles, definitions, instances, notifications, dashboard, audit
  seed.js        roles, demo users, process templates
client/src/app/
  core/          auth service, API client, interceptor, guards, models
  layout/        app shell (sidenav, toolbar, notifications)
  features/      login, dashboard, catalog, request form (dynamic), my requests,
                 instance detail, approvals, all requests, admin (users, roles,
                 process designer), audit
```

## Not yet included (by design, architecture allows later)

File attachments, email delivery, parallel/conditional steps, SLA reminders,
reports/exports, SSO, password-reset emails.
