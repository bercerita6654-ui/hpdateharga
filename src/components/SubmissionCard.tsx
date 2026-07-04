/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Clock,
  ChevronDown,
  User,
  Info,
  CheckSquare,
  CheckCircle2,
  RefreshCw,
  X,
  Mail,
  MailOpen,
  AlertCircle,
  ExternalLink,
  Check
} from 'lucide-react';
import { Submission, Product } from '../types';
import { formatIDR, formatInput, parseInput, formatDateTime } from '../utils/helpers';

interface SubmissionCardProps {
  key?: string | number | null;
  sub: Submission;
  currentUser: string | null;
  isServer: boolean;
  isAdmin: boolean;
  canSeeHPP: boolean;
  serverDrafts: Record<string, any>;
  expandedSubmissionId: string | number | null;
  onToggle: (id: string | number) => void;
  onDraftChange: (subId: string | number, field: string, val: any, sku?: string) => void;
  onUpdateStatus: (id: string | number, status: string) => void;
  onEdit: (sub: Submission) => void;
  productList: Product[];
}

export default function SubmissionCard({
  sub,
  currentUser,
  isServer,
  isAdmin,
  canSeeHPP,
  serverDrafts,
  expandedSubmissionId,
  onToggle,
  onDraftChange,
  onUpdateStatus,
  onEdit,
  productList
}: SubmissionCardProps) {
  let statusColor = 'bg-yellow-100 text-yellow-600';
  let statusBadgeColor = 'bg-yellow-50 text-yellow-700 border-yellow-200';
  let StatusIcon = MailOpen;

  if (sub.status === 'revision') {
    statusColor = 'bg-orange-100 text-orange-600';
    statusBadgeColor = 'bg-orange-50 text-orange-700 border-orange-200';
    StatusIcon = RefreshCw;
  } else if (sub.status === 'completed' || sub.status === 'approved') {
    statusColor = 'bg-green-100 text-green-600';
    statusBadgeColor = 'bg-green-50 text-green-700 border-green-200';
    StatusIcon = CheckCircle2;
  } else if (sub.status === 'rejected') {
    statusColor = 'bg-red-100 text-red-600';
    statusBadgeColor = 'bg-red-50 text-red-700 border-red-200';
    StatusIcon = AlertCircle;
  }

  if (sub.status === 'pending' && isServer && !sub.isRead) {
    StatusIcon = Mail;
  }

  const displayStatusName = sub.status === 'completed' ? 'Selesai' : sub.status === 'revision' ? 'Revisi' : sub.status;
  const isCompetitorSub = sub.items && sub.items.length > 0 && sub.items[0]?.isCompetitorData;
  const isOwner = sub.sender === currentUser;

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border transition-all duration-300 hover:shadow-md ${
        sub.isRead || !isServer ? 'border-slate-200/80' : 'border-blue-300 ring-2 ring-blue-100'
      }`}
    >
      <div
        className={`p-4 lg:p-5 flex justify-between items-center cursor-pointer transition-colors ${
          sub.isRead || !isServer ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/30 hover:bg-blue-50/60'
        }`}
        onClick={() => onToggle(sub.id)}
      >
        <div className="flex items-center space-x-4">
          <div className={`p-2.5 rounded-xl ${statusColor} shadow-inner`}>
            <StatusIcon className="w-5 h-5" />
          </div>
          <div>
            <div
              className={`flex items-center gap-2 mb-1 ${
                !sub.isRead && isServer ? 'font-extrabold text-blue-900' : 'font-bold text-slate-800'
              }`}
            >
              {isCompetitorSub ? 'Review Kompetitor' : 'Pengajuan Harga'}{' '}
              <span className="text-slate-400 font-normal">#{String(sub.id).slice(-4)}</span>
              <span
                className={`text-[9px] px-2.5 py-0.5 rounded-md uppercase border font-bold tracking-wider ${statusBadgeColor}`}
              >
                {displayStatusName}
              </span>
              {!sub.isRead && isServer && (
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 ml-1 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]"></span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2">
              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 uppercase tracking-wide">
                {String(sub.sender)}
              </span>
              <span>&bull;</span>
              <span className="flex items-center">
                <Clock className="w-3 h-3 mr-1" /> {formatDateTime(sub.timestamp)}
              </span>
              <span>&bull;</span>
              <span className="font-semibold text-slate-600">{Number(sub.totalItems) || 0} Item</span>
            </div>
          </div>
        </div>
        <div
          className={`p-2 rounded-full transition-transform duration-300 ${
            expandedSubmissionId === sub.id ? 'bg-slate-100 rotate-180' : 'hover:bg-slate-100'
          }`}
        >
          <ChevronDown className="w-5 h-5 text-slate-500" />
        </div>
      </div>

      {expandedSubmissionId === sub.id && (
        <div className="p-4 lg:p-5 bg-slate-50/50 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">
          {sub.clientNote && (
            <div className="mb-5 p-3.5 bg-white border border-slate-200/80 rounded-xl text-sm text-slate-700 flex items-start shadow-sm">
              <div className="bg-slate-100 p-1.5 rounded-lg mr-3 shadow-inner">
                <User className="w-4 h-4 text-slate-500" />
              </div>
              <div className="pt-0.5">
                <span className="font-bold text-slate-800 block mb-0.5 text-xs uppercase tracking-wider">
                  Catatan {String(sub.sender)}:
                </span>{' '}
                {String(sub.clientNote)}
              </div>
            </div>
          )}
          {sub.serverNote && (
            <div className="mb-5 p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-800 flex items-start shadow-sm">
              <div className="bg-indigo-100 p-1.5 rounded-lg mr-3 shadow-inner">
                <Info className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="pt-0.5">
                <span className="font-bold text-indigo-900 block mb-0.5 text-xs uppercase tracking-wider">
                  Catatan Server:
                </span>{' '}
                {String(sub.serverNote)}
              </div>
            </div>
          )}

          <div className="overflow-x-auto mb-5 border border-slate-200/80 rounded-xl bg-white shadow-sm">
            {isCompetitorSub ? (
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-semibold text-[10px] uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    {isServer && sub.status === 'pending' && (
                      <th className="p-3 w-10 text-center">
                        <CheckSquare className="w-4 h-4 mx-auto" />
                      </th>
                    )}
                    {isAdmin && sub.status !== 'pending' && <th className="p-3 w-10 text-center">Sts</th>}
                    <th className="p-3">Produk Kita</th>

                    {canSeeHPP && <th className="p-3 text-right bg-red-50/50">HPP</th>}
                    {canSeeHPP && <th className="p-3 text-right bg-red-50/50">Eceran</th>}
                    {canSeeHPP && <th className="p-3 text-right bg-red-50/50">Grosir</th>}
                    {canSeeHPP && <th className="p-3 text-right bg-red-50/50">Partai</th>}

                    <th className="p-3 text-right bg-indigo-50/50 text-indigo-700">Tayang Kita</th>
                    <th className="p-3 border-l border-slate-200 bg-rose-50/50 text-rose-700">Komp A</th>
                    <th className="p-3 text-right bg-rose-50/50 text-rose-700">Harga A</th>
                    <th className="p-3 text-center bg-rose-50/50 text-rose-700">Link A</th>
                    <th className="p-3 border-l border-slate-200 bg-orange-50/50 text-orange-700">Komp B</th>
                    <th className="p-3 text-right bg-orange-50/50 text-orange-700">Harga B</th>
                    <th className="p-3 text-center bg-orange-50/50 text-orange-700">Link B</th>
                    <th className="p-3 text-right bg-amber-50/80 border-l border-slate-200 text-amber-700">
                      Saran Harga
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(sub.items || []).map((item, idx) => {
                    if (!item) return null;
                    const compA_Name = item.compAName || item.compName || '-';
                    const compA_Price = item.compAPrice || item.compPrice || 0;
                    const compA_Link = item.compALink || item.compLink || '';

                    const liveData = ((productList || []).find(p => p.sku === item.sku) || {}) as Partial<Product>;
                    const refHpp = liveData.hpp || item.hpp || 0;
                    const refEceran = liveData.eceran || item.eceran || 0;
                    const refGrosir = liveData.grosir || item.grosir || 0;
                    const refPartai = liveData.partai || item.partai || 0;

                    return (
                      <tr
                        key={idx}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          item.itemStatus === 'rejected'
                            ? 'bg-red-50/30'
                            : item.itemStatus === 'approved'
                              ? 'bg-green-50/30'
                              : item.itemStatus === 'revision'
                                ? 'bg-orange-50/30'
                                : ''
                        }`}
                      >
                        {isServer && sub.status === 'pending' && (
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer transition-all"
                              checked={!!serverDrafts[sub.id]?.checkedItems?.[item.sku]}
                              onChange={() => onDraftChange(sub.id, 'check', null, item.sku)}
                            />
                          </td>
                        )}
                        {isAdmin && sub.status !== 'pending' && (
                          <td className="p-3 text-center">
                            {item.itemStatus === 'approved' ? (
                              <div className="bg-green-100 p-1 rounded-md inline-block">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              </div>
                            ) : item.itemStatus === 'revision' ? (
                              <div className="bg-orange-100 p-1 rounded-md inline-block">
                                <RefreshCw className="w-4 h-4 text-orange-600" />
                              </div>
                            ) : (
                              <div className="bg-red-100 p-1 rounded-md inline-block">
                                <X className="w-4 h-4 text-red-600" />
                              </div>
                            )}
                          </td>
                        )}
                        <td className="p-3">
                          <div className="font-semibold text-slate-800">{String(item.name || '')}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5 bg-slate-100 w-fit px-1.5 rounded">
                            {String(item.sku || '')}
                          </div>
                        </td>

                        {canSeeHPP && <td className="p-3 text-right bg-red-50/20 text-slate-600">{formatIDR(refHpp)}</td>}
                        {canSeeHPP && <td className="p-3 text-right bg-red-50/20 text-slate-600">{formatIDR(refEceran)}</td>}
                        {canSeeHPP && <td className="p-3 text-right bg-red-50/20 text-slate-600">{formatIDR(refGrosir)}</td>}
                        {canSeeHPP && <td className="p-3 text-right bg-red-50/20 text-slate-600">{formatIDR(refPartai)}</td>}

                        <td className="p-3 text-right bg-indigo-50/30 font-bold text-indigo-800">
                          {formatIDR(item.ownPrice)}
                        </td>
                        <td className="p-3 border-l border-slate-100 bg-rose-50/20 font-medium text-slate-700">
                          {compA_Name}
                        </td>
                        <td className="p-3 text-right bg-rose-50/20 font-bold text-rose-600">{formatIDR(compA_Price)}</td>
                        <td className="p-3 text-center bg-rose-50/20">
                          {compA_Link ? (
                            <a
                              href={String(compA_Link)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-rose-500 hover:text-rose-700 bg-white border border-rose-100 p-1.5 rounded-md inline-block shadow-sm hover:shadow transition-all"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-3 border-l border-slate-100 bg-orange-50/20 font-medium text-slate-700">
                          {item.compBName || '-'}
                        </td>
                        <td className="p-3 text-right bg-orange-50/20 font-bold text-orange-600">
                          {item.compBPrice ? formatIDR(item.compBPrice) : '-'}
                        </td>
                        <td className="p-3 text-center bg-orange-50/20">
                          {item.compBLink ? (
                            <a
                              href={String(item.compBLink)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-orange-500 hover:text-orange-700 bg-white border border-orange-100 p-1.5 rounded-md inline-block shadow-sm hover:shadow transition-all"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="p-3 text-right bg-amber-50/40 border-l border-slate-100">
                          {isServer && (sub.status === 'pending' || sub.status === 'revision') ? (
                            <input
                              type="text"
                              inputMode="numeric"
                              className="w-full text-right p-1.5 text-xs border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-bold text-amber-800 shadow-inner"
                              placeholder="Saran"
                              onChange={e => onDraftChange(sub.id, 'revision', parseInput(e.target.value), item.sku)}
                              value={formatInput(serverDrafts[sub.id]?.revisions?.[item.sku])}
                            />
                          ) : (
                            <span className="font-bold text-amber-700 bg-white px-2 py-1 rounded border border-amber-200 shadow-sm">
                              {sub.revisions?.[item.sku] ? formatIDR(sub.revisions[item.sku]) : '-'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-xs text-left whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-semibold text-[10px] uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    {isServer && sub.status === 'pending' && (
                      <th className="p-3 w-10 text-center">
                        <CheckSquare className="w-4 h-4 mx-auto" />
                      </th>
                    )}
                    {isAdmin && sub.status !== 'pending' && <th className="p-3 w-10 text-center">Sts</th>}
                    <th className="p-3">Produk Kita</th>

                    {canSeeHPP && <th className="p-3 text-right bg-slate-100/50">HPP</th>}
                    {canSeeHPP && <th className="p-3 text-right bg-slate-100/50">Eceran</th>}
                    {canSeeHPP && <th className="p-3 text-right bg-slate-100/50">Grosir</th>}

                    <th className="p-3 text-right bg-indigo-50/50 text-indigo-700">Satuan</th>
                    <th className="p-3 text-right bg-emerald-50/50 text-emerald-700">Min 3</th>
                    <th className="p-3 text-right bg-emerald-50/50 text-emerald-700">Min 6</th>
                    <th className="p-3 text-right bg-emerald-50/50 text-emerald-700">Min 12</th>
                    <th className="p-3 text-right bg-emerald-50/50 text-emerald-700">Custom</th>

                    {((isServer && sub.status === 'pending') ||
                      (sub.revisions &&
                        Object.keys(sub.revisions || {}).some(k => !k.includes('_pkg') && k !== '_clientNote'))) && (
                      <th className="p-3 text-right w-32 bg-amber-50/80 text-amber-700">Saran (Sat)</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(sub.items || []).map((item, idx) => {
                    if (!item) return null;
                    return (
                      <tr
                        key={idx}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          item.itemStatus === 'rejected'
                            ? 'bg-red-50/30'
                            : item.itemStatus === 'approved'
                              ? 'bg-green-50/30'
                              : item.itemStatus === 'revision'
                                ? 'bg-orange-50/30'
                                : ''
                        }`}
                      >
                        {isServer && sub.status === 'pending' && (
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer transition-all"
                              checked={!!serverDrafts[sub.id]?.checkedItems?.[item.sku]}
                              onChange={() => onDraftChange(sub.id, 'check', null, item.sku)}
                            />
                          </td>
                        )}
                        {isAdmin && sub.status !== 'pending' && (
                          <td className="p-3 text-center">
                            {item.itemStatus === 'approved' ? (
                              <div className="bg-green-100 p-1 rounded-md inline-block">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                              </div>
                            ) : item.itemStatus === 'revision' ? (
                              <div className="bg-orange-100 p-1 rounded-md inline-block">
                                <RefreshCw className="w-4 h-4 text-orange-600" />
                              </div>
                            ) : (
                              <div className="bg-red-100 p-1 rounded-md inline-block">
                                <X className="w-4 h-4 text-red-600" />
                              </div>
                            )}
                          </td>
                        )}
                        <td className="p-3">
                          <div className="font-semibold text-slate-800">{String(item.name || '')}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5 bg-slate-100 w-fit px-1.5 rounded">
                            {String(item.sku || '')}
                          </div>
                        </td>
                        {canSeeHPP && <td className="p-3 text-right bg-slate-50/30 text-slate-500">{formatIDR(item.hpp)}</td>}
                        {canSeeHPP && (
                          <td className="p-3 text-right bg-slate-50/30 text-slate-500">
                            {formatIDR(item.eceran || item.basePrice || 0)}
                          </td>
                        )}
                        {canSeeHPP && <td className="p-3 text-right bg-slate-50/30 text-slate-500">{formatIDR(item.grosir || 0)}</td>}

                        <td className="p-3 text-right bg-indigo-50/30">
                          <div className="font-bold text-indigo-900">{formatIDR(item.sellingPrice)}</div>
                          <div className="text-[9px] text-indigo-500 font-medium mt-0.5 bg-white border border-indigo-100 w-fit ml-auto px-1.5 rounded">
                            Margin: {item.margin || 10}%
                          </div>
                        </td>
                        <td className="p-3 text-right bg-emerald-50/20 font-semibold text-emerald-800">
                          {formatIDR(item.priceMin3)}
                        </td>
                        <td className="p-3 text-right bg-emerald-50/20 font-semibold text-emerald-800">
                          {formatIDR(item.priceMin6)}
                        </td>
                        <td className="p-3 text-right bg-emerald-50/20 font-semibold text-emerald-800">
                          {formatIDR(item.priceMin12)}
                        </td>
                        <td className="p-3 text-right bg-emerald-50/20 font-semibold text-emerald-800">
                          {item.customQtyValue ? (
                            <div>
                              <div>{formatIDR(item.priceCustom)}</div>
                              <div className="text-[9px] text-emerald-600/80 bg-white border border-emerald-100 w-fit ml-auto px-1 rounded mt-0.5">
                                Min: {item.customQtyValue}
                              </div>
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>

                        {((isServer && sub.status === 'pending') ||
                          (sub.revisions &&
                            Object.keys(sub.revisions || {}).some(k => !k.includes('_pkg') && k !== '_clientNote'))) ? (
                          <td className="p-2 text-right bg-amber-50/40 border-l border-slate-100">
                            {isServer && sub.status === 'pending' ? (
                              <input
                                type="text"
                                inputMode="numeric"
                                className="w-full text-right p-1.5 text-xs border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 font-bold text-amber-800 shadow-inner transition-all"
                                placeholder={String(item.sellingPrice)}
                                onChange={e => onDraftChange(sub.id, 'revision', parseInput(e.target.value), item.sku)}
                                value={formatInput(serverDrafts[sub.id]?.revisions?.[item.sku])}
                              />
                            ) : (
                              <span className="font-bold text-amber-700 bg-white px-2.5 py-1 rounded border border-amber-200 shadow-sm">
                                {sub.revisions?.[item.sku] ? formatIDR(sub.revisions[item.sku]) : '-'}
                              </span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-3 mt-2 border-t border-slate-200/60 gap-4">
            {isServer && sub.status !== 'pending' && (
              <button
                onClick={() => onUpdateStatus(sub.id, 'pending')}
                className="flex items-center px-4 py-2 text-xs text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg font-bold transition-colors border border-transparent hover:border-indigo-100"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> Buka & Tinjau Ulang
              </button>
            )}
            {isServer && sub.status === 'pending' && (
              <div className="w-full">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-4">
                  <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center">
                    <Info className="w-4 h-4 mr-1.5 text-blue-500" /> Tambahkan Catatan / Arahan Revisi:
                  </label>
                  <textarea
                    className="w-full p-3 text-sm border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 focus:outline-none transition-all resize-none shadow-inner"
                    rows={2}
                    placeholder="Tulis instruksi khusus untuk admin jika diperlukan..."
                    value={serverDrafts[sub.id]?.note || ''}
                    onChange={e => onDraftChange(sub.id, 'note', e.target.value)}
                  ></textarea>
                </div>
                <div className="flex gap-3 justify-end items-center flex-wrap">
                  <div className="text-[10px] text-slate-500 mr-auto flex items-center bg-slate-100/80 px-3 py-1.5 rounded-lg border border-slate-200">
                    <Info className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                    Item yang <strong className="mx-1 text-slate-700">tidak dicentang</strong> otomatis ditolak
                  </div>
                  <button
                    onClick={() => onUpdateStatus(sub.id, 'rejected')}
                    className="flex items-center px-4 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-300 font-bold text-xs transition-all active:scale-95"
                  >
                    <X className="w-4 h-4 mr-1.5" /> Tolak Semua
                  </button>
                  <button
                    onClick={() => onUpdateStatus(sub.id, 'revision')}
                    className="flex items-center px-4 py-2.5 bg-white border border-amber-200 text-amber-600 rounded-xl hover:bg-amber-50 hover:border-amber-300 font-bold text-xs transition-all active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4 mr-1.5" /> Revisi Harga
                  </button>
                  <button
                    onClick={() => onUpdateStatus(sub.id, 'reviewed')}
                    className="flex items-center px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 font-bold text-xs transition-all shadow-md hover:shadow-lg active:scale-95"
                  >
                    <Check className="w-4 h-4 mr-1.5" /> Setujui Pilihan
                  </button>
                </div>
              </div>
            )}
            {isAdmin && sub.status === 'revision' && isOwner && (
              <div className="w-full flex justify-end">
                <button
                  onClick={() => onEdit(sub)}
                  className="flex items-center px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 font-bold text-xs transition-all shadow-md hover:shadow-lg active:scale-95 animate-pulse"
                >
                  <RefreshCw className="w-4 h-4 mr-1.5" /> Revisi & Kirim Ulang
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
