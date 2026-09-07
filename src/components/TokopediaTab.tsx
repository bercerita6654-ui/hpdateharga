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
  ExternalLink
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, Fees } from '../types';
import { formatIDR, sanitizeSku } from '../utils/helpers';

interface TokopediaTabProps {
  productList: Product[];
  fees?: Fees;
  setSelectedSku?: (sku: string) => void;
  setProduct?: React.Dispatch<React.SetStateAction<{ hpp: number; basePrice: number }>>;
  setActiveView?: (view: any) => void;
  categories?: string[];
  skuCategoryMap?: Record<string, string>;
}

export default function TokopediaTab({
  productList = [],
  fees,
  setSelectedSku,
  setProduct,
  setActiveView,
  categories = [],
  skuCategoryMap = {}
}: TokopediaTabProps) {
  // Formula parameters (Default: Eceran + 23% + 3.000)
  const [adminPercent, setAdminPercent] = useState<number>(23);
  const [fixedFee, setFixedFee] = useState<number>(3000);
  const [rounding, setRounding] = useState<string>('1000'); // Bulat 1000 default

  // Single item calculator state
  const [selectedProductSku, setSelectedProductSku] = useState<string>('');
  const [manualEceran, setManualEceran] = useState<string>('');
  const [searchProductQuery, setSearchProductQuery] = useState<string>('');
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);
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

  // Helper notification
  const showToast = (msg: string) => {
    setGlobalNotif(msg);
    setTimeout(() => setGlobalNotif(''), 3000);
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

  // Selected single product object
  const activeSingleProduct = useMemo(() => {
    return productList.find(p => sanitizeSku(p.sku) === sanitizeSku(selectedProductSku));
  }, [productList, selectedProductSku]);

  // Determine current active Eceran in single simulator
  const currentSingleEceran = useMemo(() => {
    if (manualEceran !== '') {
      return Number(manualEceran) || 0;
    }
    if (activeSingleProduct) {
      return Number(activeSingleProduct.eceran) || 0;
    }
    return 0;
  }, [manualEceran, activeSingleProduct]);

  // Breakdown for current single product
  const singleCalculation = useMemo(() => {
    const eceran = currentSingleEceran;
    const adminVal = eceran * (adminPercent / 100);
    const rawTotal = eceran + adminVal + fixedFee;
    const finalPrice = calculateTokopediaPrice(eceran, adminPercent, fixedFee, rounding);
    return {
      eceran,
      adminVal,
      fixedFee,
      rawTotal,
      finalPrice
    };
  }, [currentSingleEceran, adminPercent, fixedFee, rounding]);

  // Filtered products list for dropdown in single calculator
  const dropdownFilteredProducts = useMemo(() => {
    if (!searchProductQuery.trim()) return productList.slice(0, 10);
    const q = searchProductQuery.toLowerCase().trim();
    return productList
      .filter(p => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 15);
  }, [productList, searchProductQuery]);

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

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase().trim();
      result = result.filter(item => 
        item.sku.toLowerCase().includes(q) || 
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
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
  }, [calculatedCatalog, tableSearch, categoryFilter, stockFilter, sortBy]);

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

      {/* TOP SECTION: SIMULATOR PER PRODUK & RUMUS BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
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
                          className="text-slate-400 hover:text-slate-600"
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
                    className="p-1 text-slate-400 hover:text-emerald-700 hover:bg-emerald-100 rounded transition-colors"
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
                className="flex-1 sm:flex-initial px-4 py-2.5 bg-white text-emerald-800 hover:bg-emerald-50 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
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
                  className="px-3 py-2.5 bg-emerald-700/60 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs border border-emerald-400/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
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
                  <strong>+23% Komisi:</strong> Mencakup rata-rata potongan biaya layanan Tokopedia (Official Store / Power Merchant Pro) serta perkiraan biaya program promosi atau cashback.
                </li>
                <li>
                  <strong>+Rp 3.000:</strong> Alokasi biaya kardus packing, bubble wrap, lakban, label thermal, dan biaya admin proses transaksi lainnya.
                </li>
                <li>
                  <strong>Pembulatan 1.000:</strong> Memastikan harga tayang rapi (misal Rp 64.900 dibulatkan menjadi Rp 65.000) agar menarik pembeli dan memudahkan perhitungan voucher toko.
                </li>
              </ul>
            </div>

            <div className="pt-4 border-t border-emerald-200/70 text-[11px] text-emerald-800/80 bg-white/60 p-3 rounded-xl border border-emerald-200/50">
              <span className="font-bold text-emerald-900 block mb-0.5">💡 Tips Penggunaan:</span>
              Gunakan pencarian SKU atau masukkan nominal manual untuk melihat rincian kalkulasi seketika, atau unduh daftar harga lengkap seluruh produk lewat tabel di bawah.
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM SECTION: ALL PRODUCT CATALOG TOKOPEDIA PRICE TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Top Bar */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
              Katalog Lengkap &amp; Harga Jual Tokopedia
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Menampilkan {filteredCatalog.length} dari total {productList.length} produk katalog
            </p>
          </div>

          {/* Export and Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
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
              {paginatedCatalog.length === 0 ? (
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
                              window.scrollTo({ top: 0, behavior: 'smooth' });
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
    </div>
  );
}
