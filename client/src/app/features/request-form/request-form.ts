import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/api.service';
import { FieldDef } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';

/**
 * Renders a dynamic form from a process's field schema.
 * Two modes: start a new request (/start/:id) or edit & resubmit a
 * returned one (/requests/:id/edit) using the instance's frozen snapshot.
 */
@Component({
  selector: 'app-request-form',
  imports: [
    ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatCheckboxModule, MatDatepickerModule, MatButtonModule, MatIconModule,
  ],
  template: `
    <div class="page narrow">
      @if (title()) {
        <div class="page-header">
          <button mat-icon-button (click)="back()" aria-label="Back"><mat-icon>arrow_back</mat-icon></button>
          <h1>{{ resubmitId() ? 'Edit & resubmit' : title() }}</h1>
        </div>

        @if (description()) {
          <p class="muted intro">{{ description() }}</p>
        }

        <mat-card class="card">
          <form [formGroup]="form" (ngSubmit)="submit()">
            @for (f of fields(); track f.key) {
              @switch (f.type) {
                @case ('checkbox') {
                  <div class="checkbox-row">
                    <mat-checkbox [formControlName]="f.key!">{{ f.label }}@if (f.required) {<span class="req"> *</span>}</mat-checkbox>
                  </div>
                }
                @case ('textarea') {
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ f.label }}</mat-label>
                    <textarea matInput rows="3" [formControlName]="f.key!" [placeholder]="f.placeholder || ''"></textarea>
                  </mat-form-field>
                }
                @case ('select') {
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ f.label }}</mat-label>
                    <mat-select [formControlName]="f.key!">
                      @for (o of f.options; track o) {
                        <mat-option [value]="o">{{ o }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                }
                @case ('date') {
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ f.label }}</mat-label>
                    <input matInput [matDatepicker]="dp" [formControlName]="f.key!" />
                    <mat-datepicker-toggle matIconSuffix [for]="dp" />
                    <mat-datepicker #dp />
                  </mat-form-field>
                }
                @case ('number') {
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ f.label }}</mat-label>
                    <input matInput type="number" [formControlName]="f.key!" [placeholder]="f.placeholder || ''" />
                  </mat-form-field>
                }
                @default {
                  <mat-form-field appearance="outline" class="full">
                    <mat-label>{{ f.label }}</mat-label>
                    <input matInput [formControlName]="f.key!" [placeholder]="f.placeholder || ''" />
                  </mat-form-field>
                }
              }
            }

            @if (resubmitId()) {
              <mat-form-field appearance="outline" class="full">
                <mat-label>Note for the approvers (optional)</mat-label>
                <textarea matInput rows="2" formControlName="__comment"
                  placeholder="What did you change?"></textarea>
              </mat-form-field>
            }

            @if (error()) {
              <div class="error">{{ error() }}</div>
            }

            <div class="chain">
              <div class="chain-title">Approval chain</div>
              @for (s of steps(); track $index) {
                <div class="chain-step">
                  <span class="n">{{ $index + 1 }}</span>
                  <span>{{ s.name }} <span class="muted">— {{ s.roles }}</span></span>
                </div>
              }
            </div>

            <div class="actions">
              <button mat-button type="button" (click)="back()">Cancel</button>
              <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || busy()">
                {{ resubmitId() ? 'Resubmit' : 'Submit request' }}
              </button>
            </div>
          </form>
        </mat-card>
      }
    </div>
  `,
  styles: `
    .narrow { max-width: 720px; }
    .intro { margin: -8px 0 16px; }
    .card { padding: 24px; }
    .full { width: 100%; }
    .checkbox-row { margin: 4px 0 18px; }
    .req { color: #c62828; }
    .error { color: #c62828; background: #ffebee; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-size: 13px; }
    .chain { background: #f6f7f9; border-radius: 8px; padding: 14px 16px; margin: 4px 0 18px; }
    .chain-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px; color: #90a4ae; margin-bottom: 8px; }
    .chain-step { display: flex; align-items: center; gap: 10px; padding: 3px 0; font-size: 13px; }
    .n { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: #1565c0; color: #fff; font-size: 11px; font-weight: 600; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
  `,
})
export class RequestFormComponent {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  form: FormGroup = this.fb.group({});
  fields = signal<FieldDef[]>([]);
  steps = signal<{ name: string; roles: string }[]>([]);
  title = signal('');
  description = signal('');
  busy = signal(false);
  error = signal('');
  resubmitId = signal<string | null>(null);
  private definitionId = '';

  constructor() {
    const id = this.route.snapshot.paramMap.get('id')!;
    if (this.route.snapshot.url.some((s) => s.path === 'edit')) {
      // Resubmit mode: schema comes from the instance's frozen snapshot.
      this.resubmitId.set(id);
      this.api.instance(id).subscribe(({ instance }) => {
        const snap = instance.definitionSnapshot;
        this.title.set(`${instance.reference} · ${snap.name}`);
        this.description.set(snap.description);
        this.setup(snap.fields, snap.steps.map((s) => ({ name: s.name, roles: s.approverRoles.map((r) => r.name).join(' / ') })), instance.data);
        this.form.addControl('__comment', this.fb.control(''));
      });
    } else {
      this.definitionId = id;
      this.api.definition(id).subscribe(({ definition }) => {
        this.title.set(definition.name);
        this.description.set(definition.description);
        const steps = definition.steps.map((s) => ({
          name: s.name,
          roles: s.approverRoles.map((r) => (typeof r === 'string' ? r : r.name)).join(' / '),
        }));
        this.setup(definition.fields, steps);
      });
    }
  }

  private setup(fields: FieldDef[], steps: { name: string; roles: string }[], data?: Record<string, unknown>) {
    this.fields.set(fields);
    this.steps.set(steps);
    for (const f of fields) {
      let value: unknown = data?.[f.key!] ?? (f.type === 'checkbox' ? false : '');
      if (f.type === 'date' && value) value = new Date(value as string);
      const validators = f.required && f.type !== 'checkbox' ? [Validators.required] : [];
      if (f.type === 'checkbox' && f.required) validators.push(Validators.requiredTrue);
      this.form.addControl(f.key!, this.fb.control(value, validators));
    }
  }

  private collect(): Record<string, unknown> {
    const raw = this.form.getRawValue() as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const f of this.fields()) {
      let v = raw[f.key!];
      if (f.type === 'date' && v instanceof Date) {
        v = `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
      }
      out[f.key!] = v;
    }
    return out;
  }

  submit() {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set('');
    const data = this.collect();
    const done = (id: string, msg: string) => {
      this.snack.open(msg, 'OK', { duration: 3500 });
      this.router.navigate(['/requests', id]);
    };
    const fail = (err: unknown) => {
      this.error.set(errorMessage(err));
      this.busy.set(false);
    };
    if (this.resubmitId()) {
      const comment = String((this.form.getRawValue() as Record<string, unknown>)['__comment'] ?? '');
      this.api.resubmit(this.resubmitId()!, data, comment).subscribe({
        next: (res) => done(res.instance._id, `${res.instance.reference} resubmitted`),
        error: fail,
      });
    } else {
      this.api.createInstance(this.definitionId, data).subscribe({
        next: (res) => done(res.instance._id, `Request ${res.instance.reference} submitted`),
        error: fail,
      });
    }
  }

  back() {
    history.back();
  }
}
