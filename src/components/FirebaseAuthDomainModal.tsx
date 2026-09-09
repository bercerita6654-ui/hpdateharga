import React, { useState } from 'react';
import { Copy, Check, ExternalLink, ShieldAlert, X, Info, AlertTriangle } from 'lucide-react';
import firebaseConfigJson from '../../firebase-applet-config.json';

interface FirebaseAuthDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => void;
}

export default function FirebaseAuthDomainModal({
  isOpen,
  onClose,
  onRetry
}: FirebaseAuthDomainModalProps) {
  const [copiedDomain, setCopiedDomain] = useState<boolean>(false);
  const [copiedWildcard, setCopiedWildcard] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const projectId = firebaseConfigJson.projectId || 'bundacare-d4664';
  const consoleAuthUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;

  const handleCopyDomain = (domain: string, isWildcard = false) => {
    navigator.clipboard.writeText(domain);
    if (isWildcard) {
      setCopiedWildcard(true);
      setTimeout(() => setCopiedWildcard(false), 2500);
    } else {
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2500);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-amber-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500 text-white shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-800">
                Otorisasi Domain Firebase Diperlukan
              </h3>
              <p className="text-xs text-amber-900 font-mono">
                Error: auth/unauthorized-domain (Project: {projectId})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              Mengapa pesan ini muncul?
            </p>
            <p className="text-slate-700 leading-relaxed">
              Google Firebase mewajibkan setiap domain aplikasi didaftarkan pada daftar <strong>Authorized Domains</strong> demi keamanan sebelum login Google dapat dilakukan.
            </p>
          </div>

          {/* Domain Copy Box */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">
              Domain Aplikasi Anda Saat Ini:
            </label>
            <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="font-mono text-xs font-bold text-slate-800 flex-1 truncate select-all">
                {currentHostname}
              </span>
              <button
                onClick={() => handleCopyDomain(currentHostname, false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  copiedDomain
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                }`}
              >
                {copiedDomain ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedDomain ? 'Tersalin!' : 'Salin Domain'}</span>
              </button>
            </div>
          </div>

          {/* Step-by-Step Instructions */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-700 block">
              Cara Mendaftarkan di Firebase Console (Hanya 1 Menit):
            </label>
            <ol className="space-y-2 text-xs text-slate-600 list-decimal pl-4 leading-relaxed">
              <li>
                Buka tab pengaturan Firebase:
                <div className="mt-1">
                  <a
                    href={consoleAuthUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-bold transition-colors cursor-pointer"
                  >
                    <span>Buka Firebase Console &rarr; Auth Settings</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </li>
              <li>
                Pilih tab <strong>Settings</strong> &rarr; cari bagian <strong>Authorized domains</strong>.
              </li>
              <li>
                Klik tombol <strong>Add domain</strong>, lalu <em>Paste</em> (tempel) domain yang disalin di atas: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-800 font-bold">{currentHostname}</code>
              </li>
              <li>
                Klik <strong>Add</strong> untuk menyimpan.
              </li>
            </ol>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Tips Rekomendasi:</span> Anda juga dapat menambahkan domain <code className="font-mono font-bold">run.app</code> agar seluruh link preview &amp; deployment berikutnya otomatis diizinkan.
              <button
                onClick={() => handleCopyDomain('run.app', true)}
                className="ml-2 text-[11px] font-bold text-blue-700 underline hover:text-blue-900 cursor-pointer"
              >
                {copiedWildcard ? '✓ run.app tersalin' : 'Salin "run.app"'}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Tutup
          </button>
          <div className="flex items-center gap-2">
            <a
              href={consoleAuthUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka Firebase Console</span>
            </a>
            {onRetry && (
              <button
                onClick={() => {
                  onClose();
                  onRetry();
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
              >
                Coba Login Lagi
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
