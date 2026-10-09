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
  Lightbulb
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, Fees } from '../types';
import { formatIDR, formatInput, parseInput, sanitizeSku } from '../utils/helpers';

/**
 * Representasi 1 baris item promo dengan 15 kolom standar file ekspor Shopee.
 * Sesuai permintaan pengguna:
 * - Baris data dimulai dari baris ke-4
 * - Harga yang dianalisa adalah kolom 'Rekomendasi Harga Diskon' agar tidak rugi
 *   ketika dipotong biaya % dan biaya tetap.
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
  matchedProduct?: Product;       // Produk yang cocok dari database AIO
  originalRawRow?: any[];         // Baris mentah dari file Excel
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
  const [showFeeSettings, setShowFeeSettings] = useState<boolean>(true);
  const [includeFixedFees, setIncludeFixedFees] = useState<boolean>(true);
  const [includePromoFees, setIncludePromoFees] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'compact' | 'full_shopee'>('compact');

  // Data States
  const [fileName, setFileName] = useState<string | null>(null);
  const [items, setItems] = useState<PromoItemRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [detectedHeaderInfo, setDetectedHeaderInfo] = useState<string | null>(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'danger' | 'safe' | 'missingHpp'>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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
    });
    return map;
  }, [productList]);

  const findProductBySkuOrName = (rawSku: string, rawName: string): Product | undefined => {
    if (rawSku) {
      const clean = sanitizeSku(rawSku).toLowerCase().trim();
      if (productSkuMap.has(clean)) return productSkuMap.get(clean);

      const noZero = clean.replace(/^0+/, '');
      if (noZero && productSkuMap.has(noZero)) return productSkuMap.get(noZero);

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
    const targetSku = item.variationCode || item.productCode || item.variationSku || item.parentSku;
    const matched = item.matchedProduct || findProductBySkuOrName(targetSku, item.productName);

    // HPP / Modal Acuan
    let hpp = 0;
    if (item.manualHpp !== undefined && item.manualHpp > 0) {
      hpp = item.manualHpp;
    } else if (matched) {
      if (hppReference === 'eceran') hpp = matched.eceran || matched.hpp;
      else if (hppReference === 'grosir') hpp = matched.grosir || matched.hpp;
      else if (hppReference === 'partai') hpp = matched.partai || matched.hpp;
      else hpp = matched.hpp;
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
      shopeeNetProfit
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
          throw new Error('File Excel kosong atau tidak terbaca.');
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
          // Cari baris yang punya paling banyak kolom string tidak kosong di antara baris 0 s/d 4
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
          } else {
            // Default ke baris ke-3 (index 2) jika ada >= 3 baris, atau baris ke-1 (index 0)
            headerRowIdx = rows.length >= 3 ? 2 : 0;
          }
        }

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

        // Pemetaan 15 Kolom Resmi Shopee
        const colNamaProduk = findColIdx(['nama produk', 'product name', 'et_title_product_name', 'namaproduk'], 0);
        const colKodeProduk = findColIdx(['kode produk', 'product code', 'parent sku', 'sku induk', 'id produk', 'kodeproduk'], 1);
        const colNamaVariasi = findColIdx(['nama variasi', 'variation name', 'variasi', 'et_title_variation_name', 'namavariasi'], 2);
        const colKodeVariasi = findColIdx(['kode variasi', 'variation sku', 'sku variasi', 'sku', 'kode sku', 'kodevariasi'], 3);
        const colKatL1 = findColIdx(['kategori shopee l1', 'kategori l1', 'category l1', 'l1'], 4);
        const colKatL2 = findColIdx(['kategori shopee l2', 'kategori l2', 'category l2', 'l2'], 5);
        const colKatL3 = findColIdx(['kategori shopee l3', 'kategori l3', 'category l3', 'l3'], 6);
        const colPenjualan = findColIdx(['penjualan', 'total penjualan', 'sales', 'terjual'], 7);
        const colHargaAwal = findColIdx(['harga awal', 'harga normal', 'harga asli', 'original price', 'hargaawal'], 8);
        const colHargaSaatIni = findColIdx(['harga saat ini', 'current price', 'harga aktif', 'harga sekarang', 'hargasaatini'], 9);
        const colHargaDiskon = findColIdx(['harga diskon', 'discount price', 'promo price', 'harga promo', 'hargadiskon'], 10);
        const colRekomendasiDiskon = findColIdx([
          'rekomendasi harga diskon',
          'rekomendasi harga',
          'recommended discount price',
          'rekomendasi diskon',
          'rekomendasihargadiskon',
          'rekomendasi'
        ], 11);
        const colStok = findColIdx(['stok', 'total stok', 'stock'], 12);
        const colStokPromo = findColIdx(['stok promo', 'promo stock', 'stok promosi', 'stokpromo'], 13);
        const colBatasBeli = findColIdx(['batas pembelian', 'purchase limit', 'maks pembelian', 'limit beli', 'bataspembelian'], 14);

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

          // Pencocokan ke database produk AIO menggunakan Kode Variasi (SKU)
          const targetSku = variationCode || productCode;
          const matched = findProductBySkuOrName(targetSku, productName);

          parsedItems.push({
            id: `row-${r}-${targetSku || Math.random()}`,
            productName: productName || (matched ? matched.name : targetSku ? `Produk ${targetSku}` : `Item Baris ${r + 1}`),
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

            const targetSku = variationCode || productCode;
            const matched = findProductBySkuOrName(targetSku, productName);

            parsedItems.push({
              id: `fallback-row-${r}-${targetSku || Math.random()}`,
              productName: productName || (matched ? matched.name : targetSku ? `Produk ${targetSku}` : `Item Baris ${r + 1}`),
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
              originalRawRow: row
            });
          }
        }

        if (parsedItems.length === 0) {
          throw new Error(
            `Tidak ditemukan baris data produk yang valid pada lembar kerja "${targetSheetName}". Pastikan file berisi kolom Nama Produk / Kode SKU dan nilai harga, atau coba sesuaikan pilihan 'Baris Data'.`
          );
        }

        setDetectedHeaderInfo(
          `Berhasil membaca ${parsedItems.length} SKU dari sheet "${targetSheetName}". Header terdeteksi di baris ke-${headerRowIdx + 1}, data dimulai baris ke-${effectiveStartIdx + 1}.`
        );

        setItems(parsedItems);
        showToast(`Berhasil membaca ${parsedItems.length} SKU dari file "${file.name}"!`);
      } catch (err: any) {
        console.error('Error reading excel:', err);
        setParseError(err?.message || 'Gagal memproses file Excel.');
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
        matchedProduct: sku03309
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
        }
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
        }
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
        }
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
        discountPercent: 11.4
      });

      setItems(demoList);
      setIsProcessing(false);
      showToast('Data contoh promosi Shopee 15 kolom berhasil dimuat!');
    }, 350);
  };

  /**
   * Unduh File Template Shopee Persis 15 Kolom
   * Baris 1: Judul
   * Baris 2: Catatan (Mulai baris ke-4)
   * Baris 3: 15 Kolom Shopee
   * Baris 4 dst: Data
   */
  const handleDownloadTemplate = () => {
    const templateData: any[][] = [
      ['TEMPLATE RESMI EKSPOR PROMOSI DISKON SHOPEE (STAR+)'],
      ['Petunjuk: Baris data resmi dimulai dari baris ke-4. Masukkan Rekomendasi Harga Diskon dan Harga Diskon yang akan diajukan.'],
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
    XLSX.utils.book_append_sheet(wb, ws, 'Template_Promo_Shopee');
    XLSX.writeFile(wb, 'Template_Ekspor_Promosi_Shopee_15Kolom.xlsx');
    showToast('Template Excel 15 Kolom Shopee berhasil diunduh!');
  };

  // Eksekusi Analisa Lengkap pada seluruh item
  const analyzedItems = useMemo(() => {
    return items.map(item => {
      const analysis = calculateItemAnalysis(item);
      return {
        ...item,
        analysis
      };
    });
  }, [items, totalPercentageRate, totalFixedFeesPerOrder, marginThreshold, hppReference, productList, analyzedTarget]);

  // Ringkasan Statistik KPI
  const stats = useMemo(() => {
    const total = analyzedItems.length;
    let dangerCount = 0;
    let safeCount = 0;
    let missingHppCount = 0;
    let totalPotentialLoss = 0;
    let totalDeficit = 0;

    analyzedItems.forEach(item => {
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
      total,
      dangerCount,
      safeCount,
      missingHppCount,
      totalPotentialLoss,
      totalDeficit
    };
  }, [analyzedItems]);

  // Filter & Search Items
  const filteredItems = useMemo(() => {
    return analyzedItems.filter(item => {
      if (statusFilter === 'danger' && item.analysis.status !== 'danger') return false;
      if (statusFilter === 'safe' && item.analysis.status !== 'safe') return false;
      if (statusFilter === 'missingHpp' && item.analysis.status !== 'missingHpp') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const sku = (item.variationCode || item.productCode || item.variationSku || '').toLowerCase();
        const name = (item.productName || '').toLowerCase();
        const cat = (item.categoryL3 || item.categoryL2 || '').toLowerCase();
        return sku.includes(q) || name.includes(q) || cat.includes(q);
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

  /**
   * Export File Format Shopee Siap Upload (15 Kolom Persis)
   * Kolom "Harga Diskon" berisi harga aman yang sudah disesuaikan,
   * siap diupload kembali ke Shopee Seller Centre!
   */
  const handleExportShopeeReadyUpload = () => {
    if (analyzedItems.length === 0) {
      alert('Belum ada data untuk diekspor.');
      return;
    }

    const rowsOut: any[][] = [];
    rowsOut.push(['DAFTAR PENGAJUAN PROMOSI DISKON SHOPEE (HASIL REVISI AMAN)']);
    rowsOut.push(['Catatan: File hasil revisi siap diupload kembali ke Seller Centre Shopee. Baris data mulai dari baris ke-4.']);
    rowsOut.push([
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

    analyzedItems.forEach(item => {
      rowsOut.push([
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

    const ws = XLSX.utils.aoa_to_sheet(rowsOut);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Shopee_Promo_Revisi');
    const outName = `Shopee_Promo_Revisi_Aman_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, outName);
    showToast(`Berhasil mengunduh ${outName} dengan format 15 kolom Shopee siap upload!`);
  };

  /**
   * Export Laporan Analisa Lengkap ke XLSX
   */
  const handleExportFullAnalysisXLSX = () => {
    if (analyzedItems.length === 0) {
      alert('Belum ada data untuk diekspor.');
      return;
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

    analyzedItems.forEach(item => {
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
    showToast(`Berhasil mengekspor laporan analisa lengkap ke ${outName}!`);
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

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleLoadDemoData}
              className="px-4 py-2.5 bg-white text-orange-700 hover:bg-orange-50 font-bold rounded-xl text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-orange-600" /> Coba Contoh Promo (15 Kolom)
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="px-4 py-2.5 bg-orange-700/60 hover:bg-orange-700/80 text-white border border-white/20 font-bold rounded-xl text-xs sm:text-sm shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Download className="w-4 h-4" /> Download Template Excel 15 Kolom
            </button>
          </div>
        </div>
      </div>

      {/* UPLOAD & FILE DROPZONE */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-orange-600" />
              1. Upload File Excel Promosi Shopee (.xlsx / .xls)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Membaca otomatis 15 kolom resmi promosi Shopee dengan data dimulai dari <strong>baris ke-4</strong>.
            </p>
          </div>

          {/* Opsi Target Analisa & Baris Awal */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Pemilih Kolom yang Dianalisa */}
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 px-3 py-1 rounded-xl">
              <span className="text-xs font-bold text-orange-950">Fokus Analisa:</span>
              <button
                type="button"
                onClick={() => setAnalyzedTarget('rekomendasi')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  analyzedTarget === 'rekomendasi'
                    ? 'bg-orange-600 text-white shadow-2xs'
                    : 'text-orange-800 hover:bg-orange-100'
                }`}
              >
                ★ Rekomendasi Diskon Shopee
              </button>
              <button
                type="button"
                onClick={() => setAnalyzedTarget('diskon')}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  analyzedTarget === 'diskon'
                    ? 'bg-orange-600 text-white shadow-2xs'
                    : 'text-orange-800 hover:bg-orange-100'
                }`}
              >
                Harga Diskon Diajukan
              </button>
            </div>

            {/* Konfigurasi Baris Data Dimulai */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-600">Baris Data:</span>
              <select
                value={startDataRowNumber}
                onChange={e => setStartDataRowNumber(Number(e.target.value))}
                className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-bold font-mono text-orange-700 outline-none"
              >
                <option value={4}>Mulai Baris ke-4 (Standar)</option>
                <option value={2}>Mulai Baris ke-2</option>
                <option value={3}>Mulai Baris ke-3</option>
                <option value={5}>Mulai Baris ke-5</option>
              </select>
            </div>

            {fileName && (
              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 px-3 py-1 rounded-xl">
                <FileSpreadsheet className="w-4 h-4 text-orange-600" />
                <span className="text-xs font-bold text-orange-900 truncate max-w-[160px]">{fileName}</span>
                <button
                  onClick={() => {
                    setItems([]);
                    setFileName(null);
                    setDetectedHeaderInfo(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                  title="Hapus file"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Struktur 15 Kolom dengan highlight pada Kolom ke-12 Rekomendasi Harga Diskon */}
        <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
            <span className="flex items-center gap-1.5">
              <Info className="w-4 h-4 text-orange-600 shrink-0" />
              15 Kolom File Excel Shopee (Baris data dimulai dari baris ke-4):
            </span>
            <span className="text-[11px] text-orange-700 font-bold bg-orange-100 px-2 py-0.5 rounded">
              Kolom #12: &quot;Rekomendasi Harga Diskon&quot; dianalisa terhadap biaya Star+ &amp; HPP
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 text-[11px] text-slate-600 font-medium">
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">1. Nama Produk</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">2. Kode Produk</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">3. Nama Variasi</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono text-orange-700 font-bold">4. Kode Variasi (SKU)</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">5. Kategori Shopee L1</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">6. Kategori Shopee L2</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">7. Kategori Shopee L3</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">8. Penjualan</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">9. Harga Awal</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">10. Harga Saat Ini</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono text-slate-800">11. Harga Diskon</span>
            <span className="bg-orange-100 text-orange-950 font-bold px-2 py-1 rounded border border-orange-300 font-mono ring-1 ring-orange-400">
              ★ 12. Rekomendasi Diskon
            </span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">13. Stok</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">14. Stok Promo</span>
            <span className="bg-white px-2 py-1 rounded border border-slate-200 font-mono">15. Batas Pembelian</span>
          </div>
        </div>

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
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isProcessing
                ? 'bg-slate-50 border-slate-300 opacity-60'
                : 'bg-slate-50/60 hover:bg-orange-50/40 border-slate-300 hover:border-orange-400'
            }`}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3">
                <RefreshCw className="w-8 h-8 text-orange-600 animate-spin" />
                <span className="text-sm font-bold text-slate-700">Menganalisa Rekomendasi Diskon Shopee terhadap biaya potongan...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <div className="p-3 bg-orange-100 text-orange-600 rounded-2xl shadow-inner">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-sm font-bold text-slate-800">
                    Klik untuk pilih file Excel Shopee (.xlsx) atau seret (drag & drop) ke sini
                  </span>
                  <p className="text-xs text-slate-400 mt-1">
                    File ekspor Promosi Saya / Diskon Toko / Flash Sale / Campaign Shopee
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] font-semibold text-orange-700 bg-orange-100/70 px-2.5 py-0.5 rounded-full">
                    Data dimulai dari Baris ke-{startDataRowNumber} • Menganalisa Kolom Rekomendasi Harga Diskon
                  </span>
                </div>
              </div>
            )}
          </label>

          {detectedHeaderInfo && (
            <div className="mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{detectedHeaderInfo}</span>
            </div>
          )}

          {parseError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>
      </div>

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
      {items.length > 0 && (
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

          {/* TABLE CONTAINER */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* TOOLBAR TABEL */}
            <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Filter Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  Semua SKU ({stats.total})
                </button>
                <button
                  onClick={() => setStatusFilter('danger')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'danger'
                      ? 'bg-red-600 text-white shadow-2xs'
                      : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                  }`}
                >
                  🔴 Peringatan Merah ({stats.dangerCount})
                </button>
                <button
                  onClick={() => setStatusFilter('safe')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'safe'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  🟢 Aman ({stats.safeCount})
                </button>
                {stats.missingHppCount > 0 && (
                  <button
                    onClick={() => setStatusFilter('missingHpp')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                      statusFilter === 'missingHpp'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                    }`}
                  >
                    ⚪ Belum Ada HPP ({stats.missingHppCount})
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
                <button
                  onClick={handleExportShopeeReadyUpload}
                  className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                  title="Unduh Excel 15 Kolom dengan harga diskon yang sudah diamankan untuk diupload ke Shopee"
                >
                  <Download className="w-3.5 h-3.5" /> Siap Upload Shopee
                </button>
                <button
                  onClick={handleExportFullAnalysisXLSX}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
                  title="Unduh laporan analisa lengkap margin & potongan marketplace"
                >
                  <Download className="w-3.5 h-3.5" /> Laporan Analisa
                </button>
              </div>
            </div>

            {/* TABEL KONTEN */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/90 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 whitespace-nowrap">
                    <th className="py-3 px-4 sticky left-0 bg-slate-50 z-10">Status Kelayakan</th>
                    <th className="py-3 px-3">Kode Variasi (SKU)</th>
                    <th className="py-3 px-4">Nama Produk & Variasi</th>

                    {viewMode === 'full_shopee' && (
                      <>
                        <th className="py-3 px-3">Kode Produk</th>
                        <th className="py-3 px-3">Kategori L1 - L3</th>
                        <th className="py-3 px-2 text-right">Penjualan</th>
                        <th className="py-3 px-2 text-right">Stok / Promo</th>
                        <th className="py-3 px-2 text-center">Batas Beli</th>
                      </>
                    )}

                    <th className="py-3 px-3 text-right">HPP Modal</th>
                    <th className="py-3 px-3 text-right">Harga Awal</th>

                    {/* KOLOM UTAMA YANG DIANALISA: REKOMENDASI HARGA DISKON */}
                    <th className="py-3 px-3 text-right bg-orange-100/70 text-orange-950 font-black border-x border-orange-200">
                      ★ Rekomendasi Diskon Shopee
                    </th>

                    <th className="py-3 px-3 text-right">Potongan MP (% + Rp)</th>
                    <th className="py-3 px-3 text-right">Net Payout</th>
                    <th className="py-3 px-3 text-right">Laba / Rugi Bersih</th>
                    <th className="py-3 px-3 text-right">Margin Bersih %</th>

                    {/* KOLOM HARGA DISKON AMAN AGAR TIDAK RUGI */}
                    <th className="py-3 px-3 text-right bg-emerald-50 text-emerald-950 font-black border-x border-emerald-200">
                      Rekomendasi Harga Aman (Min)
                    </th>

                    {/* KOLOM HARGA DISKON PENGAJUAN FINAL */}
                    <th className="py-3 px-3 text-right font-bold text-slate-900">
                      Harga Diskon (Upload)
                    </th>

                    <th className="py-3 px-4 text-center">Aksi Pengamanan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={viewMode === 'full_shopee' ? 18 : 13} className="py-12 text-center text-slate-400">
                        Tidak ada data SKU yang sesuai dengan filter atau pencarian saat ini.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map(item => {
                      const a = item.analysis;
                      const isDanger = a.status === 'danger';
                      const isSafe = a.status === 'safe';
                      const isMissingHpp = a.status === 'missingHpp';
                      const skuCode = item.variationCode || item.productCode || item.variationSku || '-';

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            isDanger
                              ? 'bg-red-50/80 hover:bg-red-100/70 text-red-950 font-semibold'
                              : isMissingHpp
                              ? 'bg-amber-50/40 hover:bg-amber-50 text-slate-800'
                              : 'hover:bg-slate-50/80 text-slate-800'
                          }`}
                        >
                          {/* STATUS & PERINGATAN MERAH */}
                          <td className="py-3 px-4 align-top sticky left-0 bg-inherit z-10 whitespace-nowrap">
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

                          {/* KODE VARIASI (SKU) */}
                          <td className="py-3 px-3 align-top whitespace-nowrap font-mono">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                              isDanger ? 'bg-red-200/90 text-red-950 border border-red-300' : 'bg-slate-200/80 text-slate-800'
                            }`}>
                              {skuCode}
                            </span>
                          </td>

                          {/* NAMA PRODUK & VARIASI */}
                          <td className="py-3 px-4 align-top max-w-[220px]">
                            <div className="text-xs font-bold text-slate-900 truncate" title={item.productName}>
                              {item.productName}
                            </div>
                            {item.variationName && (
                              <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
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

                          {/* HARGA AWAL */}
                          <td className="py-3 px-3 text-right font-mono align-top text-slate-600 whitespace-nowrap">
                            {formatIDR(item.originalPrice)}
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
                                <span className="text-[10px] text-orange-700 font-semibold">
                                  Diskon {(((item.originalPrice - item.promoPrice) / item.originalPrice) * 100).toFixed(0)}%
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
    </div>
  );
}
