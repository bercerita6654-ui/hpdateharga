/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Copy, 
  Check, 
  Download, 
  FileSpreadsheet, 
  RefreshCw, 
  Percent, 
  Package, 
  Calculator, 
  Sparkles, 
  ArrowUpDown,
  Filter,
  ChevronLeft,
  ChevronRight,
  Upload,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
  ListFilter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, Fees } from '../types';
import { formatIDR, sanitizeSku } from '../utils/helpers';
import TokopediaSimulator from './TokopediaSimulator';
import TokopediaBulkSkuModal from './TokopediaBulkSkuModal';

interface TokopediaTabProps {
  productList: Product[];
  fees?: Fees;
  setSelectedSku?: (sku: string) => void;
  setProduct?: React.Dispatch<React.SetStateAction<{ hpp: number; basePrice: number }>>;
  setActiveView?: (view: any) => void;
  categories?: string[];
  skuCategoryMap?: Record<string, string>;
  onRefresh?: () => Promise<void> | void;
  isLoading?: boolean;
}

export default function TokopediaTab({
  productList = [],
  fees,
  setSelectedSku,
  setProduct,
  setActiveView,
  categories = [],
  skuCategoryMap = {},
  onRefresh,
  isLoading = false
}: TokopediaTabProps) {
  // Formula parameters (Default: Eceran + 23% + 3.000)
  const [adminPercent, setAdminPercent] = useState<number>(23);
  const [fixedFee, setFixedFee] = useState<number>(3000);
  const [rounding, setRounding] = useState<string>('1000'); // Bulat 1000 default

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>('');

  // Single item calculator state
  const [selectedProductSku, setSelectedProductSku] = useState<string>('');
  const [manualEceran, setManualEceran] = useState<string>('');
  const [copiedSku, setCopiedSku] = useState<string | null>(null);
  const [globalNotif, setGlobalNotif] = useState<string>('');

  // Table filtering and pagination
  const [tableSearch, setTableSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'out_of_stock'>('all');
  const [sortBy, setSortBy] = useState<'sku' | 'name' | 'eceran_asc' | 'eceran_desc' | 'tokopedia_desc'>('name');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(20);

  // Mass simulation / file upload state
  const [uploadedItems, setUploadedItems] = useState<Array<{ sku: string; name: string; eceran: number }>>([]);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);

  // Bulk SKU input state
  const [bulkSkuText, setBulkSkuText] = useState<string>('');
  const [activeBulkSkus, setActiveBulkSkus] = useState<string[]>([]);
  const [showBulkSkuModal, setShowBulkSkuModal] = useState<boolean>(false);

  // Helper notification
  const showToast = (msg: string) => {
    setGlobalNotif(msg);
    setTimeout(() => setGlobalNotif(''), 3000);
  };

  // Refresh handler to reload fresh stock and product list from Google Sheet
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastRefreshedAt(timeStr);
      showToast('Data stock list produk berhasil diperbarui dari Google Sheet!');
    } catch (err) {
      showToast('Gagal memperbarui data dari sheet.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Helper copy text
  const handleCopy = (text: string | number, skuIdentifier?: string) => {
    const str = String(text);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(str).then(() => {
        setCopiedSku(skuIdentifier || str);
        showToast(`Harga disalin: ${formatIDR(Number(str))}`);
        setTimeout(() => setCopiedSku(null), 2000);
      });
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = str;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedSku(skuIdentifier || str);
        showToast(`Harga disalin: ${formatIDR(Number(str))}`);
        setTimeout(() => setCopiedSku(null), 2000);
      } catch (err) {
        showToast('Gagal menyalin');
      }
      document.body.removeChild(textArea);
    }
  };

  // Formula calculation function: Eceran + 23% + 3.000 (with rounding)
  const calculateTokopediaPrice = (eceran: number, percent = adminPercent, fee = fixedFee, roundOpt = rounding) => {
    const safeEceran = Number(eceran) || 0;
    if (safeEceran <= 0) return 0;
    
    // Rumus: Harga Eceran + 23% (persentase) + 3.000 (biaya tetap)
    const adminAmount = safeEceran * (percent / 100);
    const rawPrice = safeEceran + adminAmount + fee;

    if (roundOpt === '100') return Math.ceil(rawPrice / 100) * 100;
    if (roundOpt === '500') return Math.ceil(rawPrice / 500) * 500;
    if (roundOpt === '1000') return Math.ceil(rawPrice / 1000) * 1000;
    return Math.round(rawPrice);
  };

  // Reset to exact default formula requested by user
  const resetToDefault = () => {
    setAdminPercent(23);
    setFixedFee(3000);
    setRounding('1000');
    showToast('Parameter dikembalikan ke standar: 23% + Rp 3.000 (Bulat 1000)');
  };


  // All catalog items with calculated Tokopedia prices
  const calculatedCatalog = useMemo(() => {
    return productList.map(item => {
      const eceran = Number(item.eceran) || 0;
      const adminVal = eceran * (adminPercent / 100);
      const tokopediaPrice = calculateTokopediaPrice(eceran, adminPercent, fixedFee, rounding);
      const category = skuCategoryMap[item.sku] || '-';
      return {
        ...item,
        category,
        adminVal,
        tokopediaPrice
      };
    });
  }, [productList, adminPercent, fixedFee, rounding, skuCategoryMap]);

  // Filtered & Sorted catalog for table
  const filteredCatalog = useMemo(() => {
    let result = calculatedCatalog;

    // Apply active bulk SKU filter if enabled
    if (activeBulkSkus.length > 0) {
      const bulkSet = new Set(activeBulkSkus.map(s => s.toLowerCase().trim()));
      result = result.filter(item => bulkSet.has(item.sku.toLowerCase().trim()));
    }

    if (tableSearch.trim()) {
      const rawQuery = tableSearch.toLowerCase().trim();
      // If search contains comma, semicolon, or newline, treat as multiple search keys
      if (rawQuery.includes(',') || rawQuery.includes(';') || rawQuery.includes('\n')) {
        const queryTokens = rawQuery.split(/[\r\n,;]+/).map(t => t.trim()).filter(Boolean);
        result = result.filter(item => {
          const skuLower = item.sku.toLowerCase();
          const nameLower = item.name.toLowerCase();
          const catLower = item.category.toLowerCase();
          return queryTokens.some(token => 
            skuLower.includes(token) || nameLower.includes(token) || catLower.includes(token)
          );
        });
      } else {
        result = result.filter(item => 
          item.sku.toLowerCase().includes(rawQuery) || 
          item.name.toLowerCase().includes(rawQuery) ||
          item.category.toLowerCase().includes(rawQuery)
        );
      }
    }

    if (categoryFilter !== 'all') {
      result = result.filter(item => item.category === categoryFilter);
    }

    if (stockFilter === 'in_stock') {
      result = result.filter(item => (item.stock || 0) > 0);
    } else if (stockFilter === 'out_of_stock') {
      result = result.filter(item => (item.stock || 0) <= 0);
    }

    // Sorting
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'sku') return a.sku.localeCompare(b.sku);
      if (sortBy === 'eceran_asc') return a.eceran - b.eceran;
      if (sortBy === 'eceran_desc') return b.eceran - a.eceran;
      if (sortBy === 'tokopedia_desc') return b.tokopediaPrice - a.tokopediaPrice;
      return 0;
    });

    return result;
  }, [calculatedCatalog, activeBulkSkus, tableSearch, categoryFilter, stockFilter, sortBy]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredCatalog.length / itemsPerPage) || 1;
  const paginatedCatalog = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCatalog.slice(start, start + itemsPerPage);
  }, [filteredCatalog, currentPage, itemsPerPage]);

  // Statistics
  const stats = useMemo(() => {
    const totalItems = calculatedCatalog.length;
    const withEceran = calculatedCatalog.filter(p => p.eceran > 0);
    const avgEceran = withEceran.length > 0 
      ? withEceran.reduce((acc, curr) => acc + curr.eceran, 0) / withEceran.length 
      : 0;
    const avgTokopedia = withEceran.length > 0 
      ? withEceran.reduce((acc, curr) => acc + curr.tokopediaPrice, 0) / withEceran.length 
      : 0;
    return {
      totalItems,
      validPrices: withEceran.length,
      avgEceran,
      avgTokopedia
    };
  }, [calculatedCatalog]);

  // Export to Excel XLSX
  const exportToExcel = () => {
    if (filteredCatalog.length === 0) {
      showToast('Tidak ada data produk untuk diunduh');
      return;
    }

    const excelData = filteredCatalog.map((item, index) => ({
      'No': index + 1,
      'SKU': item.sku,
      'Nama Produk': item.name,
      'Kategori': item.category,
      'Satuan': item.unit || 'pcs',
      'Stok': item.stock ?? 0,
      'Harga Eceran (Acuan)': item.eceran,
      [`Persentase Admin (${adminPercent}%)`]: Math.round(item.adminVal),
      'Biaya Packing & Admin Lainnya': fixedFee,
      'Harga Jual Tokopedia (Final)': item.tokopediaPrice,
      'Selisih Margin (Rp)': item.tokopediaPrice - item.eceran
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Harga Tokopedia');
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Harga_Jual_Tokopedia_${dateStr}.xlsx`);
    showToast(`Berhasil mengunduh Excel: ${filteredCatalog.length} produk`);
  };

  // Export to CSV
  const exportToCSV = () => {
    if (filteredCatalog.length === 0) {
      showToast('Tidak ada data untuk diunduh');
      return;
    }

    const headers = ['No', 'SKU', 'Nama Produk', 'Kategori', 'Stok', 'Harga Eceran', 'Admin 23%', 'Biaya Packing', 'Harga Jual Tokopedia'];
    const rows = filteredCatalog.map((item, idx) => [
      idx + 1,
      `"${item.sku}"`,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.category}"`,
      item.stock ?? 0,
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
    link.setAttribute('download', `Harga_Tokopedia_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('File CSV berhasil diunduh');
  };

  // Copy all SKU & Price to clipboard for batch upload
  const copyAllSkuAndPrice = () => {
    if (filteredCatalog.length === 0) return;
    const lines = filteredCatalog.map(p => `${p.sku}\t${p.tokopediaPrice}`);
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      showToast(`Berhasil menyalin ${filteredCatalog.length} pasangan SKU & Harga Jual!`);
    });
  };

  // Handle file upload for mass calculation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });

        if (json.length < 2) {
          showToast('File tidak memiliki baris data');
          return;
        }

        const headerRow = (json[0] as any[]).map(h => String(h || '').toLowerCase().trim());
        let skuIdx = headerRow.findIndex(h => h.includes('sku') || h.includes('kode'));
        let nameIdx = headerRow.findIndex(h => h.includes('nama') || h.includes('produk') || h.includes('title'));
        let priceIdx = headerRow.findIndex(h => h.includes('eceran') || h.includes('retail') || h.includes('harga') || h.includes('price'));

        if (priceIdx === -1) priceIdx = headerRow.length > 2 ? 2 : 1;
        if (skuIdx === -1) skuIdx = 0;
        if (nameIdx === -1) nameIdx = 1;

        const parsed: Array<{ sku: string; name: string; eceran: number }> = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i] as any[];
          if (!row || row.length === 0) continue;
          const sku = String(row[skuIdx] || '').trim();
          const name = String(row[nameIdx] || sku || `Item ${i}`).trim();
          const rawPrice = String(row[priceIdx] || '').replace(/[^0-9]/g, '');
          const eceran = Number(rawPrice) || 0;
          if (sku || eceran > 0) {
            parsed.push({ sku, name, eceran });
          }
        }

        if (parsed.length > 0) {
          setUploadedItems(parsed);
          setShowUploadModal(true);
          showToast(`Berhasil membaca ${parsed.length} baris produk!`);
        } else {
          showToast('Tidak ditemukan data produk valid pada file');
        }
      } catch (err) {
        showToast('Gagal memproses file. Pastikan format file Excel/CSV valid.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* Toast Notification */}
      {globalNotif && (
        <div className="fixed top-6 right-6 z-[9999] bg-slate-900/95 text-white px-5 py-3 rounded-xl shadow-2xl border border-emerald-500/40 backdrop-blur-md flex items-center gap-3 animate-in slide-in-from-top-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="text-xs font-semibold">{globalNotif}</span>
        </div>
      )}

      {/* HEADER & FORMULA BANNER */}
      <div className="bg-gradient-to-br from-emerald-900 via-teal-900 to-slate-900 rounded-2xl p-6 text-white shadow-lg border border-emerald-700/40 relative overflow-hidden">
        {/* Background Decorative Rings */}
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-teal-500/10 rounded-full blur-xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3">
              <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
              Tokopedia Marketplace Pricing Engine
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              Kalkulator Harga Jual Tokopedia
            </h1>
            <p className="text-xs text-emerald-100/80 mt-1 max-w-2xl leading-relaxed">
              Dihitung otomatis dengan rumus baku Tokopedia: <span className="font-bold text-white bg-emerald-800/60 px-2 py-0.5 rounded border border-emerald-600/40">Harga Eceran + 23% + Rp 3.000</span> mencakup persentase komisi admin dan biaya packing/operasional tetap.
            </p>
          </div>

          {/* Quick Stats Counter */}
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/15 p-3.5 rounded-xl self-start md:self-auto">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-200">Total Katalog Terkalkulasi</div>
              <div className="text-xl font-black text-white font-mono">{stats.totalItems.toLocaleString('id-ID')} <span className="text-xs font-normal text-emerald-200">SKU</span></div>
            </div>
            <div className="h-9 w-px bg-white/20"></div>
            <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-300">
              <Sparkles className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* PARAMETER CONTROL BAR */}
        <div className="mt-6 pt-5 border-t border-emerald-700/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-black/20 p-4 rounded-xl backdrop-blur-sm">
          {/* Admin Percentage */}
          <div className="bg-slate-900/60 border border-emerald-500/30 p-2.5 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] font-semibold text-slate-200">Komisi Admin:</span>
            </div>
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={adminPercent}
                onChange={e => setAdminPercent(Math.max(0, Number(e.target.value) || 0))}
                className="w-16 bg-slate-800 text-white border border-emerald-500/40 rounded px-2 py-1 text-xs font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
              <span className="text-xs text-emerald-300 font-bold">%</span>
            </div>
          </div>

          {/* Fixed Packing & Operational Fee */}
          <div className="bg-slate-900/60 border border-emerald-500/30 p-2.5 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] font-semibold text-slate-200">Biaya Packing:</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-emerald-300 font-bold">Rp</span>
              <input
                type="number"
                step="100"
                min="0"
                value={fixedFee}
                onChange={e => setFixedFee(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 bg-slate-800 text-white border border-emerald-500/40 rounded px-2 py-1 text-xs font-mono font-bold text-center focus:outline-none focus:ring-1 focus:ring-emerald-400"
              />
            </div>
          </div>

          {/* Rounding Selection */}
          <div className="bg-slate-900/60 border border-emerald-500/30 p-2.5 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px] font-semibold text-slate-200">Pembulatan:</span>
            </div>
            <select
              value={rounding}
              onChange={e => setRounding(e.target.value)}
              className="bg-slate-800 text-white border border-emerald-500/40 rounded px-2 py-1 text-[11px] font-bold focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer"
            >
              <option value="1000">Bulat 1.000 (Default)</option>
              <option value="500">Bulat 500</option>
              <option value="100">Bulat 100</option>
              <option value="none">Tanpa Pembulatan</option>
            </select>
          </div>

          {/* Reset Action */}
          <button
            onClick={resetToDefault}
            className="bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 px-3 py-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors active:scale-95"
            title="Kembalikan nilai ke Eceran + 23% + 3.000"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Default (23% + 3.000)
          </button>
        </div>
      </div>

      {/* ALL PRODUCT CATALOG TOKOPEDIA PRICE TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Top Bar */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
              Katalog Lengkap &amp; Harga Jual Tokopedia
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span>Menampilkan {filteredCatalog.length} dari total {productList.length} produk katalog</span>
              {lastRefreshedAt && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-800 font-semibold bg-emerald-100/70 px-2.5 py-0.5 rounded-full border border-emerald-300/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                  Stock List Terakhir Diperbarui: {lastRefreshedAt}
                </span>
              )}
            </div>
          </div>

          {/* Export and Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Bulk SKU Input Trigger */}
            <button
              onClick={() => setShowBulkSkuModal(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ring-1 ring-emerald-500/50"
              title="Input atau tempel banyak SKU sekaligus untuk kalkulasi harga Tokopedia dan filter katalog"
            >
              <ListFilter className="w-3.5 h-3.5 text-emerald-100" />
              <span>Input Bulk SKU {activeBulkSkus.length > 0 ? `(${activeBulkSkus.length} Aktif)` : ''}</span>
            </button>

            {/* Refresh Data Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || isLoading}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 text-xs font-bold rounded-xl border border-emerald-300 shadow-sm flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Perbarui data stok dan harga produk terbaru langsung dari Google Sheet"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${(isRefreshing || isLoading) ? 'animate-spin' : ''}`} />
              <span>{(isRefreshing || isLoading) ? 'Memperbarui Stock List...' : 'Refresh Data Sheet'}</span>
            </button>

            {/* File Upload trigger */}
            <label className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-sm flex items-center gap-1.5 cursor-pointer transition-colors active:scale-95">
              <Upload className="w-3.5 h-3.5 text-indigo-600" />
              <span>Hitung File Excel/CSV</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
            </label>

            {/* Copy all */}
            <button
              onClick={copyAllSkuAndPrice}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-sm flex items-center gap-1.5 transition-colors active:scale-95"
              title="Salin SKU dan Harga Jual (Format Tab untuk Excel)"
            >
              <Copy className="w-3.5 h-3.5 text-slate-500" />
              Salin Semua SKU &amp; Harga
            </button>

            {/* Export CSV */}
            <button
              onClick={exportToCSV}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-sm flex items-center gap-1.5 transition-colors active:scale-95"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              CSV
            </button>

            {/* Export XLSX */}
            <button
              onClick={exportToExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Download className="w-3.5 h-3.5" />
              Unduh Excel (XLSX)
            </button>
          </div>
        </div>

        {/* ACTIVE BULK FILTER BANNER */}
        {activeBulkSkus.length > 0 && (
          <div className="mx-4 my-3 p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-300 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-600 text-white rounded-lg flex-shrink-0 shadow-xs">
                <ListFilter className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-black text-emerald-950 flex flex-wrap items-center gap-2">
                  <span>Filter Bulk SKU Sedang Aktif</span>
                  <span className="bg-emerald-200 text-emerald-900 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border border-emerald-300">
                    {filteredCatalog.length} dari {activeBulkSkus.length} SKU ditemukan
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800/90 mt-0.5">
                  Tabel katalog di bawah sedang difilter khusus untuk menampilkan SKU yang Anda input secara massal.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
              <button
                onClick={() => setShowBulkSkuModal(true)}
                className="px-3 py-1.5 bg-white hover:bg-emerald-100/60 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-2xs"
              >
                Edit / Tambah SKU
              </button>
              <button
                onClick={copyAllSkuAndPrice}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                title="Salin hasil filter SKU dan Harga Jual"
              >
                <Copy className="w-3 h-3" />
                <span>Salin Harga Filter ({filteredCatalog.length})</span>
              </button>
              <button
                onClick={() => {
                  setActiveBulkSkus([]);
                  setBulkSkuText('');
                  showToast('Filter bulk SKU telah dihapus, menampilkan semua produk');
                }}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                title="Hapus filter bulk dan tampilkan seluruh katalog"
              >
                ✕ Hapus Filter Bulk
              </button>
            </div>
          </div>
        )}

        {/* Filter and Search Controls Bar */}
        <div className="p-4 border-b border-slate-200 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari SKU atau nama produk..."
              value={tableSearch}
              onChange={e => {
                setTableSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Category Filter */}
          <div className="lg:col-span-3">
            <select
              value={categoryFilter}
              onChange={e => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Semua Kategori</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Stock Filter */}
          <div className="lg:col-span-2">
            <select
              value={stockFilter}
              onChange={e => {
                setStockFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Semua Stok</option>
              <option value="in_stock">Ada Stok (&gt;0)</option>
              <option value="out_of_stock">Stok Habis (0)</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="lg:col-span-3">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 cursor-pointer"
            >
              <option value="name">Urut: Nama Produk (A-Z)</option>
              <option value="sku">Urut: SKU</option>
              <option value="eceran_desc">Harga Eceran Tertinggi</option>
              <option value="eceran_asc">Harga Eceran Terendah</option>
              <option value="tokopedia_desc">Harga Tokopedia Tertinggi</option>
            </select>
          </div>
        </div>

        {/* DATA TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-100/75 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th className="py-3 px-4">SKU</th>
                <th className="py-3 px-4">Nama Produk</th>
                <th className="py-3 px-4 text-center">Kategori</th>
                <th className="py-3 px-4 text-center">Stok</th>
                <th className="py-3 px-4 text-right">Harga Eceran</th>
                <th className="py-3 px-4 text-right text-emerald-800">Admin (+{adminPercent}%)</th>
                <th className="py-3 px-4 text-right text-emerald-800">Packing (+Rp)</th>
                <th className="py-3 px-4 text-right bg-emerald-50/50 text-emerald-900 font-black">Harga Jual Tokopedia</th>
                <th className="py-3 px-4 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 font-medium">
              {(isRefreshing || isLoading) ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2.5">
                      <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin" />
                      <span className="font-bold text-xs text-slate-700">Sedang memperbarui data stock list produk dari Google Sheet...</span>
                      <span className="text-[11px] text-slate-400">Sinkronisasi langsung dengan data HPP, Eceran, dan Stok terbaru</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedCatalog.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-slate-400">
                    <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    Tidak ada produk yang cocok dengan pencarian / filter
                  </td>
                </tr>
              ) : (
                paginatedCatalog.map((item, idx) => {
                  const globalIdx = (currentPage - 1) * itemsPerPage + idx + 1;
                  const isCopied = copiedSku === item.sku;
                  return (
                    <tr 
                      key={item.sku} 
                      className={`hover:bg-slate-50 transition-colors ${
                        selectedProductSku === item.sku ? 'bg-emerald-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-mono text-slate-400">{globalIdx}</td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-indigo-700">
                          {item.sku}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800 max-w-xs truncate" title={item.name}>
                        {item.name}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold whitespace-nowrap">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          (item.stock || 0) > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                        }`}>
                          {item.stock ?? 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700 whitespace-nowrap">
                        {formatIDR(item.eceran)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700 whitespace-nowrap">
                        + {formatIDR(item.adminVal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700 whitespace-nowrap">
                        + {formatIDR(fixedFee)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-black text-emerald-700 bg-emerald-50/30 whitespace-nowrap text-sm">
                        {formatIDR(item.tokopediaPrice)}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleCopy(item.tokopediaPrice, item.sku)}
                            className={`p-1.5 px-2.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                              isCopied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200'
                            }`}
                            title="Salin Harga Jual"
                          >
                            {isCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-slate-500" />
                                <span>Salin</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => {
                              setSelectedProductSku(item.sku);
                              setManualEceran('');
                              document.getElementById('simulasi-cepat-tokopedia')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
                            title="Simulasi detail produk ini"
                          >
                            <Calculator className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION & PER PAGE BAR */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <span>Tampilkan</span>
            <select
              value={itemsPerPage}
              onChange={e => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="p-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>produk per halaman (Total {filteredCatalog.length} produk)</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 px-3 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* SIMULATOR CEPAT PER PRODUK & PENJELASAN RUMUS (DIPINDAHKAN KE BAWAH KATALOG) */}
      <TokopediaSimulator
        productList={productList}
        adminPercent={adminPercent}
        fixedFee={fixedFee}
        rounding={rounding}
        selectedProductSku={selectedProductSku}
        setSelectedProductSku={setSelectedProductSku}
        manualEceran={manualEceran}
        setManualEceran={setManualEceran}
        copiedSku={copiedSku}
        handleCopy={handleCopy}
        showToast={showToast}
        setProduct={setProduct}
        setSelectedSku={setSelectedSku}
        setActiveView={setActiveView}
      />

      {/* MODAL: MASS CALCULATION FOR UPLOADED FILE */}
      {showUploadModal && uploadedItems.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-base font-black text-slate-800">
                  Hasil Perhitungan Massal File Tokopedia
                </h3>
                <p className="text-xs text-slate-500">
                  Total {uploadedItems.length} produk dihitung dengan rumus: Eceran + {adminPercent}% + {formatIDR(fixedFee)} ({rounding === 'none' ? 'Asli' : `Bulat ${rounding}`})
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px] sticky top-0">
                  <tr>
                    <th className="p-2.5">No</th>
                    <th className="p-2.5">SKU</th>
                    <th className="p-2.5">Nama Produk</th>
                    <th className="p-2.5 text-right">Harga Eceran</th>
                    <th className="p-2.5 text-right text-emerald-800 font-black">Harga Tokopedia</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {uploadedItems.map((item, idx) => {
                    const price = calculateTokopediaPrice(item.eceran, adminPercent, fixedFee, rounding);
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 text-slate-400">{idx + 1}</td>
                        <td className="p-2 font-mono font-bold text-indigo-700">{item.sku}</td>
                        <td className="p-2 truncate max-w-xs">{item.name}</td>
                        <td className="p-2 text-right font-mono">{formatIDR(item.eceran)}</td>
                        <td className="p-2 text-right font-mono font-bold text-emerald-700 bg-emerald-50/50">
                          {formatIDR(price)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-between items-center">
              <span className="text-xs text-slate-500">
                Siap diunduh untuk update massal Tokopedia
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const excelData = uploadedItems.map((item, i) => ({
                      'No': i + 1,
                      'SKU': item.sku,
                      'Nama': item.name,
                      'Harga Eceran': item.eceran,
                      [`Admin (${adminPercent}%)`]: Math.round(item.eceran * (adminPercent / 100)),
                      'Biaya Packing': fixedFee,
                      'Harga Jual Tokopedia': calculateTokopediaPrice(item.eceran, adminPercent, fixedFee, rounding)
                    }));
                    const ws = XLSX.utils.json_to_sheet(excelData);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Hasil Tokopedia');
                    XLSX.writeFile(wb, `Hasil_Hitung_Tokopedia_${Date.now()}.xlsx`);
                    showToast('File Excel hasil hitung berhasil diunduh!');
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh Excel Hasil
                </button>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* MODAL: BULK SKU INPUT & AUTOMATIC CALCULATOR */}
      <TokopediaBulkSkuModal
        isOpen={showBulkSkuModal}
        onClose={() => setShowBulkSkuModal(false)}
        productList={productList}
        adminPercent={adminPercent}
        fixedFee={fixedFee}
        rounding={rounding}
        calculateTokopediaPrice={calculateTokopediaPrice}
        skuCategoryMap={skuCategoryMap}
        activeBulkSkus={activeBulkSkus}
        bulkSkuText={bulkSkuText}
        setBulkSkuText={setBulkSkuText}
        onApplyFilter={(skus) => {
          setActiveBulkSkus(skus);
          setCurrentPage(1);
        }}
        onClearFilter={() => {
          setActiveBulkSkus([]);
        }}
        showToast={showToast}
      />
    </div>
  );
}
