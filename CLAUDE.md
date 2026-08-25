# School BPM — working notes

Multi-tenant school management platform for high schools. Angular 20 + Express/Mongoose +
MongoDB. Schools are tenants; the platform team onboards them and decides which feature
modules each one gets.

## Running it locally

```bash
open -a Docker && docker start schoolbpm-mongo schoolbpm-mail
npm run dev --prefix server      # API on :4000
npm start --prefix client        # app on :4200, proxied to the API
```

Mailpit's web UI is on http://localhost:8025. Sign in as `admin@school.test` /
`Passw0rd!` (see `server/src/scripts/seed.js` for the rest).

## The two big ideas

**Capability in code, state in data.** Both the permission catalogue
(`server/src/permissions.js`) and the module catalogue (`server/src/modules.js`) are arrays
in source; what a given school or role *has* is a list of keys in Mongo. Adding a
capability means adding a catalogue entry and building the feature — never branching on a
school's name.

**Modules and permissions are independent gates.** A user needs the module enabled for
their school *and* the permission on their role. They fail differently on purpose: a
missing permission is "you do not have permission"; a disabled module is a 403 carrying
`{ module: key }` and a message naming it, so an administrator can tell a packaging problem
from an account problem.

Never module-gate `/api/auth`, `/api/users`, `/api/roles`, `/api/notifications`,
`/api/dashboard` or `/api/schools`. A school must always be able to administer itself.

### Module dependencies cascade transitively

`reports` requires `exams` and `attendance`, which require `students`. Switching `students`
off has to switch off all of them — a one-level cascade would leave `reports` enabled with
nothing under it, because `reports` does not require `students` *directly*.
`requirementsOf()` and `dependentsOf()` in `modules.js` compute the closures; the platform
console mirrors them so the admin sees what a toggle will take with it before saving, and
`validateModuleSelection()` enforces it server-side however the endpoint is called.

## Conventions

- **Every tenant-scoped model** carries a required, indexed `school` and compound unique
  indexes scoped by it. Cross-tenant lookups must 404, not 403 — a 403 tells the caller the
  id exists.
- **Angular**: standalone components, inline templates, signals and `computed`. A page's
  dialogs live in the same file as the page (see `features/admin/users/users.ts`).
- **Migrations** go in `server/src/scripts/` with an npm script, are idempotent, and use
  `$addToSet`/`$set` on named documents rather than re-running `provisionSchool`, which
  `$set`s whole role definitions and would discard a school's own edits.
- **Email always goes through the outbox** (`services/mail/outbox.js`). Never call the
  provider inside a request: it turns an ambiguous timeout into an action recorded with no
  mail sent. Every row needs a `dedupeKey` that includes an occurrence counter, or the
  second send of the same logical event is silently dropped as a duplicate.

## Gotchas that have cost time

- **`sparse` does nothing on a compound index** unless *every* indexed field is missing.
  `{school, code}` with `sparse: true` still indexes `code: ''`, so the second document
  without a code collides. Use `partialFilterExpression` and store the field as absent, not
  as an empty string. Mongoose treats assigning `undefined` as a no-op, so clearing such a
  field needs an explicit `set(field, undefined)`.
- **`modifiedCount` lies when the schema has `timestamps: true`.** Mongoose adds
  `updatedAt` to every `updateMany`, so a no-op `$addToSet` still reports every document as
  modified. Count the documents that are actually short of the value instead, or a
  migration will claim work it did not do on every re-run.
- **PDFKit appends a blank page** if you draw inside the bottom margin. Set
  `doc.page.margins.bottom = 0` around footer drawing and restore it after.
- **`mat-dialog-close` as a bare attribute closes with `''`, not `undefined`** — which is
  falsy but still reaches a `subscribe`. Return a typed object and guard `if (!result)`.
- **`routerLinkActive` matches by prefix.** `/requests/:id` lit up "My requests" for
  requests that were not the viewer's. Use `exact: true` where the child route is a
  different concept — and *not* where it is the same one (`/exams/:id` is part of Exams).
- **The Angular dev server serves stale bundles after a branch switch.** Stop and restart
  it. If a UI change seems not to have applied, check the served chunk before debugging the
  code — but remember lazy-loaded chunks are not among the eager `<script>` tags.
- **Angular templates do not support spread.** `ref.close([...selected])` will not compile;
  move it into a method.
- **Rate-limit per account, not per IP.** A school shares one NAT address, so a per-IP
  limit locks out the whole staff room.
- **`.env` is gitignored and excluded from both deploy rsyncs.** New environment variables
  have to be added on the servers by hand — this is why production once ran with
  `MAIL_PROVIDER` unset and logged `providerId: console`.
- **Never point local code at the production database with the mail worker on.**
  `MAIL_WORKER_ENABLED=false` is mandatory, or the local worker drains production's outbox
  into Mailpit and marks the messages sent.

## Testing

End-to-end suites are plain `.mjs` files run against a live API — they drive real HTTP with
real tokens rather than mocking. Two habits worth keeping:

- **Prove the check you think you are proving.** A cross-tenant test using an account that
  lacks the permission, or a school that lacks the module, 403s before the tenant check
  runs and proves nothing. Give the other tenant the module and a role that *can* act, then
  assert the 404.
- **Assert on keys, not counts.** `modules.length === 3` fails the day a module is added
  and tells you nothing about what broke.
