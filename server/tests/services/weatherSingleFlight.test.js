import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readWeather, resetWeatherCache } from '../../services/weather.js';

/**
 * One answer, shared, however many screens ask at once.
 *
 * The module holds one forecast and hands it to everybody, which is the whole
 * reason the screens read the weather through the platform rather than calling
 * a weather service each. The hold was written after the round trip, so every
 * caller that arrived while the first was still waiting started a round trip of
 * its own. The kiosk endpoint is unauthenticated and is on the one prefix the
 * public API budget skips, so the multiplier is the caller's concurrency: a
 * burst of a few hundred becomes a few hundred requests to the National Weather
 * Service, from the university's own address, and the service rate limits by
 * address.
 *
 * A late answer also overwrote a fresh one. A slow read that fails lands after
 * a quick read that succeeded, and the failure it writes throws away a forecast
 * the module already had in hand.
 */
const observation = temperature => ({
  properties: { temperature: { value: temperature, unitCode: 'wmoUnit:degC' }, textDescription: 'Clear' },
});
const forecast = {
  properties: { periods: [{ name: 'Today', isDaytime: true, temperature: 64, shortForecast: 'Sunny' }] },
};
const point = { properties: { forecast: 'https://api.weather.gov/gridpoints/ILX/95,72/forecast' } };

/** A stubbed upstream that answers after a delay and records what was asked. */
function upstream({ delayMs = 10, answers }) {
  const asked = [];
  const fetcher = vi.fn(async (url) => {
    asked.push(String(url));
    await new Promise(resolve => setTimeout(resolve, delayMs));
    const answer = answers(String(url));
    if (answer === null) throw new Error('unreachable');
    return { ok: true, status: 200, json: async () => answer };
  });
  return { asked, fetcher };
}

const nationalWeatherService = url => {
  if (url.includes('/points/')) return point;
  if (url.includes('/observations/')) return observation(18);
  if (url.includes('/gridpoints/')) return forecast;
  return null;
};

beforeEach(() => { resetWeatherCache(); });
afterEach(() => { vi.unstubAllGlobals(); resetWeatherCache(); });

describe('reading the weather', () => {
  it('asks the upstream once however many callers arrive together', async () => {
    const { asked, fetcher } = upstream({ answers: nationalWeatherService });
    vi.stubGlobal('fetch', fetcher);

    const answers = await Promise.all(Array.from({ length: 25 }, () => readWeather()));

    expect(answers.every(one => one?.source === 'National Weather Service')).toBe(true);
    // The point lookup and the observation and the forecast, once each, rather
    // than once each per caller.
    expect(asked.filter(url => url.includes('/observations/'))).toHaveLength(1);
    expect(asked.filter(url => url.includes('/gridpoints/'))).toHaveLength(1);
  });

  it('hands every caller in the burst the same answer', async () => {
    const { fetcher } = upstream({ answers: nationalWeatherService });
    vi.stubGlobal('fetch', fetcher);

    const answers = await Promise.all(Array.from({ length: 5 }, () => readWeather()));
    expect(new Set(answers).size).toBe(1);
  });

  it('asks again once the answer it holds is old enough', async () => {
    const { asked, fetcher } = upstream({ answers: nationalWeatherService });
    vi.stubGlobal('fetch', fetcher);

    await readWeather();
    const first = asked.filter(url => url.includes('/observations/')).length;
    resetWeatherCache();
    await readWeather();
    expect(asked.filter(url => url.includes('/observations/')).length).toBe(first + 1);
  });

  /**
   * The screens run unattended, so every failure answers with nothing rather
   * than throwing: a slide missing its forecast is still a slide.
   */
  it('answers with nothing when no source can be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('unreachable'); }));
    expect(await readWeather()).toBe(null);
  });
});

/**
 * A source that answers without a reading has not answered.
 *
 * The National Weather Service returns a well formed observation with a null
 * temperature often enough that it has to be expected, and the gridpoint
 * forecast can come back with no periods at all. Neither throws, so the first
 * source was accepted, the second was never asked, and the lobby screen drew a
 * degree sign with no number in front of it for the next quarter of an hour
 * with a working source sitting unused.
 */
describe('a source that answers with no reading in it', () => {
  it('falls through to the second source rather than publishing a blank', async () => {
    const { asked, fetcher } = upstream({
      answers: url => {
        if (url.includes('api.weather.gov')) {
          if (url.includes('/points/')) return point;
          if (url.includes('/observations/')) return observation(null);
          return { properties: { periods: [] } };
        }
        return {
          current: { temperature_2m: 61, weather_code: 0 },
          daily: { time: ['2026-09-16'], temperature_2m_max: [64], temperature_2m_min: [48], weather_code: [0] },
        };
      },
    });
    vi.stubGlobal('fetch', fetcher);

    const weather = await readWeather();

    expect(weather?.source).toBe('Open-Meteo');
    expect(weather.now.temperature).toBe(61);
    expect(asked.some(url => url.includes('open-meteo'))).toBe(true);
  });

  it('answers with nothing when neither source has a reading', async () => {
    const { fetcher } = upstream({
      answers: url => {
        if (url.includes('/points/')) return point;
        if (url.includes('/observations/')) return observation(null);
        if (url.includes('api.weather.gov')) return { properties: { periods: [] } };
        return { current: {}, daily: {} };
      },
    });
    vi.stubGlobal('fetch', fetcher);

    expect(await readWeather()).toBe(null);
  });
});
