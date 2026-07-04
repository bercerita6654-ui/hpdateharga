/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  name: string;
  sku: string;
  unit: string;
  hpp: number;
  eceran: number;
  grosir: number;
  partai: number;
}

export interface CartItem {
  id: number;
  addedAt: string;
  sku: string;
  name: string;
  unit: string;
  hpp: number;
  eceran: number;
  grosir: number;
  partai: number;
  margin: number;
  processingFee: number;
  packingFee: number;
  sellingPrice: number;
  priceMin3: number;
  priceMin6: number;
  priceMin12: number;
  priceCustom: number | null;
  customQtyValue: number | null;
}

export interface CompetitorCartItem {
  id: number;
  addedAt: string;
  sku: string;
  name: string;
  ownPrice: number;
  compAName: string;
  compAPrice: number;
  compALink: string;
  compBName: string;
  compBPrice: number | null;
  compBLink: string;
  itemStatus: string;
  isCompetitorData: boolean;
  hpp: number;
  eceran: number;
  grosir: number;
  partai: number;
}

export interface Submission {
  id: string | number;
  sender: string;
  timestamp: string;
  status: 'pending' | 'revision' | 'completed' | 'approved' | 'rejected';
  isRead: boolean;
  items: any[]; // CartItem[] or CompetitorCartItem[]
  totalItems: number;
  serverNote?: string;
  clientNote?: string;
  revisions?: Record<string, any>;
  handledAt?: string;
}

export interface Fees {
  adminFee: number;
  layananXtra: number;
  marketplaceProcessingFee: number;
  jubelioProcessingFee: number;
  insurance: number;
  packingFee: number;
  komisiAMS: number;
  campaignFee: number;
}
