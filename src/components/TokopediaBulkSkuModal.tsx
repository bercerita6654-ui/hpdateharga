import React, { useState, useMemo } from 'react';
import {
  ListFilter,
  Search,
  Copy,
  Check,
  Download,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Package,
  Sparkles,
  Clipboard,
  ExternalLink,
  Info,
  ArrowRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product } from '../types';
import { formatIDR, sanitizeSku } from '../utils/helpers';

interface TokopediaBulkSkuModalProps {
  isOpen: boolean;
  onClose: () => void;
  productList: Product[];
  adminPercent: number;
  fixedFee: number;
  rounding: string;
  calculateTokopediaPrice: (eceran: number, percent?: number, fee?: number, roundOpt?: string) => number;
  skuCategoryMap?: Record<string, string>;
  activeBulkSkus: string[];
  bulkSkuText: string;
  setBulkSkuText: (text: string) => void;
  onApplyFilter: (skus: string[]) => void;
  onClearFilter: () => void;
  showToast: (msg: string) => void;
}

export interface BulkItemResult {
  rawSku: string;
  found: boolean;
  product?: Product;
  category: string;
  name: string;
  stock: number;
  eceran: number;
  adminVal: number;
  fixedFee: number;
  tokopediaPrice: number;
  margin: number;
}

export default function TokopediaBulkSkuModal({
  isOpen,
  onClose,
  productList,
  adminPercent,
  fixedFee,
  rounding,
  calculateTokopediaPrice,
  skuCategoryMap = {},
  activeBulkSkus,
  bulkSkuText,
  setBulkSkuText,
  onApplyFilter,
  onClearFilter,
  showToast
}: TokopediaBulkSkuModalProps) {
  const [modalTab, setModalTab] = useState<'all' | 'found' | 'not_found'>('all');
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [copiedRowKey, setCopiedRowKey] = useState<string | null>(null);
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});

  // Map productList by normalized SKU for fast O(1) lookup
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of productList) {
      const cleanSku = String(p.sku || '').trim().toUpperCase();
      if (cleanSku) {
        map.set(cleanSku, p);
      }
    }
    return map;
  }, [productList]);

  // Helper parser for bulk text - PRESERVES EVERY SKU INCLUDING DUPLICATES in pasted order
  const parsedSkus = useMemo(() => {
    if (!bulkSkuText.trim()) return [];
    // Split by newlines, commas, semicolons, tabs
    const rawTokens = bulkSkuText.split(/[\r\n,;\t]+/);
    const result: string[] = [];

    for (const token of rawTokens) {
      const trimmed = token.trim();
      if (!trimmed) continue;
      // If the line matches an exact SKU in catalog, keep as is
      if (productMap.has(trimmed.toUpperCase())) {
        result.push(trimmed);
      } else {
        // Also handle space-separated if someone pasted multiple SKUs on a line
        const subTokens = trimmed.split(/\s+/);
        for (const sub of subTokens) {
          const clean = sub.trim();
          if (clean) {
            result.push(clean);
          }
        }
      }
    }
    return result;
  }, [bulkSkuText, productMap]);

  // Count duplicate SKUs in input to provide clear user feedback
  const duplicateCount = useMemo(() => {
    const seen = new Set<string>();
    let dupes = 0;
    for (const s of parsedSkus) {
      const u = s.trim().toUpperCase();
      if (seen.has(u)) dupes++;
      else seen.add(u);
    }
    return dupes;
  }, [parsedSkus]);

  // Evaluated bulk results
  const evaluatedItems: BulkItemResult[] = useMemo(() => {
    return parsedSkus.map(sku => {
      const cleanUpper = sku.trim().toUpperCase();
      const product = productMap.get(cleanUpper);
      const category = (product ? skuCategoryMap[product.sku] : undefined) || '-';

      if (product) {
        const eceran = Number(product.eceran) || 0;
        const adminVal = eceran * (adminPercent / 100);
        const tokopediaPrice = calculateTokopediaPrice(eceran, adminPercent, fixedFee, rounding);
        const margin = tokopediaPrice - eceran;

        return {
          rawSku: sku,
          found: true,
          product,
          category,
          name: product.name,
          stock: product.stock ?? 0,
          eceran,
          adminVal,
          fixedFee,
          tokopediaPrice,
          margin
        };
      } else {
        const customEceran = customPrices[cleanUpper] || 0;
        const adminVal = customEceran * (adminPercent / 100);
        const tokopediaPrice = customEceran > 0 ? calculateTokopediaPrice(customEceran, adminPercent, fixedFee, rounding) : 0;
        const margin = tokopediaPrice > 0 ? tokopediaPrice - customEceran : 0;

        return {
          rawSku: sku,
          found: false,
          category: '-',
          name: 'SKU Tidak Ditemukan di Katalog Sheet',
          stock: 0,
          eceran: customEceran,
          adminVal,
          fixedFee,
          tokopediaPrice,
          margin
        };
      }
    });
  }, [parsedSkus, productMap, skuCategoryMap, adminPercent, fixedFee, rounding, calculateTokopediaPrice, customPrices]);

  // Stats
  const foundItems = useMemo(() => evaluatedItems.filter(item => item.found), [evaluatedItems]);
  const notFoundItems = useMemo(() => evaluatedItems.filter(item => !item.found), [evaluatedItems]);

  // Filtered list for the preview table inside modal
  const displayedItems = useMemo(() => {
    let list = evaluatedItems;
    if (modalTab === 'found') list = foundItems;
    if (modalTab === 'not_found') list = notFoundItems;

    if (previewSearch.trim()) {
      const q = previewSearch.toLowerCase().trim();
      list = list.filter(item =>
        item.rawSku.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [evaluatedItems, foundItems, notFoundItems, modalTab, previewSearch]);

  // Copy single price
  const handleCopySingle = (price: number, sku: string, rowKey: string) => {
    navigator.clipboard.writeText(String(price)).then(() => {
      setCopiedRowKey(rowKey);
      showToast(`Harga ${formatIDR(price)} untuk ${sku} disalin!`);
      setTimeout(() => setCopiedRowKey(null), 2000);
    });
  };

  // Copy Tokopedia price column only (one price per line, strictly in input order including duplicate SKUs)
  const handleCopyAll = () => {
    // Determine items to copy based on active tab or all evaluated items
    const itemsToCopy = modalTab === 'found'
      ? foundItems
      : (modalTab === 'not_found'
          ? notFoundItems
          : evaluatedItems);

    if (itemsToCopy.length === 0) {
      showToast('Tidak ada baris harga untuk disalin');
      return;
    }

    // ONLY copy the Tokopedia price column (one per line, matches Excel row for row)
    const lines = itemsToCopy.map(item => String(item.tokopediaPrice));
    const textToCopy = lines.join('\n');

    const onSuccess = () => {
      showToast(`Berhasil menyalin ${itemsToCopy.length} baris Kolom Harga Tokopedia saja!`);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(textToCopy).then(onSuccess);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        onSuccess();
      } catch (err) {
        showToast('Gagal menyalin kolom harga');
      }
      document.body.removeChild(textArea);
    }
  };

  // Optional: Copy both SKU & Price pairs
  const handleCopySkuAndPrice = () => {
    const itemsToCopy = modalTab === 'found' ? foundItems : evaluatedItems;
    if (itemsToCopy.length === 0) {
      showToast('Tidak ada produk untuk disalin');
      return;
    }
    const lines = itemsToCopy.map(item => `${item.rawSku}\t${item.tokopediaPrice}`);
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      showToast(`Berhasil menyalin ${itemsToCopy.length} pasang SKU & Harga Tokopedia!`);
    });
  };

  // Export to Excel XLSX
  const handleExportExcel = () => {
    if (evaluatedItems.length === 0) {
      showToast('Belum ada SKU untuk diekspor');
      return;
    }

    const excelData = evaluatedItems.map((item, idx) => ({
      'No': idx + 1,
      'SKU Input': item.rawSku,
      'Status': item.found ? 'Ditemukan' : 'Tidak Ditemukan',
      'Nama Produk': item.name,
      'Kategori': item.category,
      'Stok': item.stock,
      'Harga Eceran (Rp)': item.eceran,
      [`Komisi Admin (${adminPercent}%)`]: Math.round(item.adminVal),
      'Biaya Packing (Rp)': fixedFee,
      'Harga Jual Tokopedia (Rp)': item.tokopediaPrice,
      'Selisih Margin (Rp)': item.margin
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bulk Tokopedia');
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Bulk_SKU_Tokopedia_${dateStr}.xlsx`);
    showToast(`Berhasil mengunduh Excel: ${evaluatedItems.length} baris SKU`);
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (evaluatedItems.length === 0) {
      showToast('Belum ada SKU untuk diekspor');
      return;
    }

    const headers = ['No', 'SKU', 'Status', 'Nama Produk', 'Stok', 'Harga Eceran', 'Admin', 'Packing', 'Harga Tokopedia'];
    const rows = evaluatedItems.map((item, idx) => [
      idx + 1,
      `"${item.rawSku}"`,
      item.found ? 'Ditemukan' : 'Tidak Ditemukan',
      `"${item.name.replace(/"/g, '""')}"`,
      item.stock,
      item.eceran,
      Math.round(item.adminVal),
      fixedFee,
      item.tokopediaPrice
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bulk_SKU_Tokopedia_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('File CSV berhasil diunduh');
  };

  // Insert sample SKUs from catalog for testing
  const handleInsertSample = () => {
    const sample = productList
      .filter(p => p.sku && p.eceran > 0)
      .slice(0, 12)
      .map(p => p.sku)
      .join('\n');

    if (sample) {
      setBulkSkuText(sample);
      showToast('Contoh 12 SKU dari katalog berhasil dimasukkan!');
    } else {
      showToast('Katalog produk belum dimuat');
    }
  };

  // Paste from clipboard
  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setBulkSkuText(text);
        showToast('Teks dari clipboard berhasil ditempel!');
      } else {
        showToast('Clipboard kosong');
      }
    } catch {
      showToast('Gunakan shortcut Ctrl+V / Cmd+V untuk menempel');
    }
  };

  // Apply filter to main catalog table
  const handleApplyToCatalog = () => {
    if (parsedSkus.length === 0) {
      showToast('Masukkan minimal 1 SKU');
      return;
    }
    onApplyFilter(parsedSkus);
    showToast(`Filter diterapkan: Menampilkan ${foundItems.length} produk dari ${parsedSkus.length} SKU yang diinput!`);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* MODAL HEADER */}
        <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
              <ListFilter className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg text-white">
                  Bulk Input SKU &amp; Hitung Harga Tokopedia
                </h3>
                <span className="text-[10px] uppercase font-bold bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30">
                  Otomatis
                </span>
              </div>
              <p className="text-xs text-emerald-100/80 mt-0.5">
                Tempel puluhan/ratusan SKU sekaligus untuk hitung harga jual Tokopedia, filter katalog, atau salin hasil ke Excel.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL CONTENT (SPLIT OR GRID) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50/50">
          {/* TOP SECTION: INPUT TEXTAREA + CONTROL BAR */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-emerald-600" />
                  <span>Daftar SKU (Tempel / Ketik Di Sini):</span>
                </label>
                <span className="text-[11px] text-slate-500">
                  (Pemisah: baris baru, koma, tab, atau copy 1 kolom dari Excel)
                </span>
              </div>

              {/* Quick Input Actions */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Tempel teks langsung dari Clipboard"
                >
                  <Clipboard className="w-3.5 h-3.5 text-slate-500" />
                  <span>Tempel (Paste)</span>
                </button>
                <button
                  type="button"
                  onClick={handleInsertSample}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer border border-emerald-200"
                  title="Masukkan contoh 12 SKU dari katalog sheet"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Contoh SKU</span>
                </button>
                {bulkSkuText && (
                  <button
                    type="button"
                    onClick={() => {
                      setBulkSkuText('');
                      showToast('Daftar input SKU dikosongkan');
                    }}
                    className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer border border-red-200"
                    title="Kosongkan teks input"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Kosongkan</span>
                  </button>
                )}
              </div>
            </div>

            {/* Textarea */}
            <div className="relative">
              <textarea
                rows={4}
                value={bulkSkuText}
                onChange={e => setBulkSkuText(e.target.value)}
                placeholder={"Contoh:\nSKU-001\nSKU-002\nSKU-003\natau paste langsung dari 1 kolom Excel / Google Sheets..."}
                className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 resize-y"
              />
            </div>

            {/* REAL-TIME BADGE COUNTERS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Total SKU Terdeteksi</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono text-base font-black text-slate-900">{parsedSkus.length}</span>
                    {duplicateCount > 0 && (
                      <span 
                        className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded font-bold"
                        title={`${duplicateCount} baris memiliki SKU ganda / duplikat dan tetap ditampilkan sesuai urutan`}
                      >
                        +{duplicateCount} duplikat
                      </span>
                    )}
                  </div>
                </div>
                <ListFilter className="w-4 h-4 text-slate-400" />
              </div>

              <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">Ditemukan di Katalog</span>
                  <span className="font-mono text-base font-black text-emerald-800">{foundItems.length}</span>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>

              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-700 block">Tidak Ditemukan</span>
                  <span className="font-mono text-base font-black text-amber-800">{notFoundItems.length}</span>
                </div>
                <AlertCircle className="w-4 h-4 text-amber-600" />
              </div>

              <div className="p-2.5 bg-teal-50 rounded-xl border border-teal-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-teal-700 block">Rumus Tokopedia</span>
                  <span className="text-xs font-bold text-teal-900">+{adminPercent}% + {formatIDR(fixedFee)}</span>
                </div>
                <span className="text-[10px] bg-teal-200/80 text-teal-900 px-1.5 py-0.5 rounded font-bold font-mono">
                  {rounding === 'none' ? 'Asli' : `B.${rounding}`}
                </span>
              </div>
            </div>
          </div>

          {/* PREVIEW TABLE SECTION */}
          {parsedSkus.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Table Toolbar */}
              <div className="p-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Filter Tabs */}
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setModalTab('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      modalTab === 'all'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    Semua ({evaluatedItems.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('found')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      modalTab === 'found'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Ditemukan ({foundItems.length})</span>
                  </button>
                  {notFoundItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setModalTab('not_found')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                        modalTab === 'not_found'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white hover:bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Tidak Ditemukan ({notFoundItems.length})</span>
                    </button>
                  )}
                </div>

                {/* Quick search inside modal table */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filter preview..."
                    value={previewSearch}
                    onChange={e => setPreviewSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Table Body */}
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100/90 text-slate-700 font-bold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                      <th className="py-2.5 px-3">SKU</th>
                      <th className="py-2.5 px-3">Nama Produk</th>
                      <th className="py-2.5 px-3 text-center">Stok</th>
                      <th className="py-2.5 px-3 text-right">Harga Eceran</th>
                      <th className="py-2.5 px-3 text-right text-emerald-800 font-black bg-emerald-50/50">Harga Tokopedia</th>
                      <th className="py-2.5 px-3 text-center w-24">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {displayedItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-slate-400 text-xs">
                          Tidak ada SKU yang cocok dalam filter preview ini
                        </td>
                      </tr>
                    ) : (
                      displayedItems.map((item, idx) => {
                        const rowKey = `${item.rawSku}-${idx}`;
                        const isCopied = copiedRowKey === rowKey;
                        return (
                          <tr key={rowKey} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[11px] border ${
                                item.found 
                                  ? 'bg-slate-100 text-indigo-700 border-slate-200' 
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}>
                                {item.rawSku}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-800 max-w-xs truncate" title={item.name}>
                              {item.found ? (
                                item.name
                              ) : (
                                <span className="text-amber-700 italic text-[11px]">
                                  SKU tidak terdaftar di Sheet Katalog
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-center font-mono text-[11px]">
                              {item.found ? (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  item.stock > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                                }`}>
                                  {item.stock}
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-700 whitespace-nowrap text-[11px]">
                              {item.found ? (
                                formatIDR(item.eceran)
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-[10px] text-slate-400">Rp</span>
                                  <input
                                    type="number"
                                    placeholder="Input Eceran"
                                    value={customPrices[item.rawSku.trim().toUpperCase()] || ''}
                                    onChange={e => {
                                      const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                      setCustomPrices(prev => ({
                                        ...prev,
                                        [item.rawSku.trim().toUpperCase()]: val
                                      }));
                                    }}
                                    className="w-24 px-1.5 py-0.5 text-right font-mono text-[11px] border border-amber-300 rounded bg-amber-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                                  />
                                </div>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-black text-emerald-700 bg-emerald-50/30 whitespace-nowrap text-xs">
                              {item.tokopediaPrice > 0 ? formatIDR(item.tokopediaPrice) : '-'}
                            </td>
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              {item.tokopediaPrice > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => handleCopySingle(item.tokopediaPrice, item.rawSku, rowKey)}
                                  className={`px-2 py-1 rounded text-[10.5px] font-bold flex items-center gap-1 mx-auto transition-all cursor-pointer ${
                                    isCopied
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200'
                                  }`}
                                  title="Salin Harga Tokopedia"
                                >
                                  {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 text-slate-400" />}
                                  <span>{isCopied ? 'Tersalin' : 'Salin'}</span>
                                </button>
                              ) : (
                                <span className="text-slate-300 text-[10px]">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {activeBulkSkus.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClearFilter();
                  showToast('Filter bulk SKU pada katalog dinonaktifkan');
                }}
                className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                title="Hapus filter bulk SKU yang sedang aktif pada katalog"
              >
                ✕ Hapus Filter Bulk Aktif
              </button>
            )}
            <span className="text-xs text-slate-500">
              {parsedSkus.length > 0 ? (
                <>Siap diproses: <strong className="text-slate-800">{foundItems.length}</strong> dari {parsedSkus.length} SKU cocok</>
              ) : (
                <>Silakan tempel daftar SKU untuk memulai</>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {/* Copy All - Prices Only */}
            <button
              type="button"
              disabled={foundItems.length === 0 && notFoundItems.every(i => i.tokopediaPrice === 0)}
              onClick={handleCopyAll}
              className="px-3.5 py-2 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
              title="Salin hanya kolom Harga Tokopedia saja (satu harga per baris, siap ditempel ke Excel)"
            >
              <Copy className="w-3.5 h-3.5 text-emerald-600" />
              <span>Salin Semua ({modalTab === 'found' ? foundItems.length : (modalTab === 'not_found' ? notFoundItems.length : evaluatedItems.length)})</span>
            </button>

            {/* Export Excel */}
            <button
              type="button"
              disabled={evaluatedItems.length === 0}
              onClick={handleExportExcel}
              className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Unduh Excel</span>
            </button>

            {/* Apply Filter Button */}
            <button
              type="button"
              disabled={foundItems.length === 0}
              onClick={handleApplyToCatalog}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>Terapkan ke Tabel Katalog ({foundItems.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
