/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Tag, X, LayoutGrid, Package, Plus, ChevronDown } from 'lucide-react';
import { Product } from '../types';

interface CategoryModalProps {
  show: boolean;
  onClose: () => void;
  categories: string[];
  skuCategoryMap: Record<string, string>;
  productList: Product[];
  onAdd: (products: Product[]) => void;
}

export default function CategoryModal({
  show,
  onClose,
  categories,
  skuCategoryMap,
  productList,
  onAdd
}: CategoryModalProps) {
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categorySearchResults, setCategorySearchResults] = useState<Product[]>([]);

  if (!show) return null;

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    if (!category) {
      setCategorySearchResults([]);
      return;
    }
    const results = productList.filter(p => skuCategoryMap[p.sku] === category);
    setCategorySearchResults(results);
  };

  const handleAddAll = () => {
    onAdd(categorySearchResults);
    setSelectedCategory('');
    setCategorySearchResults([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white">
          <h3 className="font-bold text-slate-900 uppercase tracking-wider text-sm flex items-center">
            <Tag className="w-4 h-4 mr-2 text-indigo-600" /> Tambah Banyak (Kategori)
          </h3>
          <button
            onClick={() => {
              onClose();
              setSelectedCategory('');
              setCategorySearchResults([]);
            }}
            className="text-slate-400 hover:text-slate-900 hover:bg-slate-100 p-1.5 rounded-md transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-5 bg-slate-50/50">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Pilih Kategori Produk
            </label>
            <div className="relative">
              <select
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-none cursor-pointer shadow-sm appearance-none font-semibold text-slate-700 pr-10"
                value={selectedCategory}
                onChange={e => handleCategorySelect(e.target.value)}
              >
                <option value="">-- Silakan Pilih Kategori --</option>
                {categories.map((cat, i) => (
                  <option key={i} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg bg-white p-2 max-h-56 overflow-y-auto shadow-inner">
            {selectedCategory === '' ? (
              <div className="text-xs text-center text-slate-400 py-6 flex flex-col items-center">
                <LayoutGrid className="w-5 h-5 mb-2 opacity-35 text-slate-300" />
                Pilih kategori di atas
              </div>
            ) : categorySearchResults.length === 0 ? (
              <div className="text-xs text-center text-slate-500 py-6 flex flex-col items-center">
                <Package className="w-5 h-5 mb-2 opacity-35 text-slate-300" />
                Kosong
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-[9px] font-bold text-indigo-600 uppercase tracking-wider mb-2 px-2 border-b border-slate-100 pb-2">
                  Ditemukan {categorySearchResults.length} produk di {selectedCategory}:
                </div>
                {categorySearchResults.slice(0, 100).map((p, i) => (
                  <div
                    key={i}
                    className="text-[11px] p-2 bg-slate-50 hover:bg-indigo-50 border border-slate-100 rounded-md flex justify-between items-center transition-colors"
                  >
                    <span className="truncate pr-3 font-medium text-slate-700">{p.name}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-white border border-slate-200 text-slate-500 rounded font-mono flex-shrink-0">
                      {p.sku}
                    </span>
                  </div>
                ))}
                {categorySearchResults.length > 100 && (
                  <div className="text-[10px] text-center text-slate-400 pt-2 italic border-t border-slate-100 mt-2">
                    ...dan {categorySearchResults.length - 100} lainnya
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
            disabled={categorySearchResults.length === 0}
            className="px-5 py-2 text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg transition-all disabled:opacity-50 flex items-center shadow-sm active:scale-95"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Tambah Semua ({categorySearchResults.length})
          </button>
        </div>
      </div>
    </div>
  );
}
