import React, { useState, useMemo } from 'react';
import {
  Calculator,
  Search,
  ShoppingBag,
  Check,
  Copy,
  ExternalLink,
  HelpCircle
} from 'lucide-react';
import { Product } from '../types';
import { formatIDR } from '../utils/helpers';

export const calculateTokopediaPrice = (
  eceran: number,
  adminPercent: number,
  fixedFee: number,
  roundingMode: string
): number => {
  if (!eceran || isNaN(eceran) || eceran <= 0) return 0;
  const adminVal = (eceran * adminPercent) / 100;
  const rawTotal = eceran + adminVal + fixedFee;
  
  if (roundingMode === '1000') {
    return Math.ceil(rawTotal / 1000) * 1000;
  }
  if (roundingMode === '500') {
    return Math.ceil(rawTotal / 500) * 500;
  }
  if (roundingMode === '100') {
    return Math.ceil(rawTotal / 100) * 100;
  }
  return Math.round(rawTotal);
};

export interface TokopediaSimulatorProps {
  productList: Product[];
  adminPercent: number;
  fixedFee: number;
  rounding: string;
  selectedProductSku: string;
  setSelectedProductSku: (sku: string) => void;
  manualEceran: string;
  setManualEceran: (val: string) => void;
  copiedSku: string | null;
  handleCopy: (text: string | number, skuIdentifier?: string) => void;
  showToast: (msg: string) => void;
  setProduct?: (product: Product | ((prev: Product) => Product)) => void;
  setSelectedSku?: (sku: string) => void;
  setActiveView?: (view: any) => void;
}

export default function TokopediaSimulator({
  productList,
  adminPercent,
  fixedFee,
  rounding,
  selectedProductSku,
  setSelectedProductSku,
  manualEceran,
  setManualEceran,
  copiedSku,
  handleCopy,
  showToast,
  setProduct,
  setSelectedSku,
  setActiveView
}: TokopediaSimulatorProps) {
  const [searchProductQuery, setSearchProductQuery] = useState<string>('');
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);

  // Active product selected from catalog
  const activeSingleProduct = useMemo(() => {
    if (!selectedProductSku) return undefined;
    return productList.find(p => String(p.sku || '').trim() === String(selectedProductSku).trim());
  }, [productList, selectedProductSku]);

  // Dropdown list filtering
  const dropdownFilteredProducts = useMemo(() => {
    if (!searchProductQuery.trim()) {
      return productList.slice(0, 15);
    }
    const q = searchProductQuery.toLowerCase().trim();
    return productList
      .filter(p => (p.sku && p.sku.toLowerCase().includes(q)) || (p.name && p.name.toLowerCase().includes(q)))
      .slice(0, 20);
  }, [productList, searchProductQuery]);

  // Single calculation result
  const singleCalculation = useMemo(() => {
    let baseEceran = 0;
    if (manualEceran !== '' && !isNaN(Number(manualEceran))) {
      baseEceran = Number(manualEceran);
    } else if (activeSingleProduct) {
      baseEceran = activeSingleProduct.eceran || 0;
    }

    const adminVal = (baseEceran * adminPercent) / 100;
    const rawTotal = baseEceran + adminVal + fixedFee;
    const finalPrice = calculateTokopediaPrice(baseEceran, adminPercent, fixedFee, rounding);

    return {
      eceran: baseEceran,
      adminVal,
      fixedFee,
      rawTotal,
      finalPrice,
      adminPercent
    };
  }, [manualEceran, activeSingleProduct, adminPercent, fixedFee, rounding]);

  return (
    <div id="simulasi-cepat-tokopedia" className="grid grid-cols-1 lg:grid-cols-12 gap-6 scroll-mt-6">
      {/* LEFT: INTERACTIVE SIMULATOR (7 COLS) */}
      <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-800 tracking-tight">Simulasi Cepat Tokopedia</h2>
                <p className="text-[11px] text-slate-400">Pilih dari katalog atau ketik langsung harga Eceran</p>
              </div>
            </div>

            {selectedProductSku && (
              <button
                onClick={() => {
                  setSelectedProductSku('');
                  setManualEceran('');
                  setSearchProductQuery('');
                }}
                className="text-[10px] text-slate-400 hover:text-red-500 font-bold px-2 py-1 rounded bg-slate-100 hover:bg-red-50 transition-colors"
              >
                Reset Pilihan
              </button>
            )}
          </div>

          {/* PRODUCT SELECTOR / SEARCH */}
          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span>1. Pilih Produk Katalog (Opsional)</span>
                <span className="text-[10px] text-emerald-600 font-semibold lowercase">
                  {productList.length} produk tersedia
                </span>
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Cari SKU atau nama produk di katalog..."
                  value={searchProductQuery}
                  onChange={e => {
                    setSearchProductQuery(e.target.value);
                    setShowProductDropdown(true);
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />

                {/* Dropdown Suggestions */}
                {showProductDropdown && dropdownFilteredProducts.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 max-h-60 overflow-y-auto z-50 divide-y divide-slate-100 animate-in fade-in slide-in-from-top-2">
                    <div className="p-2 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase flex justify-between">
                      <span>Pilih Produk</span>
                      <button 
                        onClick={() => setShowProductDropdown(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Tutup
                      </button>
                    </div>
                    {dropdownFilteredProducts.map(p => (
                      <div
                        key={p.sku}
                        onClick={() => {
                          setSelectedProductSku(p.sku);
                          setManualEceran('');
                          setSearchProductQuery(`${p.sku} - ${p.name}`);
                          setShowProductDropdown(false);
                        }}
                        className={`p-2.5 hover:bg-emerald-50/70 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                          selectedProductSku === p.sku ? 'bg-emerald-50 font-bold' : ''
                        }`}
                      >
                        <div className="truncate pr-3">
                          <span className="font-mono font-bold text-emerald-700 mr-2">{p.sku}</span>
                          <span className="text-slate-700">{p.name}</span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-mono font-bold text-slate-800">{formatIDR(p.eceran)}</div>
                          <div className="text-[10px] text-slate-400">Eceran</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* MANUAL ECERAN INPUT */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                2. Atau Ketik Nominal Harga Eceran (Rp)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-3 text-slate-400 font-bold text-sm">Rp</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Contoh: 100000"
                  value={manualEceran !== '' ? manualEceran : (activeSingleProduct ? activeSingleProduct.eceran : '')}
                  onChange={e => {
                    setManualEceran(e.target.value);
                    if (selectedProductSku) setSelectedProductSku('');
                  }}
                  className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-inner"
                />
              </div>
            </div>
          </div>

          {/* BREAKDOWN DISPLAY */}
          <div className="mt-5 p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2.5 text-xs">
            <div className="flex justify-between items-center text-slate-600">
              <span>Harga Eceran (Acuan Awal)</span>
              <span className="font-mono font-bold text-slate-900">{formatIDR(singleCalculation.eceran)}</span>
            </div>
            <div className="flex justify-between items-center text-emerald-700">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Komisi Admin Tokopedia (+{adminPercent}%)
              </span>
              <span className="font-mono font-bold">+ {formatIDR(singleCalculation.adminVal)}</span>
            </div>
            <div className="flex justify-between items-center text-emerald-700">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Biaya Packing & Operasional Tetap
              </span>
              <span className="font-mono font-bold">+ {formatIDR(singleCalculation.fixedFee)}</span>
            </div>
            <div className="pt-3 border-t border-slate-200 flex justify-between items-center bg-emerald-50/60 p-2.5 rounded-lg -mx-1 border border-emerald-100/80">
              <div>
                <span className="text-xs font-bold text-slate-700 block">Total Sebelum Pembulatan:</span>
                <span className="text-[10px] text-slate-400">Harga murni (Eceran + {adminPercent}% + {formatIDR(fixedFee)})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-black text-lg md:text-xl text-emerald-900 tracking-tight">
                  {formatIDR(singleCalculation.rawTotal)}
                </span>
                <button
                  onClick={() => handleCopy(singleCalculation.rawTotal, 'raw_total')}
                  className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-100 rounded transition-colors cursor-pointer"
                  title="Salin total sebelum pembulatan"
                >
                  {copiedSku === 'raw_total' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* FINAL RESULT PROMINENT CARD */}
        <div className="mt-6 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl p-5 text-white shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-emerald-100 flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-200" />
              Rekomendasi Harga Jual Tokopedia ({rounding === 'none' ? 'Asli' : `Bulat ${rounding}`})
            </div>
            <div className="text-3xl font-black font-mono tracking-tight text-white mt-1">
              {formatIDR(singleCalculation.finalPrice)}
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleCopy(singleCalculation.finalPrice, 'single_main')}
              disabled={singleCalculation.finalPrice <= 0}
              className="flex-1 sm:flex-initial px-4 py-2.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {copiedSku === 'single_main' ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  Tersalin!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-emerald-600" />
                  Salin Harga
                </>
              )}
            </button>

            {setActiveView && setProduct && (
              <button
                onClick={() => {
                  if (singleCalculation.finalPrice > 0) {
                    setProduct(prev => ({
                      ...prev,
                      basePrice: singleCalculation.finalPrice,
                      ...(activeSingleProduct ? { hpp: activeSingleProduct.hpp } : {})
                    }));
                    if (activeSingleProduct && setSelectedSku) {
                      setSelectedSku(activeSingleProduct.sku);
                    }
                    setActiveView('calculator');
                    showToast('Harga dibawa ke kalkulator utama');
                  }
                }}
                disabled={singleCalculation.finalPrice <= 0}
                className="px-3 py-2.5 bg-emerald-700/60 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs border border-emerald-400/30 flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                title="Gunakan harga ini di Kalkulator Utama"
              >
                <ExternalLink className="w-4 h-4" />
                Kalkulator Utama
              </button>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT: PEDOMAN TOKOPEDIA (5 COLS) */}
      <div className="lg:col-span-5 space-y-6 flex flex-col justify-between">
        {/* Guidance Info Card */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-6 text-emerald-950 shadow-sm space-y-3.5 h-full flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-emerald-900 mb-2">
              <HelpCircle className="w-4 h-4 text-emerald-600" />
              Penjelasan Rumus Tokopedia
            </div>
            <ul className="text-xs text-emerald-900/90 space-y-2.5 list-disc pl-4 leading-relaxed">
              <li>
                <strong>Harga Eceran:</strong> Menjadi patokan dasar pendapatan bersih toko Anda sebelum dipotong biaya platform.
              </li>
              <li>
                <strong>+{adminPercent}% Komisi:</strong> Mencakup rata-rata potongan biaya layanan Tokopedia (Official Store / Power Merchant Pro) serta perkiraan biaya program promosi atau cashback.
              </li>
              <li>
                <strong>+{formatIDR(fixedFee)}:</strong> Alokasi biaya kardus packing, bubble wrap, lakban, label thermal, dan biaya admin proses transaksi lainnya.
              </li>
              <li>
                <strong>Pembulatan {rounding === 'none' ? 'Tanpa Pembulatan' : rounding}:</strong> Memastikan harga tayang rapi (misal Rp 64.900 dibulatkan menjadi Rp 65.000) agar menarik pembeli dan memudahkan perhitungan voucher toko.
              </li>
            </ul>
          </div>

          <div className="pt-4 border-t border-emerald-200/70 text-[11px] text-emerald-800/80 bg-white/60 p-3 rounded-xl border border-emerald-200/50">
            <span className="font-bold text-emerald-900 block mb-0.5">💡 Tips Penggunaan:</span>
            Gunakan pencarian SKU atau masukkan nominal manual untuk melihat rincian kalkulasi seketika, atau unduh daftar harga lengkap seluruh produk lewat tabel katalog di atas.
          </div>
        </div>
      </div>
    </div>
  );
}
