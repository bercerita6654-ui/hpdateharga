/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShoppingCart, Trash2, Download, Send, Filter, ChevronLeft, ChevronRight, Copy, Package, Loader2, Sparkles } from 'lucide-react';
import { CartItem, Fees } from '../types';
import { formatIDR, formatInput, parseInput } from '../utils/helpers';

interface CartTableProps {
  cart: CartItem[];
  canSeeHPP: boolean;
  isAdmin: boolean;
  rounding: string;
  cartItemsPerPage: number;
  setCartItemsPerPage: (val: number) => void;
  cartPage: number;
  setCartPage: React.Dispatch<React.SetStateAction<number>>;
  updateCartItem: (id: number, field: string, value: any) => void;
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  downloadCSV: (targetData: CartItem[]) => void;
  downloadJubelioCSV: (targetData: CartItem[]) => void;
  handleSendSubmission: (type: string) => void;
  isSending: boolean;
  submissionNote: string;
  setSubmissionNote: (val: string) => void;
  editingSubmissionId: string | number | null;
  handleCopyPrice: (price: number, e?: React.MouseEvent) => void;
  useSmartMargin?: boolean;
  setUseSmartMargin?: (val: boolean) => void;
  applySmartMarginsToCart?: () => void;
  fees?: Fees;
}

export default function CartTable({
  cart,
  canSeeHPP,
  isAdmin,
  cartItemsPerPage,
  setCartItemsPerPage,
  cartPage,
  setCartPage,
  updateCartItem,
  setCart,
  downloadCSV,
  downloadJubelioCSV,
  handleSendSubmission,
  isSending,
  submissionNote,
  setSubmissionNote,
  editingSubmissionId,
  handleCopyPrice,
  useSmartMargin = false,
  setUseSmartMargin,
  applySmartMarginsToCart,
  fees
}: CartTableProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  const totalCartPages = Math.ceil(cart.length / cartItemsPerPage) || 1;
  const currentCartPage = Math.min(cartPage, totalCartPages);
  const paginatedCart = cart.slice((currentCartPage - 1) * cartItemsPerPage, currentCartPage * cartItemsPerPage);

  const getActualNetMargin = (item: CartItem) => {
    if (!fees) return item.margin || 0;
    const totalPercentFee =
      (Number(fees.adminFee) || 0) +
      (Number(fees.layananXtra) || 0) +
      (Number(fees.insurance) || 0) +
      (Number(fees.komisiAMS) || 0) +
      (Number(fees.campaignFee) || 0);

    const decimal = totalPercentFee / 100;
    const itemProcFee = Number(item.processingFee) || 0;
    const itemPackFee = Number(item.packingFee) || 0;

    const totalFees = (item.sellingPrice * decimal) + itemProcFee + itemPackFee;
    const netPayout = item.sellingPrice - totalFees;
    const netProfit = netPayout - item.hpp;
    return item.sellingPrice > 0 ? (netProfit / item.sellingPrice) * 100 : 0;
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200">
      <div className="p-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h4 className="font-bold text-xs uppercase tracking-widest flex items-center text-slate-900">
          <ShoppingCart className="w-4 h-4 mr-2 text-indigo-600" /> Keranjang Simpan{' '}
          <span className="ml-2 bg-indigo-50 border border-indigo-100 text-indigo-600 px-2 py-0.5 rounded text-[10px] font-mono font-bold">{cart.length}</span>
        </h4>
        <div className="flex gap-2 items-center flex-wrap">
          {cart.length > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-1.5 mr-2 bg-red-50 p-1 rounded-md border border-red-100 animate-in fade-in zoom-in-95 duration-150">
                <span className="text-[9px] text-red-600 font-bold mx-1 uppercase tracking-wider">Hapus semua?</span>
                <button
                  onClick={() => {
                    setCart([]);
                    setConfirmClear(false);
                  }}
                  className="bg-red-600 text-white text-[10px] font-bold px-3 py-1.5 rounded hover:bg-red-700 shadow-sm transition-all active:scale-95"
                >
                  Ya
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="bg-white text-slate-600 text-[10px] font-bold px-3 py-1.5 rounded hover:bg-slate-100 border border-slate-200 transition-all"
                >
                  Batal
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="bg-white text-red-500 border border-red-200 text-[10px] uppercase tracking-widest font-bold px-3 py-2 rounded-lg hover:bg-red-50 hover:border-red-300 transition-all flex items-center shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Bersihkan
              </button>
            )
          )}
          {cart.length > 0 && (
            <button
              onClick={() => downloadCSV(cart)}
              className="bg-white text-slate-700 border border-slate-200 text-[10px] uppercase tracking-widest font-bold px-3 py-2 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
            >
              <Download className="w-3.5 h-3.5 inline mr-1.5 text-slate-500" /> CSV Standar
            </button>
          )}
          {cart.length > 0 && (
            <button
              onClick={() => downloadJubelioCSV(cart)}
              className="bg-indigo-600 text-white text-[10px] uppercase tracking-widest font-bold px-3 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-sm active:scale-95"
            >
              <Download className="w-3.5 h-3.5 inline mr-1.5" /> Jubelio CSV
            </button>
          )}
          {cart.length > 0 && isAdmin && (
            <button
              onClick={() => handleSendSubmission('margin')}
              disabled={isSending}
              className="bg-slate-900 text-white text-[10px] uppercase tracking-widest font-bold px-4 py-2 rounded-lg hover:bg-slate-800 transition-all shadow-sm active:scale-95 flex items-center"
            >
              {isSending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1.5" />
              )}
              {editingSubmissionId ? 'Kirim Revisi' : 'Ajukan Harga'}
            </button>
          )}
        </div>
      </div>

      {/* SMART MARGIN STATUS & CONTROL */}
      <div className="bg-gradient-to-r from-indigo-50/50 via-indigo-50/10 to-transparent px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-700 shadow-sm border border-indigo-200/40">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              Fitur Smart Margin
              <span className="bg-indigo-600 text-white text-[8px] font-extrabold uppercase px-1 py-0.5 rounded tracking-wide animate-pulse">Auto</span>
            </div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">
              Otomatis mengisi saran margin berdasarkan kategori produk (misal: aksesoris 25%, elektronik 15%).
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <label className="flex items-center cursor-pointer select-none">
            <div className="relative">
              <input
                type="checkbox"
                className="sr-only"
                checked={useSmartMargin}
                onChange={e => setUseSmartMargin?.(e.target.checked)}
              />
              <div className={`block w-9 h-5 rounded-full transition-colors ${useSmartMargin ? 'bg-indigo-600' : 'bg-slate-300'}`}></div>
              <div className={`absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform transform ${useSmartMargin ? 'translate-x-4' : ''}`}></div>
            </div>
            <span className="ml-2.5 text-xs font-bold text-slate-700">Aktifkan Otomatis</span>
          </label>
          
          {cart.length > 0 && applySmartMarginsToCart && (
            <button
              onClick={applySmartMarginsToCart}
              className="px-3 py-1.5 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1"
              title="Perbarui semua item di keranjang dengan margin kategori masing-masing"
            >
              <Sparkles className="w-3 h-3 text-indigo-500" /> Terapkan ke Semua
            </button>
          )}
        </div>
      </div>

      {cart.length > 0 && (
        <div className="flex justify-between items-center bg-slate-50 px-4 py-2.5 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600 font-semibold flex items-center">
              <Filter className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> Tampilkan:
            </span>
            <select
              value={cartItemsPerPage}
              onChange={e => setCartItemsPerPage(Number(e.target.value))}
              className="p-1.5 border border-slate-200 rounded-lg text-xs font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white shadow-sm cursor-pointer"
            >
              <option value={5}>5 Baris</option>
              <option value={10}>10 Baris</option>
              <option value={20}>20 Baris</option>
              <option value={50}>50 Baris</option>
            </select>
          </div>
          <div className="text-[10px] text-slate-500 font-semibold bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm">
            Total Item: <span className="text-indigo-600 font-bold">{cart.length}</span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-4 custom-scrollbar">
        <table className="w-full text-left whitespace-nowrap border-collapse">
          <thead className="bg-slate-100/80 border-b border-slate-200">
            <tr>
              <th className="p-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider">Produk</th>
              {canSeeHPP && (
                <th className="p-3 text-center text-[10px] font-bold text-rose-700 uppercase tracking-wider bg-rose-50/50">
                  Edit Modal
                </th>
              )}
              <th className="p-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Eceran AIO</th>
              <th className="p-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Grosir AIO</th>
              <th className="p-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Partai AIO</th>
              <th className="p-3 text-center text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/50">
                Margin
              </th>
              <th className="p-3 text-center text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/50">
                Proses MP
              </th>
              <th className="p-3 text-center text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/50">
                Packing
              </th>
              <th className="p-3 text-right text-[10px] font-bold text-blue-800 uppercase tracking-wider bg-blue-50/80">
                Tayang (1x)
              </th>
              <th className="p-3 text-right text-[10px] font-bold text-emerald-800 uppercase tracking-wider bg-emerald-50/80">
                Min 3
              </th>
              <th className="p-3 text-right text-[10px] font-bold text-emerald-800 uppercase tracking-wider bg-emerald-50/80">
                Min 6
              </th>
              <th className="p-3 text-right text-[10px] font-bold text-emerald-800 uppercase tracking-wider bg-emerald-50/80">
                Min 12
              </th>
              <th className="p-3 text-right text-[10px] font-bold text-emerald-800 uppercase tracking-wider bg-emerald-50/80">
                Custom
              </th>
              <th className="p-3 text-center sticky right-0 bg-slate-100 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.05)] text-[10px] font-bold text-slate-500 uppercase">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedCart.length === 0 ? (
              <tr>
                <td colSpan={14} className="p-10 text-center text-slate-400 text-sm font-medium">
                  <Package className="w-10 h-10 mx-auto mb-3 opacity-20" />
                  Keranjang masih kosong. Tambahkan produk dari kalkulator.
                </td>
              </tr>
            ) : (
              paginatedCart.map(c => {
                const actualNetMargin = getActualNetMargin(c);
                const isLowMargin = actualNetMargin < 15;
                return (
                  <tr key={c.id} className={`hover:bg-slate-50/80 transition-colors group/row ${isLowMargin ? 'bg-red-50/10' : ''}`}>
                    <td className="p-3">
                      <div className="font-bold text-slate-800 text-xs mb-0.5 max-w-[200px] truncate" title={c.name}>
                        {c.name}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 mt-0.5">
                        <div className="text-[9px] font-mono text-slate-500 bg-slate-100 w-fit px-1.5 rounded">{c.sku}</div>
                        {isLowMargin && (
                          <div className="text-[9px] text-red-600 font-extrabold bg-red-50 border border-red-200/60 px-1.5 py-0.5 rounded animate-pulse">
                            Peringatan: Margin Rendah ({actualNetMargin.toFixed(1)}%)
                          </div>
                        )}
                      </div>
                    </td>
                    {canSeeHPP && (
                      <td className="p-2 text-center bg-rose-50/20">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formatInput(c.hpp)}
                          onChange={e => updateCartItem(c.id, 'hpp', parseInput(e.target.value))}
                          className="w-24 p-1.5 text-xs border border-rose-200 rounded-lg font-bold text-rose-700 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 text-right shadow-inner transition-all"
                        />
                      </td>
                    )}
                    <td className="p-3 text-right text-xs font-medium text-slate-500">{formatIDR(c.eceran)}</td>
                    <td className="p-3 text-right text-xs font-medium text-slate-500">{formatIDR(c.grosir)}</td>
                    <td className="p-3 text-right text-xs font-medium text-slate-500">{formatIDR(c.partai)}</td>
                    <td className="p-2 text-center bg-indigo-50/20">
                      <select
                        value={c.margin || 10}
                        onChange={e => updateCartItem(c.id, 'margin', e.target.value)}
                        className={`p-1.5 w-16 text-xs border rounded-lg font-bold bg-white focus:outline-none focus:ring-2 cursor-pointer shadow-sm transition-all ${isLowMargin ? 'border-red-300 text-red-600 focus:ring-red-500/30 font-extrabold' : 'border-indigo-200 text-indigo-700 focus:ring-indigo-500/30'}`}
                      >
                        <option value={10}>10%</option>
                        <option value={15}>15%</option>
                        <option value={20}>20%</option>
                      </select>
                    </td>
                    <td className="p-2 text-center bg-indigo-50/20">
                      <input
                        type="number"
                        min="1500"
                        value={c.processingFee}
                        onChange={e => updateCartItem(c.id, 'processingFee', e.target.value)}
                        onBlur={e => updateCartItem(c.id, 'processingFee', Math.max(1500, Number(e.target.value) || 1500))}
                        className="w-16 p-1.5 text-xs border border-indigo-200 rounded-lg font-bold text-indigo-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-center shadow-inner"
                      />
                    </td>
                    <td className="p-2 text-center bg-indigo-50/20">
                      <input
                        type="number"
                        value={c.packingFee}
                        onChange={e => updateCartItem(c.id, 'packingFee', e.target.value)}
                        onBlur={e => updateCartItem(c.id, 'packingFee', Number(e.target.value) || 0)}
                        className="w-16 p-1.5 text-xs border border-indigo-200 rounded-lg font-bold text-indigo-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 text-center shadow-inner"
                      />
                    </td>
                    <td
                      className={`p-3 text-right cursor-pointer hover:bg-blue-100 transition-colors group/cell rounded-l-xl ${isLowMargin ? 'bg-red-50/40' : 'bg-blue-50/30'}`}
                      onClick={e => handleCopyPrice(c.sellingPrice, e)}
                    >
                      <div className="flex flex-col items-end">
                        <div className={`font-bold text-sm flex items-center gap-1.5 ${isLowMargin ? 'text-red-600' : 'text-blue-900'}`}>
                          <Copy className={`w-3 h-3 opacity-0 group-hover/cell:opacity-100 transition-opacity ${isLowMargin ? 'text-red-400' : 'text-blue-400'}`} />
                          {formatIDR(c.sellingPrice)}
                        </div>
                        {isLowMargin && (
                          <div className="text-[9px] text-red-500 font-extrabold mt-0.5">
                            Margin: {actualNetMargin.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </td>
                  <td
                    className="p-3 text-right bg-emerald-50/20 cursor-pointer hover:bg-emerald-100/60 transition-colors group/cell"
                    onClick={e => handleCopyPrice(c.priceMin3, e)}
                  >
                    <div className="flex flex-col items-end">
                      <div className="font-bold text-emerald-800 text-sm flex items-center gap-1.5">
                        <Copy className="w-3 h-3 text-emerald-400 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                        {formatIDR(c.priceMin3)}
                      </div>
                      <div className="text-[8px] text-emerald-600 mt-0.5 font-medium border-t border-emerald-200/50 pt-0.5">
                        Tot: {formatIDR(c.priceMin3 * 3)}
                      </div>
                    </div>
                  </td>
                  <td
                    className="p-3 text-right bg-emerald-50/20 cursor-pointer hover:bg-emerald-100/60 transition-colors group/cell"
                    onClick={e => handleCopyPrice(c.priceMin6, e)}
                  >
                    <div className="flex flex-col items-end">
                      <div className="font-bold text-emerald-800 text-sm flex items-center gap-1.5">
                        <Copy className="w-3 h-3 text-emerald-400 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                        {formatIDR(c.priceMin6)}
                      </div>
                      <div className="text-[8px] text-emerald-600 mt-0.5 font-medium border-t border-emerald-200/50 pt-0.5">
                        Tot: {formatIDR(c.priceMin6 * 6)}
                      </div>
                    </div>
                  </td>
                  <td
                    className="p-3 text-right bg-emerald-50/20 cursor-pointer hover:bg-emerald-100/60 transition-colors group/cell"
                    onClick={e => handleCopyPrice(c.priceMin12, e)}
                  >
                    <div className="flex flex-col items-end">
                      <div className="font-bold text-emerald-800 text-sm flex items-center gap-1.5">
                        <Copy className="w-3 h-3 text-emerald-400 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                        {formatIDR(c.priceMin12)}
                      </div>
                      <div className="text-[8px] text-emerald-600 mt-0.5 font-medium border-t border-emerald-200/50 pt-0.5">
                        Tot: {formatIDR(c.priceMin12 * 12)}
                      </div>
                    </div>
                  </td>
                  <td
                    className="p-3 text-right bg-emerald-50/20 cursor-pointer hover:bg-emerald-100/60 transition-colors group/cell rounded-r-xl"
                    onClick={e => {
                      if (c.customQtyValue && c.priceCustom) handleCopyPrice(c.priceCustom, e);
                    }}
                  >
                    {c.customQtyValue && c.priceCustom ? (
                      <div className="flex flex-col items-end">
                        <div className="font-bold text-emerald-800 text-sm flex items-center gap-1.5">
                          <Copy className="w-3 h-3 text-emerald-400 opacity-0 group-hover/cell:opacity-100 transition-opacity" />
                          {formatIDR(c.priceCustom)}
                        </div>
                        <div className="text-[8px] text-emerald-600 mt-0.5 font-medium border-t border-emerald-200/50 pt-0.5 flex items-center gap-1">
                          <span className="bg-emerald-100 px-1 rounded">Min {c.customQtyValue}</span> Tot:{' '}
                          {formatIDR(c.priceCustom * c.customQtyValue)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="p-3 text-center sticky right-0 bg-white group-hover/row:bg-slate-50 transition-colors shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)] border-l border-slate-100">
                    <button
                      onClick={() => setCart(cart.filter(x => x.id !== c.id))}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-all active:scale-95"
                    >
                      <Trash2 className="w-4 h-4 mx-auto" />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
          </tbody>
        </table>
      </div>

      {totalCartPages > 1 && (
        <div className="flex justify-between items-center p-4 border-t border-slate-200 bg-white">
          <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-3 py-1.5 rounded-lg">
            Halaman {currentCartPage} / {totalCartPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setCartPage(p => Math.max(1, p - 1))}
              disabled={currentCartPage === 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:bg-slate-50 flex items-center transition-all text-slate-700 font-bold text-xs shadow-sm active:scale-95"
            >
              <ChevronLeft className="w-4 h-4 mr-1" /> Prev
            </button>
            <button
              onClick={() => setCartPage(p => Math.min(totalCartPages, p + 1))}
              disabled={currentCartPage === totalCartPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:bg-slate-50 flex items-center transition-all text-slate-700 font-bold text-xs shadow-sm active:scale-95"
            >
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      )}

      {cart.length > 0 && isAdmin && (
        <div className="p-5 bg-slate-50/50 border-t border-slate-200 animate-in fade-in duration-200">
          <label className="block text-xs font-bold text-slate-600 mb-2">Catatan Pengajuan (Opsional)</label>
          <textarea
            className="w-full p-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-none shadow-inner"
            rows={2}
            placeholder="Tulis instruksi tambahan jika ada..."
            value={submissionNote}
            onChange={e => setSubmissionNote(e.target.value)}
          ></textarea>
        </div>
      )}
    </div>
  );
}
