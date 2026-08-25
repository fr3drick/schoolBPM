import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';

/**
 * A 4px indeterminate bar that always occupies its own height, so showing it
 * does not shove the table down by four pixels every time a filter changes.
 *
 * Drop it at the top of a table card. Before this, a list mid-fetch was an
 * empty table indistinguishable from a table with nothing in it.
 */
@Component({
  selector: 'app-loading-bar',
  imports: [MatProgressBarModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="slot">
      @if (active()) { <mat-progress-bar mode="indeterminate" /> }
    </div>
  `,
  styles: `
    .slot { height: 4px; }
  `,
})
export class LoadingBarComponent {
  active = input(false);
}
