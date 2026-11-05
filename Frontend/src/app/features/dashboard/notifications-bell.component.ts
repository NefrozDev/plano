import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { NotificationEntry, NotificationKind } from '@plano/common';
import { LanguageService } from '../../core/i18n/language.service';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { toPerson } from '../../core/people/people';
import { APP_CLOCK } from '../../core/time/dates';
import { UserAvatarComponent } from '../../shared/ui/user-avatar.component';

/** Translation key of each kind; `many` when the same news happened several times while unread. */
const MESSAGE_KEYS: Readonly<Record<NotificationKind, { one: string; many?: string }>> = {
  'friend.requested': { one: 'notifications.friendRequested' },
  'friend.accepted': { one: 'notifications.friendAccepted' },
  'list.invited': { one: 'notifications.items.listInvited' },
  'list.entries': { one: 'notifications.items.listEntries', many: 'notifications.items.listEntriesMany' },
  'objective.invited': { one: 'notifications.objectiveInvited' },
  'objective.contribution': {
    one: 'notifications.objectiveContribution',
    many: 'notifications.items.contributionMany',
  },
  'objective.completed': { one: 'notifications.objectiveCompleted' },
  'objective.comment': { one: 'notifications.objectiveComment', many: 'notifications.items.commentMany' },
  'agenda.invited': { one: 'notifications.items.agendaInvited' },
  'agenda.accepted': { one: 'notifications.items.agendaAccepted', many: 'notifications.items.agendaAcceptedMany' },
  'agenda.declined': { one: 'notifications.items.agendaDeclined', many: 'notifications.items.agendaDeclinedMany' },
};

const MINUTE = 60_000;

/**
 * The home page bell: every notification, newest first. Tapping one marks it
 * read and opens where it happened; the counts on the tabs follow.
 */
@Component({
  selector: 'app-notifications-bell',
  imports: [TranslocoPipe, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeOutside($event)',
    '(document:keydown.escape)': 'open.set(false)',
  },
  template: `
    <button
      class="bell"
      type="button"
      aria-haspopup="true"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="
        store.total() ? ('notifications.bell.withNews' | transloco: { count: store.total() }) : ('notifications.bell.label' | transloco)
      "
      (click)="open.set(!open())"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v4.5L6 17Z" /><path d="M10 20h4" /></svg>
      @if (store.total()) {
        <i class="badge" aria-hidden="true">{{ store.total() }}</i>
      }
    </button>

    @if (open()) {
      <section class="panel" aria-labelledby="notifications-heading">
        <h2 id="notifications-heading">{{ 'notifications.bell.heading' | transloco }}</h2>
        @if (entries().length) {
          <ul>
            @for (entry of entries(); track entry.notification.id) {
              <li>
                <button type="button" [class.unread]="!entry.notification.read" (click)="openOne(entry.notification)">
                  @if (entry.person; as person) {
                    <app-user-avatar [user]="person" [size]="36" />
                  } @else {
                    <span class="placeholder" aria-hidden="true"></span>
                  }
                  <span class="text">
                    <span class="message">{{ entry.message }}</span>
                    <small>{{ entry.when }}</small>
                  </span>
                  @if (!entry.notification.read) {
                    <i class="dot" aria-hidden="true"></i>
                  }
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="empty">{{ 'notifications.bell.empty' | transloco }}</p>
        }
      </section>
    }
  `,
  styles: `
    :host { position: relative; display: block; }
    .bell { position: relative; display: grid; width: 2.8rem; height: 2.8rem; padding: .55rem; place-items: center; border: 0; border-radius: 50%; background: rgb(255 255 255 / 70%); color: #20263a; cursor: pointer; }
    .bell svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
    .badge { position: absolute; top: -.15rem; right: -.2rem; display: grid; min-width: 1.15rem; height: 1.15rem; padding: 0 .25rem; place-items: center; border: 2px solid #f6faff; border-radius: 1rem; background: var(--color-danger); color: #fff; font-size: .62rem; font-style: normal; font-weight: 750; }
    /* Aligned on the top bar's right edge, past the profile picture that follows the bell. */
    .panel { position: absolute; z-index: 30; top: calc(100% + .45rem); right: calc(-1 * var(--bell-offset, 0px)); width: min(21rem, calc(100vw - 2.5rem)); max-height: min(28rem, 65vh); overflow-y: auto; overscroll-behavior: contain; padding: .55rem; border: 1px solid #e4e8f0; border-radius: 1rem; background: white; box-shadow: 0 .65rem 1.8rem rgb(27 38 64 / 16%); }
    h2 { margin: .25rem .45rem .45rem; color: #586174; font-size: .72rem; font-weight: 750; }
    ul { display: grid; gap: .15rem; margin: 0; padding: 0; list-style: none; }
    li button { display: grid; width: 100%; grid-template-columns: auto 1fr auto; gap: .65rem; align-items: center; padding: .55rem .45rem; border: 0; border-radius: .7rem; background: transparent; color: var(--color-text); cursor: pointer; text-align: left; }
    li button:hover { background: #f4f7fc; }
    li button.unread { background: #f1f5ff; }
    .placeholder { width: 36px; height: 36px; border-radius: 50%; background: #e6ebf3; }
    .text { display: grid; gap: .15rem; min-width: 0; }
    .message { font-size: .78rem; line-height: 1.35; }
    .unread .message { font-weight: 650; }
    small { color: var(--color-text-muted); font-size: .68rem; }
    .dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--color-primary); }
    .empty { margin: .6rem .45rem .7rem; color: var(--color-text-muted); font-size: .78rem; }
  `,
})
export class NotificationsBellComponent {
  readonly store = inject(NotificationsStore);
  private readonly transloco = inject(TranslocoService);
  private readonly language = inject(LanguageService);
  private readonly now = inject(APP_CLOCK);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  readonly open = signal(false);
  readonly entries = computed(() => {
    // Re-read on a language change.
    this.language.active();
    return this.store.items().map((notification) => ({
      notification,
      person: notification.actor ? toPerson(notification.actor) : null,
      message: this.messageOf(notification),
      when: this.ago(notification.updatedAt),
    }));
  });

  openOne(notification: NotificationEntry): void {
    this.open.set(false);
    void this.store.open(notification);
  }

  closeOutside(event: Event): void {
    if (this.open() && !this.host.contains(event.target as Node)) this.open.set(false);
  }

  private messageOf(notification: NotificationEntry): string {
    const keys = MESSAGE_KEYS[notification.kind];
    const key = notification.count > 1 && keys.many ? keys.many : keys.one;
    return this.transloco.translate(key, {
      name: notification.actor?.name ?? this.transloco.translate('notifications.someone'),
      title: notification.title,
      count: notification.count,
    });
  }

  /** "5 min ago", "yesterday"… in the interface language. */
  private ago(iso: string): string {
    const format = new Intl.RelativeTimeFormat(this.language.active(), { numeric: 'auto' });
    const minutes = Math.round((new Date(iso).getTime() - this.now().getTime()) / MINUTE);
    if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return format.format(hours, 'hour');
    return format.format(Math.round(hours / 24), 'day');
  }
}
