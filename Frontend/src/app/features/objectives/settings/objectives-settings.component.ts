import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { DueReminder, ObjectiveSettings } from '@plano/common';
import { CountPipe } from '../../../core/i18n/translate';
import { DUE_REMINDER_LABELS } from '../objective.utils';
import { ObjectivesStore } from '../objectives.store';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SwitchRowComponent } from '../../../shared/ui/switch-row.component';

type ToggleSetting = 'showArchived' | 'notifications' | 'showPercentage' | 'categoryColors';

@Component({
  selector: 'app-objectives-settings',
  imports: [TranslocoPipe, CountPipe, PageHeaderComponent, SwitchRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objectives-settings.component.html',
  styleUrl: './objectives-settings.component.scss',
})
export class ObjectivesSettingsComponent {
  private readonly store = inject(ObjectivesStore);

  readonly settings = this.store.settings;
  readonly templates = this.store.templates;
  readonly dueReminders = Object.entries(DUE_REMINDER_LABELS) as [DueReminder, string][];

  constructor() {
    void this.store.loadTemplates();
  }

  toggle(setting: ToggleSetting): void {
    this.store.updateSettings({ [setting]: !this.settings()[setting] });
  }

  update(changes: Partial<ObjectiveSettings>): void {
    this.store.updateSettings(changes);
  }

  removeTemplate(id: string): void {
    void this.store.removeTemplate(id);
  }
}
