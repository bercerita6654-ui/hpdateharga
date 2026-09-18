import React, { useState, useMemo } from 'react';
import {
  ShoppingCart,
  Search,
  X,
  Plus,
  Trash2,
  Edit3,
  Sparkles,
  Sliders,
  Check,
  CheckCheck,
  Copy,
  FolderPlus,
  Tag,
  FileSpreadsheet,
  RefreshCw,
  Info,
  Layers,
  TrendingDown,
  ArrowRight,
  Package,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { Product } from '../types';
import { WholesaleBasketItem, WholesaleTier } from './WholesaleTab';
import { formatIDR, formatInput, parseInput, sanitizeSku } from '../utils/helpers';

interface WholesaleBasketModalProps {
  isOpen: boolean;
  onClose: () => void;
  wholesaleBasket: WholesaleBasketItem[];
  setWholesaleBasket: React.Dispatch<React.SetStateAction<WholesaleBasketItem[]>>;
  productList: Product[];
  rounding?: string;
  onLoadItemToEditor: (item: WholesaleBasketItem) => void;
  onBatchSaveToSpreadsheet: () => Promise<void>;
  isSavingBatch: boolean;
  onOpenBulkCategoryModal: () => void;
  onOpenBulkBrandModal: () => void;
  targetSpreadsheetId: string;
}

export default function WholesaleBasketModal({
  isOpen,
  onClose,
  wholesaleBasket,
  setWholesaleBasket,
  productList,
  rounding = '1000',
  onLoadItemToEditor,
  onBatchSaveToSpreadsheet,
  isSavingBatch,
  onOpenBulkCategoryModal,
  onOpenBulkBrandModal,
  targetSpreadsheetId
}: WholesaleBasketModalProps) {
  // Search within basket
  const [basketSearchQuery, setBasketSearchQuery] = useState<string>('');

  // Search & add new product from catalog directly in modal
  const [catalogSearchQuery, setCatalogSearchQuery] = useState<string>('');
  const [showCatalogDropdown, setShowCatalogDropdown] = useState<boolean>(false);

  // Selected items for bulk actions (checkboxes)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Confirmation dialogs (to avoid iframe window.confirm blocks)
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState<boolean>(false);

  // Bulk Edit Panel open/closed state
  const [isBulkEditOpen, setIsBulkEditOpen] = useState<boolean>(false);

  // Bulk Edit Mode: 'percent' (e.g. T1: 5%, T2: 10%, T3: 15%) vs 'fixed_price' (fixed nominal Rp)
  const [bulkEditMode, setBulkEditMode] = useState<'percent' | 'fixed_price'>('percent');

  // Bulk Edit Scope: 'all' | 'selected' | 'filtered'
  const [bulkApplyScope, setBulkApplyScope] = useState<'all' | 'selected'>('all');

  // Bulk Tiers Configuration State
  const [bulkT1, setBulkT1] = useState<{ minQty: number; maxQty: number | null; value: number }>({
    minQty: 3,
    maxQty: 5,
    value: 5 // 5% discount or Rp value
  });
  const [bulkT2, setBulkT2] = useState<{ minQty: number; maxQty: number | null; value: number }>({
    minQty: 6,
    maxQty: 11,
    value: 10 // 10% discount or Rp value
  });
  const [bulkT3, setBulkT3] = useState<{ minQty: number; maxQty: number | null; value: number }>({
    minQty: 12,
    maxQty: 100,
    value: 15 // 15% discount or Rp value
  });

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string>('');
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage('');
    }, 3000);
  };

  // Helper rounding
  const applyRound = (val: number, roundOpt = rounding) => {
    if (roundOpt === '1000') return Math.round(val / 1000) * 1000;
    if (roundOpt === '500') return Math.round(val / 500) * 500;
    if (roundOpt === '100') return Math.round(val / 100) * 100;
    return Math.round(val);
  };

  // Filter items in basket by search query
  const filteredBasket = useMemo(() => {
    if (!basketSearchQuery.trim()) return wholesaleBasket;
    const q = basketSearchQuery.toLowerCase().trim();
    return wholesaleBasket.filter(item => {
      const matchSku = item.sku.toLowerCase().includes(q);
      const matchName = item.productName.toLowerCase().includes(q);
      const matchUnit = (item.unit || '').toLowerCase().includes(q);
      return matchSku || matchName || matchUnit;
    });
  }, [wholesaleBasket, basketSearchQuery]);

  // Catalog products for quick search & add inside modal
  const filteredCatalogProducts = useMemo(() => {
    if (!catalogSearchQuery.trim()) return [];
    const q = catalogSearchQuery.toLowerCase().trim();
    return productList
      .filter(p => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 10);
  }, [productList, catalogSearchQuery]);

  // Calculate default automatic price: (Eceran + 28% + 3.000)
  const calculateAutoPrice = (eceranVal: number, roundOpt = rounding) => {
    const raw = eceranVal + (eceranVal * 0.28) + 3000;
    return applyRound(raw, roundOpt);
  };

  // Add a product from catalog directly into basket
  const handleAddCatalogProduct = (p: Product) => {
    const pSku = p.sku || '';
    const pName = p.name || (pSku ? `Produk ${pSku}` : 'PRODUK GROSIR');
    const pUnit = p.unit || 'pcs';
    const prodPrice = p.eceran && p.eceran > 0
      ? calculateAutoPrice(p.eceran, rounding)
      : (p.hpp && p.hpp > 0 ? applyRound(p.hpp * 1.35, rounding) : 100000);

    // Default 3 tiers: -5%, -10%, -15%
    const pTiers: WholesaleTier[] = [
      { id: '1', minQty: 3, maxQty: 5, price: Math.max(100, applyRound(prodPrice * 0.95, rounding)) },
      { id: '2', minQty: 6, maxQty: 11, price: Math.max(100, applyRound(prodPrice * 0.90, rounding)) },
      { id: '3', minQty: 12, maxQty: 100, price: Math.max(100, applyRound(prodPrice * 0.85, rounding)) }
    ];

    const newItem: WholesaleBasketItem = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      sku: pSku,
      productName: pName,
      unit: pUnit,
      normalPrice: prodPrice,
      tiers: pTiers,
      addedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    };

    setWholesaleBasket(prev => {
      const cleanSku = sanitizeSku(pSku);
      if (cleanSku) {
        const idx = prev.findIndex(item => sanitizeSku(item.sku) === cleanSku);
        if (idx !== -1) {
          const clone = [...prev];
          clone[idx] = newItem;
          showToast(`Produk ${pSku} diperbarui di antrean!`);
          return clone;
        }
      }
      showToast(`Produk ${pSku || pName} berhasil ditambahkan ke antrean!`);
      return [...prev, newItem];
    });

    setCatalogSearchQuery('');
    setShowCatalogDropdown(false);
  };

  // Toggle selection
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Select all / Deselect all
  const handleSelectAll = () => {
    if (selectedIds.length === filteredBasket.length && filteredBasket.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredBasket.map(item => item.id));
    }
  };

  // Remove single item
  const handleRemoveItem = (id: string) => {
    setWholesaleBasket(prev => prev.filter(item => item.id !== id));
    setSelectedIds(prev => prev.filter(i => i !== id));
    showToast('Produk dihapus dari antrean');
  };

  // Delete selected items
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) return;
    setShowDeleteSelectedConfirm(true);
  };

  const handleConfirmDeleteSelected = () => {
    const count = selectedIds.length;
    setWholesaleBasket(prev => prev.filter(item => !selectedIds.includes(item.id)));
    setSelectedIds([]);
    setShowDeleteSelectedConfirm(false);
    showToast(`${count} produk terpilih berhasil dihapus dari antrean`);
  };

  // Clear entire basket
  const handleClearAll = () => {
    if (wholesaleBasket.length === 0) {
      showToast('Keranjang grosir sudah kosong');
      return;
    }
    setShowClearConfirm(true);
  };

  const handleConfirmClearAll = () => {
    setWholesaleBasket([]);
    setSelectedIds([]);
    setShowClearConfirm(false);
    try {
      localStorage.removeItem('marp_wholesale_basket');
    } catch {
      // ignore
    }
    showToast('Seluruh produk di keranjang antrean berhasil dikosongkan. Siap menambah data baru!');
  };

  // --- PER-PRODUCT T1, T2, T3 UPDATE HANDLERS ---
  const handleUpdateItemNormalPrice = (itemId: string, newPrice: number) => {
    setWholesaleBasket(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        return {
          ...item,
          normalPrice: Math.max(0, newPrice)
        };
      })
    );
  };

  const handleUpdateItemTier = (
    itemId: string,
    tierIndex: number,
    field: keyof WholesaleTier,
    value: any
  ) => {
    setWholesaleBasket(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        const tiersClone = (item.tiers || []).map(t => ({ ...t }));
        
        // Ensure tier exists
        while (tiersClone.length <= tierIndex) {
          const prevT = tiersClone[tiersClone.length - 1];
          const minQ = prevT && typeof prevT.maxQty === 'number' ? prevT.maxQty + 1 : (tierIndex === 0 ? 3 : 6);
          const maxQ = minQ + 10;
          const price = prevT ? Math.max(100, Math.round(prevT.price * 0.95)) : Math.round(item.normalPrice * 0.95);
          tiersClone.push({
            id: String(tiersClone.length + 1),
            minQty: minQ,
            maxQty: maxQ,
            price: price
          });
        }

        const current = { ...tiersClone[tierIndex] };

        if (field === 'price') {
          current.price = Math.max(0, parseInt(value, 10) || 0);
          tiersClone[tierIndex] = current;
        } else if (field === 'minQty') {
          const parsed = parseInt(value, 10);
          if (!isNaN(parsed) && parsed >= 1) {
            current.minQty = parsed;
            // Sync previous maxQty if tierIndex > 0
            if (tierIndex > 0 && tiersClone[tierIndex - 1]) {
              tiersClone[tierIndex - 1].maxQty = Math.max(1, parsed - 1);
            }
            if (typeof current.maxQty === 'number' && current.maxQty <= parsed) {
              current.maxQty = parsed + (tierIndex === 0 ? 3 : 6);
            }
          }
          tiersClone[tierIndex] = current;
        } else if (field === 'maxQty') {
          if (value === '' || value === null || value === undefined) {
            current.maxQty = null;
          } else {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 1) {
              current.maxQty = parsed;
              if (current.minQty >= parsed) {
                current.minQty = Math.max(1, parsed - 1);
              }
              // Cascade next minQty
              if (tierIndex + 1 < tiersClone.length) {
                tiersClone[tierIndex + 1].minQty = parsed + 1;
              }
            } else {
              current.maxQty = null;
            }
          }
          tiersClone[tierIndex] = current;
        }

        return {
          ...item,
          tiers: tiersClone
        };
      })
    );
  };

  // Auto-generate recommended T1, T2, T3 for a single item
  const handleAutoRecommendSingleItem = (itemId: string) => {
    setWholesaleBasket(prev =>
      prev.map(item => {
        if (item.id !== itemId) return item;
        const base = item.normalPrice > 0 ? item.normalPrice : 100000;
        const p1 = applyRound(base * 0.95, rounding);
        const p2 = applyRound(base * 0.90, rounding);
        const p3 = applyRound(base * 0.85, rounding);

        return {
          ...item,
          tiers: [
            { id: '1', minQty: 3, maxQty: 5, price: Math.max(100, p1 >= base ? base - 500 : p1) },
            { id: '2', minQty: 6, maxQty: 11, price: Math.max(100, p2 >= p1 ? p1 - 500 : p2) },
            { id: '3', minQty: 12, maxQty: 100, price: Math.max(100, p3 >= p2 ? p2 - 500 : p3) }
          ]
        };
      })
    );
    showToast('Rekomendasi T1, T2, T3 berhasil diterapkan untuk produk ini!');
  };

  // Copy single product WA format
  const handleCopySingleItemWa = (item: WholesaleBasketItem) => {
    let text = `*SKEMA HARGA GROSIR*\n`;
    text += `📦 *${item.sku ? item.sku + ' - ' : ''}${item.productName}*\n`;
    text += `💰 Harga Normal: *${formatIDR(item.normalPrice)}* / ${(item.unit || 'pcs').toUpperCase()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    (item.tiers || []).forEach((t, i) => {
      const maxStr = t.maxQty ? `${t.maxQty}` : 'dst';
      text += `🔹 *Tier ${i + 1}* (${t.minQty} - ${maxStr} ${item.unit || 'pcs'}) ➔ *${formatIDR(t.price)}*\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_Harga grosir otomatis aktif saat checkout._`;

    navigator.clipboard.writeText(text);
    setCopiedItemId(item.id);
    showToast(`Format WhatsApp ${item.sku || item.productName} tersalin!`);
    setTimeout(() => {
      setCopiedItemId(null);
    }, 2000);
  };

  // --- BULK EDIT EXECUTION (UBAH T1, T2, T3 SECARA MASAL) ---
  const applyPresetBulk = (presetType: 'reseller' | 'dozen' | 'bulk_carton') => {
    if (presetType === 'reseller') {
      setBulkT1({ minQty: 3, maxQty: 5, value: 5 });
      setBulkT2({ minQty: 6, maxQty: 11, value: 10 });
      setBulkT3({ minQty: 12, maxQty: 100, value: 15 });
      setBulkEditMode('percent');
      showToast('Preset Reseller (T1: 3-5 pcs -5%, T2: 6-11 pcs -10%, T3: 12-100 pcs -15%) dipilih');
    } else if (presetType === 'dozen') {
      setBulkT1({ minQty: 6, maxQty: 11, value: 6 });
      setBulkT2({ minQty: 12, maxQty: 23, value: 12 });
      setBulkT3({ minQty: 24, maxQty: 100, value: 18 });
      setBulkEditMode('percent');
      showToast('Preset Lusinan (T1: 6-11 pcs -6%, T2: 12-23 pcs -12%, T3: 24-100 pcs -18%) dipilih');
    } else if (presetType === 'bulk_carton') {
      setBulkT1({ minQty: 12, maxQty: 24, value: 10 });
      setBulkT2({ minQty: 25, maxQty: 49, value: 15 });
      setBulkT3({ minQty: 50, maxQty: 200, value: 22 });
      setBulkEditMode('percent');
      showToast('Preset Partai Besar (T1: 12-24 pcs -10%, T2: 25-49 pcs -15%, T3: 50-200 pcs -22%) dipilih');
    }
  };

  const handleExecuteBulkEdit = () => {
    if (wholesaleBasket.length === 0) {
      showToast('Keranjang antrean kosong');
      return;
    }

    const targetItems = bulkApplyScope === 'selected' && selectedIds.length > 0
      ? wholesaleBasket.filter(item => selectedIds.includes(item.id))
      : wholesaleBasket;

    if (targetItems.length === 0) {
      showToast('Tidak ada produk yang dipilih untuk penerapan masal.');
      return;
    }

    setWholesaleBasket(prev =>
      prev.map(item => {
        // Check if item is in target scope
        const isTarget = bulkApplyScope === 'selected' && selectedIds.length > 0
          ? selectedIds.includes(item.id)
          : true;

        if (!isTarget) return item;

        const base = item.normalPrice > 0 ? item.normalPrice : 100000;

        let p1: number;
        let p2: number;
        let p3: number;

        if (bulkEditMode === 'percent') {
          // Percent discount from each product's individual normal price
          const disc1 = Math.max(0, Math.min(90, bulkT1.value)) / 100;
          const disc2 = Math.max(0, Math.min(90, bulkT2.value)) / 100;
          const disc3 = Math.max(0, Math.min(90, bulkT3.value)) / 100;

          p1 = applyRound(base * (1 - disc1), rounding);
          if (p1 >= base) p1 = Math.max(100, base - 500);

          p2 = applyRound(base * (1 - disc2), rounding);
          if (p2 >= p1) p2 = Math.max(100, p1 - 500);

          p3 = applyRound(base * (1 - disc3), rounding);
          if (p3 >= p2) p3 = Math.max(100, p2 - 500);
        } else {
          // Fixed nominal price
          p1 = Math.max(100, bulkT1.value);
          p2 = Math.max(100, bulkT2.value);
          p3 = Math.max(100, bulkT3.value);
        }

        const newTiers: WholesaleTier[] = [
          {
            id: '1',
            minQty: Math.max(1, bulkT1.minQty),
            maxQty: bulkT1.maxQty,
            price: p1
          },
          {
            id: '2',
            minQty: Math.max(1, bulkT2.minQty),
            maxQty: bulkT2.maxQty,
            price: p2
          },
          {
            id: '3',
            minQty: Math.max(1, bulkT3.minQty),
            maxQty: bulkT3.maxQty,
            price: p3
          }
        ];

        return {
          ...item,
          tiers: newTiers
        };
      })
    );

    showToast(`Sukses! T1, T2, dan T3 berhasil diubah secara masal pada ${targetItems.length} produk.`);
    setIsBulkEditOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative">
        
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-gradient-to-r from-indigo-50/90 via-slate-50 to-purple-50/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base sm:text-lg text-slate-800">
                  Keranjang Antrean Harga Grosir
                </h3>
                <span className="px-2.5 py-0.5 text-xs font-black rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {wholesaleBasket.length} Produk
                </span>
                {selectedIds.length > 0 && (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    {selectedIds.length} Terpilih
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Edit tingkatan harga <strong>T1, T2, T3</strong> secara masal atau per produk sebelum disimpan sekaligus ke Google Spreadsheet.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <button
              onClick={() => setIsBulkEditOpen(!isBulkEditOpen)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border ${
                isBulkEditOpen
                  ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
              }`}
              title="Buka panel ubah T1, T2, T3 secara masal untuk seluruh produk"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isBulkEditOpen ? 'Tutup Ubah Masal' : '⚙️ Ubah Masal T1, T2, T3'}</span>
              {isBulkEditOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TOAST MESSAGE NOTIFICATION */}
        {toastMessage && (
          <div className="bg-slate-800 text-white px-4 py-2 text-xs flex items-center justify-between shadow-inner animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400" />
              <span>{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage('')} className="text-slate-400 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TOP CONTROLS & SEARCH BAR */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          
          {/* SEARCH BAR (PRODUCT SEARCH BUTTON & FIELD IN BASKET) */}
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={basketSearchQuery}
                onChange={e => setBasketSearchQuery(e.target.value)}
                placeholder="Cari produk di antrean (SKU, Nama, Unit)..."
                className="w-full pl-9 pr-8 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-slate-800 font-medium placeholder:text-slate-400 shadow-xs"
              />
              {basketSearchQuery && (
                <button
                  onClick={() => setBasketSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-0.5 rounded-md hover:bg-slate-100"
                  title="Hapus pencarian"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {basketSearchQuery && (
              <span className="text-[11px] font-bold text-slate-500 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shrink-0">
                {filteredBasket.length} dari {wholesaleBasket.length} cocok
              </span>
            )}
          </div>

          {/* QUICK ADD FROM CATALOG DROPDOWN */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <div className="flex items-center">
                <input
                  type="text"
                  value={catalogSearchQuery}
                  onChange={e => {
                    setCatalogSearchQuery(e.target.value);
                    setShowCatalogDropdown(true);
                  }}
                  onFocus={() => setShowCatalogDropdown(true)}
                  placeholder="+ Cari & Tambah Produk Katalog..."
                  className="w-56 sm:w-64 pl-3 pr-7 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none text-slate-800 placeholder:text-indigo-400/80 shadow-2xs font-medium"
                />
                {catalogSearchQuery && (
                  <button
                    onClick={() => {
                      setCatalogSearchQuery('');
                      setShowCatalogDropdown(false);
                    }}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Autocomplete Dropdown */}
              {showCatalogDropdown && catalogSearchQuery.trim() && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 max-h-60 overflow-y-auto z-40 divide-y divide-slate-100 animate-in fade-in zoom-in-95">
                  {filteredCatalogProducts.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">
                      Tidak ada produk ditemukan untuk &quot;{catalogSearchQuery}&quot;
                    </div>
                  ) : (
                    filteredCatalogProducts.map(p => (
                      <div
                        key={p.sku}
                        onClick={() => handleAddCatalogProduct(p)}
                        className="p-2.5 hover:bg-indigo-50/80 cursor-pointer transition-colors text-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded text-[11px]">
                              {p.sku}
                            </span>
                            <span className="font-bold text-slate-800 truncate block">
                              {p.name}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>Eceran: {formatIDR(p.eceran)}</span>
                            <span>•</span>
                            <span>HPP: {formatIDR(p.hpp)}</span>
                            <span>•</span>
                            <span className="uppercase">{p.unit || 'pcs'}</span>
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-indigo-600 shrink-0" />
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <button
              onClick={onOpenBulkCategoryModal}
              className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
              title="Bulk Add seluruh produk berdasarkan Kategori"
            >
              <FolderPlus className="w-3.5 h-3.5 text-sky-600" />
              <span>+ Kategori</span>
            </button>

            <button
              onClick={onOpenBulkBrandModal}
              className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
              title="Bulk Add seluruh produk berdasarkan Merk"
            >
              <Tag className="w-3.5 h-3.5 text-purple-600" />
              <span>+ Merk</span>
            </button>
          </div>
        </div>

        {/* EXPANDABLE BULK EDIT PANEL (UBAH T1, T2, T3 SECARA MASAL) */}
        {isBulkEditOpen && (
          <div className="p-4 bg-amber-50/70 border-b border-amber-200 animate-in slide-in-from-top-2 duration-200 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-700" />
                <span className="font-black text-xs text-amber-950 uppercase tracking-wider">
                  Pengaturan Ubah T1, T2, T3 Secara Masal (Bulk Edit)
                </span>
              </div>
              
              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-amber-800 font-bold">Preset Cepat:</span>
                <button
                  type="button"
                  onClick={() => applyPresetBulk('reseller')}
                  className="px-2 py-0.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                >
                  Reseller (5% / 10% / 15%)
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetBulk('dozen')}
                  className="px-2 py-0.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                >
                  Lusinan (6% / 12% / 18%)
                </button>
                <button
                  type="button"
                  onClick={() => applyPresetBulk('bulk_carton')}
                  className="px-2 py-0.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-md text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                >
                  Partai (10% / 15% / 22%)
                </button>
              </div>
            </div>

            {/* Mode & Scope Controls */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white p-3 rounded-xl border border-amber-200 shadow-xs">
              
              {/* Scope Selection */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Target Produk yang Diubah:
                </label>
                <select
                  value={bulkApplyScope}
                  onChange={e => setBulkApplyScope(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="all">Semua Produk di Antrean ({wholesaleBasket.length} Item)</option>
                  <option value="selected" disabled={selectedIds.length === 0}>
                    Hanya Produk yang Dicentang ({selectedIds.length} Terpilih)
                  </option>
                </select>
              </div>

              {/* Mode Selection */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Mode Perhitungan Harga:
                </label>
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setBulkEditMode('percent')}
                    className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      bulkEditMode === 'percent'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    % Diskon dari Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkEditMode('fixed_price')}
                    className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      bulkEditMode === 'fixed_price'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Nominal Rp Tetap
                  </button>
                </div>
              </div>

              {/* Note on pricing math */}
              <div className="md:col-span-2 flex items-center gap-2 text-[11px] text-amber-900 bg-amber-50/90 p-2 rounded-lg border border-amber-200">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {bulkEditMode === 'percent'
                    ? 'Harga grosir setiap produk akan dihitung otomatis: Harga Normal × (100% - Diskon %) dengan pembulatan Rp ' + rounding
                    : 'Semua produk target akan memiliki nominal harga grosir yang sama persis sesuai isian di bawah.'}
                </span>
              </div>
            </div>

            {/* 3 TIERS BULK CONTROLS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              
              {/* TIER 1 */}
              <div className="bg-white p-3 rounded-xl border-2 border-amber-300/80 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                    Tier 1 (T1)
                  </span>
                  <span className="text-[11px] text-slate-500 font-semibold">
                    {bulkEditMode === 'percent' ? `Diskon ${bulkT1.value}%` : formatIDR(bulkT1.value)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block">Min Qty:</label>
                    <input
                      type="number"
                      min={2}
                      value={bulkT1.minQty}
                      onChange={e => setBulkT1(prev => ({ ...prev, minQty: parseInt(e.target.value, 10) || 2 }))}
                      className="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block">Max Qty:</label>
                    <input
                      type="number"
                      min={bulkT1.minQty}
                      value={bulkT1.maxQty ?? ''}
                      onChange={e => setBulkT1(prev => ({ ...prev, maxQty: e.target.value ? parseInt(e.target.value, 10) : null }))}
                      placeholder="Contoh: 5"
                      className="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block">
                    {bulkEditMode === 'percent' ? 'Diskon dari Normal (%) :' : 'Harga Grosir T1 (Rp) :'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={bulkT1.value}
                      onChange={e => setBulkT1(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2.5 py-1 border border-amber-300 rounded-lg text-xs font-mono font-black text-amber-900 bg-amber-50/50"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-amber-700">
                      {bulkEditMode === 'percent' ? '%' : 'Rp'}
                    </span>
                  </div>
                </div>
              </div>

              {/* TIER 2 */}
              <div className="bg-white p-3 rounded-xl border-2 border-amber-300/80 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                    Tier 2 (T2)
                  </span>
                  <span className="text-[11px] text-slate-500 font-semibold">
                    {bulkEditMode === 'percent' ? `Diskon ${bulkT2.value}%` : formatIDR(bulkT2.value)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block">Min Qty:</label>
                    <input
                      type="number"
                      min={bulkT1.maxQty ? bulkT1.maxQty + 1 : 6}
                      value={bulkT2.minQty}
                      onChange={e => setBulkT2(prev => ({ ...prev, minQty: parseInt(e.target.value, 10) || 6 }))}
                      className="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block">Max Qty:</label>
                    <input
                      type="number"
                      min={bulkT2.minQty}
                      value={bulkT2.maxQty ?? ''}
                      onChange={e => setBulkT2(prev => ({ ...prev, maxQty: e.target.value ? parseInt(e.target.value, 10) : null }))}
                      placeholder="Contoh: 11"
                      className="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block">
                    {bulkEditMode === 'percent' ? 'Diskon dari Normal (%) :' : 'Harga Grosir T2 (Rp) :'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={bulkT2.value}
                      onChange={e => setBulkT2(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2.5 py-1 border border-amber-300 rounded-lg text-xs font-mono font-black text-amber-900 bg-amber-50/50"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-amber-700">
                      {bulkEditMode === 'percent' ? '%' : 'Rp'}
                    </span>
                  </div>
                </div>
              </div>

              {/* TIER 3 */}
              <div className="bg-white p-3 rounded-xl border-2 border-amber-300/80 space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-amber-900 bg-amber-100 px-2 py-0.5 rounded">
                    Tier 3 (T3)
                  </span>
                  <span className="text-[11px] text-slate-500 font-semibold">
                    {bulkEditMode === 'percent' ? `Diskon ${bulkT3.value}%` : formatIDR(bulkT3.value)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block">Min Qty:</label>
                    <input
                      type="number"
                      min={bulkT2.maxQty ? bulkT2.maxQty + 1 : 12}
                      value={bulkT3.minQty}
                      onChange={e => setBulkT3(prev => ({ ...prev, minQty: parseInt(e.target.value, 10) || 12 }))}
                      className="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block">Max Qty:</label>
                    <input
                      type="number"
                      value={bulkT3.maxQty ?? ''}
                      onChange={e => setBulkT3(prev => ({ ...prev, maxQty: e.target.value ? parseInt(e.target.value, 10) : null }))}
                      placeholder="100 (atau kosongkan)"
                      className="w-full px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block">
                    {bulkEditMode === 'percent' ? 'Diskon dari Normal (%) :' : 'Harga Grosir T3 (Rp) :'}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={bulkT3.value}
                      onChange={e => setBulkT3(prev => ({ ...prev, value: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-2.5 py-1 border border-amber-300 rounded-lg text-xs font-mono font-black text-amber-900 bg-amber-50/50"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-amber-700">
                      {bulkEditMode === 'percent' ? '%' : 'Rp'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Execute Bulk Button */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsBulkEditOpen(false)}
                className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkEdit}
                className="px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer transition-all"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Terapkan Perubahan T1, T2, T3 ke {bulkApplyScope === 'selected' && selectedIds.length > 0 ? `${selectedIds.length} Produk Terpilih` : `Semua (${wholesaleBasket.length} Produk)`}</span>
              </button>
            </div>
          </div>
        )}

        {/* MODAL BODY: LIST OF PRODUCTS IN QUEUE */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3 bg-slate-50/50">
          {wholesaleBasket.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-4">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                <ShoppingCart className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-700 text-sm">Keranjang Grosir Masih Kosong</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Gunakan kolom pencarian di atas untuk menambahkan produk langsung dari katalog, atau gunakan tombol <strong>Bulk Kategori / Merk</strong> untuk memasukkan seluruh produk sekaligus!
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  onClick={onOpenBulkCategoryModal}
                  className="px-4 py-2 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <FolderPlus className="w-4 h-4 text-sky-600" />
                  <span>Bulk Add per Kategori</span>
                </button>
                <button
                  onClick={onOpenBulkBrandModal}
                  className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Tag className="w-4 h-4 text-purple-600" />
                  <span>Bulk Add per Merk</span>
                </button>
              </div>
            </div>
          ) : filteredBasket.length === 0 ? (
            <div className="text-center py-10 px-4 space-y-3 bg-white rounded-2xl border border-slate-200">
              <Search className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-bold text-slate-600">
                Tidak ada produk di keranjang yang cocok dengan kata kunci &quot;{basketSearchQuery}&quot;
              </p>
              <button
                onClick={() => setBasketSearchQuery('')}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                Reset Pencarian
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Batch Action Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 px-1 gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-1.5 font-bold text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredBasket.length && filteredBasket.length > 0}
                      onChange={handleSelectAll}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Pilih Semua ({filteredBasket.length})</span>
                  </label>

                  {selectedIds.length > 0 && (
                    <button
                      onClick={handleDeleteSelected}
                      className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      <span>Hapus ({selectedIds.length}) Terpilih</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <span className="text-[11px] text-slate-400">
                    💡 Tip: Edit kuantitas dan harga T1, T2, T3 langsung pada setiap kotak produk di bawah
                  </span>
                  <button
                    onClick={handleClearAll}
                    className="text-red-500 hover:text-red-700 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Kosongkan Semua</span>
                  </button>
                </div>
              </div>

              {/* LIST OF PRODUCTS (INLINE T1, T2, T3 EDITING PER PRODUCT) */}
              <div className="space-y-3">
                {filteredBasket.map((item, idx) => {
                  const isSelected = selectedIds.includes(item.id);
                  const isCopied = copiedItemId === item.id;
                  const t1 = item.tiers?.[0] || { id: '1', minQty: 3, maxQty: 5, price: Math.round(item.normalPrice * 0.95) };
                  const t2 = item.tiers?.[1] || { id: '2', minQty: 6, maxQty: 11, price: Math.round(item.normalPrice * 0.90) };
                  const t3 = item.tiers?.[2] || { id: '3', minQty: 12, maxQty: 100, price: Math.round(item.normalPrice * 0.85) };

                  // Diskon percentage calculations
                  const d1 = item.normalPrice > 0 ? ((item.normalPrice - t1.price) / item.normalPrice) * 100 : 0;
                  const d2 = item.normalPrice > 0 ? ((item.normalPrice - t2.price) / item.normalPrice) * 100 : 0;
                  const d3 = item.normalPrice > 0 ? ((item.normalPrice - t3.price) / item.normalPrice) * 100 : 0;

                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-2xl border transition-all p-4 shadow-xs space-y-3 ${
                        isSelected
                          ? 'border-indigo-400 ring-2 ring-indigo-100 bg-indigo-50/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Product Header Row */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(item.id)}
                            className="mt-1 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-400">#{idx + 1}</span>
                              <span className="font-mono font-bold text-orange-600 text-xs bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                                {item.sku || 'TANPA SKU'}
                              </span>
                              <h4 className="font-extrabold text-sm text-slate-800">
                                {item.productName}
                              </h4>
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase">
                                {item.unit || 'pcs'}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                Ditambahkan {item.addedAt}
                              </span>
                            </div>

                            {/* Normal Price Edit Input */}
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs font-bold text-slate-600">
                                Harga Normal Satuan:
                              </span>
                              <div className="relative w-36">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                  Rp
                                </span>
                                <input
                                  type="text"
                                  value={formatInput(item.normalPrice)}
                                  onChange={e => handleUpdateItemNormalPrice(item.id, Number(parseInput(e.target.value)) || 0)}
                                  className="w-full pl-8 pr-2.5 py-1 bg-blue-50/60 border border-blue-200 rounded-lg text-xs font-mono font-bold text-blue-800 focus:ring-2 focus:ring-blue-500 outline-none"
                                  title="Ubah harga jual normal satuan untuk produk ini"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Top Action Buttons per product */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end md:self-auto">
                          <button
                            type="button"
                            onClick={() => handleAutoRecommendSingleItem(item.id)}
                            className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Hitung otomatis rekomendasi T1 (-5%), T2 (-10%), T3 (-15%) untuk produk ini"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            <span>Auto T1-T3</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopySingleItemWa(item)}
                            className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Salin format teks WhatsApp untuk produk ini"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-emerald-600" />}
                            <span>{isCopied ? 'Tersalin!' : 'Salin WA'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onLoadItemToEditor(item)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Buka data produk ini di kalkulator utama"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                            <span>Kalkulator</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Hapus dari antrean"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* INLINE T1, T2, T3 CONTROLS FOR THIS PRODUCT */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                        
                        {/* TIER 1 (T1) */}
                        <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-amber-900 bg-amber-200/80 px-1.5 py-0.5 rounded">
                              Tier 1 (T1)
                            </span>
                            <span className="text-[11px] font-bold text-amber-800 bg-white px-1.5 py-0.5 rounded border border-amber-200">
                              Diskon {d1.toFixed(1)}%
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <div>
                              <span className="text-slate-500 block text-[10px] font-bold">Min Qty:</span>
                              <input
                                type="number"
                                min={2}
                                value={t1.minQty}
                                onChange={e => handleUpdateItemTier(item.id, 0, 'minQty', e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-amber-200 rounded-md text-xs font-mono font-bold text-slate-800"
                              />
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] font-bold">Max Qty:</span>
                              <input
                                type="number"
                                min={t1.minQty}
                                value={t1.maxQty ?? ''}
                                onChange={e => handleUpdateItemTier(item.id, 0, 'maxQty', e.target.value)}
                                placeholder="Max"
                                className="w-full px-2 py-1 bg-white border border-amber-200 rounded-md text-xs font-mono font-bold text-slate-800"
                              />
                            </div>
                          </div>

                          <div>
                            <span className="text-slate-600 block text-[10px] font-bold">Harga Grosir T1 (Rp):</span>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                                Rp
                              </span>
                              <input
                                type="text"
                                value={formatInput(t1.price)}
                                onChange={e => handleUpdateItemTier(item.id, 0, 'price', parseInput(e.target.value))}
                                className="w-full pl-7 pr-2 py-1 bg-white border border-amber-300 rounded-md text-xs font-mono font-bold text-amber-950 focus:ring-1 focus:ring-amber-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* TIER 2 (T2) */}
                        <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-amber-900 bg-amber-200/80 px-1.5 py-0.5 rounded">
                              Tier 2 (T2)
                            </span>
                            <span className="text-[11px] font-bold text-amber-800 bg-white px-1.5 py-0.5 rounded border border-amber-200">
                              Diskon {d2.toFixed(1)}%
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <div>
                              <span className="text-slate-500 block text-[10px] font-bold">Min Qty:</span>
                              <input
                                type="number"
                                min={t1.maxQty ? t1.maxQty + 1 : 6}
                                value={t2.minQty}
                                onChange={e => handleUpdateItemTier(item.id, 1, 'minQty', e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-amber-200 rounded-md text-xs font-mono font-bold text-slate-800"
                              />
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] font-bold">Max Qty:</span>
                              <input
                                type="number"
                                min={t2.minQty}
                                value={t2.maxQty ?? ''}
                                onChange={e => handleUpdateItemTier(item.id, 1, 'maxQty', e.target.value)}
                                placeholder="Max"
                                className="w-full px-2 py-1 bg-white border border-amber-200 rounded-md text-xs font-mono font-bold text-slate-800"
                              />
                            </div>
                          </div>

                          <div>
                            <span className="text-slate-600 block text-[10px] font-bold">Harga Grosir T2 (Rp):</span>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                                Rp
                              </span>
                              <input
                                type="text"
                                value={formatInput(t2.price)}
                                onChange={e => handleUpdateItemTier(item.id, 1, 'price', parseInput(e.target.value))}
                                className="w-full pl-7 pr-2 py-1 bg-white border border-amber-300 rounded-md text-xs font-mono font-bold text-amber-950 focus:ring-1 focus:ring-amber-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* TIER 3 (T3) */}
                        <div className="p-2.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-amber-900 bg-amber-200/80 px-1.5 py-0.5 rounded">
                              Tier 3 (T3)
                            </span>
                            <span className="text-[11px] font-bold text-amber-800 bg-white px-1.5 py-0.5 rounded border border-amber-200">
                              Diskon {d3.toFixed(1)}%
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <div>
                              <span className="text-slate-500 block text-[10px] font-bold">Min Qty:</span>
                              <input
                                type="number"
                                min={t2.maxQty ? t2.maxQty + 1 : 12}
                                value={t3.minQty}
                                onChange={e => handleUpdateItemTier(item.id, 2, 'minQty', e.target.value)}
                                className="w-full px-2 py-1 bg-white border border-amber-200 rounded-md text-xs font-mono font-bold text-slate-800"
                              />
                            </div>
                            <div>
                              <span className="text-slate-500 block text-[10px] font-bold">Max Qty:</span>
                              <input
                                type="number"
                                min={t3.minQty}
                                value={t3.maxQty ?? ''}
                                onChange={e => handleUpdateItemTier(item.id, 2, 'maxQty', e.target.value)}
                                placeholder="dst"
                                className="w-full px-2 py-1 bg-white border border-amber-200 rounded-md text-xs font-mono font-bold text-slate-800"
                              />
                            </div>
                          </div>

                          <div>
                            <span className="text-slate-600 block text-[10px] font-bold">Harga Grosir T3 (Rp):</span>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                                Rp
                              </span>
                              <input
                                type="text"
                                value={formatInput(t3.price)}
                                onChange={e => handleUpdateItemTier(item.id, 2, 'price', parseInput(e.target.value))}
                                className="w-full pl-7 pr-2 py-1 bg-white border border-amber-300 rounded-md text-xs font-mono font-bold text-amber-950 focus:ring-1 focus:ring-amber-500"
                              />
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              Format baris tersimpan ke sheet <strong>Harga Grosir</strong> (Kolom A-J: SKU, Nama, Unit, Harga Satuan, T1, T2, T3, FALSE, FALSE).
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Tutup
            </button>
            <button
              onClick={onBatchSaveToSpreadsheet}
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

        {/* IN-APP CONFIRMATION DIALOG: KOSONGKAN SEMUA */}
        {showClearConfirm && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border border-slate-200 text-center space-y-4 animate-in zoom-in-95 duration-150">
              <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-extrabold text-slate-800 text-base">Kosongkan Keranjang Antrean?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Seluruh <strong>{wholesaleBasket.length} produk</strong> di antrean akan dihapus dari memori keranjang sehingga Anda dapat mulai menambahkan data baru dari awal.
                </p>
              </div>
              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearAll}
                  className="flex-1 py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  Ya, Kosongkan Semua
                </button>
              </div>
            </div>
          </div>
        )}

        {/* IN-APP CONFIRMATION DIALOG: HAPUS PRODUK TERPILIH */}
        {showDeleteSelectedConfirm && (
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-sm w-full shadow-2xl border border-slate-200 text-center space-y-4 animate-in zoom-in-95 duration-150">
              <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                <Trash2 className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-extrabold text-slate-800 text-base">Hapus Produk Terpilih?</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  <strong>{selectedIds.length} produk</strong> yang Anda centang akan dihapus dari antrean grosir.
                </p>
              </div>
              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteSelectedConfirm(false)}
                  className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteSelected}
                  className="flex-1 py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  Ya, Hapus ({selectedIds.length})
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
