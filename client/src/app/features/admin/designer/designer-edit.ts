import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators,
} from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/api.service';
import { FieldType, Role, RoleRef } from '../../../core/models';
import { errorMessage } from '../../../core/auth.interceptor';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
];

@Component({
  selector: 'app-designer-edit',
  imports: [
    ReactiveFormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatCheckboxModule, MatButtonModule, MatIconModule, MatTooltipModule, MatSlideToggleModule,
  ],
  template: `
    <div class="page narrow">
      <div class="page-header">
        <button mat-icon-button (click)="router.navigate(['/admin/processes'])" aria-label="Back">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <h1>{{ id() ? 'Edit process' : 'New process' }}</h1>
        <span class="spacer"></span>
        <mat-slide-toggle [checked]="form.value.active" (change)="form.patchValue({ active: $event.checked })">
          Active
        </mat-slide-toggle>
      </div>

      <form [formGroup]="form" (ngSubmit)="save()">
        <mat-card class="card">
          <h2>Basics</h2>
          <div class="row2">
            <mat-form-field appearance="outline">
              <mat-label>Process name</mat-label>
              <input matInput formControlName="name" placeholder="e.g. Salary Advance Request" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="key-field">
              <mat-label>Key</mat-label>
              <input matInput formControlName="key" placeholder="SA" maxlength="5" style="text-transform: uppercase" />
              <mat-hint>2–5 letters, used in reference numbers</mat-hint>
            </mat-form-field>
          </div>
          <div class="row2">
            <mat-form-field appearance="outline">
              <mat-label>Category</mat-label>
              <input matInput formControlName="category" placeholder="e.g. Finance" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Who can start it?</mat-label>
              <mat-select formControlName="initiatorRoles" multiple>
                @for (r of roles(); track r.id) {
                  <mat-option [value]="r.id">{{ r.name }}</mat-option>
                }
              </mat-select>
              <mat-hint>Leave empty to allow every role that can start requests</mat-hint>
            </mat-form-field>
          </div>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Description</mat-label>
            <textarea matInput rows="2" formControlName="description"></textarea>
          </mat-form-field>
        </mat-card>

        <mat-card class="card">
          <div class="section-head">
            <h2>Form fields</h2>
            <button mat-stroked-button type="button" (click)="addField()">
              <mat-icon>add</mat-icon> Add field
            </button>
          </div>
          @if (fields.length === 0) {
            <p class="muted">No fields yet — add the questions the requester must answer.</p>
          }
          <div formArrayName="fields">
            @for (f of fields.controls; track f; let i = $index) {
              <div class="item" [formGroupName]="i">
                <div class="item-grid">
                  <mat-form-field appearance="outline">
                    <mat-label>Label</mat-label>
                    <input matInput formControlName="label" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="type-field">
                    <mat-label>Type</mat-label>
                    <mat-select formControlName="type">
                      @for (t of fieldTypes; track t.value) {
                        <mat-option [value]="t.value">{{ t.label }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  @if (f.value.type === 'select') {
                    <mat-form-field appearance="outline">
                      <mat-label>Options (comma-separated)</mat-label>
                      <input matInput formControlName="optionsText" placeholder="Low, Medium, High" />
                    </mat-form-field>
                  } @else {
                    <mat-form-field appearance="outline">
                      <mat-label>Placeholder (optional)</mat-label>
                      <input matInput formControlName="placeholder" />
                    </mat-form-field>
                  }
                </div>
                <div class="item-side">
                  <mat-checkbox formControlName="required">Required</mat-checkbox>
                  <span class="spacer"></span>
                  <button mat-icon-button type="button" [disabled]="i === 0" (click)="move(fields, i, -1)" matTooltip="Move up"><mat-icon>arrow_upward</mat-icon></button>
                  <button mat-icon-button type="button" [disabled]="i === fields.length - 1" (click)="move(fields, i, 1)" matTooltip="Move down"><mat-icon>arrow_downward</mat-icon></button>
                  <button mat-icon-button type="button" (click)="fields.removeAt(i)" matTooltip="Remove"><mat-icon>delete</mat-icon></button>
                </div>
              </div>
            }
          </div>
        </mat-card>

        <mat-card class="card">
          <div class="section-head">
            <h2>Approval steps</h2>
            <button mat-stroked-button type="button" (click)="addStep()">
              <mat-icon>add</mat-icon> Add step
            </button>
          </div>
          <p class="muted">Requests move through these steps in order. Each step names the role(s) that can approve, reject, or return the request.</p>
          <div formArrayName="steps">
            @for (s of steps.controls; track s; let i = $index) {
              <div class="item" [formGroupName]="i">
                <div class="step-n">{{ i + 1 }}</div>
                <div class="item-grid step-grid">
                  <mat-form-field appearance="outline">
                    <mat-label>Step name</mat-label>
                    <input matInput formControlName="name" placeholder="e.g. Principal approval" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Approver role(s)</mat-label>
                    <mat-select formControlName="approverRoles" multiple>
                      @for (r of roles(); track r.id) {
                        <mat-option [value]="r.id">{{ r.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Instructions (optional)</mat-label>
                    <input matInput formControlName="instructions" />
                  </mat-form-field>
                </div>
                <div class="item-side">
                  <span class="spacer"></span>
                  <button mat-icon-button type="button" [disabled]="i === 0" (click)="move(steps, i, -1)" matTooltip="Move up"><mat-icon>arrow_upward</mat-icon></button>
                  <button mat-icon-button type="button" [disabled]="i === steps.length - 1" (click)="move(steps, i, 1)" matTooltip="Move down"><mat-icon>arrow_downward</mat-icon></button>
                  <button mat-icon-button type="button" [disabled]="steps.length === 1" (click)="steps.removeAt(i)" matTooltip="Remove"><mat-icon>delete</mat-icon></button>
                </div>
              </div>
            }
          </div>
        </mat-card>

        @if (error()) {
          <div class="error">{{ error() }}</div>
        }

        <div class="actions">
          <button mat-button type="button" (click)="router.navigate(['/admin/processes'])">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="busy()">
            {{ id() ? 'Save changes' : 'Create process' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: `
    .narrow { max-width: 900px; }
    .card { padding: 22px; margin-bottom: 16px; }
    h2 { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: #90a4ae; margin: 0 0 14px; }
    .section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .section-head h2 { margin: 0; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .key-field { max-width: 100%; }
    .full { width: 100%; }
    .item { border: 1px solid #e3e7ea; border-radius: 8px; padding: 14px 14px 4px; margin-bottom: 10px; position: relative; }
    .item-grid { display: grid; grid-template-columns: 1.2fr .8fr 1fr; gap: 10px; }
    .step-grid { grid-template-columns: 1fr 1fr 1fr; }
    .type-field { min-width: 130px; }
    .item-side { display: flex; align-items: center; gap: 2px; margin-top: -8px; padding-bottom: 6px; }
    .step-n { position: absolute; top: -10px; left: 12px; background: #1565c0; color: #fff; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 600; }
    .error { color: #c62828; background: #ffebee; border-radius: 6px; padding: 10px 12px; margin-bottom: 14px; font-size: 13px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 32px; }
    @media (max-width: 720px) { .row2, .item-grid { grid-template-columns: 1fr; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignerEditComponent {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private snack = inject(MatSnackBar);
  readonly router = inject(Router);

  roles = signal<Role[]>([]);
  id = signal<string | null>(null);
  busy = signal(false);
  error = signal('');
  fieldTypes = FIELD_TYPES;

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    key: ['', [Validators.required, Validators.pattern(/^[A-Za-z]{2,5}$/)]],
    category: ['General'],
    description: [''],
    initiatorRoles: [[] as string[]],
    active: [true],
    fields: this.fb.array([]),
    steps: this.fb.array([]),
  });

  get fields(): FormArray {
    return this.form.get('fields') as FormArray;
  }
  get steps(): FormArray {
    return this.form.get('steps') as FormArray;
  }

  constructor() {
    this.api.roles().subscribe((res) => this.roles.set(res.roles));
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      this.api.definitions(true).subscribe((res) => {
        const def = res.definitions.find((d) => d._id === id);
        if (!def) return;
        const roleId = (r: RoleRef | string) => (typeof r === 'string' ? r : r._id);
        this.form.patchValue({
          name: def.name,
          key: def.key,
          category: def.category,
          description: def.description,
          initiatorRoles: def.initiatorRoles.map(roleId),
          active: def.active,
        });
        for (const f of def.fields) {
          this.addField({
            label: f.label, type: f.type, required: f.required,
            optionsText: f.options.join(', '), placeholder: f.placeholder ?? '',
          });
        }
        for (const s of def.steps) {
          this.addStep({ name: s.name, approverRoles: s.approverRoles.map(roleId), instructions: s.instructions ?? '' });
        }
      });
    } else {
      this.addStep();
    }
  }

  addField(value?: { label: string; type: FieldType; required: boolean; optionsText: string; placeholder: string }) {
    this.fields.push(
      this.fb.group({
        label: [value?.label ?? '', Validators.required],
        type: [value?.type ?? 'text'],
        required: [value?.required ?? false],
        optionsText: [value?.optionsText ?? ''],
        placeholder: [value?.placeholder ?? ''],
      })
    );
  }

  addStep(value?: { name: string; approverRoles: string[]; instructions: string }) {
    this.steps.push(
      this.fb.group({
        name: [value?.name ?? '', Validators.required],
        approverRoles: [value?.approverRoles ?? ([] as string[])],
        instructions: [value?.instructions ?? ''],
      })
    );
  }

  move(arr: FormArray, index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= arr.length) return;
    const ctrl = arr.at(index);
    arr.removeAt(index);
    arr.insert(target, ctrl);
  }

  save() {
    if (this.form.invalid) {
      this.error.set('Please fill in the required fields (name, key, field labels, step names).');
      return;
    }
    const v = this.form.getRawValue();
    const body = {
      name: v.name,
      key: v.key,
      category: v.category || 'General',
      description: v.description,
      initiatorRoles: v.initiatorRoles,
      active: v.active,
      fields: v.fields.map((f: { label: string; type: FieldType; required: boolean; optionsText: string; placeholder: string }) => ({
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.type === 'select' ? f.optionsText.split(',').map((o: string) => o.trim()).filter(Boolean) : [],
        placeholder: f.placeholder,
      })),
      steps: v.steps.map((s: { name: string; approverRoles: string[]; instructions: string }) => ({
        name: s.name,
        approverRoles: s.approverRoles,
        instructions: s.instructions,
      })),
    };
    this.busy.set(true);
    this.error.set('');
    const req = this.id() ? this.api.updateDefinition(this.id()!, body) : this.api.createDefinition(body);
    req.subscribe({
      next: () => {
        this.snack.open(this.id() ? 'Process updated' : 'Process created', 'OK', { duration: 3000 });
        this.router.navigate(['/admin/processes']);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
