import { HttpErrorResponse } from '@angular/common/http';
import { NETWORK_ERROR_MESSAGE, httpErrorMessage, serverMessage } from './http-error-message';

describe('httpErrorMessage', () => {
  const response = (status: number, message?: unknown): HttpErrorResponse =>
    new HttpErrorResponse({ status, error: message === undefined ? null : { message } });

  it('reads string and array server messages, and ignores anything else', () => {
    expect(serverMessage(response(400, 'Nom requis.'))).toBe('Nom requis.');
    expect(serverMessage(response(400, ['Nom requis.', 'Code invalide.']))).toBe('Nom requis. Code invalide.');
    expect(serverMessage(response(400, 42))).toBe('');
    expect(serverMessage(response(500))).toBe('');
  });

  it('applies the rules in order: unexpected, network, status, server, fallback', () => {
    const messages = {
      fallback: 'Échec.',
      unexpected: 'Bug.',
      byStatus: { 401: 'Identifiants incorrects.' },
      useServerMessage: true,
    };

    expect(httpErrorMessage(new Error('boom'), messages)).toBe('Bug.');
    expect(httpErrorMessage(response(0), messages)).toBe(NETWORK_ERROR_MESSAGE);
    expect(httpErrorMessage(response(401, 'Unauthorized'), messages)).toBe('Identifiants incorrects.');
    expect(httpErrorMessage(response(409, 'Déjà membre.'), messages)).toBe('Déjà membre.');
    expect(httpErrorMessage(response(500), messages)).toBe('Échec.');
  });

  it('falls back for non-HTTP errors and ignores server messages unless asked', () => {
    expect(httpErrorMessage('oops', { fallback: 'Échec.' })).toBe('Échec.');
    expect(httpErrorMessage(response(409, 'Déjà membre.'), { fallback: 'Échec.' })).toBe('Échec.');
  });
});
