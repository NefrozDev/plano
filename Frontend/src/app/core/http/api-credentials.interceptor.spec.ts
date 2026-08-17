import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { apiCredentialsInterceptor } from './api-credentials.interceptor';

describe('apiCredentialsInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiCredentialsInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('adds credentials to relative API requests', () => {
    client.get('/api/v1/tasks').subscribe();

    const request = http.expectOne('/api/v1/tasks');
    expect(request.request.withCredentials).toBeTrue();
    request.flush({});
  });

  it('does not add credentials to an unrelated absolute URL', () => {
    client.get('https://example.test/public').subscribe();

    const request = http.expectOne('https://example.test/public');
    expect(request.request.withCredentials).toBeFalse();
    request.flush({});
  });
});
