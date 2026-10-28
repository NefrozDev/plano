import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { Friend, FriendRequests, PublicUser, UserSearchResult } from '@plano/common';
import { Observable, catchError, debounceTime, distinctUntilChanged, firstValueFrom, map, of, switchMap } from 'rxjs';
import { FriendsService, MIN_SEARCH_LENGTH } from '../../core/friends/friends.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { SearchFieldComponent } from '../../shared/ui/search-field.component';
import { UserAvatarComponent } from '../../shared/ui/user-avatar.component';

/** Waits for a pause in typing before asking the API. */
const SEARCH_DEBOUNCE_MS = 300;

/** Settings section: friend requests, username search and the friends list. */
@Component({
  selector: 'app-friends-panel',
  imports: [SearchFieldComponent, TranslocoPipe, UserAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './friends-panel.component.html',
  styleUrl: './friends-panel.component.scss',
})
export class FriendsPanelComponent implements OnInit {
  private readonly friendsApi = inject(FriendsService);
  private readonly confirm = inject(ConfirmService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  readonly friends = signal<readonly Friend[]>([]);
  readonly requests = signal<FriendRequests>({ incoming: [], outgoing: [] });
  readonly query = signal('');
  /** Null until a search of at least MIN_SEARCH_LENGTH characters answered. */
  readonly results = signal<readonly UserSearchResult[] | null>(null);
  /** Id of the user or request an action is running for. */
  readonly busy = signal('');
  /** Translation key of the last error, empty when none. */
  readonly error = signal('');

  constructor() {
    toObservable(this.query)
      .pipe(
        map((query) => query.trim()),
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((query): Observable<UserSearchResult[] | null> =>
          query.length < MIN_SEARCH_LENGTH
            ? of(null)
            : this.friendsApi.search(query).pipe(
                catchError(() => {
                  this.error.set('friends.errors.search');
                  return of([]);
                }),
              ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => this.results.set(results));
  }

  ngOnInit(): void {
    void this.reload();
  }

  name(user: PublicUser): string {
    return `${user.firstName} ${user.lastName}`.trim() || user.username;
  }

  async add(user: UserSearchResult): Promise<void> {
    await this.run(user.id, this.friendsApi.sendRequest(user.id), ({ status }) =>
      this.setRelation(user.id, status === 'accepted' ? 'friend' : 'outgoing'),
    );
  }

  /** Accepts a request, from the requests list or from a search result. */
  async accept(user: PublicUser): Promise<void> {
    const request = this.requests().incoming.find((incoming) => incoming.user.id === user.id);
    if (!request) return;
    await this.run(user.id, this.friendsApi.accept(request.id), () => this.setRelation(user.id, 'friend'));
  }

  async decline(user: PublicUser): Promise<void> {
    const request = this.requests().incoming.find((incoming) => incoming.user.id === user.id);
    if (!request) return;
    await this.run(user.id, this.friendsApi.removeRequest(request.id), () => this.setRelation(user.id, 'none'));
  }

  async cancel(user: PublicUser): Promise<void> {
    const request = this.requests().outgoing.find((outgoing) => outgoing.user.id === user.id);
    if (!request) return;
    await this.run(user.id, this.friendsApi.removeRequest(request.id), () => this.setRelation(user.id, 'none'));
  }

  async remove(friend: Friend): Promise<void> {
    const confirmed = await this.confirm.ask({
      heading: this.transloco.translate('friends.remove.heading'),
      message: this.transloco.translate('friends.remove.message', { name: this.name(friend) }),
      confirmLabel: this.transloco.translate('friends.remove.confirm'),
      tone: 'danger',
    });
    if (!confirmed) return;
    await this.run(friend.id, this.friendsApi.removeFriend(friend.id), () => this.setRelation(friend.id, 'none'));
  }

  /** One action at a time; every success reloads friends and requests, both sides may have changed. */
  private async run<T>(id: string, request: Observable<T>, applied: (result: T) => void): Promise<void> {
    if (this.busy()) return;
    this.error.set('');
    this.busy.set(id);
    try {
      applied(await firstValueFrom(request));
      await this.reload();
    } catch {
      this.error.set('friends.errors.action');
    } finally {
      this.busy.set('');
    }
  }

  private async reload(): Promise<void> {
    try {
      const [friends, requests] = await Promise.all([
        firstValueFrom(this.friendsApi.list()),
        firstValueFrom(this.friendsApi.requests()),
      ]);
      this.friends.set(friends);
      this.requests.set(requests);
    } catch {
      this.error.set('friends.errors.load');
    }
  }

  private setRelation(userId: string, relation: UserSearchResult['relation']): void {
    this.results.update((results) =>
      results?.map((result) => (result.id === userId ? { ...result, relation } : result)) ?? null,
    );
  }
}
