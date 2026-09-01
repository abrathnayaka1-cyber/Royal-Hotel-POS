// UI regression test for the Functions & Events module (POS board, booking
// form guards, settlement maths and the admin hall form). It drives the real
// App against a running dev server, exactly like tests/import-crash.test.tsx.
//
//   npm run dev            # terminal 1  (API + vite on :3000)
//   npx vitest run tests/functions-ui.test.tsx   # terminal 2
import React from 'react';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import App from '../src/App.tsx';

const BASE = 'http://127.0.0.1:3000';
const captured: string[] = [];

const api = async (path: string, opts: RequestInit = {}, token?: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((opts.headers as Record<string, string>) || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const body = opts.body == null ? undefined : (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
  const res = await fetch(BASE + path, { ...opts, headers, body });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
};

beforeAll(() => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (typeof url === 'string' && url.startsWith('/')) return origFetch(BASE + url, init);
    return origFetch(input, init);
  }) as typeof fetch;

  window.matchMedia = window.matchMedia || ((q: string) => ({
    matches: false, media: q, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, onchange: null, dispatchEvent: () => false
  }) as any);
  (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.print = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;

  const ce = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    captured.push(args.map(a => (a instanceof Error ? a.message : String(a))).join(' '));
    ce(...(args as []));
  };
});

beforeEach(() => { captured.length = 0; localStorage.clear(); });
afterEach(() => cleanup());

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const byId = (id: string) => document.getElementById(id);
const text = () => document.body.textContent || '';
const setValue = (id: string, value: string) => {
  const el = byId(id) as HTMLInputElement | null;
  expect(el, `#${id} should exist`).toBeTruthy();
  fireEvent.change(el as HTMLElement, { target: { value } });
};

async function login(): Promise<string> {
  const { json: data } = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'Admin', password: 'Araliya2000' })
  });
  localStorage.setItem('pos_auth_token', (data as any).token);
  localStorage.setItem('pos_user', JSON.stringify((data as any).user));
  return (data as any).token;
}

const dayKey = (d: number) => {
  const x = new Date(Date.now() + d * 86400000);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

describe('Functions & Events UI', () => {
  const uniq = Date.now();
  // Each run gets its own slice of the calendar — a booked day stays taken.
  const day = 100 + (uniq % 380);
  const clashDay = dayKey(day);
  const freeDay = dayKey(day + 6);
  let adminToken = '';
  let hall: any = null;
  let clashBookingId = '';
  let uiBookingNumber = '';

  beforeAll(async () => {
    const login_ = await api('/api/auth/login', { method: 'POST', body: { username: 'Admin', password: 'Araliya2000' } });
    adminToken = login_.json?.token || '';
    const halls = await api('/api/function-halls', {}, adminToken);
    hall = (halls.json || []).find((h: any) => h.isActive !== false && h.status === 'available') || halls.json?.[0];
    expect(hall, 'a function hall must be seeded').toBeTruthy();
    // Occupy one date on this hall so the form can prove it detects the clash.
    const clash = await api('/api/function-bookings', {
      method: 'POST',
      body: {
        hallId: hall.id, customerName: `UI Clash ${uniq}`, customerPhone: '0771110000',
        eventDate: clashDay, expectedGuests: 10, hallCharge: 1000
      }
    }, adminToken);
    clashBookingId = clash.json?.booking?.id || '';
    expect(clash.status, 'fixture clash booking').toBe(201);
  });

  afterAll(async () => {
    // Cancel so the hall's day is free for the next run.
    const list = await api('/api/function-bookings', {}, adminToken);
    for (const b of list.json || []) {
      if (b.customerName === `UI Clash ${uniq}` || b.customerName === `UI Wedding ${uniq}`) {
        await api(`/api/function-bookings/${b.id}/cancel`, { method: 'PUT', body: { reason: 'ui test cleanup' } }, adminToken);
      }
    }
  });

  it('boards, guards, settlement maths and the admin hall form all behave', async () => {
    await login();
    render(<App />);
    await waitFor(() => expect(byId('pos-products-grid')).toBeTruthy(), { timeout: 20000 });
    await sleep(500);

    // ---------- 1. The FUNCTIONS board ----------
    fireEvent.click(byId('cat-sidebar-functions') as HTMLElement);
    await waitFor(() => expect(byId('pos-functions-view-container')).toBeTruthy());
    expect(text()).toContain('Hotel Functions & Events');
    expect(byId(`function-hall-card-${hall.id}`)).toBeTruthy();

    // The search box existed in state only — there was no input at all.
    const searchInput = byId('functions-search-input') as HTMLInputElement;
    expect(searchInput, 'search input must be rendered').toBeTruthy();
    fireEvent.change(searchInput, { target: { value: 'zzz-nothing-matches' } });
    await sleep(150);
    expect(byId(`function-hall-card-${hall.id}`)).toBeNull();
    expect(text()).toContain('No hall matches that search');
    fireEvent.change(searchInput, { target: { value: '' } });
    await sleep(150);
    expect(byId(`function-hall-card-${hall.id}`)).toBeTruthy();

    const badgeBefore = Number(byId('cat-sidebar-functions-badge')?.textContent || '0');

    // ---------- 2. Booking form guards ----------
    fireEvent.click(byId(`book-function-hall-${hall.id}-btn`) as HTMLElement);
    await waitFor(() => expect(byId('function-booking-modal-container')).toBeTruthy());

    setValue('function-customer-name-input', `UI Wedding ${uniq}`);
    // (a) guest count above the hall capacity must block submission
    setValue('function-customer-phone-input', '0771234567');
    setValue('function-expected-guests-input', String((hall.capacity || 100) + 500));
    await sleep(120);
    expect(text()).toContain('the booking is rejected until this fits');
    expect((byId('confirm-function-booking-btn') as HTMLButtonElement).disabled).toBe(true);
    setValue('function-expected-guests-input', '10');
    await sleep(120);
    expect((byId('confirm-function-booking-btn') as HTMLButtonElement).disabled).toBe(false);

    // (b) an unreachable phone number must block submission
    setValue('function-customer-phone-input', 'abc');
    await sleep(120);
    expect(text()).toContain('At least 7 digits are required');
    expect((byId('confirm-function-booking-btn') as HTMLButtonElement).disabled).toBe(true);
    setValue('function-customer-phone-input', '0771234567');
    await sleep(120);

    // (c) a date the hall is already held on must be caught BEFORE submitting
    const dateInput = byId('function-event-date-input') as HTMLInputElement;
    expect(dateInput.value, 'the form pre-fills a future date').toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dateInput.min, 'min date is today').toBe(dayKey(0));
    fireEvent.change(dateInput, { target: { value: clashDay } });
    await sleep(200);
    expect(byId('function-date-clash-warning'), 'clash warning shown').toBeTruthy();
    expect(text()).toContain('One event per hall per day');
    expect((byId('confirm-function-booking-btn') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(dateInput, { target: { value: freeDay } });
    await sleep(200);
    expect(byId('function-date-clash-warning')).toBeNull();
    expect((byId('confirm-function-booking-btn') as HTMLButtonElement).disabled).toBe(false);

    // (d) the printed total must be the derived total (hall + plates + tax − discount)
    setValue('function-per-plate-rate-input', '1000');
    setValue('function-plates-input', '20');
    setValue('function-extra-services-input', '500');
    await sleep(150);
    const expectedTotal = (hall.ratePerDay || 0) + 20000 + 500;
    expect(text()).toContain(`Rs. ${expectedTotal.toLocaleString()}`);

    // ---------- 3. Create it → ticket ----------
    fireEvent.click(byId('confirm-function-booking-btn') as HTMLElement);
    await waitFor(() => expect(byId('function-booking-ticket-modal-container')).toBeTruthy(), { timeout: 15000 });
    const ticket = (byId('thermal-function-ticket-preview') as HTMLElement).textContent || '';
    const m = ticket.match(/TICKET #(EVT-\d+)/);
    uiBookingNumber = m?.[1] || '';
    expect(uiBookingNumber, 'ticket shows the booking number').toMatch(/^EVT-/);
    expect(ticket).toContain('One event per hall per day');
    expect(ticket, 'ticket prints the booked session hours, not a fixed 8AM/12AM').toContain('9:00 AM - 12:00 AM');
    fireEvent.click(byId('close-function-ticket-modal-btn') as HTMLElement);
    await sleep(300);

    // The new booking is on the board and the sidebar badge counted it.
    expect(byId(`function-booking-row-${uiBookingNumber}`)).toBeTruthy();
    await waitFor(
      () => expect(Number(byId('cat-sidebar-functions-badge')?.textContent || '0')).toBe(badgeBefore + 1),
      { timeout: 10000 }
    );

    // The booking must carry the hall's own rate — opening the form from a hall
    // card used to leave the charge at 0, so the event was booked for free.
    const created = await api(`/api/function-bookings?search=${encodeURIComponent(`UI Wedding ${uniq}`)}`, {}, adminToken);
    const booking = (created.json || []).find((b: any) => b.bookingNumber === uiBookingNumber);
    expect(booking?.hallCharge, 'hall charge came from the hall rate').toBe(hall.ratePerDay);
    const autoAdvance = hall.ratePerDay || 0; // the form proposes the hall rate as advance
    expect(booking?.advancePaid).toBe(autoAdvance);
    expect(booking?.grandTotal).toBe(expectedTotal);
    expect(booking?.balanceDue).toBe(expectedTotal - autoAdvance);

    // ---------- 4. Settlement: extra charges raise what must be collected ----
    fireEvent.click(byId(`complete-function-booking-${uiBookingNumber}-btn`) as HTMLElement);
    await waitFor(() => expect(byId('function-settle-amount-input')).toBeTruthy());
    const amountInput = byId('function-settle-amount-input') as HTMLInputElement;
    expect(Number(amountInput.value), 'prefilled with the balance due').toBe(expectedTotal - autoAdvance);
    setValue('function-settle-additional-input', '5000');
    await sleep(150);
    // This is the bug that made "Complete Event" unusable with extra charges:
    // the amount stayed on the OLD balance and the server rejected the submit.
    expect(Number((byId('function-settle-amount-input') as HTMLInputElement).value)).toBe(expectedTotal - autoAdvance + 5000);
    expect(text()).toContain(`Collect Rs. ${(expectedTotal - autoAdvance + 5000).toLocaleString()}`);
    fireEvent.click(byId('confirm-function-settle-btn') as HTMLElement);
    await waitFor(() => expect(byId('function-settle-amount-input')).toBeNull(), { timeout: 15000 });
    await sleep(400);
    const after = await api(`/api/function-bookings?search=${encodeURIComponent(`UI Wedding ${uniq}`)}`, {}, adminToken);
    const settled = (after.json || []).find((b: any) => b.bookingNumber === uiBookingNumber);
    expect(settled?.status, 'event closed with the extra charge').toBe('completed');
    expect(settled?.grandTotal).toBe(expectedTotal + 5000);
    expect(settled?.balanceDue).toBe(0);

    // ---------- 5. Admin: hall master data validation + retire ----------
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
    fireEvent.click(byId('toggle-admin-pos-view-btn') as HTMLElement);
    await sleep(600);
    fireEvent.click(byId('admin-nav-functions') as HTMLElement);
    await waitFor(() => expect(byId('admin-functions-view')).toBeTruthy());
    expect(byId(`admin-function-hall-card-${hall.id}`)).toBeTruthy();

    fireEvent.click(byId('admin-new-function-hall-btn') as HTMLElement);
    await waitFor(() => expect(byId('admin-hall-name-input')).toBeTruthy());
    setValue('admin-hall-name-input', `UI Test Hall ${uniq}`);
    setValue('admin-hall-capacity-input', '0');
    const hallForm = (byId('admin-hall-save-btn') as HTMLElement).closest('form') as HTMLFormElement;
    expect(hallForm, 'hall form found').toBeTruthy();
    fireEvent.submit(hallForm);
    await sleep(300);
    expect(text(), `save handler must reject a 0 capacity`).toContain('Hall capacity must be between 1 and 10,000 guests');

    setValue('admin-hall-capacity-input', '80');
    fireEvent.submit(hallForm);
    await waitFor(async () => {
      const list = await api('/api/function-halls', {}, adminToken);
      const found = (list.json || []).find((h: any) => h.hallName === `UI Test Hall ${uniq}`);
      if (!found) throw new Error('hall not created yet');
      (globalThis as any).__uiTestHallId = found.id;
    }, { timeout: 10000 });

    const createdId = (globalThis as any).__uiTestHallId as string;
    await waitFor(() => expect(byId(`admin-function-hall-card-${createdId}`)).toBeTruthy(), { timeout: 10000 });
    // Retire it — the POS board must drop the hall, the admin list keeps it.
    const retireBtn = Array.from(document.querySelectorAll(`#admin-function-hall-card-${createdId} button`))
      .find(b => (b.textContent || '').includes('Retire')) as HTMLElement;
    expect(retireBtn, 'retire button on the hall card').toBeTruthy();
    fireEvent.click(retireBtn);
    await waitFor(async () => {
      const list = await api('/api/function-halls', {}, adminToken);
      const found = (list.json || []).find((h: any) => h.id === createdId);
      expect(found?.isActive).toBe(false);
    }, { timeout: 10000 });

    // ---------- 6. Nothing crashed ----------
    expect(text()).not.toContain('Something went wrong');
    expect(captured.some(c => /more hooks|Cannot read|is not a function|not a valid JSON/i.test(c))).toBe(false);

    // Cleanup: remove the retired test hall and the fixture booking.
    await api(`/api/function-halls/${createdId}`, { method: 'DELETE' }, adminToken);
    expect(clashBookingId).toBeTruthy();
  }, 180000);
});
