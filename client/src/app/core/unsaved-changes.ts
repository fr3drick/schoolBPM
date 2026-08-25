import { DestroyRef, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { confirmDialog } from '../shared/confirm-dialog';

/** Implemented by any page holding edits that are not yet on the server. */
export interface HasUnsavedChanges {
  /** True while leaving the page would throw work away. */
  unsavedChanges(): boolean;
  /** Shown in the warning, e.g. "7 scores". */
  unsavedDescription?(): string;
}

/**
 * Route guard for pages that batch their edits and save on a button.
 *
 * Functional, like every other guard in `core/guards.ts` — the class-based
 * `CanDeactivate` interface is deprecated. It uses the app's own confirm
 * dialog rather than `window.confirm`, so the warning that protects a
 * teacher's unsaved marks does not look like a browser error.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component?.unsavedChanges?.()) return true;
  // Phrased to avoid agreeing in number with the description, which may be
  // "1 score", "7 scores" or "a register".
  const what = component.unsavedDescription?.() ?? 'changes on this page';
  return confirmDialog(inject(MatDialog), {
    title: 'Leave without saving?',
    message: `You have not saved ${what}. Leaving this page discards the changes.`,
    confirmLabel: 'Discard and leave',
    cancelLabel: 'Stay on this page',
  });
};

/**
 * The other half: the router guard cannot see a tab close or a reload, so the
 * browser's own prompt covers that one case. Call from a component's field
 * initialiser or constructor — it unregisters itself with the component.
 *
 * The browser ignores any custom text here and shows its own wording; setting
 * `returnValue` is what makes the prompt appear at all.
 */
export function warnBeforeUnload(hasChanges: () => boolean): void {
  const handler = (event: BeforeUnloadEvent) => {
    if (!hasChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', handler));
}
