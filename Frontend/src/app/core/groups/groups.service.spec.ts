import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiCredentialsInterceptor } from '../http/api-credentials.interceptor';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  let service: GroupsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // Credentials are added by the interceptor, as in the real app config.
        provideHttpClient(withInterceptors([apiCredentialsInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(GroupsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the current user group with credentials', () => {
    service.getMine().subscribe((group) => expect(group).toBeNull());

    const request = http.expectOne('/api/v1/groups/me');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush(null);
  });

  it('creates a group with credentials', () => {
    service.create({ name: 'Les Explorateurs' }).subscribe();

    const request = http.expectOne('/api/v1/groups');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Les Explorateurs' });
    expect(request.request.withCredentials).toBe(true);
    request.flush({
      id: 'group-1',
      name: 'Les Explorateurs',
      inviteCode: 'ABC12345',
      role: 'owner',
      createdAt: '2030-01-01T00:00:00.000Z',
      members: [],
    });
  });

  it('calls every group lifecycle endpoint with credentials', () => {
    service.join({ inviteCode: 'ABC12345' }).subscribe();
    let request = http.expectOne('/api/v1/groups/join');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ inviteCode: 'ABC12345' });
    expect(request.request.withCredentials).toBe(true);
    request.flush({ members: [] });

    service.update('Nouveau nom').subscribe();
    request = http.expectOne('/api/v1/groups/me');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'Nouveau nom' });
    request.flush({ members: [] });

    service.rotateInviteCode().subscribe();
    request = http.expectOne('/api/v1/groups/me/invite-code');
    expect(request.request.method).toBe('POST');
    request.flush({ members: [] });

    service.transferOwnership('user-2').subscribe();
    request = http.expectOne('/api/v1/groups/me/owner');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ userId: 'user-2' });
    request.flush({ members: [] });

    service.removeMember('user-2').subscribe();
    request = http.expectOne('/api/v1/groups/me/members/user-2');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    service.leave().subscribe();
    request = http.expectOne('/api/v1/groups/me/leave');
    expect(request.request.method).toBe('POST');
    request.flush(null);

    service.delete().subscribe();
    request = http.expectOne('/api/v1/groups/me');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });
});
