import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { PageEvent } from '@angular/material/paginator';
import { ApiService } from '../../core/api.service';
import { ProcessInstance } from '../../core/models';
import { InstanceListComponent } from '../../shared/instance-list';

@Component({
  selector: 'app-all-requests',
  imports: [MatButtonToggleModule, InstanceListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <h1>All requests</h1>
        @if (loaded() && total()) {
          <span class="muted">{{ total() }} {{ status() ? 'matching' : 'in total' }}</span>
        }
        <span class="spacer"></span>
        <mat-button-toggle-group [value]="status()" (change)="setStatus($event.value)" hideSingleSelectionIndicator>
          <mat-button-toggle value="">All</mat-button-toggle>
          <mat-button-toggle value="in_progress">In progress</mat-button-toggle>
          <mat-button-toggle value="approved">Approved</mat-button-toggle>
          <mat-button-toggle value="rejected">Rejected</mat-button-toggle>
          <mat-button-toggle value="returned">Returned</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      <app-instance-list
        [instances]="instances()"
        [showInitiator]="true"
        [loading]="loading()"
        [loaded]="loaded()"
        [total]="total()"
        [pageIndex]="pageIndex()"
        [pageSize]="pageSize()"
        (page)="onPage($event)"
        emptyMessage="No requests match"
      />
    </div>
  `,
  styles: `
    @media (max-width: 719px) {
      /* Five toggles do not fit a phone; let the group wrap instead of
         pushing the page into a horizontal scroll. */
      mat-button-toggle-group { flex-wrap: wrap; }
    }
  `,
})
export class AllRequestsComponent {
  private api = inject(ApiService);
  instances = signal<ProcessInstance[]>([]);
  total = signal(0);
  loading = signal(false);
  loaded = signal(false);
  status = signal('');
  pageIndex = signal(0);
  pageSize = signal(50);

  constructor() {
    this.load();
  }

  setStatus(value: string) {
    this.status.set(value);
    // A filter change makes page 4 meaningless — it may not exist any more.
    this.pageIndex.set(0);
    this.load();
  }

  onPage(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api
      .allRequests(this.status() || undefined, {
        skip: this.pageIndex() * this.pageSize(),
        limit: this.pageSize(),
      })
      .subscribe({
        next: (res) => {
          this.instances.set(res.instances);
          this.total.set(res.total);
          this.loaded.set(true);
          this.loading.set(false);
        },
        error: () => {
          this.loaded.set(true);
          this.loading.set(false);
        },
      });
  }
}
