import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { httpErrorMessage, serverErrorCode } from './http-error-message';

describe('httpErrorMessage', () => {
  const response = (status: number, body?: unknown): HttpErrorResponse =>
    new HttpErrorResponse({ status, error: body ?? null });

  beforeEach(() => TestBed.inject(TranslocoService));

  it('reads only error codes this app knows', () => {
    expect(serverErrorCode(response(409, { message: 'You are already friends.', errorCode: 'friends.alreadyFriends' }))).toBe(
      'friends.alreadyFriends',
    );
    expect(serverErrorCode(response(409, { errorCode: 'friends.unknownThing' }))).toBeNull();
    expect(serverErrorCode(response(400, { message: 'name must not be blank' }))).toBeNull();
    expect(serverErrorCode(response(500))).toBeNull();
  });

  it('applies the rules in order: unexpected, network, status, server code, fallback', () => {
    const messages = {
      fallback: 'Échec.',
      unexpected: 'Bug.',
      byStatus: { 401: 'Identifiants incorrects.' },
      useServerCode: true,
    };

    expect(httpErrorMessage(new Error('boom'), messages)).toBe('Bug.');
    expect(httpErrorMessage(response(0), messages)).toBe('Impossible de joindre Plano. Vérifiez votre connexion.');
    expect(httpErrorMessage(response(401, { errorCode: 'groups.notFound' }), messages)).toBe('Identifiants incorrects.');
    expect(httpErrorMessage(response(409, { errorCode: 'groups.alreadyMember' }), messages)).toBe(
      'Vous faites déjà partie de ce groupe.',
    );
    expect(httpErrorMessage(response(400, { message: ['name must not be blank'] }), messages)).toBe('Échec.');
    expect(httpErrorMessage(response(500), messages)).toBe('Échec.');
  });

  it('falls back for non-HTTP errors and ignores server codes unless asked', () => {
    expect(httpErrorMessage('oops', { fallback: 'Échec.' })).toBe('Échec.');
    expect(httpErrorMessage(response(409, { errorCode: 'groups.alreadyMember' }), { fallback: 'Échec.' })).toBe('Échec.');
  });
});
