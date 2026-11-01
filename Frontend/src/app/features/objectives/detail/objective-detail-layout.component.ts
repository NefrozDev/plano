import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { ObjectivesStore } from '../objectives.store';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { ObjectiveContext } from './objective-context';

interface DetailTab {
  label: string;
  path: string;
  link: string[];
}

@Component({
  selector: 'app-objective-detail-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PageHeaderComponent],
  providers: [ObjectiveContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-detail-layout.component.html',
  styleUrl: './objective-detail-layout.component.scss',
})
export class ObjectiveDetailLayoutComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly context = inject(ObjectiveContext);
  readonly store = inject(ObjectivesStore);

  readonly objective = this.context.objective;
  /** Opening is over: no objective from here on means it is not available. */
  readonly loaded = signal(false);
  readonly menuOpen = signal(false);
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
      extra.push({ label: 'Calendrier', path: 'calendar' }, { label: 'Statistiques', path: 'stats' });
    } else if (objective.completion === 'habit') {
      extra.push({ label: 'Habitude', path: 'habit' });
    }
    if (!extra.length) return [];
    return [{ label: 'Aperçu', path: '' }, ...extra].map((tab) => ({
      ...tab,
      link: ['/objectives', objective.id, ...(tab.path ? [tab.path] : [])],
    }));
  });

  constructor() {
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

  async remove(): Promise<void> {
    const objective = this.objective();
    if (!objective) return;
    this.menuOpen.set(false);
    const below = objective.descendantCount;
    const confirmed = await this.confirm.ask({
      heading: 'Supprimer l’objectif ?',
      message: below
        ? `« ${objective.title} » et ${below > 1 ? `ses ${below} sous-objectifs seront supprimés` : 'son sous-objectif seront supprimés'} définitivement.`
        : `« ${objective.title} » sera supprimé définitivement.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!confirmed) return;
    const back = this.backLink();
    if (await this.store.remove(objective.id)) void this.router.navigate(back);
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
