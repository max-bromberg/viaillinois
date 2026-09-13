import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';

const getRsos = vi.hoisted(() => vi.fn());
const getRso = vi.hoisted(() => vi.fn());
const getPollStatus = vi.hoisted(() => vi.fn());
const getUnknownCodes = vi.hoisted(() => vi.fn());
const getAdminUsers = vi.hoisted(() => vi.fn());
const getAdminMidterms = vi.hoisted(() => vi.fn());
const showToast = vi.hoisted(() => vi.fn());

vi.mock('../../src/api/rsos.js', () => ({
  getRsos, getRso, createRso: vi.fn(), updateRso: vi.fn(), deleteRso: vi.fn(),
  addMember: vi.fn(), removeMember: vi.fn(),
}));
vi.mock('../../src/api/admin.js', () => ({
  getAdminUsers, createAdminUser: vi.fn(), updateAdminUser: vi.fn(),
  resetAdminPassword: vi.fn(), deleteAdminUser: vi.fn(),
  getPollStatus, getPollHistory: vi.fn().mockResolvedValue({ history: [] }),
  getUnknownCodes, triggerPoll: vi.fn(), getDenials: vi.fn().mockResolvedValue({ denials: [] }),
}));
vi.mock('../../src/api/midterms.js', () => ({
  getAdminMidterms, updateMidtermStatus: vi.fn(), deleteMidterm: vi.fn(),
}));
vi.mock('../../src/api/tags.js', () => ({ getTags: vi.fn().mockResolvedValue({ tags: [] }), createTag: vi.fn(), deleteTag: vi.fn() }));
vi.mock('../../src/api/bugReports.js', () => ({ getBugReports: vi.fn().mockResolvedValue({ reports: [] }), updateBugReport: vi.fn() }));
vi.mock('../../src/api/calendar.js', () => ({ importCalendar: vi.fn() }));
vi.mock('../../src/stores/ui.js', async importOriginal => ({ ...await importOriginal(), showToast }));
vi.mock('../../src/lib/router.js', () => ({ navigate: vi.fn() }));
vi.mock('../../src/stores/auth.js', () => ({
  isGlobalAdmin: { subscribe: fn => { fn(true); return () => {}; } },
}));

const Admin = (await import('../../src/routes/Admin.svelte')).default;

beforeEach(() => {
  vi.clearAllMocks();
  getRsos.mockResolvedValue({ rsos: [
    { rso_id: 1, name: 'IEEE', logo_color: '#00b2a9', founded_year: 2018 },
  ] });
  getRso.mockResolvedValue({ rso: { rso_id: 1, name: 'IEEE', members: [] } });
  getPollStatus.mockResolvedValue({ pollStatus: [
    { service: 'courses', finished_at: '2026-09-13T09:00:00Z', started_at: '2026-09-13T08:59:00Z',
      rows_processed: 10, rows_skipped: 0, error_count: 0 },
  ] });
  getUnknownCodes.mockResolvedValue({ unknownCodes: [] });
  getAdminUsers.mockResolvedValue({ users: [] });
  getAdminMidterms.mockResolvedValue({ midterms: [] });
});

/**
 * The admin page is a board tool, so it follows the same rules as the rest of
 * the site with less ceremony: the page title in the condensed display face at
 * forty pixels, a status as a highlighted word, one primary button on the
 * screen, and every native select painted by the theme rather than by the
 * browser. See docs/design/08-surfaces.md.
 */
describe('Admin, drawn in the design system', () => {
  it('carries the page title in the condensed display face', async () => {
    const { findByRole, container } = render(Admin);
    await findByRole('heading', { level: 1, name: 'Admin' });
    expect(container.querySelector('h1.title')).toBeTruthy();
  });

  it('draws an organization with a pad in the colour the site adapted', async () => {
    const { organizationColor } = await import('../../src/lib/organizationColor.js');
    const { container, findByText } = render(Admin);
    await findByText('IEEE');
    const pad = container.querySelector('.orgmark');
    expect(pad).toBeTruthy();
    expect(pad.getAttribute('style')).toContain(organizationColor('#00b2a9', 'mark', 'light'));
  });

  it('carries one primary button on the organizations tab', async () => {
    const { container, findByRole } = render(Admin);
    await findByRole('button', { name: 'Add an organization' });
    expect(container.querySelectorAll('.btn.primary').length).toBe(1);
  });

  it('says how a poller last ran as a highlighted word', async () => {
    const { findByRole, getByText } = render(Admin);
    await fireEvent.click(await findByRole('button', { name: 'Data sources' }));
    await waitFor(() => expect(getPollStatus).toHaveBeenCalled());
    const said = await waitFor(() => getByText('It ran'));
    expect(said.classList.contains('hl')).toBe(true);
  });

  it('lists its organizations as rows on hairlines rather than inside bordered cards', async () => {
    const { container, findByText } = render(Admin);
    await findByText('IEEE');
    expect(container.querySelector('.rounded-lg, .rounded-md, .rounded-full')).toBeNull();
  });
});
