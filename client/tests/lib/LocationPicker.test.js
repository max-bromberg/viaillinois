import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const searchVenues = vi.fn();
vi.mock('../../src/api/venues.js', () => ({ searchVenues: (...args) => searchVenues(...args) }));

const LocationPicker = (await import('../../src/lib/LocationPicker.svelte')).default;

const ROOMS = [
  { location_id: 1, building: 'Electrical & Computer Eng Bldg', room_number: '1002', max_capacity: 240 },
  { location_id: 2, building: 'Electrical & Computer Eng Bldg', room_number: '1013', max_capacity: 120 },
];

async function type(getByLabelText, value) {
  const input = getByLabelText(/location/i);
  await fireEvent.input(input, { target: { value } });
  return input;
}

describe('LocationPicker', () => {
  beforeEach(() => {
    searchVenues.mockReset();
    searchVenues.mockResolvedValue({ locations: ROOMS });
  });

  it('searches for what was typed', async () => {
    const { getByLabelText } = render(LocationPicker, { debounceMs: 0 });
    await type(getByLabelText, 'ECEB');
    await waitFor(() => expect(searchVenues).toHaveBeenCalledWith('ECEB'));
  });

  it('does not search for an empty term', async () => {
    const { getByLabelText } = render(LocationPicker, { debounceMs: 0 });
    await type(getByLabelText, '   ');
    await new Promise(r => setTimeout(r, 20));
    expect(searchVenues).not.toHaveBeenCalled();
  });

  it('lists the matching rooms', async () => {
    const { getByLabelText, findByText } = render(LocationPicker, { debounceMs: 0 });
    await type(getByLabelText, 'ECEB');
    expect(await findByText(/Electrical & Computer Eng Bldg 1002/)).toBeTruthy();
  });

  it('reports the room that was chosen', async () => {
    const changes = [];
    const { getByLabelText, findByText } = render(LocationPicker, {
      debounceMs: 0,
      onChange: choice => changes.push(choice),
    });

    await type(getByLabelText, 'ECEB');
    await fireEvent.click(await findByText(/Electrical & Computer Eng Bldg 1002/));

    expect(changes.at(-1)).toEqual({
      location_id: 1,
      location_text: null,
      label: 'Electrical & Computer Eng Bldg 1002',
    });
  });

  /**
   * The whole point of the change: a location that is not a room at all has to
   * be expressible, because plenty of events are not in one.
   */
  it('reports free text when the typed term is used as written', async () => {
    searchVenues.mockResolvedValue({ locations: [] });
    const changes = [];
    const { getByLabelText, findByText } = render(LocationPicker, {
      debounceMs: 0,
      onChange: choice => changes.push(choice),
    });

    await type(getByLabelText, 'Zoom');
    await fireEvent.click(await findByText(/Use "Zoom" as the location/));

    expect(changes.at(-1)).toEqual({ location_id: null, location_text: 'Zoom', label: 'Zoom' });
  });

  /**
   * The reason the feature exists is locations that are not rooms, so using
   * what was typed must never depend on a search having come back. It has to
   * be there while the search is still in flight and when the search fails.
   */
  it('offers the typed text before any search has returned', async () => {
    searchVenues.mockImplementation(() => new Promise(() => {}));
    const { getByLabelText, findByText } = render(LocationPicker, { debounceMs: 0 });
    await type(getByLabelText, 'Zoom');
    expect(await findByText(/Use "Zoom" as the location/)).toBeTruthy();
  });

  it('offers the typed text even when the search fails', async () => {
    searchVenues.mockRejectedValue(new Error('network is down'));
    const changes = [];
    const { getByLabelText, findByText } = render(LocationPicker, {
      debounceMs: 0,
      onChange: choice => changes.push(choice),
    });
    await type(getByLabelText, 'Zoom');
    await fireEvent.click(await findByText(/Use "Zoom" as the location/));
    expect(changes.at(-1)).toEqual({ location_id: null, location_text: 'Zoom', label: 'Zoom' });
  });

  it('says so when nothing matched, rather than looking broken', async () => {
    searchVenues.mockResolvedValue({ locations: [] });
    const { getByLabelText, findByText } = render(LocationPicker, { debounceMs: 0 });
    await type(getByLabelText, 'krannert');
    expect(await findByText(/No room matches/)).toBeTruthy();
  });

  it('clears a chosen location back to nothing', async () => {
    const changes = [];
    const { getByLabelText, findByText, getByText } = render(LocationPicker, {
      debounceMs: 0,
      onChange: choice => changes.push(choice),
    });

    await type(getByLabelText, 'ECEB');
    await fireEvent.click(await findByText(/Electrical & Computer Eng Bldg 1002/));
    await fireEvent.click(getByText(/clear/i));

    expect(changes.at(-1)).toEqual({ location_id: null, location_text: null, label: '' });
  });

  it('shows a location it was given to start with', () => {
    const { getByText } = render(LocationPicker, { initialLabel: 'Everitt Laboratory 2310' });
    expect(getByText(/Everitt Laboratory 2310/)).toBeTruthy();
  });
});
