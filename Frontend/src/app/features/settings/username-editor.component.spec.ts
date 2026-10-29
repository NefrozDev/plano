import { HttpTestingController, type TestRequest } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { providePlanoTesting } from '../../testing/plano-testing';
import { AVAILABILITY_DEBOUNCE_MS, UsernameEditorComponent } from './username-editor.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UsernameEditorComponent],
  template: `<app-username-editor [username]="username()" />`,
})
class HostComponent {
  readonly username = signal('ada');
}

const AVAILABILITY_URL = '/api/v1/users/username-availability';

describe('UsernameEditorComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;

  const input = () => element.querySelector('input') as HTMLInputElement;
  const status = () => element.querySelector('.status') as HTMLElement;
  const saveButton = () => element.querySelector('button.save') as HTMLButtonElement;
  const availabilityRequests = () => http.match((request) => request.url === AVAILABILITY_URL);

  function type(value: string): void {
    input().value = value;
    input().dispatchEvent(new Event('input'));
    // toObservable() emits from an effect: run change detection before the debounce.
    fixture.detectChanges();
  }

  function waitForCheck(): TestRequest {
    vi.advanceTimersByTime(AVAILABILITY_DEBOUNCE_MS);
    const [request] = availabilityRequests();
    return request;
  }

  async function settleSave(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [HostComponent], providers: providePlanoTesting() });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(HostComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    (element.querySelector('button.username') as HTMLButtonElement).click();
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('opens on a tap with the current name, and closes without saving when unchanged', () => {
    expect(input().value).toBe('ada');
    expect(status().textContent).toContain('votre nom d’utilisateur actuel');

    type('ADA');
    vi.advanceTimersByTime(AVAILABILITY_DEBOUNCE_MS);
    saveButton().click();
    fixture.detectChanges();

    expect(availabilityRequests()).toHaveLength(0);
    http.expectNone('/api/v1/users/me');
    expect(input()).toBeNull();
    expect(element.querySelector('button.username')?.textContent).toContain('@ada');
  });

  it('refuses a malformed name without asking the server', () => {
    type('a b');
    vi.advanceTimersByTime(AVAILABILITY_DEBOUNCE_MS);

    expect(availabilityRequests()).toHaveLength(0);
    expect(status().textContent).toContain('De 3 à 30');
    expect(status().classList).toContain('error');
    expect(input().getAttribute('aria-invalid')).toBe('true');
    expect(saveButton().disabled).toBe(true);
  });

  it('checks the last typed name once, and blocks a taken one', () => {
    type('bo');
    vi.advanceTimersByTime(AVAILABILITY_DEBOUNCE_MS / 2);
    type('Bob');
    expect(status().textContent).toContain('Vérification');
    expect(saveButton().disabled).toBe(true);

    const request = waitForCheck();
    expect(request.request.params.get('username')).toBe('bob');
    request.flush({ available: false });
    fixture.detectChanges();

    expect(availabilityRequests()).toHaveLength(0);
    expect(status().textContent).toContain('déjà pris');
    expect(saveButton().disabled).toBe(true);
    saveButton().click();
    http.expectNone('/api/v1/users/me');
  });

  it('saves a free name and closes', async () => {
    type('Lovelace');
    waitForCheck().flush({ available: true });
    fixture.detectChanges();
    expect(status().textContent).toContain('disponible');
    expect(status().classList).toContain('ok');

    saveButton().click();
    fixture.detectChanges();
    expect(saveButton().textContent).toContain('Enregistrement');
    const save = http.expectOne('/api/v1/users/me');
    expect(save.request.method).toBe('PATCH');
    expect(save.request.body).toEqual({ username: 'lovelace' });
    save.flush({ id: 'user-1', username: 'lovelace' });
    fixture.componentInstance.username.set('lovelace');
    await settleSave();

    expect(input()).toBeNull();
    expect(element.querySelector('button.username')?.textContent).toContain('@lovelace');
  });

  it('shows a name taken in the meantime as taken, and keeps the field open', async () => {
    type('lovelace');
    waitForCheck().flush({ available: true });
    fixture.detectChanges();

    saveButton().click();
    http.expectOne('/api/v1/users/me').flush({ message: 'pris' }, { status: 409, statusText: 'Conflict' });
    await settleSave();

    expect(input().value).toBe('lovelace');
    expect(status().textContent).toContain('déjà pris');
    expect(saveButton().disabled).toBe(true);
  });

  it('lets the server decide when the check fails, and reports a failed save', async () => {
    type('lovelace');
    waitForCheck().flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(status().textContent).toContain('Disponibilité inconnue');
    expect(saveButton().disabled).toBe(false);

    saveButton().click();
    http.expectOne('/api/v1/users/me').flush(null, { status: 500, statusText: 'Server Error' });
    await settleSave();

    expect(status().textContent).toContain('n’a pas pu être modifié');
    expect(input()).not.toBeNull();
  });

  it('cancels with Escape or the cancel button, keeping the old name', () => {
    type('lovelace');
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(input()).toBeNull();

    (element.querySelector('button.username') as HTMLButtonElement).click();
    fixture.detectChanges();
    // Reopening starts again from the saved name.
    expect(input().value).toBe('ada');
    (element.querySelector('button.secondary') as HTMLButtonElement).click();
    fixture.detectChanges();

    vi.advanceTimersByTime(AVAILABILITY_DEBOUNCE_MS);
    expect(availabilityRequests()).toHaveLength(0);
    expect(element.querySelector('button.username')?.textContent).toContain('@ada');
  });
});
