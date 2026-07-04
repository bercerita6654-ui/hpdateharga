/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Calculator,
  RefreshCw,
  ChevronDown,
  Settings,
  LogOut,
  Lock,
  Plus,
  Send,
  Inbox,
  Clock,
  Download,
  Search,
  Database,
  Percent,
  HelpCircle,
  Info,
  Copy,
  LayoutGrid,
  Sparkles,
  X
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import { Product, CartItem, CompetitorCartItem, Submission, Fees } from './types';
import { formatIDR, formatInput, parseInput } from './utils/helpers';

import BasicCalculator from './components/BasicCalculator';
import ServerQuickCalculator from './components/ServerQuickCalculator';
import SubmissionCard from './components/SubmissionCard';
import BrandModal from './components/BrandModal';
import CategoryModal from './components/CategoryModal';
import CartTable from './components/CartTable';
import CompetitorTab from './components/CompetitorTab';
import ShopeeTab from './components/ShopeeTab';
import CartProfitMarginChart from './components/CartProfitMarginChart';

const PRODUCT_DB_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTCxz1GPm7QU9IS1yBiSjvIdNTLUsvvplOCyT_R3XH4O-LuVbHoY_bXn1LTH5lpnlolJ29BhUgEdnFm/pub?gid=1428805476&single=true&output=csv';
const CATEGORY_DB_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRrRDnJctzeF3FC_-81KzNHZIX3epxC6WwdmIbhXBGl1rlRKvSUfsvsZCZtuiPyULe5b2wJXOIYK8hs/pub?gid=481142784&single=true&output=csv';
const FEES_DB_URL = 'https://docs.google.com/spreadsheets/d/1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI/gviz/tq?tqx=out:csv&sheet=BiayaMarketplace';
const HPP_DB_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTCxz1GPm7QU9IS1yBiSjvIdNTLUsvvplOCyT_R3XH4O-LuVbHoY_bXn1LTH5lpnlolJ29BhUgEdnFm/pub?gid=1564332470&single=true&output=csv';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwgZLlREewOckszXJsF2rQYDbXlNq9UxB314iDJ9JQywdSsVkubRdHka44vaHsIYCgw/exec';

const ITEMS_PER_PAGE = 5;

// Helper function to calculate bigram-based string similarity (Sørensen-Dice) combined with word overlap
const calculateStringSimilarity = (str1: string, str2: string): number => {
  const s1 = String(str1 || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  const s2 = String(str2 || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
  
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  // Word-level overlap
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  let intersection = 0;
  for (const w of set1) {
    if (set2.has(w)) intersection++;
  }
  
  const wordOverlap = (2 * intersection) / (set1.size + set2.size);

  // Bigram-level overlap
  const getBigrams = (str: string) => {
    const bigrams = new Set<string>();
    const cleanStr = str.replace(/\s+/g, '');
    for (let i = 0; i < cleanStr.length - 1; i++) {
      bigrams.add(cleanStr.substring(i, i + 2));
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);
  
  let bigramIntersection = 0;
  if (b1.size > 0 && b2.size > 0) {
    for (const val of b1) {
      if (b2.has(val)) {
        bigramIntersection++;
      }
    }
    const bigramOverlap = (2 * bigramIntersection) / (b1.size + b2.size);
    return wordOverlap * 0.4 + bigramOverlap * 0.6;
  }
  
  return wordOverlap;
};

// Helper function to calculate Levenshtein distance similarity for SKUs/codes
const calculateLevenshteinSimilarity = (str1: string, str2: string): number => {
  const s1 = String(str1 || '').toLowerCase().trim();
  const s2 = String(str2 || '').toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const m = s1.length;
  const n = s2.length;
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let j = 1; j <= n; j++) {
    for (let i = 1; i <= m; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1, // deletion
        d[i][j - 1] + 1, // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const maxLen = Math.max(m, n);
  return (maxLen - d[m][n]) / maxLen;
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const [, setDb] = useState<any>(null);
  const [, setAppId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  const [product, setProduct] = useState({ hpp: 50000, basePrice: 100000 });
  const [productList, setProductList] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedSku, setSelectedSku] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [competitorCart, setCompetitorCart] = useState<CompetitorCartItem[]>([]);
  const [submissionNote, setSubmissionNote] = useState('');
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | number | null>(null);

  const [compForm, setCompForm] = useState({
    ownPrice: '',
    compAName: '',
    compAPrice: '',
    compALink: '',
    compBName: '',
    compBPrice: '',
    compBLink: ''
  });

  const [rounding, setRounding] = useState('none');
  const [massMargin, setMassMargin] = useState('');
  const [massFee, setMassFee] = useState('');
  const [massPack, setMassPack] = useState('');
  const [massHppRef, setMassHppRef] = useState('');

  const [showAddBrandModal, setShowAddBrandModal] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [skuCategoryMap, setSkuCategoryMap] = useState<Record<string, string>>({});
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('');

  const [showSettings, setShowSettings] = useState(false);
  const [isSavingFees, setIsSavingFees] = useState(false);
  const [showBasicCalc, setShowBasicCalc] = useState(false);

  const [cartPage, setCartPage] = useState(1);
  const [cartItemsPerPage, setCartItemsPerPage] = useState(10);

  const [submissions, setSubmissions] = useState<Submission[]>(() => {
    try {
      const saved = localStorage.getItem('marketplace_submissions');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((s: any) => ({
        ...s,
        items: Array.isArray(s.items) ? s.items.filter((i: any) => i) : [],
        revisions: s.revisions || {}
      }));
    } catch (e) {
      return [];
    }
  });

  const [serverDrafts, setServerDrafts] = useState<Record<string, any>>({});
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | number | null>(null);
  const [activeView, setActiveView] = useState<'calculator' | 'competitor' | 'inbox' | 'history' | 'shopee' | 'gomall_shopee'>('calculator');
  const [displayLimit, setDisplayLimit] = useState(100);

  const [fees, setFees] = useState<Fees>(() => {
    try {
      const localFees = localStorage.getItem('marketplace_fees');
      if (localFees) {
        const parsed = JSON.parse(localFees);
        if (parsed.campaignFee === undefined) {
          parsed.campaignFee = 5.0;
        }
        return parsed;
      }
    } catch (e) {
      // ignore
    }
    return {
      adminFee: 11.0,
      layananXtra: 12.5,
      marketplaceProcessingFee: 1250,
      jubelioProcessingFee: 350,
      insurance: 0.5,
      packingFee: 1000,
      komisiAMS: 2.0,
      campaignFee: 5.0
    };
  });

  const [useSmartMargin, setUseSmartMargin] = useState<boolean>(() => {
    return localStorage.getItem('use_smart_margin') === 'true';
  });

  const [smartMargins, setSmartMargins] = useState<Record<string, number>>(() => {
    const defaultMargins = {
      'aksesoris': 30,
      'accessories': 30,
      'elektronik': 20,
      'electronics': 20,
      'fashion': 25,
      'pakaian': 25,
      'kosmetik': 25,
      'beauty': 25,
      'makanan': 20,
      'f&b': 20,
      'default': 20
    };
    try {
      const saved = localStorage.getItem('smart_margins');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Automatically migrate old, lower margins to the new 20%-30% minimum limits
        let upgraded = false;
        Object.keys(defaultMargins).forEach((key) => {
          const k = key as keyof typeof defaultMargins;
          if (parsed[k] === undefined || parsed[k] < defaultMargins[k]) {
            parsed[k] = defaultMargins[k];
            upgraded = true;
          }
        });
        if (upgraded) {
          localStorage.setItem('smart_margins', JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch (e) {
      // ignore
    }
    return defaultMargins;
  });

  useEffect(() => {
    localStorage.setItem('use_smart_margin', String(useSmartMargin));
  }, [useSmartMargin]);

  useEffect(() => {
    localStorage.setItem('marketplace_fees', JSON.stringify(fees));
  }, [fees]);

  useEffect(() => {
    if (categories.length > 0) {
      let changed = false;
      const updated = { ...smartMargins };
      categories.forEach(cat => {
        const catLower = cat.toLowerCase().trim();
        if (updated[catLower] === undefined || updated[catLower] < 20) {
          updated[catLower] = updated[catLower] !== undefined ? Math.max(20, updated[catLower]) : 20;
          changed = true;
        }
      });
      if (changed) {
        setSmartMargins(updated);
        localStorage.setItem('smart_margins', JSON.stringify(updated));
      }
    }
  }, [categories]);

  const getSmartMarginForSku = useCallback((sku: string): number => {
    const cat = skuCategoryMap[sku];
    if (!cat) return smartMargins['default'] || 10;
    
    const catLower = cat.toLowerCase().trim();
    
    // Check exact matches
    for (const key of Object.keys(smartMargins)) {
      if (key.toLowerCase() === catLower) {
        return smartMargins[key];
      }
    }
    
    // Check substring matches
    for (const key of Object.keys(smartMargins)) {
      if (catLower.includes(key.toLowerCase()) || key.toLowerCase().includes(catLower)) {
        return smartMargins[key];
      }
    }
    
    return smartMargins['default'] || 10;
  }, [skuCategoryMap, smartMargins]);

  const applySmartMarginsToCart = () => {
    setCart(prevCart =>
      prevCart.map(item => {
        const margin = getSmartMarginForSku(item.sku);
        const fee = item.processingFee || 0;
        const packFee = item.packingFee || 0;
        const prices = calculateItemPrices(item.hpp, margin, fee, packFee, item.customQtyValue, rounding, item.partai);
        return {
          ...item,
          margin,
          sellingPrice: prices.sellingPrice,
          priceMin3: prices.priceMin3,
          priceMin6: prices.priceMin6,
          priceMin12: prices.priceMin12,
          priceCustom: prices.priceCustom
        };
      })
    );
    showNotif('Smart Margin berhasil diterapkan ke semua item di keranjang!');
  };

  const [customQty, setCustomQty] = useState(24);
  const [showCustomQty, setShowCustomQty] = useState(false);
  const [showProductList, setShowProductList] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notification, setNotification] = useState('');

  const [pendingPage, setPendingPage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [pendingFilter, setPendingFilter] = useState('all');
  const [completedFilter, setCompletedFilter] = useState('all');

  const showNotif = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 4000);
  };

  const handleCopyPrice = (price: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!price) return;
    const textToCopy = Math.round(price).toString();

    const fallbackCopy = (text: string) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.width = "2em";
      textArea.style.height = "2em";
      textArea.style.padding = "0";
      textArea.style.border = "none";
      textArea.style.outline = "none";
      textArea.style.boxShadow = "none";
      textArea.style.background = "transparent";

      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        // ignore
      }
      document.body.removeChild(textArea);
    };

    fallbackCopy(textToCopy);
    showNotif(`Harga disalin: ${textToCopy}`);
  };

  const calculateRecommendation = useCallback(
    (marginPercent: number, qty = 1) => {
      const selectedProductData = productList.find(p => p.sku === selectedSku);
      const safeHpp = selectedProductData && selectedProductData.partai 
        ? Number(selectedProductData.partai) 
        : (Number(product.hpp) || 0);
      const totalPercentFee =
        (Number(fees.adminFee) || 0) +
        (Number(fees.layananXtra) || 0) +
        (Number(fees.insurance) || 0) +
        (Number(fees.komisiAMS) || 0) +
        (Number(fees.campaignFee) || 0);
      const hppWithAdmin = safeHpp * (1 + totalPercentFee / 100);
      const withMargin = hppWithAdmin * (1 + marginPercent / 100);

      const activeProcessingFee =
        (Number(fees.marketplaceProcessingFee) || 0) + (Number(fees.jubelioProcessingFee) || 0);
      const activePackingFee = Number(fees.packingFee) || 0;
      const fixedFeePerItem = (activeProcessingFee + activePackingFee) / (qty || 1);

      const rawPrice = withMargin + fixedFeePerItem;

      if (rounding === '100') return Math.ceil(rawPrice / 100) * 100;
      if (rounding === '500') return Math.ceil(rawPrice / 500) * 500;
      if (rounding === '1000') return Math.ceil(rawPrice / 1000) * 1000;
      return Math.round(rawPrice);
    },
    [
      selectedSku,
      productList,
      product.hpp,
      fees.adminFee,
      fees.layananXtra,
      fees.insurance,
      fees.komisiAMS,
      fees.campaignFee,
      fees.marketplaceProcessingFee,
      fees.jubelioProcessingFee,
      fees.packingFee,
      rounding
    ]
  );

  const calculateItemPrices = useCallback(
    (hpp: number, margin: number, fee: number, packFee: number, customQtyValue: number | null, currentRounding: string, partai?: number) => {
      const safeHpp = Number(hpp) || 0;
      const baseCost = partai !== undefined && Number(partai) > 0 ? Number(partai) : safeHpp;
      const totalPercentFee =
        (Number(fees.adminFee) || 0) +
        (Number(fees.layananXtra) || 0) +
        (Number(fees.insurance) || 0) +
        (Number(fees.komisiAMS) || 0) +
        (Number(fees.campaignFee) || 0);

      const calc = (qty: number) => {
        const hppWithAdmin = baseCost * (1 + totalPercentFee / 100);
        const withMargin = hppWithAdmin * (1 + margin / 100);
        const fixedFeePerItem = (fee + packFee) / (qty || 1);
        const rawPrice = withMargin + fixedFeePerItem;
        if (currentRounding === '100') return Math.ceil(rawPrice / 100) * 100;
        if (currentRounding === '500') return Math.ceil(rawPrice / 500) * 500;
        if (currentRounding === '1000') return Math.ceil(rawPrice / 1000) * 1000;
        return Math.round(rawPrice);
      };

      return {
        sellingPrice: calc(1),
        priceMin3: calc(3),
        priceMin6: calc(6),
        priceMin12: calc(12),
        priceCustom: customQtyValue ? calc(customQtyValue) : null
      };
    },
    [fees.adminFee, fees.layananXtra, fees.insurance, fees.komisiAMS, fees.campaignFee]
  );

  useEffect(() => {
    if (selectedSku) {
      const autoPrice = calculateRecommendation(10, 1);
      if (autoPrice > 0) {
        setProduct(prev => ({ ...prev, basePrice: autoPrice }));
      }
    }
  }, [selectedSku, calculateRecommendation]);

  useEffect(() => {
    setCartPage(1);
  }, [cartItemsPerPage]);

  useEffect(() => {
    const maxPage = Math.ceil(cart.length / cartItemsPerPage) || 1;
    if (cartPage > maxPage) {
      setCartPage(maxPage);
    }
  }, [cart.length, cartItemsPerPage, cartPage]);

  const userLower = String(currentUser || '').toLowerCase();
  const isServer = ['server', 'bobby'].includes(userLower);
  const isAdmin = ['admin', 'stefany', 'isa', 'winda'].includes(userLower);
  const canEditSettings = isAdmin || userLower === 'bobby';
  const canSeeHPP = isServer;

  const filteredProducts = productList.filter(p => {
    const matchesCategory = !selectedCategoryFilter || skuCategoryMap[p.sku] === selectedCategoryFilter;
    if (!matchesCategory) return false;

    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return String(p.name).toLowerCase().includes(term) || String(p.sku).toLowerCase().includes(term);
  });

  const getSuggestions = (term: string) => {
    if (!term.trim()) return [];
    
    const results: {
      product: Product;
      score: number;
      matchType: 'name' | 'sku' | 'both';
      percentage: number;
    }[] = [];
    
    for (const p of productList) {
      if (selectedCategoryFilter && skuCategoryMap[p.sku] !== selectedCategoryFilter) {
        continue;
      }
      // Name similarity
      const nameSim = calculateStringSimilarity(p.name, term);
      // SKU similarity
      const skuSim = calculateLevenshteinSimilarity(p.sku, term);
      
      const maxSim = Math.max(nameSim, skuSim);
      if (maxSim > 0.15) { // Threshold to prevent irrelevant matches
        results.push({
          product: p,
          score: maxSim,
          matchType: skuSim > nameSim ? 'sku' : 'name',
          percentage: Math.round(maxSim * 100)
        });
      }
    }
    
    // Sort descending by score
    return results.sort((a, b) => b.score - a.score);
  };

  const selectedProductData = productList.find(p => p.sku === selectedSku);
  const productUnit = selectedProductData?.unit ? ` / ${selectedProductData.unit}` : ' / unit';

  const calculateTier = () => {
    const totalPercent =
      (Number(fees.adminFee) || 0) +
      (Number(fees.layananXtra) || 0) +
      (Number(fees.insurance) || 0) +
      (Number(fees.komisiAMS) || 0) +
      (Number(fees.campaignFee) || 0);
    const decimal = totalPercent / 100;
    const fixed =
      (Number(fees.marketplaceProcessingFee) || 0) +
      (Number(fees.jubelioProcessingFee) || 0) +
      (Number(fees.packingFee) || 0);

    const safeBase = Number(product.basePrice) || 0;
    const safeHpp = Number(product.hpp) || 0;

    const sellingPrice = safeBase;

    const percentFeeVal = sellingPrice * decimal;
    const totalDed = percentFeeVal + fixed;
    const net = sellingPrice - totalDed;
    const profit = net - safeHpp;
    const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;

    return {
      sellingPrice,
      percentFeeValue: percentFeeVal,
      fixedFeeValue: fixed,
      totalDeduction: totalDed,
      netRevenue: net,
      profit,
      margin,
      totalHPP: safeHpp
    };
  };

  const t1Result = calculateTier();

  const pendingList = submissions.filter(s => s.status === 'pending' || s.status === 'revision');
  const completedList = submissions.filter(s => ['completed', 'approved', 'rejected'].includes(s.status));

  useEffect(() => {
    const initFirebase = async () => {
      try {
        const firebaseConfigStr = (window as any).__firebase_config;
        if (firebaseConfigStr) {
          const firebaseConfig = JSON.parse(firebaseConfigStr);
          const app = initializeApp(firebaseConfig);
          const auth = getAuth(app);
          const dbRef = getFirestore(app);
          const aId = (window as any).__app_id || 'default';
          setDb(dbRef);
          setAppId(aId);
          await signInAnonymously(auth);
          setIsOnline(true);
        } else {
          setIsOnline(false);
        }
      } catch (e) {
        setIsOnline(false);
      }
    };
    initFirebase();
  }, []);

  const fetchFeesData = useCallback(async () => {
    try {
      const res = await fetch(`${FEES_DB_URL}&t=${Date.now()}`).catch(() => null);
      if (!res || !res.ok) return;
      const text = await res.text();
      const parseLineLocal = (str: string) => {
        const arr = [];
        let q = false,
          s = 0;
        for (let i = 0; i < str.length; i++) {
          if (str[i] === '"') q = !q;
          else if (str[i] === ',' && !q) {
            arr.push(str.substring(s, i));
            s = i + 1;
          }
        }
        arr.push(str.substring(s));
        return arr.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      };
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length > 1) {
        const headers = parseLineLocal(lines[0]);
        const values = parseLineLocal(lines[1]);
        setFees(prev => {
          const updated = { ...prev };
          headers.forEach((h, i) => {
            const key = h.trim() as keyof Fees;
            const val = Number(values[i]);
            if (!isNaN(val) && Object.prototype.hasOwnProperty.call(updated, key)) {
              updated[key] = val;
            }
          });
          localStorage.setItem('marketplace_fees', JSON.stringify(updated));
          return updated;
        });
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const fetchCsvData = useCallback(async () => {
    setIsLoading(true);
    try {
      const resProd = await fetch(`${PRODUCT_DB_URL}&t=${Date.now()}`).catch(() => null);
      if (!resProd || !resProd.ok) return;
      const textProd = await resProd.text();
      const linesProd = textProd.split('\n');
      if (linesProd.length < 2) return;

      const parseLineLocal = (str: string) => {
        const arr = [];
        let q = false,
          s = 0;
        for (let i = 0; i < str.length; i++) {
          if (str[i] === '"') q = !q;
          else if (str[i] === ',' && !q) {
            arr.push(str.substring(s, i));
            s = i + 1;
          }
        }
        arr.push(str.substring(s));
        return arr.map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      };

      const numHelper = (v: string | null | undefined): number => {
        if (!v) return 0;
        let s = v.replace(/[^0-9.,-]/g, '');
        if (s.endsWith(',00') || s.endsWith('.00')) s = s.slice(0, -3);
        return Number(s.replace(/[.,]/g, '')) || 0;
      };

      const headerProd = parseLineLocal(linesProd[0]).map(v => v.toLowerCase());
      const idxProd = {
        name: headerProd.findIndex(h => h.includes('description') || h.includes('nama') || h.includes('produk')),
        sku: headerProd.findIndex(h => h.includes('code') || h.includes('sku') || h.includes('kode')),
        unit: headerProd.findIndex(h => h.includes('unit')),
        ecer: headerProd.findIndex(h => h.includes('ecer') || h.includes('retail')),
        grosir: headerProd.findIndex(h => h.includes('grosir')),
        partai: headerProd.findIndex(h => h.includes('partai'))
      };

      let products: Product[] = linesProd
        .slice(1)
        .map(l => {
          if (!l.trim()) return null;
          const r = parseLineLocal(l);
          if (r.length < 3) return null;
          return {
            name: r[idxProd.name] || 'Produk',
            sku: r[idxProd.sku] || '-',
            unit: r[idxProd.unit] || 'pcs',
            hpp: 0,
            eceran: numHelper(r[idxProd.ecer]),
            grosir: numHelper(r[idxProd.grosir]),
            partai: numHelper(r[idxProd.partai])
          };
        })
        .filter((p): p is Product => p !== null && p.name !== 'Produk');

      try {
        const resHpp = await fetch(`${HPP_DB_URL}&t=${Date.now()}`).catch(() => null);
        if (resHpp && resHpp.ok) {
          const textHpp = await resHpp.text();
          const linesHpp = textHpp.split('\n');
          if (linesHpp.length > 1) {
            const hppMap: Record<string, number> = {};
            const headerHpp = parseLineLocal(linesHpp[0]).map(v => v.toLowerCase().trim());

            let hppIdx = headerHpp.findIndex(h => h === 'hpp akhir' || h.includes('hpp akhir'));
            if (hppIdx === -1) hppIdx = 7;
            const skuIdx = 0;

            linesHpp.slice(1).forEach(l => {
              if (!l.trim()) return;
              const r = parseLineLocal(l);
              const skuStr = r[skuIdx] ? r[skuIdx].trim() : '';
              const hppVal = numHelper(r[hppIdx]);
              if (skuStr) {
                hppMap[skuStr] = hppVal;
              }
            });
            products = products.map(p => ({
              ...p,
              hpp: hppMap[p.sku.trim()] || p.hpp || 0
            }));
          }
        }
      } catch (errHpp) {
        // ignore
      }

      setProductList(products);

      try {
        const resCat = await fetch(`${CATEGORY_DB_URL}&t=${Date.now()}`).catch(() => null);
        if (resCat && resCat.ok) {
          const textCat = await resCat.text();
          const linesCat = textCat.split('\n');
          if (linesCat.length > 1) {
            const headerCat = parseLineLocal(linesCat[0]).map(v => v.toLowerCase().trim());
            const idxCatSku = headerCat.findIndex(h => h === 'sku' || h.includes('sku') || h.includes('kode'));
            const idxCatType = headerCat.findIndex(h => h === 'type' || h.includes('type') || h.includes('tipe'));

            if (idxCatSku !== -1 && idxCatType !== -1) {
              const map: Record<string, string> = {};
              const catSet = new Set<string>();
              linesCat.slice(1).forEach(l => {
                if (!l.trim()) return;
                const r = parseLineLocal(l);
                if (r.length > Math.max(idxCatSku, idxCatType)) {
                  const skuStr = r[idxCatSku];
                  const typeStr = r[idxCatType];
                  if (skuStr && typeStr) {
                    map[skuStr] = typeStr;
                    catSet.add(typeStr);
                  }
                }
              });
              setSkuCategoryMap(map);
              setCategories(Array.from(catSet).sort());
            }
          }
        }
      } catch (errCat) {
        // ignore
      }
    } catch (e) {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchHistoryData = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`${APPS_SCRIPT_URL}?action=get&t=${Date.now()}`).catch(() => null);
      if (res && res.ok) {
        const json = await res.json();
        if (json.status === 'success' && Array.isArray(json.data)) {
          const cleanData = json.data
            .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .map((d: any) => ({
              ...d,
              items: Array.isArray(d.items) ? d.items.filter((i: any) => i) : [],
              revisions: d.revisions || {}
            }));
          setSubmissions(cleanData);
        }
      }
    } catch (e) {
      // ignore
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      if (productList.length === 0) fetchCsvData();
      fetchHistoryData();
      fetchFeesData();
      const interval = setInterval(fetchHistoryData, 60000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, fetchCsvData, fetchHistoryData, fetchFeesData, productList.length]);

  useEffect(() => {
    try {
      localStorage.setItem('marketplace_submissions', JSON.stringify(submissions));
    } catch (e) {
      // ignore
    }
  }, [submissions]);

  const handleProductChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProduct({ ...product, [name]: parseInput(value) });
  };

  const handleSelectProduct = (selectedProd: Product) => {
    setSelectedSku(selectedProd.sku);
    setProduct({
      hpp: selectedProd.hpp || 0,
      basePrice: selectedProd.eceran
    });
    setShowProductList(false);
    setSearchTerm('');
  };

  const addToCart = () => {
    if (!selectedSku) return;

    const margin = useSmartMargin ? getSmartMarginForSku(selectedSku) : 10;
    const currentProcFee = (Number(fees.marketplaceProcessingFee) || 0) + (Number(fees.jubelioProcessingFee) || 0);
    const currentPackFee = Number(fees.packingFee) || 0;

    let finalCustomQty = null;
    if (showCustomQty && customQty > 1) {
      finalCustomQty = customQty;
    }

    const prices = calculateItemPrices(product.hpp, margin, currentProcFee, currentPackFee, finalCustomQty, rounding, selectedProductData?.partai);

    setCart([
      ...cart,
      {
        id: Date.now(),
        addedAt: new Date().toISOString(),
        sku: selectedSku,
        name: selectedProductData?.name || 'Unknown',
        unit: selectedProductData?.unit || 'unit',
        hpp: product.hpp,
        eceran: selectedProductData?.eceran || product.basePrice,
        grosir: selectedProductData?.grosir || 0,
        partai: selectedProductData?.partai || 0,
        margin: margin,
        processingFee: currentProcFee,
        packingFee: currentPackFee,
        sellingPrice: prices.sellingPrice,
        priceMin3: prices.priceMin3,
        priceMin6: prices.priceMin6,
        priceMin12: prices.priceMin12,
        priceCustom: prices.priceCustom,
        customQtyValue: finalCustomQty
      }
    ]);
  };

  const processBatchAdd = (productsArray: Product[], onSuccessCallback?: () => void) => {
    if (productsArray.length === 0) return;

    const newItems: CartItem[] = [];
    const currentProcFee = (Number(fees.marketplaceProcessingFee) || 0) + (Number(fees.jubelioProcessingFee) || 0);
    const currentPackFee = Number(fees.packingFee) || 0;

    productsArray.forEach((prod, index) => {
      if (!cart.some(c => c.sku === prod.sku)) {
        let finalCustomQty = null;
        if (showCustomQty && customQty > 1) {
          finalCustomQty = customQty;
        }

        const margin = useSmartMargin ? getSmartMarginForSku(prod.sku) : 10;
        const prices = calculateItemPrices(prod.hpp, margin, currentProcFee, currentPackFee, finalCustomQty, rounding, prod.partai);

        newItems.push({
          id: Date.now() + index,
          addedAt: new Date().toISOString(),
          sku: prod.sku,
          name: prod.name || 'Unknown',
          unit: prod.unit || 'unit',
          hpp: prod.hpp || 0,
          eceran: prod.eceran,
          grosir: prod.grosir || 0,
          partai: prod.partai || 0,
          margin: margin,
          processingFee: currentProcFee,
          packingFee: currentPackFee,
          sellingPrice: prices.sellingPrice,
          priceMin3: prices.priceMin3,
          priceMin6: prices.priceMin6,
          priceMin12: prices.priceMin12,
          priceCustom: prices.priceCustom,
          customQtyValue: finalCustomQty
        });
      }
    });

    if (newItems.length > 0) {
      setCart(prev => [...prev, ...newItems]);
      showNotif(`${newItems.length} produk berhasil ditambahkan ke daftar simpan.`);
    } else {
      showNotif('Semua produk dari pencarian ini sudah ada di daftar simpan.');
    }

    if (onSuccessCallback) onSuccessCallback();
  };

  const updateCartItem = (id: number, field: string, value: any) => {
    setCart(
      cart.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value === '' ? '' : Number(value) };
          const m = updatedItem.margin;
          const fee = updatedItem.processingFee || 0;
          const packFee = updatedItem.packingFee || 0;

          const prices = calculateItemPrices(updatedItem.hpp, m, fee, packFee, item.customQtyValue, rounding, updatedItem.partai);

          return {
            ...updatedItem,
            processingFee: field === 'processingFee' ? (value === '' ? '' : Number(value)) : updatedItem.processingFee,
            packingFee: field === 'packingFee' ? (value === '' ? '' : Number(value)) : updatedItem.packingFee,
            sellingPrice: prices.sellingPrice,
            priceMin3: prices.priceMin3,
            priceMin6: prices.priceMin6,
            priceMin12: prices.priceMin12,
            priceCustom: prices.priceCustom
          };
        }
        return item;
      })
    );
  };

  const handleRoundingChange = (newRounding: string) => {
    setRounding(newRounding);
    setCart(prevCart =>
      prevCart.map(item => {
        const fee = item.processingFee || 0;
        const packFee = item.packingFee || 0;
        const prices = calculateItemPrices(item.hpp, item.margin, fee, packFee, item.customQtyValue, newRounding, item.partai);
        return {
          ...item,
          sellingPrice: prices.sellingPrice,
          priceMin3: prices.priceMin3,
          priceMin6: prices.priceMin6,
          priceMin12: prices.priceMin12,
          priceCustom: prices.priceCustom
        };
      })
    );
  };

  // Automatically recalculate cart items whenever fees change
  useEffect(() => {
    setCart(prevCart => {
      if (prevCart.length === 0) return prevCart;
      let changed = false;
      const updated = prevCart.map(item => {
        const fee = item.processingFee || 0;
        const packFee = item.packingFee || 0;
        const prices = calculateItemPrices(
          item.hpp,
          item.margin,
          fee,
          packFee,
          item.customQtyValue,
          rounding,
          item.partai
        );
        if (
          item.sellingPrice !== prices.sellingPrice ||
          item.priceMin3 !== prices.priceMin3 ||
          item.priceMin6 !== prices.priceMin6 ||
          item.priceMin12 !== prices.priceMin12 ||
          item.priceCustom !== prices.priceCustom
        ) {
          changed = true;
          return {
            ...item,
            sellingPrice: prices.sellingPrice,
            priceMin3: prices.priceMin3,
            priceMin6: prices.priceMin6,
            priceMin12: prices.priceMin12,
            priceCustom: prices.priceCustom
          };
        }
        return item;
      });
      return changed ? updated : prevCart;
    });
  }, [fees, calculateItemPrices, rounding]);

  const applyMassUpdate = () => {
    if (!massMargin && !massFee && massPack === '' && !massHppRef) return;

    setCart(prevCart =>
      prevCart.map(item => {
        const newMargin = massMargin ? Number(massMargin) : item.margin;
        const newFee = massFee !== '' ? Number(massFee) : item.processingFee || 0;
        const newPackFee = massPack !== '' ? Number(massPack) : item.packingFee || 0;
        const newHpp = massHppRef ? (item[massHppRef as keyof CartItem] as number) || 0 : item.hpp;

        const prices = calculateItemPrices(
          newHpp,
          newMargin,
          newFee,
          newPackFee,
          item.customQtyValue,
          rounding,
          massHppRef ? undefined : item.partai
        );

        return {
          ...item,
          hpp: newHpp,
          margin: newMargin,
          processingFee: newFee,
          packingFee: newPackFee,
          sellingPrice: prices.sellingPrice,
          priceMin3: prices.priceMin3,
          priceMin6: prices.priceMin6,
          priceMin12: prices.priceMin12,
          priceCustom: prices.priceCustom
        };
      })
    );

    showNotif('Update massal berhasil diterapkan!');
    setMassMargin('');
    setMassFee('');
    setMassPack('');
    setMassHppRef('');
  };

  const handleSaveFees = async () => {
    setIsSavingFees(true);
    try {
      localStorage.setItem('marketplace_fees', JSON.stringify(fees));
      localStorage.setItem('smart_margins', JSON.stringify(smartMargins));
      localStorage.setItem('use_smart_margin', String(useSmartMargin));
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'updateFees',
          sheetId: '1HSUiF20wpTJbfYdpOE08gtbRzm1N8IXOrZDs-KGSvnI',
          sheetName: 'BiayaMarketplace',
          payload: fees
        })
      });
      showNotif('Pengaturan Berhasil Disimpan!');
      setShowSettings(false);
    } catch (e) {
      showNotif('Gagal menyimpan biaya');
    } finally {
      setIsSavingFees(false);
    }
  };

  const handleEditSubmission = (sub: Submission) => {
    const isCompetitorSub = sub.items?.[0]?.isCompetitorData;
    if (isCompetitorSub) {
      setCompetitorCart(sub.items || []);
      setActiveView('competitor');
    } else {
      setCart(sub.items || []);
      setActiveView('calculator');
    }
    setSubmissionNote(sub.clientNote || '');
    setEditingSubmissionId(sub.id);
    setExpandedSubmissionId(null);
  };

  const handleSendSubmission = async (type = 'margin') => {
    const activeCart = type === 'competitor' ? competitorCart : cart;
    if (activeCart.length === 0) return;
    setIsSending(true);
    const isEditing = !!editingSubmissionId;
    const subId = isEditing ? editingSubmissionId : Date.now().toString();
    const payload = {
      id: subId,
      sender: currentUser,
      timestamp: new Date().toISOString(),
      status: 'pending',
      isRead: false,
      items: activeCart.map(i => ({ ...i, itemStatus: 'pending' })),
      totalItems: activeCart.length,
      serverNote: '',
      revisions: { _clientNote: submissionNote },
      clientNote: submissionNote
    };
    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: isEditing ? 'update' : 'add', payload })
      });
      setSubmissions(prev => {
        const exists = prev.find(i => i.id === subId);
        if (exists && !isEditing) return prev;
        return isEditing ? prev.map(p => (p.id === subId ? { ...p, ...payload } as Submission : p)) : [payload as Submission, ...prev];
      });
      if (type === 'competitor') setCompetitorCart([]);
      else setCart([]);
      setSubmissionNote('');
      setEditingSubmissionId(null);
      setActiveView(isServer ? 'inbox' : 'history');
      showNotif('Berhasil dikirim!');
      setTimeout(fetchHistoryData, 2000);
    } catch (e) {
      showNotif('Gagal kirim');
    } finally {
      setIsSending(false);
    }
  };

  const handleUpdateStatus = async (id: string | number, globalStatus: string) => {
    const draft = serverDrafts[id] || { note: '', revisions: {}, checkedItems: {} };
    const currentSub = submissions.find(s => s.id === id);
    if (!currentSub) return;
    let updatedItems = [];
    if (globalStatus === 'pending' || globalStatus === 'revision') {
      updatedItems = (currentSub.items || []).map(item => ({ ...item, itemStatus: globalStatus }));
    } else {
      updatedItems = (currentSub.items || []).map(item => ({
        ...item,
        itemStatus: globalStatus === 'reviewed' ? (draft.checkedItems?.[item.sku] ? 'approved' : 'rejected') : globalStatus
      }));
    }
    const finalStatus = globalStatus === 'reviewed' ? 'completed' : globalStatus;
    const payload = {
      id: id,
      status: finalStatus,
      handledAt: new Date().toISOString(),
      serverNote: draft.note,
      revisions: { ...currentSub.revisions, ...draft.revisions },
      items: updatedItems,
      isRead: true
    };
    setSubmissions(prev => prev.map(sub => (sub.id === id ? { ...sub, ...payload } as Submission : sub)));
    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'update', payload })
    }).catch(() => null);
    const newDrafts = { ...serverDrafts };
    delete newDrafts[id];
    setServerDrafts(newDrafts);
  };

  const handleServerDraftChange = (subId: string | number, field: string, val: any, sku?: string) => {
    setServerDrafts(prev => {
      const d = prev[subId] || { note: '', revisions: {}, checkedItems: {} };
      if (field === 'note') return { ...prev, [subId]: { ...d, note: val } };
      if (field === 'revision' && sku) return { ...prev, [subId]: { ...d, revisions: { ...d.revisions, [sku]: val } } };
      if (field === 'check' && sku) {
        const c = { ...d.checkedItems };
        if (c[sku]) delete c[sku];
        else c[sku] = true;
        return { ...prev, [subId]: { ...d, checkedItems: c } };
      }
      return prev;
    });
  };

  const handleToggleExpand = (id: string | number) => {
    if (expandedSubmissionId === id) setExpandedSubmissionId(null);
    else {
      setExpandedSubmissionId(id);
      if (isServer) handleMarkAsRead(id);
    }
  };

  const handleMarkAsRead = (id: string | number) => {
    const sub = submissions.find(s => s.id === id);
    if (sub && !sub.isRead) {
      setSubmissions(prev => prev.map(s => (s.id === id ? { ...s, isRead: true } : s)));
      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'markRead', payload: { id: id } })
      }).catch(() => null);
    }
  };

  const handleRefreshSubmissions = async () => {
    setIsRefreshing(true);
    await fetchHistoryData();
    setIsRefreshing(false);
  };

  const downloadCSV = (targetData: CartItem[]) => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const csvFileName = `Update Harga (${dd}-${mm}-${yyyy}).csv`;

    const escapeCSV = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      const noNewlines = str.replace(/[\r\n]+/g, ' ');
      return `"${noNewlines.replace(/"/g, '""')}"`;
    };

    const formatSKU = (sku: string) => {
      if (!sku) return '""';
      const cleanSku = String(sku).replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
      return `"=""${cleanSku}"""`;
    };

    const h = ["Tgl", "SKU", "Nama"];
    if (canSeeHPP) h.push("HPP");
    h.push("Eceran", "Grosir", "Partai", "Margin", "Biaya Layanan", "Biaya Packing", "Tayang (Sat)", "Min 3", "Min 6", "Min 12", "Custom Min", "Harga Custom");
    const hdr = h.map(escapeCSV);

    const row = targetData.map(d => {
      const r = [escapeCSV(d.addedAt), formatSKU(d.sku), escapeCSV(d.name)];
      if (canSeeHPP) r.push(escapeCSV(d.hpp));
      r.push(
        escapeCSV(d.eceran),
        escapeCSV(d.grosir),
        escapeCSV(d.partai),
        escapeCSV(`${d.margin || 10}%`),
        escapeCSV(d.processingFee || 0),
        escapeCSV(d.packingFee || 0),
        escapeCSV(d.sellingPrice),
        escapeCSV(d.priceMin3),
        escapeCSV(d.priceMin6),
        escapeCSV(d.priceMin12),
        escapeCSV(d.customQtyValue || '-'),
        escapeCSV(d.priceCustom || '-')
      );
      return r;
    });

    const csv = [hdr.join(','), ...row.map(r => r.join(','))].join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName;
    a.click();
  };

  const downloadJubelioCSV = (targetData: CartItem[]) => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const csvFileName = `Jubelio_Update_Harga_${dd}-${mm}-${yyyy}.csv`;

    const toRawCSV = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/[\r\n]+/g, ' ');
      if (str.includes(',') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const hdr = [
      "item_code",
      "Shopee-Bali Stationery",
      "Shopee-Go Mall",
      "Shop | Tokopedia-balistationery",
      "Shop | Tokopedia-gomall.id",
      "default"
    ].map(toRawCSV);

    const row = targetData.map(d => {
      const price = toRawCSV(d.sellingPrice);
      const sku = toRawCSV(d.sku);
      return [sku, price, price, price, price, price];
    });

    const csv = [hdr.join(','), ...row.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName;
    a.click();
  };

  const downloadHistoryDB = (data: Submission[]) => {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'db.json';
    a.click();
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = loginForm.username.toLowerCase().trim();
    const pass = loginForm.password;
    if (['server', 'bobby', 'admin', 'stefany', 'isa', 'winda'].includes(user) && pass === '0000') {
      setIsLoggedIn(true);
      setCurrentUser(user);
      setActiveView('calculator');
    } else {
      setLoginError('Login Gagal. Pastikan Username dan Password benar.');
    }
  };

  const filteredPending = pendingList.filter(item => {
    if (pendingFilter === 'all') return true;
    return item.status === pendingFilter;
  });

  const filteredCompleted = completedList.filter(item => {
    if (completedFilter === 'all') return true;
    if (completedFilter === 'approved') return ['completed', 'approved'].includes(item.status);
    if (completedFilter === 'rejected') return item.status === 'rejected';
    return true;
  });

  const totalPendingPages = Math.ceil(filteredPending.length / ITEMS_PER_PAGE);
  const paginatedPending = filteredPending.slice((pendingPage - 1) * ITEMS_PER_PAGE, pendingPage * ITEMS_PER_PAGE);

  const totalCompletedPages = Math.ceil(filteredCompleted.length / ITEMS_PER_PAGE);
  const paginatedCompleted = filteredCompleted.slice((completedPage - 1) * ITEMS_PER_PAGE, completedPage * ITEMS_PER_PAGE);

  const groupBySender = (list: Submission[]) => {
    return list.reduce((acc: Record<string, Submission[]>, item) => {
      const sender = (item.sender || 'Unknown').toLowerCase();
      if (!acc[sender]) acc[sender] = [];
      acc[sender].push(item);
      return acc;
    }, {});
  };

  const groupedPending = groupBySender(paginatedPending);
  const pendingSenders = Object.keys(groupedPending).sort();
  const groupedCompleted = groupBySender(paginatedCompleted);
  const completedSenders = Object.keys(groupedCompleted).sort();

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="bg-white border-b border-slate-100 p-8 text-center flex flex-col items-center">
            {/* Geometric balance logo element: rotatable 45deg square */}
            <div className="w-12 h-12 bg-indigo-600 rounded-sm transform rotate-45 flex items-center justify-center mb-6 shadow-sm">
              <div className="w-4 h-4 bg-white"></div>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight uppercase font-display">Equilibrium</h1>
            <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-mono">MarpApps Pricing System</p>
          </div>
          <form onSubmit={handleLogin} className="p-8 space-y-5">
            {loginError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center border border-red-100">
                <Info className="w-4 h-4 mr-2 flex-shrink-0" />
                {loginError}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Username</label>
              <input
                type="text"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all outline-none"
                placeholder="Masukkan username..."
                value={loginForm.username}
                onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
              <input
                type="password"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all outline-none"
                placeholder="Masukkan password..."
                value={loginForm.password}
                onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white font-bold py-3.5 rounded-lg hover:bg-indigo-700 shadow-sm transition-all active:scale-[0.98] mt-2 text-xs uppercase tracking-widest"
            >
              Masuk Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-6 pb-24 text-slate-800 font-sans">
      {notification && (
        <div className="fixed top-6 right-6 z-[9999] bg-slate-800 text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center animate-in slide-in-from-top-5 fade-in duration-300">
          <Info className="w-4 h-4 mr-2 text-green-400" />
          {notification}
        </div>
      )}

      {/* MODALS */}
      <BrandModal
        show={showAddBrandModal}
        onClose={() => setShowAddBrandModal(false)}
        productList={productList}
        onAdd={prods => processBatchAdd(prods)}
      />

      <CategoryModal
        show={showAddCategoryModal}
        onClose={() => setShowAddCategoryModal(false)}
        categories={categories}
        skuCategoryMap={skuCategoryMap}
        productList={productList}
        onAdd={prods => processBatchAdd(prods)}
      />

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
              <div>
                <h3 className="font-bold text-xs uppercase tracking-widest text-slate-900 flex items-center">
                  <Settings className="w-4 h-4 mr-2 text-indigo-600" /> Pengaturan Default
                </h3>
                <p className="text-[10px] text-slate-400 mt-1">Nilai di sini akan tersimpan di database dan menjadi acuan utama.</p>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto bg-slate-50/50">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Biaya Persentase (%)</h4>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Administrasi</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      className="w-full p-2 pl-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                      value={fees.adminFee}
                      onChange={e => setFees({ ...fees, adminFee: Number(e.target.value) })}
                    />
                    <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Layanan XTRA</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      className="w-full p-2 pl-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                      value={fees.layananXtra}
                      onChange={e => setFees({ ...fees, layananXtra: Number(e.target.value) })}
                    />
                    <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Premi / Asuransi</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      className="w-full p-2 pl-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                      value={fees.insurance}
                      onChange={e => setFees({ ...fees, insurance: Number(e.target.value) })}
                    />
                    <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Komisi AMS</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      className="w-full p-2 pl-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                      value={fees.komisiAMS}
                      onChange={e => setFees({ ...fees, komisiAMS: Number(e.target.value) })}
                    />
                    <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
                  </div>
                </div>
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 flex justify-between">
                      <span>Biaya Campaign (Promosi)</span>
                      <span className="text-[10px] text-indigo-600 font-bold">0% - 50%</span>
                    </label>
                    <div className="relative mb-3">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.1"
                        className="w-full p-2 pl-3 pr-8 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono font-bold"
                        value={fees.campaignFee !== undefined ? fees.campaignFee : 5}
                        onChange={e => {
                          const valStr = e.target.value;
                          if (valStr === '') {
                            setFees({ ...fees, campaignFee: '' as any });
                            return;
                          }
                          let val = Number(valStr);
                          if (val > 50) val = 50;
                          setFees({ ...fees, campaignFee: val });
                        }}
                        onBlur={e => {
                          let val = Number(e.target.value);
                          if (isNaN(val) || val < 0) val = 0;
                          if (val > 50) val = 50;
                          setFees({ ...fees, campaignFee: val });
                        }}
                      />
                      <span className="absolute right-3 top-2 text-slate-400 text-sm">%</span>
                    </div>

                    {/* PREMIUM INTERACTIVE CARD GRID FOR SETTINGS */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { val: 0, label: 'Mati', desc: '0%' },
                        { val: 1.5, label: 'Regular', desc: '1.5%' },
                        { val: 2, label: 'Flash Sale', desc: '2%' },
                        { val: 4, label: 'Mega', desc: '4%' },
                        { val: 5, label: 'Brand Day', desc: '5%' },
                        { val: 8, label: 'Eksklusif', desc: '8%' },
                      ].map(tier => {
                        const isSelected = Number(fees.campaignFee) === tier.val;
                        return (
                          <button
                            key={tier.val}
                            type="button"
                            onClick={() => setFees({ ...fees, campaignFee: tier.val })}
                            className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-center transition-all duration-200 cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50/80 border-indigo-500 text-indigo-700 ring-2 ring-indigo-500/10 font-bold'
                                : 'bg-slate-50 border-slate-200/60 hover:border-slate-300 hover:bg-slate-100 text-slate-500'
                            }`}
                          >
                            <span className="text-[9px] block leading-none font-semibold mb-0.5">{tier.label}</span>
                            <span className={`text-[11px] font-mono font-bold ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`}>
                              {tier.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
              </div>
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 border-t border-slate-200 pt-4">
                Biaya Nominal (Rp)
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Proses Marketplace</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 text-sm">Rp</span>
                    <input
                      type="number"
                      className="w-full p-2 pl-8 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                      value={fees.marketplaceProcessingFee}
                      onChange={e => setFees({ ...fees, marketplaceProcessingFee: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Proses Jubelio</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 text-sm">Rp</span>
                    <input
                      type="number"
                      className="w-full p-2 pl-8 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                      value={fees.jubelioProcessingFee}
                      onChange={e => setFees({ ...fees, jubelioProcessingFee: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">Biaya Packing</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-400 text-sm">Rp</span>
                    <input
                      type="number"
                      className="w-full p-2 pl-8 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono"
                      value={fees.packingFee}
                      onChange={e => setFees({ ...fees, packingFee: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 mt-6 border-t border-slate-200 pt-4 flex items-center">
                <Sparkles className="w-4 h-4 mr-1.5 text-indigo-500" /> Smart Margin Kategori (%)
              </h4>
              <p className="text-[10px] text-slate-400 mb-4">Atur saran persentase margin otomatis untuk masing-masing kategori produk.</p>
              
              <div className="grid grid-cols-2 gap-4">
                {Object.keys(smartMargins).map(key => {
                  if (['accessories', 'electronics', 'pakaian', 'beauty', 'f&b'].includes(key)) {
                    return null;
                  }
                  const label = key === 'default' ? 'Lainnya (Default)' : key;
                  return (
                    <div key={key} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1.5 capitalize">{label}</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          className="w-full p-2 pr-8 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-mono font-bold text-indigo-600"
                          value={smartMargins[key] !== undefined ? smartMargins[key] : 10}
                          onChange={e => {
                            const val = Number(e.target.value) || 0;
                            const updated = { ...smartMargins, [key]: val };
                            if (key === 'aksesoris') updated['accessories'] = val;
                            if (key === 'elektronik') updated['electronics'] = val;
                            if (key === 'fashion') updated['pakaian'] = val;
                            if (key === 'kosmetik') updated['beauty'] = val;
                            if (key === 'makanan') updated['f&b'] = val;
                            setSmartMargins(updated);
                          }}
                        />
                        <span className="absolute right-3 top-2 text-slate-400 text-sm font-bold">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 bg-white flex justify-end gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveFees}
                disabled={isSavingFees}
                className="px-6 py-2.5 text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl flex items-center shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-70"
              >
                {isSavingFees ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Settings className="w-4 h-4 mr-2" />}
                Simpan Pembaruan
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* HEADER */}
        <header className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 px-6 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-4 z-40">
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-indigo-600 rounded-sm transform rotate-45 flex items-center justify-center shadow-sm flex-shrink-0">
              <div className="w-2.5 h-2.5 bg-white"></div>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-950 tracking-tight font-display uppercase">Equilibrium</h1>
              <div className="flex items-center text-[10px] text-slate-400 gap-1.5 mt-0.5 uppercase tracking-widest font-mono">
                <span className="font-semibold text-indigo-600">{currentUser}</span>
                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                <span className="flex items-center">
                  {isOnline ? (
                    <span className="flex items-center text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>
                      Online
                    </span>
                  ) : (
                    'Offline'
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200/60 w-full md:w-auto justify-between md:justify-start">
            <button
              onClick={() => setActiveView('calculator')}
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all duration-200 ${
                activeView === 'calculator'
                  ? 'bg-white border border-slate-200/50 shadow-sm text-indigo-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'
              }`}
            >
              Kalkulator
            </button>
            <button
              onClick={() => setActiveView('shopee')}
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all duration-200 ${
                activeView === 'shopee'
                  ? 'bg-white border border-slate-200/50 shadow-sm text-indigo-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'
              }`}
            >
              Shopee Balist
            </button>
            <button
              onClick={() => setActiveView('gomall_shopee')}
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all duration-200 ${
                activeView === 'gomall_shopee'
                  ? 'bg-white border border-slate-200/50 shadow-sm text-indigo-600 font-semibold'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/50'
              }`}
            >
              Gomall Shopee
            </button>
          </div>

          <div className="flex items-center gap-2 border-l border-slate-200 pl-4 hidden md:flex">
            {canEditSettings && (
              <button
                onClick={() => setShowSettings(true)}
                className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                title="Pengaturan Biaya"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => {
                setIsLoggedIn(false);
                setCurrentUser(null);
                localStorage.removeItem('marketplace_submissions');
              }}
              className="p-2.5 text-red-500 hover:bg-red-50 rounded-lg transition-all"
              title="Keluar"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        {activeView === 'calculator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-200">
            {/* LEFT PANEL */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="font-bold text-xs uppercase tracking-widest text-slate-900 flex items-center">
                    <Database className="w-4 h-4 mr-2 text-indigo-600" /> Basis Produk
                  </h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setShowAddCategoryModal(true)}
                      className="p-2 bg-purple-50 text-purple-600 hover:bg-purple-100 rounded-lg transition-colors border border-purple-100"
                      title="Tambah Banyak (Kategori)"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowAddBrandModal(true)}
                      className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-blue-100"
                      title="Tambah Banyak (Pencarian)"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                    <button
                      onClick={fetchCsvData}
                      className="p-2 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
                      title="Refresh Data"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* PRODUCT DROPDOWN WITH SEARCH */}
                <div className="relative mb-5 z-40">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Pilih Produk
                  </label>
                  <div
                    className="p-3 border border-slate-200 rounded-xl cursor-pointer flex justify-between items-center bg-slate-50 hover:bg-white hover:border-indigo-300 transition-all shadow-sm"
                    onClick={() => {
                      setShowProductList(!showProductList);
                    }}
                  >
                    <span className="truncate text-sm font-semibold text-slate-700">
                      {selectedSku ? `${selectedSku} - ${selectedProductData?.name}` : 'Klik untuk mencari...'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  </div>

                  {showProductList && (
                    <div className="absolute w-full bg-white border border-slate-200/80 rounded-2xl shadow-xl max-h-[420px] overflow-hidden mt-2 flex flex-col z-50 animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-4 bg-slate-50/80 border-b border-slate-100">
                        {/* Filter Kategori */}
                        <div className="mb-3">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                            Saring Berdasarkan Kategori
                          </label>
                          <select
                            value={selectedCategoryFilter}
                            onChange={e => {
                              setSelectedCategoryFilter(e.target.value);
                              setDisplayLimit(100);
                            }}
                            className="w-full p-2 border border-slate-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none shadow-sm transition-all text-slate-700 font-semibold cursor-pointer"
                          >
                            <option value="">Semua Kategori ({productList.length})</option>
                            {categories.map((cat, i) => {
                              const count = productList.filter(p => skuCategoryMap[p.sku] === cat).length;
                              return (
                                <option key={i} value={cat}>
                                  {cat} ({count})
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        <div className="relative">
                          <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />                           <input
                            autoFocus
                            type="text"
                            className="w-full p-2.5 pl-9 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none shadow-sm transition-all"
                            placeholder="Cari lalu tekan Enter..."
                            value={searchTerm}
                            onChange={e => {
                              setSearchTerm(e.target.value);
                              setDisplayLimit(100);
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                if (filteredProducts.length > 0) {
                                  handleSelectProduct(filteredProducts[0]);
                                } else {
                                  const suggestions = getSuggestions(searchTerm);
                                  if (suggestions.length > 0) {
                                    handleSelectProduct(suggestions[0].product);
                                  }
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                      <div className="overflow-y-auto flex-1 bg-white p-2">
                        {filteredProducts.length > 0 ? (
                          filteredProducts.slice(0, displayLimit).map((p, i) => (
                            <div
                              key={i}
                              className="p-3 text-sm hover:bg-slate-50 border border-transparent hover:border-slate-100 rounded-xl transition-all flex items-center gap-3 mb-1 cursor-pointer"
                              onClick={() => handleSelectProduct(p)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-slate-800 truncate">{p.name}</div>
                                <div className="text-slate-500 flex justify-between mt-0.5 text-xs">
                                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[9px]">{p.sku}</span>
                                  <span className="font-semibold text-emerald-600">{formatIDR(p.eceran)}</span>
                                </div>
                              </div>
                            </div>
                          ))
                        ) : searchTerm.trim() !== '' ? (
                          <div className="p-4 text-center">
                            <div className="text-slate-500 text-xs font-semibold mb-3 bg-red-50 text-red-700 p-2.5 rounded-lg border border-red-100 flex items-center justify-center gap-1.5">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500"></span>
                              Produk atau SKU tidak ditemukan
                            </div>
                            {(() => {
                              const suggestions = getSuggestions(searchTerm);
                              if (suggestions.length === 0) {
                                return (
                                  <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded-xl border border-slate-200 border-dashed">
                                    Tidak ada saran produk yang mirip. Silakan periksa kembali kata kunci Anda.
                                  </div>
                                );
                              }
                              return (
                                <div className="space-y-2">
                                  <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider text-left pl-1">
                                    Saran Produk Serupa:
                                  </div>
                                  <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                                    {suggestions.slice(0, 10).map((s, idx) => (
                                      <div
                                        key={idx}
                                        className="p-2.5 text-xs hover:bg-indigo-50/50 border border-slate-100 hover:border-indigo-100 rounded-xl transition-all flex items-center gap-2 cursor-pointer text-left"
                                        onClick={() => handleSelectProduct(s.product)}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <div className="font-bold text-slate-700 truncate">{s.product.name}</div>
                                          <div className="text-slate-500 flex justify-between mt-1 text-[10px] items-center">
                                            <span className="font-mono bg-slate-100 px-1 rounded text-[9px]">{s.product.sku}</span>
                                            <div className="flex items-center gap-1">
                                              <span className="text-[9px] bg-indigo-50 text-indigo-600 font-extrabold px-1 rounded">
                                                {s.percentage}% mirip
                                              </span>
                                              <span className="font-bold text-emerald-600">{formatIDR(s.product.eceran)}</span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : null}
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

                {/* INFO HARGA REFERENSI */}
                {selectedSku && selectedProductData && (
                  <div className="mb-5 p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl border border-slate-200 shadow-sm text-xs space-y-2">
                    <div className="font-bold text-slate-700 mb-2 border-b border-slate-200/60 pb-1.5 flex items-center text-[11px] uppercase tracking-wide">
                      <Database className="w-3.5 h-3.5 mr-1.5 text-slate-400" /> Data AIO
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Eceran</span>{' '}
                      <span className="font-bold text-blue-700 bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">
                        {formatIDR(selectedProductData.eceran)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Grosir</span>{' '}
                      <span className="font-bold text-orange-600 bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">
                        {formatIDR(selectedProductData.grosir)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-medium">Partai</span>{' '}
                      <span className="font-bold text-purple-600 bg-white px-2 py-0.5 rounded shadow-sm border border-slate-100">
                        {formatIDR(selectedProductData.partai)}
                      </span>
                    </div>
                    {canSeeHPP && (
                      <div className="flex justify-between items-center pt-1 border-t border-slate-200/50 mt-1">
                        <span className="text-slate-500 font-bold">HPP Asli</span>{' '}
                        <span className="font-bold text-slate-800 bg-slate-200/50 px-2 py-0.5 rounded">
                          {formatIDR(selectedProductData.hpp)}
                        </span>
                      </div>
                    )}
                    {skuCategoryMap[selectedSku] && (
                      <div className="flex justify-between items-center pt-1 border-t border-slate-200/50 mt-1">
                        <span className="text-slate-500 font-medium">Kategori</span>{' '}
                        <span className="font-bold text-slate-800 bg-slate-200/20 border border-slate-200/60 px-2 py-0.5 rounded capitalize">
                          {skuCategoryMap[selectedSku]}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-200/50 mt-1.5 bg-indigo-50/40 px-2 py-1.5 rounded-lg border border-indigo-100/40">
                      <span className="text-indigo-950 font-semibold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-indigo-500 animate-pulse" /> Smart Margin
                      </span>{' '}
                      <span className="font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200/60 shadow-sm font-mono text-xs">
                        {getSmartMarginForSku(selectedSku)}%
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-4 pt-5 border-t border-slate-100">
                  {canSeeHPP && (
                    <div className="bg-white rounded-xl p-1">
                      <label className="text-[11px] font-bold block mb-1.5 text-slate-600 uppercase tracking-wide">
                        Modal HPP Hitungan
                      </label>
                      <div className="relative shadow-sm">
                        <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-medium">Rp</span>
                        <input
                          type="text"
                          name="hpp"
                          inputMode="numeric"
                          className="w-full p-2.5 pl-9 border border-slate-200 rounded-xl text-base focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-bold text-slate-800 transition-all"
                          value={formatInput(product.hpp)}
                          onChange={handleProductChange}
                        />
                      </div>
                      {selectedProductData && (
                        <div className="flex flex-wrap gap-2 mt-2 items-center">
                          <span className="text-[10px] font-semibold text-slate-400">Pilih Acuan:</span>
                          <button
                            onClick={() => setProduct(p => ({ ...p, hpp: selectedProductData.hpp || 0 }))}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md text-[10px] font-bold text-slate-700 transition-colors"
                          >
                            HPP Asli
                          </button>
                          <button
                            onClick={() => setProduct(p => ({ ...p, hpp: selectedProductData.eceran || 0 }))}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md text-[10px] font-bold text-blue-700 transition-colors"
                          >
                            Eceran
                          </button>
                          <button
                            onClick={() => setProduct(p => ({ ...p, hpp: selectedProductData.grosir || 0 }))}
                            className="px-2 py-1 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-md text-[10px] font-bold text-orange-700 transition-colors"
                          >
                            Grosir
                          </button>
                          <button
                            onClick={() => setProduct(p => ({ ...p, hpp: selectedProductData.partai || 0 }))}
                            className="px-2 py-1 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-md text-[10px] font-bold text-purple-700 transition-colors"
                          >
                            Partai
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-slate-50/50 border border-slate-200/80 rounded-xl p-4 mt-2 shadow-inner">
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-slate-200">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center">
                        <Percent className="w-3.5 h-3.5 mr-1.5 text-indigo-400" /> Detail Biaya
                      </h4>
                      {canEditSettings && (
                        <button
                          onClick={() => setShowSettings(true)}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center bg-indigo-50 px-2 py-1 rounded-md transition-colors border border-indigo-100"
                        >
                          Settings
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2 mb-3">
                      <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm text-center">
                        <label className="text-[9px] font-bold block mb-1 text-slate-500 uppercase">Admin</label>
                        <input
                          type="number"
                          step="0.1"
                          className="w-full text-center text-xs font-bold text-slate-700 focus:outline-none"
                          value={fees.adminFee}
                          onChange={e => setFees({ ...fees, adminFee: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm text-center">
                        <label className="text-[9px] font-bold block mb-1 text-slate-500 uppercase">Xtra</label>
                        <input
                          type="number"
                          step="0.1"
                          className="w-full text-center text-xs font-bold text-slate-700 focus:outline-none"
                          value={fees.layananXtra}
                          onChange={e => setFees({ ...fees, layananXtra: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm text-center">
                        <label className="text-[9px] font-bold block mb-1 text-slate-500 uppercase">Asuransi</label>
                        <input
                          type="number"
                          step="0.1"
                          className="w-full text-center text-xs font-bold text-slate-700 focus:outline-none"
                          value={fees.insurance}
                          onChange={e => setFees({ ...fees, insurance: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-sm text-center">
                        <label className="text-[9px] font-bold block mb-1 text-slate-500 uppercase">AMS</label>
                        <input
                          type="number"
                          step="0.1"
                          className="w-full text-center text-xs font-bold text-slate-700 focus:outline-none"
                          value={fees.komisiAMS}
                          onChange={e => setFees({ ...fees, komisiAMS: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    {/* CAMPAIGN PROMOTION FEE */}
                    <div className="mt-3 mb-4 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm">
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          Promosi (Campaign)
                        </label>
                        <div className="flex items-center space-x-1">
                          <input
                            type="number"
                            min="0"
                            max="50"
                            step="0.5"
                            className="w-14 text-center text-xs font-mono font-bold text-indigo-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-1 focus:border-indigo-500 outline-none"
                            value={fees.campaignFee !== undefined ? fees.campaignFee : 5}
                            onChange={e => {
                              let val = Number(e.target.value);
                              if (val < 0) val = 0;
                              if (val > 50) val = 50;
                              setFees({ ...fees, campaignFee: val });
                            }}
                          />
                          <span className="text-xs font-bold text-slate-400">%</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        step="0.5"
                        className="w-full accent-indigo-600 h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer mb-2.5"
                        value={fees.campaignFee !== undefined ? fees.campaignFee : 5}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setFees({ ...fees, campaignFee: val });
                        }}
                      />

                      {/* PREMIUM INTERACTIVE CARD GRID */}
                      <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100">
                        {[
                          { val: 0, label: 'Mati', desc: '0%' },
                          { val: 1.5, label: 'Regular', desc: '1.5%' },
                          { val: 2, label: 'Flash Sale', desc: '2%' },
                          { val: 4, label: 'Mega', desc: '4%' },
                          { val: 5, label: 'Brand Day', desc: '5%' },
                          { val: 8, label: 'Eksklusif', desc: '8%' },
                        ].map(tier => {
                          const isSelected = Number(fees.campaignFee) === tier.val;
                          return (
                            <button
                              key={tier.val}
                              type="button"
                              onClick={() => setFees({ ...fees, campaignFee: tier.val })}
                              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-lg border text-center transition-all duration-200 cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-50/80 border-indigo-500 text-indigo-700 ring-2 ring-indigo-500/10 font-bold'
                                  : 'bg-slate-50 border-slate-200/60 hover:border-slate-300 hover:bg-slate-100 text-slate-500'
                              }`}
                            >
                              <span className="text-[9px] block leading-none font-semibold mb-0.5">{tier.label}</span>
                              <span className={`text-[11px] font-mono font-bold ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`}>
                                {tier.desc}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end mb-4 border-b border-slate-200 pb-4 relative group">
                      <span className="text-[11px] font-bold text-indigo-900 bg-indigo-100/50 border border-indigo-200/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-help shadow-sm">
                        Total Pts:{' '}
                        {(() => {
                          const percentFees =
                            Number(fees.adminFee) +
                            Number(fees.layananXtra) +
                            Number(fees.insurance) +
                            Number(fees.komisiAMS) +
                            (Number(fees.campaignFee) || 0);
                          const fixedFees =
                            (Number(fees.marketplaceProcessingFee) || 0) +
                            (Number(fees.jubelioProcessingFee) || 0) +
                            (Number(fees.packingFee) || 0);
                          const fixedFeesPercent = t1Result.sellingPrice > 0 ? (fixedFees / t1Result.sellingPrice) * 100 : 0;
                          return (percentFees + fixedFeesPercent).toFixed(1);
                        })()}
                        %
                        <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-[9px] font-bold block mb-1 text-slate-500 uppercase text-center">
                          Proses MP (Rp)
                        </label>
                        <input
                          type="number"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 outline-none text-center shadow-sm"
                          value={fees.marketplaceProcessingFee}
                          onChange={e => setFees({ ...fees, marketplaceProcessingFee: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold block mb-1 text-slate-500 uppercase text-center">
                          Jubelio (Rp)
                        </label>
                        <input
                          type="number"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 outline-none text-center shadow-sm"
                          value={fees.jubelioProcessingFee}
                          onChange={e => setFees({ ...fees, jubelioProcessingFee: Number(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold block mb-1 text-slate-500 uppercase text-center">
                          Packing (Rp)
                        </label>
                        <input
                          type="number"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500/20 outline-none text-center shadow-sm"
                          value={fees.packingFee}
                          onChange={e => setFees({ ...fees, packingFee: Number(e.target.value) || 0 })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT PANEL */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200 border-t-4 border-t-indigo-600">
                <div className="p-4 bg-white border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <h3 className="font-bold text-xs uppercase tracking-widest text-slate-900 flex items-center">
                    Simulasi Harga Tayang
                  </h3>

                  <div className="flex flex-wrap items-center gap-2 justify-end w-full md:w-auto bg-slate-50 p-2 rounded-xl border border-slate-200/60 shadow-sm">
                    <select
                      className="text-[10px] p-2 py-1.5 border-none rounded-lg bg-white font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/30 outline-none shadow-sm cursor-pointer"
                      value={rounding}
                      onChange={e => handleRoundingChange(e.target.value)}
                      title="Pembulatan"
                    >
                      <option value="none">Rumus Asli</option>
                      <option value="100">Bulat 100</option>
                      <option value="500">Bulat 500</option>
                      <option value="1000">Bulat 1000</option>
                    </select>

                    {canSeeHPP && (
                      <select
                        className="text-[10px] p-2 py-1.5 border-none rounded-lg bg-white font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/30 outline-none shadow-sm w-24 cursor-pointer"
                        value={massHppRef}
                        onChange={e => setMassHppRef(e.target.value)}
                        title="Set Acuan Modal"
                      >
                        <option value="">Acuan Modal</option>
                        <option value="hpp">HPP Asli</option>
                        <option value="eceran">Eceran</option>
                        <option value="grosir">Grosir</option>
                        <option value="partai">Partai</option>
                      </select>
                    )}

                    <select
                      className="text-[10px] p-2 py-1.5 border-none rounded-lg bg-white font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/30 outline-none shadow-sm w-20 cursor-pointer"
                      value={massMargin}
                      onChange={e => setMassMargin(e.target.value)}
                      title="Set Margin Massal (%)"
                    >
                      <option value="">Margin</option>
                      <option value="10">10%</option>
                      <option value="15">15%</option>
                      <option value="20">20%</option>
                    </select>

                    <input
                      type="number"
                      placeholder="Proses"
                      className="text-[10px] p-2 py-1.5 border-none rounded-lg bg-white font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/30 outline-none shadow-sm w-16 text-center"
                      value={massFee}
                      onChange={e => setMassFee(e.target.value)}
                    />

                    <input
                      type="number"
                      placeholder="Packing"
                      className="text-[10px] p-2 py-1.5 border-none rounded-lg bg-white font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500/30 outline-none shadow-sm w-16 text-center"
                      value={massPack}
                      onChange={e => setMassPack(e.target.value)}
                    />

                    <button
                      onClick={applyMassUpdate}
                      disabled={(!massMargin && !massFee && massPack === '' && !massHppRef) || cart.length === 0}
                      className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:grayscale transition-all shadow-md active:scale-95"
                    >
                      Update List
                    </button>

                    <button
                      onClick={addToCart}
                      disabled={!selectedSku}
                      className={`bg-gradient-to-r from-emerald-500 to-green-600 text-white text-xs font-bold px-4 py-1.5 rounded-lg hover:from-emerald-600 hover:to-green-700 flex items-center shadow-md transition-all active:scale-95 ${
                        !selectedSku ? 'opacity-50 grayscale' : ''
                      }`}
                    >
                      <Plus className="w-4 h-4 mr-1.5" /> ADD LIST
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-8 bg-slate-50/30">
                  {/* SATUAN */}
                  <div>
                    <div className="flex justify-between items-end mb-4 border-b border-slate-200 pb-2">
                      <span className="font-bold text-slate-700 text-sm tracking-wide uppercase">Pembelian Satuan</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div
                        className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm group hover:border-blue-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-center"
                        onClick={e => handleCopyPrice(t1Result.sellingPrice, e)}
                        title="Klik untuk copy harga"
                      >
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                          Harga Utama <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[8px]">TIER 1</span>
                        </div>
                        <div className="font-black text-slate-800 flex items-center text-xl">
                          {formatIDR(t1Result.sellingPrice)}
                          <Copy className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-2" />
                        </div>
                      </div>

                      <div className="md:col-span-3 grid grid-cols-3 gap-3">
                        {[10, 15, 20].map(m => {
                          const price = calculateRecommendation(m, 1);
                          return (
                            <div
                              key={m}
                              onClick={e => {
                                setProduct(p => ({ ...p, basePrice: price }));
                                handleCopyPrice(price, e);
                              }}
                              className="bg-gradient-to-br from-white to-indigo-50/50 p-4 border border-indigo-100/80 rounded-2xl cursor-pointer hover:border-indigo-400 hover:shadow-lg transition-all group flex flex-col justify-center relative overflow-hidden"
                            >
                              <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/5 rounded-full blur-xl -mr-8 -mt-8"></div>
                              <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-2">Margin {m}%</div>
                              <div className="font-black text-indigo-900 text-lg sm:text-xl flex items-center">
                                {formatIDR(price)}
                                <Copy className="w-4 h-4 text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity ml-auto" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* GROSIR */}
                  <div>
                    <div className="flex justify-between items-end mb-4 border-b border-slate-200 pb-2">
                      <span className="font-bold text-slate-700 text-sm tracking-wide uppercase">Pembelian Grosir / Paket</span>
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-1 rounded font-bold">
                        INFO: TOTAL HARGA PAKET
                      </span>
                    </div>
                    <div className="space-y-4">
                      {[3, 6, 12].map(qty => (
                        <div
                          key={qty}
                          className="flex flex-col md:flex-row gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="md:w-32 flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-100 pb-3 md:pb-0 md:pr-4">
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Min. Beli</div>
                            <div className="text-2xl font-black text-slate-800">
                              {qty} <span className="text-sm font-semibold text-slate-500 uppercase">{selectedProductData?.unit || 'PCS'}</span>
                            </div>
                          </div>
                          <div className="flex-1 grid grid-cols-3 gap-3">
                            {[10, 15, 20].map(m => {
                              const price = calculateRecommendation(m, qty);
                              const totalPrice = price * qty;
                              return (
                                <div
                                  key={m}
                                  onClick={e => handleCopyPrice(price, e)}
                                  className="bg-gradient-to-br from-emerald-50/30 to-green-50/50 p-3 border border-emerald-100/80 rounded-xl cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all group relative overflow-hidden"
                                >
                                  <div className="text-[10px] font-bold text-emerald-600 mb-1.5 flex justify-between items-center">
                                    Mrg {m}%{' '}
                                    <Copy className="w-3 h-3 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                  <div className="font-black text-emerald-900 text-base flex flex-wrap items-baseline gap-1">
                                    {formatIDR(price)}
                                    <span className="text-[9px] font-semibold text-emerald-700/70 lowercase">/pcs</span>
                                  </div>
                                  <div className="text-[10px] font-bold text-emerald-800 mt-2 border-t border-emerald-200/50 pt-1.5 flex justify-between bg-emerald-100/30 -mx-3 -mb-3 px-3 pb-2 rounded-b-xl">
                                    <span>Total:</span> {formatIDR(totalPrice)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                      {/* Custom Qty */}
                      {!showCustomQty ? (
                        <button
                          onClick={() => setShowCustomQty(true)}
                          className="w-full mt-2 py-4 border-2 border-dashed border-slate-300 text-slate-500 rounded-2xl hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-all flex items-center justify-center text-sm font-bold group"
                        >
                          <Plus className="w-5 h-5 mr-2 group-hover:scale-125 transition-transform" /> Setup Paket Custom Baru
                        </button>
                      ) : (
                        <div className="flex flex-col md:flex-row gap-4 p-4 bg-emerald-50/40 border-2 border-emerald-200 rounded-2xl shadow-sm relative animate-in fade-in slide-in-from-top-2">
                          <button
                            onClick={() => setShowCustomQty(false)}
                            className="absolute -top-3 -right-3 text-slate-400 hover:text-red-500 bg-white border border-slate-200 rounded-full shadow-md p-1.5 transition-colors z-10"
                          >
                            <Plus className="w-4 h-4 rotate-45" />
                          </button>
                          <div className="md:w-32 flex flex-col justify-center border-b md:border-b-0 md:border-r border-emerald-200/50 pb-3 md:pb-0 md:pr-4">
                            <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">Set Min. Beli</div>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="2"
                                className="w-16 p-1.5 text-lg border border-emerald-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 font-black text-emerald-900 bg-white"
                                value={customQty}
                                onChange={e => setCustomQty(Number(e.target.value) || 1)}
                              />
                              <span className="text-xs font-semibold text-emerald-600 uppercase">
                                {selectedProductData?.unit || 'PCS'}
                              </span>
                            </div>
                          </div>
                          <div className="flex-1 grid grid-cols-3 gap-3">
                            {customQty > 0 &&
                              [10, 15, 20].map(m => {
                                const price = calculateRecommendation(m, customQty);
                                const totalPrice = price * customQty;
                                return (
                                  <div
                                    key={m}
                                    onClick={e => handleCopyPrice(price, e)}
                                    className="bg-white p-3 border border-emerald-200 rounded-xl cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all group relative overflow-hidden"
                                  >
                                    <div className="text-[10px] font-bold text-emerald-600 mb-1.5 flex justify-between items-center">
                                      Mrg {m}%{' '}
                                      <Copy className="w-3 h-3 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    <div className="font-black text-emerald-900 text-base flex flex-wrap items-baseline gap-1">
                                      {formatIDR(price)}
                                      <span className="text-[9px] font-semibold text-emerald-700/70 lowercase">/pcs</span>
                                    </div>
                                    <div className="text-[10px] font-bold text-emerald-800 mt-2 border-t border-emerald-200/50 pt-1.5 flex justify-between bg-emerald-50 -mx-3 -mb-3 px-3 pb-2 rounded-b-xl">
                                      <span>Total:</span> {formatIDR(totalPrice)}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* CART TABLE */}
              <CartTable
                cart={cart}
                canSeeHPP={canSeeHPP}
                isAdmin={isAdmin}
                rounding={rounding}
                cartItemsPerPage={cartItemsPerPage}
                setCartItemsPerPage={setCartItemsPerPage}
                cartPage={cartPage}
                setCartPage={setCartPage}
                updateCartItem={updateCartItem}
                setCart={setCart}
                downloadCSV={downloadCSV}
                downloadJubelioCSV={downloadJubelioCSV}
                handleSendSubmission={handleSendSubmission}
                isSending={isSending}
                submissionNote={submissionNote}
                setSubmissionNote={setSubmissionNote}
                editingSubmissionId={editingSubmissionId}
                handleCopyPrice={handleCopyPrice}
                useSmartMargin={useSmartMargin}
                setUseSmartMargin={setUseSmartMargin}
                applySmartMarginsToCart={applySmartMarginsToCart}
                fees={fees}
              />

              {/* D3 VISUALIZATION FOR CART PROFIT MARGINS */}
              <CartProfitMarginChart
                cart={cart}
                fees={fees}
                canSeeHPP={canSeeHPP}
              />
            </div>
          </div>
        )}

        {activeView === 'competitor' && (
          <CompetitorTab
            productList={productList}
            selectedSku={selectedSku}
            selectedProductData={selectedProductData}
            setSelectedSku={setSelectedSku}
            setProduct={setProduct}
            compForm={compForm}
            setCompForm={setCompForm}
            competitorCart={competitorCart}
            setCompetitorCart={setCompetitorCart}
            isSending={isSending}
            submissionNote={submissionNote}
            setSubmissionNote={setSubmissionNote}
            isAdmin={isAdmin}
            handleSendSubmission={handleSendSubmission}
            fetchCsvData={fetchCsvData}
            isLoading={isLoading}
            t1ResultSellingPrice={t1Result.sellingPrice}
            showProductList={showProductList}
            setShowProductList={setShowProductList}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filteredProducts={filteredProducts}
            categories={categories}
            skuCategoryMap={skuCategoryMap}
            selectedCategoryFilter={selectedCategoryFilter}
            setSelectedCategoryFilter={setSelectedCategoryFilter}
          />
        )}

        {activeView === 'shopee' && (
          <ShopeeTab
            productList={productList}
            fees={fees}
            setSelectedSku={setSelectedSku}
            setProduct={setProduct}
            setActiveView={setActiveView}
            rounding={rounding}
            useSmartMargin={useSmartMargin}
            getSmartMarginForSku={getSmartMarginForSku}
          />
        )}

        {activeView === 'gomall_shopee' && (
          <ShopeeTab
            productList={productList}
            fees={fees}
            setSelectedSku={setSelectedSku}
            setProduct={setProduct}
            setActiveView={setActiveView}
            rounding={rounding}
            useSmartMargin={useSmartMargin}
            getSmartMarginForSku={getSmartMarginForSku}
            shopName="GomallShopee"
            sheetUrl="https://docs.google.com/spreadsheets/d/e/2PACX-1vQUJWBw2EXirlxov14JNpI1h3ulExBcMQxQ5orpGZmpW7cMqUqMkU9E6OxJ4CBLd4ZvAW8tBmhmEEF6/pub?gid=1555986622&single=true&output=csv"
            cacheKeyPrefix="gomall_shopee"
            fileNamePrefix="GomallShopee_Update_Harga"
          />
        )}

        {(activeView === 'inbox' || activeView === 'history') && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200">
              <h2 className="text-2xl font-black text-slate-800 flex items-center tracking-tight">
                {isServer ? (
                  <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl mr-3 shadow-inner">
                    <Inbox className="w-6 h-6" />
                  </div>
                ) : (
                  <div className="p-2.5 bg-blue-100 text-blue-600 rounded-xl mr-3 shadow-inner">
                    <Database className="w-6 h-6" />
                  </div>
                )}
                {isServer ? 'Inbox Pengajuan' : 'Riwayat Pengajuan'}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefreshSubmissions}
                  className="text-xs bg-white hover:bg-slate-100 text-slate-700 px-4 py-2 rounded-xl flex items-center transition-all font-bold border border-slate-200 shadow-sm active:scale-95"
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-1.5 ${
                      isRefreshing || isLoadingHistory ? 'animate-spin text-blue-500' : ''
                    }`}
                  />{' '}
                  {isRefreshing || isLoadingHistory ? 'Memuat...' : 'Refresh'}
                </button>
                {isServer && (
                  <button
                    onClick={() => downloadHistoryDB(submissions)}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center transition-all font-bold shadow-sm active:scale-95"
                  >
                    <Download className="w-4 h-4 mr-1.5" /> DB
                  </button>
                )}
              </div>
            </div>

            {isServer && activeView === 'inbox' && <ServerQuickCalculator fees={fees} />}

            {/* PENDING SECTION */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center">
                  <Clock className="w-4 h-4 mr-2 text-amber-500" /> Menunggu Konfirmasi
                </h3>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/50 shadow-inner">
                  <button
                    onClick={() => {
                      setPendingFilter('all');
                      setPendingPage(1);
                    }}
                    className={`px-4 py-1.5 text-xs rounded-lg transition-all font-bold ${
                      pendingFilter === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    onClick={() => {
                      setPendingFilter('pending');
                      setPendingPage(1);
                    }}
                    className={`px-4 py-1.5 text-xs rounded-lg transition-all font-bold ${
                      pendingFilter === 'pending' ? 'bg-white shadow-sm text-blue-700' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Baru
                  </button>
                  <button
                    onClick={() => {
                      setPendingFilter('revision');
                      setPendingPage(1);
                    }}
                    className={`px-4 py-1.5 text-xs rounded-lg transition-all font-bold ${
                      pendingFilter === 'revision' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Revisi
                  </button>
                </div>
              </div>
              <div className="space-y-6">
                {paginatedPending.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Clock className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm text-slate-500 font-medium">Bagus! Tidak ada tugas yang menunggu.</p>
                  </div>
                ) : (
                  pendingSenders.map(sender => (
                    <div key={sender} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs uppercase mr-3 shadow-inner">
                            {sender.slice(0, 2)}
                          </div>
                          <span className="font-bold text-slate-800 uppercase tracking-wide text-sm">{sender}</span>
                        </div>
                        <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-lg text-xs font-bold border border-amber-200 shadow-sm">
                          {groupedPending[sender].length} Draft
                        </span>
                      </div>
                      <div className="p-4 space-y-4 bg-slate-50/30">
                        {groupedPending[sender].map(sub => (
                          <SubmissionCard
                            key={sub.id}
                            sub={sub}
                            currentUser={currentUser}
                            isServer={isServer}
                            isAdmin={isAdmin}
                            canSeeHPP={canSeeHPP}
                            serverDrafts={serverDrafts}
                            expandedSubmissionId={expandedSubmissionId}
                            onToggle={handleToggleExpand}
                            onDraftChange={handleServerDraftChange}
                            onUpdateStatus={handleUpdateStatus}
                            onEdit={handleEditSubmission}
                            productList={productList}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
              {totalPendingPages > 1 && (
                <div className="flex justify-center items-center mt-6 gap-3">
                  <button
                    onClick={() => setPendingPage(p => Math.max(1, p - 1))}
                    disabled={pendingPage === 1}
                    className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 shadow-sm transition-all active:scale-95"
                  >
                    <Clock className="w-4 h-4 text-slate-600" />
                  </button>
                  <span className="text-xs text-slate-500 font-bold bg-slate-100 px-4 py-2 rounded-lg border border-slate-200">
                    Halaman {pendingPage} / {totalPendingPages}
                  </span>
                  <button
                    onClick={() => setPendingPage(p => Math.min(totalPendingPages, p + 1))}
                    disabled={pendingPage === totalPendingPages}
                    className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 shadow-sm transition-all active:scale-95"
                  >
                    <Clock className="w-4 h-4 text-slate-600" />
                  </button>
                </div>
              )}
            </div>

            {/* COMPLETED SECTION */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 mt-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest flex items-center">
                  <Database className="w-4 h-4 mr-2 text-emerald-500" /> Riwayat Selesai
                </h3>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/50 shadow-inner">
                  <button
                    onClick={() => {
                      setCompletedFilter('all');
                      setCompletedPage(1);
                    }}
                    className={`px-4 py-1.5 text-xs rounded-lg transition-all font-bold ${
                      completedFilter === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Semua
                  </button>
                  <button
                    onClick={() => {
                      setCompletedFilter('approved');
                      setCompletedPage(1);
                    }}
                    className={`px-4 py-1.5 text-xs rounded-lg transition-all font-bold ${
                      completedFilter === 'approved' ? 'bg-white shadow-sm text-emerald-700' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Disetujui
                  </button>
                  <button
                    onClick={() => {
                      setCompletedFilter('rejected');
                      setCompletedPage(1);
                    }}
                    className={`px-4 py-1.5 text-xs rounded-lg transition-all font-bold ${
                      completedFilter === 'rejected' ? 'bg-white shadow-sm text-rose-700' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    Ditolak
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {paginatedCompleted.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Database className="w-10 h-10 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm text-slate-500 font-medium">Belum ada riwayat arsip yang tersimpan.</p>
                  </div>
                ) : (
                  completedSenders.map(sender => (
                    <div
                      key={sender}
                      className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm opacity-95 hover:opacity-100 transition-opacity"
                    >
                      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex justify-between items-center">
                        <div className="flex items-center">
                          <span className="font-bold text-slate-700 uppercase tracking-wide text-sm">{sender}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-bold bg-white px-2.5 py-1 rounded-md border border-slate-200">
                          {groupedCompleted[sender].length} Draft
                        </span>
                      </div>
                      <div className="p-3 space-y-3 bg-slate-50/20">
                        {groupedCompleted[sender].map(sub => (
                          <SubmissionCard
                            key={sub.id}
                            sub={sub}
                            currentUser={currentUser}
                            isServer={isServer}
                            isAdmin={isAdmin}
                            canSeeHPP={canSeeHPP}
                            serverDrafts={serverDrafts}
                            expandedSubmissionId={expandedSubmissionId}
                            onToggle={handleToggleExpand}
                            onDraftChange={handleServerDraftChange}
                            onUpdateStatus={handleUpdateStatus}
                            onEdit={handleEditSubmission}
                            productList={productList}
                          />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {totalCompletedPages > 1 && (
                <div className="flex justify-center items-center mt-6 gap-3">
                  <span className="text-xs text-slate-500 font-bold bg-slate-100 px-4 py-2 rounded-lg border border-slate-200">
                    Halaman {completedPage} / {totalCompletedPages}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FAB KALKULATOR DASAR */}
      {isLoggedIn && (
        <div className="fixed bottom-6 right-6 flex flex-col items-end z-[998]">
          {showBasicCalc && <BasicCalculator onClose={() => setShowBasicCalc(false)} />}
          <button
            onClick={() => setShowBasicCalc(!showBasicCalc)}
            className={`p-4 rounded-full shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 flex items-center justify-center border border-white/20 ${
              showBasicCalc
                ? 'bg-slate-800 text-white'
                : 'bg-gradient-to-tr from-indigo-600 to-blue-500 text-white hover:shadow-2xl hover:shadow-blue-500/30'
            }`}
          >
            {showBasicCalc ? <Plus className="w-6 h-6 rotate-45" /> : <Calculator className="w-6 h-6" />}
          </button>
        </div>
      )}
    </div>
  );
}
