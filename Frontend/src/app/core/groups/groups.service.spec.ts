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

  it('loads every group of the user, or one by id, with credentials', () => {
    const loaded: unknown[] = [];
    service.getAll().subscribe((groups) => loaded.push(groups));
    service.get('group-1').subscribe((group) => loaded.push(group));

    const all = http.expectOne('/api/v1/groups');
    expect(all.request.method).toBe('GET');
    expect(all.request.withCredentials).toBe(true);
    all.flush([]);
    const one = http.expectOne('/api/v1/groups/group-1');
    expect(one.request.method).toBe('GET');
    expect(one.request.withCredentials).toBe(true);
    one.flush({ id: 'group-1', members: [] });

    expect(loaded).toEqual([[], { id: 'group-1', members: [] }]);
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

    service.update('group-1', 'Nouveau nom').subscribe();
    request = http.expectOne('/api/v1/groups/group-1');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'Nouveau nom' });
    request.flush({ members: [] });

    service.rotateInviteCode('group-1').subscribe();
    request = http.expectOne('/api/v1/groups/group-1/invite-code');
    expect(request.request.method).toBe('POST');
    request.flush({ members: [] });

    service.transferOwnership('group-1', 'user-2').subscribe();
    request = http.expectOne('/api/v1/groups/group-1/owner');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ userId: 'user-2' });
    request.flush({ members: [] });

    service.removeMember('group-1', 'user-2').subscribe();
    request = http.expectOne('/api/v1/groups/group-1/members/user-2');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    service.leave('group-1').subscribe();
    request = http.expectOne('/api/v1/groups/group-1/leave');
    expect(request.request.method).toBe('POST');
    request.flush(null);

    service.delete('group-1').subscribe();
    request = http.expectOne('/api/v1/groups/group-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });
});
