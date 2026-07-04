/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { BarChart3, ArrowUpDown, TrendingUp, TrendingDown, Info, HelpCircle } from 'lucide-react';
import { CartItem, Fees } from '../types';
import { formatIDR } from '../utils/helpers';

interface CartProfitMarginChartProps {
  cart: CartItem[];
  fees: Fees;
  canSeeHPP: boolean;
}

type MetricType = 'target' | 'net_margin' | 'net_profit';
type SortType = 'default' | 'desc' | 'asc' | 'name';

export default function CartProfitMarginChart({ cart, fees, canSeeHPP }: CartProfitMarginChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [metric, setMetric] = useState<MetricType>(() => {
    return canSeeHPP ? 'net_margin' : 'target';
  });
  const [sortBy, setSortBy] = useState<SortType>('desc');
  const [hoveredItem, setHoveredItem] = useState<{
    id: number;
    name: string;
    sku: string;
    sellingPrice: number;
    hpp: number;
    targetMargin: number;
    actualNetMargin: number;
    netProfit: number;
    totalFees: number;
    x: number;
    y: number;
  } | null>(null);

  const [dimensions, setDimensions] = useState({ width: 600, height: 350 });

  // Update default metric if canSeeHPP permissions change
  useEffect(() => {
    if (!canSeeHPP && metric !== 'target') {
      setMetric('target');
    }
  }, [canSeeHPP, metric]);

  // Track container dimension changes responsively
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      // Keep height reasonable, e.g., 320px
      setDimensions({
        width: Math.max(width, 300),
        height: 320
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Compute profit analytics for each item in the cart
  const analyzedItems = useMemo(() => {
    const totalPercentFee =
      (Number(fees.adminFee) || 0) +
      (Number(fees.layananXtra) || 0) +
      (Number(fees.insurance) || 0) +
      (Number(fees.komisiAMS) || 0) +
      (Number(fees.campaignFee) || 0);

    const decimal = totalPercentFee / 100;

    return cart.map((item, index) => {
      const itemProcFee = Number(item.processingFee) || 0;
      const itemPackFee = Number(item.packingFee) || 0;

      const totalFees = (item.sellingPrice * decimal) + itemProcFee + itemPackFee;
      const netPayout = item.sellingPrice - totalFees;
      const netProfit = netPayout - item.hpp;
      const actualNetMargin = item.sellingPrice > 0 ? (netProfit / item.sellingPrice) * 100 : 0;

      return {
        ...item,
        originalIndex: index,
        totalFees,
        netPayout,
        netProfit,
        actualNetMargin
      };
    });
  }, [cart, fees]);

  // Sort the items based on user choice
  const sortedItems = useMemo(() => {
    const items = [...analyzedItems];
    if (sortBy === 'desc') {
      items.sort((a, b) => {
        const valA = metric === 'target' ? a.margin : metric === 'net_margin' ? a.actualNetMargin : a.netProfit;
        const valB = metric === 'target' ? b.margin : metric === 'net_margin' ? b.actualNetMargin : b.netProfit;
        return valB - valA;
      });
    } else if (sortBy === 'asc') {
      items.sort((a, b) => {
        const valA = metric === 'target' ? a.margin : metric === 'net_margin' ? a.actualNetMargin : a.netProfit;
        const valB = metric === 'target' ? b.margin : metric === 'net_margin' ? b.actualNetMargin : b.netProfit;
        return valA - valB;
      });
    } else if (sortBy === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }
    return items;
  }, [analyzedItems, sortBy, metric]);

  // D3 rendering logic inside useEffect
  useEffect(() => {
    if (!svgRef.current || sortedItems.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clean previous elements

    const margin = { top: 30, right: 20, bottom: 65, left: 65 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    const chart = svg
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Define Scales
    const x = d3
      .scaleBand()
      .domain(sortedItems.map((_, idx) => String(idx)))
      .range([0, width])
      .padding(0.3);

    // Dynamic Y domain based on metric
    let yDomain: [number, number] = [0, 100];
    if (metric === 'target') {
      const maxVal = (d3.max(sortedItems, (d: any) => d.margin) as unknown as number) || 20;
      yDomain = [0, Math.max(25, maxVal * 1.15)];
    } else if (metric === 'net_margin') {
      const minVal = (d3.min(sortedItems, (d: any) => d.actualNetMargin) as unknown as number) || -10;
      const maxVal = (d3.max(sortedItems, (d: any) => d.actualNetMargin) as unknown as number) || 20;
      yDomain = [
        minVal < 0 ? minVal * 1.15 : 0,
        maxVal > 0 ? maxVal * 1.15 : 10
      ];
    } else if (metric === 'net_profit') {
      const minVal = (d3.min(sortedItems, (d: any) => d.netProfit) as unknown as number) || -10000;
      const maxVal = (d3.max(sortedItems, (d: any) => d.netProfit) as unknown as number) || 50000;
      yDomain = [
        minVal < 0 ? minVal * 1.15 : 0,
        maxVal > 0 ? maxVal * 1.15 : 10000
      ];
    }

    const y = d3
      .scaleLinear()
      .domain(yDomain)
      .range([height, 0]);

    // Gridlines for Y Axis
    chart
      .append('g')
      .attr('class', 'grid')
      .style('stroke', '#e2e8f0')
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.5)
      .call(
        d3.axisLeft(y)
          .tickSize(-width)
          .tickFormat(() => '')
      );

    // X Axis Lines and Labels
    const xAxis = d3.axisBottom(x).tickFormat((idxStr) => {
      const idx = Number(idxStr);
      const item = sortedItems[idx];
      if (!item) return '';
      return item.name.length > 12 ? item.name.slice(0, 12) + '..' : item.name;
    });

    const gX = chart
      .append('g')
      .attr('transform', `translate(0, ${height})`)
      .call(xAxis);

    gX.selectAll('text')
      .attr('y', 8)
      .attr('x', -6)
      .attr('dy', '.35em')
      .attr('transform', 'rotate(-32)')
      .style('text-anchor', 'end')
      .style('font-family', 'Inter, system-ui, sans-serif')
      .style('font-size', '10px')
      .style('font-weight', '500')
      .style('fill', '#64748b');

    gX.select('.domain').style('stroke', '#cbd5e1');
    gX.selectAll('.tick line').style('stroke', '#cbd5e1');

    // Y Axis Labels
    const yAxisFormatter = (val: d3.NumberValue) => {
      const v = Number(val);
      if (metric === 'net_profit') {
        if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}jt`;
        if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`;
        return `${v}`;
      }
      return `${v.toFixed(0)}%`;
    };

    const yAxis = d3.axisLeft(y).ticks(6).tickFormat(yAxisFormatter);

    const gY = chart.append('g').call(yAxis);
    gY.select('.domain').style('stroke', '#cbd5e1');
    gY.selectAll('.tick line').style('stroke', '#cbd5e1');
    gY.selectAll('text')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px')
      .style('font-weight', '500')
      .style('fill', '#64748b');

    // Zero-line
    if (yDomain[0] < 0) {
      chart
        .append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', y(0))
        .attr('y2', y(0))
        .style('stroke', '#94a3b8')
        .style('stroke-width', '1.5px');
    }

    // Gradient definitions
    const defs = svg.append('defs');

    const gradPositive = defs
      .append('linearGradient')
      .attr('id', 'grad-positive')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    gradPositive.append('stop').attr('offset', '0%').attr('stop-color', '#4f46e5'); // Indigo 600
    gradPositive.append('stop').attr('offset', '100%').attr('stop-color', '#818cf8'); // Indigo 400

    const gradNegative = defs
      .append('linearGradient')
      .attr('id', 'grad-negative')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    gradNegative.append('stop').attr('offset', '0%').attr('stop-color', '#ef4444'); // Red 500
    gradNegative.append('stop').attr('offset', '100%').attr('stop-color', '#f87171'); // Red 400

    // Render Bars
    chart
      .selectAll('.bar')
      .data(sortedItems)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (_, idx) => x(String(idx)) || 0)
      .attr('width', x.bandwidth())
      .attr('y', (d: any) => {
        const val = metric === 'target' ? d.margin : metric === 'net_margin' ? d.actualNetMargin : d.netProfit;
        return val >= 0 ? y(val) : y(0);
      })
      .attr('height', (d: any) => {
        const val = metric === 'target' ? d.margin : metric === 'net_margin' ? d.actualNetMargin : d.netProfit;
        return Math.abs(y(val) - y(0));
      })
      .attr('rx', 4) // Rounded corners
      .attr('ry', 4)
      .style('fill', (d: any) => {
        const val = metric === 'target' ? d.margin : metric === 'net_margin' ? d.actualNetMargin : d.netProfit;
        return val >= 0 ? 'url(#grad-positive)' : 'url(#grad-negative)';
      })
      .style('cursor', 'pointer')
      .style('transition', 'all 0.15s ease')
      .on('mouseover', function (event, d: any) {
        // Subtle highlight
        d3.select(this)
          .style('opacity', '0.85')
          .style('filter', 'brightness(1.05)');

        // Show Tooltip Card
        const [mx, my] = d3.pointer(event, svgRef.current);
        setHoveredItem({
          id: d.id,
          name: d.name,
          sku: d.sku,
          sellingPrice: d.sellingPrice,
          hpp: d.hpp,
          targetMargin: d.margin,
          actualNetMargin: d.actualNetMargin,
          netProfit: d.netProfit,
          totalFees: d.totalFees,
          x: mx,
          y: my
        });
      })
      .on('mousemove', function (event) {
        const [mx, my] = d3.pointer(event, svgRef.current);
        setHoveredItem(prev => prev ? { ...prev, x: mx, y: my } : null);
      })
      .on('mouseout', function () {
        d3.select(this)
          .style('opacity', '1.0')
          .style('filter', 'none');
        setHoveredItem(null);
      });

    // Add value labels on top of the bars
    chart
      .selectAll('.bar-label')
      .data(sortedItems)
      .enter()
      .append('text')
      .attr('class', 'bar-label')
      .attr('x', (_, idx) => (x(String(idx)) || 0) + x.bandwidth() / 2)
      .attr('y', (d: any) => {
        const val = metric === 'target' ? d.margin : metric === 'net_margin' ? d.actualNetMargin : d.netProfit;
        return val >= 0 ? y(val) - 6 : y(val) + 12;
      })
      .attr('text-anchor', 'middle')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '9px')
      .style('font-weight', '700')
      .style('fill', (d: any) => {
        const val = metric === 'target' ? d.margin : metric === 'net_margin' ? d.actualNetMargin : d.netProfit;
        return val >= 0 ? '#4338ca' : '#b91c1c'; // Indigo-700 / Red-700
      })
      .text((d: any) => {
        if (metric === 'net_profit') {
          return formatIDR(d.netProfit).replace('Rp', '').trim();
        }
        const val = metric === 'target' ? d.margin : d.actualNetMargin;
        return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
      });

  }, [sortedItems, dimensions, metric, sortBy]);

  if (cart.length === 0) return null;

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200 mt-6" id="cart-visualizer">
      {/* HEADER SECTION */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <h4 className="font-bold text-xs uppercase tracking-widest flex items-center text-slate-900">
          <BarChart3 className="w-4 h-4 mr-2 text-indigo-600" /> Analisa Profitabilitas Produk
        </h4>

        {/* METRICS & SORTING INTERFACE */}
        <div className="flex gap-2 items-center flex-wrap w-full md:w-auto">
          {canSeeHPP && (
            <div className="flex bg-slate-200/80 p-0.5 rounded-lg border border-slate-300/40">
              <button
                onClick={() => setMetric('net_margin')}
                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                  metric === 'net_margin'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Margin Bersih
              </button>
              <button
                onClick={() => setMetric('net_profit')}
                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                  metric === 'net_profit'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Profit Bersih (Rp)
              </button>
              <button
                onClick={() => setMetric('target')}
                className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${
                  metric === 'target'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Target Margin
              </button>
            </div>
          )}

          {/* Sorter Dropdown */}
          <div className="flex items-center gap-1.5 ml-auto md:ml-0">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> Urutan:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortType)}
              className="p-1.5 border border-slate-200 rounded-lg text-xs font-bold text-indigo-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 shadow-sm cursor-pointer"
            >
              <option value="desc">Tertinggi</option>
              <option value="asc">Terendah</option>
              <option value="name">Nama A-Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* CANVAS CONTAINER */}
      <div ref={containerRef} className="p-4 relative bg-slate-50/10 min-h-[340px] flex items-center justify-center">
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="overflow-visible"
        ></svg>

        {/* CUSTOM INTERACTIVE D3 TOOLTIP */}
        {hoveredItem && (
          <div
            className="absolute bg-slate-900 text-white p-3.5 rounded-xl shadow-2xl border border-slate-800 text-xs pointer-events-none z-50 animate-in fade-in zoom-in-95 duration-150 space-y-2 min-w-[240px]"
            style={{
              left: Math.min(hoveredItem.x + 15, dimensions.width - 260),
              top: Math.min(hoveredItem.y - 15, dimensions.height - 180)
            }}
          >
            <div className="border-b border-slate-800 pb-1.5">
              <span className="font-mono text-[9px] text-slate-400 block tracking-wide uppercase">SKU: {hoveredItem.sku}</span>
              <span className="font-bold text-slate-100 line-clamp-1">{hoveredItem.name}</span>
            </div>
            
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Harga Tayang:</span>
                <span className="font-bold text-blue-400 font-mono">{formatIDR(hoveredItem.sellingPrice)}</span>
              </div>
              
              {canSeeHPP && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-400">HPP Hitungan:</span>
                    <span className="font-medium text-slate-300 font-mono">{formatIDR(hoveredItem.hpp)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Biaya MP:</span>
                    <span className="font-medium text-red-400 font-mono">-{formatIDR(hoveredItem.totalFees)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400 font-bold">Profit Bersih:</span>
                    <span className={`font-extrabold font-mono ${hoveredItem.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {hoveredItem.netProfit >= 0 ? '+' : ''}{formatIDR(hoveredItem.netProfit)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">Margin Bersih:</span>
                    <span className={`font-extrabold font-mono ${hoveredItem.actualNetMargin >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {hoveredItem.actualNetMargin.toFixed(1)}%
                    </span>
                  </div>
                </>
              )}

              <div className="flex justify-between pt-1 border-t border-slate-800/80">
                <span className="text-slate-400">Target Margin:</span>
                <span className="font-bold text-indigo-400 font-mono">{hoveredItem.targetMargin}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER METRIC EXPLANATION */}
      <div className="p-3 bg-indigo-50/50 border-t border-slate-200/60 flex items-start gap-2 text-[11px] text-slate-600">
        <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          {metric === 'net_margin' && (
            <span>
              <strong>Margin Bersih (%)</strong> dihitung setelah pendapatan kotor (Harga Tayang) dikurangi total potongan biaya administrasi, xtra, asuransi, AMS, packing, processing, dan modal HPP asli. Batang <strong>biru</strong> menunjukkan margin positif, sedangkan batang <strong>merah</strong> menunjukkan margin di bawah HPP (rugi bersih).
            </span>
          )}
          {metric === 'net_profit' && (
            <span>
              <strong>Profit Bersih (Rp)</strong> menunjukkan nominal rupiah keuntungan yang Anda dapatkan untuk setiap 1 unit barang terjual setelah dipotong seluruh komponen biaya marketplace dan modal awal.
            </span>
          )}
          {metric === 'target' && (
            <span>
              <strong>Target Margin (%)</strong> adalah parameter margin kotor yang Anda set untuk simulasi pembentukan harga (10%, 15%, atau 20%).
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
