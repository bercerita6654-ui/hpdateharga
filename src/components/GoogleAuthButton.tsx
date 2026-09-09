import React, { useState, useEffect, useRef } from 'react';
import { LogIn, LogOut, CheckCircle2, ChevronDown, RefreshCw, ExternalLink, FileSpreadsheet } from 'lucide-react';
import {
  getStoredGoogleUser,
  hasValidGoogleToken,
  loginWithGoogle,
  logoutGoogle,
  subscribeGoogleAuth,
  GoogleUserProfile,
  TARGET_SPREADSHEET_ID
} from '../services/googleSheetsService';

interface GoogleAuthButtonProps {
  compact?: boolean;
  onAuthChange?: (isAuthed: boolean) => void;
}

export default function GoogleAuthButton({ compact = false, onAuthChange }: GoogleAuthButtonProps) {
  const [user, setUser] = useState<GoogleUserProfile | null>(getStoredGoogleUser());
  const [isAuthed, setIsAuthed] = useState<boolean>(hasValidGoogleToken());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOpenMenu, setIsOpenMenu] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to auth changes across the app
    const unsubscribe = subscribeGoogleAuth((newUser) => {
      setUser(newUser);
      const authed = hasValidGoogleToken() || Boolean(newUser);
      setIsAuthed(authed);
      if (onAuthChange) onAuthChange(authed);
    });

    // Close menu when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpenMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      unsubscribe();
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onAuthChange]);

  const handleLogin = async () => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const profile = await loginWithGoogle();
      setUser(profile);
      setIsAuthed(true);
      if (onAuthChange) onAuthChange(true);
    } catch (err: any) {
      console.error('Google Auth error:', err);
      const msg = err?.message || 'Gagal login dengan Google.';
      setAuthError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logoutGoogle();
    setUser(null);
    setIsAuthed(false);
    setIsOpenMenu(false);
    if (onAuthChange) onAuthChange(false);
  };

  // Google Colored Icon SVG
  const GoogleIcon = () => (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.97 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );

  if (isAuthed && user) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpenMenu(!isOpenMenu)}
          className={`flex items-center gap-2 rounded-xl transition-all border cursor-pointer ${
            compact
              ? 'px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-xs text-emerald-800'
              : 'px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border-slate-200 text-xs text-slate-700 shadow-xs'
          }`}
          title={`Terhubung ke Google: ${user.email || 'Akun Google'}`}
        >
          {user.picture ? (
            <img src={user.picture} alt="Google Avatar" className="w-4 h-4 rounded-full" />
          ) : (
            <GoogleIcon />
          )}

          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-semibold max-w-[130px] truncate text-[11px]">
              {user.email || 'Google Terhubung'}
            </span>
          </div>

          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>

        {isOpenMenu && (
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {user.name || 'Akun Google'}
                </p>
                <p className="text-[11px] text-slate-500 truncate font-mono">
                  {user.email}
                </p>
              </div>
            </div>

            <div className="py-2.5 space-y-1.5 border-b border-slate-100">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                Target Spreadsheet
              </div>
              <a
                href={`https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1 break-all"
              >
                <span>Buka Lembar Spreadsheet</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>

            <div className="pt-2">
              <button
                onClick={handleLogout}
                className="w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center gap-1.5 font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Ganti / Putus Akun Google</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        onClick={handleLogin}
        disabled={isLoading}
        className={`flex items-center gap-2 rounded-xl text-xs font-bold transition-all active:scale-95 shadow-xs cursor-pointer ${
          compact
            ? 'px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
            : 'px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 hover:border-slate-400'
        }`}
        title="Hubungkan akun Google via Firebase agar data harga grosir dapat langsung tersimpan ke Google Sheets"
      >
        {isLoading ? (
          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
        ) : (
          <GoogleIcon />
        )}
        <span>{isLoading ? 'Menghubungkan...' : 'Hubungkan Google'}</span>
      </button>

      {authError && (
        <div className="absolute top-full left-0 mt-1.5 w-64 p-2 bg-red-50 border border-red-200 text-red-700 text-[11px] rounded-lg shadow-lg z-50 animate-in fade-in">
          <div className="flex items-start justify-between gap-1">
            <span>{authError}</span>
            <button
              onClick={() => setAuthError(null)}
              className="text-red-400 hover:text-red-700 font-bold ml-1 text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
