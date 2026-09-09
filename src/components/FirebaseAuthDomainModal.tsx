import React, { useState } from 'react';
import { Copy, Check, ExternalLink, ShieldAlert, X, Info, AlertTriangle, Users, Globe } from 'lucide-react';
import firebaseConfigJson from '../../firebase-applet-config.json';

interface FirebaseAuthDomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => void;
  initialTab?: 'test_users' | 'domain';
}

export default function FirebaseAuthDomainModal({
  isOpen,
  onClose,
  onRetry,
  initialTab = 'test_users'
}: FirebaseAuthDomainModalProps) {
  const [activeTab, setActiveTab] = useState<'test_users' | 'domain'>(initialTab);
  const [copiedDomain, setCopiedDomain] = useState<boolean>(false);
  const [copiedWildcard, setCopiedWildcard] = useState<boolean>(false);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);

  if (!isOpen) return null;

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const projectId = firebaseConfigJson.projectId || 'database-online-750f1';
  const consoleAuthUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;
  const consoleOAuthConsentUrl = `https://console.cloud.google.com/apis/credentials/consent?project=${projectId}`;
  const userEmail = 'bercerita6654@gmail.com';

  const handleCopy = (text: string, type: 'domain' | 'wildcard' | 'email') => {
    navigator.clipboard.writeText(text);
    if (type === 'domain') {
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 2500);
    } else if (type === 'wildcard') {
      setCopiedWildcard(true);
      setTimeout(() => setCopiedWildcard(false), 2500);
    } else {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2500);
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
                Panduan Izin Akses Google &amp; Firebase
              </h3>
              <p className="text-xs text-amber-900 font-mono">
                Project ID: {projectId}
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

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('test_users')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'test_users'
                ? 'bg-white text-orange-600 border-t border-x border-slate-200 -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Solusi &quot;Akses Diblokir / Verifikasi Google&quot;</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('domain')}
            className={`px-3.5 py-2 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'domain'
                ? 'bg-white text-orange-600 border-t border-x border-slate-200 -mb-px shadow-xs'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>Otorisasi Domain</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {activeTab === 'test_users' ? (
            <>
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-950 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5 text-red-800">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  Penyebab Pesan &quot;Akses Diblokir: belum menyelesaikan proses verifikasi Google&quot;
                </p>
                <p className="text-slate-700 leading-relaxed">
                  Project Google Cloud <strong className="font-mono text-slate-900">{projectId}</strong> saat ini berada dalam status <strong>Testing (Pengujian)</strong>. Untuk keamanan, Google hanya mengizinkan akun yang telah didaftarkan di daftar <strong>Test Users (Pengguna Uji)</strong>.
                </p>
              </div>

              {/* Solusi 1: Tambahkan Email Test User */}
              <div className="space-y-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 block">
                    Langkah 1: Salin Email Anda
                  </label>
                  <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Hanya butuh 30 detik
                  </span>
                </div>

                <div className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl">
                  <span className="font-mono text-xs font-bold text-slate-800 flex-1 truncate select-all px-1">
                    {userEmail}
                  </span>
                  <button
                    onClick={() => handleCopy(userEmail, 'email')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      copiedEmail
                        ? 'bg-emerald-600 text-white'
                        : 'bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200'
                    }`}
                  >
                    {copiedEmail ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedEmail ? 'Tersalin!' : 'Salin Email'}</span>
                  </button>
                </div>

                <label className="text-xs font-bold text-slate-800 block pt-1">
                  Langkah 2: Tambahkan di Google Cloud Console
                </label>
                <ol className="space-y-2 text-xs text-slate-600 list-decimal pl-4 leading-relaxed">
                  <li>
                    Buka halaman <strong>OAuth Consent Screen</strong> di Google Cloud Console:
                    <div className="mt-1.5">
                      <a
                        href={consoleOAuthConsentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-all shadow-xs cursor-pointer text-xs"
                      >
                        <span>Buka OAuth Consent Screen Google Cloud</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </li>
                  <li>
                    Scroll ke bawah ke bagian <strong>Test users (Pengguna uji)</strong>.
                  </li>
                  <li>
                    Klik tombol <strong>+ ADD USERS</strong> (+ Tambah Pengguna).
                  </li>
                  <li>
                    Tempel (Paste) email Anda: <code className="bg-white px-1.5 py-0.5 rounded font-mono font-bold text-slate-800 border border-slate-200">{userEmail}</code> (bisa tambahkan juga email Gmail lain yang Anda gunakan).
                  </li>
                  <li>
                    Klik <strong>SAVE (Simpan)</strong>.
                  </li>
                </ol>
              </div>

              {/* Alternatif Publikasi */}
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-950 space-y-1">
                <p className="font-bold text-blue-900 flex items-center gap-1">
                  <Info className="w-4 h-4 text-blue-600 shrink-0" />
                  Opsi Lain (Publikasikan Aplikasi):
                </p>
                <p className="text-slate-700 leading-relaxed text-[11px]">
                  Jika Anda ingin semua anggota tim bisa login tanpa mendaftarkan email satu per satu, pada halaman OAuth consent screen di atas klik tombol <strong>PUBLISH APP (Publikasikan Aplikasi)</strong>.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Mengapa otorisasi domain diperlukan?
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
                    onClick={() => handleCopy(currentHostname, 'domain')}
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
                  Cara Mendaftarkan di Firebase Console:
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
                    Klik tombol <strong>Add domain</strong>, lalu <em>Paste</em> domain: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-800 font-bold">{currentHostname}</code>
                  </li>
                  <li>
                    Klik <strong>Add</strong> untuk menyimpan.
                  </li>
                </ol>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Tips:</span> Anda juga dapat menambahkan domain <code className="font-mono font-bold">run.app</code> agar seluruh URL preview berikutnya otomatis diizinkan.
                  <button
                    onClick={() => handleCopy('run.app', 'wildcard')}
                    className="ml-2 text-[11px] font-bold text-blue-700 underline hover:text-blue-900 cursor-pointer"
                  >
                    {copiedWildcard ? '✓ run.app tersalin' : 'Salin "run.app"'}
                  </button>
                </div>
              </div>
            </>
          )}
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
              href={activeTab === 'test_users' ? consoleOAuthConsentUrl : consoleAuthUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{activeTab === 'test_users' ? 'Buka OAuth Consent Screen' : 'Buka Firebase Console'}</span>
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
