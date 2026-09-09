import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Layers,
  Search,
  Check,
  Copy,
  Plus,
  Trash2,
  AlertTriangle,
  HelpCircle,
  TrendingDown,
  Percent,
  DollarSign,
  Download,
  Info,
  Package,
  Store,
  ArrowRight,
  ExternalLink,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Calculator,
  Box,
  FileSpreadsheet,
  RefreshCw,
  X,
  ShoppingCart,
  ListPlus,
  CheckCheck,
  BookmarkCheck,
  History,
  Edit3,
  ShieldAlert
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, Fees } from '../types';
import { formatIDR, formatInput, parseInput, sanitizeSku } from '../utils/helpers';
import {
  appendWholesaleToSpreadsheet,
  batchAppendWholesaleToSpreadsheet,
  fetchSpreadsheetExistingSkus,
  getSavedSkusFromStorage,
  recordSavedSkus,
  TARGET_SPREADSHEET_ID
} from '../services/googleSheetsService';
import GoogleAuthButton from './GoogleAuthButton';
import FirebaseAuthDomainModal from './FirebaseAuthDomainModal';

export interface WholesaleTier {
  id: string;
  minQty: number;
  maxQty: number | null; // null represents unbounded (e.g., "12+" or "50+")
  price: number;
}

export interface WholesaleBasketItem {
  id: string;
  sku: string;
  productName: string;
  unit: string;
  normalPrice: number;
  tiers: WholesaleTier[];
  addedAt: string;
}

const BASKET_STORAGE_KEY = 'marp_wholesale_basket';

interface WholesaleTabProps {
  productList: Product[];
  fees: Fees;
  setSelectedSku?: (sku: string) => void;
  setProduct?: React.Dispatch<React.SetStateAction<{ hpp: number; basePrice: number }>>;
  setActiveView?: (view: any) => void;
  rounding?: string;
}

export default function WholesaleTab({
  productList,
  fees,
  setSelectedSku,
  setProduct,
  setActiveView,
  rounding = '1000'
}: WholesaleTabProps) {
  // --- STATE: Selected Product & Manual Inputs ---
  const [selectedSku, setSelectedSkuInternal] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showDropdown, setShowDropdown] = useState<boolean>(false);

  // Prices & Costs
  const [manualNormalPrice, setManualNormalPrice] = useState<string>('');

  // Rumus Harga Jual Satuan Otomatis: (Harga Eceran + 28% + 3.000)
  const calculateAutoPrice = (eceranVal: number, roundOpt = rounding) => {
    const raw = eceranVal + (eceranVal * 0.28) + 3000;
    if (roundOpt === '1000') return Math.round(raw / 1000) * 1000;
    if (roundOpt === '500') return Math.round(raw / 500) * 500;
    if (roundOpt === '100') return Math.round(raw / 100) * 100;
    return Math.round(raw);
  };

  // --- BIAYA PENJUAL SHOPEE STAR+ (SESUAI SPESIFIKASI USER) ---
  // Biaya Persentase (%):
  const [adminFeePercent, setAdminFeePercent] = useState<number>(11.0); // Biaya Admin 11%
  const [insurancePercent, setInsurancePercent] = useState<number>(0.5); // Asuransi Pengiriman 0.5%
  const [amsPercent, setAmsPercent] = useState<number>(1.0); // AMS 1%
  
  // Program Hemat Biaya Kirim (Rp 510 flat per order/pesanan)
  const [includeHematKirim, setIncludeHematKirim] = useState<boolean>(true);
  const [hematBiayaKirimNominal, setHematBiayaKirimNominal] = useState<number>(510); // Program Hemat Biaya Kirim : 510

  // Biaya Tetap (Rp Nominal per Order / Paket):
  const [marketplaceProcFee, setMarketplaceProcFee] = useState<number>(1250); // Biaya Proses Pesanan : 1250
  const [jubelioProcFee, setJubelioProcFee] = useState<number>(350); // Biaya Jubelio : 350
  const [packingFee, setPackingFee] = useState<number>(1000); // Biaya Packing : 1000

  // Pilihan Alokasi Biaya Tetap:
  // 'per_order': Biaya tetap dihitung 1x per pesanan pengiriman (ekonomi skala partai besar)
  // 'per_item': Biaya tetap dibebankan flat per pcs
  const [fixedFeeMode, setFixedFeeMode] = useState<'per_order' | 'per_item'>('per_order');

  // Toast / copy feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');

  // Google Sheets integration state
  const [isSavingToSheets, setIsSavingToSheets] = useState<boolean>(false);
  const [sheetsModalData, setSheetsModalData] = useState<{
    show: boolean;
    success?: boolean;
    message?: string;
    url?: string;
    rowPreview?: string[];
    rowNumber?: number;
  } | null>(null);

  // SKUs that have been saved to spreadsheet / previously created
  const [savedSkus, setSavedSkus] = useState<string[]>(() => getSavedSkusFromStorage());

  // Wholesale Basket state (Antrean / Keranjang Grosir)
  const [wholesaleBasket, setWholesaleBasket] = useState<WholesaleBasketItem[]>(() => {
    try {
      const raw = localStorage.getItem(BASKET_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [isBasketModalOpen, setIsBasketModalOpen] = useState<boolean>(false);
  const [isSavingBatch, setIsSavingBatch] = useState<boolean>(false);
  const [showDomainModal, setShowDomainModal] = useState<boolean>(false);
  const [batchResultModal, setBatchResultModal] = useState<{
    show: boolean;
    success?: boolean;
    message?: string;
    url?: string;
    startRow?: number;
    endRow?: number;
    count?: number;
    savedSkus?: string[];
  } | null>(null);

  // Sync saved SKUs from Google Spreadsheet on mount
  useEffect(() => {
    fetchSpreadsheetExistingSkus().then(skus => {
      if (skus && skus.length > 0) {
        setSavedSkus(skus);
      }
    });
  }, []);

  // Sync basket to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(BASKET_STORAGE_KEY, JSON.stringify(wholesaleBasket));
    } catch (e) {
      console.warn('Failed to save basket to localStorage', e);
    }
  }, [wholesaleBasket]);

  // Satuan / Unit Produk (pcs, rim, roll, dll)
  const [selectedUnit, setSelectedUnit] = useState<string>('pcs');

  // Selected product object from catalog
  const activeProduct = useMemo(() => {
    if (!selectedSku) return null;
    return productList.find(p => sanitizeSku(p.sku) === sanitizeSku(selectedSku)) || null;
  }, [productList, selectedSku]);

  // Satuan aktif (mengutamakan pilihan manual atau unit dari katalog produk)
  const activeUnit = useMemo(() => {
    if (selectedUnit) return selectedUnit;
    if (activeProduct?.unit) return activeProduct.unit;
    return 'pcs';
  }, [selectedUnit, activeProduct]);

  // Harga Eceran Acuan (dari katalog produk terpilih atau default 100.000)
  const activeEceran = useMemo(() => {
    if (activeProduct) {
      return activeProduct.eceran || 0;
    }
    return 100000;
  }, [activeProduct]);

  // Harga Jual Satuan Otomatis: (Harga Eceran + 28% + 3.000)
  const autoCalculatedPrice = useMemo(() => {
    return calculateAutoPrice(activeEceran, rounding);
  }, [activeEceran, rounding]);

  // Active Normal Retail Selling Price (Otomatis Eceran + 28% + 3.000 jika belum diubah manual)
  const normalPrice = useMemo(() => {
    if (manualNormalPrice !== '') {
      return Number(manualNormalPrice) || 0;
    }
    return autoCalculatedPrice;
  }, [manualNormalPrice, autoCalculatedPrice]);

  // Active Base HPP dari katalog produk
  const baseHpp = useMemo(() => {
    if (activeProduct) {
      return activeProduct.hpp || 0;
    }
    return 60000; // default baseline demo
  }, [activeProduct]);

  // HPP Efektif sama dengan HPP Produk
  const effectiveHpp = baseHpp;

  // Total Shopee Percentage Rate (Admin 11% + Asuransi 0.5% + AMS 1% = 12.5%)
  const totalPercentageRate = useMemo(() => {
    return (Number(adminFeePercent) || 0) + (Number(insurancePercent) || 0) + (Number(amsPercent) || 0);
  }, [adminFeePercent, insurancePercent, amsPercent]);

  // Total Biaya Tetap per Pesanan (Biaya Proses 1250 + Jubelio 350 + Packing 1000 + Hemat Kirim 510 = Rp 3.110)
  const totalFixedFeesPerOrder = useMemo(() => {
    let sum = (Number(marketplaceProcFee) || 0) + (Number(jubelioProcFee) || 0) + (Number(packingFee) || 0);
    if (includeHematKirim) {
      sum += (Number(hematBiayaKirimNominal) || 0);
    }
    return sum;
  }, [marketplaceProcFee, jubelioProcFee, packingFee, includeHematKirim, hematBiayaKirimNominal]);

  // Toast notification helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3500);
  };

  // Copy helper
  const handleCopy = (text: string | number, key: string) => {
    navigator.clipboard.writeText(String(text));
    setCopiedKey(key);
    showToast(`Nilai ${text} berhasil disalin ke clipboard!`);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // Rounding helper
  const applyRound = (val: number) => {
    if (rounding === '1000') return Math.round(val / 1000) * 1000;
    if (rounding === '100') return Math.round(val / 100) * 100;
    return Math.round(val);
  };

  // Tingkat diskon rekomendasi standar sesuai tingkatan tier Shopee
  // Tier 1: Diskon 5%
  // Tier 2: Diskon 10%
  // Tier 3: Diskon 15%
  // Tier 4: Diskon 20%
  // Tier 5: Diskon 25%
  const getTierDiscountPercent = (tierIndex: number): number => {
    const defaultDiscounts = [5, 10, 15, 20, 25];
    return defaultDiscounts[tierIndex] !== undefined ? defaultDiscounts[tierIndex] : Math.min(35, 5 + tierIndex * 5);
  };

  // Helper kalkulasi harga grosir rekomendasi otomatis sesuai tingkatannya
  const getRecommendedTierPrice = (tierIndex: number, basePrice: number = normalPrice): number => {
    if (!basePrice || basePrice <= 0) return 0;
    const discount = getTierDiscountPercent(tierIndex);
    const rawPrice = basePrice * (1 - discount / 100);
    const rounded = applyRound(rawPrice);
    if (baseHpp > 0) {
      return Math.max(baseHpp, rounded);
    }
    return rounded;
  };

  // --- STATE: Wholesale Tiers (1 to 5 tiers) ---
  // Otomatis terisi harga rekomendasi sesuai tingkatannya
  const [tiers, setTiers] = useState<WholesaleTier[]>(() => {
    const defaultBase = 131000;
    return [
      { id: '1', minQty: 3, maxQty: 5, price: Math.round((defaultBase * 0.95) / 1000) * 1000 },
      { id: '2', minQty: 6, maxQty: 11, price: Math.round((defaultBase * 0.90) / 1000) * 1000 },
      { id: '3', minQty: 12, maxQty: 100, price: Math.round((defaultBase * 0.85) / 1000) * 1000 }
    ];
  });

  // Terapkan harga rekomendasi sesuai tingkatannya ke semua tier
  const applyRecommendedPrices = (basePrice: number = normalPrice) => {
    const targetBase = basePrice > 0 ? basePrice : (normalPrice > 0 ? normalPrice : 100000);
    setTiers(prev => prev.map((t, idx) => ({
      ...t,
      price: getRecommendedTierPrice(idx, targetBase)
    })));
    showToast('Harga rekomendasi sesuai tingkatan tier otomatis diterapkan ke semua tier');
  };

  // Sinkronisasi otomatis harga rekomendasi tier saat normalPrice berubah
  const prevNormalPriceRef = useRef<number>(normalPrice);
  useEffect(() => {
    if (prevNormalPriceRef.current !== normalPrice && normalPrice > 0) {
      prevNormalPriceRef.current = normalPrice;
      setTiers(prev => prev.map((t, idx) => ({
        ...t,
        price: getRecommendedTierPrice(idx, normalPrice)
      })));
    }
  }, [normalPrice, baseHpp, rounding]);

  // Apply auto-preset configurations
  const applyPreset = (presetName: 'reseller' | 'dozen' | 'bulk' | 'margin') => {
    const base = normalPrice > 0 ? normalPrice : 100000;

    if (presetName === 'reseller') {
      // 3 Tiers: 3-5 pcs (-5%), 6-11 pcs (-10%), 12-100 pcs (-15%)
      const p1 = applyRound(base * 0.95);
      const p2 = applyRound(base * 0.90);
      const p3 = applyRound(base * 0.85);
      setTiers([
        { id: '1', minQty: 3, maxQty: 5, price: p1 },
        { id: '2', minQty: 6, maxQty: 11, price: p2 },
        { id: '3', minQty: 12, maxQty: 100, price: p3 }
      ]);
      showToast('Skema Reseller Standar (3 Tier: 12-100) diterapkan');
    } else if (presetName === 'dozen') {
      // 3 Tiers Lusinan: 6-11 pcs (½ Lusin), 12-23 pcs (1 Lusin), 24+ pcs (2 Lusin)
      const p1 = applyRound(base * 0.92);
      const p2 = applyRound(base * 0.86);
      const p3 = applyRound(base * 0.80);
      setTiers([
        { id: '1', minQty: 6, maxQty: 11, price: p1 },
        { id: '2', minQty: 12, maxQty: 23, price: p2 },
        { id: '3', minQty: 24, maxQty: null, price: p3 }
      ]);
      showToast('Skema Lusinan / Toko (½ s/d 2+ Lusin) diterapkan');
    } else if (presetName === 'bulk') {
      // 4 Tiers Partai Besar / Grosir B2B
      const p1 = applyRound(base * 0.94);
      const p2 = applyRound(base * 0.88);
      const p3 = applyRound(base * 0.82);
      const p4 = applyRound(base * 0.76);
      setTiers([
        { id: '1', minQty: 12, maxQty: 23, price: p1 },
        { id: '2', minQty: 24, maxQty: 49, price: p2 },
        { id: '3', minQty: 50, maxQty: 99, price: p3 },
        { id: '4', minQty: 100, maxQty: null, price: p4 }
      ]);
      showToast('Skema Partai Besar B2B (4 Tier) diterapkan');
    } else if (presetName === 'margin') {
      // Based on targeted net margins above effective HPP
      const calcPriceForMargin = (targetMarginPercent: number) => {
        const netDivisor = 1 - (totalPercentageRate / 100) - (targetMarginPercent / 100);
        if (netDivisor <= 0.1) return base;
        return applyRound(effectiveHpp / netDivisor);
      };
      const p1 = Math.min(base - 1000, calcPriceForMargin(22));
      const p2 = Math.min(p1 - 1000, calcPriceForMargin(16));
      const p3 = Math.min(p2 - 1000, calcPriceForMargin(10));
      setTiers([
        { id: '1', minQty: 3, maxQty: 5, price: Math.max(effectiveHpp + 2000, p1) },
        { id: '2', minQty: 6, maxQty: 11, price: Math.max(effectiveHpp + 1500, p2) },
        { id: '3', minQty: 12, maxQty: 100, price: Math.max(effectiveHpp + 1000, p3) }
      ]);
      showToast('Skema Target Margin Bersih Proteksi HPP diterapkan');
    }
  };

  // Add new tier (up to 5 maximum in Shopee)
  const addTier = () => {
    if (tiers.length >= 5) {
      showToast('Maksimal 5 tingkatan harga grosir sesuai aturan Shopee');
      return;
    }
    const lastTier = tiers[tiers.length - 1];
    let newMin = 12;
    let prevMax = 11;

    if (lastTier) {
      if (lastTier.maxQty !== null) {
        newMin = lastTier.maxQty + 1;
      } else {
        prevMax = lastTier.minQty + 5;
        newMin = prevMax + 1;
        lastTier.maxQty = prevMax;
      }
    }

    const newIndex = tiers.length;
    let newPrice = getRecommendedTierPrice(newIndex, normalPrice);
    if (lastTier && newPrice >= lastTier.price) {
      newPrice = Math.max(baseHpp > 0 ? baseHpp : 1000, lastTier.price - 1000);
    }

    const updated = [...tiers];
    if (lastTier && lastTier.maxQty === null) {
      updated[updated.length - 1] = { ...lastTier, maxQty: prevMax };
    }
    updated.push({
      id: String(Date.now()),
      minQty: newMin,
      maxQty: null,
      price: newPrice
    });
    setTiers(updated);
    showToast(`Tier ${updated.length} ditambahkan dengan harga rekomendasi ${formatIDR(newPrice)} (-${getTierDiscountPercent(newIndex)}%)`);
  };

  // Remove tier (minimum 1)
  const removeTier = (index: number) => {
    if (tiers.length <= 1) {
      showToast('Minimal harus ada 1 tingkatan harga grosir');
      return;
    }
    const updated = tiers.filter((_, i) => i !== index);
    if (updated.length > 0 && index === tiers.length - 1) {
      updated[updated.length - 1].maxQty = null;
    }
    setTiers(updated);
    showToast('Tingkat harga grosir dihapus');
  };

  // Update tier fields
  const updateTier = (index: number, field: keyof WholesaleTier, value: any) => {
    const updated = [...tiers];
    const item = { ...updated[index] };

    if (field === 'minQty') {
      if (value === '' || value === null || value === undefined) {
        item.minQty = '' as any;
      } else {
        const parsed = parseInt(value, 10);
        item.minQty = isNaN(parsed) ? ('' as any) : Math.max(1, parsed);
      }
    } else if (field === 'maxQty') {
      if (value === '' || value === null || value === undefined) {
        item.maxQty = null;
      } else {
        const parsed = parseInt(value, 10);
        item.maxQty = isNaN(parsed) ? null : Math.max(1, parsed);
      }
    } else if (field === 'price') {
      item.price = Math.max(0, parseInt(value, 10) || 0);
    }

    updated[index] = item;
    setTiers(updated);
  };

  // Filtered dropdown for product search
  const dropdownFilteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return productList.slice(0, 10);
    const q = searchQuery.toLowerCase().trim();
    return productList
      .filter(p => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 15);
  }, [productList, searchQuery]);

  // --- CALCULATIONS FOR EACH TIER (STAR+ FEES) ---
  const evaluatedTiers = useMemo(() => {
    return tiers.map((tier, idx) => {
      const price = Number(tier.price) || 0;
      const discountFromNormal = normalPrice > 0 ? ((normalPrice - price) / normalPrice) * 100 : 0;
      const sampleQty = Math.max(1, Number(tier.minQty) || 1); // Simulasi pesanan kuantitas batas bawah tier
      
      // 1. Potongan Biaya Persentase (11% Admin + 0.5% Asuransi + 1% AMS = 12.5%)
      const percentCutPerUnit = (price * totalPercentageRate) / 100;
      const totalPercentCut = percentCutPerUnit * sampleQty;

      // 2. Alokasi Biaya Tetap (Rp 1.250 + Rp 350 + Rp 1.000 + Rp 510 = Rp 3.110 per order)
      const fixedFeeAllocatedPerUnit = fixedFeeMode === 'per_order' 
        ? totalFixedFeesPerOrder / sampleQty
        : totalFixedFeesPerOrder;
      const totalFixedCut = fixedFeeMode === 'per_order'
        ? totalFixedFeesPerOrder
        : totalFixedFeesPerOrder * sampleQty;

      // Total Potongan Shopee & Toko per pcs
      const totalFeePerUnit = percentCutPerUnit + fixedFeeAllocatedPerUnit;
      
      // Pendapatan Bersih Diterima Toko (Net Settlement)
      const netSettlementPerUnit = price - totalFeePerUnit;
      
      // Laba Bersih per pcs
      const netProfitPerUnit = netSettlementPerUnit - effectiveHpp;
      const netMarginPercent = price > 0 ? (netProfitPerUnit / price) * 100 : 0;

      // Total Transaksi Simulasi Order
      const totalOrderRevenue = price * sampleQty;
      const totalCost = effectiveHpp * sampleQty;
      const totalOrderFee = totalPercentCut + totalFixedCut;
      const totalOrderNetSettlement = totalOrderRevenue - totalOrderFee;
      const totalOrderProfit = totalOrderNetSettlement - totalCost;
      
      // Status Evaluasi
      const isAboveHpp = baseHpp > 0 ? netSettlementPerUnit >= effectiveHpp : true;
      const isProfitable = netProfitPerUnit > 0;
      
      let status: 'safe' | 'warning' | 'danger' = 'safe';
      let statusMessage = 'Margin Untung Bersih';

      if (baseHpp > 0 && !isAboveHpp) {
        status = 'danger';
        statusMessage = 'RUGI / Boncos! Di bawah HPP';
      } else if (!isProfitable) {
        status = 'warning';
        statusMessage = 'Titik Impas (BEP) / Laba Rp 0';
      }

      return {
        ...tier,
        index: idx,
        discountFromNormal,
        percentCutPerUnit,
        fixedFeeAllocatedPerUnit,
        totalFeePerUnit,
        netSettlement: netSettlementPerUnit,
        netProfit: netProfitPerUnit,
        netMarginPercent,
        status,
        statusMessage,
        sampleQty,
        totalOrderRevenue,
        totalOrderFee,
        totalCost,
        totalOrderProfit
      };
    });
  }, [tiers, normalPrice, totalPercentageRate, totalFixedFeesPerOrder, fixedFeeMode, effectiveHpp, baseHpp]);

  // --- SHOPEE COMPLIANCE VALIDATION CHECKS ---
  const shopeeValidation = useMemo(() => {
    const issues: string[] = [];
    const successes: string[] = [];

    // Rule 1: Min 1 tier, Max 5 tiers
    if (tiers.length < 1) {
      issues.push('Minimal 1 tingkatan harga grosir diperlukan.');
    } else if (tiers.length > 5) {
      issues.push('Maksimal 5 tingkatan harga grosir diizinkan Shopee.');
    } else {
      successes.push(`Jumlah tier memenuhi syarat (${tiers.length} dari maks. 5 tingkat).`);
    }

    // Rule 2: Tier 1 minQty must be > 1
    if (tiers.length > 0 && tiers[0].minQty <= 1) {
      issues.push('Min Qty pada Tier 1 harus lebih dari 1 (pembelian mulai 2 pcs).');
    } else {
      successes.push('Min Qty Tier 1 sudah lebih dari 1 pcs.');
    }

    // Rule 3: Quantity continuity (Min Qty tier N+1 = Max Qty tier N + 1)
    let quantitySequenceValid = true;
    for (let i = 0; i < tiers.length - 1; i++) {
      const current = tiers[i];
      const next = tiers[i + 1];
      if (current.maxQty === null) {
        issues.push(`Tier ${i + 1} tidak boleh bertanda tak terhingga (harus diisi Max Qty) karena masih ada Tier ${i + 2}.`);
        quantitySequenceValid = false;
        break;
      }
      if (next.minQty !== current.maxQty + 1) {
        issues.push(`Rentang kuantitas tidak berurutan: Min Qty Tier ${i + 2} (${next.minQty}) harus sama dengan Max Qty Tier ${i + 1} + 1 (${current.maxQty + 1}).`);
        quantitySequenceValid = false;
        break;
      }
    }
    if (quantitySequenceValid && tiers.length > 1) {
      successes.push('Rentang kuantitas bertingkat berurutan rapi tanpa celah.');
    }

    // Rule 4: Price descending (Normal > Tier 1 > Tier 2 > ...)
    let priceDescendingValid = true;
    let prevPrice = normalPrice;

    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      if (t.price >= prevPrice) {
        issues.push(`Harga Tier ${i + 1} (${formatIDR(t.price)}) harus lebih murah dari harga ${i === 0 ? 'Normal (' + formatIDR(normalPrice) + ')' : 'Tier ' + i + ' (' + formatIDR(prevPrice) + ')'}.`);
        priceDescendingValid = false;
        break;
      }
      prevPrice = t.price;
    }
    if (priceDescendingValid) {
      successes.push('Urutan penurunan harga konsisten (semakin banyak beli, harga satuan semakin murah).');
    }

    // Rule 5: HPP Protection check
    const lossTiers = evaluatedTiers.filter(t => t.status === 'danger');
    if (lossTiers.length > 0) {
      issues.push(`Perhatian: Terdapat ${lossTiers.length} tier yang menghasilkan kerugian (di bawah HPP setelah potongan biaya Star+)!`);
    } else {
      successes.push('Seluruh harga grosir aman di atas HPP Efektif setelah dipotong biaya persentase & tetap Star+.');
    }

    const isValid = issues.length === 0;
    return {
      isValid,
      issues,
      successes
    };
  }, [tiers, normalPrice, evaluatedTiers]);

  // Export to Excel / CSV format
  const exportToExcel = () => {
    try {
      const rows = evaluatedTiers.map((t, idx) => ({
        'No. Tier': `Tier ${idx + 1}`,
        'Min Kuantitas (pcs)': t.minQty,
        'Max Kuantitas (pcs)': t.maxQty ?? 'Tak Terbatas',
        'Harga Grosir Satuan (Rp)': t.price,
        'Diskon dari Normal (%)': `${t.discountFromNormal.toFixed(1)}%`,
        'Total Biaya Persentase Star+ (%)': `${totalPercentageRate.toFixed(2)}%`,
        'Potongan Persentase (Rp/pcs)': Math.round(t.percentCutPerUnit),
        'Alokasi Biaya Tetap (Rp/pcs)': Math.round(t.fixedFeeAllocatedPerUnit),
        'Total Potongan Shopee (Rp/pcs)': Math.round(t.totalFeePerUnit),
        'Diterima Bersih Penjual (Rp/pcs)': Math.round(t.netSettlement),
        'HPP Efektif + Overhead (Rp/pcs)': effectiveHpp,
        'Laba Bersih per pcs (Rp)': Math.round(t.netProfit),
        'Margin Bersih (%)': `${t.netMarginPercent.toFixed(1)}%`,
        'Status Margin': t.statusMessage,
        'Simulasi Min Order (pcs)': t.sampleQty,
        'Simulasi Omzet Order (Rp)': t.totalOrderRevenue,
        'Simulasi Total Biaya Shopee (Rp)': Math.round(t.totalOrderFee),
        'Simulasi Total Profit Bersih (Rp)': Math.round(t.totalOrderProfit)
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Grosir_Star_Plus');

      const fileName = `Skema_Harga_Grosir_Shopee_StarPlus_${selectedSku || 'Produk'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast('File Excel Rekap Harga Grosir Star+ berhasil diunduh!');
    } catch (e) {
      console.error(e);
      showToast('Gagal mengunduh file Excel');
    }
  };

  // Copy skema grosir formatted for WhatsApp
  const copyShopeeTableText = () => {
    const productTitle = activeProduct
      ? `${activeProduct.sku} - ${activeProduct.name}`
      : (selectedSku ? `${selectedSku} - Produk` : 'PRODUK GROSIR');
    const unitUpper = (activeUnit || 'PCS').toUpperCase();

    let text = `*SKEMA HARGA GROSIR*\n`;
    text += `📦 *${productTitle}*\n`;
    text += `💰 Harga Normal: *${formatIDR(normalPrice)}* / ${unitUpper}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    evaluatedTiers.forEach((t, i) => {
      const maxQtyStr = t.maxQty !== null && t.maxQty !== undefined && t.maxQty !== '' ? `${t.maxQty}` : 'dst';
      text += `🔹 *Tier ${i + 1}* (${t.minQty} - ${maxQtyStr} ${unitUpper}) ➔ *${formatIDR(t.price)}* / ${unitUpper}\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_Harga grosir otomatis berlaku saat checkout di Shopee._`;

    navigator.clipboard.writeText(text);
    setCopiedKey('all_shopee_table');
    showToast('Format WhatsApp berhasil disalin ke clipboard!');
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  // Helper to check if a SKU is already saved in spreadsheet
  const isSkuSavedInSheet = (sku: string) => {
    if (!sku || sku === '-') return false;
    const clean = sanitizeSku(sku);
    return savedSkus.some(s => sanitizeSku(s) === clean);
  };

  // Helper to check if a SKU is currently in the basket
  const isSkuInBasket = (sku: string) => {
    if (!sku || sku === '-') return false;
    const clean = sanitizeSku(sku);
    return wholesaleBasket.some(item => sanitizeSku(item.sku) === clean);
  };

  // Add current configuration to basket
  const handleAddToBasket = () => {
    if (!normalPrice || normalPrice <= 0) {
      showToast('Tentukan harga jual normal terlebih dahulu');
      return;
    }
    if (tiers.length === 0) {
      showToast('Tambahkan minimal 1 tier harga grosir');
      return;
    }

    const currentSku = selectedSku || activeProduct?.sku || '';
    const currentName = activeProduct?.name || (currentSku ? `Produk ${currentSku}` : 'PRODUK GROSIR');

    const newItem: WholesaleBasketItem = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      sku: currentSku,
      productName: currentName,
      unit: activeUnit,
      normalPrice: normalPrice,
      tiers: JSON.parse(JSON.stringify(tiers)),
      addedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setWholesaleBasket(prev => {
      // If SKU exists, update it, otherwise add new
      if (currentSku && currentSku !== '-') {
        const existingIdx = prev.findIndex(item => sanitizeSku(item.sku) === sanitizeSku(currentSku));
        if (existingIdx !== -1) {
          const clone = [...prev];
          clone[existingIdx] = newItem;
          showToast(`Perubahan skema harga ${currentSku} diperbarui di keranjang!`);
          return clone;
        }
      }
      const next = [...prev, newItem];
      showToast(`Produk ${currentSku || 'Grosir'} berhasil dimasukkan ke keranjang! (${next.length} item siap disimpan)`);
      return next;
    });
  };

  // Remove from basket
  const handleRemoveFromBasket = (id: string) => {
    setWholesaleBasket(prev => prev.filter(item => item.id !== id));
    showToast('Produk dihapus dari keranjang grosir');
  };

  // Clear basket
  const handleClearBasket = () => {
    if (window.confirm('Kosongkan semua produk dari keranjang grosir?')) {
      setWholesaleBasket([]);
      showToast('Keranjang grosir dikosongkan');
    }
  };

  // Load item from basket into editor
  const handleLoadItemFromBasket = (item: WholesaleBasketItem) => {
    if (item.sku) {
      setSelectedSkuInternal(item.sku);
      setSearchQuery(`${item.sku} - ${item.productName}`);
    }
    setManualNormalPrice(String(item.normalPrice));
    setSelectedUnit(item.unit || 'pcs');
    if (item.tiers && item.tiers.length > 0) {
      setTiers(item.tiers);
    }
    setIsBasketModalOpen(false);
    showToast(`Data produk ${item.sku || item.productName} dimuat ke editor.`);
  };

  // Batch Save all items in basket to Google Spreadsheet
  const handleBatchSaveToSpreadsheet = async () => {
    if (wholesaleBasket.length === 0) {
      showToast('Keranjang grosir kosong. Tambahkan produk terlebih dahulu.');
      return;
    }

    setIsSavingBatch(true);
    try {
      const payloads = wholesaleBasket.map(item => ({
        sku: item.sku,
        productName: item.productName,
        unit: item.unit,
        normalPrice: item.normalPrice,
        tiers: item.tiers
      }));

      const res = await batchAppendWholesaleToSpreadsheet(payloads);

      // Add saved SKUs to state and storage
      const newlySavedSkus = payloads.map(p => p.sku).filter(Boolean);
      recordSavedSkus(newlySavedSkus);
      setSavedSkus(prev => Array.from(new Set([...prev, ...newlySavedSkus])));

      // Clear basket
      setWholesaleBasket([]);

      // Show result modal
      setBatchResultModal({
        show: true,
        success: true,
        message: `${res.count} produk grosir berhasil tersimpan sekaligus di Baris ${res.startRow} s/d ${res.endRow} Google Spreadsheet!`,
        url: res.spreadsheetUrl,
        startRow: res.startRow,
        endRow: res.endRow,
        count: res.count,
        savedSkus: newlySavedSkus
      });

      showToast(`Sukses! ${res.count} produk tersimpan di Baris ${res.startRow}-${res.endRow} Spreadsheet.`);
    } catch (err: any) {
      console.error('Error batch saving to Google Sheets:', err);
      const errMsg = err?.message || 'Gagal menyimpan batch ke Google Spreadsheet';
      setBatchResultModal({
        show: true,
        success: false,
        message: errMsg
      });
      showToast(errMsg);
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Simpan skema harga bertingkat ke Google Spreadsheet (Single)
  const handleSaveToSpreadsheet = async () => {
    if (!normalPrice || normalPrice <= 0) {
      showToast('Tentukan harga jual normal terlebih dahulu');
      return;
    }
    if (tiers.length === 0) {
      showToast('Tambahkan minimal 1 tier harga grosir');
      return;
    }

    const currentSku = selectedSku || activeProduct?.sku || '';
    const currentName = activeProduct?.name || (currentSku ? `Produk ${currentSku}` : 'PRODUK GROSIR');

    setIsSavingToSheets(true);
    try {
      const res = await appendWholesaleToSpreadsheet({
        sku: currentSku,
        productName: currentName,
        unit: activeUnit,
        normalPrice: normalPrice,
        tiers: tiers
      });

      if (currentSku) {
        setSavedSkus(prev => Array.from(new Set([...prev, currentSku])));
      }

      setSheetsModalData({
        show: true,
        success: true,
        message: `Skema harga grosir berhasil tersimpan di Baris ${res.rowNumber} Google Spreadsheet!`,
        url: res.spreadsheetUrl,
        rowPreview: res.rowData,
        rowNumber: res.rowNumber
      });
      showToast(`Berhasil disimpan di Baris ${res.rowNumber} Google Spreadsheet!`);
    } catch (err: any) {
      console.error('Error saving to Google Sheets:', err);
      const errMsg = err?.message || 'Gagal menyimpan ke Google Spreadsheet';
      setSheetsModalData({
        show: true,
        success: false,
        message: errMsg
      });
      showToast(errMsg);
    } finally {
      setIsSavingToSheets(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* TOAST NOTIFICATION */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-2.5 border border-slate-700 animate-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* TOP BANNER / HEADER */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-orange-50 text-orange-600 rounded-xl">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">
                  Kalkulator Harga Grosir Shopee
                </h1>
                <span className="px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-md bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-xs">
                  ⭐ Toko Star+
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Kalkulasi harga bertingkat Shopee dengan potongan resmi penjual <strong>Star+</strong> (Admin 11%, Asuransi 0.5%, AMS 1%, Hemat Kirim 510, &amp; Biaya Tetap).
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <GoogleAuthButton compact={true} />

          {/* LIHAT GOOGLE SPREADSHEET BUTTON */}
          <a
            href={`https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer hover:shadow-sm"
            title={`Buka Google Spreadsheet (${TARGET_SPREADSHEET_ID}) di tab baru`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Lihat Spreadsheet</span>
            <ExternalLink className="w-3 h-3 text-emerald-600" />
          </a>

          {/* KERANJANG GROSIR (BATCH QUEUE) BUTTON */}
          <button
            onClick={() => setIsBasketModalOpen(true)}
            className="relative px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
            title="Buka daftar produk dalam antrean keranjang grosir untuk disimpan sekaligus"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Keranjang Grosir</span>
            {wholesaleBasket.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-400 text-slate-900 text-[10px] font-black rounded-full">
                {wholesaleBasket.length}
              </span>
            )}
          </button>

          {/* + MASUK KERANJANG BUTTON */}
          <button
            onClick={handleAddToBasket}
            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Tambahkan konfigurasi harga grosir produk ini ke keranjang antrean"
          >
            <ListPlus className="w-3.5 h-3.5" />
            <span>+ Masuk Keranjang</span>
          </button>

          <button
            onClick={handleSaveToSpreadsheet}
            disabled={isSavingToSheets}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-60"
            title={`Simpan langsung ke Google Spreadsheet (${TARGET_SPREADSHEET_ID})`}
          >
            {isSavingToSheets ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            <span>{isSavingToSheets ? 'Menyimpan...' : 'Simpan ke Sheet'}</span>
          </button>

          <button
            onClick={exportToExcel}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Unduh tabel harga grosir dalam format Excel"
          >
            <Download className="w-3.5 h-3.5" />
            Unduh Excel
          </button>
        </div>
      </div>

      {/* STRATEGIC PRESETS BAR */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Sliders className="w-4 h-4 text-orange-600" />
          <span>Preset Strategi Cepat:</span>
          <span className="text-[11px] text-slate-400 font-normal hidden md:inline">
            (Pilih template skema kuantitas &amp; diskon instan)
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => applyPreset('margin')}
            className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            🛡️ Proteksi HPP &amp; Target Margin
          </button>
        </div>
      </div>

      {/* TWO COLUMNS: INPUTS & PARAMETERS (LEFT) + SHOPEE STAR+ FEES (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: PRODUCT SELECTION & HARGA JUAL SATUAN (6 COLS) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-600" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                1. Produk &amp; Penentuan Harga Jual Satuan
              </h2>
            </div>
            {selectedSku && (
              <button
                onClick={() => {
                  setSelectedSkuInternal('');
                  setManualNormalPrice('');
                  setSearchQuery('');
                  setSelectedUnit('pcs');
                }}
                className="text-[10px] text-slate-400 hover:text-red-500 font-bold px-2 py-0.5 rounded bg-slate-100 hover:bg-red-50 transition-colors cursor-pointer"
              >
                Reset Produk
              </button>
            )}
          </div>

          {/* PRODUCT SEARCH SELECTOR */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Pilih Produk dari Database (Opsional)</span>
              <span className="text-[10px] text-orange-600 font-bold lowercase">
                {productList.length} produk katalog
              </span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Cari SKU atau nama produk di katalog..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
              />

              {/* Dropdown Suggestions */}
              {showDropdown && dropdownFilteredProducts.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 max-h-60 overflow-y-auto z-50 divide-y divide-slate-100">
                  <div className="p-2 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase flex justify-between">
                    <span>Pilih Produk Katalog</span>
                    <button
                      onClick={() => setShowDropdown(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      Tutup
                    </button>
                  </div>
                  {dropdownFilteredProducts.map(p => {
                    const isSaved = isSkuSavedInSheet(p.sku);
                    const inBasket = isSkuInBasket(p.sku);
                    return (
                      <div
                        key={p.sku}
                        onClick={() => {
                          setSelectedSkuInternal(p.sku);
                          const autoPrice = calculateAutoPrice(p.eceran || 0, rounding);
                          setManualNormalPrice(String(autoPrice));
                          setSelectedUnit(p.unit || 'pcs');
                          setSearchQuery(`${p.sku} - ${p.name}`);
                          setShowDropdown(false);
                          showToast(`Produk ${p.sku} terpilih (${(p.unit || 'pcs').toUpperCase()}) - Harga Jual Satuan otomatis: Rp ${formatInput(autoPrice)}`);
                        }}
                        className={`p-2.5 hover:bg-orange-50/70 cursor-pointer flex items-center justify-between text-xs transition-colors ${
                          selectedSku === p.sku ? 'bg-orange-50 font-bold' : ''
                        }`}
                      >
                        <div className="truncate pr-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-bold text-orange-600">{p.sku}</span>
                            <span className="text-slate-700">{p.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold uppercase">
                              {p.unit || 'pcs'}
                            </span>
                            {isSaved && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center gap-0.5" title="Sudah pernah dibuat & tersimpan di Google Spreadsheet">
                                <Check className="w-2.5 h-2.5" /> Di Sheet
                              </span>
                            )}
                            {inBasket && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold flex items-center gap-0.5" title="Ada dalam antrean keranjang grosir">
                                <ShoppingCart className="w-2.5 h-2.5" /> Di Keranjang
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-mono font-bold text-slate-800">{formatIDR(p.eceran)} / {p.unit || 'pcs'}</div>
                          <div className="text-[10px] text-slate-400">HPP: {formatIDR(p.hpp)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* STATUS BADGE / INDICATOR FOR SELECTED SKU */}
            {selectedSku && (
              <div className="mt-2 space-y-1.5">
                {isSkuSavedInSheet(selectedSku) && (
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-bold">Status SKU {selectedSku}:</span>{' '}
                        <span className="text-emerald-800">Sudah pernah dibuat &amp; tersimpan di Google Spreadsheet.</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-full">
                      ✓ Sudah di Sheet
                    </span>
                  </div>
                )}
                {isSkuInBasket(selectedSku) && (
                  <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-center justify-between shadow-xs">
                    <div className="flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div>
                        <span className="font-bold">Status SKU {selectedSku}:</span>{' '}
                        <span className="text-indigo-800">Ada di antrean Keranjang Grosir ({wholesaleBasket.length} item).</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsBasketModalOpen(true)}
                      className="text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      Buka Keranjang
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* HARGA JUAL SATUAN & RUMUS OTOMATIS */}
          <div className="space-y-3.5 pt-1">
            {/* PILIHAN SATUAN UNIT (PCS, RIM, ROLL, DLL) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                  Satuan Unit:
                </span>
                <span className="font-mono text-xs font-bold text-orange-700 bg-orange-100/80 px-2 py-0.5 rounded border border-orange-200 uppercase">
                  {activeUnit}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] text-slate-400 mr-1 hidden sm:inline">Pilihan Cepat:</span>
                {['pcs', 'rim', 'roll', 'pack', 'box'].map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => {
                      setSelectedUnit(u);
                      showToast(`Satuan unit diubah: ${u.toUpperCase()}`);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase transition-all cursor-pointer ${
                      activeUnit.toLowerCase() === u
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Harga Jual Satuan (per {activeUnit})
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md font-bold">
                    Otomatis: (Eceran + 28% + Rp 3.000)
                  </span>
                  {manualNormalPrice !== '' && manualNormalPrice !== String(autoCalculatedPrice) && (
                    <button
                      type="button"
                      onClick={() => {
                        setManualNormalPrice(String(autoCalculatedPrice));
                        showToast(`Harga kembali ke rumus otomatis: Rp ${formatInput(autoCalculatedPrice)}`);
                      }}
                      className="text-[10px] font-bold text-orange-600 hover:text-orange-700 underline cursor-pointer"
                      title="Kembalikan ke rumus otomatis"
                    >
                      Reset Otomatis
                    </button>
                  )}
                </div>
              </div>

              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-xs">Rp</span>
                <input
                  type="text"
                  placeholder={`Contoh: ${formatInput(autoCalculatedPrice)}`}
                  value={formatInput(manualNormalPrice !== '' ? manualNormalPrice : autoCalculatedPrice)}
                  onChange={e => {
                    const parsed = parseInput(e.target.value);
                    setManualNormalPrice(parsed === '' ? '' : String(parsed));
                  }}
                  className="w-full pl-9 pr-14 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-inner"
                />
                <span className="absolute right-3.5 top-2.5 text-slate-400 font-bold text-xs font-mono">
                  / {activeUnit}
                </span>
              </div>
              <div className="flex items-center justify-between text-[10.5px] text-slate-500 mt-1.5">
                <span>
                  Rumus otomatis: Eceran ({formatIDR(activeEceran)} / {activeUnit}) + 28% ({formatIDR(activeEceran * 0.28)}) + Rp 3.000
                </span>
                <span className="font-mono font-bold text-slate-700">
                  = {formatIDR(autoCalculatedPrice)} / {activeUnit}
                </span>
              </div>

              {/* LIST HARGA AIO (ECERAN, GROSIR, PARTAI, HPP) */}
              <div className="mt-3.5 p-3 bg-slate-50/90 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-slate-700 font-bold">
                    <Sparkles className="w-3 h-3 text-orange-500" />
                    List Harga AIO {activeProduct ? `(${activeProduct.sku} • per ${activeUnit})` : `(per ${activeUnit})`}
                  </span>
                  <span className="text-[9px] text-slate-400 lowercase font-normal">klik kartu untuk terapkan harga / {activeUnit}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const val = activeProduct ? activeProduct.eceran : 100000;
                      setManualNormalPrice(String(val));
                      showToast(`Harga Eceran AIO: Rp ${formatInput(val)} / ${activeUnit} diterapkan`);
                    }}
                    className="p-2 bg-white hover:bg-orange-50 hover:border-orange-300 border border-slate-200 rounded-lg text-left transition-all group cursor-pointer shadow-2xs"
                    title={`Gunakan Harga Eceran AIO (per ${activeUnit})`}
                  >
                    <span className="text-[10px] font-bold text-slate-500 block truncate">Eceran / {activeUnit}</span>
                    <span className="text-xs font-mono font-bold text-slate-800 group-hover:text-orange-600 block mt-0.5">
                      {formatInput(activeProduct ? activeProduct.eceran : 100000)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const val = activeProduct ? activeProduct.grosir : 95000;
                      setManualNormalPrice(String(val));
                      showToast(`Harga Grosir: Rp ${formatInput(val)} / ${activeUnit} diterapkan`);
                    }}
                    className="p-2 bg-white hover:bg-orange-50 hover:border-orange-300 border border-slate-200 rounded-lg text-left transition-all group cursor-pointer shadow-2xs"
                    title={`Gunakan Harga Grosir (per ${activeUnit})`}
                  >
                    <span className="text-[10px] font-bold text-slate-500 block truncate">Grosir / {activeUnit}</span>
                    <span className="text-xs font-mono font-bold text-slate-800 group-hover:text-orange-600 block mt-0.5">
                      {formatInput(activeProduct ? activeProduct.grosir : 95000)}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const val = activeProduct ? activeProduct.partai : 90000;
                      setManualNormalPrice(String(val));
                      showToast(`Harga Partai: Rp ${formatInput(val)} / ${activeUnit} diterapkan`);
                    }}
                    className="p-2 bg-white hover:bg-orange-50 hover:border-orange-300 border border-slate-200 rounded-lg text-left transition-all group cursor-pointer shadow-2xs"
                    title={`Gunakan Harga Partai (per ${activeUnit})`}
                  >
                    <span className="text-[10px] font-bold text-slate-500 block truncate">Partai / {activeUnit}</span>
                    <span className="text-xs font-mono font-bold text-slate-800 group-hover:text-orange-600 block mt-0.5">
                      {formatInput(activeProduct ? activeProduct.partai : 90000)}
                    </span>
                  </button>

                  <div
                    className="p-2 bg-white border border-slate-200 rounded-lg text-left shadow-2xs"
                    title={`HPP Modal Produk (per ${activeUnit})`}
                  >
                    <span className="text-[10px] font-bold text-slate-500 block truncate">HPP / {activeUnit}</span>
                    <span className="text-xs font-mono font-bold text-slate-800 block mt-0.5">
                      {formatInput(activeProduct ? activeProduct.hpp : 60000)}
                    </span>
                  </div>
                </div>
              </div>

              {/* INFO PRODUK AKTIF */}
              {activeProduct && (
                <div className="mt-3 p-3 bg-orange-50/60 rounded-xl border border-orange-200/70 flex items-center justify-between text-xs">
                  <div className="truncate pr-3">
                    <span className="font-bold text-slate-800 block truncate">{activeProduct.name}</span>
                    <span className="text-[10.5px] text-slate-500">
                      SKU: <strong className="font-mono text-orange-700">{activeProduct.sku}</strong> • Satuan: <strong className="font-mono text-orange-700 uppercase">{activeUnit}</strong> • HPP Modal: <strong className="font-mono text-slate-700">{formatIDR(activeProduct.hpp)} / {activeUnit}</strong>
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Harga Eceran AIO</span>
                    <span className="font-mono font-bold text-orange-900 text-xs">{formatIDR(activeProduct.eceran)} <span className="text-[10px] font-normal text-orange-700">/ {activeUnit}</span></span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DETAIL BIAYA STAR+ SHOPEE (6 COLS) */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-orange-600" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  2. Rincian Biaya Toko Star+ Shopee
                </h2>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono font-bold text-orange-800 bg-orange-100 px-2 py-0.5 rounded-md border border-orange-200">
                  {totalPercentageRate.toFixed(1)}% + {formatIDR(totalFixedFeesPerOrder)}
                </span>
              </div>
            </div>

            {/* SECTION A: LIST BIAYA PERSENTASE */}
            <div className="mt-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-orange-600" />
                  List Biaya Persentase (%):
                </span>
                <span className="font-mono text-orange-600 text-xs">
                  Total: {totalPercentageRate.toFixed(1)}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {/* Biaya Admin 11% */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block truncate">Biaya Admin</span>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="30"
                      value={adminFeePercent}
                      onChange={e => setAdminFeePercent(parseFloat(e.target.value) || 0)}
                      className="w-full text-right px-1.5 py-0.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Komisi Star+</span>
                </div>

                {/* Asuransi Pengiriman 0.5% */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block truncate">Asuransi Kirim</span>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="5"
                      value={insurancePercent}
                      onChange={e => setInsurancePercent(parseFloat(e.target.value) || 0)}
                      className="w-full text-right px-1.5 py-0.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Premi Proteksi</span>
                </div>

                {/* AMS 1% */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block truncate">AMS (Afiliasi)</span>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={amsPercent}
                      onChange={e => setAmsPercent(parseFloat(e.target.value) || 0)}
                      className="w-full text-right px-1.5 py-0.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                  <span className="text-[9px] text-slate-400 block mt-0.5">Komisi Shopee</span>
                </div>
              </div>
            </div>

            {/* SECTION B: LIST BIAYA TETAP & PROGRAM HEMAT KIRIM */}
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-orange-600" />
                  List Biaya Tetap (Rp / Pesanan):
                </span>
                <span className="font-mono text-orange-600 text-xs">
                  Total: {formatIDR(totalFixedFeesPerOrder)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* Biaya Proses Pesanan 1250 */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block truncate" title="Biaya Proses Pesanan">
                    Proses Pesanan
                  </span>
                  <div className="relative mt-1">
                    <span className="absolute left-1.5 top-1 text-[10px] text-slate-400 font-bold">Rp</span>
                    <input
                      type="text"
                      value={formatInput(marketplaceProcFee)}
                      onChange={e => {
                        const parsed = parseInput(e.target.value);
                        setMarketplaceProcFee(parsed === '' ? 0 : Number(parsed));
                      }}
                      className="w-full text-right pl-6 pr-1.5 py-0.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                </div>

                {/* Biaya Jubelio 350 */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block truncate" title="Biaya Jubelio Omnichannel">
                    Biaya Jubelio
                  </span>
                  <div className="relative mt-1">
                    <span className="absolute left-1.5 top-1 text-[10px] text-slate-400 font-bold">Rp</span>
                    <input
                      type="text"
                      value={formatInput(jubelioProcFee)}
                      onChange={e => {
                        const parsed = parseInput(e.target.value);
                        setJubelioProcFee(parsed === '' ? 0 : Number(parsed));
                      }}
                      className="w-full text-right pl-6 pr-1.5 py-0.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                </div>

                {/* Biaya Packing 1000 */}
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-600 block truncate" title="Biaya Packing Toko">
                    Biaya Packing
                  </span>
                  <div className="relative mt-1">
                    <span className="absolute left-1.5 top-1 text-[10px] text-slate-400 font-bold">Rp</span>
                    <input
                      type="text"
                      value={formatInput(packingFee)}
                      onChange={e => {
                        const parsed = parseInput(e.target.value);
                        setPackingFee(parsed === '' ? 0 : Number(parsed));
                      }}
                      className="w-full text-right pl-6 pr-1.5 py-0.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                </div>

                {/* Program Hemat Biaya Kirim : 510 */}
                <div className={`p-2.5 rounded-xl border transition-all ${
                  includeHematKirim ? 'bg-orange-50/70 border-orange-200' : 'bg-slate-50 border-slate-200 opacity-60'
                }`}>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-[10px] font-bold text-slate-700 block truncate" title="Program Hemat Biaya Kirim Shopee">
                      Hemat Kirim
                    </span>
                    <input
                      type="checkbox"
                      checked={includeHematKirim}
                      onChange={e => setIncludeHematKirim(e.target.checked)}
                      className="w-3.5 h-3.5 text-orange-600 rounded border-slate-300 focus:ring-orange-500 cursor-pointer"
                    />
                  </label>
                  <div className="relative mt-1">
                    <span className="absolute left-1.5 top-1 text-[10px] text-slate-400 font-bold">Rp</span>
                    <input
                      type="text"
                      disabled={!includeHematKirim}
                      value={formatInput(hematBiayaKirimNominal)}
                      onChange={e => {
                        const parsed = parseInput(e.target.value);
                        setHematBiayaKirimNominal(parsed === '' ? 0 : Number(parsed));
                      }}
                      className="w-full text-right pl-6 pr-1.5 py-0.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ALOKASI BIAYA TETAP SELECTOR */}
            <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                <Box className="w-3.5 h-3.5 text-orange-600" />
                Alokasi Biaya Tetap ({formatIDR(totalFixedFeesPerOrder)}):
              </span>
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setFixedFeeMode('per_order')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                    fixedFeeMode === 'per_order'
                      ? 'bg-white text-orange-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Biaya tetap dihitung 1x per pesanan (terbagi rata per pcs semakin banyak kuantitas)"
                >
                  Per Pesanan Order (Hemat Bulk)
                </button>
                <button
                  type="button"
                  onClick={() => setFixedFeeMode('per_item')}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer ${
                    fixedFeeMode === 'per_item'
                      ? 'bg-white text-orange-700 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                  title="Biaya tetap dibebankan flat per setiap 1 pc"
                >
                  Flat per Pcs
                </button>
              </div>
            </div>
          </div>

          {/* Shopee Star+ rule note */}
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              Efisiensi Penjualan Grosir Star+:
            </span>
            <p className="leading-relaxed text-amber-800/90 text-[10.5px]">
              Potongan persentase (<strong>{totalPercentageRate}%</strong>) tetap dipotong per nominal harga grosir. Namun biaya tetap (<strong>{formatIDR(totalFixedFeesPerOrder)}</strong>) terbagi rata ke kuantitas pesanan, sehingga margin operasional per unit pada order lusinan/partai besar menjadi jauh lebih aman!
            </p>
          </div>
        </div>
      </div>

      {/* TIERED PRICING TABLE (THE MAIN CALCULATOR) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base font-black text-slate-800 tracking-tight">
                Tabel Skema Harga Bertingkat Shopee (Toko Star+)
              </h2>
              <span className="text-xs font-bold px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full">
                {tiers.length} dari 5 Tier
              </span>
              <button
                onClick={copyShopeeTableText}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer ml-1.5 border ${
                  copiedKey === 'all_shopee_table'
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-800 ring-2 ring-emerald-300'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 hover:shadow-md ring-1 ring-emerald-500/30'
                }`}
                title="Salin format teks skema grosir siap kirim ke chat WhatsApp"
              >
                {copiedKey === 'all_shopee_table' ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <Copy className="w-4 h-4 text-white" />
                )}
                <span>{copiedKey === 'all_shopee_table' ? 'Tersalin ke Whatsapp!' : 'Salin ke Whatsapp'}</span>
              </button>

              <button
                onClick={handleAddToBasket}
                className="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer ml-1.5"
                title="Tambahkan konfigurasi harga grosir produk ini ke antrean keranjang"
              >
                <ListPlus className="w-4 h-4 text-indigo-600" />
                <span>+ Masuk Keranjang</span>
              </button>

              <button
                onClick={() => setIsBasketModalOpen(true)}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer ml-1.5"
                title="Buka keranjang grosir untuk simpan sekaligus"
              >
                <ShoppingCart className="w-4 h-4 text-white" />
                <span>Keranjang ({wholesaleBasket.length})</span>
              </button>

              <button
                onClick={handleSaveToSpreadsheet}
                disabled={isSavingToSheets}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer ml-1.5 disabled:opacity-60"
                title={`Simpan langsung ke Google Spreadsheet (${TARGET_SPREADSHEET_ID})`}
              >
                {isSavingToSheets ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 text-white" />
                )}
                <span>{isSavingToSheets ? 'Menyimpan...' : 'Simpan ke Spreadsheet'}</span>
              </button>

              <a
                href={`https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer ml-1.5 hover:shadow-md"
                title={`Buka Google Spreadsheet (${TARGET_SPREADSHEET_ID}) di tab baru`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Lihat Spreadsheet</span>
                <ExternalLink className="w-3 h-3 text-emerald-600" />
              </a>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Sesuaikan kuantitas (Min - Max Qty) dan tentukan harga grosir satuan. Sistem otomatis menghitung potongan Shopee Star+ dan validasi kepatuhan.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => applyRecommendedPrices()}
              className="px-3.5 py-2 bg-white hover:bg-orange-50 text-orange-700 border border-orange-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
              title="Terapkan harga rekomendasi otomatis ke seluruh tingkatan tier"
            >
              <Sparkles className="w-3.5 h-3.5 text-orange-600" />
              Terapkan Rekomendasi Tier
            </button>
          </div>
        </div>

        {/* TABLE CONTENT */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <th className="p-3.5 pl-5">Tingkatan</th>
                <th className="p-3.5">
                  <div className="flex items-center gap-1">
                    <span>Rentang Qty ({activeUnit})</span>
                    <Edit3 className="w-3 h-3 text-orange-500" />
                  </div>
                  <div className="text-[9px] text-slate-400 font-normal lowercase tracking-normal">
                    bisa dicustom bebas
                  </div>
                </th>
                <th className="p-3.5">
                  <div className="flex items-center gap-1">
                    <span>Harga Grosir Satuan (Rp)</span>
                    <Sparkles className="w-3 h-3 text-orange-500" />
                  </div>
                  <div className="text-[9px] text-orange-700 font-normal lowercase tracking-normal">
                    otomatis ada rekomendasi
                  </div>
                </th>
                <th className="p-3.5">Diskon / Potongan</th>
                <th className="p-3.5">Potongan % Star+ ({totalPercentageRate.toFixed(1)}%)</th>
                <th className="p-3.5">Beban Biaya Tetap / {activeUnit}</th>
                <th className="p-3.5">Diterima Bersih Toko</th>
                <th className="p-3.5">Laba Bersih per {activeUnit}</th>
                <th className="p-3.5">Margin (%)</th>
                <th className="p-3.5">Simulasi Omzet Min Order</th>
                <th className="p-3.5 pr-5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {/* Reference row: Normal Retail Price */}
              <tr className="bg-slate-50/50 text-slate-500 font-sans text-xs">
                <td className="p-3.5 pl-5 font-bold text-slate-700">Normal (1 {activeUnit})</td>
                <td className="p-3.5 font-mono">1 {activeUnit}</td>
                <td className="p-3.5 font-mono font-bold text-slate-900">{formatIDR(normalPrice)}</td>
                <td className="p-3.5 font-mono text-slate-400">0% (Acuan)</td>
                <td className="p-3.5 font-mono text-slate-500">- {formatIDR((normalPrice * totalPercentageRate) / 100)}</td>
                <td className="p-3.5 font-mono text-slate-500">- {formatIDR(totalFixedFeesPerOrder)}</td>
                <td className="p-3.5 font-mono text-slate-700">{formatIDR(normalPrice - ((normalPrice * totalPercentageRate) / 100) - totalFixedFeesPerOrder)}</td>
                <td className="p-3.5 font-mono font-bold text-emerald-700">{formatIDR((normalPrice - ((normalPrice * totalPercentageRate) / 100) - totalFixedFeesPerOrder) - effectiveHpp)}</td>
                <td className="p-3.5 font-mono font-bold text-emerald-700">
                  {normalPrice > 0 ? ((((normalPrice - ((normalPrice * totalPercentageRate) / 100) - totalFixedFeesPerOrder) - effectiveHpp) / normalPrice) * 100).toFixed(1) : 0}%
                </td>
                <td className="p-3.5 font-mono text-slate-400 text-[11px]">-</td>
                <td className="p-3.5 pr-5 text-center text-slate-400 text-[10px]">Harga Dasar</td>
              </tr>

              {/* Wholesale Tier rows */}
              {evaluatedTiers.map((t, index) => {
                const isLoss = t.status === 'danger';
                const isWarning = t.status === 'warning';

                return (
                  <tr
                    key={t.id}
                    className={`transition-colors font-sans ${
                      isLoss
                        ? 'bg-red-50/70 hover:bg-red-50'
                        : isWarning
                        ? 'bg-amber-50/50 hover:bg-amber-50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Tingkatan Name */}
                    <td className="p-3.5 pl-5">
                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                        <span className="w-5 h-5 rounded-md bg-orange-100 text-orange-700 flex items-center justify-center text-[11px]">
                          {index + 1}
                        </span>
                        <span>Tier {index + 1}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {isLoss ? (
                          <span className="text-red-600 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Boncos (Rugi)
                          </span>
                        ) : isWarning ? (
                          <span className="text-amber-600 font-bold flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Margin Tipis
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Aman
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Min & Max Qty Inputs (Customizable) */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5 font-mono">
                        <div className="relative">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Min"
                            value={t.minQty !== undefined && t.minQty !== null ? t.minQty : ''}
                            onChange={e => updateTier(index, 'minQty', e.target.value)}
                            className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-center shadow-inner focus:ring-1 focus:ring-orange-500 outline-none hover:border-slate-300"
                            title="Kuantitas Minimal (Min Qty)"
                          />
                        </div>
                        <span className="text-slate-400 text-xs font-bold">-</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder={index === tiers.length - 1 ? '≥ dst' : 'Maks'}
                            value={t.maxQty !== null && t.maxQty !== undefined ? t.maxQty : ''}
                            onChange={e => updateTier(index, 'maxQty', e.target.value)}
                            className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 text-center shadow-inner focus:ring-1 focus:ring-orange-500 outline-none hover:border-slate-300"
                            title={index === tiers.length - 1 ? "Kuantitas Maksimal (Bisa diisi angka kustom misal 100 atau kosongkan jika tak terbatas)" : "Kuantitas Maksimal (Max Qty)"}
                          />
                          <span className="text-[10px] text-slate-400 font-sans" title={t.maxQty === null ? `Tak terbatas (≥ ${t.minQty} ${activeUnit})` : `Hingga ${t.maxQty} ${activeUnit}`}>
                            {t.maxQty === null && index === tiers.length - 1 ? '(≥ dst)' : activeUnit}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Harga Grosir Satuan (Input, Copy & Rekomendasi Otomatis) */}
                    <td className="p-3.5 font-mono">
                      <div className="relative flex items-center gap-1.5">
                        <span className="text-slate-400 text-xs font-bold">Rp</span>
                        <input
                          type="text"
                          value={formatInput(t.price)}
                          onChange={e => {
                            const parsed = parseInput(e.target.value);
                            updateTier(index, 'price', parsed === '' ? 0 : parsed);
                          }}
                          className={`w-28 px-2.5 py-1.5 bg-white border rounded-lg text-xs font-mono font-bold text-slate-900 shadow-inner focus:ring-1 outline-none ${
                            isLoss ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-orange-500'
                          }`}
                        />
                        <button
                          onClick={() => handleCopy(t.price, `price_tier_${index}`)}
                          className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors cursor-pointer"
                          title="Salin harga grosir ini"
                        >
                          {copiedKey === `price_tier_${index}` ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* Tag / Tombol Rekomendasi Sesuai Tingkatannya */}
                      {(() => {
                        const recPrice = getRecommendedTierPrice(index, normalPrice);
                        const recDiscount = getTierDiscountPercent(index);
                        const isMatch = Math.abs(t.price - recPrice) < 10;
                        return (
                          <div className="mt-1.5">
                            {isMatch ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-sans font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                                Rekomendasi Tier {index + 1} (-{recDiscount}%)
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  updateTier(index, 'price', recPrice);
                                  showToast(`Tier ${index + 1}: Harga rekomendasi ${formatIDR(recPrice)} (-${recDiscount}%) diterapkan`);
                                }}
                                className="inline-flex items-center gap-1 text-[10px] font-sans font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 px-1.5 py-0.5 rounded border border-orange-200 transition-all cursor-pointer group"
                                title={`Gunakan harga rekomendasi Tier ${index + 1}: ${formatIDR(recPrice)} (Diskon ${recDiscount}%)`}
                              >
                                <Sparkles className="w-2.5 h-2.5 text-orange-500 group-hover:rotate-12 transition-transform" />
                                <span>Rekomendasi: <strong>{formatInput(recPrice)}</strong> (-{recDiscount}%)</span>
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Diskon dari Normal */}
                    <td className="p-3.5 font-mono">
                      <span className="font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200/60">
                        -{t.discountFromNormal.toFixed(1)}%
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Hemat {formatIDR(normalPrice - t.price)}
                      </div>
                    </td>

                    {/* Potongan % Star+ */}
                    <td className="p-3.5 font-mono text-slate-600">
                      <div className="text-red-700 font-bold">
                        - {formatIDR(t.percentCutPerUnit)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {totalPercentageRate}% per unit
                      </div>
                    </td>

                    {/* Beban Biaya Tetap per pcs */}
                    <td className="p-3.5 font-mono text-slate-600">
                      <div className="text-slate-800 font-bold">
                        - {formatIDR(t.fixedFeeAllocatedPerUnit)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        ({formatIDR(totalFixedFeesPerOrder)} / {t.sampleQty} pcs)
                      </div>
                    </td>

                    {/* Diterima Bersih Toko (Net Settlement) */}
                    <td className="p-3.5 font-mono font-bold text-slate-800">
                      {formatIDR(t.netSettlement)}
                      <div className="text-[10px] text-slate-400 font-normal">
                        setelah seluruh biaya
                      </div>
                    </td>

                    {/* Laba Bersih per pcs */}
                    <td className="p-3.5 font-mono font-bold">
                      <div className={isLoss ? 'text-red-600' : isWarning ? 'text-amber-700' : 'text-emerald-700'}>
                        {formatIDR(t.netProfit)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-normal">
                        bersih ke kantong
                      </div>
                    </td>

                    {/* Margin Bersih (%) */}
                    <td className="p-3.5 font-mono font-bold">
                      <span className={`px-2 py-0.5 rounded text-[11px] ${
                        isLoss
                          ? 'bg-red-100 text-red-700'
                          : isWarning
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {t.netMarginPercent.toFixed(1)}%
                      </span>
                    </td>

                    {/* Simulasi Order Kuantitas Minimum */}
                    <td className="p-3.5 font-mono">
                      <div className="text-slate-800 font-bold">
                        {formatIDR(t.totalOrderRevenue)}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-bold">
                        Laba: +{formatIDR(t.totalOrderProfit)} ({t.sampleQty} pcs)
                      </div>
                    </td>

                    {/* Aksi Baris */}
                    <td className="p-3.5 pr-5 text-center">
                      <button
                        onClick={() => removeTier(index)}
                        disabled={tiers.length <= 1}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-20 cursor-pointer"
                        title="Hapus tingkatan ini"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* TABLE FOOTER SUMMARY */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 text-[11px] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span>
              Catatan: HPP Produk = <strong>{formatIDR(baseHpp)}</strong> / {activeUnit}. Biaya Shopee Star+ = <strong>{totalPercentageRate}%</strong> + Tetap <strong>{formatIDR(totalFixedFeesPerOrder)}</strong>/order.
            </span>
          </div>

          <div className="flex items-center gap-3">
            {setActiveView && setProduct && (
              <button
                onClick={() => {
                  const lowestTier = evaluatedTiers[evaluatedTiers.length - 1];
                  if (lowestTier) {
                    setProduct(prev => ({
                      ...prev,
                      basePrice: lowestTier.price,
                      hpp: effectiveHpp
                    }));
                    if (selectedSku && setSelectedSku) {
                      setSelectedSku(selectedSku);
                    }
                    setActiveView('calculator');
                    showToast('Harga grosir tier terbawah dibawa ke Kalkulator Utama');
                  }
                }}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:border-orange-500 text-slate-700 hover:text-orange-700 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                title="Bawa harga grosir ke Kalkulator Utama untuk perhitungan lengkap"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Kalkulator Utama
              </button>
            )}
          </div>
        </div>
      </div>

      {/* SHOPEE COMPLIANCE & BEST PRACTICE GUIDE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT: SHOPEE VALIDATION STATUS CARD (7 COLS) */}
        <div className={`lg:col-span-7 rounded-2xl border p-6 shadow-sm space-y-4 ${
          shopeeValidation.isValid ? 'bg-emerald-50/50 border-emerald-200' : 'bg-amber-50/70 border-amber-200'
        }`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/60">
            <div className="flex items-center gap-2">
              {shopeeValidation.isValid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              )}
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Status Kepatuhan Sistem Shopee (Wholesale Compliance)
              </h3>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
              shopeeValidation.isValid ? 'bg-emerald-200/80 text-emerald-900' : 'bg-amber-200 text-amber-900'
            }`}>
              {shopeeValidation.isValid ? 'Siap Input di Shopee' : 'Perlu Penyesuaian'}
            </span>
          </div>

          {/* Issues list if any */}
          {shopeeValidation.issues.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-red-800 block">
                Hal yang Harus Diperbaiki:
              </span>
              <ul className="space-y-1 text-xs text-red-700 list-disc pl-4">
                {shopeeValidation.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Success checklist */}
          <div className="space-y-1.5 pt-1">
            <span className="text-xs font-bold text-emerald-900 block">
              Parameter yang Telah Memenuhi Syarat:
            </span>
            <ul className="space-y-1 text-xs text-emerald-800 list-disc pl-4">
              {shopeeValidation.successes.map((succ, i) => (
                <li key={i}>{succ}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* RIGHT: HOW TO INPUT IN SHOPEE SELLER CENTRE (5 COLS) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-slate-800 pb-2 border-b border-slate-100">
              <HelpCircle className="w-4 h-4 text-orange-600" />
              Aturan Sistem Harga Grosir di Shopee
            </div>
            <ul className="text-xs text-slate-600 space-y-2.5 list-disc pl-4 leading-relaxed mt-3">
              <li>
                <strong>Rentang Kuantitas Wajib Berurutan:</strong> Kuantitas minimal tier berikutnya harus tepat bernilai (Max Qty tier sebelumnya + 1). Contoh: 3-5 pcs, lalu 6-11 pcs, lalu 12-23 pcs.
              </li>
              <li>
                <strong>Urutan Harga Wajib Menurun:</strong> Shopee otomatis menolak jika harga tier berikutnya sama atau lebih mahal dibanding tier sebelumnya.
              </li>
              <li>
                <strong>Variasi Produk:</strong> Jika produk memiliki variasi (ukuran, warna), Shopee mewajibkan semua variasi memiliki harga satuan yang sama agar fitur Grosir dapat diaktifkan.
              </li>
              <li>
                <strong>Promo Diskon Toko:</strong> Jika Anda mengaktifkan Promo Diskon Toko atau Flash Sale Toko, Shopee akan otomatis menonaktifkan harga grosir sementara untuk produk tersebut.
              </li>
            </ul>
          </div>

          <div className="pt-3 border-t border-slate-100 bg-orange-50/60 p-3 rounded-xl border border-orange-100 text-[11px] text-orange-950">
            <span className="font-bold block mb-0.5">💡 Tips Seller Shopee:</span>
            Pasang banner grafis di foto produk slide ke-2 yang menginfokan &quot;Beli Banyak Lebih Hemat / Tersedia Harga Grosir&quot; agar pembeli terdorong membeli kuantitas partai besar.
          </div>
        </div>

      </div>

      {/* GOOGLE SPREADSHEET RESULT MODAL */}
      {sheetsModalData?.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${sheetsModalData.success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {sheetsModalData.success ? (
                    <FileSpreadsheet className="w-5 h-5" />
                  ) : (
                    <AlertCircle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">
                    {sheetsModalData.success ? 'Berhasil Disimpan ke Google Spreadsheet' : 'Gagal Menyimpan ke Google Spreadsheet'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    ID Sheet: {TARGET_SPREADSHEET_ID}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSheetsModalData(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {sheetsModalData.success ? (
                <>
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">{sheetsModalData.message}</p>
                      <p className="text-emerald-700 mt-0.5">
                        Data berhasil dimasukkan langsung ke Baris {sheetsModalData.rowNumber || 'tersedia'} di tab <strong>Harga Grosir</strong> pada lembar spreadsheet Anda.
                      </p>
                    </div>
                  </div>

                  {sheetsModalData.rowPreview && sheetsModalData.rowPreview.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700 flex justify-between items-center">
                        <span>Format Baris Data yang Tersimpan:</span>
                        {sheetsModalData.rowNumber && (
                          <span className="text-[11px] font-mono font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            Baris #{sheetsModalData.rowNumber}
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-slate-100 text-xs">
                        <div className="grid grid-cols-3 p-2.5 hover:bg-slate-50/50">
                          <span className="text-slate-500 font-medium">Kolom 1 (Hari Tanggal/Waktu)</span>
                          <span className="col-span-2 font-semibold text-slate-800">{sheetsModalData.rowPreview[0]}</span>
                        </div>
                        <div className="grid grid-cols-3 p-2.5 hover:bg-slate-50/50">
                          <span className="text-slate-500 font-medium">Kolom 2 (SKU)</span>
                          <span className="col-span-2 font-mono font-bold text-slate-800">{sheetsModalData.rowPreview[1]}</span>
                        </div>
                        <div className="grid grid-cols-3 p-2.5 hover:bg-slate-50/50">
                          <span className="text-slate-500 font-medium">Kolom 3 (Nama Produk)</span>
                          <span className="col-span-2 font-bold text-slate-800">{sheetsModalData.rowPreview[2]}</span>
                        </div>
                        <div className="grid grid-cols-3 p-2.5 hover:bg-slate-50/50">
                          <span className="text-slate-500 font-medium">Kolom 4 (UNIT)</span>
                          <span className="col-span-2 font-semibold text-slate-800">{sheetsModalData.rowPreview[3]}</span>
                        </div>
                        <div className="grid grid-cols-3 p-2.5 hover:bg-slate-50/50">
                          <span className="text-slate-500 font-medium">Kolom 5 (Harga Satuan)</span>
                          <span className="col-span-2 font-bold text-blue-700">{sheetsModalData.rowPreview[4]}</span>
                        </div>
                        <div className="grid grid-cols-3 p-2.5 hover:bg-slate-50/50">
                          <span className="text-slate-500 font-medium">Kolom 6 (Harga Tier 1)</span>
                          <span className="col-span-2 font-semibold text-slate-800">{sheetsModalData.rowPreview[5] || '-'}</span>
                        </div>
                        <div className="grid grid-cols-3 p-2.5 hover:bg-slate-50/50">
                          <span className="text-slate-500 font-medium">Kolom 7 (Harga Tier 2)</span>
                          <span className="col-span-2 font-semibold text-slate-800">{sheetsModalData.rowPreview[6] || '-'}</span>
                        </div>
                        <div className="grid grid-cols-3 p-2.5 hover:bg-slate-50/50">
                          <span className="text-slate-500 font-medium">Kolom 8 (Harga Tier 3)</span>
                          <span className="col-span-2 font-semibold text-slate-800">{sheetsModalData.rowPreview[7] || '-'}</span>
                        </div>
                        <div className="grid grid-cols-3 p-2.5 hover:bg-slate-50/50">
                          <span className="text-slate-500 font-medium">Kolom 9 & 10 (Checklist)</span>
                          <span className="col-span-2 font-mono text-slate-600">FALSE, FALSE</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <p className="font-semibold">Terjadi kendala saat menyimpan:</p>
                      <p className="font-mono text-[11px] bg-white/70 p-2 rounded border border-red-100 break-all">
                        {sheetsModalData.message}
                      </p>
                      {(sheetsModalData.message?.toLowerCase().includes('unauthorized-domain') ||
                        sheetsModalData.message?.toLowerCase().includes('authorized domains')) && (
                        <button
                          type="button"
                          onClick={() => setShowDomainModal(true)}
                          className="mt-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Buka Panduan Otorisasi Domain Firebase</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1.5">
                    <p className="font-bold text-slate-700">Panduan Mengatasi:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      <li>Pastikan Anda telah mengizinkan domain aplikasi ini di Firebase Authorized Domains.</li>
                      <li>Pastikan Anda mengizinkan pop-up otentikasi Google pada browser Anda.</li>
                      <li>Pilih akun Google yang memiliki hak akses edit pada spreadsheet target.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
              {sheetsModalData.success ? (
                <>
                  <button
                    onClick={() => setSheetsModalData(null)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Tutup
                  </button>
                  {sheetsModalData.url && (
                    <a
                      href={sheetsModalData.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Buka Google Spreadsheet</span>
                    </a>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => setSheetsModalData(null)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Tutup
                  </button>
                  <GoogleAuthButton compact={true} />
                  <button
                    onClick={() => {
                      setSheetsModalData(null);
                      handleSaveToSpreadsheet();
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Coba Lagi</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* KERANJANG GROSIR (BATCH QUEUE) MODAL */}
      {isBasketModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-slate-800">
                      Keranjang Antrean Harga Grosir
                    </h3>
                    <span className="px-2 py-0.5 text-[11px] font-black rounded-full bg-indigo-100 text-indigo-800">
                      {wholesaleBasket.length} Produk
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Kumpulkan skema harga berbagai produk lalu simpan sekaligus ke Spreadsheet ({TARGET_SPREADSHEET_ID})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBasketModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {wholesaleBasket.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-3">
                  <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                    <ShoppingCart className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-bold text-slate-700 text-sm">Keranjang Grosir Masih Kosong</h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Pilih produk di katalog atau atur harga di form, lalu klik tombol <strong className="text-indigo-600">+ Masuk Keranjang</strong> untuk menambahkan produk ke antrean ini.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsBasketModalOpen(false)}
                    className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    Kembali ke Editor
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                    <span>Daftar produk yang siap disimpan:</span>
                    <button
                      onClick={handleClearBasket}
                      className="text-red-500 hover:text-red-700 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Kosongkan Semua</span>
                    </button>
                  </div>

                  {/* List of items in Basket */}
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
                    {wholesaleBasket.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-4 hover:bg-slate-50/70 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                            <span className="font-mono font-bold text-orange-600 text-xs bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                              {item.sku || 'TANPA SKU'}
                            </span>
                            <span className="font-bold text-xs text-slate-800 truncate max-w-xs">
                              {item.productName}
                            </span>
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase">
                              {item.unit || 'pcs'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              Ditambahkan {item.addedAt}
                            </span>
                          </div>

                          {/* Tiers Preview */}
                          <div className="flex items-center gap-2 flex-wrap text-xs">
                            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                              Harga Satuan: <strong className="text-blue-700">{formatIDR(item.normalPrice)}</strong>
                            </span>
                            {item.tiers.map((t, tIdx) => (
                              <span
                                key={t.id}
                                className="text-[11px] bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded font-medium"
                              >
                                T{tIdx + 1} ({t.minQty}{t.maxQty ? `-${t.maxQty}` : '+'} {item.unit}):{' '}
                                <strong className="font-bold text-amber-950">{formatIDR(t.price)}</strong>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Actions per item */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleLoadItemFromBasket(item)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Muat data produk ini ke editor untuk diperiksa / diubah"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleRemoveFromBasket(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Hapus dari antrean"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>Semua baris akan ditulis berurutan langsung ke kolom A-J sheet <strong>Harga Grosir</strong>.</span>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  onClick={() => setIsBasketModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  onClick={handleBatchSaveToSpreadsheet}
                  disabled={isSavingBatch || wholesaleBasket.length === 0}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isSavingBatch ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  <span>
                    {isSavingBatch
                      ? 'Menyimpan Semua...'
                      : `Simpan Semua (${wholesaleBasket.length} Produk) ke Spreadsheet`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BATCH SAVE SUCCESS / ERROR MODAL */}
      {batchResultModal?.show && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-emerald-50/70">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${batchResultModal.success ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                  {batchResultModal.success ? (
                    <CheckCheck className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-800">
                    {batchResultModal.success ? 'Batch Grosir Berhasil Disimpan!' : 'Gagal Menyimpan Batch'}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    ID Sheet: {TARGET_SPREADSHEET_ID}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBatchResultModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {batchResultModal.success ? (
                <div className="space-y-4">
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="font-bold text-sm">
                        {batchResultModal.count} Produk Grosir Berhasil Ditambahkan
                      </p>
                      <p className="text-emerald-800 mt-0.5">
                        Tercatat di Google Spreadsheet pada <strong>Baris {batchResultModal.startRow} s/d {batchResultModal.endRow}</strong> sheet <em>Harga Grosir</em>.
                      </p>
                    </div>
                  </div>

                  {/* List of saved SKUs */}
                  {batchResultModal.savedSkus && batchResultModal.savedSkus.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-700 block">
                        SKU yang Berhasil Disimpan:
                      </span>
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                        {batchResultModal.savedSkus.map((sku, i) => (
                          <span
                            key={i}
                            className="font-mono text-xs font-bold bg-white text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs"
                          >
                            <Check className="w-3 h-3 text-emerald-600" />
                            {sku}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900 flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-semibold">Terjadi kendala saat menyimpan batch:</p>
                      <p className="mt-1 font-mono text-[11px] bg-white/70 p-2 rounded border border-red-100 break-all">
                        {batchResultModal.message}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setBatchResultModal(null)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Tutup
              </button>
              {batchResultModal.url && (
                <a
                  href={batchResultModal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Google Spreadsheet</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FIREBASE AUTH DOMAIN ASSISTANCE MODAL */}
      <FirebaseAuthDomainModal
        isOpen={showDomainModal}
        onClose={() => setShowDomainModal(false)}
      />
    </div>
  );
}

