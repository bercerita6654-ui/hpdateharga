/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Database, RefreshCw, ChevronDown, User, Globe, ShoppingCart, Trash2, Send, Loader2, Search } from 'lucide-react';
import { Product, CompetitorCartItem } from '../types';
import { formatIDR, formatInput, parseInput } from '../utils/helpers';

interface CompetitorTabProps {
  productList: Product[];
  selectedSku: string;
  selectedProductData: Product | undefined;
  setSelectedSku: (sku: string) => void;
  setProduct: React.Dispatch<React.SetStateAction<{ hpp: number; basePrice: number }>>;
  compForm: {
    ownPrice: string | number;
    compAName: string;
    compAPrice: string | number;
    compALink: string;
    compBName: string;
    compBPrice: string | number | null;
    compBLink: string;
  };
  setCompForm: React.Dispatch<React.SetStateAction<any>>;
  competitorCart: CompetitorCartItem[];
  setCompetitorCart: React.Dispatch<React.SetStateAction<CompetitorCartItem[]>>;
  isSending: boolean;
  submissionNote: string;
  setSubmissionNote: (val: string) => void;
  isAdmin: boolean;
  handleSendSubmission: (type: string) => void;
  fetchCsvData: () => void;
  isLoading: boolean;
  t1ResultSellingPrice: number;
  showProductList: boolean;
  setShowProductList: (val: boolean) => void;
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  filteredProducts: Product[];
}

export default function CompetitorTab({
  productList,
  selectedSku,
  selectedProductData,
  setSelectedSku,
  setProduct,
  compForm,
  setCompForm,
  competitorCart,
  setCompetitorCart,
  isSending,
  submissionNote,
  setSubmissionNote,
  isAdmin,
  handleSendSubmission,
  fetchCsvData,
  isLoading,
  t1ResultSellingPrice,
  showProductList,
  setShowProductList,
  searchTerm,
  setSearchTerm,
  filteredProducts
}: CompetitorTabProps) {
  const [displayLimit, setDisplayLimit] = useState(100);

  const handleSelectProductLocal = (p: Product) => {
    setSelectedSku(p.sku);
    setProduct({ hpp: p.hpp, basePrice: p.eceran });
    setShowProductList(false);
    setSearchTerm('');
  };

  const handleCompFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (['compAPrice', 'compBPrice'].includes(name)) {
      setCompForm({ ...compForm, [name]: parseInput(value) });
    } else {
      setCompForm({ ...compForm, [name]: value });
    }
  };

  const addToCompetitorCart = () => {
    if (!selectedSku || !compForm.compAName || !compForm.compAPrice) {
      alert('Isi Nama & Harga Kompetitor A!');
      return;
    }
    const ownPrice = compForm.ownPrice !== '' ? Number(compForm.ownPrice) : t1ResultSellingPrice;
    setCompetitorCart([
      ...competitorCart,
      {
        id: Date.now(),
        addedAt: new Date().toISOString(),
        sku: selectedSku,
        name: selectedProductData?.name || 'Unknown',
        ownPrice: ownPrice,
        compAName: compForm.compAName,
        compAPrice: Number(compForm.compAPrice),
        compALink: compForm.compALink,
        compBName: compForm.compBName || '',
        compBPrice: compForm.compBPrice ? Number(compForm.compBPrice) : null,
        compBLink: compForm.compBLink || '',
        itemStatus: 'pending',
        isCompetitorData: true,
        hpp: selectedProductData?.hpp || 0,
        eceran: selectedProductData?.eceran || 0,
        grosir: selectedProductData?.grosir || 0,
        partai: selectedProductData?.partai || 0
      }
    ]);
    setCompForm({ ownPrice: '', compAName: '', compAPrice: '', compALink: '', compBName: '', compBPrice: '', compBLink: '' });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
      <datalist id="competitors-list">
        <option value="karya mandiri" />
        <option value="nadhimart" />
      </datalist>

      <div className="lg:col-span-4 space-y-6">
        <div className="bg-white rounded-xl p-5 relative flex flex-col border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <h3 className="font-bold flex items-center text-slate-900 text-xs uppercase tracking-widest">
              <Database className="w-4 h-4 mr-2 text-indigo-600" /> Pilih Produk
            </h3>
            <button
              onClick={fetchCsvData}
              disabled={isLoading}
              className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-500 border border-slate-200 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="relative mb-5">
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Pilih Produk
            </label>
            <div
              className="flex items-center justify-between w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 cursor-pointer hover:border-blue-400 hover:bg-white hover:shadow-sm transition-all group"
              onClick={() => {
                setShowProductList(!showProductList);
              }}
            >
              <span className={`truncate font-semibold flex-1 mr-2 ${selectedSku ? 'text-slate-800' : 'text-slate-400'}`}>
                {selectedSku ? `${selectedSku} - ${selectedProductData?.name}` : 'Klik untuk mencari produk...'}
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-blue-500 flex-shrink-0" />
            </div>

            {showProductList && (
              <div className="absolute z-50 top-full left-0 right-0 md:w-[150%] mt-2 bg-white border border-slate-200/80 rounded-2xl shadow-xl max-h-[400px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 sticky top-0 bg-slate-50/90 backdrop-blur-sm border-b border-slate-100 z-10">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                    <input
                      autoFocus
                      type="text"
                      className="w-full p-2.5 pl-9 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-sm"
                      placeholder="Cari SKU atau Nama Produk..."
                      value={searchTerm}
                      onChange={e => {
                        setSearchTerm(e.target.value);
                        setDisplayLimit(100);
                      }}
                    />
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2 bg-white">
                  {filteredProducts.slice(0, displayLimit).map((p, i) => (
                    <div
                      key={i}
                      className="p-3 text-sm hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-xl transition-all flex items-center cursor-pointer mb-1"
                      onClick={() => handleSelectProductLocal(p)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 truncate">{p.name}</div>
                        <div className="text-slate-500 flex justify-between mt-0.5 text-xs">
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[9px]">{p.sku}</span>
                          <span className="font-semibold text-blue-600">{formatIDR(p.eceran)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredProducts.length > displayLimit && (
                    <div
                      className="p-3 mt-2 text-center text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-dashed border-indigo-200 rounded-xl cursor-pointer transition-colors"
                      onClick={e => {
                        e.stopPropagation();
                        setDisplayLimit(prev => prev + 100);
                      }}
                    >
                      ↓ Tampilkan Lebih Banyak (Sisa {filteredProducts.length - displayLimit} Produk) ↓
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="mt-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-widest">
              Harga Jual Kita (Edit)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-mono font-bold text-sm">Rp</span>
              <input
                type="text"
                inputMode="numeric"
                className="w-full p-2 pl-9 text-base font-mono font-bold text-slate-900 bg-white border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all"
                value={formatInput(compForm.ownPrice)}
                onChange={e => setCompForm({ ...compForm, ownPrice: parseInput(e.target.value) })}
                placeholder={String(t1ResultSellingPrice || 0)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-8 space-y-6">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
            <h3 className="font-bold text-xs uppercase tracking-widest text-slate-900">
              Data Kompetitor
            </h3>
            <button
              onClick={addToCompetitorCart}
              disabled={!selectedSku || !compForm.compAName}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] uppercase tracking-widest font-bold py-2 px-4 rounded-lg shadow-sm active:scale-95 transition-all flex items-center disabled:opacity-50 disabled:grayscale"
            >
              Tambah Banding
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 bg-rose-50/30 rounded-2xl border border-rose-100 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-rose-500 text-white text-[9px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                Kompetitor 1
              </div>
              <h4 className="font-bold text-rose-800 mb-4 flex items-center">
                <User className="w-4 h-4 mr-1.5 opacity-70" /> Data Utama
              </h4>
              <div className="space-y-3.5 relative z-10">
                <div>
                  <label className="text-[10px] font-semibold text-rose-700 block mb-1">Nama Toko</label>
                  <input
                    list="competitors-list"
                    className="w-full p-2.5 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500/30 outline-none bg-white shadow-sm transition-all"
                    placeholder="Contoh: Karya Mandiri..."
                    value={compForm.compAName}
                    name="compAName"
                    onChange={handleCompFormChange}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-rose-700 block mb-1">Harga Jual</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-rose-400 font-medium">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full p-2.5 pl-9 border border-rose-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-rose-500/30 outline-none bg-white shadow-sm transition-all"
                      placeholder="100.000"
                      value={formatInput(compForm.compAPrice)}
                      name="compAPrice"
                      onChange={handleCompFormChange}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-rose-700 block mb-1">Link URL</label>
                  <div className="relative">
                    <Globe className="w-4 h-4 absolute left-3 top-3 text-rose-300" />
                    <input
                      type="text"
                      className="w-full p-2.5 pl-9 border border-rose-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500/30 outline-none bg-white shadow-sm transition-all"
                      placeholder="https://shopee.co.id/..."
                      value={compForm.compALink}
                      name="compALink"
                      onChange={handleCompFormChange}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 bg-slate-50/80 rounded-2xl border-2 border-dashed border-slate-200 shadow-sm relative">
              <div className="absolute top-0 right-0 bg-slate-300 text-slate-600 text-[9px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                Kompetitor 2
              </div>
              <h4 className="font-bold text-slate-600 mb-4 flex items-center">
                <User className="w-4 h-4 mr-1.5 opacity-70" /> Data Pembanding{' '}
                <span className="text-[9px] bg-slate-200 font-medium px-1.5 rounded ml-2">Opsional</span>
              </h4>
              <div className="space-y-3.5 relative z-10">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">Nama Toko</label>
                  <input
                    list="competitors-list"
                    className="w-full p-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-400/30 outline-none bg-white shadow-sm transition-all"
                    placeholder="Opsional..."
                    value={compForm.compBName}
                    name="compBName"
                    onChange={handleCompFormChange}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">Harga Jual</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-medium">Rp</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="w-full p-2.5 pl-9 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-slate-400/30 outline-none bg-white shadow-sm transition-all"
                      placeholder="0"
                      value={formatInput(compForm.compBPrice || '')}
                      name="compBPrice"
                      onChange={handleCompFormChange}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">Link URL</label>
                  <div className="relative">
                    <Globe className="w-4 h-4 absolute left-3 top-3 text-slate-300" />
                    <input
                      type="text"
                      className="w-full p-2.5 pl-9 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-400/30 outline-none bg-white shadow-sm transition-all"
                      placeholder="https://tokopedia.com/..."
                      value={compForm.compBLink}
                      name="compBLink"
                      onChange={handleCompFormChange}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200">
          <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center">
            <h4 className="font-bold text-xs uppercase tracking-widest flex items-center text-slate-900">
              <ShoppingCart className="w-4 h-4 mr-2 text-indigo-600" /> Draft Review ({competitorCart.length})
            </h4>
            {competitorCart.length > 0 && isAdmin && (
              <button
                onClick={() => handleSendSubmission('competitor')}
                disabled={isSending}
                className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-bold px-4 py-2 rounded-lg hover:bg-slate-800 transition-all shadow-sm active:scale-95 flex items-center"
              >
                {isSending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                )}
                Ajukan Review
              </button>
            )}
          </div>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="bg-slate-50 font-bold text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Produk</th>
                  <th className="p-3 text-right bg-indigo-50/50 text-indigo-700">Kita</th>
                  <th className="p-3 border-l border-slate-200">Komp A</th>
                  <th className="p-3 text-right text-rose-600 bg-rose-50/50">Harga A</th>
                  <th className="p-3 border-l border-slate-200">Komp B</th>
                  <th className="p-3 text-right text-orange-600 bg-orange-50/50">Harga B</th>
                  <th className="p-3 text-center sticky right-0 bg-slate-50 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)]">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {competitorCart.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 text-sm font-medium">
                      Belum ada data banding yang ditambahkan.
                    </td>
                  </tr>
                ) : (
                  competitorCart.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="p-3 font-semibold text-xs text-slate-700">{c.sku}</td>
                      <td className="p-3 text-right font-black text-indigo-700 text-sm bg-indigo-50/20">
                        {formatIDR(c.ownPrice)}
                      </td>
                      <td className="p-3 font-medium text-xs border-l border-slate-100">{c.compAName}</td>
                      <td className="p-3 text-right font-black text-rose-600 text-sm bg-rose-50/20">
                        {formatIDR(c.compAPrice)}
                      </td>
                      <td className="p-3 font-medium text-xs text-slate-500 border-l border-slate-100">
                        {c.compBName || '-'}
                      </td>
                      <td className="p-3 text-right font-bold text-orange-500 text-sm bg-orange-50/20">
                        {c.compBPrice ? formatIDR(c.compBPrice) : '-'}
                      </td>
                      <td className="p-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 border-l border-slate-100 transition-colors">
                        <button
                          onClick={() => setCompetitorCart(competitorCart.filter(x => x.id !== c.id))}
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all active:scale-95"
                        >
                          <Trash2 className="w-4 h-4 mx-auto" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {competitorCart.length > 0 && isAdmin && (
            <div className="p-5 bg-slate-50 border-t border-slate-200">
              <label className="block text-xs font-bold text-slate-600 mb-2">Catatan Review (Opsional)</label>
              <textarea
                className="w-full p-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-inner resize-none"
                rows={2}
                placeholder="Tulis catatan argumen untuk pengajuan review..."
                value={submissionNote}
                onChange={e => setSubmissionNote(e.target.value)}
              ></textarea>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
