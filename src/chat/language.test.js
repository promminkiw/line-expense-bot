import { describe, it, expect, vi } from 'vitest';
import { parseLanguageCommand, buildLanguageQuickReply, createLanguageHandlers, LANGUAGE_ACTION } from './language.js';

describe('parseLanguageCommand', () => {
  it.each(['ภาษา', 'language', 'เปลี่ยนภาษา', 'change language', 'Language', '  CHANGE   Language  '])(
    'treats %j as the language menu',
    (text) => {
      expect(parseLanguageCommand(text)).toBe('menu');
    }
  );

  it.each([
    ['English', 'en'],
    ['english', 'en'],
    [' ENGLISH ', 'en'],
    ['ภาษาไทย', 'th'],
    [' ภาษาไทย ', 'th'],
  ])('switches directly for %j', (text, lang) => {
    expect(parseLanguageCommand(text)).toBe(lang);
  });

  it.each(['ภาษาอังกฤษ', 'language please', 'ค่าภาษา 500', 'english tutor 300', '', 'ภาษาไทย 100'])(
    'ignores %j',
    (text) => {
      expect(parseLanguageCommand(text)).toBeNull();
    }
  );
});

describe('buildLanguageQuickReply', () => {
  it('offers two postback buttons labelled with each language name', () => {
    expect(buildLanguageQuickReply()).toEqual([
      { type: 'action', action: { type: 'postback', label: 'ภาษาไทย', data: 'action=language&lang=th', displayText: 'ภาษาไทย' } },
      { type: 'action', action: { type: 'postback', label: 'English', data: 'action=language&lang=en', displayText: 'English' } },
    ]);
    expect(LANGUAGE_ACTION).toBe('language');
  });
});

function setup({ setUserLanguage = vi.fn().mockResolvedValue() } = {}) {
  const deps = {
    repository: { setUserLanguage },
    users: { ensureUser: vi.fn().mockResolvedValue('user-1') },
    logger: { error: vi.fn(), info: vi.fn() },
  };
  return { deps, handlers: createLanguageHandlers(deps) };
}

describe('language handlers', () => {
  it('shows the prompt in the current language', () => {
    const { handlers } = setup();

    expect(handlers.buildMenuReply('th')).toEqual({
      text: 'เลือกภาษาที่อยากให้เฮียใช้',
      quickReply: buildLanguageQuickReply(),
    });
    expect(handlers.buildMenuReply('en')).toEqual({
      text: 'Pick the language you want me to use',
      quickReply: buildLanguageQuickReply(),
    });
  });

  it('saves the language and confirms in the new language', async () => {
    const { deps, handlers } = setup();

    const reply = await handlers.switchLanguage('user-1', 'en', 'th');

    expect(deps.repository.setUserLanguage).toHaveBeenCalledWith('user-1', 'en');
    expect(reply).toEqual({ text: 'Switched to English. The web app uses English too.' });
    expect(await handlers.switchLanguage('user-1', 'th', 'en')).toEqual({
      text: 'เฮียเปลี่ยนเป็นภาษาไทยแล้ว หน้าเว็บก็ใช้ภาษาไทยด้วย',
    });
  });

  it('replies with a failure in the current language and logs when saving throws', async () => {
    const { deps, handlers } = setup({ setUserLanguage: vi.fn().mockRejectedValue(new Error('db down')) });

    const thReply = await handlers.switchLanguage('user-1', 'en', 'th');
    const enReply = await handlers.switchLanguage('user-1', 'th', 'en');

    expect(thReply).toEqual({ text: 'เฮียเปลี่ยนภาษาไม่สำเร็จ ลองใหม่อีกครั้ง' });
    expect(enReply).toEqual({ text: "Couldn't switch the language. Try again in a bit." });
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to change language', { userId: 'user-1', language: 'en' }, expect.any(Error));
  });

  it('handles a language postback from the sender and ignores unknown languages', async () => {
    const { deps, handlers } = setup();

    expect(await handlers.handlePostback(new URLSearchParams('action=language&lang=en'), 'U1', 'th')).toEqual({
      text: 'Switched to English. The web app uses English too.',
    });
    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1');

    deps.repository.setUserLanguage.mockClear();
    for (const query of ['action=language&lang=fr', 'action=language', 'action=language&lang=EN']) {
      expect(await handlers.handlePostback(new URLSearchParams(query), 'U1', 'th')).toBeNull();
    }
    expect(deps.repository.setUserLanguage).not.toHaveBeenCalled();
  });
});
