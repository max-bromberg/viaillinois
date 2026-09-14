import { apiFetch } from './base.js';

/**
 * The forecast for a lobby screen.
 *
 * The screens read it through the platform rather than calling a weather
 * service themselves, so one answer is shared by every screen and a display
 * needs no outbound access of its own.
 */
export function getKioskWeather() {
  return apiFetch('/api/v1/kiosk/weather');
}
