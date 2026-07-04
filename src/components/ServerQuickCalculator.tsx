/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Calculator as CalcIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { Fees } from '../types';
import { formatIDR, formatInput, parseInput } from '../utils/helpers';

interface ServerQuickCalculatorProps {
  fees: Fees;
}

export default function ServerQuickCalculator({ fees }: ServerQuickCalculatorProps) {
  const [values, setValues] = useState({ hpp: 50000, eceran: 100000 });
  const [show, setShow] = useState(false);

  const calculate = (basePrice: number) => {
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

    const safeBasePrice = Number(basePrice) || 0;
    const safeHpp = Number(values.hpp) || 0;

    let sellingPrice = 0;
    const totalNet = safeBasePrice;

    if (1 - decimal > 0) {
      sellingPrice = (totalNet + fixed) / (1 - decimal);
    }
    sellingPrice = Math.round(sellingPrice);

    const percentFeeVal = sellingPrice * decimal;
    const totalDed = percentFeeVal + fixed;
    const netRevenue = sellingPrice - totalDed;

    // HPP Total
    const totalHPP = safeHpp;
    const profit = netRevenue - totalHPP;
    const margin = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;

    return { sellingPrice, netRevenue, profit, margin };
  };

  const t1 = calculate(values.eceran);

  return (
    <div className="mb-6 border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm transition-all">
      <div
        className="p-4 bg-white border-b border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={() => setShow(!show)}
      >
        <h3 className="font-bold text-slate-900 uppercase tracking-wider text-xs flex items-center">
          <CalcIcon className="w-4 h-4 mr-2 text-indigo-600" /> Kalkulator Cepat (Hitung Saran)
        </h3>
        {show ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </div>
      {show && (
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50/50">
          <div className="space-y-4 md:border-r border-slate-200/60 md:pr-6">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                HPP (Modal)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-xs font-mono font-semibold">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full p-2 pl-9 bg-white border border-slate-200 rounded-lg text-sm font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all outline-none"
                  value={formatInput(values.hpp)}
                  onChange={e => {
                    const parsed = parseInput(e.target.value);
                    setValues({ ...values, hpp: parsed === '' ? 0 : parsed });
                  }}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
                Input Eceran
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-400 text-xs font-mono font-semibold">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full p-2 pl-9 bg-white border border-slate-200 rounded-lg text-sm font-semibold focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all outline-none"
                  value={formatInput(values.eceran)}
                  onChange={e => {
                    const parsed = parseInput(e.target.value);
                    setValues({ ...values, eceran: parsed === '' ? 0 : parsed });
                  }}
                />
              </div>
            </div>
          </div>
          <div className="space-y-3 flex flex-col justify-center">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200/60 pb-2 mb-2">
              Estimasi Hasil Tayang
            </h4>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Tayang:</span>
              <span className="font-bold text-slate-900 bg-white border border-slate-200 px-2 py-1 rounded-md">
                {formatIDR(t1.sellingPrice)}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Pendapatan Bersih:</span>
              <span className="font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                {formatIDR(t1.netRevenue)}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Profit:</span>
              <span
                className={`font-bold px-2 py-1 rounded-md border ${
                  t1.profit < 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                }`}
              >
                {formatIDR(t1.profit)}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs pt-1">
              <span className="text-slate-500">Persentase Margin:</span>
              <span className="font-bold text-indigo-600 font-mono">{t1.margin.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
