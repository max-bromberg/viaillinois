/**
 * The forecast on the lobby screen.
 *
 * The screen runs unattended in a building and nobody is standing next to it to
 * reload anything, so every failure here is answered with nothing rather than
 * with an error: a slide missing its forecast is a slide, and a slide that
 * throws is a blank screen in a lobby.
 *
 * Two sources. The first is the National Weather Service, and the station it
 * reads is the university's own. KCMI is the identifier for Willard Airport,
 * which the University of Illinois owns and operates, so the reading comes from
 * the instrument closest to the people looking at the screen. It needs no key
 * and no account, and it asks callers to identify themselves in a User-Agent,
 * which is the whole of its terms.
 *
 * The second is Open-Meteo, used only when the first cannot be reached. It also
 * needs no key. Two sources rather than one because a lobby screen that says
 * nothing about the weather for a week because a government service had an
 * afternoon is worse than a screen that quietly reads the other one.
 *
 * One answer is cached and shared by every screen, so a hundred displays in a
 * hundred buildings would still be one request every quarter of an hour.
 */

/** Willard Airport, which the university owns. The nearest station to campus. */
export const NWS_STATION = 'KCMI';

/** The middle of the engineering campus in Urbana, for the gridded forecast. */
export const NWS_POINT = { latitude: 40.1121, longitude: -88.2272 };

/**
 * The National Weather Service asks that a caller identify itself and offer a
 * way to be contacted, in place of an API key. This is that.
 */
const USER_AGENT = '(viaillinois.com, hello@viaillinois.com)';

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_MS = parseInt(process.env.WEATHER_CACHE_MS || '900000', 10);
/** A failure is held briefly, so an outage is not retried on every slide. */
const FAILURE_CACHE_MS = parseInt(process.env.WEATHER_FAILURE_CACHE_MS || '60000', 10);

/** How many days the rail has room for. */
const DAYS = 3;

let cached = null;
let cachedAt = 0;

/** Everything held, dropped. For tests and for the shutdown path. */
export function resetWeatherCache() {
  cached = null;
  cachedAt = 0;
  forecastAddress = null;
  // A read already in the air would otherwise be handed to the next caller as
  // though it were fresh, which is the one thing a reset is for undoing.
  inFlight = null;
}

async function getJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const round = value => (Number.isFinite(value) ? Math.round(value) : null);

/** Celsius arrives from the observation, and the screen is read in Fahrenheit. */
function toFahrenheit(value, unitCode) {
  if (!Number.isFinite(value)) return null;
  return String(unitCode).includes('degC') ? value * 9 / 5 + 32 : value;
}

async function fromNationalWeatherService() {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' };

  const observation = await getJson(
    `https://api.weather.gov/stations/${NWS_STATION}/observations/latest`,
    headers,
  );
  const temperature = round(toFahrenheit(
    observation?.properties?.temperature?.value,
    observation?.properties?.temperature?.unitCode,
  ));

  const forecast = await getJson(await forecastUrl(headers), headers);
  const periods = forecast?.properties?.periods ?? [];

  return {
    source: 'National Weather Service',
    station: NWS_STATION,
    now: {
      temperature,
      summary: observation?.properties?.textDescription || periods[0]?.shortForecast || '',
    },
    days: periods
      .filter(period => period.isDaytime)
      .slice(0, DAYS)
      .map(period => ({
        name: period.name,
        temperature: round(period.temperature),
        summary: period.shortForecast ?? '',
      })),
  };
}

/**
 * Where the service says to ask for this point's forecast.
 *
 * The service resolves a point to an office and a grid square, and it publishes
 * that mapping rather than documenting it, so writing the square down here
 * would be writing down a guess: wrong, it would fail every read and the screen
 * would quietly show the fallback source forever. It is asked once and kept for
 * the life of the process, because the answer for a fixed point does not change.
 */
let forecastAddress = null;

async function forecastUrl(headers) {
  if (forecastAddress) return forecastAddress;
  const point = await getJson(
    `https://api.weather.gov/points/${NWS_POINT.latitude},${NWS_POINT.longitude}`,
    headers,
  );
  const url = point?.properties?.forecast;
  if (!url) throw new Error('the point lookup named no forecast');
  forecastAddress = url;
  return forecastAddress;
}

/** What each Open-Meteo code means, in the words the screen uses. */
const OPEN_METEO_CODES = new Map([
  [0, 'Clear'], [1, 'Mostly clear'], [2, 'Partly cloudy'], [3, 'Overcast'],
  [45, 'Fog'], [48, 'Freezing fog'],
  [51, 'Light drizzle'], [53, 'Drizzle'], [55, 'Heavy drizzle'],
  [61, 'Light rain'], [63, 'Rain'], [65, 'Heavy rain'],
  [66, 'Freezing rain'], [67, 'Freezing rain'],
  [71, 'Light snow'], [73, 'Snow'], [75, 'Heavy snow'], [77, 'Snow grains'],
  [80, 'Showers'], [81, 'Showers'], [82, 'Heavy showers'],
  [85, 'Snow showers'], [86, 'Snow showers'],
  [95, 'Thunderstorms'], [96, 'Thunderstorms'], [99, 'Thunderstorms'],
]);

const said = code => OPEN_METEO_CODES.get(Number(code)) ?? '';

/** The day of the week a date falls on, which is what the rail shows. */
function dayName(day) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
}

async function fromOpenMeteo() {
  const params = new URLSearchParams({
    latitude: String(NWS_POINT.latitude),
    longitude: String(NWS_POINT.longitude),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: 'fahrenheit',
    timezone: 'America/Chicago',
    forecast_days: String(DAYS),
  });
  const body = await getJson(`https://api.open-meteo.com/v1/forecast?${params}`);

  const daily = body?.daily ?? {};
  const days = (daily.time ?? []).slice(0, DAYS).map((day, at) => ({
    name: dayName(day),
    temperature: round(daily.temperature_2m_max?.[at]),
    low: round(daily.temperature_2m_min?.[at]),
    summary: said(daily.weather_code?.[at]),
  }));

  return {
    source: 'Open-Meteo',
    station: null,
    now: {
      temperature: round(body?.current?.temperature_2m),
      summary: said(body?.current?.weather_code),
    },
    days,
  };
}

/**
 * Whether a source actually answered.
 *
 * A source can return a well formed body with nothing in it: the National
 * Weather Service publishes an observation with a null temperature often
 * enough to be expected, and its gridpoint forecast can carry no periods at
 * all. Neither throws, so without this the first source was accepted, the
 * second was never asked, and the screen drew a degree sign with no number in
 * front of it while a working source sat unused.
 */
function hasReading(weather) {
  return Number.isFinite(weather?.now?.temperature);
}

/**
 * The read that is happening right now, if one is.
 *
 * Every screen on campus asks this platform rather than asking a weather
 * service, so that a hundred screens are one request. The hold was written
 * after the round trip, which made that true only for callers arriving after
 * the first had finished: everybody inside the window started a round trip of
 * their own, and the multiplier was their concurrency rather than one. The
 * endpoint is unauthenticated and outside the public budget, so this is the one
 * place a stranger could turn a burst into a burst against somebody else.
 */
let inFlight = null;

/** Ask each source in turn, and take the first that answers with a reading. */
async function readFromSources() {
  for (const [name, read] of [
    ['the National Weather Service', fromNationalWeatherService],
    ['Open-Meteo', fromOpenMeteo],
  ]) {
    try {
      const weather = await read();
      if (hasReading(weather)) return weather;
      console.warn(`weather: ${name} answered with no reading in it`);
    } catch (err) {
      console.warn(`weather: ${name} could not be read (${err.message})`);
    }
  }
  return null;
}

/**
 * The forecast, or nothing.
 *
 * Nothing is a legitimate answer and the only one a caller has to handle: the
 * screen leaves the forecast out of the slide and carries on.
 */
export async function readWeather() {
  const age = Date.now() - cachedAt;
  if (cached !== null && age < CACHE_MS) return cached;
  if (cached === null && cachedAt !== 0 && age < FAILURE_CACHE_MS) return null;
  if (inFlight) return inFlight;

  inFlight = readFromSources()
    .then(weather => {
      cached = weather;
      cachedAt = Date.now();
      return weather;
    })
    .finally(() => { inFlight = null; });

  return inFlight;
}
