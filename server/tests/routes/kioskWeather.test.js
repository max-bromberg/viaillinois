import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const readWeather = vi.hoisted(() => vi.fn());
vi.mock('../../services/weather.js', () => ({ readWeather, resetWeatherCache: vi.fn() }));

const app = (await import('../../app.js')).default;

const FORECAST = {
  source: 'National Weather Service',
  station: 'KCMI',
  now: { temperature: 73, summary: 'Clear' },
  days: [{ name: 'Today', temperature: 74, summary: 'Sunny' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  readWeather.mockResolvedValue(FORECAST);
});

/**
 * The lobby screen reads the forecast through the platform rather than calling
 * a weather service itself. One answer is then shared by every screen, the
 * screens need no outbound access of their own, and whichever source answered
 * is a detail the screen never has to know.
 */
describe('GET /api/v1/kiosk/weather', () => {
  it('answers the forecast', async () => {
    const res = await request(app).get('/api/v1/kiosk/weather').expect(200);
    expect(res.body.weather.now.temperature).toBe(73);
    expect(res.body.weather.days).toHaveLength(1);
  });

  it('may be held at the edge, because it is the same for everybody', async () => {
    const res = await request(app).get('/api/v1/kiosk/weather').expect(200);
    expect(res.headers['cache-control']).toMatch(/public/);
  });

  /**
   * A forecast nobody could fetch is not an error on the screen's part. It
   * answers 200 with nothing, and the slide leaves the forecast out.
   */
  it('answers with nothing rather than failing when no source could be read', async () => {
    readWeather.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/kiosk/weather').expect(200);
    expect(res.body.weather).toBe(null);
  });

  it('does not fail the screen when reading the forecast throws', async () => {
    readWeather.mockRejectedValue(new Error('the service is on fire'));
    const res = await request(app).get('/api/v1/kiosk/weather').expect(200);
    expect(res.body.weather).toBe(null);
  });
});
