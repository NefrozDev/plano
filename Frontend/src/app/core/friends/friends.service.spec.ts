import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { providePlanoTesting } from '../../testing/plano-testing';
import { FriendsService } from './friends.service';

describe('FriendsService', () => {
  let friends: FriendsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: providePlanoTesting() });
    friends = TestBed.inject(FriendsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads friends, requests and contacts', () => {
    friends.list().subscribe();
    friends.requests().subscribe();
    friends.contacts().subscribe();

    for (const url of ['/api/v1/friends', '/api/v1/friends/requests', '/api/v1/contacts']) {
      const request = http.expectOne(url);
      expect(request.request.method).toBe('GET');
      request.flush([]);
    }
  });

  it('searches with the trimmed query as a URL parameter', () => {
    friends.search('  bo ').subscribe();

    const request = http.expectOne((candidate) => candidate.url === '/api/v1/friends/search');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('q')).toBe('bo');
    expect(request.request.urlWithParams).toBe('/api/v1/friends/search?q=bo');
    request.flush([]);
  });

  it('sends, accepts and removes requests, and removes friends', () => {
    friends.sendRequest('user-2').subscribe();
    let request = http.expectOne('/api/v1/friends/requests');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ userId: 'user-2' });
    request.flush({ status: 'pending' });

    friends.accept('request-1').subscribe();
    request = http.expectOne('/api/v1/friends/requests/request-1/accept');
    expect(request.request.method).toBe('POST');
    request.flush({});

    friends.removeRequest('request-1').subscribe();
    request = http.expectOne('/api/v1/friends/requests/request-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    friends.removeFriend('user-2').subscribe();
    request = http.expectOne('/api/v1/friends/user-2');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });
});
