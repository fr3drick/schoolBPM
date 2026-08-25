import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { ApiService } from '../../core/api.service';
import { ProcessInstance } from '../../core/models';
import { InstanceListComponent } from '../../shared/instance-list';

@Component({
  selector: 'app-approvals',
  imports: [InstanceListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Approvals</h1>
        <span class="muted">
          @if (loaded() && total()) {
            {{ total() }} waiting for your role to act
          } @else {
            Requests waiting for your role to act
          }
        </span>
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
        emptyMessage="Nothing is waiting for your approval"
      />
    </div>
  `,
})
export class ApprovalsComponent {
  private api = inject(ApiService);
  instances = signal<ProcessInstance[]>([]);
  total = signal(0);
  loading = signal(false);
  loaded = signal(false);
  pageIndex = signal(0);
  pageSize = signal(50);

  constructor() {
    this.load();
  }

  onPage(event: PageEvent) {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.api.tasks({ skip: this.pageIndex() * this.pageSize(), limit: this.pageSize() }).subscribe({
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
