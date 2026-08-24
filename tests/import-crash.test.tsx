// Regression test for React error #310 ("Rendered more hooks than during the previous render")
// that crashed the whole app the moment the Smart Stock Import modal was opened.
import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import * as XLSX from 'xlsx';
import App from '../src/App.tsx';

const BASE = 'http://127.0.0.1:3000';
const captured: string[] = [];

beforeAll(() => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (typeof url === 'string' && url.startsWith('/')) return origFetch(BASE + url, init);
    return origFetch(input, init);
  }) as typeof fetch;

  window.matchMedia = window.matchMedia || ((q: string) => ({ matches: false, media: q, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, onchange: null, dispatchEvent: () => false }) as any);
  (window as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.print = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;
  URL.createObjectURL = URL.createObjectURL || (() => 'blob:mock');
  URL.revokeObjectURL = URL.revokeObjectURL || (() => {});

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

async function login() {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Admin', password: 'Araliya2000' }),
  });
  const data = await res.json();
  localStorage.setItem('pos_auth_token', data.token);
  localStorage.setItem('pos_user', JSON.stringify(data.user));
}

function buildXlsxFile(): File {
  const rows = [
    { 'Product Name': 'Lion Lager', 'Size': '625ml', 'SKU': 'LION-LAG-625', 'Buying Price': 580, 'Selling Price': 750, 'Quantity': 48, 'Category': 'Beer' },
    { 'Product Name': 'Extra Special', 'Size': '750ml Bottle', 'SKU': '', 'Buying Price': 2950, 'Selling Price': 3650, 'Quantity': 24, 'Category': 'Arrack' },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock Import');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([buf], 'stock_import.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('Smart Stock Import crash (#310)', () => {
  it('opens the import modal and parses an .xlsx without crashing', async () => {
    await login();
    render(<App />);
    await waitFor(() => expect(document.getElementById('pos-products-grid')).toBeTruthy(), { timeout: 20000 });
    await sleep(600);

    // go to admin -> inventory
    fireEvent.click(byId('toggle-admin-pos-view-btn') as HTMLElement);
    await sleep(1000);
    fireEvent.click(byId('admin-nav-inventory') as HTMLElement);
    await sleep(1200);

    // Open the modal — pre-fix this is exactly where the app crashed with #310.
    fireEvent.click(byId('smart-import-btn') as HTMLElement);
    await waitFor(() => expect(document.body.textContent).toContain('Smart Stock Import'), { timeout: 10000 });
    await sleep(400);

    // The app must not have crashed into the ErrorBoundary.
    expect(document.body.textContent).not.toContain('Something went wrong');
    expect(captured.some(c => /more hooks/i.test(c))).toBe(false);

    // Upload a real .xlsx through the hidden file input.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    fireEvent.change(fileInput, { target: { files: [buildXlsxFile()] } });

    await waitFor(() => expect(document.body.textContent).toMatch(/row\(s\) detected/), { timeout: 15000 });
    await sleep(300);

    expect(document.body.textContent).not.toContain('Something went wrong');
    expect(captured.some(c => /more hooks/i.test(c))).toBe(false);

    console.log('import modal opened and xlsx parsed; captured errors:', JSON.stringify(captured));
  }, 90000);
});
