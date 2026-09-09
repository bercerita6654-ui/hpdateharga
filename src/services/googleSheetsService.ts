import { formatIndoTimestamp } from '../utils/helpers';
import {
  auth,
  googleProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from './firebase';
import { GoogleAuthProvider } from 'firebase/auth';

export const TARGET_SPREADSHEET_ID = '1CXAjfviAGn9_TCzzJsYIpxMLthF8H6zTynQFftbIM9I';

const CLIENT_ID =
  ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string) ||
  '878108373232-3isus11771roiomltu0d9kkejp802hf6.apps.googleusercontent.com';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';

export interface WholesaleTierData {
  id: string;
  minQty: number;
  maxQty: number | null;
  price: number;
}

export interface WholesaleSheetPayload {
  sku: string;
  productName: string;
  unit: string;
  normalPrice: number;
  tiers: WholesaleTierData[];
  date?: Date;
}

export interface GoogleUserProfile {
  email?: string;
  name?: string;
  picture?: string;
}

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;
let cachedUserProfile: GoogleUserProfile | null = null;
let authListeners: Array<(user: GoogleUserProfile | null) => void> = [];

// Initialize Firebase Auth listener to keep state in sync
if (typeof window !== 'undefined') {
  try {
    onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const profile: GoogleUserProfile = {
          email: firebaseUser.email || undefined,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || undefined,
          picture: firebaseUser.photoURL || undefined
        };
        sessionStorage.setItem('g_sheets_user', JSON.stringify(profile));
        notifyAuthListeners(profile);
      }
    });
  } catch (e) {
    console.warn('Firebase onAuthStateChanged init warning', e);
  }
}

export function subscribeGoogleAuth(callback: (user: GoogleUserProfile | null) => void): () => void {
  authListeners.push(callback);
  // Immediate call with current state
  callback(getStoredGoogleUser());
  return () => {
    authListeners = authListeners.filter(cb => cb !== callback);
  };
}

function notifyAuthListeners(user: GoogleUserProfile | null) {
  cachedUserProfile = user;
  authListeners.forEach(cb => {
    try {
      cb(user);
    } catch (e) {
      console.error('Error notifying auth listener', e);
    }
  });
}

export function getStoredGoogleUser(): GoogleUserProfile | null {
  if (cachedUserProfile) return cachedUserProfile;
  try {
    const str = sessionStorage.getItem('g_sheets_user');
    if (str) {
      cachedUserProfile = JSON.parse(str);
      return cachedUserProfile;
    }
  } catch {}
  if (auth.currentUser) {
    cachedUserProfile = {
      email: auth.currentUser.email || undefined,
      name: auth.currentUser.displayName || auth.currentUser.email?.split('@')[0] || undefined,
      picture: auth.currentUser.photoURL || undefined
    };
    return cachedUserProfile;
  }
  return null;
}

export function hasValidGoogleToken(): boolean {
  if (!cachedToken) {
    cachedToken = sessionStorage.getItem('g_sheets_token');
    tokenExpiresAt = Number(sessionStorage.getItem('g_sheets_token_exp') || '0');
  }
  return Boolean(cachedToken && Date.now() < tokenExpiresAt - 60000);
}

/**
 * Fetch user profile (email, name, picture) using OAuth tokeninfo / userinfo
 */
export async function fetchGoogleUserProfile(token: string): Promise<GoogleUserProfile | null> {
  try {
    // Attempt 1: OAuth2 userinfo
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (userRes.ok) {
      const data = await userRes.json();
      const profile: GoogleUserProfile = {
        email: data.email,
        name: data.name || data.given_name,
        picture: data.picture
      };
      sessionStorage.setItem('g_sheets_user', JSON.stringify(profile));
      notifyAuthListeners(profile);
      return profile;
    }
  } catch (err) {
    console.warn('UserInfo fetch error, trying tokeninfo fallback', err);
  }

  try {
    // Attempt 2: TokenInfo fallback
    const infoRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`);
    if (infoRes.ok) {
      const infoData = await infoRes.json();
      if (infoData.email) {
        const profile: GoogleUserProfile = {
          email: infoData.email,
          name: infoData.email.split('@')[0]
        };
        sessionStorage.setItem('g_sheets_user', JSON.stringify(profile));
        notifyAuthListeners(profile);
        return profile;
      }
    }
  } catch (err) {
    console.warn('Tokeninfo fetch error', err);
  }

  const fallback: GoogleUserProfile = { email: 'Google Terhubung' };
  sessionStorage.setItem('g_sheets_user', JSON.stringify(fallback));
  notifyAuthListeners(fallback);
  return fallback;
}

/**
 * Log out and clear Google credentials
 */
export function logoutGoogle(): void {
  try {
    signOut(auth).catch(() => {});
  } catch (e) {
    console.warn('Firebase signOut error', e);
  }
  cachedToken = null;
  tokenExpiresAt = 0;
  cachedUserProfile = null;
  sessionStorage.removeItem('g_sheets_token');
  sessionStorage.removeItem('g_sheets_token_exp');
  sessionStorage.removeItem('g_sheets_user');
  notifyAuthListeners(null);
}

/**
 * Login with Firebase Google Auth (Popup).
 * Requests Google Sheets permission so user can directly save wholesale prices.
 */
export async function loginWithGoogle(): Promise<GoogleUserProfile | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;

    const profile: GoogleUserProfile = {
      email: result.user.email || undefined,
      name: result.user.displayName || result.user.email?.split('@')[0] || undefined,
      picture: result.user.photoURL || undefined
    };

    if (token) {
      cachedToken = token;
      tokenExpiresAt = Date.now() + 3500 * 1000;
      sessionStorage.setItem('g_sheets_token', token);
      sessionStorage.setItem('g_sheets_token_exp', String(tokenExpiresAt));
    }

    sessionStorage.setItem('g_sheets_user', JSON.stringify(profile));
    notifyAuthListeners(profile);
    return profile;
  } catch (firebaseErr: any) {
    console.error('Firebase signInWithPopup error:', firebaseErr);

    if (firebaseErr?.code === 'auth/popup-closed-by-user') {
      throw new Error('Jendela login Google ditutup sebelum selesai.');
    } else if (firebaseErr?.code === 'auth/popup-blocked') {
      throw new Error('Pop-up diblokir oleh browser. Izinkan pop-up untuk situs ini.');
    } else if (firebaseErr?.code === 'auth/cancelled-popup-request') {
      throw new Error('Permintaan login dibatalkan.');
    } else if (firebaseErr?.code === 'auth/unauthorized-domain') {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      const domainErr: any = new Error(
        `Domain (${hostname}) belum didaftarkan di Authorized Domains Firebase. Silakan tambahkan domain ini di Firebase Console.`
      );
      domainErr.code = 'auth/unauthorized-domain';
      throw domainErr;
    }

    // Attempt GIS fallback if available
    try {
      const gisToken = await getGisAccessToken(true);
      const profile = await fetchGoogleUserProfile(gisToken);
      return profile;
    } catch {
      throw new Error(firebaseErr?.message || 'Login Google dengan Firebase gagal.');
    }
  }
}

/**
 * Ensure Google Identity Services (GIS) client script is ready (fallback)
 */
export async function ensureGsiClient(): Promise<void> {
  if (typeof window === 'undefined') return;
  if ((window as any).google?.accounts?.oauth2) return;

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      let count = 0;
      const interval = setInterval(() => {
        count++;
        if ((window as any).google?.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        } else if (count > 30) {
          clearInterval(interval);
          reject(new Error('Google Identity Services script timeout.'));
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      let count = 0;
      const interval = setInterval(() => {
        count++;
        if ((window as any).google?.accounts?.oauth2) {
          clearInterval(interval);
          resolve();
        } else if (count > 30) {
          clearInterval(interval);
          reject(new Error('Inisialisasi Google Identity Services gagal.'));
        }
      }, 100);
    };
    script.onerror = () => reject(new Error('Gagal memuat script otorisasi Google.'));
    document.head.appendChild(script);
  });
}

/**
 * Request an access token using Google Identity Services (GIS fallback)
 */
async function getGisAccessToken(interactive = true): Promise<string> {
  await ensureGsiClient();

  const google = (window as any).google;
  if (!google?.accounts?.oauth2) {
    throw new Error('Google Identity Services belum siap.');
  }

  return new Promise<string>((resolve, reject) => {
    try {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse: any) => {
          if (tokenResponse.error) {
            return reject(new Error(tokenResponse.error_description || tokenResponse.error));
          }
          if (!tokenResponse.access_token) {
            return reject(new Error('Tidak menerima token akses dari Google.'));
          }

          cachedToken = tokenResponse.access_token;
          const expiresIn = Number(tokenResponse.expires_in) || 3600;
          tokenExpiresAt = Date.now() + expiresIn * 1000;
          sessionStorage.setItem('g_sheets_token', cachedToken!);
          sessionStorage.setItem('g_sheets_token_exp', String(tokenExpiresAt));
          fetchGoogleUserProfile(cachedToken!).catch(() => {});
          resolve(cachedToken!);
        },
        error_callback: (error: any) => {
          reject(new Error(error.message || 'Otorisasi Google Sheets dibatalkan atau gagal.'));
        }
      });

      tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
    } catch (err: any) {
      reject(err);
    }
  });
}

/**
 * Primary token getter: retrieves active token or triggers login if expired
 */
export async function getGoogleSheetsAccessToken(interactive = true): Promise<string> {
  if (!cachedToken) {
    cachedToken = sessionStorage.getItem('g_sheets_token');
    tokenExpiresAt = Number(sessionStorage.getItem('g_sheets_token_exp') || '0');
  }

  // If token is still valid with 1 min safety margin, return it
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  if (interactive) {
    await loginWithGoogle();
    if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
      return cachedToken;
    }
  }

  return await getGisAccessToken(interactive);
}

/**
 * Format the wholesale payload into spreadsheet row values matching the requested pattern:
 * Kolom 1 : Tanggal / Waktu, contoh: Rabu, 09 Sept 2026 (09:33)
 * Kolom 2 : SKU : 13330
 * Kolom 3 : Nama Produk : PENGHAPUS PENSIL JOYKO ER-104 TANGGUNG PUTIH
 * Kolom 4 : UNIT : PCS
 * Kolom 5 : Harga Normal : 5.000
 * Kolom 6 : Harga Tier 1 : 5.000 (3-5)
 * Kolom 7 : Harga Tier 2 : 5.000 (6-11)
 * Kolom 8 : Harga Tier 3 : 4.000 (12-50)
 */
export function prepareWholesaleRowValues(payload: WholesaleSheetPayload): string[] {
  const dateStr = formatIndoTimestamp(payload.date || new Date());
  const skuStr = payload.sku || '-';
  const nameStr = payload.productName || '-';
  const unitStr = (payload.unit || 'PCS').toUpperCase();
  const normalPriceStr = Math.round(payload.normalPrice || 0).toLocaleString('id-ID');

  const row = [dateStr, skuStr, nameStr, unitStr, normalPriceStr];

  // Add tier columns (sorted by minQty) - exactly 3 tiers matching columns 6, 7, 8
  const sortedTiers = [...(payload.tiers || [])].sort((a, b) => a.minQty - b.minQty);

  for (let i = 0; i < 3; i++) {
    const tier = sortedTiers[i];
    if (tier) {
      const priceStr = Math.round(tier.price).toLocaleString('id-ID');
      const rangeStr = tier.maxQty ? `${tier.minQty}-${tier.maxQty}` : `${tier.minQty}+`;
      row.push(`${priceStr} (${rangeStr})`);
    } else {
      row.push('');
    }
  }

  // Columns 9 & 10: Checklist (FALSE, FALSE) to align with existing spreadsheet checkboxes
  row.push('FALSE');
  row.push('FALSE');

  return row;
}

// Helper to properly quote sheet title with A1 range for Google Sheets API v4
function getQuotedSheetRange(title: string, range?: string): string {
  const escaped = title.replace(/'/g, "''");
  return range ? `'${escaped}'!${range}` : `'${escaped}'`;
}

/**
 * Append or insert row to the target Google Spreadsheet using Google Sheets API v4.
 * Automatically locates the FIRST empty row (preventing skipping rows that only have checkbox defaults).
 */
export async function appendWholesaleToSpreadsheet(
  payload: WholesaleSheetPayload,
  spreadsheetId: string = TARGET_SPREADSHEET_ID
): Promise<{ success: boolean; spreadsheetUrl: string; rowData: string[]; rowNumber: number }> {
  const rowValues = prepareWholesaleRowValues(payload);

  let token = await getGoogleSheetsAccessToken(true);

  // 1. Get spreadsheet metadata to know the sheet title (prioritize "Harga Grosir" if available)
  let sheetTitle = 'Harga Grosir';
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (metaRes.status === 401) {
      // Token might be expired, retry once with fresh token
      sessionStorage.removeItem('g_sheets_token');
      sessionStorage.removeItem('g_sheets_token_exp');
      cachedToken = null;
      token = await getGoogleSheetsAccessToken(true);
      const retryMetaRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (retryMetaRes.ok) {
        const metaData = await retryMetaRes.json();
        if (metaData.sheets && metaData.sheets.length > 0) {
          const matchedSheet = metaData.sheets.find((s: any) =>
            s.properties?.title?.trim().toLowerCase() === 'harga grosir'
          );
          sheetTitle = matchedSheet?.properties?.title || metaData.sheets[0].properties.title;
        }
      }
    } else if (metaRes.ok) {
      const metaData = await metaRes.json();
      if (metaData.sheets && metaData.sheets.length > 0) {
        const matchedSheet = metaData.sheets.find((s: any) =>
          s.properties?.title?.trim().toLowerCase() === 'harga grosir'
        );
        sheetTitle = matchedSheet?.properties?.title || metaData.sheets[0].properties.title;
      }
    }
  } catch (e) {
    console.warn('Could not read sheet title, defaulting to Harga Grosir', e);
  }

  // 2. Locate the first row where Column A (Tanggal) or Column B (SKU) is empty
  let targetRowNumber = 2; // Default to row 2
  try {
    const readRange = getQuotedSheetRange(sheetTitle, 'A:B');
    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(readRange)}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (readRes.ok) {
      const readData = await readRes.json();
      const rows: string[][] = readData.values || [];

      // Find the first row >= 2 (index >= 1) where column A and B are blank
      let foundEmpty = -1;
      for (let i = 1; i < rows.length; i++) {
        const colA = rows[i]?.[0]?.trim();
        const colB = rows[i]?.[1]?.trim();
        if (!colA && !colB) {
          foundEmpty = i + 1; // 1-indexed row number
          break;
        }
      }

      if (foundEmpty !== -1) {
        targetRowNumber = foundEmpty;
      } else {
        // If all existing rows have data, append directly at rows.length + 1
        targetRowNumber = Math.max(2, rows.length + 1);
      }
    }
  } catch (e) {
    console.warn('Could not read rows to find empty slot, will attempt direct write to row 2 or append', e);
  }

  // 3. Write directly to the target row (A{row}:J{row}) to fill the empty slot neatly
  const writeRange = getQuotedSheetRange(sheetTitle, `A${targetRowNumber}:J${targetRowNumber}`);
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    writeRange
  )}?valueInputOption=USER_ENTERED`;

  const writeRes = await fetch(writeUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values: [rowValues]
    })
  });

  if (!writeRes.ok) {
    // If targeted PUT fails, fallback to append
    console.warn('Targeted PUT failed, attempting standard append fallback');
    const appendRange = getQuotedSheetRange(sheetTitle, 'A1');
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      appendRange
    )}:append?valueInputOption=USER_ENTERED`;

    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: [rowValues]
      })
    });

    if (!appendRes.ok) {
      const errorBody = await appendRes.text();
      let errorMsg = `Gagal menyimpan ke Google Sheets (Status ${appendRes.status})`;
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed.error?.message) {
          errorMsg = parsed.error.message;
        }
      } catch {
        // use fallback
      }
      throw new Error(errorMsg);
    }
  }

  // Record saved SKU to local history
  if (payload.sku) {
    recordSavedSkus([payload.sku]);
  }

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return {
    success: true,
    spreadsheetUrl,
    rowData: rowValues,
    rowNumber: targetRowNumber
  };
}

const SAVED_SKUS_STORAGE_KEY = 'marp_saved_wholesale_skus';
// Initial seed from known existing items in user's sheet
const DEFAULT_KNOWN_SKUS = ['13330', '11033', '10081'];

export function getSavedSkusFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_SKUS_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(SAVED_SKUS_STORAGE_KEY, JSON.stringify(DEFAULT_KNOWN_SKUS));
      return DEFAULT_KNOWN_SKUS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_KNOWN_SKUS;
  } catch {
    return DEFAULT_KNOWN_SKUS;
  }
}

export function recordSavedSkus(skus: string[]): void {
  try {
    const current = new Set(getSavedSkusFromStorage());
    skus.forEach(s => {
      const clean = s?.trim();
      if (clean && clean !== '-') current.add(clean);
    });
    localStorage.setItem(SAVED_SKUS_STORAGE_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('Failed to record saved skus', e);
  }
}

/**
 * Fetches all existing SKUs recorded in Column B of Google Sheets (Harga Grosir)
 */
export async function fetchSpreadsheetExistingSkus(
  spreadsheetId: string = TARGET_SPREADSHEET_ID
): Promise<string[]> {
  try {
    const token = await getGoogleSheetsAccessToken(false);
    if (!token) {
      return getSavedSkusFromStorage();
    }

    const range = getQuotedSheetRange('Harga Grosir', 'B2:B');
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (res.ok) {
      const data = await res.json();
      const rows: string[][] = data.values || [];
      const extractedSkus: string[] = [];
      rows.forEach(r => {
        const sku = r?.[0]?.trim();
        if (sku && sku !== '-' && !sku.toLowerCase().includes('sku')) {
          extractedSkus.push(sku);
        }
      });
      if (extractedSkus.length > 0) {
        recordSavedSkus(extractedSkus);
      }
      return Array.from(new Set([...getSavedSkusFromStorage(), ...extractedSkus]));
    }
  } catch (e) {
    console.warn('Could not fetch existing SKUs from spreadsheet', e);
  }
  return getSavedSkusFromStorage();
}

/**
 * Batch save multiple wholesale items to Google Spreadsheet in a single request.
 * Automatically finds the first empty row and writes all rows sequentially.
 */
export async function batchAppendWholesaleToSpreadsheet(
  payloads: WholesaleSheetPayload[],
  spreadsheetId: string = TARGET_SPREADSHEET_ID
): Promise<{
  success: boolean;
  spreadsheetUrl: string;
  startRow: number;
  endRow: number;
  count: number;
  savedSkus: string[];
}> {
  if (!payloads || payloads.length === 0) {
    throw new Error('Tidak ada produk dalam keranjang untuk disimpan.');
  }

  const allRowValues = payloads.map(p => prepareWholesaleRowValues(p));
  let token = await getGoogleSheetsAccessToken(true);

  // 1. Get sheet title (default to 'Harga Grosir')
  let sheetTitle = 'Harga Grosir';
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      if (metaData.sheets && metaData.sheets.length > 0) {
        const matched = metaData.sheets.find((s: any) =>
          s.properties?.title?.trim().toLowerCase() === 'harga grosir'
        );
        sheetTitle = matched?.properties?.title || metaData.sheets[0].properties.title;
      }
    }
  } catch (e) {
    console.warn('Error reading sheet title', e);
  }

  // 2. Locate first empty row in Column A/B
  let startRowNumber = 2;
  try {
    const readRange = getQuotedSheetRange(sheetTitle, 'A:B');
    const readRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(readRange)}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (readRes.ok) {
      const readData = await readRes.json();
      const rows: string[][] = readData.values || [];

      let foundEmpty = -1;
      for (let i = 1; i < rows.length; i++) {
        const colA = rows[i]?.[0]?.trim();
        const colB = rows[i]?.[1]?.trim();
        if (!colA && !colB) {
          foundEmpty = i + 1;
          break;
        }
      }

      if (foundEmpty !== -1) {
        startRowNumber = foundEmpty;
      } else {
        startRowNumber = Math.max(2, rows.length + 1);
      }
    }
  } catch (e) {
    console.warn('Could not locate empty row, defaulting to 2', e);
  }

  const endRowNumber = startRowNumber + payloads.length - 1;

  // 3. Write all rows in a single batch PUT request
  const writeRange = getQuotedSheetRange(sheetTitle, `A${startRowNumber}:J${endRowNumber}`);
  const writeUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    writeRange
  )}?valueInputOption=USER_ENTERED`;

  const writeRes = await fetch(writeUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values: allRowValues
    })
  });

  if (!writeRes.ok) {
    // Fallback: append all rows
    console.warn('Batch PUT failed, attempting fallback append');
    const appendRange = getQuotedSheetRange(sheetTitle, 'A1');
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
      appendRange
    )}:append?valueInputOption=USER_ENTERED`;

    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: allRowValues
      })
    });

    if (!appendRes.ok) {
      const errorBody = await appendRes.text();
      let errorMsg = `Gagal menyimpan batch ke Google Sheets (Status ${appendRes.status})`;
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed.error?.message) errorMsg = parsed.error.message;
      } catch {}
      throw new Error(errorMsg);
    }
  }

  // Record all saved SKUs
  const savedSkus = payloads.map(p => p.sku).filter(Boolean);
  recordSavedSkus(savedSkus);

  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return {
    success: true,
    spreadsheetUrl,
    startRow: startRowNumber,
    endRow: endRowNumber,
    count: payloads.length,
    savedSkus
  };
}

