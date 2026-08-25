import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { InstanceStatus, STATUS_LABELS } from '../core/models';

@Component({
  selector: 'app-status-chip',
  template: '<span class="status-chip {{ status() }}">{{ label() }}</span>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusChipComponent {
  status = input.required<InstanceStatus>();
  label = computed(() => STATUS_LABELS[this.status()] ?? this.status());
}
