/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { BarChart3, ArrowUpDown, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { CartItem } from '../types';

interface CartStockDistributionChartProps {
  cart: CartItem[];
}

type SortType = 'default' | 'desc' | 'asc' | 'name';

export default function CartStockDistributionChart({ cart }: CartStockDistributionChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [sortBy, setSortBy] = useState<SortType>('desc');
  const [hoveredItem, setHoveredItem] = useState<{
    id: number;
    name: string;
    sku: string;
    stock: number;
    meetsCriteria: boolean;
    x: number;
    y: number;
  } | null>(null);

  const [dimensions, setDimensions] = useState({ width: 600, height: 320 });

  // Track container dimension changes responsively
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width } = entries[0].contentRect;
      setDimensions({
        width: Math.max(width, 300),
        height: 320
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Compute stats for the current items in the cart
  const analyzedItems = useMemo(() => {
    return cart.map((item, index) => {
      const stock = item.stock !== undefined ? item.stock : 0;
      return {
        ...item,
        originalIndex: index,
        stock,
        meetsCriteria: stock > 50
      };
    });
  }, [cart]);

  // Sort items based on user choice
  const sortedItems = useMemo(() => {
    const items = [...analyzedItems];
    if (sortBy === 'desc') {
      items.sort((a, b) => b.stock - a.stock);
    } else if (sortBy === 'asc') {
      items.sort((a, b) => a.stock - b.stock);
    } else if (sortBy === 'name') {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }
    return items;
  }, [analyzedItems, sortBy]);

  const stats = useMemo(() => {
    const total = analyzedItems.length;
    const met = analyzedItems.filter(i => i.meetsCriteria).length;
    return {
      total,
      met,
      notMet: total - met
    };
  }, [analyzedItems]);

  // D3 rendering logic inside useEffect
  useEffect(() => {
    if (!svgRef.current || sortedItems.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clean previous elements

    const margin = { top: 35, right: 30, bottom: 65, left: 60 };
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
      .padding(0.35);

    // Dynamic Y domain: ensure it reaches at least 60 so the 50 line is visible clearly
    const maxStock = (d3.max(sortedItems, (d: any) => d.stock) as unknown as number) || 0;
    const yDomain: [number, number] = [0, Math.max(70, maxStock * 1.15)];

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

    // X Axis lines and labels
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
    const yAxis = d3.axisLeft(y).ticks(6).tickFormat(d => `${d} qty`);

    const gY = chart.append('g').call(yAxis);
    gY.select('.domain').style('stroke', '#cbd5e1');
    gY.selectAll('.tick line').style('stroke', '#cbd5e1');
    gY.selectAll('text')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '10px')
      .style('font-weight', '500')
      .style('fill', '#64748b');

    // Threshold Line at 50 qty
    if (yDomain[1] >= 50) {
      const thresholdY = y(50);
      
      // Dashed line
      chart
        .append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', thresholdY)
        .attr('y2', thresholdY)
        .style('stroke', '#10b981') // emerald 500
        .style('stroke-width', '1.5px')
        .style('stroke-dasharray', '5,5');

      // Label background
      chart
        .append('rect')
        .attr('x', width - 85)
        .attr('y', thresholdY - 10)
        .attr('width', 82)
        .attr('height', 18)
        .attr('rx', 4)
        .style('fill', '#ecfdf5')
        .style('stroke', '#a7f3d0')
        .style('stroke-width', '1px');

      // Label text
      chart
        .append('text')
        .attr('x', width - 44)
        .attr('y', thresholdY + 2)
        .attr('text-anchor', 'middle')
        .style('font-family', 'Inter, system-ui, sans-serif')
        .style('font-size', '9px')
        .style('font-weight', 'bold')
        .style('fill', '#047857')
        .text('Kriteria > 50');
    }

    // Gradient definitions
    const defs = svg.append('defs');

    // Meet criteria gradient (Emerald/Teal)
    const gradMeet = defs
      .append('linearGradient')
      .attr('id', 'grad-meet-criteria')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    gradMeet.append('stop').attr('offset', '0%').attr('stop-color', '#059669'); // Emerald 600
    gradMeet.append('stop').attr('offset', '100%').attr('stop-color', '#34d399'); // Emerald 400

    // Do not meet criteria gradient (Slate/Steel Blue)
    const gradNoMeet = defs
      .append('linearGradient')
      .attr('id', 'grad-nomeet-criteria')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    gradNoMeet.append('stop').attr('offset', '0%').attr('stop-color', '#475569'); // Slate 600
    gradNoMeet.append('stop').attr('offset', '100%').attr('stop-color', '#94a3b8'); // Slate 400

    // Render Bars
    chart
      .selectAll('.bar')
      .data(sortedItems)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (_, idx) => x(String(idx)) || 0)
      .attr('width', x.bandwidth())
      .attr('y', (d: any) => y(d.stock))
      .attr('height', (d: any) => Math.max(2, height - y(d.stock)))
      .attr('rx', 4)
      .attr('ry', 4)
      .style('fill', (d: any) => d.meetsCriteria ? 'url(#grad-meet-criteria)' : 'url(#grad-nomeet-criteria)')
      .style('cursor', 'pointer')
      .style('transition', 'all 0.15s ease')
      .on('mouseover', function (event, d: any) {
        d3.select(this)
          .style('opacity', '0.85')
          .style('filter', 'brightness(1.05)');

        const [mx, my] = d3.pointer(event, svgRef.current);
        setHoveredItem({
          id: d.id,
          name: d.name,
          sku: d.sku,
          stock: d.stock,
          meetsCriteria: d.meetsCriteria,
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
      .attr('y', (d: any) => y(d.stock) - 6)
      .attr('text-anchor', 'middle')
      .style('font-family', 'JetBrains Mono, monospace')
      .style('font-size', '9px')
      .style('font-weight', '700')
      .style('fill', (d: any) => d.meetsCriteria ? '#065f46' : '#334155') // Emerald-800 / Slate-700
      .text((d: any) => `${d.stock}`);

  }, [sortedItems, dimensions]);

  if (cart.length === 0) return null;

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-slate-200 mt-6" id="cart-stock-visualizer">
      {/* HEADER SECTION */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h4 className="font-bold text-xs uppercase tracking-widest flex items-center text-slate-900">
          <BarChart3 className="w-4 h-4 mr-2 text-emerald-600" /> Distribusi Stok Produk di Keranjang
        </h4>

        {/* SORTING INTERFACE */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3" /> Urutan:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortType)}
            className="p-1.5 border border-slate-200 rounded-lg text-xs font-bold text-emerald-700 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm cursor-pointer"
          >
            <option value="desc">Stok Tertinggi</option>
            <option value="asc">Stok Terendah</option>
            <option value="name">Nama A-Z</option>
          </select>
        </div>
      </div>

      {/* SUMMARY STATS ROW */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 bg-emerald-50/20 border-b border-slate-200/50 py-2.5 text-center">
        <div>
          <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Item</span>
          <span className="text-sm font-extrabold text-slate-700 font-mono">{stats.total}</span>
        </div>
        <div>
          <span className="block text-[9px] text-emerald-600 font-bold uppercase tracking-wider">Memenuhi (&gt; 50 Qty)</span>
          <span className="text-sm font-extrabold text-emerald-700 font-mono flex items-center justify-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> {stats.met}
          </span>
        </div>
        <div>
          <span className="block text-[9px] text-slate-500 font-bold uppercase tracking-wider">Kurang (&le; 50 Qty)</span>
          <span className="text-sm font-extrabold text-slate-600 font-mono flex items-center justify-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> {stats.notMet}
          </span>
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
              top: Math.min(hoveredItem.y - 15, dimensions.height - 150)
            }}
          >
            <div className="border-b border-slate-800 pb-1.5">
              <span className="font-mono text-[9px] text-slate-400 block tracking-wide uppercase">SKU: {hoveredItem.sku}</span>
              <span className="font-bold text-slate-100 line-clamp-1">{hoveredItem.name}</span>
            </div>
            
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-400">Jumlah Stok:</span>
                <span className="font-bold text-emerald-400 font-mono">{hoveredItem.stock} pcs</span>
              </div>
              <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80 mt-1">
                <span className="text-slate-400">Kriteria &gt; 50:</span>
                {hoveredItem.meetsCriteria ? (
                  <span className="bg-emerald-950/80 border border-emerald-500/30 text-emerald-400 font-bold text-[9px] px-2 py-0.5 rounded uppercase flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Memenuhi
                  </span>
                ) : (
                  <span className="bg-slate-800 border border-slate-600/30 text-slate-400 font-bold text-[9px] px-2 py-0.5 rounded uppercase flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" /> Kurang
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER METRIC EXPLANATION */}
      <div className="p-3 bg-emerald-50/50 border-t border-slate-200/60 flex items-start gap-2 text-[11px] text-slate-600">
        <Info className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span>
            Bagan ini menampilkan <strong>Distribusi Stok (Qty)</strong> untuk setiap item di keranjang. Batang berwarna <strong>hijau emerald</strong> menunjukkan item dengan stok melimpah di atas 50 unit (memenuhi kriteria promo/stok aman), sementara batang berwarna <strong>slate abu-abu</strong> menunjukkan stok di bawah atau sama dengan 50 unit.
          </span>
        </div>
      </div>
    </div>
  );
}
