import type { Locale } from '@plano/common';
import { SUPPORTED_LOCALES as LOCALES } from '../users/user.mapper';
import { passwordResetMail } from './password-reset.mail';

describe('passwordResetMail', () => {
  const details = {
    to: 'ada@example.com',
    name: 'Ada',
    link: 'https://plano.test/reset-password#token=abc',
    validMinutes: 30,
  };

  it('writes the link, its validity and a reassurance in every language', () => {
    const subjects = new Set<string>();
    for (const locale of LOCALES) {
      const mail = passwordResetMail({ ...details, locale });

      expect(mail.to).toBe('ada@example.com');
      expect(mail.text).toContain('Ada');
      expect(mail.text).toContain(details.link);
      expect(mail.text).toContain('30');
      subjects.add(mail.subject);
    }
    expect(subjects.size).toBe(LOCALES.length);
  });

  it('writes French for the source language and an unknown one', () => {
    const french = passwordResetMail({ ...details, locale: 'fr' });

    expect(french.subject).toBe('Réinitialiser votre mot de passe Plano');
    expect(french.text.split('\n')[0]).toBe('Bonjour Ada,');
    expect(
      passwordResetMail({ ...details, locale: 'xx' as Locale }).subject,
    ).toBe(french.subject);
  });
});
