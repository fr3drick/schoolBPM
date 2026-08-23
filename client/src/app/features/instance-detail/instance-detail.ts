import { Component, Inject, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef,
} from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DownloadService, copyText } from '../../core/download.service';
import { ApiService } from '../../core/api.service';
import { ProcessInstance, Viewer } from '../../core/models';
import { StatusChipComponent } from '../../shared/status-chip';
import { errorMessage } from '../../core/auth.interceptor';

type Action = 'approve' | 'reject' | 'return';

@Component({
  selector: 'app-action-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ titles[data.action] }}</h2>
    <mat-dialog-content>
      <p class="muted">{{ data.reference }} · step “{{ data.stepName }}”</p>
      <mat-form-field appearance="outline" style="width: 100%">
        <mat-label>Comment{{ data.action === 'approve' ? ' (optional)' : '' }}</mat-label>
        <textarea matInput rows="3" [(ngModel)]="comment"
          [placeholder]="data.action === 'approve' ? 'Any remarks…' : 'Explain your decision…'"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button [color]="data.action === 'reject' ? 'warn' : 'primary'"
        [disabled]="data.action !== 'approve' && !comment.trim()"
        (click)="ref.close(comment)">
        {{ titles[data.action] }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ActionDialogComponent {
  titles: Record<Action, string> = { approve: 'Approve', reject: 'Reject', return: 'Return for changes' };
  comment = '';
  constructor(
    public ref: MatDialogRef<ActionDialogComponent, string>,
    @Inject(MAT_DIALOG_DATA) public data: { action: Action; reference: string; stepName: string }
  ) {}
}

@Component({
  selector: 'app-instance-detail',
  imports: [DatePipe, RouterLink, MatCardModule, MatIconModule, MatButtonModule, MatDialogModule, MatTooltipModule, StatusChipComponent],
  template: `
    @if (instance(); as inst) {
      <div class="page narrow">
        <div class="page-header">
          <button mat-icon-button (click)="back()" aria-label="Back"><mat-icon>arrow_back</mat-icon></button>
          <h1>{{ inst.reference }} · {{ inst.definitionSnapshot.name }}</h1>
          <app-status-chip [status]="inst.status" />
          <span class="spacer"></span>

          <button mat-icon-button (click)="copyLink()" matTooltip="Copy link to this request" aria-label="Copy link">
            <mat-icon>{{ copied() ? 'check' : 'link' }}</mat-icon>
          </button>
          @if (inst.status === 'approved') {
            <button mat-icon-button (click)="print()" [disabled]="printing()"
                    matTooltip="Print approval" aria-label="Print approval">
              <mat-icon>print</mat-icon>
            </button>
            <button mat-icon-button (click)="downloadPdf()" [disabled]="downloading()"
                    matTooltip="Download approval as PDF" aria-label="Download PDF">
              <mat-icon>download</mat-icon>
            </button>
          }

          @if (viewer()?.canResubmit) {
            <button mat-flat-button color="primary" [routerLink]="['/requests', inst._id, 'edit']">
              <mat-icon>edit</mat-icon> Edit & resubmit
            </button>
          }
          @if (viewer()?.canAct) {
            <button mat-stroked-button (click)="act('return')">Return</button>
            <button mat-stroked-button color="warn" (click)="act('reject')">Reject</button>
            <button mat-flat-button color="primary" (click)="act('approve')">Approve</button>
          }
        </div>
        <p class="muted sub">
          Requested by {{ inst.initiatorName }} on {{ inst.createdAt | date: 'MMM d, y, h:mm a' }}
        </p>

        <div class="cols">
          <mat-card class="card">
            <h2>Request details</h2>
            <dl>
              @for (f of inst.definitionSnapshot.fields; track f.key) {
                <div class="row">
                  <dt>{{ f.label }}</dt>
                  <dd>{{ display(inst.data[f.key!]) }}</dd>
                </div>
              }
            </dl>
          </mat-card>

          <div class="side">
            <mat-card class="card">
              <h2>Approval chain</h2>
              @for (s of inst.definitionSnapshot.steps; track $index; let i = $index) {
                <div class="step" [class.done]="stepDone(inst, i)" [class.current]="stepCurrent(inst, i)">
                  <mat-icon>{{ stepIcon(inst, i) }}</mat-icon>
                  <div>
                    <div class="step-name">{{ s.name }}</div>
                    <div class="step-roles">{{ roleNames(s.approverRoles) }}</div>
                  </div>
                </div>
              }
            </mat-card>

            <mat-card class="card">
              <h2>Timeline</h2>
              @for (h of timeline(inst); track $index) {
                <div class="event">
                  <mat-icon class="ev-icon {{ h.action }}">{{ eventIcon(h.action) }}</mat-icon>
                  <div class="ev-body">
                    <div>
                      <b>{{ h.byName }}</b> <span class="muted">({{ h.roleName }})</span>
                      {{ eventVerb(h.action) }}
                      @if (h.action !== 'submitted' && h.action !== 'resubmitted') {
                        <span class="muted">“{{ h.stepName }}”</span>
                      }
                    </div>
                    @if (h.comment) {
                      <div class="ev-comment">{{ h.comment }}</div>
                    }
                    <div class="ev-time">{{ h.at | date: 'MMM d, h:mm a' }}</div>
                  </div>
                </div>
              }
            </mat-card>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .narrow { max-width: 1000px; }
    .sub { margin: -10px 0 18px; }
    .cols { display: grid; grid-template-columns: 1.2fr 1fr; gap: 16px; align-items: start; }
    @media (max-width: 860px) { .cols { grid-template-columns: 1fr; } }
    .side { display: flex; flex-direction: column; gap: 16px; }
    .card { padding: 20px; }
    h2 { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: #90a4ae; margin: 0 0 14px; }
    dl { margin: 0; }
    .row { display: grid; grid-template-columns: 160px 1fr; gap: 8px; padding: 7px 0; border-bottom: 1px solid #f0f2f4; }
    .row:last-child { border-bottom: none; }
    dt { color: #78909c; font-size: 13px; }
    dd { margin: 0; font-size: 14px; white-space: pre-wrap; }
    .step { display: flex; gap: 10px; align-items: center; padding: 7px 0; color: #90a4ae; }
    .step mat-icon { color: #cfd8dc; }
    .step.done, .step.done mat-icon { color: #2e7d32; }
    .step.current { color: #1565c0; font-weight: 500; }
    .step.current mat-icon { color: #1565c0; }
    .step-name { font-size: 14px; }
    .step-roles { font-size: 12px; color: #90a4ae; }
    .event { display: flex; gap: 10px; padding: 8px 0; }
    .ev-icon { font-size: 20px; width: 20px; height: 20px; margin-top: 2px; }
    .ev-icon.approved { color: #2e7d32; }
    .ev-icon.rejected { color: #c62828; }
    .ev-icon.returned { color: #b26a00; }
    .ev-icon.submitted, .ev-icon.resubmitted { color: #1565c0; }
    .ev-body { font-size: 13px; line-height: 1.4; }
    .ev-comment { background: #f6f7f9; border-left: 3px solid #cfd8dc; border-radius: 4px; padding: 6px 10px; margin: 4px 0; font-style: italic; }
    .ev-time { font-size: 11px; color: #90a4ae; }
  `,
})
export class InstanceDetailComponent {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);

  private downloads = inject(DownloadService);

  instance = signal<ProcessInstance | null>(null);
  viewer = signal<Viewer | null>(null);
  downloading = signal(false);
  printing = signal(false);
  copied = signal(false);

  constructor() {
    this.route.paramMap.subscribe((params) => this.load(params.get('id')!));
  }

  private load(id: string) {
    this.api.instance(id).subscribe({
      next: (res) => {
        this.instance.set(res.instance);
        this.viewer.set(res.viewer);
      },
      error: (err) => {
        this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
        this.router.navigate(['/']);
      },
    });
  }

  act(action: Action) {
    const inst = this.instance()!;
    const stepName = inst.definitionSnapshot.steps[inst.currentStep].name;
    this.dialog
      .open(ActionDialogComponent, { data: { action, reference: inst.reference, stepName }, width: '440px' })
      .afterClosed()
      .subscribe((comment?: string) => {
        if (comment === undefined) return;
        this.api.act(inst._id, action, comment).subscribe({
          next: (res) => {
            this.instance.set(res.instance);
            this.viewer.set(res.viewer);
            this.snack.open('Done', undefined, { duration: 2000 });
          },
          error: (err) => this.snack.open(errorMessage(err), 'OK', { duration: 4000 }),
        });
      });
  }

  /** Shareable absolute URL; recipients still need permission to open it. */
  async copyLink() {
    const inst = this.instance();
    if (!inst) return;
    const url = `${location.origin}/requests/${inst._id}`;
    const ok = await copyText(url);
    if (ok) {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
      this.snack.open('Link copied to clipboard', undefined, { duration: 2000 });
    } else {
      this.snack.open(url, 'OK', { duration: 8000 });
    }
  }

  async downloadPdf() {
    const inst = this.instance();
    if (!inst) return;
    this.downloading.set(true);
    try {
      await this.downloads.save(`/api/instances/${inst._id}/pdf`, `${inst.reference}.pdf`);
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    } finally {
      this.downloading.set(false);
    }
  }

  async print() {
    const inst = this.instance();
    if (!inst) return;
    this.printing.set(true);
    try {
      await this.downloads.print(`/api/instances/${inst._id}/pdf`);
    } catch (err) {
      this.snack.open(errorMessage(err), 'OK', { duration: 4000 });
    } finally {
      this.printing.set(false);
    }
  }

  timeline(inst: ProcessInstance) {
    return inst.history.slice().reverse();
  }

  display(v: unknown): string {
    if (v === undefined || v === null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    return String(v);
  }

  roleNames(roles: { name: string }[]): string {
    return roles.map((r) => r.name).join(' / ');
  }

  stepDone(inst: ProcessInstance, i: number): boolean {
    return inst.status === 'approved' || i < inst.currentStep;
  }

  stepCurrent(inst: ProcessInstance, i: number): boolean {
    return inst.status === 'in_progress' && i === inst.currentStep;
  }

  stepIcon(inst: ProcessInstance, i: number): string {
    if (this.stepDone(inst, i)) return 'check_circle';
    if (this.stepCurrent(inst, i)) return 'radio_button_checked';
    return 'radio_button_unchecked';
  }

  eventIcon(action: string): string {
    return {
      submitted: 'send', resubmitted: 'replay',
      approved: 'check_circle', rejected: 'cancel', returned: 'undo',
    }[action] ?? 'circle';
  }

  eventVerb(action: string): string {
    return {
      submitted: 'submitted the request', resubmitted: 'resubmitted the request',
      approved: 'approved', rejected: 'rejected', returned: 'returned',
    }[action] ?? action;
  }

  back() {
    history.back();
  }
}
