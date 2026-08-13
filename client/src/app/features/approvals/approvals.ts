import { Component, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { ProcessInstance } from '../../core/models';
import { InstanceListComponent } from '../../shared/instance-list';

@Component({
  selector: 'app-approvals',
  imports: [InstanceListComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Approvals</h1>
        <span class="muted">Requests waiting for your role to act</span>
      </div>
      <app-instance-list [instances]="instances()" [showInitiator]="true"
        emptyMessage="Nothing is waiting for your approval" />
    </div>
  `,
})
export class ApprovalsComponent {
  private api = inject(ApiService);
  instances = signal<ProcessInstance[]>([]);

  constructor() {
    this.api.tasks().subscribe((res) => this.instances.set(res.instances));
  }
}
