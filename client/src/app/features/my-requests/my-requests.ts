import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageEvent } from '@angular/material/paginator';
import { ApiService } from '../../core/api.service';
import { ProcessInstance } from '../../core/models';
import { InstanceListComponent } from '../../shared/instance-list';

@Component({
  selector: 'app-my-requests',
  imports: [RouterLink, MatButtonModule, MatIconModule, InstanceListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-header">
        <h1>My requests</h1>
        @if (loaded() && total()) {
          <span class="muted">{{ total() }} in total</span>
        }
        <span class="spacer"></span>
        <button mat-flat-button color="primary" routerLink="/start">
          <mat-icon>add</mat-icon> Start a request
        </button>
      </div>
      <app-instance-list
        [instances]="instances()"
        [loading]="loading()"
        [loaded]="loaded()"
        [total]="total()"
        [pageIndex]="pageIndex()"
        [pageSize]="pageSize()"
        (page)="onPage($event)"
        emptyMessage="You haven't started any requests yet"
      />
    </div>
  `,
})
export class MyRequestsComponent {
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
    this.api
      .myRequests({ skip: this.pageIndex() * this.pageSize(), limit: this.pageSize() })
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
