import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { AgendaSettings } from '@plano/common';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SwitchRowComponent } from '../../../shared/ui/switch-row.component';
import { AgendaStore } from '../agenda.store';
import { DURATION_OPTIONS, REMINDER_OPTIONS, TIME_ZONES } from '../agenda.utils';

type ToggleSetting = 'eventNotifications' | 'invitationNotifications' | 'showWeekNumbers';

/** Screen 10. */
@Component({
  selector: 'app-agenda-settings',
  imports: [PageHeaderComponent, SwitchRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header heading="Paramètres Agenda" backLink="/agenda" backLabel="Retour à l’agenda" />

    <div class="content">
      <section>
        <h2>Général</h2>
        <label class="setting-row">
          <span>Premier jour de la semaine</span>
          <select (change)="update({ weekStartsOn: +$any($event.target).value === 0 ? 0 : 1 })">
            <option value="1" [selected]="settings().weekStartsOn === 1">Lundi</option>
            <option value="0" [selected]="settings().weekStartsOn === 0">Dimanche</option>
          </select>
        </label>
        <label class="setting-row">
          <span>Durée par défaut</span>
          <select (change)="update({ defaultDurationMinutes: +$any($event.target).value })">
            @for (option of durations; track option.value) {
              <option [value]="option.value" [selected]="settings().defaultDurationMinutes === option.value">{{ option.label }}</option>
            }
          </select>
        </label>
        <label class="setting-row">
          <span>Fuseau horaire</span>
          <select (change)="update({ timeZone: $any($event.target).value })">
            @for (zone of timeZones; track zone.value) {
              <option [value]="zone.value" [selected]="settings().timeZone === zone.value">{{ zone.label }}</option>
            }
          </select>
        </label>
      </section>

      <section>
        <h2>Notifications</h2>
        <label class="setting-row">
          <span>Rappel par défaut</span>
          <select (change)="setDefaultReminder($any($event.target).value)">
            @for (option of reminders; track option.label) {
              <option [value]="option.value ?? 'none'" [selected]="settings().defaultReminderMinutes === option.value">{{ option.label }}</option>
            }
          </select>
        </label>
        <app-switch-row label="Notifications d’événements" [checked]="settings().eventNotifications" (toggled)="toggle('eventNotifications')" />
        <app-switch-row label="Notifications d’invitations" [checked]="settings().invitationNotifications" (toggled)="toggle('invitationNotifications')" />
      </section>

      <section>
        <h2>Affichage</h2>
        <app-switch-row label="Afficher les numéros de semaine" [checked]="settings().showWeekNumbers" (toggled)="toggle('showWeekNumbers')" />
        <label class="setting-row">
          <span>Affichage des heures</span>
          <select (change)="update({ hourFormat: $any($event.target).value === '12h' ? '12h' : '24h' })">
            <option value="24h" [selected]="settings().hourFormat === '24h'">24 heures</option>
            <option value="12h" [selected]="settings().hourFormat === '12h'">12 heures (AM/PM)</option>
          </select>
        </label>
      </section>
    </div>
  `,
  styles: `
    :host { display: flex; flex: 1; min-height: 0; flex-direction: column; }
    .content { flex: 1; min-height: 0; padding: 0 1.25rem 2rem; overflow-y: auto; }
    section { padding: 1.1rem 0; border-bottom: 1px solid #edf0f5; }
    section:last-child { border-bottom: 0; }
    h2 { margin: 0 0 .5rem; color: #586174; font-size: .72rem; font-weight: 750; }
    .setting-row { display: grid; width: 100%; min-height: 2.6rem; grid-template-columns: minmax(0, 1fr) auto; gap: 1rem; align-items: center; padding: .25rem 0; border: 0; background: transparent; color: #20263a; cursor: pointer; font: inherit; font-size: .8rem; text-align: left; }
    .setting-row select { max-width: 10.5rem; border: 0; outline: 0; background: transparent; color: #687187; cursor: pointer; font: inherit; font-size: .78rem; text-align: right; }
  `,
})
export class AgendaSettingsComponent {
  private readonly store = inject(AgendaStore);

  readonly settings = this.store.settings;
  readonly durations = DURATION_OPTIONS;
  readonly timeZones = TIME_ZONES;
  readonly reminders = REMINDER_OPTIONS;

  toggle(setting: ToggleSetting): void {
    this.store.updateSettings({ [setting]: !this.settings()[setting] });
  }

  update(changes: Partial<AgendaSettings>): void {
    this.store.updateSettings(changes);
  }

  /** Select values are strings: 'none' stands for "no reminder". */
  setDefaultReminder(value: string): void {
    this.store.updateSettings({ defaultReminderMinutes: value === 'none' ? null : Number(value) });
  }
}
