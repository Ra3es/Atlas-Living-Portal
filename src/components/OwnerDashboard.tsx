import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, onSnapshot, doc } from 'firebase/firestore';
import { Property, RevenueLog, ExpenseLog, CustomFee, PaymentRecord, OperationType, MaintenanceIssue } from '../types';
import { handleFirestoreError, formatCurrency, cn } from '../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, PieChart as RechartsPieChart, Pie, Cell
} from 'recharts';
import { Calendar, Download, TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, PieChart, LayoutDashboard, ListFilter, CreditCard, Receipt, Home, Clock, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { format as dateFnsFormat, startOfMonth, endOfMonth, isWithinInterval as dateFnsIsWithinInterval, parseISO as dateFnsParseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

const parseISO = (dateStr: string | undefined | null): Date => {
  if (!dateStr) return new Date(NaN);
  try {
    const d = dateFnsParseISO(dateStr);
    if (!isNaN(d.getTime())) return d;
    const native = new Date(dateStr);
    return native;
  } catch {
    return new Date(NaN);
  }
};

const format = (date: Date | number | string, formatStr: string, fallback: string = '-'): string => {
  try {
    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = parseISO(date);
    } else if (typeof date === 'number') {
      dateObj = new Date(date);
    } else {
      dateObj = date;
    }
    if (!dateObj || isNaN(dateObj.getTime())) return fallback;
    return dateFnsFormat(dateObj, formatStr);
  } catch {
    return fallback;
  }
};

const isWithinInterval = (date: Date, interval: { start: Date; end: Date }): boolean => {
  try {
    if (!date || isNaN(date.getTime())) return false;
    if (!interval.start || isNaN(interval.start.getTime())) return false;
    if (!interval.end || isNaN(interval.end.getTime())) return false;
    return dateFnsIsWithinInterval(date, interval);
  } catch {
    return false;
  }
};

interface OwnerDashboardProps {
  property: Property;
  onLogout: () => void;
}

export default function OwnerDashboard({ property: initialProperty, onLogout }: OwnerDashboardProps) {
  const [property, setProperty] = useState<Property>(initialProperty);
  const [revenue, setRevenue] = useState<RevenueLog[]>([]);
  const [expenses, setExpenses] = useState<ExpenseLog[]>([]);
  const [fees, setFees] = useState<CustomFee[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [view, setView] = useState<'overview' | 'revenue' | 'expenses' | 'statement' | 'operations'>('overview');
  const contentRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (view !== 'overview' && contentRef.current) {
      const yOffset = -100; 
      const y = contentRef.current.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [view]);

  useEffect(() => {
    let unsubProp = () => {};
    let unsubRev = () => {};
    let unsubExp = () => {};
    let unsubFees = () => {};
    let unsubPay = () => {};
    let unsubMaint = () => {};

    const fetchData = async () => {
      setLoading(true);
      try {
        unsubProp = onSnapshot(doc(db, 'properties', initialProperty.id), (docSnap) => {
          if (docSnap.exists()) {
            setProperty({ ...docSnap.data(), id: docSnap.id } as Property);
          }
        });

        const revenueQ = query(collection(db, 'revenue'), where('propertyId', '==', initialProperty.id));
        unsubRev = onSnapshot(revenueQ, (snap) => {
          setRevenue(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as RevenueLog)).sort((a,b) => b.paymentDate.localeCompare(a.paymentDate)));
        });

        const expensesQ = query(collection(db, 'expenses'), where('propertyId', '==', initialProperty.id));
        unsubExp = onSnapshot(expensesQ, (snap) => {
          setExpenses(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as ExpenseLog)).sort((a,b) => b.date.localeCompare(a.date)));
        });

        const feesQ = query(collection(db, 'fees'), where('propertyId', '==', initialProperty.id));
        unsubFees = onSnapshot(feesQ, (snap) => {
          setFees(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as CustomFee)).sort((a,b) => b.date.localeCompare(a.date)));
        });

        const paymentsQ = query(collection(db, 'payments'), where('propertyId', '==', initialProperty.id));
        unsubPay = onSnapshot(paymentsQ, (snap) => {
          setPayments(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as PaymentRecord)).sort((a,b) => b.date.localeCompare(a.date)));
        });

        const maintenanceQ = query(collection(db, 'maintenance'), where('propertyId', '==', initialProperty.id));
        unsubMaint = onSnapshot(maintenanceQ, (snap) => {
          setMaintenance(snap.docs.map(doc => ({ ...doc.data(), id: doc.id } as MaintenanceIssue)).sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
        });

      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'real-time sync');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      unsubProp();
      unsubRev();
      unsubExp();
      unsubFees();
      unsubPay();
      unsubMaint();
    };
  }, [initialProperty.id]);

  const filteredRevenue = useMemo(() => {
    return revenue.filter(r => isWithinInterval(parseISO(r.paymentDate), { 
      start: parseISO(startDate), 
      end: parseISO(endDate) 
    }));
  }, [revenue, startDate, endDate]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => isWithinInterval(parseISO(e.date), { 
      start: parseISO(startDate), 
      end: parseISO(endDate) 
    }));
  }, [expenses, startDate, endDate]);

  const [revSortField, setRevSortField] = useState<'paymentDate' | 'guest' | 'gross' | 'fees' | 'netRevenue'>('paymentDate');
  const [revSortDirection, setRevSortDirection] = useState<'asc' | 'desc'>('desc');

  const [expSortField, setExpSortField] = useState<'date' | 'description' | 'amount' | 'reimbursable'>('date');
  const [expSortDirection, setExpSortDirection] = useState<'asc' | 'desc'>('desc');

  const toggleRevSort = (field: 'paymentDate' | 'guest' | 'gross' | 'fees' | 'netRevenue') => {
    if (revSortField === field) {
      setRevSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setRevSortField(field);
      setRevSortDirection('desc');
    }
  };

  const toggleExpSort = (field: 'date' | 'description' | 'amount' | 'reimbursable') => {
    if (expSortField === field) {
      setExpSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setExpSortField(field);
      setExpSortDirection('desc');
    }
  };

  const sortedRevenue = useMemo(() => {
    const items = [...filteredRevenue];
    return items.sort((a, b) => {
      let comparison = 0;
      if (revSortField === 'paymentDate') {
        comparison = (a.paymentDate || '').localeCompare(b.paymentDate || '');
      } else if (revSortField === 'guest') {
        comparison = (a.guest || '').localeCompare(b.guest || '');
      } else if (revSortField === 'gross') {
        comparison = (a.gross || 0) - (b.gross || 0);
      } else if (revSortField === 'fees') {
        comparison = (a.fees || 0) - (b.fees || 0);
      } else if (revSortField === 'netRevenue') {
        comparison = (a.netRevenue || 0) - (b.netRevenue || 0);
      }
      return revSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredRevenue, revSortField, revSortDirection]);

  const sortedExpenses = useMemo(() => {
    const items = [...filteredExpenses];
    return items.sort((a, b) => {
      let comparison = 0;
      if (expSortField === 'date') {
        comparison = (a.date || '').localeCompare(b.date || '');
      } else if (expSortField === 'description') {
        comparison = (a.description || '').localeCompare(b.description || '');
      } else if (expSortField === 'amount') {
        comparison = (a.amount || 0) - (b.amount || 0);
      } else if (expSortField === 'reimbursable') {
        comparison = (a.reimbursable ? 1 : 0) - (b.reimbursable ? 1 : 0);
      }
      return expSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredExpenses, expSortField, expSortDirection]);

  const filteredFees = useMemo(() => {
    return fees.filter(f => isWithinInterval(parseISO(f.date), { 
      start: parseISO(startDate), 
      end: parseISO(endDate) 
    }));
  }, [fees, startDate, endDate]);

  const filteredPayments = useMemo(() => {
    return payments.filter(p => isWithinInterval(parseISO(p.date), { 
      start: parseISO(startDate), 
      end: parseISO(endDate) 
    }));
  }, [payments, startDate, endDate]);

  const combinedActivity = useMemo(() => {
    const items = [
      ...filteredPayments.map(p => ({ ...p, activityType: 'payment' as const })),
      ...filteredFees.map(f => ({ ...f, activityType: 'fee' as const })),
      ...filteredRevenue.map(r => ({ ...r, activityType: 'revenue' as const, date: r.paymentDate }))
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredPayments, filteredFees, filteredRevenue]);

  const stats = useMemo(() => {
    const totalGross = filteredRevenue.reduce((acc, curr) => acc + curr.gross, 0);
    const totalPlatformFees = filteredRevenue.reduce((acc, curr) => acc + curr.fees, 0);
    const netRevenueInOwnerBank = filteredRevenue.reduce((acc, curr) => acc + curr.netRevenue, 0);
    
    const totalExpenses = filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);
    const reimbursableExpenses = filteredExpenses.filter(e => e.reimbursable).reduce((acc, curr) => acc + curr.amount, 0);
    
    // Management Costs (What the owner owes Atlas)
    const mgtPercentFee = (totalGross * property.managementFeePercent) / 100;
    const mgtFixedFee = property.managementFeeFixed;
    const customMonthlyFees = filteredFees.reduce((acc, curr) => acc + curr.amount, 0);
    
    // Total Invoice from Atlas
    const totalDueToAtlas = mgtPercentFee + mgtFixedFee + customMonthlyFees + reimbursableExpenses;
    
    // Payments made by owner to Atlas (Filtered by date)
    const totalPaymentsToAtlas = filteredPayments.reduce((acc, curr) => acc + curr.amount, 0);
    
    const balanceRemainingToAtlas = totalDueToAtlas - totalPaymentsToAtlas;

    return { 
      totalGross, 
      totalPlatformFees, 
      netRevenueInOwnerBank, 
      totalExpenses, 
      reimbursableExpenses,
      mgtPercentFee, 
      mgtFixedFee, 
      customMonthlyFees,
      totalDueToAtlas,
      totalPaymentsToAtlas,
      balanceRemainingToAtlas,
      totalManagementFees: mgtPercentFee + mgtFixedFee + customMonthlyFees,
      profit: netRevenueInOwnerBank - totalExpenses - mgtPercentFee - mgtFixedFee - customMonthlyFees,
      avgGrossPayout: filteredRevenue.length > 0 ? totalGross / filteredRevenue.length : 0
    };
  }, [filteredRevenue, filteredExpenses, filteredFees, filteredPayments, property]);

  const chartData = useMemo(() => {
    // Generate data per month for the chart
    const months: Record<string, { month: string, gross: number, expenses: number, platformFees: number, mgtFees: number, netProfit: number }> = {};
    
    filteredRevenue.forEach(r => {
      const m = format(parseISO(r.paymentDate), 'MMM yyyy');
      if (!months[m]) months[m] = { month: m, gross: 0, expenses: 0, platformFees: 0, mgtFees: 0, netProfit: 0 };
      months[m].gross += r.gross;
      months[m].platformFees += r.fees;
      // Add percentage management fee
      months[m].mgtFees += (r.gross * property.managementFeePercent) / 100;
    });

    filteredExpenses.forEach(e => {
      const m = format(parseISO(e.date), 'MMM yyyy');
      if (!months[m]) months[m] = { month: m, gross: 0, expenses: 0, platformFees: 0, mgtFees: 0, netProfit: 0 };
      months[m].expenses += e.amount;
    });

    filteredFees.forEach(f => {
      const m = format(parseISO(f.date), 'MMM yyyy');
      if (!months[m]) months[m] = { month: m, gross: 0, expenses: 0, platformFees: 0, mgtFees: 0, netProfit: 0 };
      months[m].mgtFees += f.amount;
    });

    // Add fixed fee to each month that has data (revenue or expenses or custom fees)
    Object.keys(months).forEach(m => {
      months[m].mgtFees += property.managementFeeFixed;
      // Net Profit = Gross - Platform Fees - Expenses - Management Fees
      // We want to show how Gross is split.
      months[m].netProfit = Math.max(0, months[m].gross - months[m].platformFees - months[m].expenses - months[m].mgtFees);
    });

    return Object.values(months).sort((a, b) => {
      const dateA = new Date(a.month);
      const dateB = new Date(b.month);
      return dateA.getTime() - dateB.getTime();
    });
  }, [filteredRevenue, filteredExpenses, filteredFees, property]);

  const pieData = useMemo(() => {
    if (chartData.length !== 1) return [];
    const m = chartData[0];
    return [
      { name: 'Net Profit', value: m.netProfit, color: '#059669' },
      { name: 'Expenses', value: m.expenses, color: '#ef4444' },
      { name: 'Mgt Fees', value: m.mgtFees, color: '#d97706' },
      { name: 'Platform Fees', value: m.platformFees, color: '#94a3b8' }
    ].filter(d => d.value > 0);
  }, [chartData]);

  if (loading) return <div className="h-screen flex items-center justify-center font-sans">Generating Statement...</div>;

  return (
    <div className="min-h-screen bg-brand-slate-50 font-sans text-brand-slate-800 pb-20">
      {/* Main Content Area */}
      <main>
        {/* Top Header */}
        <header className="bg-white/95 backdrop-blur-md sticky top-0 px-4 md:px-8 py-2 md:py-3 flex flex-col lg:flex-row items-center justify-between z-20 border-b border-brand-slate-200 gap-2 md:gap-4">
          <div className="flex items-center gap-8 w-full lg:w-auto justify-between lg:justify-start">
            <div className="text-xl md:text-2xl font-serif tracking-[0.12em] text-brand-slate-900 font-light flex items-center gap-1">
              ATLAS <span className="text-brand-accent font-medium">LIVING</span>
            </div>
            
            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1 bg-brand-slate-50 p-1 rounded-xl border border-brand-slate-100">
              <button 
                onClick={() => setView('overview')} 
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  view === 'overview' ? "bg-white text-brand-slate-900 shadow-sm" : "text-brand-slate-400 hover:text-brand-slate-600"
                )}
              >
                <LayoutDashboard size={14} />
                Overview
              </button>
              <button 
                onClick={() => setView('revenue')} 
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  view === 'revenue' ? "bg-white text-brand-slate-900 shadow-sm" : "text-brand-slate-400 hover:text-brand-slate-600"
                )}
              >
                <TrendingUp size={14} />
                Revenue
              </button>
              <button 
                onClick={() => setView('expenses')} 
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  view === 'expenses' ? "bg-white text-brand-slate-900 shadow-sm" : "text-brand-slate-400 hover:text-brand-slate-600"
                )}
              >
                <Wallet size={14} />
                Expenses
              </button>
              <button 
                onClick={() => setView('operations')} 
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                  view === 'operations' ? "bg-white text-brand-slate-900 shadow-sm" : "text-brand-slate-400 hover:text-brand-slate-600"
                )}
              >
                <Calendar size={14} />
                Tickets
              </button>
            </nav>
          </div>
          
          <div className="flex items-center gap-4 md:gap-6 w-full lg:w-auto justify-between md:justify-end">
            <div className="flex items-center gap-3 sm:gap-6">
              <div className="text-right">
                <div className="text-[9px] sm:text-[10px] font-bold text-brand-slate-500 uppercase">Property ID</div>
                <div className="text-[11px] sm:text-sm font-bold text-brand-slate-900">{property.id}</div>
              </div>
              <div className="h-6 sm:h-8 w-px bg-brand-slate-200"></div>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-brand-slate-900 text-white flex items-center justify-center font-bold text-[10px] sm:text-xs">
                  {property.ownerName.charAt(0)}
                </div>
                <div className="text-xs sm:text-sm font-bold text-brand-slate-700 hidden md:block">{property.ownerName}</div>
              </div>
            </div>

            <button 
              onClick={onLogout} 
              className="p-2 sm:p-2.5 bg-brand-slate-100 hover:bg-red-50 text-brand-slate-400 hover:text-red-500 rounded-lg sm:rounded-xl transition-all group"
              title="Exit View"
            >
              <ArrowUpRight size={16} sm:size={18} className="rotate-180" />
            </button>
          </div>

          {/* Mobile Tab Bar */}
          <div className="lg:hidden w-full flex items-center gap-2 bg-brand-slate-50 p-1 rounded-xl border border-brand-slate-100 overflow-x-auto no-scrollbar">
             {[
               { id: 'overview', label: 'Home', icon: LayoutDashboard },
               { id: 'revenue', label: 'Rev', icon: TrendingUp },
               { id: 'expenses', label: 'Exp', icon: Wallet },
               { id: 'operations', label: 'Tickets', icon: Calendar }
             ].map(tab => (
               <button
                 key={tab.id}
                 onClick={() => setView(tab.id as any)}
                 className={cn(
                   "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                   view === tab.id ? "bg-white text-brand-slate-900 shadow-sm" : "text-brand-slate-400"
                 )}
               >
                 <tab.icon size={12} />
                 {tab.label}
               </button>
             ))}
          </div>
        </header>

        <div className="max-w-7xl mx-auto p-4 md:p-8" ref={contentRef}>
          <AnimatePresence mode="wait">
            {view === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4 md:space-y-6"
              >
                {/* Row 1: Statement Period, Operational Profit, Net Revenue, Gross Revenue */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  <div className="bento-card col-span-2 lg:col-span-1">
                    <span className="bento-label">Period</span>
                    <div className="text-xs sm:text-sm font-bold text-brand-slate-800 flex items-center gap-2 mb-2 sm:mb-4 uppercase">
                      {format(parseISO(startDate), 'MMM dd')} — {format(parseISO(endDate), 'MMM dd')}
                    </div>
                    <div className="mt-auto space-y-1 sm:space-y-2">
                      <div className="flex items-center gap-2 bg-brand-slate-50 p-1 rounded-lg border border-brand-slate-200">
                        <Calendar size={10} className="text-brand-slate-400" />
                        <input 
                          type="date" 
                          value={startDate} 
                          onChange={(e) => setStartDate(e.target.value)}
                          className="bg-transparent text-[9px] sm:text-[10px] font-bold outline-none w-full" 
                        />
                      </div>
                      <div className="flex items-center gap-2 bg-brand-slate-50 p-1 rounded-lg border border-brand-slate-200">
                        <Calendar size={10} className="text-brand-slate-400" />
                        <input 
                          type="date" 
                          value={endDate} 
                          onChange={(e) => setEndDate(e.target.value)}
                          className="bg-transparent text-[9px] sm:text-[10px] font-bold outline-none w-full" 
                        />
                      </div>
                    </div>
                  </div>

                  <button onClick={() => setView('revenue')} className="bento-card col-span-1 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer bg-green-50/30 border-green-100 p-3 sm:p-5">
                    <span className="bento-label text-green-700">Profit</span>
                    <div className={cn("text-lg sm:text-2xl font-bold tracking-tight", stats.profit >= 0 ? "text-green-600" : "text-red-500")}>
                      {stats.totalGross > 0 ? formatCurrency(stats.profit) : (
                        <span className="text-[9px] sm:text-sm text-brand-slate-400 font-medium tracking-tight">Pending</span>
                      )}
                    </div>
                    <div className="mt-auto pt-2 sm:pt-4 flex items-center justify-between">
                      <div className="text-[8px] sm:text-[9px] uppercase font-bold tracking-widest text-brand-slate-400">Net Profit</div>
                    </div>
                  </button>

                  <button onClick={() => setView('revenue')} className="bento-card col-span-1 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer p-3 sm:p-5">
                    <span className="bento-label text-brand-accent">Gross Revenue</span>
                    <div className="bento-value text-base sm:text-lg lg:text-2xl text-brand-slate-700">{formatCurrency(stats.totalGross)}</div>
                    <div className="mt-auto pt-2 sm:pt-4 flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[8px] sm:text-[9px] font-bold uppercase">
                        <span className="text-brand-slate-400">Fees</span>
                        <span className="text-red-500">-{formatCurrency(stats.totalPlatformFees)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[8px] sm:text-[9px] font-bold uppercase border-t border-brand-slate-100 pt-1">
                        <span className="text-brand-slate-400">Net in Bank</span>
                        <span className="text-brand-accent font-black">{formatCurrency(stats.netRevenueInOwnerBank)}</span>
                      </div>
                    </div>
                  </button>

                  <button onClick={() => setView('revenue')} className="bento-card col-span-2 lg:col-span-1 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer p-3 sm:p-5">
                    <span className="bento-label">Performance</span>
                    <div className="bento-value text-base sm:text-lg lg:text-2xl">{stats.totalGross > 0 ? ((stats.profit / stats.totalGross) * 100).toFixed(1) : 0}%</div>
                    <div className="mt-auto pt-2 sm:pt-4">
                      <span className="text-[8px] sm:text-[10px] font-bold text-brand-slate-400 uppercase tracking-widest">Profit Margin</span>
                    </div>
                  </button>
                </div>

                {/* Row 2: Operational Expenses, Management Fees, Payments Applied, Outstanding Settlement */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  <button onClick={() => setView('expenses')} className="bento-card col-span-1 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer p-3 sm:p-5">
                    <span className="bento-label text-red-500">Expenses</span>
                    <div className="bento-value text-red-600 text-base sm:text-lg lg:text-2xl">{formatCurrency(stats.totalExpenses)}</div>
                    <div className="mt-auto pt-2 sm:pt-4 text-[8px] sm:text-[9px] uppercase font-bold tracking-widest text-brand-slate-400">Portfolio</div>
                  </button>

                  <div className="bento-card col-span-1 border-brand-accent/20 bg-brand-accent/5 p-3 sm:p-5">
                    <span className="bento-label text-brand-accent">Mgmt Info</span>
                    <div className="bento-value text-brand-slate-900 text-base sm:text-lg lg:text-2xl">{formatCurrency(stats.totalManagementFees)}</div>
                    <div className="mt-auto pt-2 sm:pt-4 text-[8px] sm:text-[10px] text-brand-slate-400 font-medium uppercase tracking-tight">Atlas Living</div>
                  </div>

                  <button onClick={() => setView('revenue')} className="bento-card col-span-1 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer p-3 sm:p-5">
                    <span className="bento-label text-green-600">Payments</span>
                    <div className="bento-value text-green-600 text-base sm:text-lg lg:text-2xl">{formatCurrency(stats.totalPaymentsToAtlas)}</div>
                    <div className="mt-auto pt-2 sm:pt-4 text-[8px] sm:text-[10px] text-brand-slate-400 font-medium uppercase tracking-tight">Reconciled</div>
                  </button>

                  <div className={cn("bento-card col-span-1 p-3 sm:p-5", stats.balanceRemainingToAtlas > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200")}>
                    <span className="bento-label font-bold text-[8px] sm:text-[10px]">{stats.balanceRemainingToAtlas > 0 ? "Payable" : "Settled"}</span>
                    <div className={cn("text-base sm:text-lg lg:text-3xl font-black tracking-tighter", stats.balanceRemainingToAtlas > 0 ? "text-amber-700" : "text-green-700")}>
                      {formatCurrency(Math.abs(stats.balanceRemainingToAtlas))}
                    </div>
                    <div className="mt-auto pt-2 sm:pt-4 text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 truncate">
                      {stats.balanceRemainingToAtlas > 0 ? "Outstanding" : "Balance Settled"}
                    </div>
                  </div>
                </div>

                {/* Row 3: Latest Expenses & Tickets */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <button onClick={() => setView('expenses')} className="bento-card text-left hover:scale-[1.01] transition-all cursor-pointer">
                    <span className="bento-label">Latest Expenses</span>
                    <div className="flex gap-4 mt-4 overflow-x-auto pb-2">
                      {filteredExpenses.slice(0, 4).map(e => (
                        <div key={e.id} className="flex-1 min-w-[140px] bg-brand-slate-50 p-3 rounded-xl border border-brand-slate-100">
                          <div className="text-[9px] font-bold text-brand-slate-400 uppercase mb-1">{format(parseISO(e.date), 'MMM dd, yyyy')}</div>
                          <div className="text-[10px] font-bold text-brand-slate-800 line-clamp-1">{e.description}</div>
                          <div className="text-xs font-extrabold text-brand-slate-900 mt-2">{formatCurrency(e.amount)}</div>
                        </div>
                      ))}
                      {filteredExpenses.length === 0 && <div className="text-xs text-brand-slate-400">No expenses recorded for this period.</div>}
                    </div>
                  </button>

                  <button onClick={() => setView('operations')} className="bento-card text-left hover:scale-[1.01] transition-all cursor-pointer">
                    <div className="flex items-center justify-between mb-4">
                      <span className="bento-label">Portfolio Tickets</span>
                      <span className="text-[9px] font-black uppercase text-brand-slate-400">{maintenance.filter(m => m.status !== 'resolved').length} Active Requests</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {maintenance.filter(m => m.status !== 'resolved').length === 0 ? (
                        <div className="col-span-2 py-4 text-center">
                          <CheckCircle size={20} className="mx-auto text-green-500 opacity-50 mb-2" />
                          <p className="text-[10px] font-bold text-brand-slate-400 uppercase">Seamless Operations</p>
                        </div>
                      ) : (
                        maintenance.filter(m => m.status !== 'resolved').slice(0, 2).map(m => (
                          <div key={m.id} className="bg-white p-3 rounded-xl border border-brand-slate-100 flex items-start gap-4 h-fit">
                            <div className={cn(
                              "w-1 h-8 rounded-full shrink-0",
                              m.priority === 'urgent' ? "bg-red-500" : m.priority === 'high' ? "bg-amber-500" : "bg-blue-500"
                            )} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[8px] font-black px-1.5 py-0.5 bg-brand-slate-100 rounded text-brand-slate-500 uppercase">{m.category || 'General'}</span>
                                <span className="text-xs font-black text-brand-slate-900 uppercase truncate">{m.title}</span>
                              </div>
                              <p className="text-[10px] text-brand-slate-500 line-clamp-1 italic">"{m.description}"</p>
                            </div>
                            <div className="text-[8px] font-bold text-brand-slate-400 mt-1 shrink-0">{m.date}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </button>
                </div>

                {/* Grid row 4: Chart, Activity sidebar, Support */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bento-card col-span-1 md:col-span-3 row-span-2 shadow-2xl shadow-black/5">
                  <div className="flex justify-between items-center mb-6">
                    <span className="bento-label text-brand-accent">Revenue Breakdown & Profitability</span>
                  </div>
                  <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height={350}>
                      {chartData.length === 1 ? (
                        <RechartsPieChart>
                          <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={80}
                            outerRadius={120}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                          >
                            {pieData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: number) => formatCurrency(value)}
                          />
                          <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px' }} />
                        </RechartsPieChart>
                      ) : (
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="month" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} 
                            dy={10}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} />
                          <Tooltip 
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingBottom: '20px' }} />
                          <Bar dataKey="netProfit" stackId="revenue" fill="#059669" name="Net Profit" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="expenses" stackId="revenue" fill="#ef4444" name="Expenses" />
                          <Bar dataKey="mgtFees" stackId="revenue" fill="#d97706" name="Mgt Fees" />
                          <Bar dataKey="platformFees" stackId="revenue" fill="#94a3b8" name="Platform Fees" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Recent Items Sidebar */}
                <button onClick={() => setView('revenue')} className="bento-card col-span-1 row-span-2 overflow-hidden border-brand-slate-200 text-left hover:scale-[1.01] transition-all cursor-pointer">
                  <div className="flex items-center justify-between border-b border-brand-slate-100 pb-3 mb-4">
                    <span className="bento-label">Activity</span>
                  </div>
                  <div className="mt-4 space-y-4 overflow-y-auto max-h-[400px] pr-2">
                    {combinedActivity.map((item: any) => {
                      if (item.activityType === 'payment') {
                        return (
                          <div key={item.id} className="flex justify-between items-center border-b border-brand-slate-50 pb-3 last:border-0">
                            <div>
                              <div className="font-bold text-brand-slate-800 text-[11px] uppercase tracking-tight font-mono">Payment Received</div>
                              <div className="text-[9px] text-brand-slate-500 font-medium">{format(parseISO(item.date), 'MMM dd, yyyy')}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-black text-[11px] text-green-600">+{formatCurrency(item.amount)}</div>
                            </div>
                          </div>
                        );
                      } else if (item.activityType === 'fee') {
                        return (
                          <div key={item.id} className="flex justify-between items-center border-b border-brand-slate-50 pb-3 last:border-0 group">
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-brand-slate-800 text-[11px] uppercase tracking-tight line-clamp-1">{item.description}</div>
                                {item.documentUrl && (
                                  <a href={item.documentUrl} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity">
                                    <FileText size={10} className="text-brand-accent" />
                                  </a>
                                )}
                              </div>
                              <div className="text-[9px] text-brand-slate-500 font-medium">{format(parseISO(item.date), 'MMM dd, yyyy')}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-black text-[11px] text-red-600">-{formatCurrency(item.amount)}</div>
                            </div>
                          </div>
                        );
                      } else {
                        return (
                          <div key={item.id} className="flex justify-between items-center border-b border-brand-slate-50 pb-3 last:border-0">
                            <div>
                               <div className="font-bold text-brand-slate-800 text-[11px] uppercase tracking-tight line-clamp-1">Booking: {item.guest}</div>
                               <div className="text-[9px] text-brand-slate-500 font-medium">{format(parseISO(item.date), 'MMM dd, yyyy')} • {item.platform}</div>
                            </div>
                            <div className="text-right">
                               <div className="font-black text-[11px] text-brand-accent">+{formatCurrency(item.netRevenue)}</div>
                            </div>
                          </div>
                        );
                      }
                    })}
                    {combinedActivity.length === 0 && (
                      <div className="py-10 text-center">
                        <p className="text-[10px] font-bold text-brand-slate-400 uppercase tracking-widest">No activity recorded</p>
                      </div>
                    )}
                  </div>
                </button>

                <div className="bento-card col-span-1">
                  <span className="bento-label">Statement Info</span>
                  <div className="text-[10px] font-bold mt-2 uppercase tracking-widest text-brand-accent">
                    Ref: {property.id}{format(parseISO(endDate), 'yyddMM')}
                  </div>
                  
                  <div className="mt-4 py-2 border-y border-brand-slate-100">
                    <div className="text-[8px] font-black uppercase text-brand-slate-400 tracking-tighter mb-1">Reporting Window</div>
                    <div className="text-[10px] font-bold text-brand-slate-900 flex items-center gap-2">
                      <Calendar size={10} className="text-brand-accent" />
                      {format(parseISO(startDate), 'dd MMM')} — {format(parseISO(endDate), 'dd MMM yyyy')}
                    </div>
                  </div>

                  <button className="w-full mt-4 bg-brand-slate-900 hover:bg-brand-slate-800 text-white py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                    <Download size={12} />
                    Generate Invoice
                  </button>

                  <div className="mt-auto flex justify-between items-center pt-4">
                    <div className="text-[9px] uppercase font-bold tracking-widest text-brand-slate-400">Portal v1.2</div>
                    <div className="w-7 h-7 bg-brand-slate-100 rounded-lg flex items-center justify-center text-brand-slate-400">
                      <Receipt size={14} />
                    </div>
                  </div>
                </div>

                <div className="bento-card col-span-1">
                  <span className="bento-label">Support & Inquiries</span>
                  <div className="text-sm font-bold mt-2 text-brand-slate-900">Atlas Concierge</div>
                  <div className="mt-4 space-y-2">
                    <div className="text-[10px] font-bold text-brand-slate-500 uppercase flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-accent"></span>
                      concierge@atlasliving.co.za
                    </div>
                    <div className="text-[10px] font-bold text-brand-slate-500 uppercase flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-accent"></span>
                      +27 76 076 0997
                    </div>
                  </div>
                  <div className="mt-auto flex justify-between items-center pt-4">
                    <div className="text-[9px] uppercase font-bold tracking-widest opacity-40 uppercase">Property Services</div>
                    <div className="w-7 h-7 bg-brand-slate-100 rounded-lg flex items-center justify-center text-brand-slate-400">
                      <LayoutDashboard size={14} />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

            {view === 'operations' && (
              <motion.div
                key="operations-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between mb-4">
                   <h2 className="text-xl font-bold uppercase tracking-tight">Ticketing & Requests</h2>
                   <div className="flex gap-2">
                     <span className="bg-brand-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest">Property Operations</span>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                  {/* Tickets List */}
                  <div className="md:col-span-12 bento-card p-0 overflow-hidden">
                    <div className="p-6 border-b border-brand-slate-100 flex justify-between items-center bg-white">
                      <span className="bento-label">Active Portfolio Tickets</span>
                      <div className="p-2 bg-brand-accent/10 rounded-lg text-brand-accent">
                        <ListFilter size={18} />
                      </div>
                    </div>
                    <div className="divide-y divide-brand-slate-50">
                      {maintenance.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center text-center px-4">
                           <CheckCircle size={32} className="text-green-500 mb-4 opacity-20" />
                           <div className="text-[10px] font-black uppercase text-brand-slate-400 tracking-widest">No Active Tickets</div>
                        </div>
                      ) : (
                        maintenance.map(m => (
                          <div key={m.id} className="p-6 bg-white flex flex-col md:flex-row gap-6 hover:bg-brand-slate-50 transition-colors group">
                             <div className="flex-1">
                               <div className="flex items-center gap-3 mb-3">
                                 <span className={cn(
                                   "text-[8px] font-black uppercase px-2 py-1 rounded text-white tracking-widest",
                                   m.priority === 'urgent' ? "bg-red-600 shadow-lg shadow-red-500/20" : 
                                   m.priority === 'high' ? "bg-amber-600" : 
                                   m.priority === 'medium' ? "bg-blue-600" : "bg-brand-slate-400"
                                 )}>
                                   {m.priority}
                                 </span>
                                 <span className="text-[10px] font-black uppercase text-brand-slate-400 border border-brand-slate-200 px-2 py-0.5 rounded">
                                   {m.category || 'General'}
                                 </span>
                                 <h3 className="font-black text-brand-slate-900 uppercase tracking-tight text-sm">{m.title}</h3>
                               </div>
                               <p className="text-xs text-brand-slate-500 mb-4 leading-relaxed line-clamp-2 md:line-clamp-none">{m.description}</p>
                               
                               {m.notes && (
                                 <div className="bg-brand-slate-100/50 p-4 rounded-xl border border-brand-slate-200/50">
                                    <div className="text-[9px] font-black uppercase text-brand-slate-400 mb-2 tracking-widest">Internal Update</div>
                                    <p className="text-xs font-bold text-brand-slate-700 italic">"{m.notes}"</p>
                                 </div>
                               )}
                             </div>

                             <div className="w-full md:w-64 border-l border-brand-slate-100 pl-6 space-y-4">
                                <div className="flex justify-between md:block">
                                  <div className="text-[9px] font-black text-brand-slate-400 uppercase mb-1">Current Status</div>
                                  <div className={cn(
                                    "text-xs font-black uppercase",
                                    m.status === 'open' ? "text-amber-600" :
                                    m.status === 'fixing' ? "text-blue-600" :
                                    m.status === 'resolved' ? "text-green-600" : "text-brand-slate-400"
                                  )}>
                                    {m.status}
                                  </div>
                                </div>
                                <div className="flex justify-between md:block">
                                  <div className="text-[9px] font-black text-brand-slate-400 uppercase mb-1">Ticket Date</div>
                                  <div className="text-xs font-bold text-brand-slate-600">{m.date}</div>
                                </div>
                                {m.updatedAt && (
                                  <div className="flex justify-between md:block">
                                    <div className="text-[9px] font-black text-brand-slate-400 uppercase mb-1">Status Changed</div>
                                    <div className="text-xs font-bold text-brand-slate-400">{format(m.updatedAt, 'MMM dd, HH:mm')}</div>
                                  </div>
                                )}
                             </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {view === 'revenue' && (
              <motion.div
                key="revenue-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bento-card"
              >
                <div className="flex items-center justify-between mb-8">
                  <span className="bento-label">Revenue Breakdown</span>
                  <button onClick={() => setView('overview')} className="text-xs font-bold text-brand-slate-500 hover:text-brand-slate-900 transition-colors uppercase tracking-widest">Back to Dashboard</button>
                </div>
                <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left min-w-[600px]">
                      <thead className="border-b border-brand-slate-100">
                        <tr>
                          <th 
                            onClick={() => toggleRevSort('paymentDate')} 
                            className="pb-4 text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                          >
                            Date {revSortField === 'paymentDate' ? (revSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th 
                            onClick={() => toggleRevSort('guest')} 
                            className="pb-4 text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                          >
                            Guest / Platform {revSortField === 'guest' ? (revSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th 
                            onClick={() => toggleRevSort('gross')} 
                            className="pb-4 text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 text-right cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                          >
                            Gross {revSortField === 'gross' ? (revSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th 
                            onClick={() => toggleRevSort('fees')} 
                            className="pb-4 text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 text-right text-red-500 cursor-pointer select-none hover:text-red-700 transition-colors"
                          >
                            Fees {revSortField === 'fees' ? (revSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th 
                            onClick={() => toggleRevSort('netRevenue')} 
                            className="pb-4 text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 text-right text-brand-accent cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                          >
                            Net {revSortField === 'netRevenue' ? (revSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-slate-50">
                        {sortedRevenue.map(r => (
                          <tr key={r.id}>
                            <td className="py-4 text-xs font-bold">{format(parseISO(r.paymentDate), 'MMM dd, yyyy')}</td>
                            <td className="py-4 text-xs font-medium text-brand-slate-600">{r.guest} • <span className="text-[10px] uppercase font-bold text-brand-slate-400">{r.platform}</span></td>
                            <td className="py-4 text-right text-xs font-bold">{formatCurrency(r.gross)}</td>
                            <td className="py-4 text-right text-xs font-bold text-red-500">-{formatCurrency(r.fees)}</td>
                            <td className="py-4 text-right text-xs font-black text-brand-accent">{formatCurrency(r.netRevenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </div>
              </motion.div>
            )}

            {view === 'expenses' && (
              <motion.div
                key="expenses-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="bento-card"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <span className="bento-label">Expense List</span>
                    {stats.reimbursableExpenses > 0 && (
                      <div className="text-[10px] font-black uppercase text-amber-600 mt-1">
                        Total Reimbursable: {formatCurrency(stats.reimbursableExpenses)}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setView('overview')} className="text-xs font-bold text-brand-slate-500 hover:text-brand-slate-900 transition-colors uppercase tracking-widest">Back to Dashboard</button>
                </div>
                <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left min-w-[600px]">
                       <thead className="border-b border-brand-slate-100">
                        <tr>
                          <th 
                            onClick={() => toggleExpSort('date')} 
                            className="pb-4 text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                          >
                            Date {expSortField === 'date' ? (expSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th 
                            onClick={() => toggleExpSort('description')} 
                            className="pb-4 text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                          >
                            Description {expSortField === 'description' ? (expSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th 
                            onClick={() => toggleExpSort('amount')} 
                            className="pb-4 text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 text-right cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                          >
                            Amount {expSortField === 'amount' ? (expSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                          <th 
                            onClick={() => toggleExpSort('reimbursable')} 
                            className="pb-4 text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 text-center cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                          >
                            Reimbursable {expSortField === 'reimbursable' ? (expSortDirection === 'asc' ? '▲' : '▼') : ''}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-slate-50">
                        {sortedExpenses.map(e => (
                          <tr key={e.id}>
                            <td className="py-4 text-xs font-bold">{format(parseISO(e.date), 'MMM dd, yyyy')}</td>
                            <td className="py-4 text-xs font-medium text-brand-slate-600">{e.description} • <span className="text-[10px] uppercase font-bold text-brand-slate-400">{e.category}</span></td>
                            <td className="py-4 text-right text-xs font-bold text-red-600">{formatCurrency(e.amount)}</td>
                            <td className="py-4 text-center">
                              {e.reimbursable ? 
                                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[9px] font-black uppercase">Yes</span> : 
                                <span className="bg-brand-slate-100 text-brand-slate-400 px-2 py-0.5 rounded text-[9px] font-black uppercase">No</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </div>
              </motion.div>
            )}


          </AnimatePresence>
        </div>
      </main>

      {/* Mobile Navigation */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-brand-slate-200 flex items-center justify-around py-4 z-30 lg:hidden">
        <button onClick={() => setView('overview')} className={cn("p-2", view === 'overview' ? "text-brand-slate-900" : "text-brand-slate-400")}>
          <LayoutDashboard size={24} />
        </button>
        <button onClick={() => setView('revenue')} className={cn("p-2", view === 'revenue' ? "text-brand-slate-900" : "text-brand-slate-400")}>
          <TrendingUp size={24} />
        </button>
        <button onClick={() => setView('expenses')} className={cn("p-2", view === 'expenses' ? "text-brand-slate-900" : "text-brand-slate-400")}>
          <Wallet size={24} />
        </button>
        <button onClick={() => setView('operations')} className={cn("p-2", view === 'operations' ? "text-brand-slate-900" : "text-brand-slate-400")}>
          <Calendar size={24} />
        </button>
        <button onClick={onLogout} className="p-2 text-brand-slate-400">
          <ArrowUpRight size={24} className="rotate-180" />
        </button>
      </div>
    </div>
  );
}

function LogOut(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  );
}
