/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingDown,
  TrendingUp,
  Download,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Percent,
  DollarSign,
  ShieldAlert,
  ArrowRight,
  Info,
  CheckSquare,
  Square,
  Wand2,
  Trash2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Tag,
  Sliders,
  Layers,
  FileCheck,
  Check,
  Flame,
  ArrowDownRight,
  Lightbulb,
  X,
  Link2,
  Database,
  Package
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, Fees } from '../types';
import { formatIDR, formatInput, parseInput, sanitizeSku } from '../utils/helpers';

/**
 * Ekstraksi SKU 5 Digit Cerdas:
 * Stock List menggunakan SKU 5 digit (contoh: '03309', '01015', '00123').
 * Di file Shopee, kode produk di kolom 2 dan 4 seringkali menggunakan ID acak Shopee,
 * sedangkan nomor SKU 5 digit berada di kolom lain, atau terselip di Nama Produk / Kode Variasi.
 */
export const extract5DigitCandidates = (text: any): string[] => {
  if (text === undefined || text === null) return [];
  const str = String(text).trim();
  if (!str) return [];

  const results: string[] = [];
  const add = (val: string) => {
    if (val && !results.includes(val)) results.push(val);
  };

  // 1. Pola 5 digit berurutan: \b\d{5}\b
  const regex5 = /(?:^|\D)(\d{5})(?:\D|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex5.exec(str)) !== null) {
    if (match[1]) add(match[1]);
  }

  // 2. Pola dalam kurung / kurung siku: [03309] atau (03309) atau SKU-03309
  const bracketRegex = /[\[\(\{]([A-Za-z0-9_-]{3,12})[\]\)\}]/g;
  while ((match = bracketRegex.exec(str)) !== null) {
    const raw = match[1];
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 5) add(digits);
    else if (digits.length === 4) add(digits.padStart(5, '0'));
  }

  // 3. Pola 4 digit (Excel sering menghapus angka 0 di depan, misal 03309 -> 3309)
  const regex4 = /(?:^|\D)(\d{4})(?:\D|$)/g;
  while ((match = regex4.exec(str)) !== null) {
    if (match[1]) add(match[1].padStart(5, '0'));
  }

  return results;
};

/**
 * Mendeteksi SKU Khusus dengan format Bundle/Pack Qty (misal: 16878-10PCS atau 16878-5P).
 * Mengekstrak base SKU satuan dan kelipatan Qty.
 */
export const detectSpecialSkuQty = (code: any): { baseSku: string; qty: number; isSpecial: boolean; suffix: string } => {
  if (code === undefined || code === null) return { baseSku: '', qty: 1, isSpecial: false, suffix: '' };
  const str = String(code).trim().toUpperCase();
  if (!str) return { baseSku: '', qty: 1, isSpecial: false, suffix: '' };

  // Pola: 16878-10PCS, 16878-10P, 16878-10, 16878-5LBR, dsb.
  const match = str.match(/^(.*?)-(\d+)(PCS|P|LBR|SET|BOX|PACK|L)?$/);
  if (match) {
    const baseSku = match[1];
    const qty = parseInt(match[2], 10);
    const suffix = match[3] || '';
    if (qty > 1) {
      return { baseSku, qty, isSpecial: true, suffix };
    }
  }
  return { baseSku: str, qty: 1, isSpecial: false, suffix: '' };
};

/**
 * Representasi 1 baris item promo dengan 15 kolom standar file ekspor Shopee.
 * Sesuai permintaan pengguna:
 * - Baris data dimulai dari baris ke-4
 * - Harga yang dianalisa adalah kolom 'Rekomendasi Harga Diskon' agar tidak rugi
 *   ketika dipotong biaya % dan biaya tetap.
 * - Acuan SKU Stock List adalah SKU 5 digit.
 */
export interface PromoItemRow {
  id: string;
  // 15 Kolom Resmi Shopee
  productName: string;            // 1. Nama Produk
  productCode: string;            // 2. Kode Produk
  variationName: string;          // 3. Nama Variasi
  variationCode: string;          // 4. Kode Variasi (SKU variasi yang dicocokkan ke database)
  categoryL1: string;             // 5. Kategori Shopee L1
  categoryL2: string;             // 6. Kategori Shopee L2
  categoryL3: string;             // 7. Kategori Shopee L3
  salesCount: number;             // 8. Penjualan
  originalPrice: number;          // 9. Harga Awal
  currentPrice: number;           // 10. Harga Saat Ini
  promoPrice: number;             // 11. Harga Diskon (Harga yang diajukan oleh seller)
  shopeeRecommendedPrice: number; // 12. Rekomendasi Harga Diskon (HARGA UTAMA YANG DIANALISA!)
  stock: number;                  // 13. Stok
  promoStock: number;             // 14. Stok Promo
  purchaseLimit: number;          // 15. Batas Pembelian

  // Properti Internal & Analisa
  parentSku: string;              // Alias Kode Produk
  variationSku: string;           // Alias Kode Variasi
  discountPercent: number;        // Persentase Diskon terhadap Harga Awal
  manualHpp?: number;             // HPP yang dimasukkan manual jika SKU belum terdaftar
  matchedProduct?: Product;       // Produk yang cocok dari database Stock List
  originalRawRow?: any[];         // Baris mentah dari file Excel
  rawRowIndex?: number;           // Index baris asli pada file Excel (untuk menjaga susunan baris sama persis)
  assignedSku?: string;           // SKU 5 digit dari Stock List (contoh: '03309')
  skuMatchSource?: 'master_product_file' | 'manual' | 'exact' | '5digit_extract' | 'custom_col' | 'name_scan' | 'row_scan' | 'name_fuzzy' | 'none';
  isSpecialSku?: boolean;         // Apakah SKU khusus bundle/pack (misal: 16878-10PCS)
  specialSkuQty?: number;         // Kelipatan qty bundle/pack (misal 10)
  baseSkuCode?: string;           // Base SKU satuan (misal 16878)
}

/**
 * Representasi File 2: Data Produk Shopee (Mass Update Produk)
 * 14 Kolom dengan baris data mulai baris ke-7.
 * Jembatan penghubung:
 * xlsx 1 (Kode Variasi) dicocokkan dengan xlsx 2 (Kode Variasi),
 * lalu mengambil SKU dari kolom 'SKU' / 'SKU Induk' yang berisi SKU 5 digit Stock List.
 */
export interface ShopeeProductMasterItem {
  productCode: string;          // 1. Kode Produk
  productName: string;          // 2. Nama Produk
  variationCode: string;        // 3. Kode Variasi (KUNCI PENCOCOKAN DENGAN FILE 1!)
  variationName: string;        // 4. Nama Variasi
  parentSku: string;           // 5. SKU Induk (berisi SKU 5 digit Stock List)
  sku: string;                 // 6. SKU (berisi SKU 5 digit Stock List)
  price: number;               // 7. Harga
  gtin: string;                // 8. GTIN
  stock: number;               // 9. Stok
  minPurchase: number;         // 10. Min. Jumlah Pembelian
  maxPurchase: number;         // 11. Maks. Jumlah Pembelian
  startDate: string;           // 12. Maks. Jumlah Pembelian - Tanggal Mulai
  durationDays: string;        // 13. Maks. Jumlah Pembelian - Jumlah Hari
  endDate: string;             // 14. Maks. Jumlah Pembelian - Tanggal Berakhir
}

interface ShopeePromoAnalyzerTabProps {
  productList: Product[];
  fees: Fees;
  setSelectedSku: (sku: string) => void;
  setProduct: React.Dispatch<React.SetStateAction<{ hpp: number; basePrice: number }>>;
  setActiveView: (view: any) => void;
}

export default function ShopeePromoAnalyzerTab({
  productList,
  fees,
  setSelectedSku,
  setProduct,
  setActiveView
}: ShopeePromoAnalyzerTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterFileInputRef = useRef<HTMLInputElement>(null);

  // --- PARAMETER ANALISA HARGA ---
  // Default: 'rekomendasi' (menganalisa kolom Rekomendasi Harga Diskon sesuai permintaan user)
  const [analyzedTarget, setAnalyzedTarget] = useState<'rekomendasi' | 'diskon'>('rekomendasi');

  // Batas Margin Minimal Default 15%
  const [marginThreshold, setMarginThreshold] = useState<number>(15);
  // Acuan Modal HPP dari database produk
  const [hppReference, setHppReference] = useState<'hpp' | 'eceran' | 'grosir' | 'partai'>('hpp');

  // Pengaturan Baris Data Dimulai (Default: Baris ke-4 sesuai instruksi user)
  const [startDataRowNumber, setStartDataRowNumber] = useState<number>(4);

  // --- RINCIAN BIAYA POTONGAN TOKO STAR+ SHOPEE ---
  // Biaya Persentase (%)
  const [adminFeePercent, setAdminFeePercent] = useState<number>(fees.adminFee || 11.0);
  const [gratisOngkirXtraPercent, setGratisOngkirXtraPercent] = useState<number>(fees.layananXtra || 4.0);
  const [promoXtraPercent, setPromoXtraPercent] = useState<number>(6.5); // Promo XTRA+ 6.5%
  const [promosiTokoPercent, setPromosiTokoPercent] = useState<number>(5.0); // Biaya Promosi Toko 5-10%
  const [asuransiPercent, setAsuransiPercent] = useState<number>(fees.insurance || 0.5);
  const [amsPercent, setAmsPercent] = useState<number>(fees.komisiAMS || 1.0);

  // Biaya Nominal Tetap per Pesanan (Rp)
  const [marketplaceFeeRp, setMarketplaceFeeRp] = useState<number>(fees.marketplaceProcessingFee || 1250);
  const [jubelioFeeRp, setJubelioFeeRp] = useState<number>(fees.jubelioProcessingFee || 350);
  const [packingFeeRp, setPackingFeeRp] = useState<number>(fees.packingFee || 1000);
  const [hematBiayaKirimRp, setHematBiayaKirimRp] = useState<number>(fees.hematBiayaKirim || 510);

  // Toggle & View Controls
  const [showFeeSettings, setShowFeeSettings] = useState<boolean>(false);
  const [includeFixedFees, setIncludeFixedFees] = useState<boolean>(true);
  const [includePromoFees, setIncludePromoFees] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'compact' | 'full_shopee'>('compact');

  // Data States - File 1: Promosi Shopee
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<PromoItemRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [detectedHeaderInfo, setDetectedHeaderInfo] = useState<string | null>(null);

  // Simpan data mentah file upload untuk menjaga 100% format baris & kolom file Shopee asli
  const [uploadedRawRows, setUploadedRawRows] = useState<any[][] | null>(null);
  const [uploadedSheetName, setUploadedSheetName] = useState<string>('template');
  const [uploadedColHargaDiskon, setUploadedColHargaDiskon] = useState<number>(10);

  // Data States - File 2: Data Produk Shopee (14 Kolom, Mulai Baris 7)
  const [masterFileName, setMasterFileName] = useState<string | null>(() => {
    try {
      return localStorage.getItem('shopee_master_filename') || null;
    } catch {
      return null;
    }
  });
  const [masterProducts, setMasterProducts] = useState<ShopeeProductMasterItem[]>(() => {
    try {
      const saved = localStorage.getItem('shopee_master_products_data');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isProcessingMaster, setIsProcessingMaster] = useState<boolean>(false);
  const [masterParseError, setMasterParseError] = useState<string | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'danger' | 'safe' | 'missingHpp' | 'unmatchedSku'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showHeroHeader, setShowHeroHeader] = useState<boolean>(false);

  // Seleksi Produk Tertentu untuk Download / Aksi Massal
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState<boolean>(false);

  // --- ACUAN KOLOM SKU STOCK LIST (5 DIGIT) ---
  // Pilihan: 'auto' | 'col_kode_variasi' | 'col_kode_produk' | 'col_nama_produk' | 'col_nama_variasi' | 'custom_idx_${number}'
  const [skuColumnChoice, setSkuColumnChoice] = useState<string>('auto');
  const [detectedHeaders, setDetectedHeaders] = useState<{ index: number; name: string }[]>([]);
  const [customSkuMap, setCustomSkuMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('shopee_custom_sku_map');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Modal / Quick Linker SKU Stock List
  const [editingSkuItem, setEditingSkuItem] = useState<PromoItemRow | null>(null);
  const [skuPickerSearch, setSkuPickerSearch] = useState<string>('');

  // Map pencarian cepat dari File 2 (Data Produk Shopee)
  // Menghubungkan Kode Variasi Shopee -> Item File 2 (yang berisi SKU 5 digit Stock List)
  const masterProductMap = useMemo(() => {
    const map = new Map<string, ShopeeProductMasterItem>();
    masterProducts.forEach(m => {
      if (m.variationCode) {
        const cleanV = sanitizeSku(m.variationCode).toLowerCase().trim();
        if (cleanV) map.set(cleanV, m);
      }
      if (m.productCode) {
        const cleanP = sanitizeSku(m.productCode).toLowerCase().trim();
        if (cleanP && !map.has(cleanP)) map.set(cleanP, m);
      }
    });
    return map;
  }, [masterProducts]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 3500);
  };

  // Helper map untuk pencarian cepat SKU di productList
  const productSkuMap = useMemo(() => {
    const map = new Map<string, Product>();
    productList.forEach(p => {
      if (!p.sku) return;
      const clean = sanitizeSku(p.sku).toLowerCase().trim();
      map.set(clean, p);
      // Match tanpa angka nol di depan (misal: 03309 -> 3309)
      const noZero = clean.replace(/^0+/, '');
      if (noZero && !map.has(noZero)) {
        map.set(noZero, p);
      }
      // Match dengan padding 5 digit jika numerik (misal: 3309 -> 03309)
      if (clean.length < 5 && /^\d+$/.test(clean)) {
        const pad5 = clean.padStart(5, '0');
        if (!map.has(pad5)) map.set(pad5, p);
      }
    });
    return map;
  }, [productList]);

  const findProductDirect = (rawSku: any): Product | undefined => {
    if (rawSku === undefined || rawSku === null) return undefined;
    const clean = sanitizeSku(String(rawSku)).toLowerCase().trim();
    if (!clean) return undefined;
    if (productSkuMap.has(clean)) return productSkuMap.get(clean);

    const noZero = clean.replace(/^0+/, '');
    if (noZero && productSkuMap.has(noZero)) return productSkuMap.get(noZero);

    if (clean.length < 5 && /^\d+$/.test(clean)) {
      const pad5 = clean.padStart(5, '0');
      if (productSkuMap.has(pad5)) return productSkuMap.get(pad5);
    }

    return undefined;
  };

  const findProductBySkuOrName = (rawSku: string, rawName: string): Product | undefined => {
    const direct = findProductDirect(rawSku);
    if (direct) return direct;

    if (rawSku) {
      const clean = sanitizeSku(rawSku).toLowerCase().trim();
      // Pencocokan sebagian string SKU
      for (const p of productList) {
        const pClean = sanitizeSku(p.sku).toLowerCase().trim();
        if (pClean && (pClean.includes(clean) || clean.includes(pClean))) {
          return p;
        }
      }
    }

    // Jika SKU belum cocok, coba cari nama produk yang mirip
    if (rawName && rawName.trim().length > 3) {
      const cleanName = rawName.toLowerCase().trim();
      for (const p of productList) {
        const pName = (p.name || '').toLowerCase().trim();
        if (pName && (cleanName.includes(pName) || pName.includes(cleanName))) {
          return p;
        }
      }
    }

    return undefined;
  };

  /**
   * Pencocokan Cerdas SKU 5 Digit Stock List:
   * Mengatasi ketidakcocokan kode produk Shopee di kolom 2 & 4 dengan SKU 5-digit Stock List.
   * Sesuai instruksi:
   * Cocokkan dari xlsx 1 (Kode Variasi) dan xlsx 2 (Kode Variasi).
   * Setelah itu, ambil SKU dari kolom 'SKU' atau 'SKU Induk' dari xlsx 2,
   * lalu cocokkan nomor SKU 5 digit tersebut dengan STOCK LIST!
   */
  const matchProductForPromoRow = (
    rawRow: any[] | undefined,
    productName: string,
    productCode: string,
    variationName: string,
    variationCode: string,
    colChoice: string = skuColumnChoice,
    customMap: Record<string, string> = customSkuMap,
    overrideMasterMap?: Map<string, ShopeeProductMasterItem>
  ): { product?: Product; assignedSku?: string; matchSource: PromoItemRow['skuMatchSource'] } => {
    // 1. PRIORITAS UTAMA SESUAI INSTRUKSI PENGGUNA:
    // Mencocokkan dari xlsx 1 (kolom : Kode Variasi) dan xlsx 2 dengan kolom : Kode Variasi.
    // Setelah mencocokan itu barulah mengambil SKU dari kolom 'SKU' atau 'SKU Induk'
    // yang cocok dengan 5-digit STOCK LIST!
    const currentMasterMap = overrideMasterMap || masterProductMap;
    const vClean = sanitizeSku(variationCode || '').toLowerCase().trim();
    const pClean = sanitizeSku(productCode || '').toLowerCase().trim();

    // Check with special SKU suffix stripped as well (e.g. 16878-10PCS -> 16878)
    const specV = detectSpecialSkuQty(variationCode);
    const specP = detectSpecialSkuQty(productCode);
    const vCleanBase = specV.isSpecial ? sanitizeSku(specV.baseSku).toLowerCase().trim() : '';
    const pCleanBase = specP.isSpecial ? sanitizeSku(specP.baseSku).toLowerCase().trim() : '';

    let masterItem: ShopeeProductMasterItem | undefined = undefined;
    if (vClean && currentMasterMap.has(vClean)) {
      masterItem = currentMasterMap.get(vClean);
    } else if (vCleanBase && currentMasterMap.has(vCleanBase)) {
      masterItem = currentMasterMap.get(vCleanBase);
    } else if (pClean && currentMasterMap.has(pClean)) {
      masterItem = currentMasterMap.get(pClean);
    } else if (pCleanBase && currentMasterMap.has(pCleanBase)) {
      masterItem = currentMasterMap.get(pCleanBase);
    }

    if (masterItem) {
      // Periksa kolom 'SKU' (variasi) dan 'SKU Induk' dari File 2
      const candidateMasterSkus = [masterItem.sku, masterItem.parentSku].filter(Boolean);

      for (const rawMasterSku of candidateMasterSkus) {
        const cleanSku = String(rawMasterSku).trim();
        if (!cleanSku) continue;

        // a. Cek langsung ke database Stock List
        const directStock = findProductDirect(cleanSku);
        if (directStock) {
          return {
            product: directStock,
            assignedSku: directStock.sku,
            matchSource: 'master_product_file'
          };
        }

        // b. Ekstrak 5 digit jika formatnya mengandung teks tambahan (misal: "03309-1", "BKY03309")
        for (const cand of extract5DigitCandidates(cleanSku)) {
          const directCand = findProductDirect(cand);
          if (directCand) {
            return {
              product: directCand,
              assignedSku: directCand.sku,
              matchSource: 'master_product_file'
            };
          }
        }

        // c. Coba pencocokan nama atau SKU sebagian
        const stockByName = findProductBySkuOrName(cleanSku, productName || masterItem.productName);
        if (stockByName) {
          return {
            product: stockByName,
            assignedSku: stockByName.sku,
            matchSource: 'master_product_file'
          };
        }
      }

      // Jika belum terdaftar di Stock List, tetap pasang nomor SKU dari File 2
      const firstSku = (masterItem.sku || masterItem.parentSku || '').trim();
      if (firstSku) {
        return {
          product: undefined,
          assignedSku: firstSku,
          matchSource: 'master_product_file'
        };
      }
    }

    // 2. Periksa pemetaan manual pengguna
    const manualKeys = [variationCode, productCode, productName].filter(Boolean);
    for (const key of manualKeys) {
      const cleanKey = String(key).trim().toLowerCase();
      if (customMap[cleanKey]) {
        const targetSku = customMap[cleanKey];
        const p = findProductDirect(targetSku);
        if (p) return { product: p, assignedSku: p.sku, matchSource: 'manual' };
      }
    }

    // 2. Jika user memilih kolom kustom spesifik dari file Excel
    if (colChoice.startsWith('custom_idx_') && rawRow && Array.isArray(rawRow)) {
      const colIdx = parseInt(colChoice.replace('custom_idx_', ''), 10);
      const cellVal = String(rawRow[colIdx] ?? '').trim();
      if (cellVal) {
        const direct = findProductDirect(cellVal);
        if (direct) return { product: direct, assignedSku: direct.sku, matchSource: 'custom_col' };
        for (const cand of extract5DigitCandidates(cellVal)) {
          const p = findProductDirect(cand);
          if (p) return { product: p, assignedSku: p.sku, matchSource: 'custom_col' };
        }
      }
    } else if (colChoice === 'col_kode_variasi') {
      const direct = findProductDirect(variationCode);
      if (direct) return { product: direct, assignedSku: direct.sku, matchSource: 'exact' };
      for (const cand of extract5DigitCandidates(variationCode)) {
        const p = findProductDirect(cand);
        if (p) return { product: p, assignedSku: p.sku, matchSource: '5digit_extract' };
      }
    } else if (colChoice === 'col_kode_produk') {
      const direct = findProductDirect(productCode);
      if (direct) return { product: direct, assignedSku: direct.sku, matchSource: 'exact' };
      for (const cand of extract5DigitCandidates(productCode)) {
        const p = findProductDirect(cand);
        if (p) return { product: p, assignedSku: p.sku, matchSource: '5digit_extract' };
      }
    } else if (colChoice === 'col_nama_produk') {
      for (const cand of extract5DigitCandidates(productName)) {
        const p = findProductDirect(cand);
        if (p) return { product: p, assignedSku: p.sku, matchSource: 'name_scan' };
      }
    } else if (colChoice === 'col_nama_variasi') {
      for (const cand of extract5DigitCandidates(variationName)) {
        const p = findProductDirect(cand);
        if (p) return { product: p, assignedSku: p.sku, matchSource: '5digit_extract' };
      }
    }

    // 3. Mode AUTO / Pindai Otomatis SKU 5-Digit:
    // a. Cek kode variasi (apakah persis SKU atau mengandung 5 digit)
    if (variationCode) {
      const direct = findProductDirect(variationCode);
      if (direct) return { product: direct, assignedSku: direct.sku, matchSource: 'exact' };
      for (const cand of extract5DigitCandidates(variationCode)) {
        const p = findProductDirect(cand);
        if (p) return { product: p, assignedSku: p.sku, matchSource: '5digit_extract' };
      }
    }

    // b. Cek kode produk
    if (productCode) {
      const direct = findProductDirect(productCode);
      if (direct) return { product: direct, assignedSku: direct.sku, matchSource: 'exact' };
      for (const cand of extract5DigitCandidates(productCode)) {
        const p = findProductDirect(cand);
        if (p) return { product: p, assignedSku: p.sku, matchSource: '5digit_extract' };
      }
    }

    // c. Cek nama produk (sangat sering mengandung [03309] atau 03309 Buku Tulis)
    if (productName) {
      for (const cand of extract5DigitCandidates(productName)) {
        const p = findProductDirect(cand);
        if (p) return { product: p, assignedSku: p.sku, matchSource: 'name_scan' };
      }
    }

    // d. Cek nama variasi
    if (variationName) {
      for (const cand of extract5DigitCandidates(variationName)) {
        const p = findProductDirect(cand);
        if (p) return { product: p, assignedSku: p.sku, matchSource: '5digit_extract' };
      }
    }

    // e. Pindai SELURUH sel di baris Excel (jika ada kolom SKU lain di file Excel)
    if (rawRow && Array.isArray(rawRow)) {
      for (let c = 0; c < rawRow.length; c++) {
        const cell = String(rawRow[c] ?? '').trim();
        if (!cell) continue;
        const direct = findProductDirect(cell);
        if (direct) return { product: direct, assignedSku: direct.sku, matchSource: 'row_scan' };
        for (const cand of extract5DigitCandidates(cell)) {
          const p = findProductDirect(cand);
          if (p) return { product: p, assignedSku: p.sku, matchSource: 'row_scan' };
        }
      }
    }

    // f. Fallback nama produk mirip
    if (productName && productName.trim().length > 3) {
      const cleanName = productName.toLowerCase().trim();
      for (const p of productList) {
        const pName = (p.name || '').toLowerCase().trim();
        if (pName && (cleanName.includes(pName) || pName.includes(cleanName))) {
          return { product: p, assignedSku: p.sku, matchSource: 'name_fuzzy' };
        }
      }
    }

    return { product: undefined, assignedSku: undefined, matchSource: 'none' };
  };

  // Filter daftar Stock List untuk modal pencarian SKU
  const filteredStockList = useMemo(() => {
    if (!skuPickerSearch.trim()) return productList.slice(0, 20);
    const q = skuPickerSearch.toLowerCase().trim();
    const cleanQ = sanitizeSku(q).toLowerCase();
    return productList.filter(p => {
      const pSku = sanitizeSku(p.sku).toLowerCase();
      const pName = (p.name || '').toLowerCase();
      return pSku.includes(cleanQ) || pName.includes(q);
    }).slice(0, 25);
  }, [productList, skuPickerSearch]);

  // Kalkulasi Total Potongan % & Rp Toko Star+ Shopee
  const totalPercentageRate = useMemo(() => {
    let sum = adminFeePercent + gratisOngkirXtraPercent + asuransiPercent + amsPercent;
    if (includePromoFees) {
      sum += promoXtraPercent + promosiTokoPercent;
    }
    return sum;
  }, [adminFeePercent, gratisOngkirXtraPercent, asuransiPercent, amsPercent, includePromoFees, promoXtraPercent, promosiTokoPercent]);

  const totalFixedFeesPerOrder = useMemo(() => {
    if (!includeFixedFees) return 0;
    return marketplaceFeeRp + jubelioFeeRp + packingFeeRp + hematBiayaKirimRp;
  }, [includeFixedFees, marketplaceFeeRp, jubelioFeeRp, packingFeeRp, hematBiayaKirimRp]);

  /**
   * Fungsi Kalkulasi Lengkap per Item:
   * Mengutamakan analisa pada kolom 'Rekomendasi Harga Diskon' agar penjual
   * tidak rugi saat dipotong biaya % dan biaya tetap Toko Star+.
   */
  const calculateItemAnalysis = (item: PromoItemRow) => {
    // Detect special SKU and quantity multiplier (e.g. 16878-10PCS -> 10x multiplier)
    // We check the original raw fields first as they preserve the -10PCS suffix even if assignedSku was resolved to 5-digit base.
    const rawCodesForSpec = [item.variationCode, item.productCode, item.variationSku, item.parentSku, item.assignedSku].filter(Boolean);
    let spec = { baseSku: '', qty: 1, isSpecial: false, suffix: '' };
    for (const code of rawCodesForSpec) {
      const res = detectSpecialSkuQty(code);
      if (res.isSpecial) {
        spec = res;
        break;
      }
    }
    // Fallback if no special SKU format found
    if (!spec.isSpecial) {
      spec = detectSpecialSkuQty(item.assignedSku || item.variationCode || item.productCode || item.variationSku || item.parentSku);
    }

    const targetSku = spec.isSpecial ? spec.baseSku : (item.assignedSku || item.variationCode || item.productCode || item.variationSku || item.parentSku);
    const searchSku = spec.isSpecial ? spec.baseSku : targetSku;

    const matched = item.matchedProduct || findProductDirect(searchSku) || findProductBySkuOrName(searchSku, item.productName);
    const qtyMultiplier = spec.qty || 1;

    // HPP / Modal Acuan
    let hpp = 0;
    if (item.manualHpp !== undefined && item.manualHpp > 0) {
      hpp = item.manualHpp;
    } else if (matched) {
      if (hppReference === 'eceran') hpp = (matched.eceran || matched.hpp) * qtyMultiplier;
      else if (hppReference === 'grosir') hpp = (matched.grosir || matched.hpp) * qtyMultiplier;
      else if (hppReference === 'partai') hpp = (matched.partai || matched.hpp) * qtyMultiplier;
      else hpp = matched.hpp * qtyMultiplier;
    }
    const hasHpp = hpp > 0;

    const originalPrice = item.originalPrice || item.currentPrice || 0;
    const shopeeRecommendedPrice = item.shopeeRecommendedPrice || 0;
    const promoPrice = item.promoPrice || 0;

    // Tentukan harga acuan yang sedang diuji / dianalisa
    // Sesuai permintaan user: Analisa difokuskan pada kolom "Rekomendasi Harga Diskon"
    let evaluatedPrice = 0;
    let priceLabel = '';
    if (analyzedTarget === 'rekomendasi') {
      evaluatedPrice = shopeeRecommendedPrice > 0 ? shopeeRecommendedPrice : promoPrice;
      priceLabel = shopeeRecommendedPrice > 0 ? 'Rekomendasi Shopee' : 'Harga Diskon (Shopee kosong)';
    } else {
      evaluatedPrice = promoPrice > 0 ? promoPrice : shopeeRecommendedPrice;
      priceLabel = 'Harga Diskon Diajukan';
    }

    // Persentase diskon yang diuji terhadap harga awal
    const discountPercent =
      originalPrice > 0 && evaluatedPrice > 0
        ? ((originalPrice - evaluatedPrice) / originalPrice) * 100
        : item.discountPercent;

    // 1. Potongan Persentase Marketplace Toko Star+ (Rp)
    const percentageFeeRp = (evaluatedPrice * totalPercentageRate) / 100;
    // 2. Potongan Biaya Tetap per Pesanan (Rp)
    const fixedFeeRp = totalFixedFeesPerOrder;
    // Total Potongan Marketplace
    const totalPotonganRp = percentageFeeRp + fixedFeeRp;

    // 3. Pencairan Bersih (Net Payout)
    const netPayout = Math.max(0, evaluatedPrice - totalPotonganRp);

    // 4. Laba / Rugi Bersih
    const netProfit = hasHpp ? netPayout - hpp : 0;
    // 5. Margin Bersih (%)
    const netMarginPercent = evaluatedPrice > 0 && hasHpp ? (netProfit / evaluatedPrice) * 100 : 0;

    // 6. Rekomendasi Harga Diskon Minimum Aman agar TIDAK RUGI dan mencapai marginThreshold:
    // Rumus: MinSafePrice * (1 - (totalPercentageRate + marginThreshold)/100) = HPP + fixedFeeRp
    const rateFactor = 1 - (totalPercentageRate + marginThreshold) / 100;
    let minSafePromoPrice = 0;
    if (hasHpp) {
      if (rateFactor > 0.05) {
        minSafePromoPrice = (hpp + fixedFeeRp) / rateFactor;
      } else {
        minSafePromoPrice = (hpp + fixedFeeRp) * 1.5;
      }
      // Dibulatkan ke atas ratusan terdekat
      minSafePromoPrice = Math.ceil(minSafePromoPrice / 100) * 100;
    }

    // 7. Harga Impas (Break-Even Price / Margin 0%):
    // Agar tidak rugi sama sekali (netProfit >= 0)
    const breakEvenRateFactor = 1 - totalPercentageRate / 100;
    let breakEvenPrice = 0;
    if (hasHpp) {
      if (breakEvenRateFactor > 0.05) {
        breakEvenPrice = (hpp + fixedFeeRp) / breakEvenRateFactor;
      } else {
        breakEvenPrice = (hpp + fixedFeeRp) * 1.3;
      }
      breakEvenPrice = Math.ceil(breakEvenPrice / 100) * 100;
    }

    // 8. Evaluasi Status Kelayakan Rekomendasi Harga Diskon Shopee
    let status: 'danger' | 'safe' | 'missingHpp' = 'safe';
    let statusMessage = '';

    if (!hasHpp) {
      status = 'missingHpp';
      statusMessage = 'HPP Belum Terdaftar di Database';
    } else if (netProfit < 0) {
      status = 'danger';
      statusMessage = `RUGI BERSIH ${formatIDR(Math.abs(netProfit))}/pcs jika ikuti ${priceLabel}!`;
    } else if (netMarginPercent < marginThreshold) {
      status = 'danger';
      statusMessage = `Margin ${netMarginPercent.toFixed(1)}% < Batas Target ${marginThreshold}%`;
    } else {
      status = 'safe';
      statusMessage = `Aman! Laba ${formatIDR(netProfit)}/pcs (Margin ${netMarginPercent.toFixed(1)}%)`;
    }

    // Defisit terhadap harga aman
    const deficitPrice = hasHpp && minSafePromoPrice > evaluatedPrice ? minSafePromoPrice - evaluatedPrice : 0;

    // Evaluasi spesifik untuk kolom Rekomendasi Shopee jika berbeda dari evaluatedPrice
    let isShopeeLoss = false;
    let shopeeNetProfit = 0;
    if (shopeeRecommendedPrice > 0 && hasHpp) {
      const shopeePotongan = (shopeeRecommendedPrice * totalPercentageRate) / 100 + fixedFeeRp;
      const shopeePayout = Math.max(0, shopeeRecommendedPrice - shopeePotongan);
      shopeeNetProfit = shopeePayout - hpp;
      isShopeeLoss = shopeeNetProfit < 0;
    }

    return {
      hpp,
      hasHpp,
      originalPrice,
      evaluatedPrice,
      priceLabel,
      shopeeRecommendedPrice,
      promoPrice,
      discountPercent,
      percentageFeeRp,
      fixedFeeRp,
      totalPotonganRp,
      netPayout,
      netProfit,
      netMarginPercent,
      minSafePromoPrice,
      breakEvenPrice,
      deficitPrice,
      status,
      statusMessage,
      matchedProduct: matched,
      isShopeeLoss,
      shopeeNetProfit,
      qtyMultiplier,
      isSpecialSku: spec.isSpecial,
      baseSkuCode: spec.baseSku
    };
  };

  // Helper pembersih angka dari sel Excel
  const parseNum = (val: any): number => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const str = String(val).replace(/[^0-9.-]/g, '');
    const num = Number(str);
    return isNaN(num) ? 0 : num;
  };

  // Helper pembersih string teks
  const parseStr = (val: any): string => {
    if (val === undefined || val === null) return '';
    return String(val).trim();
  };

  /**
   * Parser Upload File XLSX / XLS / CSV Shopee
   * Membaca 15 kolom persis:
   * 1. Nama Produk
   * 2. Kode Produk
   * 3. Nama Variasi
   * 4. Kode Variasi
   * 5. Kategori Shopee L1
   * 6. Kategori Shopee L2
   * 7. Kategori Shopee L3
   * 8. Penjualan
   * 9. Harga Awal
   * 10. Harga Saat Ini
   * 11. Harga Diskon
   * 12. Rekomendasi Harga Diskon (Kolom yang Dianalisa!)
   * 13. Stok
   * 14. Stok Promo
   * 15. Batas Pembelian
   */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setParseError(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = evt.target?.result;
        // Gunakan buffer array / binary string yang didukung SheetJS
        const workbook = XLSX.read(data, { type: typeof data === 'string' ? 'binary' : 'array' });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('File Excel tidak memiliki lembar kerja (worksheet).');
        }

        // Cari sheet yang memiliki data (biasanya sheet pertama, atau sheet dengan kata 'promo'/'diskon'/'template')
        let targetSheetName = workbook.SheetNames[0];
        for (const name of workbook.SheetNames) {
          const lower = name.toLowerCase();
          if (lower.includes('promo') || lower.includes('diskon') || lower.includes('item') || lower.includes('produk') || lower.includes('shopee')) {
            targetSheetName = name;
            break;
          }
        }

        const worksheet = workbook.Sheets[targetSheetName];
        if (!worksheet) {
          throw new Error(`Lembar kerja "${targetSheetName}" tidak dapat dibaca.`);
        }

        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rows || rows.length === 0) {
          throw new Error('FORMAT FILE 1 DITOLAK: File Excel kosong atau tidak terbaca.');
        }

        // 1. Cek apakah pengguna salah mengunggah File 2 (Data Produk Shopee) ke dalam File 1
        const sampleText = rows.slice(0, 12).map(r => (Array.isArray(r) ? r.join(' ') : '')).join(' ').toLowerCase();
        if (
          (sampleText.includes('min. jumlah pembelian') || sampleText.includes('maks. jumlah pembelian')) &&
          (sampleText.includes('gtin') || sampleText.includes('sku induk'))
        ) {
          throw new Error('FORMAT SALAH: File yang Anda unggah adalah File 2 (Data Produk Shopee), bukan File 1 (Promosi Shopee). Silakan unggah file ini pada kotak File 2 di sebelah kanan.');
        }

        if (sampleText.includes('eceran') && sampleText.includes('grosir') && sampleText.includes('partai') && !sampleText.includes('rekomendasi')) {
          throw new Error('FORMAT SALAH: File yang diunggah adalah Stock List Toko, bukan File Promosi Shopee. Silakan unggah file promosi resmi dari Shopee Seller Centre.');
        }

        // Cari Baris Header secara cerdas di seluruh baris awal (hingga baris ke-15)
        let headerRowIdx = -1;
        const colMap: Record<string, number> = {};

        for (let r = 0; r < Math.min(15, rows.length); r++) {
          const row = rows[r];
          if (!Array.isArray(row)) continue;

          const rowStr = row.map(c => String(c ?? '').toLowerCase().trim());
          const hasNamaProduk = rowStr.some(c => c.includes('nama produk') || c.includes('product name') || c.includes('et_title_product_name'));
          const hasKode = rowStr.some(c => c.includes('kode') || c.includes('sku'));
          const hasRekomendasi = rowStr.some(c => c.includes('rekomendasi') || c.includes('diskon') || c.includes('harga') || c.includes('stok'));

          // Jika baris ini mengandung indikator header kolom Shopee
          if ((hasNamaProduk && (hasKode || hasRekomendasi)) || (hasKode && hasRekomendasi)) {
            headerRowIdx = r;
            rowStr.forEach((colName, cIdx) => {
              if (colName) {
                // Simpan versi bersih
                colMap[colName] = cIdx;
                // Simpan juga versi tanpa spasi / simbol
                const simplified = colName.replace(/[^a-z0-9]/g, '');
                if (simplified) colMap[simplified] = cIdx;
              }
            });
            break;
          }
        }

        // Jika tidak terdeteksi via kata kunci, periksa apakah baris ke-3 (index 2) ada teks header
        if (headerRowIdx === -1) {
          let bestIdx = -1;
          let maxCols = 0;
          for (let r = 0; r < Math.min(6, rows.length); r++) {
            const count = (rows[r] || []).filter(c => typeof c === 'string' && c.trim().length > 0).length;
            if (count > maxCols) {
              maxCols = count;
              bestIdx = r;
            }
          }

          if (bestIdx !== -1 && maxCols >= 3) {
            headerRowIdx = bestIdx;
            (rows[headerRowIdx] || []).forEach((colName: any, cIdx: number) => {
              const str = String(colName ?? '').toLowerCase().trim();
              if (str) {
                colMap[str] = cIdx;
                const simplified = str.replace(/[^a-z0-9]/g, '');
                if (simplified) colMap[simplified] = cIdx;
              }
            });
          }
        }

        if (headerRowIdx === -1) {
          throw new Error('FORMAT FILE 1 DITOLAK: Tidak ditemukan baris header kolom promosi Shopee yang valid. File promosi resmi Shopee wajib memiliki kolom: Nama Produk, Kode Produk, Kode Variasi, dan Rekomendasi Harga Diskon.');
        }

        // Simpan daftar seluruh kolom yang terdeteksi untuk dropdown acuan kolom custom
        const detectedHdrList: { index: number; name: string }[] = [];
        if (headerRowIdx >= 0 && rows[headerRowIdx] && Array.isArray(rows[headerRowIdx])) {
          rows[headerRowIdx].forEach((colVal: any, idx: number) => {
            const name = String(colVal ?? '').trim();
            if (name) {
              detectedHdrList.push({ index: idx, name });
            }
          });
        }
        setDetectedHeaders(detectedHdrList);

        // Helper cari index kolom
        const findColIdx = (exactOrKeywords: string[], defaultFallbackIdx: number = -1): number => {
          for (const kw of exactOrKeywords) {
            const cleanKw = kw.toLowerCase().trim();
            const simplified = cleanKw.replace(/[^a-z0-9]/g, '');
            if (colMap[cleanKw] !== undefined) return colMap[cleanKw];
            if (colMap[simplified] !== undefined) return colMap[simplified];
          }
          for (const key of Object.keys(colMap)) {
            for (const kw of exactOrKeywords) {
              const cleanKw = kw.toLowerCase().trim();
              if (key.includes(cleanKw)) {
                return colMap[key];
              }
            }
          }
          return defaultFallbackIdx;
        };

        // Pemetaan Kolom Resmi Shopee (tanpa fallback default angka agar mendeteksi ketidaksesuaian kolom)
        const colNamaProduk = findColIdx(['nama produk', 'product name', 'et_title_product_name', 'namaproduk'], -1);
        const colKodeProduk = findColIdx(['kode produk', 'product code', 'parent sku', 'sku induk', 'id produk', 'kodeproduk'], -1);
        const colNamaVariasi = findColIdx(['nama variasi', 'variation name', 'variasi', 'et_title_variation_name', 'namavariasi'], -1);
        const colKodeVariasi = findColIdx(['kode variasi', 'variation sku', 'sku variasi', 'sku', 'kode sku', 'kodevariasi'], -1);
        const colKatL1 = findColIdx(['kategori shopee l1', 'kategori l1', 'category l1', 'l1'], -1);
        const colKatL2 = findColIdx(['kategori shopee l2', 'kategori l2', 'category l2', 'l2'], -1);
        const colKatL3 = findColIdx(['kategori shopee l3', 'kategori l3', 'category l3', 'l3'], -1);
        const colPenjualan = findColIdx(['penjualan', 'total penjualan', 'sales', 'terjual'], -1);
        const colHargaAwal = findColIdx(['harga awal', 'harga normal', 'harga asli', 'original price', 'hargaawal'], -1);
        const colHargaSaatIni = findColIdx(['harga saat ini', 'current price', 'harga aktif', 'harga sekarang', 'hargasaatini'], -1);
        const colHargaDiskon = findColIdx(['harga diskon', 'discount price', 'promo price', 'harga promo', 'hargadiskon'], -1);
        const colRekomendasiDiskon = findColIdx([
          'rekomendasi harga diskon',
          'rekomendasi harga',
          'recommended discount price',
          'rekomendasi diskon',
          'rekomendasihargadiskon',
          'rekomendasi'
        ], -1);
        const colStok = findColIdx(['stok', 'total stok', 'stock'], -1);
        const colStokPromo = findColIdx(['stok promo', 'promo stock', 'stok promosi', 'stokpromo'], -1);
        const colBatasBeli = findColIdx(['batas pembelian', 'purchase limit', 'maks pembelian', 'limit beli', 'bataspembelian'], -1);

        // VALIDASI KETAT: Cek apakah kolom-kolom utama promosi Shopee ditemukan
        const hasValidName = colNamaProduk !== -1;
        const hasValidCode = colKodeVariasi !== -1 || colKodeProduk !== -1;
        const hasValidPrice = colRekomendasiDiskon !== -1 || colHargaDiskon !== -1 || colHargaSaatIni !== -1 || colHargaAwal !== -1;

        const matchedColsCount = [
          colNamaProduk, colKodeProduk, colNamaVariasi, colKodeVariasi,
          colKatL1, colKatL2, colKatL3, colPenjualan, colHargaAwal,
          colHargaSaatIni, colHargaDiskon, colRekomendasiDiskon,
          colStok, colStokPromo, colBatasBeli
        ].filter(idx => idx !== -1).length;

        if (!hasValidName || !hasValidCode || !hasValidPrice || matchedColsCount < 4) {
          const missingCols: string[] = [];
          if (!hasValidName) missingCols.push('Nama Produk');
          if (!hasValidCode) missingCols.push('Kode Variasi / Kode Produk');
          if (!hasValidPrice) missingCols.push('Rekomendasi Harga Diskon / Harga Diskon / Harga Awal');
          throw new Error(`FORMAT FILE 1 DITOLAK SECARA OTOMATIS: Format kolom tidak sesuai dengan File Promosi Shopee! ${missingCols.length > 0 ? `Kolom berikut tidak ditemukan: ${missingCols.join(', ')}.` : ''} Pastikan mengunggah file template promosi resmi dari Shopee Seller Centre.`);
        }

        // Simpan baris mentah, nama sheet, dan posisi kolom 'Harga Diskon' asli
        setUploadedRawRows(rows);
        setUploadedSheetName(targetSheetName || 'template');
        setUploadedColHargaDiskon(colHargaDiskon >= 0 ? colHargaDiskon : 10);

        // Penentuan baris data:
        // Prioritaskan baris setelah header terdeteksi. Jika user memilih startDataRowNumber (misal baris 4),
        // gunakan index min(startDataRowNumber - 1, headerRowIdx + 1) agar tidak melewati data jika header di baris 1 atau 2.
        let effectiveStartIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : startDataRowNumber - 1;
        
        // Namun jika startDataRowNumber dikonfigurasi ke 4 dan header terdeteksi di baris 1-3,
        // kita periksa apakah di baris ke-4 ada data. Jika tidak ada di baris 4 tapi ada di headerRowIdx + 1, gunakan yang ada data.
        if (headerRowIdx >= 0 && headerRowIdx + 1 < rows.length) {
          // Jika baris ke-4 lebih besar dari header + 1, pastikan baris di antaranya bukan data produk asli
          effectiveStartIdx = Math.max(headerRowIdx + 1, Math.min(startDataRowNumber - 1, rows.length - 1));
        }

        // Loop untuk parsing data
        const parsedItems: PromoItemRow[] = [];

        for (let r = effectiveStartIdx; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row) || row.length === 0) continue;

          // Cek apakah seluruh sel baris kosong
          const hasAnyCell = row.some(c => c !== undefined && c !== null && String(c).trim() !== '');
          if (!hasAnyCell) continue;

          // Ambil nilai setiap kolom
          const productName = parseStr(row[colNamaProduk]);
          const productCode = parseStr(row[colKodeProduk]);
          const variationName = parseStr(row[colNamaVariasi]);
          const variationCode = parseStr(row[colKodeVariasi]);
          const categoryL1 = parseStr(row[colKatL1]);
          const categoryL2 = parseStr(row[colKatL2]);
          const categoryL3 = parseStr(row[colKatL3]);
          const salesCount = parseNum(row[colPenjualan]);
          const originalPrice = parseNum(row[colHargaAwal]);
          const currentPrice = parseNum(row[colHargaSaatIni]);
          let promoPrice = parseNum(row[colHargaDiskon]);
          const shopeeRecommendedPrice = parseNum(row[colRekomendasiDiskon]);
          const stock = parseNum(row[colStok]);
          const promoStock = parseNum(row[colStokPromo]);
          const purchaseLimit = parseNum(row[colBatasBeli]);

          // Cek apakah baris ini adalah baris keterangan/catatan Shopee di bawah tabel
          const combinedStr = row.map(c => String(c ?? '').toLowerCase()).join(' ');
          if (
            combinedStr.includes('catatan:') ||
            combinedStr.includes('note:') ||
            combinedStr.includes('perhatian:') ||
            combinedStr.includes('syarat & ketentuan')
          ) {
            continue;
          }

          // Baris data valid: minimal ada nama produk, kode produk/variasi, ATAU ada harga/stok
          const hasIdentifier = Boolean(productName || productCode || variationCode || variationName);
          const hasPriceOrStock = originalPrice > 0 || currentPrice > 0 || promoPrice > 0 || shopeeRecommendedPrice > 0 || stock > 0;

          if (!hasIdentifier && !hasPriceOrStock) {
            continue;
          }

          // Jika harga diskon belum ada tapi ada rekomendasi atau harga saat ini
          if (promoPrice <= 0 && shopeeRecommendedPrice > 0) {
            promoPrice = shopeeRecommendedPrice;
          } else if (promoPrice <= 0 && currentPrice > 0) {
            promoPrice = currentPrice;
          }

          const baseOriginal = originalPrice > 0 ? originalPrice : currentPrice > 0 ? currentPrice : promoPrice;
          const discountPercent =
            baseOriginal > 0 && promoPrice > 0 ? ((baseOriginal - promoPrice) / baseOriginal) * 100 : 0;

          // Pencocokan ke database produk Stock List menggunakan SKU 5 Digit Cerdas
          const matchResult = matchProductForPromoRow(
            row,
            productName,
            productCode,
            variationName,
            variationCode,
            skuColumnChoice,
            customSkuMap
          );
          const matched = matchResult.product;
          const assignedSku = matchResult.assignedSku || (matched ? matched.sku : undefined);

          parsedItems.push({
            id: `row-${r}-${assignedSku || variationCode || productCode || Math.random()}`,
            productName: productName || (matched ? matched.name : assignedSku ? `Produk ${assignedSku}` : `Item Baris ${r + 1}`),
            productCode: productCode || (matched ? matched.sku : ''),
            variationName,
            variationCode,
            categoryL1,
            categoryL2,
            categoryL3,
            salesCount,
            originalPrice: baseOriginal,
            currentPrice: currentPrice || baseOriginal,
            promoPrice: promoPrice || baseOriginal,
            shopeeRecommendedPrice,
            stock,
            promoStock: promoStock || stock,
            purchaseLimit,
            parentSku: productCode,
            variationSku: variationCode,
            discountPercent: Math.max(0, discountPercent),
            matchedProduct: matched,
            assignedSku,
            skuMatchSource: matchResult.matchSource,
            rawRowIndex: r,
            originalRawRow: row
          });
        }

        // Jika masih kosong dan effectiveStartIdx > 1, coba fallback pindai dari baris ke-1 (headerRowIdx + 1)
        if (parsedItems.length === 0 && effectiveStartIdx > 1) {
          for (let r = 1; r < rows.length; r++) {
            if (r === headerRowIdx) continue;
            const row = rows[r];
            if (!row || !Array.isArray(row) || row.length === 0) continue;

            const productName = parseStr(row[colNamaProduk]);
            const productCode = parseStr(row[colKodeProduk]);
            const variationName = parseStr(row[colNamaVariasi]);
            const variationCode = parseStr(row[colKodeVariasi]);
            const salesCount = parseNum(row[colPenjualan]);
            const originalPrice = parseNum(row[colHargaAwal]);
            const currentPrice = parseNum(row[colHargaSaatIni]);
            let promoPrice = parseNum(row[colHargaDiskon]);
            const shopeeRecommendedPrice = parseNum(row[colRekomendasiDiskon]);
            const stock = parseNum(row[colStok]);
            const promoStock = parseNum(row[colStokPromo]);
            const purchaseLimit = parseNum(row[colBatasBeli]);

            const hasIdentifier = Boolean(productName || productCode || variationCode || variationName);
            const hasPriceOrStock = originalPrice > 0 || currentPrice > 0 || promoPrice > 0 || shopeeRecommendedPrice > 0 || stock > 0;

            if (!hasIdentifier && !hasPriceOrStock) continue;

            if (promoPrice <= 0 && shopeeRecommendedPrice > 0) {
              promoPrice = shopeeRecommendedPrice;
            } else if (promoPrice <= 0 && currentPrice > 0) {
              promoPrice = currentPrice;
            }

            const baseOriginal = originalPrice > 0 ? originalPrice : currentPrice > 0 ? currentPrice : promoPrice;
            const discountPercent =
              baseOriginal > 0 && promoPrice > 0 ? ((baseOriginal - promoPrice) / baseOriginal) * 100 : 0;

            const matchResult = matchProductForPromoRow(
              row,
              productName,
              productCode,
              variationName,
              variationCode,
              skuColumnChoice,
              customSkuMap
            );
            const matched = matchResult.product;
            const assignedSku = matchResult.assignedSku || (matched ? matched.sku : undefined);

            parsedItems.push({
              id: `fallback-row-${r}-${assignedSku || variationCode || productCode || Math.random()}`,
              productName: productName || (matched ? matched.name : assignedSku ? `Produk ${assignedSku}` : `Item Baris ${r + 1}`),
              productCode: productCode || (matched ? matched.sku : ''),
              variationName,
              variationCode,
              categoryL1: parseStr(row[colKatL1]),
              categoryL2: parseStr(row[colKatL2]),
              categoryL3: parseStr(row[colKatL3]),
              salesCount,
              originalPrice: baseOriginal,
              currentPrice: currentPrice || baseOriginal,
              promoPrice: promoPrice || baseOriginal,
              shopeeRecommendedPrice,
              stock,
              promoStock: promoStock || stock,
              purchaseLimit,
              parentSku: productCode,
              variationSku: variationCode,
              discountPercent: Math.max(0, discountPercent),
              matchedProduct: matched,
              assignedSku,
              skuMatchSource: matchResult.matchSource,
              rawRowIndex: r,
              originalRawRow: row
            });
          }
        }

        if (parsedItems.length === 0) {
          throw new Error(
            `Tidak ditemukan baris data produk yang valid pada lembar kerja "${targetSheetName}". Pastikan file berisi kolom Nama Produk / Kode SKU dan nilai harga, atau coba sesuaikan pilihan 'Baris Data'.`
          );
        }

        const matchedCount = parsedItems.filter(it => it.matchedProduct).length;
        setDetectedHeaderInfo(
          `Membaca ${parsedItems.length} baris dari sheet "${targetSheetName}". ${matchedCount} produk berhasil dicocokkan dengan SKU 5-Digit Stock List.`
        );

        setItems(parsedItems);
        setSelectedItemIds(new Set());
        showToast(`Berhasil membaca ${parsedItems.length} baris! (${matchedCount} cocok dengan Stock List 5-Digit)`);
      } catch (err: any) {
        console.error('Error reading excel:', err);
        const errMsg = err?.message || 'Gagal memproses file Excel.';
        setParseError(errMsg);
        setFileName(null);
        setItems([]);
        setUploadedRawRows(null);
        setSelectedItemIds(new Set());
        setDetectedHeaderInfo(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        showToast(errMsg.length > 70 ? errMsg.slice(0, 70) + '...' : errMsg);
      } finally {
        setIsProcessing(false);
      }
    };

    reader.onerror = () => {
      setIsProcessing(false);
      setParseError('Gagal membaca file dari disk.');
    };

    // Baca sebagai ArrayBuffer untuk kestabilan pembacaan file XLSX/XLS/CSV di browser modern
    reader.readAsArrayBuffer(file);
  };

  /**
   * Mengubah Kolom Acuan SKU Stock List:
   * Menghitung ulang kecocokan semua baris berdasarkan kolom yang dipilih
   */
  const handleSkuColumnChoiceChange = (newChoice: string) => {
    setSkuColumnChoice(newChoice);
    let matchedCount = 0;
    setItems(prev =>
      prev.map(item => {
        // Pertahankan jika user sudah menautkan secara manual
        if (item.skuMatchSource === 'manual' && item.matchedProduct) {
          matchedCount++;
          return item;
        }

        const match = matchProductForPromoRow(
          item.originalRawRow,
          item.productName,
          item.productCode,
          item.variationName,
          item.variationCode,
          newChoice,
          customSkuMap
        );

        if (match.product) matchedCount++;

        return {
          ...item,
          assignedSku: match.assignedSku,
          matchedProduct: match.product,
          skuMatchSource: match.matchSource
        };
      })
    );

    const choiceLabel =
      newChoice === 'auto'
        ? 'Pindai Otomatis 5-Digit'
        : newChoice === 'col_kode_variasi'
        ? 'Kolom 4 (Kode Variasi)'
        : newChoice === 'col_kode_produk'
        ? 'Kolom 2 (Kode Produk)'
        : newChoice === 'col_nama_produk'
        ? 'Kolom 1 (Nama Produk)'
        : newChoice === 'col_nama_variasi'
        ? 'Kolom 3 (Nama Variasi)'
        : newChoice.startsWith('custom_idx_')
        ? `Kolom ke-${parseInt(newChoice.replace('custom_idx_', ''), 10) + 1}`
        : newChoice;

    showToast(`Acuan SKU diubah ke "${choiceLabel}": ${matchedCount} produk cocok ke Stock List!`);
  };

  /**
   * Menautkan SKU Stock List secara manual ke suatu baris item
   * Opsi simpan pemetaan untuk produk sejenis di file ini & seterusnya
   */
  const handleAssignSkuToItem = (itemId: string, targetSku: string, applyToSimilar: boolean = true) => {
    const p = findProductDirect(targetSku) || productList.find(x => sanitizeSku(x.sku) === sanitizeSku(targetSku));
    if (!p) {
      showToast(`SKU ${targetSku} tidak ditemukan di Stock List.`);
      return;
    }

    let affectedCount = 0;
    const targetItem = items.find(it => it.id === itemId);
    const keyToSave = targetItem
      ? (targetItem.variationCode || targetItem.productCode || targetItem.productName).trim().toLowerCase()
      : null;

    let updatedMap = { ...customSkuMap };
    if (applyToSimilar && keyToSave) {
      updatedMap[keyToSave] = p.sku;
      setCustomSkuMap(updatedMap);
      try {
        localStorage.setItem('shopee_custom_sku_map', JSON.stringify(updatedMap));
      } catch (e) {
        console.error(e);
      }
    }

    setItems(prev =>
      prev.map(item => {
        const isTarget = item.id === itemId;
        const isSimilar =
          applyToSimilar &&
          keyToSave &&
          (item.variationCode || item.productCode || item.productName).trim().toLowerCase() === keyToSave;

        if (isTarget || isSimilar) {
          affectedCount++;
          return {
            ...item,
            assignedSku: p.sku,
            matchedProduct: p,
            skuMatchSource: 'manual' as const,
            manualHpp: undefined // Reset manual HPP agar otomatis menggunakan HPP Stock List
          };
        }
        return item;
      })
    );

    setEditingSkuItem(null);
    showToast(
      applyToSimilar && affectedCount > 1
        ? `SKU ${p.sku} (${p.name}) berhasil dihubungkan ke ${affectedCount} item sejenis!`
        : `SKU ${p.sku} (${p.name}) berhasil dihubungkan ke item!`
    );
  };

  /**
   * Parser Upload File 2: Data Produk Shopee (Mass Update / Ubah Masal)
   * Sesuai instruksi pengguna:
   * 14 Kolom:
   * 1. Kode Produk
   * 2. Nama Produk
   * 3. Kode Variasi (Jembatan pencocokan dengan xlsx 1!)
   * 4. Nama Variasi
   * 5. SKU Induk (berisi SKU 5 digit Stock List)
   * 6. SKU (berisi SKU 5 digit Stock List)
   * 7. Harga
   * 8. GTIN
   * 9. Stok
   * 10. Min. Jumlah Pembelian
   * 11. Maks. Jumlah Pembelian
   * 12. Maks. Jumlah Pembelian - Tanggal Mulai
   * 13. Maks. Jumlah Pembelian - Jumlah Hari
   * 14. Maks. Jumlah Pembelian - Tanggal Berakhir
   *
   * Ketentuan baris:
   * Baris data dimulai dari baris ke-7 (index 6)!
   */
  const handleMasterFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingMaster(true);
    setMasterParseError(null);
    setMasterFileName(file.name);

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: typeof data === 'string' ? 'binary' : 'array' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('File Excel Data Produk Shopee tidak memiliki lembar kerja.');
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
          throw new Error(`Lembar kerja "${sheetName}" tidak dapat dibaca.`);
        }

        const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (!rows || rows.length === 0) {
          throw new Error('FORMAT FILE 2 DITOLAK: File Excel Data Produk Shopee kosong atau tidak terbaca.');
        }

        // 1. Cek apakah pengguna salah mengunggah File 1 (Promosi Shopee) ke dalam File 2
        const sampleText = rows.slice(0, 12).map(r => (Array.isArray(r) ? r.join(' ') : '')).join(' ').toLowerCase();
        if (
          sampleText.includes('rekomendasi harga diskon') ||
          sampleText.includes('kategori shopee l1') ||
          sampleText.includes('kategori shopee l2')
        ) {
          throw new Error('FORMAT SALAH: File yang Anda unggah adalah File 1 (Promosi Shopee), bukan File 2 (Data Produk Shopee). Silakan unggah file ini pada kotak File 1 di sebelah kiri.');
        }

        if (sampleText.includes('eceran') && sampleText.includes('grosir') && sampleText.includes('partai') && !sampleText.includes('kode variasi')) {
          throw new Error('FORMAT SALAH: File yang diunggah adalah Stock List Toko, bukan File Data Produk Shopee. Silakan unggah file "Ubah Masal > Informasi Penjualan" dari Shopee Seller Centre.');
        }

        // Cari letak baris header jika ada (biasanya di baris ke-6 / index 5 di template Shopee Mass Update)
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(rows.length, 12); r++) {
          const rowStr = (rows[r] || []).map(c => String(c).toLowerCase()).join(' ');
          if (
            (rowStr.includes('kode variasi') || rowStr.includes('kode produk') || rowStr.includes('sku induk')) &&
            (rowStr.includes('sku') || rowStr.includes('nama produk') || rowStr.includes('harga'))
          ) {
            headerRowIdx = r;
            break;
          }
        }

        let colKodeProduk = -1;
        let colNamaProduk = -1;
        let colKodeVariasi = -1;
        let colNamaVariasi = -1;
        let colSkuInduk = -1;
        let colSku = -1;
        let colHarga = -1;
        let colGtin = -1;
        let colStok = -1;
        let colMinBeli = -1;
        let colMaksBeli = -1;
        let colTglMulai = -1;
        let colJumlahHari = -1;
        let colTglAkhir = -1;

        if (headerRowIdx !== -1) {
          const headerRow = rows[headerRowIdx] || [];
          headerRow.forEach((cellVal: any, idx: number) => {
            const h = String(cellVal).toLowerCase().trim();
            if (h === 'kode produk' || h.includes('kode produk')) colKodeProduk = idx;
            else if (h === 'nama produk' || h.includes('nama produk')) colNamaProduk = idx;
            else if (h === 'kode variasi' || h.includes('kode variasi')) colKodeVariasi = idx;
            else if (h === 'nama variasi' || h.includes('nama variasi')) colNamaVariasi = idx;
            else if (h === 'sku induk' || h.includes('sku induk') || h.includes('parent sku')) colSkuInduk = idx;
            else if (h === 'sku' || h.includes('sku variasi') || h.includes('kode sku')) colSku = idx;
            else if (h === 'harga' || h.includes('harga')) colHarga = idx;
            else if (h === 'gtin') colGtin = idx;
            else if (h === 'stok' || h.includes('stok')) colStok = idx;
            else if (h.includes('min') && h.includes('beli')) colMinBeli = idx;
            else if (h.includes('maks') && h.includes('hari')) colJumlahHari = idx;
            else if (h.includes('maks') && h.includes('mulai')) colTglMulai = idx;
            else if (h.includes('maks') && h.includes('berakhir')) colTglAkhir = idx;
            else if (h.includes('maks') && h.includes('beli')) colMaksBeli = idx;
          });
        }

        // VALIDASI KOLOM WAJIB FILE 2 (14 KOLOM DATA PRODUK SHOPEE):
        const hasMasterKodeVariasi = colKodeVariasi !== -1;
        const hasMasterSku = colSkuInduk !== -1 || colSku !== -1;
        const hasMasterInfo = colKodeProduk !== -1 || colNamaProduk !== -1;
        const hasMasterPriceOrStock = colHarga !== -1 || colStok !== -1;

        const countMasterCols = [
          colKodeProduk, colNamaProduk, colKodeVariasi, colNamaVariasi,
          colSkuInduk, colSku, colHarga, colGtin, colStok,
          colMinBeli, colMaksBeli, colTglMulai, colJumlahHari, colTglAkhir
        ].filter(c => c !== -1).length;

        if (!hasMasterKodeVariasi || !hasMasterSku || !hasMasterInfo || countMasterCols < 4) {
          const missing: string[] = [];
          if (!hasMasterKodeVariasi) missing.push('Kode Variasi');
          if (!hasMasterSku) missing.push('SKU Induk / SKU (Acuan 5-Digit)');
          if (!hasMasterInfo) missing.push('Kode Produk / Nama Produk');
          if (!hasMasterPriceOrStock) missing.push('Harga / Stok');
          throw new Error(`FORMAT FILE 2 DITOLAK SECARA OTOMATIS: Format kolom tidak sesuai dengan template 14 Kolom Data Produk Shopee! ${missing.length > 0 ? `Kolom wajib tidak ditemukan: ${missing.join(', ')}.` : ''} Pastikan mengunggah file hasil ekspor "Ubah Masal > Informasi Penjualan" dari Shopee Seller Centre (mulai baris ke-7).`);
        }

        // Sesuai instruksi: baris data mulai dari baris ke-7 (index 6)
        const startRowIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 6;

        const masterList: ShopeeProductMasterItem[] = [];
        const newMap = new Map<string, ShopeeProductMasterItem>();

        for (let r = startRowIdx; r < rows.length; r++) {
          const row = rows[r];
          if (!row || !Array.isArray(row) || row.length === 0) continue;

          const productCode = parseStr(row[colKodeProduk]);
          const productName = parseStr(row[colNamaProduk]);
          const variationCode = parseStr(row[colKodeVariasi]);
          const variationName = parseStr(row[colNamaVariasi]);
          const parentSku = parseStr(row[colSkuInduk]);
          const sku = parseStr(row[colSku]);
          const price = parseNum(row[colHarga]);
          const gtin = parseStr(row[colGtin]);
          const stock = parseNum(row[colStok]);
          const minPurchase = parseNum(row[colMinBeli]);
          const maxPurchase = parseNum(row[colMaksBeli]);
          const startDate = parseStr(row[colTglMulai]);
          const durationDays = parseStr(row[colJumlahHari]);
          const endDate = parseStr(row[colTglAkhir]);

          // Lewati baris kosong
          if (!productCode && !variationCode && !productName && !sku && !parentSku) continue;

          const item: ShopeeProductMasterItem = {
            productCode,
            productName,
            variationCode,
            variationName,
            parentSku,
            sku,
            price,
            gtin,
            stock,
            minPurchase,
            maxPurchase,
            startDate,
            durationDays,
            endDate
          };

          masterList.push(item);

          if (variationCode) {
            const cleanV = sanitizeSku(variationCode).toLowerCase().trim();
            if (cleanV) newMap.set(cleanV, item);
          }
          if (productCode) {
            const cleanP = sanitizeSku(productCode).toLowerCase().trim();
            if (cleanP && !newMap.has(cleanP)) newMap.set(cleanP, item);
          }
        }

        if (masterList.length === 0) {
          throw new Error('FORMAT FILE 2 DITOLAK: Tidak ditemukan baris data produk pada File 2. Pastikan file berisi data produk Shopee yang dimulai dari baris ke-7.');
        }

        // Simpan ke state dan localStorage
        setMasterProducts(masterList);
        try {
          localStorage.setItem('shopee_master_filename', file.name);
          localStorage.setItem('shopee_master_products_data', JSON.stringify(masterList));
        } catch (e) {
          console.error(e);
        }

        // Segera cocokkan ulang seluruh baris di File 1 (items) menggunakan newMap
        let rematchedCount = 0;
        setItems(prevItems => {
          if (prevItems.length === 0) return prevItems;
          return prevItems.map(item => {
            if (item.skuMatchSource === 'manual' && item.matchedProduct) return item;
            const match = matchProductForPromoRow(
              item.originalRawRow,
              item.productName,
              item.productCode,
              item.variationName,
              item.variationCode,
              skuColumnChoice,
              customSkuMap,
              newMap
            );
            if (match.product) rematchedCount++;
            return {
              ...item,
              assignedSku: match.assignedSku,
              matchedProduct: match.product,
              skuMatchSource: match.matchSource
            };
          });
        });

        showToast(
          `File 2 (${masterList.length} variasi) berhasil diunggah! ${
            items.length > 0
              ? `${rematchedCount} item promo otomatis terhubung ke SKU Stock List!`
              : 'Siap menghubungkan Kode Variasi ke SKU 5-Digit.'
          }`
        );
      } catch (err: any) {
        console.error('Error reading master file:', err);
        const errMsg = err?.message || 'Gagal membaca file Data Produk Shopee.';
        setMasterParseError(errMsg);
        setMasterFileName(null);
        setMasterProducts([]);
        try {
          localStorage.removeItem('shopee_master_filename');
          localStorage.removeItem('shopee_master_products_data');
        } catch (e) {
          console.error(e);
        }
        if (masterFileInputRef.current) masterFileInputRef.current.value = '';
        showToast(errMsg.length > 70 ? errMsg.slice(0, 70) + '...' : errMsg);
      } finally {
        setIsProcessingMaster(false);
      }
    };

    reader.onerror = () => {
      setIsProcessingMaster(false);
      setMasterParseError('Gagal membaca file dari disk.');
    };

    reader.readAsArrayBuffer(file);
  };

  /**
   * Menghapus File 2 (Data Produk Shopee)
   */
  const handleRemoveMasterFile = () => {
    setMasterFileName(null);
    setMasterProducts([]);
    try {
      localStorage.removeItem('shopee_master_filename');
      localStorage.removeItem('shopee_master_products_data');
    } catch (e) {
      console.error(e);
    }
    if (masterFileInputRef.current) masterFileInputRef.current.value = '';

    // Hitung ulang items tanpa masterProductMap
    const emptyMap = new Map<string, ShopeeProductMasterItem>();
    setItems(prev =>
      prev.map(item => {
        if (item.skuMatchSource === 'manual' && item.matchedProduct) return item;
        const match = matchProductForPromoRow(
          item.originalRawRow,
          item.productName,
          item.productCode,
          item.variationName,
          item.variationCode,
          skuColumnChoice,
          customSkuMap,
          emptyMap
        );
        return {
          ...item,
          assignedSku: match.assignedSku,
          matchedProduct: match.product,
          skuMatchSource: match.matchSource
        };
      })
    );
    showToast('File 2 (Data Produk Shopee) telah dihapus.');
  };

  /**
   * Muat Contoh Data Produk Shopee (XLSX 2 - 14 Kolom)
   */
  const handleLoadDemoMasterData = () => {
    setIsProcessingMaster(true);
    setMasterFileName('Data_Produk_Shopee_14Kolom_Demo.xlsx');

    setTimeout(() => {
      const demoMaster: ShopeeProductMasterItem[] = [
        {
          productCode: '245819029',
          productName: 'Buku Tulis Boxy Kiky 42 Lembar',
          variationCode: '03309', // Sama dengan Kode Variasi di File 1
          variationName: 'Pack Isi 10',
          parentSku: '03309',    // Kolom SKU Induk (berisi SKU 5 digit Stock List)
          sku: '03309',          // Kolom SKU (berisi SKU 5 digit Stock List)
          price: 7000,
          gtin: '',
          stock: 500,
          minPurchase: 1,
          maxPurchase: 10,
          startDate: '',
          durationDays: '',
          endDate: ''
        },
        {
          productCode: '109823471',
          productName: 'Pulpen Gel Faster C600 0.5mm Hitam',
          variationCode: '01015',
          variationName: 'Hitam',
          parentSku: '01015',
          sku: '01015',
          price: 4500,
          gtin: '',
          stock: 350,
          minPurchase: 1,
          maxPurchase: 20,
          startDate: '',
          durationDays: '',
          endDate: ''
        },
        {
          productCode: '839201948',
          productName: 'Kertas HVS A4 SiDU 75gsm 500 Lembar (Rim)',
          variationCode: '02044',
          variationName: 'A4 75gsm',
          parentSku: '02044',
          sku: '02044',
          price: 52000,
          gtin: '',
          stock: 120,
          minPurchase: 1,
          maxPurchase: 5,
          startDate: '',
          durationDays: '',
          endDate: ''
        },
        {
          productCode: '728190345',
          productName: 'Tipe-X Kertas Correction Tape Joyko CT-522',
          variationCode: '03112',
          variationName: 'CT-522 Biru',
          parentSku: '03112',
          sku: '03112',
          price: 6500,
          gtin: '',
          stock: 200,
          minPurchase: 1,
          maxPurchase: 10,
          startDate: '',
          durationDays: '',
          endDate: ''
        },
        {
          productCode: '592810481',
          productName: 'Lem Kertas Glukol Botol Sedang',
          variationCode: '05021',
          variationName: 'Sedang',
          parentSku: '05021',
          sku: '05021',
          price: 3500,
          gtin: '',
          stock: 150,
          minPurchase: 1,
          maxPurchase: 15,
          startDate: '',
          durationDays: '',
          endDate: ''
        }
      ];

      setMasterProducts(demoMaster);
      try {
        localStorage.setItem('shopee_master_filename', 'Data_Produk_Shopee_14Kolom_Demo.xlsx');
        localStorage.setItem('shopee_master_products_data', JSON.stringify(demoMaster));
      } catch (e) {
        console.error(e);
      }

      const newMap = new Map<string, ShopeeProductMasterItem>();
      demoMaster.forEach(m => {
        if (m.variationCode) newMap.set(sanitizeSku(m.variationCode).toLowerCase().trim(), m);
        if (m.productCode) newMap.set(sanitizeSku(m.productCode).toLowerCase().trim(), m);
      });

      setItems(prev =>
        prev.map(item => {
          const match = matchProductForPromoRow(
            item.originalRawRow,
            item.productName,
            item.productCode,
            item.variationName,
            item.variationCode,
            skuColumnChoice,
            customSkuMap,
            newMap
          );
          return {
            ...item,
            assignedSku: match.assignedSku,
            matchedProduct: match.product,
            skuMatchSource: match.matchSource
          };
        })
      );

      setIsProcessingMaster(false);
      showToast('Data Contoh File 2 (Data Produk Shopee 14 Kolom) berhasil dimuat!');
    }, 300);
  };

  /**
   * Muat Contoh Lengkap File 1 & File 2 Sekaligus
   */
  const handleLoadDemoAllData = () => {
    setIsProcessing(true);
    setIsProcessingMaster(true);
    setParseError(null);
    setMasterParseError(null);

    setFileName('Promo_Shopee_Demo_15Kolom.xlsx');
    setMasterFileName('Data_Produk_Shopee_14Kolom_Demo.xlsx');

    setTimeout(() => {
      // 1. Muat data File 2 (Master Products)
      const demoMaster: ShopeeProductMasterItem[] = [
        {
          productCode: '245819029',
          productName: 'Buku Tulis Boxy Kiky 42 Lembar',
          variationCode: '03309',
          variationName: 'Pack Isi 10',
          parentSku: '03309',
          sku: '03309',
          price: 7000,
          gtin: '',
          stock: 500,
          minPurchase: 1,
          maxPurchase: 10,
          startDate: '',
          durationDays: '',
          endDate: ''
        },
        {
          productCode: '109823471',
          productName: 'Pulpen Gel Faster C600 0.5mm Hitam',
          variationCode: '01015',
          variationName: 'Hitam',
          parentSku: '01015',
          sku: '01015',
          price: 4500,
          gtin: '',
          stock: 350,
          minPurchase: 1,
          maxPurchase: 20,
          startDate: '',
          durationDays: '',
          endDate: ''
        },
        {
          productCode: '839201948',
          productName: 'Kertas HVS A4 SiDU 75gsm 500 Lembar (Rim)',
          variationCode: '02044',
          variationName: 'A4 75gsm',
          parentSku: '02044',
          sku: '02044',
          price: 52000,
          gtin: '',
          stock: 120,
          minPurchase: 1,
          maxPurchase: 5,
          startDate: '',
          durationDays: '',
          endDate: ''
        },
        {
          productCode: '728190345',
          productName: 'Tipe-X Kertas Correction Tape Joyko CT-522',
          variationCode: '03112',
          variationName: 'CT-522 Biru',
          parentSku: '03112',
          sku: '03112',
          price: 6500,
          gtin: '',
          stock: 200,
          minPurchase: 1,
          maxPurchase: 10,
          startDate: '',
          durationDays: '',
          endDate: ''
        },
        {
          productCode: '592810481',
          productName: 'Lem Kertas Glukol Botol Sedang',
          variationCode: '05021',
          variationName: 'Sedang',
          parentSku: '05021',
          sku: '05021',
          price: 3500,
          gtin: '',
          stock: 150,
          minPurchase: 1,
          maxPurchase: 10,
          startDate: '',
          durationDays: '',
          endDate: ''
        }
      ];

      setMasterProducts(demoMaster);
      try {
        localStorage.setItem('shopee_master_filename', 'Data_Produk_Shopee_14Kolom_Demo.xlsx');
        localStorage.setItem('shopee_master_products_data', JSON.stringify(demoMaster));
      } catch (e) {
        console.error(e);
      }

      // Map untuk pencarian cepat di demo
      const newMap = new Map<string, ShopeeProductMasterItem>();
      demoMaster.forEach(m => {
        if (m.variationCode) newMap.set(sanitizeSku(m.variationCode).toLowerCase().trim(), m);
      });

      // 2. Muat data File 1 (Promo Items)
      const demoList: PromoItemRow[] = [];
      
      // Buku Tulis Boxy Kiky 42 Lembar (Rekomendasi Shopee: Rp 4.900 -> RUGI!)
      demoList.push({
        id: 'demo-1',
        productName: 'Buku Tulis Boxy Kiky 42 Lembar',
        productCode: '245819029',
        variationName: 'Pack Isi 10',
        variationCode: '03309',
        categoryL1: 'Buku & Alat Tulis',
        categoryL2: 'Alat Tulis',
        categoryL3: 'Buku Tulis',
        salesCount: 150,
        originalPrice: 7000,
        currentPrice: 7000,
        promoPrice: 6500,
        shopeeRecommendedPrice: 4900,
        stock: 500,
        promoStock: 100,
        purchaseLimit: 1,
        parentSku: '03309',
        variationSku: '03309',
        discountPercent: 7.1,
        matchedProduct: {
          name: 'Buku Tulis Boxy Kiky 42 Lembar',
          sku: '03309',
          unit: 'pack',
          hpp: 5500,
          eceran: 7000,
          grosir: 6800,
          partai: 6500
        },
        assignedSku: '03309',
        skuMatchSource: '5digit_extract'
      });

      // Pulpen Gel Faster C600 (Rekomendasi Shopee: Rp 2.900 -> RUGI!)
      demoList.push({
        id: 'demo-2',
        productName: 'Pulpen Gel Faster C600 0.5mm Hitam',
        productCode: '109823471',
        variationName: 'Hitam',
        variationCode: '01015',
        categoryL1: 'Buku & Alat Tulis',
        categoryL2: 'Alat Tulis',
        categoryL3: 'Pulpen',
        salesCount: 380,
        originalPrice: 4500,
        currentPrice: 4500,
        promoPrice: 4000,
        shopeeRecommendedPrice: 2900,
        stock: 350,
        promoStock: 50,
        purchaseLimit: 10,
        parentSku: '01015',
        variationSku: '01015',
        discountPercent: 11.1,
        matchedProduct: {
          name: 'Pulpen Gel Faster C600 0.5mm Hitam',
          sku: '01015',
          unit: 'pcs',
          hpp: 3200,
          eceran: 4500,
          grosir: 4200,
          partai: 4000
        },
        assignedSku: '01015',
        skuMatchSource: '5digit_extract'
      });

      // Kertas HVS A4 SiDU (Rekomendasi Shopee: Rp 47.500 -> AMAN)
      demoList.push({
        id: 'demo-3',
        productName: 'Kertas HVS A4 SiDU 75gsm 500 Lembar (Rim)',
        productCode: '02044',
        variationName: 'A4 75gsm',
        variationCode: '02044',
        categoryL1: 'Buku & Alat Tulis',
        categoryL2: 'Kertas',
        categoryL3: 'Kertas HVS & Print',
        salesCount: 88,
        originalPrice: 52000,
        currentPrice: 52000,
        promoPrice: 48000,
        shopeeRecommendedPrice: 47500,
        stock: 120,
        promoStock: 30,
        purchaseLimit: 2,
        parentSku: '02044',
        variationSku: '02044',
        discountPercent: 7.7,
        matchedProduct: {
          name: 'Kertas HVS A4 SiDU 75gsm 500 Lembar',
          sku: '02044',
          unit: 'rim',
          hpp: 33000,
          eceran: 52000,
          grosir: 49000,
          partai: 48000
        },
        assignedSku: '02044',
        skuMatchSource: '5digit_extract'
      });

      // Correction Tape Joyko CT-522 (Rekomendasi Shopee: Rp 5.100 -> RUGI!)
      demoList.push({
        id: 'demo-4',
        productName: 'Tipe-X Kertas Correction Tape Joyko CT-522',
        productCode: '03112',
        variationName: 'CT-522 Biru',
        variationCode: '03112',
        categoryL1: 'Buku & Alat Tulis',
        categoryL2: 'Alat Tulis',
        categoryL3: 'Koreksi & Penghapus',
        salesCount: 215,
        originalPrice: 6500,
        currentPrice: 6500,
        promoPrice: 5800,
        shopeeRecommendedPrice: 5100,
        stock: 200,
        promoStock: 40,
        purchaseLimit: 5,
        parentSku: '03112',
        variationSku: '03112',
        discountPercent: 10.8,
        matchedProduct: {
          name: 'Tipe-X Kertas Correction Tape Joyko CT-522',
          sku: '03112',
          unit: 'pcs',
          hpp: 4500,
          eceran: 6500,
          grosir: 6000,
          partai: 5800
        },
        assignedSku: '03112',
        skuMatchSource: '5digit_extract'
      });

      // Lem Kertas Glukol Botol Sedang (Belum ada HPP)
      demoList.push({
        id: 'demo-5',
        productName: 'Lem Kertas Glukol Botol Sedang',
        productCode: '05021',
        variationName: 'Sedang',
        variationCode: '05021',
        categoryL1: 'Buku & Alat Tulis',
        categoryL2: 'Perlengkapan Sekolah & Kantor',
        categoryL3: 'Perekat & Lem',
        salesCount: 95,
        originalPrice: 3500,
        currentPrice: 3500,
        promoPrice: 3100,
        shopeeRecommendedPrice: 3000,
        stock: 150,
        promoStock: 25,
        purchaseLimit: 5,
        parentSku: '05021',
        variationSku: '05021',
        discountPercent: 11.4,
        matchedProduct: undefined,
        assignedSku: undefined,
        skuMatchSource: 'none'
      });

      // Hubungkan items ke master products map secara internal
      const updatedDemoList = demoList.map(item => {
        const match = matchProductForPromoRow(
          item.originalRawRow || [],
          item.productName,
          item.productCode,
          item.variationName,
          item.variationCode,
          skuColumnChoice,
          customSkuMap,
          newMap
        );
        return {
          ...item,
          assignedSku: match.assignedSku || item.assignedSku,
          matchedProduct: match.product || item.matchedProduct,
          skuMatchSource: match.matchSource || item.skuMatchSource
        };
      });

      setItems(updatedDemoList);
      setSelectedItemIds(new Set());
      setDetectedHeaderInfo(`Membaca 5 baris dari sheet "template_demo". 4 produk cocok dengan Stock List.`);
      setIsProcessing(false);
      setIsProcessingMaster(false);
      showToast('Berhasil memuat data contoh lengkap untuk File 1 & File 2 sekaligus! Analisa otomatis aktif.');
    }, 400);
  };

  /**
   * Unduh Template Resmi Data Produk Shopee (XLSX 2 - 14 Kolom, Mulai Baris 7)
   */
  const handleDownloadMasterTemplate = () => {
    const templateRows: any[][] = [
      ['MASS UPDATE - DATA PRODUK SHOPEE (INFORMASI PENJUALAN & DASAR)'],
      ['Petunjuk: Kolom "SKU Induk" dan "SKU" berisi kode SKU 5 digit (misal: 03309) yang cocok dengan STOCK LIST toko Anda.'],
      ['Jembatan: Kode Variasi dari File 1 Promosi akan dicocokkan dengan Kode Variasi di file ini untuk mengambil SKU 5 digit.'],
      ['Baris data produk resmi dimulai dari baris ke-7 sesuai template Seller Centre Shopee.'],
      ['14 KOLOM STANDAR SHOPEE:'],
      [
        'Kode Produk',
        'Nama Produk',
        'Kode Variasi',
        'Nama Variasi',
        'SKU Induk',
        'SKU',
        'Harga',
        'GTIN',
        'Stok',
        'Min. Jumlah Pembelian',
        'Maks. Jumlah Pembelian',
        'Maks. Jumlah Pembelian - Tanggal Mulai',
        'Maks. Jumlah Pembelian - Jumlah Hari',
        'Maks. Jumlah Pembelian - Tanggal Berakhir'
      ],
      // Baris ke-7 (Data Pertama):
      [
        '245819029',
        'Buku Tulis Boxy Kiky 42 Lembar',
        '03309',
        'Pack Isi 10',
        '03309',
        '03309',
        7000,
        '',
        500,
        1,
        10,
        '',
        '',
        ''
      ],
      // Baris ke-8:
      [
        '109823471',
        'Pulpen Gel Faster C600 0.5mm Hitam',
        '01015',
        'Hitam',
        '01015',
        '01015',
        4500,
        '',
        350,
        1,
        20,
        '',
        '',
        ''
      ],
      // Baris ke-9:
      [
        '839201948',
        'Kertas HVS A4 SiDU 75gsm 500 Lembar (Rim)',
        '02044',
        'A4 75gsm',
        '02044',
        '02044',
        52000,
        '',
        120,
        1,
        5,
        '',
        '',
        ''
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Produk_Shopee');
    XLSX.writeFile(wb, 'Template_Data_Produk_Shopee_14Kolom_MulaiBaris7.xlsx');
    showToast('Template Data Produk Shopee (14 Kolom, Mulai Baris 7) berhasil diunduh!');
  };

  /**
   * Muat Contoh Data Promosi Shopee 15 Kolom dengan Analisa Rekomendasi Diskon
   * Menampilkan SKU 03309 (Buku Tulis Boxy 42 Lembar) dan SKU lainnya,
   * memperlihatkan secara gamblang bagaimana Rekomendasi Shopee bisa bikin rugi
   * jika langsung disetujui tanpa dicek!
   */
  const handleLoadDemoData = () => {
    setIsProcessing(true);
    setFileName('File_Ekspor_Promosi_Shopee_15Kolom.xlsx');
    setDetectedHeaderInfo('Demo Analisa Rekomendasi Diskon: Header di baris ke-3, data mulai baris ke-4.');

    setTimeout(() => {
      const demoList: PromoItemRow[] = [];

      // 1. SKU 03309: Buku Tulis Boxy Kiky 42 Lbr (Contoh spesifik user)
      // Harga normal 7.000, HPP 5.500. Shopee merekomendasikan diskon ke 5.800 (BONCOS/RUGI jika dipotong fee Star+ & tetap!)
      const sku03309 = productList.find(p => sanitizeSku(p.sku).includes('03309')) || {
        name: 'Buku Tulis Boxy Kiky 42 Lembar',
        sku: '03309',
        unit: 'pcs',
        hpp: 5500,
        eceran: 7500,
        grosir: 7000,
        partai: 6800
      };

      demoList.push({
        id: 'demo-1',
        productName: sku03309.name || 'Buku Tulis Boxy Kiky 42 Lembar',
        productCode: '03309',
        variationName: 'Pack Isi 10',
        variationCode: '03309',
        categoryL1: 'Buku & Alat Tulis',
        categoryL2: 'Perlengkapan Sekolah & Kantor',
        categoryL3: 'Buku Tulis & Agenda',
        salesCount: 142,
        originalPrice: 7000,
        currentPrice: 7000,
        promoPrice: 6350,
        shopeeRecommendedPrice: 5800, // REKOMENDASI SHOPEE INI RUGI BERSIH! (PERINGATAN MERAH)
        stock: 500,
        promoStock: 100,
        purchaseLimit: 5,
        parentSku: '03309',
        variationSku: '03309',
        discountPercent: 9.3,
        matchedProduct: sku03309,
        assignedSku: '03309',
        skuMatchSource: '5digit_extract'
      });

      // 2. Pulpen Gel Faster C600 0.5mm Hitam (Rekomendasi Shopee: Rp 2.900 -> RUGI BESAR)
      demoList.push({
        id: 'demo-2',
        productName: 'Pulpen Gel Faster C600 0.5mm Hitam',
        productCode: '01015',
        variationName: 'Hitam',
        variationCode: '01015',
        categoryL1: 'Buku & Alat Tulis',
        categoryL2: 'Alat Tulis',
        categoryL3: 'Pulpen & Tinta',
        salesCount: 380,
        originalPrice: 4500,
        currentPrice: 4500,
        promoPrice: 4000,
        shopeeRecommendedPrice: 2900, // Rekomendasi diskon sangat agresif dari Shopee -> RUGI PARAH!
        stock: 350,
        promoStock: 50,
        purchaseLimit: 10,
        parentSku: '01015',
        variationSku: '01015',
        discountPercent: 11.1,
        matchedProduct: {
          name: 'Pulpen Gel Faster C600 0.5mm Hitam',
          sku: '01015',
          unit: 'pcs',
          hpp: 3200,
          eceran: 4500,
          grosir: 4200,
          partai: 4000
        },
        assignedSku: '01015',
        skuMatchSource: '5digit_extract'
      });

      // 3. Kertas HVS A4 SiDU 75gsm 500 Lembar (Rim) (Rekomendasi Shopee: Rp 47.500 -> AMAN)
      demoList.push({
        id: 'demo-3',
        productName: 'Kertas HVS A4 SiDU 75gsm 500 Lembar (Rim)',
        productCode: '02044',
        variationName: 'A4 75gsm',
        variationCode: '02044',
        categoryL1: 'Buku & Alat Tulis',
        categoryL2: 'Kertas',
        categoryL3: 'Kertas HVS & Print',
        salesCount: 88,
        originalPrice: 52000,
        currentPrice: 52000,
        promoPrice: 48000,
        shopeeRecommendedPrice: 47500, // Rekomendasi Shopee masih menghasilkan margin aman > 15%!
        stock: 120,
        promoStock: 30,
        purchaseLimit: 2,
        parentSku: '02044',
        variationSku: '02044',
        discountPercent: 7.7,
        matchedProduct: {
          name: 'Kertas HVS A4 SiDU 75gsm 500 Lembar',
          sku: '02044',
          unit: 'rim',
          hpp: 33000,
          eceran: 52000,
          grosir: 49000,
          partai: 48000
        },
        assignedSku: '02044',
        skuMatchSource: '5digit_extract'
      });

      // 4. Correction Tape Joyko CT-522 (Rekomendasi Shopee: Rp 5.100 -> Di bawah batas margin 15%)
      demoList.push({
        id: 'demo-4',
        productName: 'Tipe-X Kertas Correction Tape Joyko CT-522',
        productCode: '03112',
        variationName: 'CT-522 Biru',
        variationCode: '03112',
        categoryL1: 'Buku & Alat Tulis',
        categoryL2: 'Alat Tulis',
        categoryL3: 'Koreksi & Penghapus',
        salesCount: 215,
        originalPrice: 6500,
        currentPrice: 6500,
        promoPrice: 5800,
        shopeeRecommendedPrice: 5100, // Margin tipis di bawah target 15% -> MERAH
        stock: 200,
        promoStock: 40,
        purchaseLimit: 5,
        parentSku: '03112',
        variationSku: '03112',
        discountPercent: 10.8,
        matchedProduct: {
          name: 'Tipe-X Kertas Correction Tape Joyko CT-522',
          sku: '03112',
          unit: 'pcs',
          hpp: 4500,
          eceran: 6500,
          grosir: 6000,
          partai: 5800
        },
        assignedSku: '03112',
        skuMatchSource: '5digit_extract'
      });

      // 5. Lem Kertas Glukol Botol Sedang (Belum ada HPP)
      demoList.push({
        id: 'demo-5',
        productName: 'Lem Kertas Glukol Botol Sedang',
        productCode: '05021',
        variationName: 'Sedang',
        variationCode: '05021',
        categoryL1: 'Buku & Alat Tulis',
        categoryL2: 'Perlengkapan Sekolah & Kantor',
        categoryL3: 'Perekat & Selotip',
        salesCount: 64,
        originalPrice: 3500,
        currentPrice: 3500,
        promoPrice: 3100,
        shopeeRecommendedPrice: 2800,
        stock: 150,
        promoStock: 25,
        purchaseLimit: 10,
        parentSku: '05021',
        variationSku: '05021',
        discountPercent: 11.4,
        assignedSku: '05021',
        skuMatchSource: '5digit_extract'
      });

      // Bangun demoRawRows dengan susunan baris dan kolom sama persis dengan format promosi Shopee (mulai baris ke-4)
      const demoRawRows: any[][] = [
        ['Tips: 1. Kolom dengan tanda * wajib diisi. 2. Jangan mengubah urutan atau nama kolom template. 3. Format resmi siap upload ke Shopee Seller Centre (Promosi Diskon Toko).'],
        ['Petunjuk: Baris data resmi promosi Shopee dimulai dari baris ke-4. Masukkan Harga Diskon pada Kolom K (Kolom ke-11).'],
        [
          'Nama Produk',
          'Kode Produk',
          'Nama Variasi',
          'Kode Variasi',
          'Kategori Shopee L1',
          'Kategori Shopee L2',
          'Kategori Shopee L3',
          'Penjualan',
          'Harga Awal',
          'Harga Saat Ini',
          'Harga Diskon',
          'Rekomendasi Harga Diskon',
          'Stok',
          'Stok Promo',
          'Batas Pembelian'
        ]
      ];

      demoList.forEach((it, idx) => {
        it.rawRowIndex = 3 + idx;
        demoRawRows.push([
          it.productName,
          it.productCode,
          it.variationName || '',
          it.variationCode || '',
          it.categoryL1 || '',
          it.categoryL2 || '',
          it.categoryL3 || '',
          it.salesCount || 0,
          it.originalPrice || 0,
          it.currentPrice || 0,
          it.promoPrice || 0,
          it.shopeeRecommendedPrice || 0,
          it.stock || 0,
          it.promoStock || 0,
          it.purchaseLimit || 0
        ]);
      });

      setUploadedRawRows(demoRawRows);
      setUploadedSheetName('template');
      setUploadedColHargaDiskon(10);

      setItems(demoList);
      setSelectedItemIds(new Set());
      setIsProcessing(false);
      showToast('Data contoh promosi Shopee 15 kolom berhasil dimuat!');
    }, 350);
  };

  /**
   * Unduh File Template Shopee Persis 15 Kolom Siap Upload
   * Baris 1: Tips resmi Shopee
   * Baris 2: Petunjuk baris data mulai dari baris ke-4
   * Baris 3: 15 Header Kolom Shopee
   * Baris 4 dst: Data produk
   * Nama Sheet: 'template' (Format resmi Shopee Seller Centre)
   */
  const handleDownloadTemplate = () => {
    const templateData: any[][] = [
      ['Tips: 1. Kolom dengan tanda * wajib diisi. 2. Jangan mengubah urutan atau nama kolom template. 3. Format resmi siap upload ke Shopee Seller Centre (Promosi Diskon Toko).'],
      ['Petunjuk: Baris data resmi promosi Shopee dimulai dari baris ke-4. Masukkan Harga Diskon pada Kolom K (Kolom ke-11).'],
      [
        'Nama Produk',
        'Kode Produk',
        'Nama Variasi',
        'Kode Variasi',
        'Kategori Shopee L1',
        'Kategori Shopee L2',
        'Kategori Shopee L3',
        'Penjualan',
        'Harga Awal',
        'Harga Saat Ini',
        'Harga Diskon',
        'Rekomendasi Harga Diskon',
        'Stok',
        'Stok Promo',
        'Batas Pembelian'
      ],
      // Baris ke-4 (Data Pertama):
      [
        'Buku Tulis Boxy Kiky 42 Lembar',
        '03309',
        'Pack Isi 10',
        '03309',
        'Buku & Alat Tulis',
        'Perlengkapan Sekolah & Kantor',
        'Buku Tulis & Agenda',
        142,
        7000,
        7000,
        6350,
        5800,
        500,
        100,
        5
      ],
      // Baris ke-5:
      [
        'Pulpen Gel Faster C600 0.5mm Hitam',
        '01015',
        'Hitam',
        '01015',
        'Buku & Alat Tulis',
        'Alat Tulis',
        'Pulpen & Tinta',
        380,
        4500,
        4500,
        3900,
        2900,
        350,
        50,
        10
      ],
      // Baris ke-6:
      [
        'Kertas HVS A4 SiDU 75gsm 500 Lembar (Rim)',
        '02044',
        'A4 75gsm',
        '02044',
        'Buku & Alat Tulis',
        'Kertas',
        'Kertas HVS & Print',
        88,
        52000,
        52000,
        48000,
        47500,
        120,
        30,
        2
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    // Gunakan nama sheet 'template' sesuai standar resmi Shopee Seller Centre
    XLSX.utils.book_append_sheet(wb, ws, 'template');
    XLSX.writeFile(wb, 'Template_Siap_Upload_Shopee_15Kolom_MulaiBaris4.xlsx');
    showToast('Template 15 Kolom siap upload Shopee (baris data mulai baris ke-4) berhasil diunduh!');
  };

  /**
   * Unduh Template Siap Upload Shopee Berisi Data Aktif dari Stock List Toko
   * Mengisi otomatis seluruh SKU, Nama Produk, Harga Awal, Stok dari Stock List
   * dengan format 15 kolom Shopee dan baris data mulai dari baris ke-4.
   */
  const handleDownloadTemplateFromStockList = () => {
    if (!productList || productList.length === 0) {
      alert('Stock List toko masih kosong. Tambahkan produk ke Stock List terlebih dahulu.');
      return;
    }

    const templateRows: any[][] = [
      ['Tips: 1. Kolom dengan tanda * wajib diisi. 2. Jangan mengubah urutan atau nama kolom template. 3. Format resmi siap upload ke Shopee Seller Centre.'],
      ['Petunjuk: Baris data resmi promosi Shopee dimulai dari baris ke-4. Seluruh produk diambil langsung dari Stock List toko Anda.'],
      [
        'Nama Produk',
        'Kode Produk',
        'Nama Variasi',
        'Kode Variasi',
        'Kategori Shopee L1',
        'Kategori Shopee L2',
        'Kategori Shopee L3',
        'Penjualan',
        'Harga Awal',
        'Harga Saat Ini',
        'Harga Diskon',
        'Rekomendasi Harga Diskon',
        'Stok',
        'Stok Promo',
        'Batas Pembelian'
      ]
    ];

    productList.forEach(p => {
      const hargaAwal = p.eceran || (p.hpp ? Math.round(p.hpp * 1.35) : 10000);
      const hargaSaatIni = hargaAwal;
      const hargaDiskon = p.grosir || p.eceran || (p.hpp ? Math.round(p.hpp * 1.2) : 9000);
      const rekomendasiShopee = p.grosir || (p.hpp ? Math.round(p.hpp * 1.15) : 8500);

      templateRows.push([
        p.name || `Produk SKU ${p.sku}`,
        p.sku,
        p.unit ? `Satuan ${p.unit}` : 'Standar',
        p.sku,
        'Buku & Alat Tulis',
        'Perlengkapan Kantor & Sekolah',
        'Alat Tulis',
        0,
        hargaAwal,
        hargaSaatIni,
        hargaDiskon,
        rekomendasiShopee,
        p.stock || 100,
        Math.min(p.stock || 50, 50),
        0
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'template');
    const outName = `Template_Shopee_Siap_Upload_Dari_StockList_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Berhasil mengunduh template siap upload Shopee berisi ${productList.length} produk dari Stock List (baris data mulai baris ke-4)!`);
  };

  const canAnalyze = items.length > 0 && masterProducts.length > 0;

  // Eksekusi Analisa Lengkap pada seluruh item HANYA jika File 1 dan File 2 SUDAH diunggah keduanya!
  const analyzedItems = useMemo(() => {
    if (!canAnalyze) return [];
    return items.map(item => {
      const analysis = calculateItemAnalysis(item);
      return {
        ...item,
        analysis
      };
    });
  }, [canAnalyze, items, totalPercentageRate, totalFixedFeesPerOrder, marginThreshold, hppReference, productList, analyzedTarget]);

  // Ringkasan Statistik KPI
  const stats = useMemo(() => {
    const total = analyzedItems.length;
    let dangerCount = 0;
    let safeCount = 0;
    let missingHppCount = 0;
    let matchedSkuCount = 0;
    let unmatchedSkuCount = 0;
    let totalPotentialLoss = 0;
    let totalDeficit = 0;
    let specialSkuCount = 0;
    let specialDangerCount = 0;
    let specialSafeCount = 0;
    let specialMissingHppCount = 0;
    let specialPotentialLoss = 0;

    analyzedItems.forEach(item => {
      // Hitung SKU Khusus (Bundle / Pack)
      if (item.analysis.isSpecialSku) {
        specialSkuCount++;
        if (item.analysis.status === 'danger') {
          specialDangerCount++;
          if (item.analysis.netProfit < 0) {
            specialPotentialLoss += Math.abs(item.analysis.netProfit);
          }
        } else if (item.analysis.status === 'safe') {
          specialSafeCount++;
        } else {
          specialMissingHppCount++;
        }
        return; // Lewati agar tidak tercampur di statistik standar
      }

      if (item.matchedProduct) {
        matchedSkuCount++;
      } else {
        unmatchedSkuCount++;
      }

      if (item.analysis.status === 'danger') {
        dangerCount++;
        if (item.analysis.netProfit < 0) {
          totalPotentialLoss += Math.abs(item.analysis.netProfit);
        }
        totalDeficit += item.analysis.deficitPrice;
      } else if (item.analysis.status === 'safe') {
        safeCount++;
      } else {
        missingHppCount++;
      }
    });

    return {
      total: total - specialSkuCount, // Jumlah standar saja (tanpa SKU Khusus)
      dangerCount,
      safeCount,
      missingHppCount,
      matchedSkuCount,
      unmatchedSkuCount,
      totalPotentialLoss,
      totalDeficit,
      specialSkuCount,
      specialDangerCount,
      specialSafeCount,
      specialMissingHppCount,
      specialPotentialLoss
    };
  }, [analyzedItems]);

  // Muat kedua file contoh sekaligus untuk pengujian instan
  const handleLoadBothDemoFiles = () => {
    handleLoadDemoData();
    handleLoadDemoMasterData();
    showToast('Memuat data contoh File 1 (Promosi) dan File 2 (Data Produk)...');
  };

  // Filter & Search Items
  const filteredItems = useMemo(() => {
    return analyzedItems.filter(item => {
      const isSpecial = item.analysis.isSpecialSku;

      if (statusFilter === 'specialSku') {
        if (!isSpecial) return false;
      } else {
        // Untuk tab standar lain, sembunyikan SKU Khusus sepenuhnya
        if (isSpecial) return false;

        if (statusFilter === 'danger' && item.analysis.status !== 'danger') return false;
        if (statusFilter === 'safe' && item.analysis.status !== 'safe') return false;
        if (statusFilter === 'missingHpp' && item.analysis.status !== 'missingHpp') return false;
        if (statusFilter === 'unmatchedSku' && item.matchedProduct) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const sku = (item.assignedSku || item.variationCode || item.productCode || item.variationSku || '').toLowerCase();
        const name = (item.productName || '').toLowerCase();
        const matchedName = (item.matchedProduct?.name || '').toLowerCase();
        const cat = (item.categoryL3 || item.categoryL2 || '').toLowerCase();
        return sku.includes(q) || name.includes(q) || matchedName.includes(q) || cat.includes(q);
      }

      return true;
    });
  }, [analyzedItems, statusFilter, searchQuery]);

  /**
   * Aksi: Amankan Harga 1 Item ke kolom "Harga Diskon"
   * Mengganti kolom "Harga Diskon" dengan Harga Aman Minimal agar penjual
   * tidak rugi seperti harga pada kolom Rekomendasi Shopee!
   */
  const handleApplySafePriceToPromo = (itemId: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          const analysis = calculateItemAnalysis(item);
          if (analysis.minSafePromoPrice > 0) {
            return {
              ...item,
              promoPrice: analysis.minSafePromoPrice,
              discountPercent:
                item.originalPrice > 0
                  ? Math.max(0, ((item.originalPrice - analysis.minSafePromoPrice) / item.originalPrice) * 100)
                  : item.discountPercent
            };
          }
        }
        return item;
      })
    );
    showToast('Harga diskon promo berhasil diamankan ke batas aman!');
  };

  /**
   * Aksi Massal: Amankan Semua Rekomendasi Shopee yang Rugi
   * Menaikkan kolom "Harga Diskon" ke Harga Aman Minimal untuk semua SKU yang merah
   */
  const handleFixAllDangerousItems = () => {
    let count = 0;
    setItems(prev =>
      prev.map(item => {
        const analysis = calculateItemAnalysis(item);
        if (analysis.status === 'danger' && analysis.minSafePromoPrice > 0) {
          count++;
          return {
            ...item,
            promoPrice: analysis.minSafePromoPrice,
            discountPercent:
              item.originalPrice > 0
                ? Math.max(0, ((item.originalPrice - analysis.minSafePromoPrice) / item.originalPrice) * 100)
                : item.discountPercent
          };
        }
        return item;
      })
    );
    showToast(`Otomatis mengamankan ${count} SKU yang berpotensi rugi ke kolom Harga Diskon!`);
  };

  // Ubah HPP Manual pada baris tabel
  const handleUpdateManualHpp = (itemId: string, newHpp: number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          return { ...item, manualHpp: newHpp };
        }
        return item;
      })
    );
  };

  // Ubah Harga Diskon Manual pada baris tabel
  const handleUpdatePromoPrice = (itemId: string, newPrice: number) => {
    setItems(prev =>
      prev.map(item => {
        if (item.id === itemId) {
          const orig = item.originalPrice || newPrice;
          const disc = orig > 0 ? ((orig - newPrice) / orig) * 100 : 0;
          return {
            ...item,
            promoPrice: newPrice,
            discountPercent: Math.max(0, disc)
          };
        }
        return item;
      })
    );
  };

  // --- KONTROL SELEKSI PRODUK ---
  const toggleSelectItem = (itemId: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedItemIds(prev => {
      const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(item => prev.has(item.id));
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredItems.forEach(item => next.delete(item.id));
      } else {
        filteredItems.forEach(item => next.add(item.id));
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedItemIds(new Set());
  };

  const handleFixSelectedDangerousItems = () => {
    let count = 0;
    setItems(prev =>
      prev.map(item => {
        if (selectedItemIds.has(item.id)) {
          const analysis = calculateItemAnalysis(item);
          if (analysis.minSafePromoPrice > 0) {
            count++;
            return {
              ...item,
              promoPrice: analysis.minSafePromoPrice,
              discountPercent:
                item.originalPrice > 0
                  ? Math.max(0, ((item.originalPrice - analysis.minSafePromoPrice) / item.originalPrice) * 100)
                  : item.discountPercent
            };
          }
        }
        return item;
      })
    );
    showToast(`Otomatis mengamankan ${count} SKU terpilih ke kolom Harga Diskon!`);
  };

  /**
   * Export File Format Shopee Siap Upload (Format Kolom & Baris Sama Persis dengan File Promosi Shopee)
   * Mendukung unduh berdasarkan:
   * 1. 'selected': Hanya produk yang dicentang user
   * 2. 'filtered': Hanya produk yang sesuai hasil filter / pencarian (misal 12 produk)
   * 3. 'all': Seluruh produk
   *
   * Menjaga 100% susunan baris dan kolom file promosi Shopee:
   * - Baris 1-3 (header, panduan, tips) diambil dari baris asli file Shopee
   * - Baris 4 dst HANYA berisi baris produk yang difilter/dipilih (bukan seluruh file)
   * - Nilai pada kolom 'Harga Diskon' diperbarui dengan harga revisi aman
   */
  const handleExportShopeeReadyUpload = (scopeParam?: 'selected' | 'filtered' | 'all') => {
    if (analyzedItems.length === 0) {
      alert('Belum ada data untuk diekspor. Unggah file promosi atau muat data contoh terlebih dahulu.');
      return;
    }

    // Default scope: Jika ada yang dicentang gunakan 'selected', jika tidak gunakan 'filtered'
    let scope = scopeParam;
    if (!scope) {
      if (selectedItemIds.size > 0) {
        scope = 'selected';
      } else if (filteredItems.length < analyzedItems.length) {
        scope = 'filtered';
      } else {
        scope = 'filtered';
      }
    }

    let targetItems: PromoItemRow[] = [];
    if (scope === 'selected') {
      targetItems = analyzedItems.filter(item => selectedItemIds.has(item.id));
      if (targetItems.length === 0) {
        alert('Belum ada produk yang dipilih. Silakan centang kotak pada baris tabel yang ingin diunduh.');
        return;
      }
    } else if (scope === 'filtered') {
      targetItems = filteredItems;
      if (targetItems.length === 0) {
        alert('Tidak ada produk yang sesuai dengan filter atau pencarian saat ini.');
        return;
      }
    } else {
      targetItems = analyzedItems;
    }

    let finalRows: any[][] = [];
    const targetColIdx = uploadedColHargaDiskon >= 0 ? uploadedColHargaDiskon : 10;

    if (uploadedRawRows && uploadedRawRows.length > 0) {
      // 1. CARI BARIS DATA PERTAMA ASLI DARI FILE PROMOSI SHOPEE
      // Untuk menjaga baris 1-3 (tips, petunjuk, header kolom resmi)
      let firstDataRowIdx = 3;
      for (const item of analyzedItems) {
        if (item.rawRowIndex !== undefined && item.rawRowIndex >= 0) {
          firstDataRowIdx = Math.min(firstDataRowIdx, item.rawRowIndex);
        }
      }
      if (firstDataRowIdx <= 0 || firstDataRowIdx > 15) {
        firstDataRowIdx = 3;
      }

      // Salin semua baris sebelum baris data pertama (misal Baris 1-3 Shopee)
      for (let r = 0; r < firstDataRowIdx && r < uploadedRawRows.length; r++) {
        finalRows.push(Array.isArray(uploadedRawRows[r]) ? [...uploadedRawRows[r]] : []);
      }

      // Map untuk fallback jika index baris tidak ada
      const variationMap = new Map<string, any[]>();
      for (let r = firstDataRowIdx; r < uploadedRawRows.length; r++) {
        const row = uploadedRawRows[r];
        if (Array.isArray(row)) {
          const varCode = String(row[3] ?? '').trim().toLowerCase();
          const prodCode = String(row[1] ?? '').trim().toLowerCase();
          if (varCode) variationMap.set(varCode, row);
          if (prodCode && !variationMap.has(prodCode)) variationMap.set(prodCode, row);
        }
      }

      // 2. MASUKKAN HANYA BARIS-BARIS PRODUK TARGET (DIFILTER ATAU DIPILIH)
      targetItems.forEach(item => {
        let sourceRow: any[] | null = null;
        if (item.rawRowIndex !== undefined && uploadedRawRows[item.rawRowIndex]) {
          sourceRow = [...uploadedRawRows[item.rawRowIndex]];
        } else if (item.originalRawRow && Array.isArray(item.originalRawRow)) {
          sourceRow = [...item.originalRawRow];
        } else {
          const vKey = (item.variationCode || '').trim().toLowerCase();
          const pKey = (item.productCode || '').trim().toLowerCase();
          const found = (vKey ? variationMap.get(vKey) : null) || (pKey ? variationMap.get(pKey) : null);
          if (found) {
            sourceRow = [...found];
          } else {
            sourceRow = [
              item.productName,
              item.productCode,
              item.variationName || '',
              item.variationCode || '',
              item.categoryL1 || '',
              item.categoryL2 || '',
              item.categoryL3 || '',
              item.salesCount || 0,
              item.originalPrice || 0,
              item.currentPrice || 0,
              item.promoPrice || 0,
              item.shopeeRecommendedPrice || 0,
              item.stock || 0,
              item.promoStock || 0,
              item.purchaseLimit || 0
            ];
          }
        }

        while (sourceRow.length <= targetColIdx) {
          sourceRow.push('');
        }
        // Perbarui kolom 'Harga Diskon' dengan harga revisi aman
        sourceRow[targetColIdx] = item.promoPrice;

        finalRows.push(sourceRow);
      });
    } else {
      // 2. JIKA BELUM ADA FILE UPLOAD MENTAH: GUNAKAN FORMAT RESMI 15 KOLOM SHOPEE
      finalRows.push(['Tips: 1. Kolom dengan tanda * wajib diisi. 2. Jangan mengubah urutan atau nama kolom template. 3. Format resmi siap upload ke Shopee Seller Centre (Promosi Diskon Toko).']);
      finalRows.push(['Petunjuk: Baris data resmi promosi Shopee dimulai dari baris ke-4. Masukkan Harga Diskon pada Kolom K (Kolom ke-11).']);
      finalRows.push([
        'Nama Produk',
        'Kode Produk',
        'Nama Variasi',
        'Kode Variasi',
        'Kategori Shopee L1',
        'Kategori Shopee L2',
        'Kategori Shopee L3',
        'Penjualan',
        'Harga Awal',
        'Harga Saat Ini',
        'Harga Diskon',
        'Rekomendasi Harga Diskon',
        'Stok',
        'Stok Promo',
        'Batas Pembelian'
      ]);

      targetItems.forEach(item => {
        finalRows.push([
          item.productName,
          item.productCode,
          item.variationName || '',
          item.variationCode || '',
          item.categoryL1 || '',
          item.categoryL2 || '',
          item.categoryL3 || '',
          item.salesCount || 0,
          item.originalPrice || 0,
          item.currentPrice || 0,
          item.promoPrice || 0,
          item.shopeeRecommendedPrice || 0,
          item.stock || 0,
          item.promoStock || 0,
          item.purchaseLimit || 0
        ]);
      });
    }

    const ws = XLSX.utils.aoa_to_sheet(finalRows);
    const wb = XLSX.utils.book_new();
    const sheetName = uploadedSheetName || 'template';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'Shopee_Promo_Revisi';
    const scopeTag = scope === 'selected' ? `Terpilih_${targetItems.length}Produk` : scope === 'filtered' ? `Filter_${targetItems.length}Produk` : `Semua_${targetItems.length}Produk`;
    const outName = `${baseName}_${scopeTag}_Format_Persis_Shopee_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Berhasil mengunduh ${targetItems.length} produk (${outName})! Format kolom dan baris sama persis dengan file promosi Shopee (baris data mulai baris ke-4).`);
  };

  /**
   * Export Laporan Analisa Lengkap ke XLSX
   */
  const handleExportFullAnalysisXLSX = (scopeParam?: 'selected' | 'filtered' | 'all') => {
    if (analyzedItems.length === 0) {
      alert('Belum ada data untuk diekspor.');
      return;
    }

    let scope = scopeParam;
    if (!scope) {
      if (selectedItemIds.size > 0) {
        scope = 'selected';
      } else if (filteredItems.length < analyzedItems.length) {
        scope = 'filtered';
      } else {
        scope = 'filtered';
      }
    }

    let targetItems: typeof analyzedItems = [];
    if (scope === 'selected') {
      targetItems = analyzedItems.filter(item => selectedItemIds.has(item.id));
      if (targetItems.length === 0) {
        alert('Belum ada produk yang dipilih.');
        return;
      }
    } else if (scope === 'filtered') {
      targetItems = filteredItems;
      if (targetItems.length === 0) {
        alert('Tidak ada produk yang sesuai dengan filter saat ini.');
        return;
      }
    } else {
      targetItems = analyzedItems;
    }

    const exportRows: any[] = [];
    exportRows.push([
      'Status Kelayakan (Merah/Aman)',
      'Keterangan Analisa',
      'Kode Variasi (SKU)',
      'Kode Produk',
      'Nama Produk',
      'Nama Variasi',
      'HPP Modal (Rp)',
      'Harga Eceran (Rp)',
      'Harga Grosir (Rp)',
      'Harga Partai (Rp)',
      'Harga Awal (Rp)',
      'Rekomendasi Harga Diskon Shopee (Rp)',
      'Harga Diskon Revisi (Rp)',
      'Total Potongan Marketplace %',
      'Total Potongan Marketplace (Rp)',
      'Pencairan Bersih / Net Payout (Rp)',
      'Laba Bersih Rekomendasi Shopee (Rp)',
      'Margin Bersih Rekomendasi Shopee (%)',
      'Batas Target Margin Minimal (%)',
      'Rekomendasi Harga Diskon Aman (Rp)',
      'Defisit / Potensi Kerugian (Rp)',
      'Penjualan',
      'Stok Promo'
    ]);

    targetItems.forEach(item => {
      const a = item.analysis;
      const statusText =
        a.status === 'danger'
          ? '🔴 DI BAWAH BATAS MARGIN / RUGI'
          : a.status === 'safe'
          ? '🟢 AMAN (SESUAI MARGIN)'
          : '⚪ HPP TIDAK DITEMUKAN';

      exportRows.push([
        statusText,
        a.statusMessage,
        item.variationCode || item.productCode,
        item.productCode,
        item.productName,
        item.variationName || '-',
        a.hpp,
        item.matchedProduct?.eceran || '-',
        item.matchedProduct?.grosir || '-',
        item.matchedProduct?.partai || '-',
        item.originalPrice,
        item.shopeeRecommendedPrice || '-',
        item.promoPrice,
        `${totalPercentageRate.toFixed(1)}% + ${formatIDR(totalFixedFeesPerOrder)}`,
        Math.round(a.totalPotonganRp),
        Math.round(a.netPayout),
        Math.round(a.netProfit),
        Number(a.netMarginPercent.toFixed(1)),
        `${marginThreshold}%`,
        a.minSafePromoPrice,
        a.deficitPrice,
        item.salesCount || 0,
        item.promoStock || 0
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hasil_Analisa_Rekomendasi');

    const outName = `Laporan_Analisa_Rekomendasi_Shopee_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Berhasil mengekspor laporan analisa lengkap (${targetItems.length} produk) ke ${outName}!`);
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-200 pb-16">
      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in slide-in-from-bottom-5">
          <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-sm font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* HEADER SECTION */}
      {showHeroHeader ? (
        <div className="bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 transform skew-x-12 pointer-events-none" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold tracking-wide uppercase">
                <ShieldAlert className="w-4 h-4 text-amber-200" />
                Proteksi Margin & Analisa Kolom Rekomendasi Diskon Shopee
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-3">
                Analisa Kolom Rekomendasi Harga Diskon Shopee
              </h1>
              <p className="text-orange-100 text-sm sm:text-base leading-relaxed">
                Mengecek apakah harga pada kolom <strong className="text-white underline decoration-white decoration-2">Rekomendasi Harga Diskon</strong> dari Shopee aman atau menyebabkan kerugian saat dipotong biaya persentase Toko Star+ (Admin, Bebas Ongkir XTRA, Promo XTRA+ 6.5%, Biaya Promosi Toko 5-10%, Asuransi, AMS) dan biaya tetap (Marketplace, Jubelio, Packing, Hemat Kirim).
                Jika di bawah batas margin atau rugi, <strong className="text-white bg-red-800/80 px-2 py-0.5 rounded">langsung diberi peringatan berwarna merah</strong>.
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-3">
              <button
                type="button"
                onClick={() => setShowHeroHeader(false)}
                className="px-3 py-1.5 bg-black/20 hover:bg-black/30 text-white font-bold rounded-xl text-xs backdrop-blur-sm transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Sembunyikan banner header ini agar hemat ruang layar"
              >
                <ChevronUp className="w-4 h-4" /> Sembunyikan Header
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleLoadDemoAllData}
                  className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95 animate-pulse"
                  title="Muat contoh File 1 (Promo) & File 2 (Data Produk) sekaligus untuk langsung menjalankan analisa"
                >
                  <Sparkles className="w-4 h-4 text-white" /> Muat Contoh Lengkap (File 1 & 2)
                </button>
                <button
                  onClick={handleLoadDemoData}
                  className="px-3 py-2 bg-white text-orange-700 hover:bg-orange-50 border border-orange-200 font-bold rounded-xl text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Muat contoh file promosi Shopee (15 Kolom)"
                >
                  <Sparkles className="w-3.5 h-3.5 text-orange-600" /> Contoh File 1
                </button>
                <button
                  onClick={handleLoadDemoMasterData}
                  className="px-3 py-2 bg-indigo-50 text-indigo-900 hover:bg-indigo-100 border border-indigo-200 font-bold rounded-xl text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Muat contoh Data Produk Shopee (14 Kolom)"
                >
                  <Database className="w-3.5 h-3.5 text-indigo-600" /> Contoh File 2
                </button>
                <button
                  onClick={handleDownloadTemplate}
                  className="px-3 py-2 bg-orange-700/80 hover:bg-orange-700 text-white border border-white/20 font-bold rounded-xl text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Download template Excel 15 kolom siap upload ke Shopee Seller Centre (baris data mulai baris ke-4)"
                >
                  <Download className="w-3.5 h-3.5" /> Template File 1
                </button>
                <button
                  onClick={handleDownloadMasterTemplate}
                  className="px-3 py-2 bg-indigo-950/40 hover:bg-indigo-950/60 text-white border border-white/20 font-bold rounded-xl text-xs sm:text-sm shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Download template Excel 14 kolom Data Produk Shopee (mulai baris ke-7)"
                >
                  <Download className="w-3.5 h-3.5" /> Template File 2
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="p-1 bg-orange-100 text-orange-700 rounded-lg">
              <ShieldAlert className="w-3.5 h-3.5" />
            </span>
            <span className="font-bold text-slate-800">Analisa Kolom Rekomendasi Harga Diskon Shopee</span>
            <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">(Header Banner Disembunyikan)</span>
          </div>
          <button
            type="button"
            onClick={() => setShowHeroHeader(true)}
            className="px-3 py-1 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
            title="Tampilkan kembali banner petunjuk header"
          >
            <ChevronDown className="w-3.5 h-3.5" /> Tampilkan Petunjuk Header
          </button>
        </div>
      )}

      {/* WORKFLOW ALUR 2 FILE EXCEL SHOPEE */}
      <div className="space-y-4">
        {/* DIAGRAM JEMBATAN PENCOCOKAN DARI 2 FILE EXCEL KE STOCK LIST */}
        <div className="bg-gradient-to-r from-orange-50 via-indigo-50 to-blue-50 border border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-xs hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-indigo-600 text-white rounded-xl shadow-2xs">
                  <Database className="w-4 h-4" />
                </span>
                <h3 className="font-bold text-sm sm:text-base text-indigo-950">
                  Alur Pencocokan SKU 5-Digit Stock List (2 File Excel Shopee)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-200/80 text-indigo-900 border border-indigo-300">
                  Resmi Shopee
                </span>
              </div>
              <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
                Shopee memisahkan data promosi dan data katalog toko. Sistem ini menghubungkan: <br className="hidden sm:inline" />
                <strong>File 1</strong> (<code className="font-mono bg-white px-1.5 py-0.5 rounded text-orange-700 font-bold border border-orange-200">Kode Variasi</code>) dicocokkan dengan <strong>File 2</strong> (<code className="font-mono bg-white px-1.5 py-0.5 rounded text-indigo-700 font-bold border border-indigo-200">Kode Variasi</code>), lalu mengambil SKU dari kolom <strong className="text-indigo-900">&quot;SKU&quot;</strong> atau <strong className="text-indigo-900">&quot;SKU Induk&quot;</strong> (format 5-digit) untuk mengambil modal HPP dari <strong className="text-emerald-800">STOCK LIST</strong>!
              </p>
            </div>

            {/* Step pills */}
            <div className="flex items-center gap-2 text-[11px] font-bold overflow-x-auto pb-1 lg:pb-0 shrink-0">
              <div className="bg-white text-orange-900 px-3 py-1.5 rounded-xl border border-orange-200 flex items-center gap-2 shadow-2xs">
                <span className="w-4 h-4 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                <div>
                  <span className="block text-[10px] text-slate-400 font-semibold">File 1 (Promo)</span>
                  <span>Kode Variasi</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-indigo-400 shrink-0" />
              <div className="bg-white text-indigo-900 px-3 py-1.5 rounded-xl border border-indigo-200 flex items-center gap-2 shadow-2xs">
                <span className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black">2</span>
                <div>
                  <span className="block text-[10px] text-slate-400 font-semibold">File 2 (Data Produk)</span>
                  <span>Kode Variasi ➔ Kolom SKU</span>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="bg-emerald-50 text-emerald-900 px-3 py-1.5 rounded-xl border border-emerald-300 flex items-center gap-2 shadow-2xs">
                <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-black">✓</span>
                <div>
                  <span className="block text-[10px] text-emerald-600 font-semibold">Stock List Toko</span>
                  <span>SKU 5 Digit &amp; HPP Modal</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DUAL FILE UPLOAD CARDS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CARD 1: FILE PROMOSI SHOPEE (15 KOLOM) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-orange-600 shrink-0" />
                    <span>File 1: Data Campaign Shopee (.xlsx)</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    15 kolom resmi ekspor Diskon Toko / Flash Sale / Campaign. Data mulai <strong>baris ke-4</strong>.
                  </p>
                </div>
                {fileName && (
                  <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-xl shrink-0">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-[11px] font-bold text-orange-900 truncate max-w-[120px]">{fileName}</span>
                    <button
                      onClick={() => {
                        setItems([]);
                        setSelectedItemIds(new Set());
                        setFileName(null);
                        setDetectedHeaderInfo(null);
                        setUploadedRawRows(null);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className="text-slate-400 hover:text-red-600 p-0.5 rounded cursor-pointer"
                      title="Hapus File 1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Rincian Kolom & Target Analisa */}
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <span className="text-[11px] font-bold text-orange-950 bg-orange-50 border border-orange-200 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-orange-600" />
                    Baris data dimulai dari: <strong>Baris ke-4</strong>
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleLoadDemoData}
                      className="text-[11px] font-bold text-orange-700 hover:text-orange-900 underline flex items-center gap-1 cursor-pointer"
                      title="Muat contoh file promosi Shopee 15 kolom"
                    >
                      <Sparkles className="w-3 h-3 text-orange-600" /> Contoh File 1
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      className="text-[11px] font-bold text-slate-700 hover:text-slate-900 underline flex items-center gap-1 cursor-pointer"
                      title="Unduh template 15 kolom resmi siap upload Shopee (mulai baris ke-4)"
                    >
                      <Download className="w-3 h-3 text-slate-500" /> Template 15 Kolom (Baris 4)
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleDownloadTemplateFromStockList}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1 cursor-pointer"
                      title="Unduh template 15 kolom Shopee otomatis terisi produk dari Stock List toko"
                    >
                      <Package className="w-3 h-3 text-emerald-600" /> Dari Stock List
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-2 text-xs pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-lg">
                    <span className="font-bold text-orange-950 text-[11px]">Fokus:</span>
                    <button
                      type="button"
                      onClick={() => setAnalyzedTarget('rekomendasi')}
                      className={`px-2 py-0.5 text-[11px] font-bold rounded transition-all cursor-pointer ${
                        analyzedTarget === 'rekomendasi'
                          ? 'bg-orange-600 text-white shadow-2xs'
                          : 'text-orange-800 hover:bg-orange-100'
                      }`}
                    >
                      ★ Rekomendasi Diskon
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnalyzedTarget('diskon')}
                      className={`px-2 py-0.5 text-[11px] font-bold rounded transition-all cursor-pointer ${
                        analyzedTarget === 'diskon'
                          ? 'bg-orange-600 text-white shadow-2xs'
                          : 'text-orange-800 hover:bg-orange-100'
                      }`}
                    >
                      Harga Diskon Diajukan
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
                    <span className="font-semibold text-slate-600 text-[11px]">Baris Data:</span>
                    <select
                      value={startDataRowNumber}
                      onChange={e => setStartDataRowNumber(Number(e.target.value))}
                      className="bg-white border border-slate-300 rounded px-1.5 py-0.5 text-[11px] font-bold font-mono text-orange-700 outline-none"
                    >
                      <option value={4}>Mulai Baris ke-4 (Standar)</option>
                      <option value={2}>Mulai Baris ke-2</option>
                      <option value={3}>Mulai Baris ke-3</option>
                      <option value={5}>Mulai Baris ke-5</option>
                    </select>
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[10px] text-slate-600">
                  <span className="font-bold text-slate-700 block mb-1">
                    Kolom Kunci di File 1:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono text-orange-700 font-bold">
                      Kolom 4: Kode Variasi (Shopee ID)
                    </span>
                    <span className="bg-orange-100 px-1.5 py-0.5 rounded border border-orange-300 font-mono text-orange-950 font-bold">
                      Kolom 12: Rekomendasi Harga Diskon
                    </span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                      Kolom 11: Harga Diskon
                    </span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 font-mono">
                      Kolom 9: Harga Awal
                    </span>
                  </div>
                </div>
              </div>

              {/* Upload Input File 1 */}
              <div className="mt-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="shopee-promo-file-input"
                />

                <label
                  htmlFor="shopee-promo-file-input"
                  className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    isProcessing
                      ? 'bg-slate-50 border-slate-300 opacity-60'
                      : 'bg-slate-50/60 hover:bg-orange-50/40 border-slate-300 hover:border-orange-400'
                  }`}
                >
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-6 h-6 text-orange-600 animate-spin" />
                      <span className="text-xs font-bold text-slate-700">Membaca data promosi Shopee...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-2.5 bg-orange-100 text-orange-600 rounded-xl shadow-inner flex items-center justify-center w-[80px] h-[80px]">
                        <Upload className="w-[60px] h-[60px]" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-800">
                          {fileName ? 'Ganti File Data Campaign Shopee (.xlsx)' : 'Klik untuk Upload File 1 (Data Campaign Shopee)'}
                        </span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          File Diskon Toko / Flash Sale / Campaign Shopee
                        </p>
                      </div>
                    </div>
                  )}
                </label>

                {detectedHeaderInfo && (
                  <div className="mt-2.5 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] font-semibold text-emerald-800 flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{detectedHeaderInfo}</span>
                  </div>
                )}

                {parseError && (
                  <div className="mt-2.5 p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] font-semibold text-red-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>{parseError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CARD 2: DATA PRODUK SHOPEE (14 KOLOM, MULAI BARIS 7) */}
          <div className="bg-white rounded-2xl border border-indigo-200 p-5 sm:p-6 shadow-sm flex flex-col justify-between space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/60 rounded-bl-full pointer-events-none" />
            <div>
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-indigo-100">
                <div>
                  <h2 className="text-base font-bold text-indigo-950 flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-600 shrink-0" />
                    <span>File 2: Mass Update (Informasi Penjualan) (.xlsx)</span>
                  </h2>
                  <p className="text-xs text-indigo-700 mt-0.5">
                    Jembatan SKU 5-Digit: 14 kolom resmi, baris data mulai <strong>baris ke-7</strong>.
                  </p>
                </div>
                {masterFileName && (
                  <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-xl shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-[11px] font-bold text-indigo-900 truncate max-w-[120px]">{masterFileName}</span>
                    <button
                      onClick={handleRemoveMasterFile}
                      className="text-slate-400 hover:text-red-600 p-0.5 rounded cursor-pointer"
                      title="Hapus File 2"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* Ketentuan 14 Kolom & Baris ke-7 */}
              <div className="mt-3 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                  <span className="text-[11px] font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-indigo-600" />
                    Baris data dimulai dari: <strong>Baris ke-7</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleLoadDemoMasterData}
                      className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 underline flex items-center gap-1 cursor-pointer"
                      title="Muat contoh 5 SKU data produk Shopee"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-600" /> Contoh File 2
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleDownloadMasterTemplate}
                      className="text-[11px] font-bold text-slate-600 hover:text-slate-900 underline flex items-center gap-1 cursor-pointer"
                      title="Download template 14 kolom Shopee"
                    >
                      <Download className="w-3 h-3 text-slate-500" /> Template 14 Kolom
                    </button>
                  </div>
                </div>

                <div className="p-2.5 bg-indigo-50/50 rounded-xl border border-indigo-100 text-[10px] text-indigo-950">
                  <span className="font-bold text-indigo-900 block mb-1">
                    14 Kolom Standar Shopee (SKU cocok dengan Stock List):
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 font-mono text-[9.5px]">
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">1. Kode Produk</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">2. Nama Produk</span>
                    <span className="bg-indigo-100 text-indigo-900 font-bold px-1.5 py-0.5 rounded border border-indigo-300">
                      ★ 3. Kode Variasi
                    </span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">4. Nama Variasi</span>
                    <span className="bg-emerald-100 text-emerald-950 font-bold px-1.5 py-0.5 rounded border border-emerald-300">
                      ★ 5. SKU Induk (5-Digit)
                    </span>
                    <span className="bg-emerald-100 text-emerald-950 font-bold px-1.5 py-0.5 rounded border border-emerald-300">
                      ★ 6. SKU (5-Digit)
                    </span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">7. Harga</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">8. GTIN</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">9. Stok</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">10. Min. Beli</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">11. Maks. Beli</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">12. Tgl Mulai</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">13. Jml Hari</span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-indigo-100">14. Tgl Berakhir</span>
                  </div>
                </div>
              </div>

              {/* Upload Input File 2 */}
              <div className="mt-4">
                <input
                  ref={masterFileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleMasterFileUpload}
                  className="hidden"
                  id="shopee-master-product-file-input"
                />

                <label
                  htmlFor="shopee-master-product-file-input"
                  className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                    isProcessingMaster
                      ? 'bg-indigo-50/50 border-indigo-300 opacity-60'
                      : 'bg-indigo-50/40 hover:bg-indigo-50 border-indigo-300 hover:border-indigo-500'
                  }`}
                >
                  {isProcessingMaster ? (
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
                      <span className="text-xs font-bold text-indigo-900">Membaca Data Produk Shopee (14 Kolom)...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl shadow-inner flex items-center justify-center w-[80px] h-[80px]">
                        <Database className="w-[60px] h-[60px]" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-indigo-950">
                          {masterFileName
                            ? `Ganti File 2 (${masterProducts.length} variasi terdaftar)`
                            : 'Klik untuk Upload File 2 (Mass Update / Informasi Penjualan .xlsx)'}
                        </span>
                        <p className="text-[11px] text-indigo-600/80 mt-0.5">
                          Ekspor dari Seller Centre &gt; Ubah Masal / Informasi Penjualan (Mulai Baris 7)
                        </p>
                      </div>
                    </div>
                  )}
                </label>

                {masterFileName && (
                  <div className="mt-2.5 p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-[11px] font-semibold text-indigo-900 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      {masterProducts.length} variasi produk aktif tersimpan di memori
                    </span>
                    <span className="text-[10px] text-indigo-600 font-bold bg-white px-2 py-0.5 rounded border border-indigo-200">
                      Tersimpan Otomatis
                    </span>
                  </div>
                )}

                {masterParseError && (
                  <div className="mt-2.5 p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] font-semibold text-red-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>{masterParseError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WAITING / STEP PENDING INSTRUCTIONAL STATE BANNERS */}
      {!canAnalyze && (
        <div className="space-y-4 hidden">
          {fileName && !masterFileName && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-6 text-center space-y-4 shadow-sm animate-in fade-in">
              <div className="inline-flex p-3 bg-amber-100 text-amber-700 rounded-2xl ring-4 ring-amber-200/50">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="max-w-xl mx-auto space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-200 text-amber-900 rounded-full text-xs font-black uppercase">
                  Langkah 1 Selesai • Menunggu Langkah 2
                </div>
                <h3 className="text-lg font-black text-amber-950">
                  Analisa Ditunda: Menunggu Upload File 2 (Mass Update Informasi Penjualan)
                </h3>
                <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
                  Aplikasi <strong>tidak dapat menganalisa jika hanya mengupload File 1</strong> ({items.length} item promo berhasil dimuat). Anda wajib mengupload <strong>File 2 (Mass Update Informasi Penjualan .xlsx 14 Kolom)</strong> agar Kode Variasi Shopee dapat dihubungkan ke SKU 5-Digit Stock List dan modal HPP toko Anda.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <label
                  htmlFor="shopee-master-product-file-input"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow cursor-pointer transition-all flex items-center gap-2 active:scale-95"
                >
                  <Upload className="w-4 h-4" /> Upload File 2 Sekarang
                </label>
                <button
                  onClick={handleLoadDemoMasterData}
                  className="px-4 py-2.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-indigo-600" /> Muat Contoh File 2
                </button>
              </div>
            </div>
          )}

          {!fileName && masterFileName && (
            <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-6 text-center space-y-4 shadow-sm animate-in fade-in">
              <div className="inline-flex p-3 bg-orange-100 text-orange-700 rounded-2xl ring-4 ring-orange-200/50">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="max-w-xl mx-auto space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-orange-200 text-orange-950 rounded-full text-xs font-black uppercase">
                  Langkah 2 Selesai • Menunggu Langkah 1
                </div>
                <h3 className="text-lg font-black text-orange-950">
                  Menunggu Upload File 1 (Data Campaign Shopee)
                </h3>
                <p className="text-xs sm:text-sm text-orange-800 leading-relaxed">
                  File 2 ({masterProducts.length} variasi terdaftar) telah siap di memori. Silakan upload <strong>File 1 (Data Campaign Shopee .xlsx 15 Kolom)</strong> pada kotak di sebelah kiri untuk mendeteksi potensi kerugian pada harga rekomendasi diskon Shopee.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                <label
                  htmlFor="shopee-promo-file-input"
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow cursor-pointer transition-all flex items-center gap-2 active:scale-95"
                >
                  <Upload className="w-4 h-4" /> Upload File 1 Sekarang
                </label>
                <button
                  onClick={handleLoadDemoData}
                  className="px-4 py-2.5 bg-white hover:bg-orange-50 text-orange-700 border border-orange-200 font-bold text-xs sm:text-sm rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-orange-600" /> Muat Contoh File 1
                </button>
              </div>
            </div>
          )}

          {!fileName && !masterFileName && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-slate-700 space-y-3 shadow-xs">
              <h3 className="font-bold text-xs uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-slate-400" /> Alur Kerja Analisa
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-semibold">
                <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-black">1</span>
                  <div>
                    <span className="block font-bold text-slate-800">Upload File 1 (Promo)</span>
                    <span className="text-[11px] text-slate-500 font-medium">Berisi kolom Nama Produk, Kode Variasi, Rekomendasi Harga Diskon.</span>
                  </div>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-xl flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">2</span>
                  <div>
                    <span className="block font-bold text-slate-800">Upload File 2 (Katalog)</span>
                    <span className="text-[11px] text-slate-500 font-medium">Jembatan Kode Variasi ke SKU 5-Digit Stock List toko Anda.</span>
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">✓</span>
                  <div>
                    <span className="block font-bold text-emerald-800">Analisa Margin Bersih</span>
                    <span className="text-[11px] text-emerald-600 font-medium">Menampilkan peringatan merah (rugi) & unduh file siap upload.</span>
                  </div>
                </div>
              </div>
              <div className="pt-2 flex items-center justify-center">
                <button
                  onClick={handleLoadDemoAllData}
                  className="px-5 py-2.5 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-extrabold rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Sparkles className="w-4 h-4 text-white" /> Muat Contoh Lengkap (File 1 & 2)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PARAMETER BIAYA MARKETPLACE & BATAS MARGIN */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div
          onClick={() => setShowFeeSettings(!showFeeSettings)}
          className="p-4 sm:px-6 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between cursor-pointer hover:bg-slate-100/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Percent className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                2. Pengaturan Batas Margin & Biaya Potongan Toko Star+ Shopee
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span>
                  Batas Margin Target: <strong className="text-indigo-600">{marginThreshold}%</strong>
                </span>
                <span>•</span>
                <span>
                  Total Potongan Star+: <strong className="text-orange-600">{totalPercentageRate.toFixed(1)}% + {formatIDR(totalFixedFeesPerOrder)}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 hidden sm:inline">
              {showFeeSettings ? 'Sembunyikan' : 'Buka Parameter'}
            </span>
            {showFeeSettings ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
          </div>
        </div>

        {showFeeSettings && (
          <div className="p-6 space-y-6">
            {/* ROW 1: BATAS MARGIN & ACUAN MODAL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
              {/* Batas Margin Minimal */}
              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-indigo-600" />
                    Batas Margin Bersih Minimal (%)
                  </label>
                  <span className="text-xs font-mono font-bold text-indigo-700 bg-white px-2 py-0.5 rounded shadow-2xs">
                    Target: {marginThreshold}%
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Jika harga pada kolom <strong>Rekomendasi Harga Diskon</strong> menghasilkan margin di bawah angka ini atau menyebabkan rugi bersih, baris SKU akan otomatis <strong>diberi peringatan berwarna merah</strong>.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="5"
                    max="40"
                    step="1"
                    value={marginThreshold}
                    onChange={e => setMarginThreshold(Number(e.target.value))}
                    className="w-full accent-indigo-600 cursor-pointer"
                  />
                  <div className="w-20 relative">
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={marginThreshold}
                      onChange={e => setMarginThreshold(Number(e.target.value) || 0)}
                      className="w-full text-right p-1.5 pr-6 font-mono font-bold text-sm bg-white border border-indigo-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="absolute right-2 top-1.5 text-xs font-bold text-slate-400">%</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[10, 12, 15, 20, 25, 30].map(val => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setMarginThreshold(val)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                        marginThreshold === val
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50'
                      }`}
                    >
                      {val}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Acuan Modal HPP */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    Acuan Modal Pokok (HPP)
                  </label>
                  <span className="text-[11px] font-semibold text-slate-500 capitalize bg-white px-2 py-0.5 rounded border border-slate-200">
                    {hppReference}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  Tingkat harga pokok dari database yang dijadikan dasar perhitungan laba bersih ketika Rekomendasi Diskon Shopee dipotong biaya marketplace.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['hpp', 'eceran', 'grosir', 'partai'] as const).map(ref => (
                    <button
                      key={ref}
                      type="button"
                      onClick={() => setHppReference(ref)}
                      className={`p-2 rounded-xl text-xs font-bold uppercase tracking-wider text-center border transition-all ${
                        hppReference === ref
                          ? 'bg-orange-600 text-white border-orange-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {ref === 'hpp' ? 'HPP Asli' : ref}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ROW 2: RINCIAN POTONGAN TOKO STAR+ SHOPEE */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-orange-600" />
                  Rincian Komponen Potongan Toko Star+ Shopee
                </h3>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includePromoFees}
                      onChange={e => setIncludePromoFees(e.target.checked)}
                      className="rounded accent-orange-600"
                    />
                    Sertakan Promo XTRA+ 6.5% & Biaya Promosi Toko 5-10%
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeFixedFees}
                      onChange={e => setIncludeFixedFees(e.target.checked)}
                      className="rounded accent-orange-600"
                    />
                    Sertakan Biaya Tetap (Rp)
                  </label>
                </div>
              </div>

              {/* Grid Komponen Persentase */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Admin Toko Star+ */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block truncate">Admin Star+</span>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      step="0.1"
                      value={adminFeePercent}
                      onChange={e => setAdminFeePercent(parseFloat(e.target.value) || 0)}
                      className="w-full text-right font-mono font-bold text-xs p-1 bg-white border border-slate-200 rounded"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Biaya Admin Kategori</span>
                </div>

                {/* Gratis Ongkir XTRA */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block truncate">Gratis Ongkir XTRA</span>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      step="0.1"
                      value={gratisOngkirXtraPercent}
                      onChange={e => setGratisOngkirXtraPercent(parseFloat(e.target.value) || 0)}
                      className="w-full text-right font-mono font-bold text-xs p-1 bg-white border border-slate-200 rounded"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Program Bebas Ongkir</span>
                </div>

                {/* Promo XTRA+ 6.5% */}
                <div className={`p-2.5 rounded-xl border transition-all ${includePromoFees ? 'bg-orange-50/70 border-orange-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                  <span className="text-[10px] font-bold text-orange-950 block truncate">Promo XTRA+</span>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      step="0.1"
                      disabled={!includePromoFees}
                      value={promoXtraPercent}
                      onChange={e => setPromoXtraPercent(parseFloat(e.target.value) || 0)}
                      className="w-full text-right font-mono font-bold text-xs p-1 bg-white border border-orange-200 rounded text-orange-900"
                    />
                    <span className="text-xs font-bold text-orange-700">%</span>
                  </div>
                  <span className="text-[9px] text-orange-600 block mt-0.5">Cashback / XTRA+</span>
                </div>

                {/* Biaya Promosi Toko 5-10% */}
                <div className={`p-2.5 rounded-xl border transition-all ${includePromoFees ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                  <span className="text-[10px] font-bold text-amber-950 block truncate">Biaya Promosi Toko</span>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      step="0.1"
                      disabled={!includePromoFees}
                      value={promosiTokoPercent}
                      onChange={e => setPromosiTokoPercent(parseFloat(e.target.value) || 0)}
                      className="w-full text-right font-mono font-bold text-xs p-1 bg-white border border-amber-200 rounded text-amber-900"
                    />
                    <span className="text-xs font-bold text-amber-700">%</span>
                  </div>
                  <span className="text-[9px] text-amber-600 block mt-0.5">Voucher / Promo 5-10%</span>
                </div>

                {/* Asuransi 0.5% */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block truncate">Asuransi Kirim</span>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      step="0.1"
                      value={asuransiPercent}
                      onChange={e => setAsuransiPercent(parseFloat(e.target.value) || 0)}
                      className="w-full text-right font-mono font-bold text-xs p-1 bg-white border border-slate-200 rounded"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Proteksi Paket</span>
                </div>

                {/* Komisi AMS 1% */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block truncate">Komisi AMS</span>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      step="0.1"
                      value={amsPercent}
                      onChange={e => setAmsPercent(parseFloat(e.target.value) || 0)}
                      className="w-full text-right font-mono font-bold text-xs p-1 bg-white border border-slate-200 rounded"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Afiliasi Shopee</span>
                </div>
              </div>

              {/* Grid Biaya Tetap Nominal (Rp) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 block">Proses Marketplace</span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-slate-400 font-bold">Rp</span>
                    <input
                      type="text"
                      value={formatInput(marketplaceFeeRp)}
                      onChange={e => setMarketplaceFeeRp(Number(parseInput(e.target.value)) || 0)}
                      className="w-full text-right font-mono font-bold text-xs p-1 bg-white border border-slate-200 rounded"
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 block">Proses Jubelio</span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-slate-400 font-bold">Rp</span>
                    <input
                      type="text"
                      value={formatInput(jubelioFeeRp)}
                      onChange={e => setJubelioFeeRp(Number(parseInput(e.target.value)) || 0)}
                      className="w-full text-right font-mono font-bold text-xs p-1 bg-white border border-slate-200 rounded"
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 block">Biaya Packing</span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-slate-400 font-bold">Rp</span>
                    <input
                      type="text"
                      value={formatInput(packingFeeRp)}
                      onChange={e => setPackingFeeRp(Number(parseInput(e.target.value)) || 0)}
                      className="w-full text-right font-mono font-bold text-xs p-1 bg-white border border-slate-200 rounded"
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 block">Hemat Biaya Kirim</span>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs text-slate-400 font-bold">Rp</span>
                    <input
                      type="text"
                      value={formatInput(hematBiayaKirimRp)}
                      onChange={e => setHematBiayaKirimRp(Number(parseInput(e.target.value)) || 0)}
                      className="w-full text-right font-mono font-bold text-xs p-1 bg-white border border-slate-200 rounded"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* HASIL ANALISA & STATISTIK KPI */}
      {canAnalyze && (
        <div className="space-y-6">
          {/* KPI CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Total SKU */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total SKU Dicek</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900 font-mono">{stats.total}</span>
                <span className="text-xs text-slate-400">SKU</span>
              </div>
            </div>

            {/* PERINGATAN MERAH (DI BAWAH MARGIN / RUGI) */}
            <div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between transition-all ${
              stats.dangerCount > 0
                ? 'bg-red-50/90 border-red-300 ring-2 ring-red-400/20'
                : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-red-600 animate-pulse" />
                  Peringatan Merah
                </span>
                {stats.dangerCount > 0 && (
                  <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full uppercase">
                    Bahaya Boncos
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-red-700 font-mono">{stats.dangerCount}</span>
                <span className="text-xs text-red-600 font-semibold">Rekomendasi Rugi/Bawah Margin</span>
              </div>
            </div>

            {/* SKU AMAN */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Rekomendasi Aman
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-emerald-700 font-mono">{stats.safeCount}</span>
                <span className="text-xs text-emerald-600 font-semibold">Margin &gt;= {marginThreshold}%</span>
              </div>
            </div>

            {/* BUTUH HPP */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-amber-600" />
                Belum Ada HPP
              </span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-2xl font-black text-amber-700 font-mono">{stats.missingHppCount}</span>
                <span className="text-xs text-amber-600 font-semibold">Isi manual di tabel</span>
              </div>
            </div>

            {/* POTENSI DEFISIT */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between col-span-2 sm:col-span-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Potensi Kerugian</span>
              <div className="mt-2 flex items-baseline justify-between">
                <span className={`text-xl font-black font-mono ${stats.totalPotentialLoss > 0 ? 'text-red-700' : 'text-slate-800'}`}>
                  {formatIDR(stats.totalPotentialLoss)}
                </span>
                <span className="text-xs text-slate-400">akumulasi rugi</span>
              </div>
            </div>
          </div>

          {/* BANNER PERINGATAN JIKA ADA SKU MERAH */}
          {stats.dangerCount > 0 && (
            <div className="p-4 sm:p-5 bg-red-600 text-white rounded-2xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white/20 rounded-xl mt-0.5">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base tracking-tight">
                    Peringatan: {stats.dangerCount} SKU Memiliki Rekomendasi Harga Diskon yang Merugikan / Di Bawah Batas Margin!
                  </h3>
                  <p className="text-xs sm:text-sm text-red-100 mt-0.5">
                    Jika Anda menyetujui rekomendasi diskon tersebut, potensi kerugian bersih mencapai <strong>{formatIDR(stats.totalPotentialLoss)}</strong>.
                    Gunakan tombol di samping untuk menaikkan harga ke batas aman secara otomatis ke kolom <strong>Harga Diskon</strong>.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  onClick={handleFixAllDangerousItems}
                  className="px-4 py-2 bg-white text-red-700 hover:bg-red-50 font-bold text-xs sm:text-sm rounded-xl shadow transition-all flex items-center gap-2 cursor-pointer active:scale-95"
                  title="Otomatis menaikkan kolom Harga Diskon ke Harga Aman Minimum untuk semua SKU yang merah"
                >
                  <Wand2 className="w-4 h-4" /> Amankan Semua ke Kolom Harga Diskon
                </button>
              </div>
            </div>
          )}

          {/* BANNER STATUS PENCOCOKAN SKU 5-DIGIT STOCK LIST */}
          <div className="p-4 bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50/60 border border-indigo-200 rounded-2xl shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-2xs mt-0.5 shrink-0">
                <Database className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-xs sm:text-sm text-indigo-950">
                    Acuan SKU Stock List: Format 5 Digit (Contoh: 03309)
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-indigo-200/80 text-indigo-900 border border-indigo-300">
                    {stats.matchedSkuCount} dari {stats.total} Item ({stats.total > 0 ? Math.round((stats.matchedSkuCount / stats.total) * 100) : 0}%) Terhubung
                  </span>
                </div>
                <p className="text-xs text-indigo-800 leading-relaxed max-w-3xl">
                  {masterFileName ? (
                    <span>
                      Jembatan <strong>File 2 Aktif ({masterFileName})</strong>: {masterProducts.length} variasi Shopee terdaftar. Kode Variasi di File 1 otomatis dicocokkan dengan Kode Variasi di File 2, lalu mengambil SKU 5-digit dari kolom SKU / SKU Induk untuk menarik modal HPP dari Stock List.
                    </span>
                  ) : (
                    <span>
                      Kode produk di file promosi sering berupa ID acak Shopee. Upload <strong>File 2 (Data Produk Shopee)</strong> di atas untuk mencocokkan <strong>Kode Variasi ➔ Kolom SKU / SKU Induk</strong> secara akurat ke SKU 5-digit Stock List toko Anda.
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-center shrink-0 flex-wrap">
              <div className="flex items-center gap-1.5 bg-white border border-indigo-300 rounded-xl px-2.5 py-1.5 shadow-2xs">
                <span className="text-xs font-bold text-slate-700">Kolom Acuan:</span>
                <select
                  value={skuColumnChoice}
                  onChange={e => handleSkuColumnChoiceChange(e.target.value)}
                  className="bg-transparent text-xs font-bold text-indigo-900 outline-none cursor-pointer max-w-[200px] truncate"
                >
                  <option value="auto">⚡ Otomatis (Ekstrak 5 Digit)</option>
                  <option value="col_kode_variasi">Kolom 4: Kode Variasi</option>
                  <option value="col_kode_produk">Kolom 2: Kode Produk</option>
                  <option value="col_nama_produk">Kolom 1: Nama Produk</option>
                  <option value="col_nama_variasi">Kolom 3: Nama Variasi</option>
                  {detectedHeaders.length > 0 && (
                    <optgroup label="Kolom dari File Excel">
                      {detectedHeaders.map(h => (
                        <option key={`banner-hdr-${h.index}`} value={`custom_idx_${h.index}`}>
                          Kolom #{h.index + 1}: {h.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <button
                type="button"
                onClick={() => handleSkuColumnChoiceChange(skuColumnChoice)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Pindai ulang seluruh baris untuk menemukan kecocokan SKU 5 digit"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Pindai Ulang
              </button>
            </div>
          </div>

          {/* TABLE CONTAINER */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* TOOLBAR TABEL */}
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-200/60 p-1 rounded-xl border border-slate-200/80 overflow-x-auto pb-0">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  Semua ({stats.total})
                </button>
                <button
                  onClick={() => setStatusFilter('danger')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'danger'
                      ? 'bg-white text-red-700 shadow-2xs border border-red-200'
                      : 'text-slate-600 hover:text-red-700 hover:bg-slate-200/50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                  Peringatan Merah ({stats.dangerCount})
                </button>
                <button
                  onClick={() => setStatusFilter('safe')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'safe'
                      ? 'bg-white text-emerald-700 shadow-2xs border border-emerald-200'
                      : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-200/50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                  Aman ({stats.safeCount})
                </button>
                <button
                  onClick={() => setStatusFilter('specialSku')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'specialSku'
                      ? 'bg-white text-amber-700 shadow-2xs border border-amber-200'
                      : 'text-slate-600 hover:text-amber-700 hover:bg-slate-200/50'
                  }`}
                  title="Tampilkan hanya SKU khusus bundle/pack dengan kuantitas kelipatan (seperti: 16878-10PCS)"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                  SKU Khusus ({stats.specialSkuCount})
                </button>
                {stats.unmatchedSkuCount > 0 && (
                  <button
                    onClick={() => setStatusFilter('unmatchedSku')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                      statusFilter === 'unmatchedSku'
                        ? 'bg-white text-indigo-700 shadow-2xs border border-indigo-200'
                        : 'text-slate-600 hover:text-indigo-700 hover:bg-slate-200/50'
                    }`}
                    title="Tampilkan hanya produk yang belum terhubung dengan SKU 5 Digit Stock List"
                  >
                    <Link2 className="w-3.5 h-3.5" /> Belum Cocok ({stats.unmatchedSkuCount})
                  </button>
                )}
                {stats.missingHppCount > 0 && (
                  <button
                    onClick={() => setStatusFilter('missingHpp')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                      statusFilter === 'missingHpp'
                        ? 'bg-white text-slate-800 shadow-2xs border border-slate-300'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                  >
                    Tanpa HPP ({stats.missingHppCount})
                  </button>
                )}
              </div>

              {/* View Mode & Search & Actions */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* View Mode Toggle */}
                <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5">
                  <button
                    onClick={() => setViewMode('compact')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                      viewMode === 'compact'
                        ? 'bg-orange-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Ringkas
                  </button>
                  <button
                    onClick={() => setViewMode('full_shopee')}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                      viewMode === 'full_shopee'
                        ? 'bg-orange-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" /> 15 Kolom Shopee
                  </button>
                </div>

                {/* Search */}
                <div className="relative flex-1 sm:w-56">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Cari SKU, variasi, produk..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 font-medium"
                  />
                </div>

                {/* Export Buttons */}
                <div className="relative inline-flex items-center rounded-xl shadow-2xs shrink-0">
                  <button
                    onClick={() => handleExportShopeeReadyUpload(selectedItemIds.size > 0 ? 'selected' : 'filtered')}
                    className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-l-xl transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                    title={
                      selectedItemIds.size > 0
                        ? `Unduh ${selectedItemIds.size} produk terpilih ke file Excel format persis Shopee`
                        : `Unduh ${filteredItems.length} produk hasil filter ke file Excel format persis Shopee`
                    }
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {selectedItemIds.size > 0
                        ? `Unduh ${selectedItemIds.size} Produk Terpilih (.xlsx)`
                        : filteredItems.length < analyzedItems.length
                        ? `Unduh ${filteredItems.length} Produk Difilter (.xlsx)`
                        : `Format Persis Promosi Shopee (.xlsx)`}
                    </span>
                    {uploadedRawRows && (
                      <span className="bg-orange-800 text-[10px] px-1.5 py-0.5 rounded text-orange-100 font-bold">
                        Format Asli ✓
                      </span>
                    )}
                  </button>

                  {/* Dropdown Menu Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowExportMenu(prev => !prev)}
                    className="px-2 py-1.5 bg-orange-700 hover:bg-orange-800 text-white font-bold text-xs rounded-r-xl border-l border-orange-500/50 transition-all cursor-pointer flex items-center shrink-0"
                    title="Pilih opsi produk yang ingin diunduh (Hasil Filter / Produk Terpilih / Semua Produk)"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu Popup */}
                  {showExportMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setShowExportMenu(false)}
                      />
                      <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 py-2 z-40 text-xs text-slate-800 animate-in fade-in zoom-in-95">
                        <div className="px-3.5 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                          Pilih Produk Untuk Diunduh (.xlsx Shopee)
                        </div>

                        {/* Option 1: Filtered */}
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            handleExportShopeeReadyUpload('filtered');
                          }}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-orange-50 flex items-start gap-2.5 transition-colors cursor-pointer group"
                        >
                          <Filter className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-orange-700 flex items-center gap-1.5">
                              <span>Hanya Produk Yang Difilter</span>
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-[10px] font-extrabold">
                                {filteredItems.length} Produk
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                              Mengunduh persis {filteredItems.length} produk yang tampil sesuai filter/pencarian saat ini.
                            </p>
                          </div>
                        </button>

                        {/* Option 2: Selected */}
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            if (selectedItemIds.size === 0) {
                              alert('Belum ada produk yang dicentang. Silakan centang kotak pada tabel terlebih dahulu.');
                              return;
                            }
                            handleExportShopeeReadyUpload('selected');
                          }}
                          className={`w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 transition-colors cursor-pointer group ${
                            selectedItemIds.size > 0 ? 'hover:bg-emerald-50' : 'opacity-60 bg-slate-50 cursor-not-allowed'
                          }`}
                        >
                          <CheckSquare className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-emerald-700 flex items-center gap-1.5">
                              <span>Hanya Produk Yang Dipilih (Centang)</span>
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[10px] font-extrabold">
                                {selectedItemIds.size} Dipilih
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                              {selectedItemIds.size > 0
                                ? `Mengunduh hanya ${selectedItemIds.size} produk yang Anda centang pada tabel.`
                                : 'Centang kotak pada baris tabel untuk memilih produk tertentu.'}
                            </p>
                          </div>
                        </button>

                        {/* Option 3: All */}
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            handleExportShopeeReadyUpload('all');
                          }}
                          className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 flex items-start gap-2.5 transition-colors cursor-pointer group border-t border-slate-100"
                        >
                          <Layers className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-slate-950 flex items-center gap-1.5">
                              <span>Semua Produk</span>
                              <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded-full text-[10px] font-extrabold">
                                {analyzedItems.length} Produk
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                              Mengunduh seluruh produk di file promosi tanpa batas filter.
                            </p>
                          </div>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => handleExportFullAnalysisXLSX(selectedItemIds.size > 0 ? 'selected' : 'filtered')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                  title="Unduh laporan analisa lengkap margin & potongan marketplace"
                >
                  <Download className="w-3.5 h-3.5" /> Laporan Analisa
                </button>
              </div>
            </div>

            {/* BARIS KONTROL PRODUK DIPILIH (SELECTION BANNER) */}
            {selectedItemIds.size > 0 && (
              <div className="px-4 py-2.5 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 border-b border-orange-200 flex flex-wrap items-center justify-between gap-3 text-xs text-orange-950 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-orange-600 text-white font-black text-[10px] shadow-2xs">
                    {selectedItemIds.size}
                  </span>
                  <span className="font-bold">
                    {selectedItemIds.size} produk dipilih dari {filteredItems.length} produk yang difilter (Total {analyzedItems.length} SKU)
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleExportShopeeReadyUpload('selected')}
                    className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95 text-xs"
                    title="Unduh file Excel format persis Shopee khusus produk-produk yang dipilih"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Unduh {selectedItemIds.size} Produk Terpilih (.xlsx Shopee)
                  </button>

                  <button
                    onClick={handleFixSelectedDangerousItems}
                    className="px-3 py-1 bg-white hover:bg-red-50 text-red-700 border border-red-300 font-bold rounded-lg shadow-2xs flex items-center gap-1.5 cursor-pointer active:scale-95 text-xs"
                    title="Otomatis menaikkan harga diskon khusus produk terpilih yang berpotensi rugi ke batas aman"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-red-600" />
                    Amankan Terpilih
                  </button>

                  <button
                    onClick={handleSelectAllFiltered}
                    className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold rounded-lg text-xs cursor-pointer"
                  >
                    {filteredItems.every(i => selectedItemIds.has(i.id)) ? 'Batal Pilih Semua' : `Pilih Semua yang Difilter (${filteredItems.length})`}
                  </button>

                  <button
                    onClick={handleClearSelection}
                    className="px-2.5 py-1 text-slate-500 hover:text-slate-800 font-semibold text-xs cursor-pointer"
                  >
                    Batal Pilih
                  </button>
                </div>
              </div>
            )}

            {/* DEDICATED SKU KHUSUS VIEW BANNER */}
            {statusFilter === 'specialSku' && (
              <div className="p-5 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 border border-amber-200 rounded-2xl m-4 shadow-sm space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs shrink-0">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-sm sm:text-base text-amber-950 flex items-center gap-2">
                        <span>📊 DEDICATED VIEW: Analisis SKU Khusus (Bundle/Pack Qty)</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200 text-amber-900 border border-amber-300 uppercase tracking-wider">
                          Aktif
                        </span>
                      </h3>
                      <p className="text-xs text-amber-900/80 leading-relaxed max-w-3xl">
                        View khusus ini mendeteksi SKU format kuantitas (seperti <code>-10PCS</code>). Sistem secara otomatis menarik modal HPP &amp; harga dasar dari <strong>SKU Satuan 5 Digit asli</strong> di Stock List, kemudian <strong>mengalikan HPP, Eceran, Grosir, dan Partai sesuai kuantitas isi pack</strong> sebelum melakukan kalkulasi margin dan menampilkan data di bawah.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sub KPI Cards for Special SKU */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 pt-1.5">
                  <div className="bg-white p-3 rounded-xl border border-amber-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total SKU Khusus</span>
                    <span className="text-lg font-black text-amber-950 font-mono block mt-1">
                      {stats.specialSkuCount} <span className="text-xs text-slate-400 font-normal">SKU</span>
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-amber-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider block">🔴 Bahaya Boncos</span>
                    <span className="text-lg font-black text-red-600 font-mono block mt-1">
                      {stats.specialDangerCount} <span className="text-xs text-slate-400 font-normal">SKU</span>
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-amber-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">🟢 Aman (Target Margin)</span>
                    <span className="text-lg font-black text-emerald-600 font-mono block mt-1">
                      {stats.specialSafeCount} <span className="text-xs text-slate-400 font-normal">SKU</span>
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-amber-200/60 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Potensi Kerugian Khusus</span>
                    <span className={`text-sm font-black font-mono block mt-1.5 ${stats.specialPotentialLoss > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                      {formatIDR(stats.specialPotentialLoss)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* TABEL KONTEN */}
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto border border-slate-200 rounded-xl shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="text-slate-600 font-bold uppercase tracking-wider text-[10px] whitespace-nowrap">
                    {/* CHECKBOX PILIH SEMUA */}
                    <th className="py-3 px-3 text-center sticky top-0 left-0 bg-slate-100 z-30 w-10 border-r border-slate-200/60 border-b border-slate-200 shadow-xs">
                      <input
                        type="checkbox"
                        aria-label="Pilih semua produk yang difilter"
                        checked={filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.has(i.id))}
                        onChange={handleSelectAllFiltered}
                        title={
                          filteredItems.length > 0 && filteredItems.every(i => selectedItemIds.has(i.id))
                            ? 'Batalkan pilihan semua produk'
                            : `Pilih semua ${filteredItems.length} produk yang difilter`
                        }
                        className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 cursor-pointer accent-orange-600 align-middle"
                      />
                    </th>
                    <th className="py-3 px-4 sticky top-0 left-10 bg-slate-100 z-30 w-[140px] border-r border-slate-200/60 border-b border-slate-200 shadow-xs">Status Kelayakan</th>
                    <th className="py-3 px-3 sticky top-0 left-[180px] bg-slate-100 z-30 w-[180px] border-r border-slate-200/60 border-b border-slate-200 shadow-xs">SKU Stock List (5 Digit) &amp; Shopee</th>
                    <th className="py-3 px-4 sticky top-0 left-[360px] bg-slate-100 z-30 min-w-[220px] max-w-[320px] border-r border-slate-200/60 border-b border-slate-200 shadow-xs">Nama Produk & Variasi</th>

                    {viewMode === 'full_shopee' && (
                      <>
                        <th className="py-3 px-3 sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Kode Produk</th>
                        <th className="py-3 px-3 sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Kategori L1 - L3</th>
                        <th className="py-3 px-2 text-right sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Penjualan</th>
                        <th className="py-3 px-2 text-right sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Stok / Promo</th>
                        <th className="py-3 px-2 text-center sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Batas Beli</th>
                      </>
                    )}

                    <th className="py-3 px-3 text-right sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">HPP Modal</th>
                    <th className="py-3 px-3 text-right text-indigo-950 font-bold bg-indigo-50/60 border-l border-indigo-100 whitespace-nowrap sticky top-0 z-20 border-b border-slate-200 shadow-xs">
                      Harga Eceran
                    </th>
                    <th className="py-3 px-3 text-right text-indigo-950 font-bold bg-indigo-50/60 whitespace-nowrap sticky top-0 z-20 border-b border-slate-200 shadow-xs">
                      Harga Grosir
                    </th>
                    <th className="py-3 px-3 text-right text-indigo-950 font-bold bg-indigo-50/60 border-r border-indigo-100 whitespace-nowrap sticky top-0 z-20 border-b border-slate-200 shadow-xs">
                      Harga Partai
                    </th>
                    <th className="py-3 px-3 text-right sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Harga Awal (100%)</th>

                    {/* KOLOM UTAMA YANG DIANALISA: REKOMENDASI HARGA DISKON */}
                    <th className="py-3 px-3 text-right bg-orange-100/70 text-orange-950 font-black border-x border-orange-200 sticky top-0 z-20 border-b border-orange-200 shadow-xs">
                      ★ Rekomendasi Diskon Shopee (%)
                    </th>

                    <th className="py-3 px-3 text-right sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Potongan MP (% + Rp)</th>
                    <th className="py-3 px-3 text-right sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Net Payout</th>
                    <th className="py-3 px-3 text-right sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Laba / Rugi Bersih</th>
                    <th className="py-3 px-3 text-right sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Margin Bersih %</th>

                    {/* KOLOM HARGA DISKON AMAN AGAR TIDAK RUGI */}
                    <th className="py-3 px-3 text-right bg-emerald-50 text-emerald-950 font-black border-x border-emerald-200 sticky top-0 z-20 border-b border-emerald-200 shadow-xs">
                      Rekomendasi Harga Aman (Min)
                    </th>

                    {/* KOLOM HARGA DISKON PENGAJUAN FINAL */}
                    <th className="py-3 px-3 text-right font-bold text-slate-900 sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">
                      Harga Diskon (Upload) (%)
                    </th>

                    <th className="py-3 px-4 text-center sticky top-0 bg-slate-100 z-20 border-b border-slate-200 shadow-xs">Aksi Pengamanan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={viewMode === 'full_shopee' ? 22 : 17} className="py-12 text-center text-slate-400">
                        Tidak ada data SKU yang sesuai dengan filter atau pencarian saat ini.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(item => {
                      const a = item.analysis;
                      const isDanger = a.status === 'danger';
                      const isSafe = a.status === 'safe';
                      const isMissingHpp = a.status === 'missingHpp';
                      const isSelected = selectedItemIds.has(item.id);
                      const skuCode = item.variationCode || item.productCode || item.variationSku || '-';

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-orange-50 ring-2 ring-inset ring-orange-400 font-semibold text-slate-900'
                              : isDanger
                              ? 'bg-red-50 hover:bg-red-100/50 text-red-950 font-semibold'
                              : isMissingHpp
                              ? 'bg-amber-50 hover:bg-amber-100/40 text-slate-800'
                              : 'bg-white hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          {/* CHECKBOX SELEKSI PER BARIS */}
                          <td className="py-3 px-3 text-center align-middle sticky left-0 bg-inherit z-10 w-10 border-r border-slate-200/40">
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${item.productName}`}
                              checked={isSelected}
                              onChange={() => toggleSelectItem(item.id)}
                              className="w-4 h-4 rounded text-orange-600 focus:ring-orange-500 cursor-pointer accent-orange-600 align-middle"
                            />
                          </td>

                          {/* STATUS & PERINGATAN MERAH */}
                          <td className="py-3 px-4 align-top sticky left-10 bg-inherit z-10 whitespace-nowrap w-[140px] border-r border-slate-200/40">
                            {isDanger ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-600 text-white font-black rounded-lg text-[10px] uppercase shadow-2xs">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  {a.netProfit < 0 ? 'RUGI / BONCOS' : 'DI BAWAH MARGIN'}
                                </span>
                                <div className="text-[10px] text-red-700 font-extrabold block">
                                  {a.netProfit < 0 ? (
                                    <span>⚠️ Rugi {formatIDR(Math.abs(a.netProfit))} / pcs</span>
                                  ) : (
                                    <span>Margin {a.netMarginPercent.toFixed(1)}% &lt; Batas {marginThreshold}%</span>
                                  )}
                                </div>
                              </div>
                            ) : isSafe ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-lg text-[10px] uppercase border border-emerald-300">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  AMAN ({a.netMarginPercent.toFixed(1)}%)
                                </span>
                                <span className="text-[10px] text-emerald-700 block font-semibold">
                                  Laba {formatIDR(a.netProfit)} / pcs
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded-md text-[10px] uppercase border border-amber-300">
                                  <HelpCircle className="w-3 h-3 text-amber-600" />
                                  HPP Kosong
                                </span>
                                <span className="text-[9px] text-amber-700 block">Isi modal HPP</span>
                              </div>
                            )}
                          </td>

                          {/* SKU STOCK LIST (5 DIGIT) & KODE SHOPEE */}
                          <td className="py-3 px-3 align-top sticky left-[180px] bg-inherit z-10 whitespace-nowrap border-r border-slate-200/40">
                            {item.matchedProduct ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1 shadow-2xs">
                                    <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                                    {item.assignedSku || item.matchedProduct.sku}
                                  </span>
                                  {item.skuMatchSource === 'master_product_file' ? (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200" title="Dicocokkan otomatis melalui Kode Variasi di File 2 (Data Produk Shopee)">
                                      via File 2
                                    </span>
                                  ) : item.skuMatchSource === 'manual' ? (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                      Manual
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-slate-100 text-slate-600">
                                      5-Digit
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingSkuItem(item);
                                      setSkuPickerSearch(item.assignedSku || item.matchedProduct?.sku || '');
                                    }}
                                    className="text-[10px] text-slate-500 hover:text-indigo-600 font-semibold underline cursor-pointer ml-1"
                                    title="Ganti tautan SKU Stock List"
                                  >
                                    Ganti
                                  </button>
                                </div>
                                <div className="text-[10px] text-slate-500 font-medium truncate max-w-[170px]" title={item.matchedProduct.name}>
                                  Stock: <span className="text-slate-800 font-semibold">{item.matchedProduct.name}</span>
                                </div>
                                <div className="text-[9px] font-mono text-slate-400">
                                  Shopee: {skuCode}
                                </div>
                              </div>
                            ) : item.assignedSku ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 inline-flex items-center gap-1">
                                    <Database className="w-3 h-3 text-indigo-600 shrink-0" />
                                    {item.assignedSku}
                                  </span>
                                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                    Belum di Stock List
                                  </span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingSkuItem(item);
                                      setSkuPickerSearch(item.assignedSku || '');
                                    }}
                                    className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] rounded border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                  >
                                    <Link2 className="w-3 h-3 text-indigo-600" />
                                    Tautkan Stock List
                                  </button>
                                </div>
                                <div className="text-[9px] font-mono text-slate-400">
                                  Shopee: {skuCode}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <div>
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 inline-flex items-center gap-1">
                                    <HelpCircle className="w-3 h-3 text-amber-600 shrink-0" />
                                    SKU 5-Digit Belum Cocok
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingSkuItem(item);
                                    setSkuPickerSearch('');
                                  }}
                                  className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] rounded border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                >
                                  <Link2 className="w-3 h-3 text-indigo-600" />
                                  Hubungkan SKU 5-Digit
                                </button>
                                <div className="text-[9px] font-mono text-slate-400">
                                  Shopee: {skuCode}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* NAMA PRODUK & VARIASI */}
                          <td className="py-3 px-4 align-top sticky left-[360px] bg-inherit z-10 min-w-[220px] max-w-[320px] whitespace-normal border-r border-slate-200/40">
                            <div className="text-xs font-bold text-slate-900 leading-relaxed break-words whitespace-normal" title={item.productName}>
                              {item.productName}
                            </div>
                            {item.variationName && (
                              <div className="text-[11px] text-slate-500 font-medium break-words mt-1 leading-normal whitespace-normal" title={item.variationName}>
                                Variasi: <span className="font-semibold text-slate-700">{item.variationName}</span>
                              </div>
                            )}
                          </td>

                          {/* KOLOM TAMBAHAN 15 KOLOM SHOPEE */}
                          {viewMode === 'full_shopee' && (
                            <>
                              <td className="py-3 px-3 align-top font-mono text-slate-600 text-xs">
                                {item.productCode || '-'}
                              </td>
                              <td className="py-3 px-3 align-top text-[11px] text-slate-500 max-w-[150px] truncate" title={`${item.categoryL1} > ${item.categoryL2} > ${item.categoryL3}`}>
                                {item.categoryL3 || item.categoryL2 || item.categoryL1 || '-'}
                              </td>
                              <td className="py-3 px-2 text-right align-top font-mono text-slate-700 font-semibold">
                                {item.salesCount || 0}
                              </td>
                              <td className="py-3 px-2 text-right align-top font-mono text-xs">
                                <span className="text-slate-800 font-bold">{item.promoStock || item.stock}</span>
                                <span className="text-slate-400 text-[10px] block">/{item.stock}</span>
                              </td>
                              <td className="py-3 px-2 text-center align-top font-mono text-slate-600 text-xs">
                                {item.purchaseLimit > 0 ? item.purchaseLimit : 'Tanpa Batas'}
                              </td>
                            </>
                          )}

                          {/* HPP MODAL */}
                          <td className="py-3 px-3 text-right align-top">
                            {a.hasHpp ? (
                              <div className="font-mono font-bold text-xs text-slate-800">
                                {formatIDR(a.hpp)}
                              </div>
                            ) : (
                              <div className="flex items-center justify-end">
                                <input
                                  type="text"
                                  placeholder="Isi HPP"
                                  className="w-20 text-right p-1 text-xs font-mono font-bold bg-white border border-amber-300 rounded focus:ring-1 focus:ring-amber-500 outline-none"
                                  onBlur={e => {
                                    const val = Number(parseInput(e.target.value));
                                    if (val > 0) handleUpdateManualHpp(item.id, val);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      const val = Number(parseInput((e.target as HTMLInputElement).value));
                                      if (val > 0) handleUpdateManualHpp(item.id, val);
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </td>

                            {/* HARGA ECERAN */}
                          <td className="py-3 px-3 text-right font-mono align-top text-xs whitespace-nowrap bg-indigo-50/25 text-slate-800 border-l border-indigo-100">
                            {a.matchedProduct?.eceran ? (
                              <span className="font-bold text-indigo-950">{formatIDR(a.matchedProduct.eceran * (a.qtyMultiplier || 1))}</span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>

                          {/* HARGA GROSIR */}
                          <td className="py-3 px-3 text-right font-mono align-top text-xs whitespace-nowrap bg-indigo-50/25 text-slate-800">
                            {a.matchedProduct?.grosir ? (
                              <span className="font-bold text-indigo-950">{formatIDR(a.matchedProduct.grosir * (a.qtyMultiplier || 1))}</span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>

                          {/* HARGA PARTAI */}
                          <td className="py-3 px-3 text-right font-mono align-top text-xs whitespace-nowrap bg-indigo-50/25 text-slate-800 border-r border-indigo-100">
                            {a.matchedProduct?.partai ? (
                              <span className="font-bold text-indigo-950">{formatIDR(a.matchedProduct.partai * (a.qtyMultiplier || 1))}</span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>

                          {/* HARGA AWAL */}
                          <td className="py-3 px-3 text-right font-mono align-top text-slate-600 whitespace-nowrap">
                            <div className="flex flex-col items-end">
                              <span className="font-bold">{formatIDR(item.originalPrice)}</span>
                              <span className="text-[9px] text-slate-400 font-bold block mt-0.5">100%</span>
                            </div>
                          </td>

                          {/* KOLOM UTAMA YANG DIANALISA: REKOMENDASI HARGA DISKON SHOPEE */}
                          <td className="py-3 px-3 text-right align-top whitespace-nowrap bg-orange-50/50 border-x border-orange-200">
                            {item.shopeeRecommendedPrice > 0 ? (
                              <div className="flex flex-col items-end">
                                <span className={`font-mono font-black text-xs px-1.5 py-0.5 rounded ${
                                  isDanger
                                    ? 'bg-red-600 text-white shadow-2xs'
                                    : 'bg-orange-100 text-orange-950'
                                }`}>
                                  {formatIDR(item.shopeeRecommendedPrice)}
                                </span>
                                <span className="text-[9px] text-orange-700 font-bold block mt-0.5">
                                  {((item.shopeeRecommendedPrice / item.originalPrice) * 100).toFixed(1)}%
                                </span>
                                {isDanger && a.deficitPrice > 0 && (
                                  <span className="text-[9px] text-red-700 font-bold block mt-0.5">
                                    Defisit {formatIDR(a.deficitPrice)}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono">-</span>
                            )}
                          </td>

                          {/* POTONGAN MARKETPLACE (RP) */}
                          <td className="py-3 px-3 text-right font-mono text-slate-600 align-top whitespace-nowrap">
                            <div>-{formatIDR(a.totalPotonganRp)}</div>
                            <div className="text-[9px] text-slate-400">
                              {((a.totalPotonganRp / (a.evaluatedPrice || 1)) * 100).toFixed(1)}%
                            </div>
                          </td>

                          {/* NET PAYOUT */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 align-top whitespace-nowrap">
                            {formatIDR(a.netPayout)}
                          </td>

                          {/* LABA / RUGI BERSIH */}
                          <td className="py-3 px-3 text-right font-mono align-top whitespace-nowrap">
                            <div className={`font-black text-xs ${isDanger ? 'text-red-700' : 'text-emerald-700'}`}>
                              {a.netProfit >= 0 ? `+${formatIDR(a.netProfit)}` : `-${formatIDR(Math.abs(a.netProfit))}`}
                            </div>
                          </td>

                          {/* MARGIN BERSIH % */}
                          <td className="py-3 px-3 text-right font-mono align-top whitespace-nowrap">
                            <div className={`font-extrabold text-xs ${isDanger ? 'text-red-600' : 'text-emerald-600'}`}>
                              {a.netMarginPercent.toFixed(1)}%
                            </div>
                            <span className="text-[9px] text-slate-400">Target {marginThreshold}%</span>
                          </td>

                          {/* REKOMENDASI HARGA DISKON AMAN (MINIMAL AGAR TIDAK RUGI) */}
                          <td className="py-3 px-3 text-right align-top font-mono whitespace-nowrap bg-emerald-50/50 border-x border-emerald-200">
                            {a.minSafePromoPrice > 0 ? (
                              <div className="text-emerald-800 font-black text-xs bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300 inline-block">
                                {formatIDR(a.minSafePromoPrice)}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* HARGA DISKON (KOLOM HASIL REVISI YANG SIAP DIUPLOAD) */}
                          <td className="py-3 px-3 text-right align-top whitespace-nowrap">
                            <div className="flex flex-col items-end">
                              <span className="font-mono font-bold text-xs text-slate-900">
                                {formatIDR(item.promoPrice)}
                              </span>
                              {item.originalPrice > 0 && item.promoPrice > 0 && (
                                <span className="text-[9px] text-orange-700 font-bold block mt-0.5">
                                  {((item.promoPrice / item.originalPrice) * 100).toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </td>

                          {/* AKSI PENGAMANAN */}
                          <td className="py-3 px-4 text-center align-top whitespace-nowrap">
                            {isDanger && a.minSafePromoPrice > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleApplySafePriceToPromo(item.id)}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[10.5px] rounded-lg shadow-2xs transition-all flex items-center gap-1 mx-auto cursor-pointer active:scale-95 whitespace-nowrap"
                                title={`Ganti kolom Harga Diskon menjadi ${formatIDR(a.minSafePromoPrice)} agar tidak rugi seperti Rekomendasi Shopee`}
                              >
                                <Wand2 className="w-3 h-3" />
                                Pasang Harga Aman
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700 text-[10px] font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" />
                                Layak
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* FOOTER TABEL & SUMMARY */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              <div>
                Menampilkan <strong>{filteredItems.length}</strong> dari <strong>{items.length}</strong> SKU.
                {stats.dangerCount > 0 && (
                  <span className="text-red-700 font-bold ml-2">
                    ({stats.dangerCount} SKU ditandai merah karena kolom Rekomendasi Shopee menyebabkan rugi / di bawah margin {marginThreshold}%)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportShopeeReadyUpload}
                  className="px-3.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                  title="Unduh Excel 15 kolom dengan harga diskon yang sudah diamankan"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh File Siap Upload Shopee
                </button>
                <button
                  onClick={handleExportFullAnalysisXLSX}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" /> Unduh Laporan Analisa Lengkap
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL / POPUP PENGHUBUNG SKU 5-DIGIT KE STOCK LIST */}
      {editingSkuItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Header Modal */}
            <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-white/20 rounded-lg">
                  <Database className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Hubungkan ke SKU Stock List (5 Digit)</h3>
                  <p className="text-[11px] text-indigo-100">Pilih produk Stock List untuk mengisi modal HPP dan analisa otomatis</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSkuItem(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Item Shopee Yang Sedang Dihubungkan */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1.5">
                <div className="font-bold text-slate-900 text-sm leading-snug">{editingSkuItem.productName}</div>
                {editingSkuItem.variationName && (
                  <div className="text-slate-600">
                    Variasi: <span className="font-semibold text-slate-800">{editingSkuItem.variationName}</span>
                  </div>
                )}
                <div className="flex items-center gap-4 text-[11px] text-slate-500 pt-1.5 border-t border-slate-200 font-mono flex-wrap">
                  <span>Kode Shopee: <strong>{editingSkuItem.variationCode || editingSkuItem.productCode || '-'}</strong></span>
                  <span>Harga Awal: <strong>{formatIDR(editingSkuItem.originalPrice)}</strong></span>
                  {editingSkuItem.shopeeRecommendedPrice > 0 && (
                    <span className="text-orange-700">
                      Rekomendasi Diskon: <strong>{formatIDR(editingSkuItem.shopeeRecommendedPrice)}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Form Input Pencarian */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Cari SKU 5 Digit (misal: 03309) atau Nama Produk di Stock List:
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    value={skuPickerSearch}
                    onChange={e => setSkuPickerSearch(e.target.value)}
                    placeholder="Ketik 5 digit SKU seperti 03309 atau nama produk..."
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Daftar Pilihan Produk Stock List */}
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-slate-50/50">
                {filteredStockList.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Tidak ditemukan produk Stock List yang cocok dengan &quot;{skuPickerSearch}&quot;.
                  </div>
                ) : (
                  filteredStockList.map(prod => (
                    <div
                      key={prod.sku}
                      onClick={() => handleAssignSkuToItem(editingSkuItem.id, prod.sku, true)}
                      className="p-3 hover:bg-indigo-50/80 cursor-pointer flex items-center justify-between transition-colors group"
                    >
                      <div className="space-y-1 pr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black px-2 py-0.5 bg-indigo-100 group-hover:bg-indigo-600 text-indigo-900 group-hover:text-white rounded border border-indigo-200 transition-colors shadow-2xs">
                            {prod.sku}
                          </span>
                          <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-950">
                            {prod.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-3">
                          <span className="text-emerald-700 font-semibold">HPP: {formatIDR(prod.hpp)}</span>
                          <span>Eceran: {formatIDR(prod.eceran)}</span>
                          <span>Grosir: {formatIDR(prod.grosir)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="px-2.5 py-1.5 bg-indigo-600 group-hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-2xs transition-all shrink-0 cursor-pointer flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Pilih SKU
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="text-[11px] text-slate-600 bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex items-start gap-1.5 leading-relaxed">
                <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Memilih SKU 5 digit akan otomatis menautkan HPP modal dari Stock List dan menghitung margin bersih. Pemetaan ini juga otomatis disimpan dan diterapkan untuk item sejenis lainnya.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
