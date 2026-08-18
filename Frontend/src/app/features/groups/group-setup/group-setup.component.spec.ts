import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { GroupsService } from '../../../core/groups/groups.service';
import { GroupSetupComponent } from './group-setup.component';

describe('GroupSetupComponent', () => {
  let groups: jasmine.SpyObj<GroupsService>;
  let component: GroupSetupComponent;
  let router: Router;
  const group = {
    id: 'group-1',
    name: 'Les Explorateurs',
    inviteCode: 'ABC12345',
    role: 'owner' as const,
    createdAt: '2030-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    groups = jasmine.createSpyObj<GroupsService>('GroupsService', ['create']);
    groups.create.and.returnValue(of(group));
    await TestBed.configureTestingModule({
      imports: [GroupSetupComponent],
      providers: [
        provideRouter([]),
        { provide: GroupsService, useValue: groups },
      ],
    }).compileComponents();
    component = TestBed.createComponent(GroupSetupComponent).componentInstance;
    router = TestBed.inject(Router);
  });

  it('opens and closes the group form', () => {
    component.openCreateForm();
    expect(component.showCreateForm()).toBeTrue();
    component.submissionError.set('Erreur');
    component.closeCreateForm();
    expect(component.showCreateForm()).toBeFalse();
    expect(component.submissionError()).toBe('');
  });

  it('validates the name before creating a group', () => {
    component.openCreateForm();
    component.form.controls.name.setValue(' ');
    component.submit();
    expect(groups.create).not.toHaveBeenCalled();
    expect(component.form.controls.name.touched).toBeTrue();
  });

  it('trims, creates, and navigates home', () => {
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    component.form.controls.name.setValue('  Les Explorateurs  ');
    component.submit();
    expect(groups.create).toHaveBeenCalledOnceWith({
      name: 'Les Explorateurs',
    });
    expect(navigate).toHaveBeenCalledOnceWith('/');
  });

  it('does not submit twice and supports skip and join information', () => {
    const navigate = spyOn(router, 'navigateByUrl').and.resolveTo(true);
    component.form.controls.name.setValue('Mon groupe');
    component.submitting.set(true);
    component.submit();
    expect(groups.create).not.toHaveBeenCalled();
    component.showJoinInfo();
    expect(component.joinMessage()).toContain('bientôt');
    component.skip();
    expect(navigate).toHaveBeenCalledOnceWith('/');
  });

  it('maps conflict, offline, and generic creation failures', () => {
    component.form.controls.name.setValue('Mon groupe');
    groups.create.and.returnValues(
      throwError(() => new HttpErrorResponse({ status: 409 })),
      throwError(() => new HttpErrorResponse({ status: 0 })),
      throwError(() => new Error('boom')),
    );
    component.submit();
    expect(component.submissionError()).toContain('déjà');
    component.submit();
    expect(component.submissionError()).toContain('Impossible');
    component.submit();
    expect(component.submissionError()).toContain('a échoué');
  });
});
