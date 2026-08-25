import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import * as Papa from 'papaparse';
import { ApiService } from '../../core/api.service';
import { ImportResult, SchoolClass } from '../../core/models';
import { errorMessage } from '../../core/auth.interceptor';

/** Columns the template offers, matching IMPORT_COLUMNS on the server. */
const COLUMNS = [
  'admissionNumber', 'firstName', 'lastName', 'otherNames',
  'dateOfBirth', 'gender', 'class',
  'guardianName', 'guardianRelationship', 'guardianEmail', 'guardianPhone',
];
const REQUIRED = ['admissionNumber', 'firstName', 'lastName'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface ParsedRow {
  row: number;
  data: Record<string, string>;
  problems: string[];
}

interface ImportData {
  classes: SchoolClass[];
}

/**
 * Bulk student import.
 *
 * The file is parsed in the browser and posted as JSON — the server has no
 * upload handling, and adding it would mean owning content sniffing, size
 * caps and disposition headers for a file nobody needs to keep. Parsing here
 * also buys the thing that actually matters for bulk data: the admin sees
 * exactly which rows will fail before committing any of them.
 *
 * The checks below are a courtesy, not the authority — the server validates
 * every row again regardless.
 */
@Component({
  selector: 'app-student-import',
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatCheckboxModule, MatTableModule, MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Import students from CSV</h2>
    <mat-dialog-content class="content">
      @if (!rows().length && !result()) {
        <p class="muted intro">
          Upload a CSV with one student per row. Required columns:
          <b>admissionNumber</b>, <b>firstName</b>, <b>lastName</b>.
          A <b>class</b> column must match the name of a class that already exists.
        </p>
        <button mat-stroked-button (click)="downloadTemplate()">
          <mat-icon>download</mat-icon> Download template
        </button>

        <div class="drop" (click)="picker.click()">
          <mat-icon>upload_file</mat-icon>
          <div>Choose a CSV file</div>
          <input #picker type="file" accept=".csv,text/csv" hidden (change)="onFile($event)" />
        </div>
        @if (parseError()) { <div class="error">{{ parseError() }}</div> }
      }

      @if (rows().length && !result()) {
        <div class="summary">
          <span class="pill ok">{{ validCount() }} ready</span>
          @if (invalidCount()) { <span class="pill bad">{{ invalidCount() }} with problems</span> }
          <span class="spacer"></span>
          <button mat-button (click)="reset()">Choose a different file</button>
        </div>

        <div class="preview">
          <table mat-table [dataSource]="rows()">
            <ng-container matColumnDef="row">
              <th mat-header-cell *matHeaderCellDef>Row</th>
              <td mat-cell *matCellDef="let r">{{ r.row }}</td>
            </ng-container>
            <ng-container matColumnDef="admissionNumber">
              <th mat-header-cell *matHeaderCellDef>Admission no.</th>
              <td mat-cell *matCellDef="let r">{{ r.data.admissionNumber || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef>Name</th>
              <td mat-cell *matCellDef="let r">{{ r.data.firstName }} {{ r.data.lastName }}</td>
            </ng-container>
            <ng-container matColumnDef="class">
              <th mat-header-cell *matHeaderCellDef>Class</th>
              <td mat-cell *matCellDef="let r">{{ r.data.class || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="guardian">
              <th mat-header-cell *matHeaderCellDef>Guardian</th>
              <td mat-cell *matCellDef="let r">{{ r.data.guardianEmail || r.data.guardianName || '—' }}</td>
            </ng-container>
            <ng-container matColumnDef="problems">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let r" class="problems">
                @if (r.problems.length) {
                  <span class="bad">{{ r.problems.join('; ') }}</span>
                } @else {
                  <span class="ok">Ready</span>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns" [class.row-bad]="row.problems.length"></tr>
          </table>
        </div>

        <mat-checkbox [(ngModel)]="updateExisting" class="update">
          Update students whose admission number already exists
          <span class="muted">(otherwise they are skipped)</span>
        </mat-checkbox>
      }

      @if (busy()) { <mat-progress-bar mode="indeterminate" /> }

      @if (result(); as res) {
        <div class="done">
          <div class="tallies">
            <div><b class="ok">{{ res.created }}</b> created</div>
            <div><b>{{ res.updated }}</b> updated</div>
            <div><b class="bad">{{ res.skipped }}</b> skipped</div>
          </div>
          @if (res.errors.length) {
            <div class="section">Rows not imported</div>
            <div class="errors">
              @for (e of res.errors; track e.row) {
                <div><b>Row {{ e.row }}</b> — {{ e.message }}</div>
              }
            </div>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (result()) {
        <button mat-flat-button color="primary" (click)="ref.close(true)">Done</button>
      } @else {
        <button mat-button (click)="ref.close(false)">Cancel</button>
        <button mat-flat-button color="primary" [disabled]="!validCount() || busy()" (click)="submit()">
          Import {{ validCount() }} student{{ validCount() === 1 ? '' : 's' }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    .content { display: flex; flex-direction: column; min-width: 640px; max-width: 820px; padding-top: 8px; }
    .intro { font-size: 13px; line-height: 1.5; margin: 0 0 12px; }
    .drop {
      margin-top: 16px; border: 2px dashed #cfd8dc; border-radius: 10px; padding: 28px;
      text-align: center; color: #78909c; cursor: pointer;
    }
    .drop:hover { border-color: #1565c0; color: #1565c0; }
    .drop mat-icon { font-size: 34px; width: 34px; height: 34px; }
    .summary { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .spacer { flex: 1 1 auto; }
    .pill { border-radius: 12px; padding: 3px 12px; font-size: 12px; font-weight: 500; }
    .pill.ok { background: #e8f5e9; color: #2e7d32; }
    .pill.bad { background: #ffebee; color: #c62828; }
    .preview { max-height: 320px; overflow: auto; border: 1px solid #e3e7ea; border-radius: 8px; }
    .problems { font-size: 12px; max-width: 240px; }
    .ok { color: #2e7d32; }
    .bad { color: #c62828; }
    .row-bad { background: #fff5f5; }
    .update { margin-top: 14px; font-size: 13px; }
    .error { color: #c62828; background: #ffebee; border-radius: 6px; padding: 10px 12px; margin-top: 12px; font-size: 13px; }
    .done { padding: 8px 0; }
    .tallies { display: flex; gap: 28px; font-size: 15px; }
    .section { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px; color: #90a4ae; margin: 20px 0 8px; }
    .errors { max-height: 220px; overflow: auto; font-size: 13px; line-height: 1.7; }
  `,
})
export class StudentImportComponent {
  private api = inject(ApiService);
  private data = inject<ImportData>(MAT_DIALOG_DATA);

  columns = ['row', 'admissionNumber', 'name', 'class', 'guardian', 'problems'];
  rows = signal<ParsedRow[]>([]);
  result = signal<ImportResult | null>(null);
  parseError = signal('');
  busy = signal(false);
  updateExisting = false;

  validCount = computed(() => this.rows().filter((r) => !r.problems.length).length);
  invalidCount = computed(() => this.rows().filter((r) => r.problems.length).length);

  constructor(public ref: MatDialogRef<StudentImportComponent, boolean>) {}

  downloadTemplate() {
    const sample = [
      COLUMNS.join(','),
      'ADM001,Chidera,Okonkwo,Ada,2012-04-09,female,JSS1 A,Mrs Okonkwo,Mother,parent@example.com,+2348012345678',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([sample], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'students-template.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  onFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.parseError.set('');
    this.result.set(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      // Spreadsheets export headers with stray spaces and a BOM often enough
      // that trusting them verbatim would reject perfectly good files.
      transformHeader: (h) => h.trim().replace(/^﻿/, ''),
      complete: (out) => {
        const headers = out.meta.fields || [];
        const missing = REQUIRED.filter((c) => !headers.includes(c));
        if (missing.length) {
          this.parseError.set(`The file is missing required column(s): ${missing.join(', ')}`);
          this.rows.set([]);
          return;
        }
        if (!out.data.length) {
          this.parseError.set('That file has no data rows.');
          this.rows.set([]);
          return;
        }
        if (out.data.length > 2000) {
          this.parseError.set('Import is limited to 2000 rows at a time.');
          this.rows.set([]);
          return;
        }
        // Only the columns this file actually has. Padding the absent ones
        // with empty strings would tell the server to clear those fields on
        // every student the import updates.
        const present = COLUMNS.filter((c) => headers.includes(c));
        const seen = new Set<string>();
        // Matched the way the server matches: trimmed and case-insensitive.
        // An unknown class is the commonest mistake in a hand-edited sheet,
        // and catching it only on submit would fail every row at once after
        // the preview had called them all ready.
        const known = new Set(this.data.classes.map((c) => c.name.trim().toLowerCase()));
        this.rows.set(
          out.data.map((raw, i) => {
            const data: Record<string, string> = {};
            for (const c of present) data[c] = String(raw[c] ?? '').trim();
            const problems: string[] = [];
            for (const c of REQUIRED) if (!data[c]) problems.push(`${c} is missing`);
            if (data['guardianEmail'] && !EMAIL_RE.test(data['guardianEmail'])) {
              problems.push('guardian email looks invalid');
            }
            if (data['class'] && !known.has(data['class'].toLowerCase())) {
              problems.push(`no class named "${data['class']}"`);
            }
            // Duplicates inside the file itself, which the server would only
            // catch one at a time as each insert collided.
            if (data['admissionNumber']) {
              const key = data['admissionNumber'].toLowerCase();
              if (seen.has(key)) problems.push('duplicate admission number in this file');
              seen.add(key);
            }
            return { row: i + 2, data, problems };
          })
        );
      },
      error: (err: Error) => this.parseError.set(`Could not read that file: ${err.message}`),
    });
  }

  reset() {
    this.rows.set([]);
    this.parseError.set('');
    this.result.set(null);
  }

  submit() {
    const payload = this.rows().filter((r) => !r.problems.length).map((r) => r.data);
    if (!payload.length) return;
    this.busy.set(true);
    this.api.importStudents(payload, this.updateExisting).subscribe({
      next: (res) => {
        this.result.set(res);
        this.busy.set(false);
      },
      error: (err) => {
        this.parseError.set(errorMessage(err));
        this.busy.set(false);
      },
    });
  }
}
