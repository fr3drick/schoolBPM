import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, map } from 'rxjs';

export interface ConfirmData {
  title: string;
  message: string;
  /** Defaults to "Delete", because destructive actions are what asks. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button and a warning glyph. On by default. */
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title class="title">
      @if (data.danger !== false) {
        <mat-icon class="danger-icon">warning</mat-icon>
      }
      {{ data.title }}
    </h2>
    <mat-dialog-content class="message">{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)">
        {{ data.cancelLabel ?? 'Cancel' }}
      </button>
      <button
        mat-flat-button
        type="button"
        [color]="data.danger === false ? 'primary' : 'warn'"
        cdkFocusInitial
        (click)="ref.close(true)"
      >
        {{ data.confirmLabel ?? 'Delete' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .title { display: flex; align-items: center; gap: 10px; }
    .danger-icon { color: #c62828; }
    .message { max-width: 420px; line-height: 1.5; white-space: pre-line; }
  `,
})
export class ConfirmDialogComponent {
  // Closed with an explicit boolean rather than `mat-dialog-close`: a bare
  // attribute closes with '', which is falsy but still reaches subscribers.
  readonly ref = inject<MatDialogRef<ConfirmDialogComponent, boolean>>(MatDialogRef);
  readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}

/**
 * Replaces `window.confirm`, which blocks the main thread, cannot be styled or
 * translated, and looks like the browser rather than the app. Emits exactly
 * once with true only if the user pressed the confirm button — a backdrop
 * click or Escape closes with `undefined` and is coerced to false here so
 * callers can write `if (!ok) return`.
 */
export function confirmDialog(dialog: MatDialog, data: ConfirmData): Observable<boolean> {
  return dialog
    .open(ConfirmDialogComponent, { data, autoFocus: 'dialog', restoreFocus: true })
    .afterClosed()
    .pipe(map((result) => result === true));
}
