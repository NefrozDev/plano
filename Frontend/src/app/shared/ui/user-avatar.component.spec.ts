import { ComponentFixture, TestBed } from '@angular/core/testing';
import { personColor } from '../../core/people/people';
import { AvatarUser, UserAvatarComponent } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  let fixture: ComponentFixture<UserAvatarComponent>;
  let element: HTMLElement;
  const ada: AvatarUser = { id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', username: 'ada', avatarVersion: null };

  function render(user: AvatarUser, size?: number): void {
    fixture.componentRef.setInput('user', user);
    if (size) fixture.componentRef.setInput('size', size);
    fixture.detectChanges();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(UserAvatarComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  it('shows initials on the user’s colour without a picture', () => {
    render(ada, 64);

    expect(element.textContent?.trim()).toBe('AL');
    expect(element.querySelector('img')).toBeNull();
    expect(element.style.background).not.toBe('');
    expect(getComputedStyle(element).backgroundColor).toBe(colorOf(personColor('user-1')));
    expect(element.getBoundingClientRect().width).toBe(64);
    expect(element.getAttribute('aria-hidden')).toBe('true');
  });

  it('falls back to the username without a name', () => {
    render({ ...ada, firstName: '', lastName: '' });

    expect(element.textContent?.trim()).toBe('AD');
  });

  it('shows the versioned picture, and initials again if it fails to load', () => {
    render({ ...ada, avatarVersion: 12 });
    const image = element.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/api/v1/users/user-1/avatar?v=12');
    expect(image.getAttribute('alt')).toBe('');
    expect(element.style.background).toBe('');

    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent?.trim()).toBe('AL');

    // A new picture gets a new chance.
    render({ ...ada, avatarVersion: 13 });
    expect(element.querySelector('img')?.getAttribute('src')).toBe('/api/v1/users/user-1/avatar?v=13');
  });
});

/** The rgb() form computed styles report for a hex colour. */
function colorOf(hex: string): string {
  const probe = document.body.appendChild(document.createElement('i'));
  probe.style.color = hex;
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}
