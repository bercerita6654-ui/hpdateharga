/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Calculator as CalcIcon, X } from 'lucide-react';

interface BasicCalculatorProps {
  onClose: () => void;
}

export default function BasicCalculator({ onClose }: BasicCalculatorProps) {
  const [expression, setExpression] = useState('');

  const handleBtnClick = (val: string) => {
    if (val === 'C') {
      setExpression('');
    } else if (val === '=') {
      try {
        if (!expression) return;
        // Safe evaluation of simple math expressions using Function constructor
        const cleanExpression = expression.replace(/[^0-9+\-*/.]/g, '');
        // eslint-disable-next-line no-new-func
        const result = new Function(`return (${cleanExpression})`)();
        if (result === undefined || isNaN(result)) {
          setExpression('Error');
        } else {
          setExpression(String(Math.round(result * 100000000) / 100000000));
        }
      } catch (e) {
        setExpression('Error');
      }
    } else if (val === 'Del') {
      setExpression(prev => (prev === 'Error' ? '' : prev.slice(0, -1)));
    } else {
      if (expression === 'Error') {
        setExpression(val);
      } else {
        setExpression(prev => prev + val);
      }
    }
  };

  const btnClass = "p-3 bg-white border border-slate-100 rounded-xl hover:bg-slate-50 hover:shadow-sm font-semibold text-slate-700 transition-all active:scale-95";
  const btnOpClass = "p-3 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl hover:bg-indigo-100 font-bold transition-all active:scale-95";

  return (
    <div className="absolute bottom-20 right-0 w-72 bg-white/95 backdrop-blur-xl rounded-xl shadow-lg border border-slate-200 overflow-hidden flex flex-col animate-in slide-in-from-bottom-5 z-[1000]">
      <div className="bg-slate-900 text-white p-4 flex justify-between items-center border-b border-slate-800">
        <span className="font-bold text-xs uppercase tracking-widest flex items-center">
          <CalcIcon className="w-3.5 h-3.5 mr-2 text-indigo-400"/> Kalkulator
        </span>
        <button onClick={onClose} className="text-slate-400 hover:text-white hover:bg-slate-800 p-1 rounded-md transition-colors">
          <X className="w-4 h-4"/>
        </button>
      </div>
      <div className="p-5">
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg mb-4 text-right h-16 text-2xl font-mono text-slate-800 overflow-x-auto flex items-center justify-end select-all tracking-tight">
          {expression || '0'}
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs font-mono">
          <button onClick={() => handleBtnClick('C')} className="p-3 bg-red-50 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 font-bold transition-all active:scale-95">C</button>
          <button onClick={() => handleBtnClick('Del')} className={btnOpClass}>Del</button>
          <button onClick={() => handleBtnClick('/')} className={btnOpClass}>/</button>
          <button onClick={() => handleBtnClick('*')} className={btnOpClass}>*</button>
          
          <button onClick={() => handleBtnClick('7')} className={btnClass}>7</button>
          <button onClick={() => handleBtnClick('8')} className={btnClass}>8</button>
          <button onClick={() => handleBtnClick('9')} className={btnClass}>9</button>
          <button onClick={() => handleBtnClick('-')} className={btnOpClass}>-</button>
          
          <button onClick={() => handleBtnClick('4')} className={btnClass}>4</button>
          <button onClick={() => handleBtnClick('5')} className={btnClass}>5</button>
          <button onClick={() => handleBtnClick('6')} className={btnClass}>6</button>
          <button onClick={() => handleBtnClick('+')} className={btnOpClass}>+</button>
          
          <button onClick={() => handleBtnClick('1')} className={btnClass}>1</button>
          <button onClick={() => handleBtnClick('2')} className={btnClass}>2</button>
          <button onClick={() => handleBtnClick('3')} className={btnClass}>3</button>
          <button 
            onClick={() => handleBtnClick('=')} 
            className="p-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold row-span-2 flex items-center justify-center text-lg shadow-sm transition-all active:scale-95"
          >
            =
          </button>
          
          <button onClick={() => handleBtnClick('0')} className={`${btnClass} col-span-2`}>0</button>
          <button onClick={() => handleBtnClick('.')} className={btnClass}>.</button>
        </div>
      </div>
    </div>
  );
}
