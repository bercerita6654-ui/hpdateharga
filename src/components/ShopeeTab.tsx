/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Database, 
  RefreshCw, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingDown, 
  TrendingUp, 
  ExternalLink,
  HelpCircle,
  ShoppingBag,
  ArrowRightLeft,
  ChevronRight,
  Info,
  Download,
  FileSpreadsheet,
  Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, Fees } from '../types';
import { formatIDR } from '../utils/helpers';

const SHOPEE_BALIST_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQUJWBw2EXirlxov14JNpI1h3ulExBcMQxQ5orpGZmpW7cMqUqMkU9E6OxJ4CBLd4ZvAW8tBmhmEEF6/pub?gid=1378584398&single=true&output=csv';

interface ShopeeProduct {
  productId: string;
  productName: string;
  variationId: string;
  variationName: string;
  parentSku: string;
  variationSku: string;
  price: number;
  stock: number;
  originalRow?: string[];
}

interface ShopeeTabProps {
  productList: Product[];
  fees: Fees;
  setSelectedSku: (sku: string) => void;
  setProduct: React.Dispatch<React.SetStateAction<{ hpp: number; basePrice: number }>>;
  setActiveView: (view: any) => void;
  rounding?: string;
  useSmartMargin?: boolean;
  getSmartMarginForSku?: (sku: string) => number;
  shopName?: string;
  sheetUrl?: string;
  cacheKeyPrefix?: string;
  fileNamePrefix?: string;
}

export default function ShopeeTab({
  productList,
  fees,
  setSelectedSku,
  setProduct,
  setActiveView,
  rounding = 'none',
  useSmartMargin = false,
  getSmartMarginForSku,
  shopName = 'ShopeeBalist',
  sheetUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQUJWBw2EXirlxov14JNpI1h3ulExBcMQxQ5orpGZmpW7cMqUqMkU9E6OxJ4CBLd4ZvAW8tBmhmEEF6/pub?gid=1378584398&single=true&output=csv',
  cacheKeyPrefix = 'shopee_balist',
  fileNamePrefix = 'Shopee_Update_Harga'
}: ShopeeTabProps) {
  const [shopeeItems, setShopeeItems] = useState<ShopeeProduct[]>([]);
  const [shopeeHeaderRows, setShopeeHeaderRows] = useState<string[][]>(() => {
    try {
      const saved = localStorage.getItem(`${cacheKeyPrefix}_header_rows_cache`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      [
        "et_title_product_id", "et_title_product_name", "et_title_variation_id", "et_title_variation_name", 
        "et_title_parent_sku", "et_title_variation_sku", "et_title_variation_price", "ps_gtin_code", 
        "et_title_variation_stock", "ps_minimum_purchase_quantity", "ps_maximum_purchase_quantity", 
        "ps_maximum_purchase_quantity_start_date", "ps_maximum_purchase_quantity_time_period", 
        "ps_maximum_purchase_quantity_end_date", "et_title_reason"
      ],
      [
        "sales_info", "35b74571cd927608dc4cc2b998b916cb", "0", "31475604", "{\"search_condition\":{}}", 
        "", "", "", "", "", "", "", "", "", ""
      ],
      [
        "Kode Produk", "Nama Produk", "Kode Variasi", "Nama Variasi", "SKU Induk", "SKU", "Harga", "GTIN", 
        "Stok", "Min. Jumlah Pembelian", "Maks. Jumlah Pembelian", "Maks. Jumlah Pembelian - Tanggal Mulai", 
        "Maks. Jumlah Pembelian - Jumlah Hari", "Maks. Jumlah Pembelian - Tanggal Berakhir", "Alasan Gagal"
      ],
      ["", "", "", "", "", "", "Wajib", "", "Wajib", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]
    ];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'matched' | 'unmatched' | 'underHpp' | 'underRetail' | 'netProfit' | 'netLoss'>('all');
  const [only5DigitSku, setOnly5DigitSku] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(50);

  const [includeFeesAndCampaign, setIncludeFeesAndCampaign] = useState(true);
  const [autoFixLossProducts, setAutoFixLossProducts] = useState(true);
  const [exportMarginType, setExportMarginType] = useState<string>('smart');
  const [exportMarginVal, setExportMarginVal] = useState<number>(10);
  const [exportBaseType, setExportBaseType] = useState<'hpp' | 'eceran' | 'grosir' | 'partai'>('hpp');

  const [shopeeTabMode, setShopeeTabMode] = useState<'price' | 'stock'>('price');
  const [stockEdits, setStockEdits] = useState<Record<string, number>>({});
  const [stockListMap, setStockListMap] = useState<Record<string, number>>({});
  const [isStockLoading, setIsStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  const getItemStock = (item: ShopeeProduct) => {
    const key = `${item.productId}-${item.variationId}`;
    if (stockEdits[key] !== undefined) {
      const val = stockEdits[key];
      return (val === undefined || val === null || isNaN(val)) ? 0 : val;
    }
    const s = item.stock;
    return (s === undefined || s === null || isNaN(s)) ? 0 : s;
  };

  // Download Shopee template as XLSX with optional calculated prices
  const handleDownloadXLSX = () => {
    // Reconstruct the spreadsheet
    const rows: any[][] = [];

    // Check if current cached headers are 15-column format starting with et_title_product_id
    const hasShopeeHeaders = shopeeHeaderRows.length >= 3 && 
      shopeeHeaderRows[0].some(cell => String(cell).toLowerCase().includes('et_title'));

    if (hasShopeeHeaders) {
      shopeeHeaderRows.forEach(row => {
        rows.push([...row]);
      });
    } else {
      rows.push([
        "et_title_product_id", "et_title_product_name", "et_title_variation_id", "et_title_variation_name", 
        "et_title_parent_sku", "et_title_variation_sku", "et_title_variation_price", "ps_gtin_code", 
        "et_title_variation_stock", "ps_minimum_purchase_quantity", "ps_maximum_purchase_quantity", 
        "ps_maximum_purchase_quantity_start_date", "ps_maximum_purchase_quantity_time_period", 
        "ps_maximum_purchase_quantity_end_date", "et_title_reason"
      ]);
      rows.push([
        "sales_info", "35b74571cd927608dc4cc2b998b916cb", "0", "31475604", "{\"search_condition\":{}}", 
        "", "", "", "", "", "", "", "", "", ""
      ]);
      rows.push([
        "Kode Produk", "Nama Produk", "Kode Variasi", "Nama Variasi", "SKU Induk", "SKU", "Harga", "GTIN", 
        "Stok", "Min. Jumlah Pembelian", "Maks. Jumlah Pembelian", "Maks. Jumlah Pembelian - Tanggal Mulai", 
        "Maks. Jumlah Pembelian - Jumlah Hari", "Maks. Jumlah Pembelian - Tanggal Berakhir", "Alasan Gagal"
      ]);
      rows.push(["", "", "", "", "", "", "Wajib", "", "Wajib", "", "", "", "", "", ""]);
      rows.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
    }

    // Now append each item in filteredItems (the ones that match filters/search)
    filteredItems.forEach(item => {
      let finalPrice = item.price; // default to original Shopee price

      if (includeFeesAndCampaign && item.matchedProduct) {
        let targetNet = 0;
        let margin = 0;

        if (exportBaseType === 'hpp') {
          const basePrice = item.matchedProduct.partai || item.matchedProduct.hpp || 0;
          margin = exportMarginType === 'smart'
            ? (getSmartMarginForSku ? getSmartMarginForSku(item.matchedProduct.sku) : 10)
            : exportMarginVal;
          targetNet = basePrice * (1 + margin / 100);
        } else if (exportBaseType === 'eceran') {
          targetNet = item.matchedProduct.eceran || 0;
        } else if (exportBaseType === 'grosir') {
          targetNet = item.matchedProduct.grosir || 0;
        } else if (exportBaseType === 'partai') {
          targetNet = item.matchedProduct.partai || 0;
        }

        // Calculate total fees percent
        const percentFees =
          (Number(fees?.adminFee) || 0) +
          (Number(fees?.layananXtra) || 0) +
          (Number(fees?.insurance) || 0) +
          (Number(fees?.komisiAMS) || 0) +
          (Number(fees?.campaignFee) || 0);

        // Calculate total nominal fees
        const fixedFees =
          (Number(fees?.marketplaceProcessingFee) || 0) +
          (Number(fees?.jubelioProcessingFee) || 0) +
          (Number(fees?.packingFee) || 0);

        // Use precise reverse fee calculation:
        const decimal = percentFees / 100;
        let rawPrice = 0;
        if (1 - decimal > 0) {
          rawPrice = (targetNet + fixedFees) / (1 - decimal);
        } else {
          rawPrice = targetNet * (1 + decimal) + fixedFees;
        }

        // Apply rounding
        if (rounding === '100') {
          finalPrice = Math.ceil(rawPrice / 100) * 100;
        } else if (rounding === '500') {
          finalPrice = Math.ceil(rawPrice / 500) * 500;
        } else if (rounding === '1000') {
          finalPrice = Math.ceil(rawPrice / 1000) * 1000;
        } else {
          finalPrice = Math.round(rawPrice);
        }
      }

      // Auto-Fix Loss-making products if enabled
      if (autoFixLossProducts && item.matchedProduct) {
        const systemHpp = item.matchedProduct.hpp || 0;
        const percentFees =
          (Number(fees?.adminFee) || 0) +
          (Number(fees?.layananXtra) || 0) +
          (Number(fees?.insurance) || 0) +
          (Number(fees?.komisiAMS) || 0) +
          (Number(fees?.campaignFee) || 0);

        const fixedFees =
          (Number(fees?.marketplaceProcessingFee) || 0) +
          (Number(fees?.jubelioProcessingFee) || 0) +
          (Number(fees?.packingFee) || 0);

        const decimal = percentFees / 100;
        
        // Calculate net payout for the finalPrice
        const currentFees = finalPrice * decimal + fixedFees;
        const currentNetPayout = finalPrice - currentFees;
        const currentNetProfit = currentNetPayout - systemHpp;

        if (currentNetProfit < 0) {
          // Calculate the minimum price to avoid loss (net profit = 0)
          let minRawPrice = 0;
          if (1 - decimal > 0) {
            minRawPrice = (systemHpp + fixedFees) / (1 - decimal);
          } else {
            minRawPrice = systemHpp * (1 + decimal) + fixedFees;
          }

          let minPrice = 0;
          // Apply active rounding
          if (rounding === '100') {
            minPrice = Math.ceil(minRawPrice / 100) * 100;
          } else if (rounding === '500') {
            minPrice = Math.ceil(minRawPrice / 500) * 500;
          } else if (rounding === '1000') {
            minPrice = Math.ceil(minRawPrice / 1000) * 1000;
          } else {
            minPrice = Math.ceil(minRawPrice);
          }

          if (finalPrice < minPrice) {
            finalPrice = minPrice;
          }
        }
      }

      // Reconstruct the 15-column row
      let productRow: any[];
      if (item.originalRow) {
        productRow = [...item.originalRow];
        while (productRow.length < 15) {
          productRow.push("");
        }
      } else {
        productRow = [
          item.productId,
          item.productName,
          item.variationId,
          item.variationName,
          item.parentSku,
          item.variationSku,
          String(item.price),
          "", // GTIN
          "5", // Stok
          "0", // Min
          "", "", "", "", ""
        ];
      }

      // Update price at index 6 (Harga)
      if (productRow.length > 6) {
        productRow[6] = String(finalPrice);
      }

      rows.push(productRow);
    });

    // Create Excel book and sheet
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Update_Harga");

    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();

    const suffix = includeFeesAndCampaign
      ? `_Rekomendasi_${
          exportBaseType === 'hpp'
            ? `Margin_${exportMarginType === 'smart' ? 'Smart' : exportMarginVal + 'p'}`
            : exportBaseType === 'eceran'
            ? 'Eceran'
            : exportBaseType === 'grosir'
            ? 'Grosir'
            : 'Partai'
        }`
      : '_Original';
    XLSX.writeFile(wb, `${fileNamePrefix}_${dd}-${mm}-${yyyy}${suffix}.xlsx`);
  };

  // Download Shopee template as XLSX for Stock Update
  const handleDownloadStockXLSX = () => {
    const rows: any[][] = [];

    // Reconstruct the spreadsheet
    // We can use either the original uploaded sheet format (which is 15-column, updating index 8)
    // or construct a clean, beautiful 8-column Stock Update template!
    const hasShopeeHeaders = shopeeHeaderRows.length >= 3 && 
      shopeeHeaderRows[0].some(cell => String(cell).toLowerCase().includes('et_title'));

    if (hasShopeeHeaders) {
      shopeeHeaderRows.forEach(row => {
        rows.push([...row]);
      });
    } else {
      // 8-column Stock Update Template structure
      rows.push([
        "et_title_product_id", "et_title_product_name", "et_title_variation_id", "et_title_variation_name", 
        "et_title_parent_sku", "et_title_variation_sku", "et_title_variation_stock", "et_title_reason"
      ]);
      rows.push([
        "sales_info", "35b74571cd927608dc4cc2b998b916cb", "0", "31475604", "{\"search_condition\":{}}", 
        "", "", ""
      ]);
      rows.push([
        "Kode Produk", "Nama Produk", "Kode Variasi", "Nama Variasi", "SKU Induk", "SKU", "Stok", "Alasan Gagal"
      ]);
      rows.push(["", "", "", "", "", "", "Wajib", ""]);
      rows.push(["", "", "", "", "", "", "", ""]);
    }

    filteredItems.forEach(item => {
      const currentStock = getItemStock(item);

      let productRow: any[];
      if (item.originalRow) {
        productRow = [...item.originalRow];
        while (productRow.length < (hasShopeeHeaders ? 15 : 8)) {
          productRow.push("");
        }
      } else {
        if (hasShopeeHeaders) {
          productRow = [
            item.productId,
            item.productName,
            item.variationId,
            item.variationName,
            item.parentSku,
            item.variationSku,
            String(item.price), // Harga
            "", // GTIN
            String(currentStock), // Stok
            "0", // Min
            "", "", "", "", ""
          ];
        } else {
          productRow = [
            item.productId,
            item.productName,
            item.variationId,
            item.variationName,
            item.parentSku,
            item.variationSku,
            String(currentStock), // Stok
            "" // Alasan Gagal
          ];
        }
      }

      // If it's the 15-column format, Stock is at index 8.
      // If it's the 8-column format, Stock is at index 6.
      if (hasShopeeHeaders) {
        if (productRow.length > 8) {
          productRow[8] = String(currentStock);
        }
      } else {
        if (productRow.length > 6) {
          productRow[6] = String(currentStock);
        }
      }

      rows.push(productRow);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Update_Stok");

    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();

    XLSX.writeFile(wb, `${fileNamePrefix}_Stok_${dd}-${mm}-${yyyy}.xlsx`);
  };

  // Parse Shopee Balist CSV
  const parseShopeeBalistCSV = (text: string): { parsedItems: ShopeeProduct[]; headerRows: string[][] } => {
    const lines = text.split('\n');
    const results: ShopeeProduct[] = [];
    const headerRows: string[][] = [];

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

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;

      const r = parseLineLocal(rawLine);
      if (r.length < 7) continue;

      const col0 = r[0].toLowerCase();
      // Skip Shopee Mass Upload metadata/headers
      if (
        col0.includes('et_title') || 
        col0.includes('sales_info') || 
        col0.includes('kode') || 
        col0.includes('mohon') ||
        !/^\d+$/.test(r[0].trim())
      ) {
        headerRows.push(r);
        continue;
      }

      const productId = r[0].trim();
      const productName = r[1] || `Produk ${shopName}`;
      const variationId = r[2] || '';
      const variationName = r[3] || '';
      const parentSku = r[4] || '';
      const variationSku = r[5] || '';
      const price = numHelper(r[6]);
      const stock = r.length > 8 ? numHelper(r[8]) : 0;

      // Shopee items must have at least one SKU (parent or variation) to be useful
      if (parentSku || variationSku) {
        results.push({
          productId,
          productName,
          variationId,
          variationName,
          parentSku,
          variationSku,
          price,
          stock,
          originalRow: r
        });
      }
    }

    return { parsedItems: results, headerRows };
  };

  const fetchShopeeBalist = async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!force) {
        const cached = localStorage.getItem(`${cacheKeyPrefix}_cache`);
        const cachedHeaders = localStorage.getItem(`${cacheKeyPrefix}_header_rows_cache`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setShopeeItems(parsed);
            if (cachedHeaders) {
              setShopeeHeaderRows(JSON.parse(cachedHeaders));
            }
            setIsLoading(false);
            return;
          }
        }
      }

      const res = await fetch(`${sheetUrl}&t=${Date.now()}`).catch(() => null);
      if (!res || !res.ok) {
        throw new Error(`Gagal mengunduh file ${shopName}. Silakan coba kembali.`);
      }
      
      const text = await res.text();
      const { parsedItems, headerRows } = parseShopeeBalistCSV(text);
      
      if (parsedItems.length === 0) {
        throw new Error('Format sheet tidak sesuai atau data kosong.');
      }

      setShopeeItems(parsedItems);
      if (headerRows.length > 0) {
        setShopeeHeaderRows(headerRows);
        localStorage.setItem(`${cacheKeyPrefix}_header_rows_cache`, JSON.stringify(headerRows));
      }
      localStorage.setItem(`${cacheKeyPrefix}_cache`, JSON.stringify(parsedItems));
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat memproses data.');
    } finally {
      setIsLoading(false);
    }
  };

  const getStockFromListMap = (item: ShopeeProduct, map: Record<string, number>): number | undefined => {
    const vSku = item.variationSku.trim().toLowerCase();
    const pSku = item.parentSku.trim().toLowerCase();

    // 1. Try to extract 5-digit SKU from variationSku (Col 6)
    const vMatch5 = vSku.match(/\d{5}/);
    if (vMatch5 && map[vMatch5[0]] !== undefined) {
      return map[vMatch5[0]];
    }

    // 2. Try to extract 5-digit SKU from parentSku (Col 5)
    const pMatch5 = pSku.match(/\d{5}/);
    if (pMatch5 && map[pMatch5[0]] !== undefined) {
      return map[pMatch5[0]];
    }

    // 3. Fallback to exact variationSku match
    if (vSku && map[vSku] !== undefined) {
      return map[vSku];
    }

    // 4. Fallback to exact parentSku match
    if (pSku && map[pSku] !== undefined) {
      return map[pSku];
    }

    return undefined;
  };

  const fetchStockListSheet = async () => {
    setIsStockLoading(true);
    setStockError(null);
    try {
      const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTCxz1GPm7QU9IS1yBiSjvIdNTLUsvvplOCyT_R3XH4O-LuVbHoY_bXn1LTH5lpnlolJ29BhUgEdnFm/pub?gid=1564332470&single=true&output=csv';
      const res = await fetch(`${url}&t=${Date.now()}`).catch(() => null);
      if (!res || !res.ok) {
        throw new Error('Gagal mengunduh sheet STOCK LIST. Periksa koneksi internet Anda.');
      }
      const text = await res.text();
      const lines = text.split('\n');
      if (lines.length < 2) {
        throw new Error('Sheet STOCK LIST kosong atau tidak valid.');
      }

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

      const parseStockValue = (valStr: string): number => {
        if (!valStr) return 0;
        let cleaned = valStr.trim();
        // Check for minus symbol or if the number is negative
        if (cleaned.startsWith('-')) {
          return 0;
        }
        const num = parseInt(cleaned.replace(/[^0-9-]/g, '')) || 0;
        return num < 0 ? 0 : num;
      };

      const headers = parseLineLocal(lines[0]).map(h => h.toLowerCase().trim());
      
      // SKU Column detection: look for 'sku', 'code', 'kode'
      let skuIdx = headers.findIndex(h => h === 'sku' || h.includes('sku') || h.includes('code') || h.includes('kode'));
      if (skuIdx === -1) {
        skuIdx = 1; // Default fallback to column 2 (KODE BARANG / SKU)
      }

      // Qty Column: user specifies "kolom Qty (kolom ke 13)"
      let qtyIdx = 12; // index 12 is column 13
      const foundQtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('stok') || h.includes('stock') || h.includes('quantity'));
      if (foundQtyIdx !== -1) {
        qtyIdx = foundQtyIdx;
      }
      
      const newStockMap: Record<string, number> = {};

      lines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const r = parseLineLocal(line);
        if (r.length > skuIdx) {
          const sku = r[skuIdx].trim().toLowerCase();
          const qtyVal = r.length > qtyIdx ? parseStockValue(r[qtyIdx]) : 0;
          if (sku) {
            newStockMap[sku] = qtyVal;
            // Also store under the extracted 5-digit code if available
            const match5 = sku.match(/\d{5}/);
            if (match5) {
              newStockMap[match5[0]] = qtyVal;
            }
          }
        }
      });

      setStockListMap(newStockMap);

      // Pre-populate stockEdits with matched STOCK LIST values
      setStockEdits(prev => {
        const next = { ...prev };
        shopeeItems.forEach(item => {
          const matchedQty = getStockFromListMap(item, newStockMap);
          if (matchedQty !== undefined) {
            const key = `${item.productId}-${item.variationId}`;
            // Apply value if not manually edited yet
            if (prev[key] === undefined) {
              next[key] = matchedQty;
            }
          }
        });
        return next;
      });

    } catch (err: any) {
      setStockError(err.message || 'Gagal memproses STOCK LIST.');
    } finally {
      setIsStockLoading(false);
    }
  };

  useEffect(() => {
    fetchShopeeBalist();
  }, [sheetUrl, cacheKeyPrefix]);

  useEffect(() => {
    if (shopeeTabMode === 'stock' && Object.keys(stockListMap).length === 0 && !isStockLoading) {
      fetchStockListSheet();
    }
  }, [shopeeTabMode, shopeeItems]);

  // Synchronize stock edits whenever shopeeItems or stockListMap updates
  useEffect(() => {
    if (shopeeItems.length > 0 && Object.keys(stockListMap).length > 0) {
      setStockEdits(prev => {
        const next = { ...prev };
        shopeeItems.forEach(item => {
          const matchedQty = getStockFromListMap(item, stockListMap);
          if (matchedQty !== undefined) {
            const key = `${item.productId}-${item.variationId}`;
            if (prev[key] === undefined) {
              next[key] = matchedQty;
            }
          }
        });
        return next;
      });
    }
  }, [shopeeItems, stockListMap]);

  // Map system products for ultra-fast lookup by SKU (case insensitive)
  const systemProductMap = useMemo(() => {
    const map = new Map<string, Product>();
    productList.forEach(p => {
      if (p.sku) {
        map.set(p.sku.trim().toLowerCase(), p);
      }
    });
    return map;
  }, [productList]);

  // Combined matched information
  const analyzedItems = useMemo(() => {
    return shopeeItems.map(item => {
      const vSku = item.variationSku.trim().toLowerCase();
      const pSku = item.parentSku.trim().toLowerCase();

      // Match strategy: Parent SKU (col 5) first, then Variation SKU (col 6)
      let matchedProduct = pSku ? systemProductMap.get(pSku) : undefined;
      if (!matchedProduct && vSku) {
        matchedProduct = systemProductMap.get(vSku);
      }

      let status: 'unmatched' | 'ok' | 'under_retail' | 'under_hpp' = 'unmatched';
      let diffPrice = 0;
      let diffPercent = 0;

      // Net calculations
      let netPayout = 0;
      let netProfit = 0;
      let netMargin = 0;
      let isNetProfit = false;
      let totalFeesAmount = 0;

      if (matchedProduct) {
        const systemHpp = matchedProduct.hpp || 0;
        const systemRetail = matchedProduct.eceran || 0;

        if (item.price < systemHpp) {
          status = 'under_hpp';
          diffPrice = systemHpp - item.price;
          diffPercent = systemHpp > 0 ? (diffPrice / systemHpp) * 100 : 0;
        } else if (item.price < systemRetail) {
          status = 'under_retail';
          diffPrice = systemRetail - item.price;
          diffPercent = systemRetail > 0 ? (diffPrice / systemRetail) * 100 : 0;
        } else {
          status = 'ok';
          diffPrice = item.price - systemRetail;
          diffPercent = systemRetail > 0 ? (diffPrice / systemRetail) * 100 : 0;
        }

        // Calculate Net Profit after detail fees and campaign fee
        const totalPercent =
          (Number(fees?.adminFee) || 0) +
          (Number(fees?.layananXtra) || 0) +
          (Number(fees?.insurance) || 0) +
          (Number(fees?.komisiAMS) || 0) +
          (Number(fees?.campaignFee) || 0);
        const decimal = totalPercent / 100;
        const fixed =
          (Number(fees?.marketplaceProcessingFee) || 0) +
          (Number(fees?.jubelioProcessingFee) || 0) +
          (Number(fees?.packingFee) || 0);

        totalFeesAmount = item.price * decimal + fixed;
        netPayout = item.price - totalFeesAmount;
        netProfit = netPayout - systemHpp;
        isNetProfit = netProfit >= 0;
        netMargin = item.price > 0 ? (netProfit / item.price) * 100 : 0;
      }

      return {
        ...item,
        matchedProduct,
        status,
        diffPrice,
        diffPercent,
        netPayout,
        netProfit,
        isNetProfit,
        netMargin,
        totalFeesAmount
      };
    });
  }, [shopeeItems, systemProductMap, fees]);

  // Statistics
  const stats = useMemo(() => {
    let matched = 0;
    let unmatched = 0;
    let underHpp = 0;
    let underRetail = 0;
    let netProfitCount = 0;
    let netLossCount = 0;

    analyzedItems.forEach(item => {
      if (item.matchedProduct) {
        matched++;
        if (item.status === 'under_hpp') underHpp++;
        else if (item.status === 'under_retail') underRetail++;

        if (item.isNetProfit) {
          netProfitCount++;
        } else {
          netLossCount++;
        }
      } else {
        unmatched++;
      }
    });

    return {
      total: analyzedItems.length,
      matched,
      unmatched,
      underHpp,
      underRetail,
      netProfitCount,
      netLossCount
    };
  }, [analyzedItems]);

  // Search and Filter
  const filteredItems = useMemo(() => {
    const query = searchTerm.toLowerCase().trim();
    return analyzedItems.filter(item => {
      const matchesSearch = 
        item.productName.toLowerCase().includes(query) ||
        item.variationName.toLowerCase().includes(query) ||
        item.parentSku.toLowerCase().includes(query) ||
        item.variationSku.toLowerCase().includes(query);

      if (!matchesSearch) return false;

      if (only5DigitSku) {
        const isParent5 = /^\d{5}$/.test(item.parentSku.trim());
        const isVariation5 = /^\d{5}$/.test(item.variationSku.trim());
        if (!isParent5 && !isVariation5) return false;
      }

      if (filterType === 'matched') return !!item.matchedProduct;
      if (filterType === 'unmatched') return !item.matchedProduct;
      if (filterType === 'underHpp') return item.status === 'under_hpp';
      if (filterType === 'underRetail') return item.status === 'under_retail';
      if (filterType === 'netProfit') return !!item.matchedProduct && item.isNetProfit;
      if (filterType === 'netLoss') return !!item.matchedProduct && !item.isNetProfit;

      return true;
    });
  }, [analyzedItems, searchTerm, filterType, only5DigitSku]);

  const handleSelectToCalculator = (sku: string, hpp: number, eceran: number) => {
    setSelectedSku(sku);
    setProduct({ hpp, basePrice: eceran });
    setActiveView('calculator');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center">
            <ShoppingBag className="w-5 h-5 mr-2 text-indigo-600" /> Analisa Harga {shopName}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Bandingkan harga jual aktif di {shopName} dengan HPP dan Harga Eceran sistem menggunakan sinkronisasi Google Sheet.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchShopeeBalist(true)}
            disabled={isLoading}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl shadow-sm hover:shadow-indigo-500/10 active:scale-98 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Sinkronkan Sheet
          </button>
        </div>
      </div>

      {/* SUBTABS MODE SELECTOR */}
      <div className="flex border border-slate-200/80 p-1 bg-slate-50 rounded-xl gap-1 max-w-md">
        <button
          onClick={() => setShopeeTabMode('price')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
            shopeeTabMode === 'price'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50 font-black'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Atur & Analisa Harga
        </button>
        <button
          onClick={() => setShopeeTabMode('stock')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
            shopeeTabMode === 'stock'
              ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50 font-black'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Atur & Update Stok
        </button>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-xs flex items-start gap-2.5 shadow-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Error Sinkronisasi:</span> {error}
          </div>
        </div>
      )}

      {/* STATISTICS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Produk</span>
          <span className="text-2xl font-black text-slate-800 font-mono mt-2">{stats.total}</span>
        </div>
        <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Terhubung Sistem</span>
          <span className="text-2xl font-black text-indigo-700 font-mono mt-2">{stats.matched}</span>
        </div>
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Baru (Belum Ada)</span>
          <span className="text-2xl font-black text-slate-700 font-mono mt-2">{stats.unmatched}</span>
        </div>
        <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Untung Bersih (Setelah Potongan)</span>
          <span className="text-2xl font-black text-emerald-700 font-mono mt-2">{stats.netProfitCount}</span>
        </div>
        <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-widest">Rugi Bersih (Setelah Potongan)</span>
          <span className="text-2xl font-black text-rose-700 font-mono mt-2">{stats.netLossCount}</span>
        </div>
        <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 shadow-sm flex flex-col justify-between">
          <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Di Bawah Eceran</span>
          <span className="text-2xl font-black text-amber-700 font-mono mt-2">{stats.underRetail}</span>
        </div>
      </div>

      {/* EXPORT OPTIONS PANEL */}
      {shopeeTabMode === 'price' && (
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Download className="w-4 h-4 text-emerald-600" /> Ekspor Harga {shopName} ke XLSX
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Unduh template massal update harga {shopName} untuk diunggah langsung ke Seller Centre Shopee.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* TOGGLE FOR INCLUDING FEES & CAMPAIGN */}
              <label className="inline-flex items-center gap-2.5 bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 shadow-sm cursor-pointer hover:bg-slate-50 select-none transition-all">
                <input
                  type="checkbox"
                  checked={includeFeesAndCampaign}
                  onChange={e => setIncludeFeesAndCampaign(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                />
                Include Biaya Marketplace & Campaign
              </label>

              {/* TOGGLE FOR AUTO-FIXING LOSS-MAKING PRODUCTS */}
              <label className="inline-flex items-center gap-2.5 bg-white border border-rose-200 px-4 py-2.5 rounded-xl text-xs font-bold text-rose-700 shadow-sm cursor-pointer hover:bg-rose-50 select-none transition-all">
                <input
                  type="checkbox"
                  checked={autoFixLossProducts}
                  onChange={e => setAutoFixLossProducts(e.target.checked)}
                  className="w-4 h-4 text-rose-600 border-rose-300 rounded focus:ring-rose-500 cursor-pointer"
                />
                Perbaiki Otomatis Produk Rugi Bersih
              </label>

              {includeFeesAndCampaign && (
                <>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 p-1.5 px-3 rounded-xl shadow-sm text-xs">
                    <span className="font-semibold text-slate-500">Acuan Harga:</span>
                    <select
                      value={exportBaseType}
                      onChange={e => setExportBaseType(e.target.value as any)}
                      className="bg-transparent border-none font-bold text-indigo-600 focus:ring-0 outline-none p-0 cursor-pointer"
                    >
                      <option value="hpp">PARTAI + Target Margin</option>
                      <option value="eceran">Harga Eceran Sistem</option>
                      <option value="grosir">Harga Grosir Sistem</option>
                      <option value="partai">Harga Partai Sistem</option>
                    </select>
                  </div>

                  {exportBaseType === 'hpp' && (
                    <div className="flex items-center gap-2 bg-white border border-slate-200 p-1.5 px-3 rounded-xl shadow-sm text-xs">
                      <span className="font-semibold text-slate-500">Margin Acuan:</span>
                      <select
                        value={exportMarginType}
                        onChange={e => {
                          const val = e.target.value;
                          setExportMarginType(val);
                        }}
                        className="bg-transparent border-none font-bold text-indigo-600 focus:ring-0 outline-none p-0 cursor-pointer"
                      >
                        <option value="smart">Smart Margin (Kategori)</option>
                        <option value="flat">Margin Flat (%)</option>
                      </select>
                      
                      {exportMarginType === 'flat' && (
                        <div className="flex items-center gap-1 ml-1 border-l border-slate-200 pl-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={exportMarginVal}
                            onChange={e => setExportMarginVal(Number(e.target.value) || 0)}
                            className="w-10 text-center font-bold font-mono text-indigo-600 bg-slate-50 border border-slate-200 rounded py-0.5 px-1 outline-none"
                          />
                          <span className="font-bold text-slate-400">%</span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <button
                onClick={handleDownloadXLSX}
                disabled={isLoading || shopeeItems.length === 0}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-xl shadow-sm transition-all duration-150 active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Unduh Template XLSX
              </button>
            </div>
          </div>

          {includeFeesAndCampaign && (
            <div className="bg-white/80 border border-emerald-500/10 p-3.5 rounded-xl text-[11px] text-emerald-800 space-y-1 font-medium leading-relaxed">
              <span className="font-bold flex items-center gap-1.5 text-emerald-950 mb-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Harga hasil ekspor akan disesuaikan otomatis agar tidak rugi dengan formula:
              </span>
              <div className="font-mono bg-slate-100 text-slate-700 p-2 rounded border border-slate-200/50 my-1 overflow-x-auto">
                {exportBaseType === 'hpp' ? (
                  <span>Harga Jual = [ PARTAI × (1 + Margin Target / 100) + Total Biaya Nominal ] / (1 - Total Persen Biaya / 100)</span>
                ) : (
                  <span>Harga Jual = [ Harga {exportBaseType === 'eceran' ? 'Eceran' : exportBaseType === 'grosir' ? 'Grosir' : 'Partai'} + Total Biaya Nominal ] / (1 - Total Persen Biaya / 100)</span>
                )}
              </div>
              <ul className="list-disc pl-4 space-y-0.5 mt-1">
                <li>Mencakup Total Biaya Persentase ({((Number(fees?.adminFee) || 0) + (Number(fees?.layananXtra) || 0) + (Number(fees?.insurance) || 0) + (Number(fees?.komisiAMS) || 0) + (Number(fees?.campaignFee) || 0)).toFixed(1)}%): Admin, Layanan Xtra, Asuransi, Komisi AMS, dan Campaign ({fees?.campaignFee || 0}%).</li>
                <li>Mencakup Biaya Nominal (Rp): Marketplace & Jubelio ({formatIDR((Number(fees?.marketplaceProcessingFee) || 0) + (Number(fees?.jubelioProcessingFee) || 0))}) serta Packing ({formatIDR(Number(fees?.packingFee) || 0)}).</li>
                {autoFixLossProducts && (
                  <li className="text-rose-700 font-bold bg-rose-50/50 p-1 px-2 rounded border border-rose-200/50">
                    ⚠️ Perbaikan Otomatis Aktif: Setiap produk yang terdeteksi menghasilkan Rugi Bersih akan dinaikkan harganya secara otomatis ke batas aman (break-even point setelah potongan biaya) agar Anda TIDAK mengalami kerugian.
                  </li>
                )}
                <li>Metode Pembulatan mengikuti pengaturan aktif: <span className="font-bold font-mono text-emerald-900">{rounding === 'none' ? 'Sesuai Rumus' : rounding === '100' ? 'Bulat 100' : rounding === '500' ? 'Bulat 500' : 'Bulat 1000'}</span>.</li>
                <li>Menggunakan <span className="font-bold">Reverse Fee Calculation</span> yang sangat presisi (menjamin laba bersih setelah potongan biaya marketplace sesuai target net payout).</li>
                <li>Produk {shopName} yang tidak memiliki kecocokan di database sistem akan tetap menggunakan harga asli {shopName} agar tidak merusak data.</li>
                <li>Mengekspor sesuai dengan filter dan pencarian aktif di tabel di bawah ({filteredItems.length} produk).</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {/* STOCK UPDATE PANEL */}
      {shopeeTabMode === 'stock' && (
        <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Database className="w-4 h-4 text-indigo-600" /> Ekspor Stok {shopName} ke XLSX
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ubah stok produk secara massal dan unduh template massal update stok Shopee untuk diunggah langsung ke Seller Centre.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* BULK ACTIONS */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 p-1.5 px-3 rounded-xl shadow-sm text-xs">
                <span className="font-semibold text-slate-500">Ubah Semua Stok Ke:</span>
                <input
                  type="number"
                  min="0"
                  defaultValue="10"
                  id="bulkStockInput"
                  className="w-16 font-bold font-mono text-center text-indigo-600 bg-slate-50 border border-slate-200 rounded py-1 px-1.5 outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('bulkStockInput') as HTMLInputElement;
                    const val = parseInt(input?.value);
                    if (!isNaN(val) && val >= 0) {
                      const updated: Record<string, number> = {};
                      shopeeItems.forEach(item => {
                        const key = `${item.productId}-${item.variationId}`;
                        updated[key] = val;
                      });
                      setStockEdits(updated);
                    }
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-3 py-1 rounded-lg transition-colors"
                >
                  Terapkan
                </button>
              </div>

              <button
                onClick={() => {
                  setStockEdits({});
                }}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2.5 rounded-xl border border-slate-200 transition-colors"
              >
                Reset Semua Editan
              </button>

              <button
                onClick={handleDownloadStockXLSX}
                disabled={isLoading || shopeeItems.length === 0}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider px-5 py-3 rounded-xl shadow-sm transition-all duration-150 active:scale-95"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Unduh Template Update Stok
              </button>
            </div>
          </div>

          {/* STOCK LIST SYNCHRONIZATION STATUS */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 flex-shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <div className="font-bold text-slate-800 flex flex-wrap items-center gap-1.5">
                  <span>Sinkronisasi Sheet STOCK LIST</span>
                  {isStockLoading && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded-full">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Memuat...
                    </span>
                  )}
                  {!isStockLoading && !stockError && Object.keys(stockListMap).length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-full">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Terhubung
                    </span>
                  )}
                  {stockError && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded-full">
                      <AlertTriangle className="w-2.5 h-2.5" /> Gagal
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                  {isStockLoading 
                    ? 'Sedang mengunduh dan menganalisa data stok terbaru...'
                    : stockError
                      ? `Error: ${stockError}`
                      : Object.keys(stockListMap).length > 0
                        ? `Berhasil memuat ${Object.keys(stockListMap).length} data produk dari sheet STOCK LIST. Nilai minus otomatis diubah jadi 0.`
                        : 'Belum terhubung ke sheet STOCK LIST.'
                  }
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchStockListSheet}
              disabled={isStockLoading}
              className="text-[10px] uppercase font-bold text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 border border-indigo-200 hover:border-indigo-600 rounded-lg px-3 py-1.5 transition-all duration-150 active:scale-95 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap self-stretch sm:self-auto justify-center"
            >
              <RefreshCw className={`w-3 h-3 ${isStockLoading ? 'animate-spin' : ''}`} />
              Sinkronkan Ulang
            </button>
          </div>

          <div className="bg-white/80 border border-indigo-500/10 p-3.5 rounded-xl text-[11px] text-indigo-800 space-y-1 font-medium leading-relaxed">
            <span className="font-bold flex items-center gap-1.5 text-indigo-950 mb-1">
              <Info className="w-3.5 h-3.5 text-indigo-600" /> Panduan Update Stok Massal:
            </span>
            <ul className="list-disc pl-4 space-y-0.5 mt-1">
              <li>Stok default diambil langsung dari file sinkronisasi sheet yang Anda unduh / sambungkan.</li>
              <li>Anda dapat mengubah stok masing-masing varian secara individual di dalam tabel dengan tombol <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">+</span> atau <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700 font-bold">-</span>, atau mengetik nilainya secara manual.</li>
              <li>Gunakan fitur <span className="font-bold">Ubah Semua Stok Ke</span> untuk menyamakan stok seluruh produk sekaligus sebelum mengunduh.</li>
              <li>Sistem akan menyusun file template Atur Stok (.xlsx) resmi yang dapat langsung diunggah di Seller Centre Shopee (Menu Mass Update &gt; Atur Stok).</li>
              <li>Perubahan stok ini bersifat lokal di peramban Anda untuk keperluan ekspor file excel, tidak mengubah isi Google Sheet sumber.</li>
            </ul>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* FILTERS & SEARCH */}
        <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex flex-col lg:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="text"
                className="w-full p-2.5 pl-9 border border-slate-200 bg-white rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
                placeholder="Cari SKU, Nama Produk, atau Variasi..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setDisplayLimit(50);
                }}
              />
            </div>
            <label className="inline-flex items-center gap-2 bg-white border border-slate-200 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 shadow-sm cursor-pointer hover:bg-slate-50 select-none transition-all whitespace-nowrap">
              <input
                type="checkbox"
                checked={only5DigitSku}
                onChange={e => {
                  setOnly5DigitSku(e.target.checked);
                  setDisplayLimit(50);
                }}
                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
              />
              Hanya SKU 5 Digit
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 w-full lg:w-auto">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilterType('matched')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'matched'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              Terhubung ({stats.matched})
            </button>
            <button
              onClick={() => setFilterType('unmatched')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'unmatched'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              SKU Baru ({stats.unmatched})
            </button>
            <button
              onClick={() => setFilterType('netProfit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'netProfit'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
              }`}
            >
              Untung Bersih ({stats.netProfitCount})
            </button>
            <button
              onClick={() => setFilterType('netLoss')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'netLoss'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700'
              }`}
            >
              Rugi Bersih ({stats.netLossCount})
            </button>
            <button
              onClick={() => setFilterType('underRetail')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterType === 'underRetail'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-amber-50 hover:text-amber-700'
              }`}
            >
              Di Bawah Eceran ({stats.underRetail})
            </button>
          </div>
        </div>

        {/* COMPARISON TABLE */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {shopeeTabMode === 'price' ? (
                <tr>
                  <th className="p-4 min-w-[200px] max-w-[240px]">Produk {shopName}</th>
                  <th className="p-4">SKU Shopee (Induk / Var)</th>
                  <th className="p-4 text-right bg-indigo-50/30">Harga {shopName}</th>
                  <th className="p-4 border-l border-slate-200">Kecocokan Master (HPP & Eceran)</th>
                  <th className="p-4 text-center">Analisa / Selisih</th>
                  <th className="p-4 text-center">Aksi</th>
                </tr>
              ) : (
                <tr>
                  <th className="p-4 min-w-[200px] max-w-[240px]">Produk {shopName}</th>
                  <th className="p-4">SKU Shopee (Induk / Var)</th>
                  <th className="p-4 text-center bg-indigo-50/30">Stok Sheet</th>
                  <th className="p-4 border-l border-slate-200">Kecocokan Master</th>
                  <th className="p-4 text-right pr-8">Update Stok Baru</th>
                  <th className="p-4 text-center">Status & Batal</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                      <span className="text-xs font-semibold">Mengunduh & menganalisa data {shopName}...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400 text-sm font-semibold">
                    Tidak ditemukan data produk {shopName} yang cocok dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredItems.slice(0, displayLimit).map((item, idx) => {
                  const hasMatch = !!item.matchedProduct;
                  const matchingSku = hasMatch ? item.matchedProduct?.sku : null;

                  return (
                    <tr key={`${item.productId}-${item.variationId}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 max-w-[240px]">
                        <div className="font-bold text-xs text-slate-800 line-clamp-2 leading-relaxed whitespace-normal" title={item.productName}>
                          {item.productName}
                        </div>
                        {item.variationName && (
                          <div className="text-[10px] text-indigo-600 font-bold mt-1 bg-indigo-50/50 px-1.5 py-0.5 rounded border border-indigo-100/40 inline-block max-w-full truncate" title={item.variationName}>
                            Var: {item.variationName}
                          </div>
                        )}
                        <div className="text-[9px] text-slate-400 mt-1 font-mono">
                          ID: {item.productId} {item.variationId && `/ Var: ${item.variationId}`}
                        </div>
                      </td>
                      <td className="p-4 font-mono text-[11px] text-slate-600 leading-normal">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-slate-400 font-sans uppercase font-bold tracking-wider">Induk:</span>
                          <span className="font-bold text-slate-700 truncate max-w-[120px]" title={item.parentSku || '-'}>{item.parentSku || '-'}</span>
                          <span className="text-[9px] text-slate-400 font-sans uppercase font-bold tracking-wider mt-1">Variasi:</span>
                          <span className="font-bold text-slate-700 truncate max-w-[120px]" title={item.variationSku || '-'}>{item.variationSku || '-'}</span>
                        </div>
                      </td>
                      {shopeeTabMode === 'price' ? (
                        <>
                          <td className="p-4 text-right bg-indigo-50/10 font-black text-xs text-indigo-700 font-mono">
                            {formatIDR(item.price)}
                          </td>
                          <td className="p-4 border-l border-slate-100">
                            {hasMatch ? (
                              <div className="max-w-[220px] flex flex-col gap-1.5">
                                <div className="font-bold text-xs text-emerald-700 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span className="truncate" title={matchingSku || ''}>{matchingSku}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 line-clamp-1 whitespace-normal" title={item.matchedProduct?.name}>
                                  {item.matchedProduct?.name}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-mono font-bold text-slate-500 mt-1 bg-slate-50 p-1 px-1.5 rounded border border-slate-200/50">
                                  <span>HPP: <strong className="text-slate-700">{formatIDR(item.matchedProduct?.hpp || 0)}</strong></span>
                                  <span className="text-slate-300">|</span>
                                  <span>Eceran: <strong className="text-indigo-600">{formatIDR(item.matchedProduct?.eceran || 0)}</strong></span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                Tidak Terhubung
                              </span>
                            )}
                          </td>
                          <td className="p-4 align-middle">
                            {!hasMatch ? (
                              <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md block text-center w-20 mx-auto">
                                N/A
                              </span>
                            ) : (
                              <div className="flex flex-col gap-1.5 min-w-[190px] text-xs bg-slate-50/60 p-2.5 rounded-xl border border-slate-200/60">
                                {/* Comparison to Retail Price */}
                                <div className="flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-200/40 pb-1">
                                  <span className="font-semibold">vs Eceran:</span>
                                  {item.status === 'under_hpp' ? (
                                    <span className="font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded text-[9px] whitespace-normal">
                                      🚨 Di Bawah HPP
                                    </span>
                                  ) : item.status === 'under_retail' ? (
                                    <span className="font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded text-[9px] whitespace-normal">
                                      📉 Di Bawah Eceran
                                    </span>
                                  ) : (
                                    <span className="font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] whitespace-normal">
                                      📈 Di Atas Eceran
                                    </span>
                                  )}
                                </div>

                                {/* Net Profit Analysis */}
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                                    <span className="font-semibold">Profit Bersih:</span>
                                    {item.isNetProfit ? (
                                      <span className="font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[9px] flex items-center gap-0.5">
                                        <TrendingUp className="w-2.5 h-2.5" /> UNTUNG
                                      </span>
                                    ) : (
                                      <span className="font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded text-[9px] flex items-center gap-0.5 animate-pulse">
                                        <AlertTriangle className="w-2.5 h-2.5" /> RUGI BERSIH
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex justify-between items-center font-mono font-bold text-xs mt-0.5">
                                    <span className="text-[9px] text-slate-400 font-normal">Pot. Biaya: {formatIDR(item.totalFeesAmount)}</span>
                                    <span className={item.isNetProfit ? 'text-emerald-600' : 'text-rose-600'}>
                                      {item.isNetProfit ? '+' : ''}{formatIDR(item.netProfit)}
                                    </span>
                                  </div>
                                  <div className="text-right text-[9px] font-mono text-slate-500 leading-none">
                                    Margin: <span className={item.isNetProfit ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>{item.netMargin.toFixed(1)}%</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            {hasMatch && (
                              <button
                                type="button"
                                onClick={() => handleSelectToCalculator(
                                  item.matchedProduct!.sku, 
                                  item.matchedProduct!.hpp || 0, 
                                  item.matchedProduct!.eceran
                                )}
                                className="bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-150 active:scale-95 flex items-center gap-1 mx-auto cursor-pointer"
                              >
                                Kalkulator <ChevronRight className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-4 text-center bg-indigo-50/10 font-bold text-xs text-indigo-700 font-mono">
                            {item.stock}
                          </td>
                          <td className="p-4 border-l border-slate-100">
                            {hasMatch ? (
                              <div className="max-w-[200px]">
                                <div className="font-bold text-xs text-emerald-700 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span className="truncate" title={matchingSku || ''}>{matchingSku}</span>
                                </div>
                                <div className="text-[10px] text-slate-500 line-clamp-1 whitespace-normal" title={item.matchedProduct?.name}>
                                  {item.matchedProduct?.name}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                Tidak Terhubung
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1 justify-end max-w-[130px] ml-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  const key = `${item.productId}-${item.variationId}`;
                                  const current = getItemStock(item);
                                  if (current > 0) {
                                    setStockEdits(prev => ({ ...prev, [key]: current - 1 }));
                                  }
                                }}
                                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg font-bold text-slate-700 flex items-center justify-center text-xs active:scale-90 transition-all select-none cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="0"
                                value={getItemStock(item) ?? 0}
                                onChange={e => {
                                  const key = `${item.productId}-${item.variationId}`;
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val) && val >= 0) {
                                    setStockEdits(prev => ({ ...prev, [key]: val }));
                                  } else if (e.target.value === '') {
                                    setStockEdits(prev => ({ ...prev, [key]: 0 }));
                                  }
                                }}
                                className="w-14 text-center font-bold font-mono text-xs text-indigo-600 bg-white border border-slate-200 rounded-lg p-1 outline-none focus:ring-2 focus:ring-indigo-500/20"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const key = `${item.productId}-${item.variationId}`;
                                  const current = getItemStock(item);
                                  setStockEdits(prev => ({ ...prev, [key]: current + 1 }));
                                }}
                                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg font-bold text-slate-700 flex items-center justify-center text-xs active:scale-90 transition-all select-none cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            {(() => {
                              const key = `${item.productId}-${item.variationId}`;
                              if (stockEdits[key] === undefined) {
                                return (
                                  <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 border border-slate-100 px-2 py-1 rounded-md">
                                    Asli
                                  </span>
                                );
                              }

                              const sheetStock = getStockFromListMap(item, stockListMap);
                              const isSynced = sheetStock !== undefined && stockEdits[key] === sheetStock;

                              return (
                                <div className="flex items-center justify-center gap-1.5">
                                  <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${
                                    isSynced 
                                      ? 'text-teal-700 bg-teal-50 border border-teal-200/50' 
                                      : 'text-amber-700 bg-amber-50 border border-amber-200/50'
                                  }`}>
                                    {isSynced ? 'Sinkron Sheet' : 'Manual'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setStockEdits(prev => {
                                        const next = { ...prev };
                                        delete next[key];
                                        return next;
                                      });
                                    }}
                                    className="text-[10px] font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded transition-colors cursor-pointer"
                                  >
                                    Batal
                                  </button>
                                </div>
                              );
                            })()}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* LOAD MORE */}
        {filteredItems.length > displayLimit && (
          <div className="p-4 bg-slate-50 text-center border-t border-slate-100">
            <button
              onClick={() => setDisplayLimit(prev => prev + 50)}
              className="px-4 py-2 text-xs font-bold text-indigo-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl shadow-sm transition-all active:scale-98"
            >
              Tampilkan Lebih Banyak (Sisa {filteredItems.length - displayLimit} Produk)
            </button>
          </div>
        )}
      </div>

      {/* FOOTER TIPS CARD */}
      <div className="bg-indigo-900/5 p-5 rounded-2xl border border-indigo-100 shadow-sm flex items-start gap-4">
        <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <span className="font-bold text-indigo-950 block mb-1">Tips Analisa {shopName}:</span>
          1. Sistem mencocokkan produk {shopName} dengan sistem internal berdasarkan SKU Induk (kolom 5) terlebih dahulu. Jika tidak ditemukan kecocokan, sistem akan mencoba mencocokkan berdasarkan SKU Variasi (kolom 6).
          <br />
          2. <span className="font-bold text-indigo-950">Analisa Selisih Baru</span> menghitung <span className="font-bold text-emerald-700">Profit Bersih</span> setelah harga tayang {shopName} dikurangi rincian detail biaya marketplace (Admin, Layanan Xtra, Asuransi, Komisi AMS, Biaya Proses MP & Jubelio, serta biaya Packing) dan biaya Promosi Campaign aktif di kalkulator.
          <br />
          3. Indikator <span className="font-bold text-rose-700 bg-rose-50 px-1 py-0.5 rounded">⚠️ RUGI BERSIH</span> muncul jika pendapatan bersih setelah potongan biaya lebih kecil daripada HPP produk Anda.
          <br />
          4. Klik tombol <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">Kalkulator</span> pada baris produk yang sesuai untuk membuka produk tersebut di Kalkulator Utama guna menyesuaikan rincian margin, pembulatan, biaya admin, dan simulasi skema harga grosir/eceran dengan tepat.
        </div>
      </div>
    </div>
  );
}
