import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  readWeather, resetWeatherCache, NWS_STATION, NWS_POINT,
} = await import('../../services/weather.js');

/**
 * The forecast on the lobby screen.
 *
 * The screen runs unattended in a building, so nothing here is allowed to leave
 * it blank for long or to hold up the rest of the slide. Two sources, the
 * second used only when the first cannot be reached, one cached answer shared
 * by every screen, and a failure that answers with nothing rather than throwing.
 *
 * The first source is the National Weather Service, and the station it reads is
 * the university's own: KCMI is the identifier for Willard Airport, which the
 * University of Illinois owns and operates. Asking it is asking the instrument
 * closest to the people looking at the screen.
 */
const nwsForecast = {
  properties: {
    periods: [
      { number: 1, name: 'This Afternoon', isDaytime: true, temperature: 74, temperatureUnit: 'F', shortForecast: 'Sunny' },
      { number: 2, name: 'Tonight', isDaytime: false, temperature: 55, temperatureUnit: 'F', shortForecast: 'Clear' },
      { number: 3, name: 'Tuesday', isDaytime: true, temperature: 78, temperatureUnit: 'F', shortForecast: 'Partly Sunny' },
    ],
  },
};

const nwsObservation = {
  properties: { temperature: { value: 22.5, unitCode: 'wmoUnit:degC' }, textDescription: 'Clear' },
};

const openMeteo = {
  current: { temperature_2m: 71.2, weather_code: 0 },
  daily: {
    time: ['2026-09-14', '2026-09-15'],
    weather_code: [1, 61],
    temperature_2m_max: [77.5, 68.1],
    temperature_2m_min: [54.2, 51.0],
  },
};

/** What the point lookup answers: where to ask for this point's forecast. */
const nwsPoint = {
  properties: { gridId: 'ILX', forecast: 'https://api.weather.gov/gridpoints/ILX/96,72/forecast' },
};

const jsonReply = body => ({ ok: true, status: 200, json: async () => body });
const failure = status => ({ ok: false, status, json: async () => ({}) });

beforeEach(() => {
  resetWeatherCache();
  vi.restoreAllMocks();
});

afterEach(() => resetWeatherCache());

describe('where the forecast comes from', () => {
  it('reads the university\'s own station first', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonReply(nwsObservation))
      .mockResolvedValueOnce(jsonReply(nwsPoint))
      .mockResolvedValueOnce(jsonReply(nwsForecast));
    vi.stubGlobal('fetch', fetchMock);

    const weather = await readWeather();

    expect(fetchMock.mock.calls[0][0]).toContain(NWS_STATION);
    expect(weather.source).toBe('National Weather Service');
    expect(weather.now.temperature).toBe(73);
  });

  it('names itself to the service it is asking, which that service requires', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonReply(nwsObservation))
      .mockResolvedValueOnce(jsonReply(nwsPoint))
      .mockResolvedValueOnce(jsonReply(nwsForecast));
    vi.stubGlobal('fetch', fetchMock);

    await readWeather();

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers['User-Agent']).toMatch(/viaillinois\.com/);
  });

  it('carries the days a lobby screen has room for', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonReply(nwsObservation))
      .mockResolvedValueOnce(jsonReply(nwsPoint))
      .mockResolvedValueOnce(jsonReply(nwsForecast)));

    const weather = await readWeather();

    expect(weather.days.length).toBeGreaterThan(0);
    expect(weather.days[0]).toMatchObject({ name: expect.any(String), temperature: expect.any(Number) });
  });
});

describe('when the first source cannot be reached', () => {
  it('falls back to the second rather than showing nothing', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(failure(503))
      .mockResolvedValueOnce(jsonReply(openMeteo));
    vi.stubGlobal('fetch', fetchMock);

    const weather = await readWeather();

    expect(weather.source).toBe('Open-Meteo');
    expect(weather.now.temperature).toBe(71);
    expect(weather.days[0].temperature).toBe(78);
  });

  it('falls back when the first source is unreachable rather than merely unhappy', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('getaddrinfo ENOTFOUND api.weather.gov'))
      .mockResolvedValueOnce(jsonReply(openMeteo));
    vi.stubGlobal('fetch', fetchMock);

    expect((await readWeather()).source).toBe('Open-Meteo');
  });

  it('answers with nothing rather than throwing when neither can be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('the network is gone')));
    await expect(readWeather()).resolves.toBe(null);
  });
});

describe('how often it asks', () => {
  it('asks once and shares the answer with every screen', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValue(jsonReply(nwsObservation))
      .mockResolvedValueOnce(jsonReply(nwsObservation))
      .mockResolvedValueOnce(jsonReply(nwsPoint))
      .mockResolvedValueOnce(jsonReply(nwsForecast));
    vi.stubGlobal('fetch', fetchMock);

    await readWeather();
    const calls = fetchMock.mock.calls.length;
    await readWeather();
    await readWeather();

    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('does not cache a failure for as long as it caches an answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect(await readWeather()).toBe(null);

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonReply(nwsObservation))
      .mockResolvedValueOnce(jsonReply(nwsPoint))
      .mockResolvedValueOnce(jsonReply(nwsForecast)));
    resetWeatherCache();
    expect((await readWeather())?.source).toBe('National Weather Service');
  });
});

describe('where it is asking about', () => {
  it('asks the service where to look rather than writing the grid square down', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonReply(nwsObservation))
      .mockResolvedValueOnce(jsonReply(nwsPoint))
      .mockResolvedValueOnce(jsonReply(nwsForecast));
    vi.stubGlobal('fetch', fetchMock);

    await readWeather();

    expect(fetchMock.mock.calls[1][0]).toContain('/points/');
    expect(fetchMock.mock.calls[2][0]).toBe(nwsPoint.properties.forecast);
  });

  it('is the campus rather than a default somewhere', () => {
    expect(NWS_POINT.latitude).toBeGreaterThan(40);
    expect(NWS_POINT.latitude).toBeLessThan(40.3);
    expect(NWS_POINT.longitude).toBeLessThan(-88);
    expect(NWS_POINT.longitude).toBeGreaterThan(-88.5);
  });
});
