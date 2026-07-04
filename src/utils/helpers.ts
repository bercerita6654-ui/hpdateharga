/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const formatIDR = (num: number | string): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(num) || 0);
};

export const formatInput = (val: number | string | null | undefined): string => {
  if (val === '' || val === null || val === undefined || isNaN(Number(val))) return '';
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export const parseInput = (val: string): number | '' => {
  if (!val) return '';
  const strVal = val.replace(/[^0-9]/g, '');
  if (!strVal) return '';
  return parseInt(strVal, 10);
};

export const formatDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '-';
  try {
    return new Date(dateString).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return '-';
  }
};
