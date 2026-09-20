import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../services/denialRecorder.js', () => ({
  recordDenial: vi.fn(),
  startDenialRecorder: vi.fn(), stopDenialRecorder: vi.fn(),
  flushDenials: vi.fn(), bufferSize: () => 0, resetRecorder: vi.fn(),
}));

vi.mock('../../db/queries/outbox.ts', async () =>
  (await import('../support/outboxMock.js')).outboxMock());

const app = (await import('../../app.js')).default;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DISCORD_CLIENT_ID = '1055000000000000000';
});

/**
 * The two ways a person adds the VIA Discord bot, answered to anybody.
 *
 * A board adds it to a server, which is what puts an organization's events in
 * front of its members. Anybody at all adds it to their own Discord account,
 * which needs no server and no permission from anyone, and is what makes the
 * bot a way for one student to hear about events rather than a thing their
 * club happens to run.
 *
 * Both addresses are built from the application identifier, which is
 * configuration rather than a secret: it is in every install link the bot has
 * ever handed out. A deployment without a Discord application configured says
 * so rather than answering with an address that leads nowhere.
 */
describe('GET /api/v1/discord', () => {
  it('answers with both ways of adding the bot', async () => {
    const res = await request(app).get('/api/v1/discord');

    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.server_install_url).toContain('discord.com');
    expect(res.body.personal_install_url).toContain('discord.com');
  });

  /**
   * A personal install is the user installation context, which is what lets
   * somebody add the bot to their own account with no server involved.
   */
  it('asks for the personal install as a user installation', async () => {
    const res = await request(app).get('/api/v1/discord');
    expect(res.body.personal_install_url).toContain('integration_type=1');
  });

  /**
   * Adding the bot to a server is what needs the bot scope. A personal install
   * cannot ask for it, and asking anyway is how an install link starts failing
   * for everybody who is not a server manager.
   */
  it('asks a server install for the bot scope and the personal one for neither', async () => {
    const res = await request(app).get('/api/v1/discord');
    expect(decodeURIComponent(res.body.server_install_url)).toContain('bot');
    expect(decodeURIComponent(res.body.personal_install_url)).not.toContain('scope=bot');
  });

  it('answers anybody, because deciding to use it comes before signing in', async () => {
    const res = await request(app).get('/api/v1/discord');
    expect(res.status).toBe(200);
  });

  /** The same answer for everybody, so the edge may keep it. */
  it('may be kept by a shared cache, because it does not depend on who asks', async () => {
    const res = await request(app).get('/api/v1/discord');
    expect(res.headers['cache-control']).toContain('public');
  });

  it('says plainly when no Discord application is configured', async () => {
    delete process.env.DISCORD_CLIENT_ID;
    const res = await request(app).get('/api/v1/discord');

    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.personal_install_url).toBe(null);
  });
});
