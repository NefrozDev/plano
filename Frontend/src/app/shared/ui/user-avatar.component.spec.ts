import { ComponentFixture, TestBed } from '@angular/core/testing';
import { type Person, personColor } from '../../core/people/people';
import { AvatarUser, UserAvatarComponent } from './user-avatar.component';

describe('UserAvatarComponent', () => {
  let fixture: ComponentFixture<UserAvatarComponent>;
  let element: HTMLElement;
  const ada: AvatarUser = { id: 'user-1', firstName: 'Ada', lastName: 'Lovelace', username: 'ada', avatarVersion: null };

  function render(user: AvatarUser | Person, size?: number): void {
    fixture.componentRef.setInput('user', user);
    if (size) fixture.componentRef.setInput('size', size);
    fixture.detectChanges();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(UserAvatarComponent);
    element = fixture.nativeElement as HTMLElement;
  });

  describe('with a person known by name', () => {
    const person: Person = { id: 'user-9', name: 'Bob Martin', initials: 'BM', color: '#112233' };

    it('uses their own initials and colour without a picture', () => {
      render(person);

      expect(element.textContent?.trim()).toBe('BM');
      expect(getComputedStyle(element).backgroundColor).toBe('rgb(17, 34, 51)');
      expect(element.querySelector('img')).toBeNull();
    });

    it('shows their picture when they have one', () => {
      render({ ...person, avatarVersion: 123 });

      expect(element.querySelector('img')?.getAttribute('src')).toBe('/api/v1/users/user-9/avatar?v=123');
      expect(element.textContent?.trim()).toBe('');
    });

    it('treats a person without the information as having no picture', () => {
      render({ ...person, avatarVersion: undefined });
      expect(element.querySelector('img')).toBeNull();

      render({ ...person, avatarVersion: null });
      expect(element.querySelector('img')).toBeNull();
    });
  });

  it('leaves its size to what surrounds it when asked to', () => {
    fixture.componentRef.setInput('size', null);
    fixture.componentRef.setInput('user', ada);
    element.parentElement?.style.setProperty('--avatar-size', '50px');
    fixture.detectChanges();

    expect(element.style.getPropertyValue('--avatar-size')).toBe('');
    expect(element.getBoundingClientRect().width).toBe(50);
    element.parentElement?.style.removeProperty('--avatar-size');
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
