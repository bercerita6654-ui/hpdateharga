/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Search, X, Package, Plus } from 'lucide-react';
import { Product } from '../types';

interface BrandModalProps {
  show?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  productList: Product[];
  skuCategoryMap?: Record<string, string>;
  onAdd?: (products: Product[]) => void;
  onSelectProduct?: (sku: string) => void;
  onBulkAddProducts?: (products: Product[], brandName: string) => void;
  title?: string;
  bulkActionLabel?: string;
  filterInStockOnly?: boolean;
}

export default function BrandModal({
  show,
  isOpen,
  onClose,
  productList,
  skuCategoryMap,
  onAdd,
  onSelectProduct,
  onBulkAddProducts,
  title = 'Tambah Banyak (Pencarian / Merk)',
  bulkActionLabel,
  filterInStockOnly = false
}: BrandModalProps) {
  const [brandSearchTerm, setBrandSearchTerm] = useState('');
  const [brandSearchResults, setBrandSearchResults] = useState<Product[]>([]);

  const isModalOpen = isOpen !== undefined ? isOpen : !!show;
  if (!isModalOpen) return null;

  const handleBrandSearch = (term: string) => {
    setBrandSearchTerm(term);
    if (!term.trim()) {
      setBrandSearchResults([]);
      return;
    }
    const lowerTerm = term.toLowerCase().trim();
    const results = productList.filter(p => {
      if (filterInStockOnly && (p.stock ?? 0) <= 0) {
        return false;
      }
      const matchName = String(p.name || '').toLowerCase().includes(lowerTerm);
      const matchSku = String(p.sku || '').toLowerCase().includes(lowerTerm);
      const matchCat = skuCategoryMap && p.sku && skuCategoryMap[p.sku]
        ? String(skuCategoryMap[p.sku]).toLowerCase().includes(lowerTerm)
        : false;
      return matchName || matchSku || matchCat;
    });
    setBrandSearchResults(results);
  };

  const handleAddAll = () => {
    if (onBulkAddProducts) {
      onBulkAddProducts(brandSearchResults, brandSearchTerm || 'Pencarian');
    } else if (onAdd) {
      onAdd(brandSearchResults);
    }
    setBrandSearchTerm('');
    setBrandSearchResults([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
          <h3 className="font-bold text-slate-900 uppercase tracking-wider text-sm flex items-center">
            <Search className="w-4 h-4 mr-2 text-indigo-600" /> {title}
          </h3>
          <button
            onClick={() => {
              onClose();
              setBrandSearchTerm('');
              setBrandSearchResults([]);
            }}
            className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 p-1 rounded-md transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-5 bg-slate-50/50">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Ketik Merk / Kata Kunci Produk
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
              <input
                type="text"
                autoFocus
                className="w-full p-2.5 pl-9 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none transition-all shadow-sm"
                placeholder="Contoh: 'Buku', 'Bimoli'..."
                value={brandSearchTerm}
                onChange={e => handleBrandSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg bg-white p-2 max-h-56 overflow-y-auto shadow-inner">
            {brandSearchTerm.trim() === '' ? (
              <div className="text-xs text-center text-slate-400 py-6 flex flex-col items-center">
                <Search className="w-5 h-5 mb-2 opacity-35 text-slate-300" />
                Ketik kata kunci untuk mencari produk
              </div>
            ) : brandSearchResults.length === 0 ? (
              <div className="text-xs text-center text-slate-500 py-6 flex flex-col items-center">
                <Package className="w-5 h-5 mb-2 opacity-35 text-slate-300" />
                Tidak ada produk yang cocok
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider mb-2 px-2 border-b border-slate-100 pb-2">
                  <span className="text-indigo-600">Ditemukan {brandSearchResults.length} produk:</span>
                  {filterInStockOnly && (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                      Hanya yang Berstok
                    </span>
                  )}
                </div>
                {brandSearchResults.slice(0, 100).map((p, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      if (onSelectProduct && p.sku) {
                        onSelectProduct(p.sku);
                      }
                    }}
                    className={`text-[11px] p-2 bg-slate-50 hover:bg-indigo-50 border border-slate-100 rounded-md flex justify-between items-center transition-colors ${
                      onSelectProduct ? 'cursor-pointer hover:border-indigo-200' : ''
                    }`}
                  >
                    <span className="truncate pr-3 font-medium text-slate-700">{p.name}</span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {p.stock !== undefined && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                          p.stock > 0
                            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                            : 'bg-slate-100 border border-slate-200 text-slate-400'
                        }`}>
                          Stok: {p.stock}
                        </span>
                      )}
                      <span className="text-[9px] px-1.5 py-0.5 bg-white border border-slate-200 text-slate-500 rounded font-mono">
                        {p.sku}
                      </span>
                    </div>
                  </div>
                ))}
                {brandSearchResults.length > 100 && (
                  <div className="text-[10px] text-center text-slate-400 pt-2 italic border-t border-slate-100 mt-2">
                    ...dan {brandSearchResults.length - 100} produk lainnya
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="p-4 border-t border-slate-100 bg-white flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Batal
          </button>
          <button
            onClick={handleAddAll}
            disabled={brandSearchResults.length === 0}
            className="px-5 py-2 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-all disabled:opacity-50 flex items-center shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4 mr-1.5" /> {bulkActionLabel || `Tambah Semua (${brandSearchResults.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
