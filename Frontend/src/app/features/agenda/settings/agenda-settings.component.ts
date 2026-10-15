import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { AgendaSettings } from '@plano/common';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { AgendaStore } from '../agenda.store';
import { DURATION_OPTIONS, REMINDER_OPTIONS, TIME_ZONES } from '../agenda.utils';

type ToggleSetting = 'eventNotifications' | 'invitationNotifications' | 'showWeekNumbers';

/** Screen 10. */
@Component({
  selector: 'app-agenda-settings',
  standalone: true,
  imports: [PageHeaderComponent],
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
        <button class="setting-row" type="button" role="switch" [attr.aria-checked]="settings().eventNotifications" (click)="toggle('eventNotifications')">
          <span>Notifications d’événements</span><i class="switch" [class.on]="settings().eventNotifications"><b></b></i>
        </button>
        <button class="setting-row" type="button" role="switch" [attr.aria-checked]="settings().invitationNotifications" (click)="toggle('invitationNotifications')">
          <span>Notifications d’invitations</span><i class="switch" [class.on]="settings().invitationNotifications"><b></b></i>
        </button>
      </section>

      <section>
        <h2>Affichage</h2>
        <button class="setting-row" type="button" role="switch" [attr.aria-checked]="settings().showWeekNumbers" (click)="toggle('showWeekNumbers')">
          <span>Afficher les numéros de semaine</span><i class="switch" [class.on]="settings().showWeekNumbers"><b></b></i>
        </button>
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
    .switch { position: relative; display: block; width: 2.15rem; height: 1.25rem; border-radius: 1rem; background: #dfe4ed; transition: background-color 180ms ease; }
    .switch b { position: absolute; top: .15rem; left: .15rem; width: .95rem; height: .95rem; border-radius: 50%; background: white; box-shadow: 0 1px 3px rgb(20 30 50 / 22%); transition: transform 180ms ease; }
    .switch.on { background: #3264ed; }
    .switch.on b { transform: translateX(.9rem); }
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
