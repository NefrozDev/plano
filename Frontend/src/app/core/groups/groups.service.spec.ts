import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  let service: GroupsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GroupsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the current user group with credentials', () => {
    service.getMine().subscribe((group) => expect(group).toBeNull());

    const request = http.expectOne('/api/v1/groups/me');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBeTrue();
    request.flush(null);
  });

  it('creates a group with credentials', () => {
    service.create({ name: 'Les Explorateurs' }).subscribe();

    const request = http.expectOne('/api/v1/groups');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Les Explorateurs' });
    expect(request.request.withCredentials).toBeTrue();
    request.flush({
      id: 'group-1',
      name: 'Les Explorateurs',
      inviteCode: 'ABC12345',
      role: 'owner',
      createdAt: '2030-01-01T00:00:00.000Z',
    });
  });
});
