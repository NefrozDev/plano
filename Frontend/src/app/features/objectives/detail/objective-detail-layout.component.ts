import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ObjectivesStore } from '../objectives.store';
import { ModalDialogComponent } from '../../../shared/ui/modal-dialog.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { ObjectiveRemovalService } from '../objective-removal.service';
import { ObjectiveCelebrationComponent } from './objective-celebration.component';
import { ObjectiveContext } from './objective-context';
import { readNotificationsWhileOpen } from '../../../core/notifications/notifications.store';

interface DetailTab {
  /** Translation key. */
  label: string;
  path: string;
  link: string[];
}

@Component({
  selector: 'app-objective-detail-layout',
  imports: [
    TranslocoPipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ModalDialogComponent,
    ObjectiveCelebrationComponent,
    PageHeaderComponent,
  ],
  providers: [ObjectiveContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'closeMenu()' },
  templateUrl: './objective-detail-layout.component.html',
  styleUrl: './objective-detail-layout.component.scss',
})
export class ObjectiveDetailLayoutComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly removal = inject(ObjectiveRemovalService);
  private readonly context = inject(ObjectiveContext);
  readonly store = inject(ObjectivesStore);

  readonly objective = this.context.objective;
  /** Opening is over: no objective from here on means it is not available. */
  readonly loaded = signal(false);
  readonly menuOpen = signal(false);
  readonly templateOpen = signal(false);
  /** Says the template was saved, until the dialog closes. */
  readonly templateSaved = signal(false);
  readonly showTitle = signal(true);
  readonly isOwner = computed(() => this.objective()?.role === 'owner');
  /** One level up the tree, or the overview from the top. */
  readonly backLink = computed(() => {
    const parentId = this.objective()?.breadcrumb.at(-1)?.id;
    return parentId ? ['/objectives', parentId] : ['/objectives'];
  });
  readonly tabs = computed<readonly DetailTab[]>(() => {
    const objective = this.objective();
    if (!objective) return [];
    const extra: Omit<DetailTab, 'link'>[] = [];
    if (objective.completion === 'metric') {
      extra.push({ label: 'objectives.tabs.calendar', path: 'calendar' }, { label: 'objectives.tabs.stats', path: 'stats' });
    } else if (objective.completion === 'habit') {
      extra.push({ label: 'objectives.completion.habit', path: 'habit' });
    }
    return [{ label: 'objectives.tabs.summary', path: '' }, ...extra, { label: 'objectives.tabs.activity', path: 'activity' }].map((tab) => ({
      ...tab,
      link: ['/objectives', objective.id, ...(tab.path ? [tab.path] : [])],
    }));
  });

  /**
   * Keyboard focus moving to something outside closes the menu, which would otherwise cover
   * it (WCAG 2.4.11). Only a real move: a click that focuses nothing (Safari's buttons) does not.
   */
  leaveMenu(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    if (next && !(event.currentTarget as HTMLElement).contains(next)) {
      this.menuOpen.set(false);
    }
  }

  private readonly moreButton = viewChild<ElementRef<HTMLButtonElement>>('moreButton');

  /** Escape closes the menu and gives focus back to the button that opened it. */
  closeMenu(): void {
    if (!this.menuOpen()) return;
    this.menuOpen.set(false);
    this.moreButton()?.nativeElement.focus();
  }

  constructor() {
    readNotificationsWhileOpen('objectives', this.context.id);
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      this.context.id.set(id);
      this.menuOpen.set(false);
      void this.open(id);
    });
  }

  /** The summary tab shows the title in large type, so the header hides its copy. */
  onActivate(component: object): void {
    this.showTitle.set(!('hidesHeaderTitle' in component));
  }

  togglePause(): void {
    const objective = this.objective();
    if (!objective) return;
    void this.store.update(objective.id, { paused: objective.status !== 'paused' });
    this.menuOpen.set(false);
  }

  toggleArchive(): void {
    const objective = this.objective();
    if (!objective) return;
    void this.store.update(objective.id, { archived: !objective.archived });
    this.menuOpen.set(false);
  }

  openTemplate(): void {
    this.menuOpen.set(false);
    this.templateSaved.set(false);
    this.templateOpen.set(true);
  }

  async saveTemplate(input: HTMLInputElement): Promise<void> {
    const objective = this.objective();
    const name = input.value.trim();
    if (!objective || !name) return;
    if (await this.store.saveTemplate(objective.id, name)) {
      input.value = '';
      this.templateSaved.set(true);
    }
  }

  async remove(): Promise<void> {
    const objective = this.objective();
    if (!objective) return;
    this.menuOpen.set(false);
    const back = this.backLink();
    if (await this.removal.remove(objective, this.removal.messageFor(objective))) void this.router.navigate(back);
  }

  private async open(id: string): Promise<void> {
    this.loaded.set(false);
    const found = await this.store.open(id);
    // Another objective may have been opened in the meantime.
    if (this.context.id() !== id) return;
    this.loaded.set(true);
    if (found && !this.objective()?.parentId) this.store.markViewed(id);
  }
}
