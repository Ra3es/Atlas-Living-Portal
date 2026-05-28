import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, orderBy, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { Property, RevenueLog, ExpenseLog, CustomFee, PaymentRecord, OperationType, MaintenanceIssue } from '../types';
import { handleFirestoreError, formatCurrency, cn, exportToCSV } from '../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line, PieChart as RechartsPieChart, Pie, Cell
} from 'recharts';
import { Calendar, Download, TrendingUp, Wallet, ArrowUpRight, ArrowDownRight, PieChart, LayoutDashboard, ListFilter, CreditCard, Receipt, Home, Clock, AlertTriangle, CheckCircle, FileText, Ticket } from 'lucide-react';
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
  const [view, setView] = useState<'overview' | 'revenue' | 'expenses' | 'statement' | 'operations' | 'payments' | 'info'>('overview');
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);

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
    // Current Filtered Period Totals
    const totalGross = filteredRevenue.reduce((acc, curr) => acc + curr.gross, 0);
    const totalPlatformFees = filteredRevenue.reduce((acc, curr) => acc + curr.fees, 0);
    const netRevenueInOwnerBank = filteredRevenue.reduce((acc, curr) => acc + curr.netRevenue, 0);
    
    const totalExpenses = filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);
    const reimbursableExpenses = filteredExpenses.filter(e => e.reimbursable).reduce((acc, curr) => acc + curr.amount, 0);
    
    // Management Costs (What the owner owes Atlas for the filtered period)
    // To properly calculate the fixed management fee for the filtered period, we count the unique months present in the filtered records
    const filteredMonths = new Set<string>();
    filteredRevenue.forEach(r => filteredMonths.add(format(parseISO(r.paymentDate), 'yyyy-MM')));
    filteredExpenses.forEach(e => filteredMonths.add(format(parseISO(e.date), 'yyyy-MM')));
    filteredFees.forEach(f => filteredMonths.add(format(parseISO(f.date), 'yyyy-MM')));
    const filteredMonthsCount = Math.max(1, filteredMonths.size);

    const mgtPercentFee = (totalGross * property.managementFeePercent) / 100;
    const mgtFixedFee = property.managementFeeFixed * filteredMonthsCount;
    const customMonthlyFees = filteredFees.reduce((acc, curr) => acc + curr.amount, 0);
    
    // Total Invoice from Atlas for filtered period
    const totalDueToAtlas = mgtPercentFee + mgtFixedFee + customMonthlyFees + reimbursableExpenses;
    
    // Payments made by owner to Atlas (Filtered by date)
    const totalPaymentsToAtlas = filteredPayments.reduce((acc, curr) => acc + curr.amount, 0);
    
    // --- ALL TIME CALCULATION FOR BALANCE ---
    const allTotalGross = revenue.reduce((acc, curr) => acc + curr.gross, 0);
    const allReimbursableExpenses = expenses.filter(e => e.reimbursable).reduce((acc, curr) => acc + curr.amount, 0);
    const allMgtPercentFee = (allTotalGross * property.managementFeePercent) / 100;
    
    const allMonths = new Set<string>();
    revenue.forEach(r => allMonths.add(format(parseISO(r.paymentDate), 'yyyy-MM')));
    expenses.forEach(e => allMonths.add(format(parseISO(e.date), 'yyyy-MM')));
    fees.forEach(f => allMonths.add(format(parseISO(f.date), 'yyyy-MM')));
    const allMonthsCount = Math.max(1, allMonths.size);
    const allMgtFixedFee = property.managementFeeFixed * allMonthsCount;
    
    const allCustomFees = fees.reduce((acc, curr) => acc + curr.amount, 0);
    const allTotalDueToAtlas = allMgtPercentFee + allMgtFixedFee + allCustomFees + allReimbursableExpenses;
    const allTotalPaymentsToAtlas = payments.reduce((acc, curr) => acc + curr.amount, 0);
    
    const balanceRemainingToAtlas = allTotalDueToAtlas - allTotalPaymentsToAtlas;

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
  }, [revenue, expenses, fees, payments, filteredRevenue, filteredExpenses, filteredFees, filteredPayments, property]);

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
    <div className="min-h-screen bg-brand-slate-50 font-sans text-brand-slate-800 pb-20 lg:pb-0 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-white border-r border-brand-slate-200 sticky top-0 h-screen p-6 z-20">
        <div className="text-2xl font-serif tracking-[0.12em] text-brand-slate-900 font-light flex items-center gap-1 mb-10">
          ATLAS <span className="text-brand-accent font-medium">LIVING</span>
        </div>
        
        <nav className="flex flex-col gap-2">
          <button 
            onClick={() => setView('overview')} 
            className={cn(
              "px-4 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3",
              view === 'overview' ? "bg-brand-slate-900 text-white shadow-sm" : "text-brand-slate-500 hover:bg-brand-slate-50 hover:text-brand-slate-900"
            )}
          >
            <LayoutDashboard size={16} />
            Overview
          </button>
          <button 
            onClick={() => setView('revenue')} 
            className={cn(
              "px-4 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3",
              view === 'revenue' ? "bg-brand-slate-900 text-white shadow-sm" : "text-brand-slate-500 hover:bg-brand-slate-50 hover:text-brand-slate-900"
            )}
          >
            <TrendingUp size={16} />
            Revenue
          </button>
          <button 
            onClick={() => setView('expenses')} 
            className={cn(
              "px-4 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3",
              view === 'expenses' ? "bg-brand-slate-900 text-white shadow-sm" : "text-brand-slate-500 hover:bg-brand-slate-50 hover:text-brand-slate-900"
            )}
          >
            <Wallet size={16} />
            Expenses
          </button>
          <button 
            onClick={() => setView('payments')} 
            className={cn(
              "px-4 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3",
              view === 'payments' ? "bg-brand-slate-900 text-white shadow-sm" : "text-brand-slate-500 hover:bg-brand-slate-50 hover:text-brand-slate-900"
            )}
          >
            <CreditCard size={16} />
            Payments
          </button>
          <button 
            onClick={() => setView('operations')} 
            className={cn(
              "px-4 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3",
              view === 'operations' ? "bg-brand-slate-900 text-white shadow-sm" : "text-brand-slate-500 hover:bg-brand-slate-50 hover:text-brand-slate-900"
            )}
          >
            <Ticket size={16} />
            Operations
          </button>
          <button 
            onClick={() => setView('info')} 
            className={cn(
              "px-4 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3",
              view === 'info' ? "bg-brand-slate-900 text-white shadow-sm" : "text-brand-slate-500 hover:bg-brand-slate-50 hover:text-brand-slate-900"
            )}
          >
            <Home size={16} />
            Info
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <div className="flex items-center gap-3 pb-4 border-b border-brand-slate-100">
            <div className="w-10 h-10 rounded-full bg-brand-slate-100 text-brand-slate-900 flex items-center justify-center font-bold text-sm">
              {property.ownerName.charAt(0)}
            </div>
            <div>
              <div className="text-xs font-bold text-brand-slate-900 line-clamp-1">{property.ownerName}</div>
              <div className="text-[10px] font-bold text-brand-slate-400 uppercase tracking-widest">ID: {property.id}</div>
            </div>
          </div>
          
          <button 
            onClick={onLogout} 
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-black uppercase tracking-widest text-brand-slate-400 hover:bg-red-50 hover:text-red-500 transition-all w-full text-left"
          >
            <ArrowUpRight size={16} className="rotate-180" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 w-full lg:h-screen lg:overflow-y-auto">
        {/* Mobile Top Header */}
        <header className="lg:hidden bg-white/95 backdrop-blur-md sticky top-0 px-4 py-3 flex flex-col md:flex-row items-center justify-between z-20 border-b border-brand-slate-200 gap-3">
          <div className="flex items-center justify-between w-full">
            <div className="text-xl md:text-2xl font-serif tracking-[0.12em] text-brand-slate-900 font-light flex items-center gap-1">
              ATLAS <span className="text-brand-accent font-medium">LIVING</span>
            </div>
            
            <div className="flex items-center gap-3">
              <button 
                onClick={onLogout} 
                className="p-1.5 text-brand-slate-400 hover:text-red-500 rounded-lg transition-all"
                title="Exit View"
              >
                <ArrowUpRight size={18} className="rotate-180" />
              </button>
              <div className="w-8 h-8 rounded-full bg-brand-slate-900 text-white flex items-center justify-center font-bold text-xs">
                {property.ownerName.charAt(0)}
              </div>
            </div>
          </div>
          
          {/* Mobile Menu */}
          <div className="w-full">
            <select 
              value={view}
              onChange={(e) => setView(e.target.value as any)}
              className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest text-brand-slate-900 outline-none"
            >
              <option value="overview">Overview</option>
              <option value="revenue">Revenue</option>
              <option value="expenses">Expenses</option>
              <option value="payments">Payments</option>
              <option value="operations">Operations</option>
              <option value="info">Info</option>
            </select>
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

                  <button onClick={() => setView('revenue')} className="bento-card col-span-2 lg:col-span-2 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer bg-green-50/30 border-green-100 p-3 sm:p-5">
                    <span className="bento-label text-green-700">Profit</span>
                    <div className={cn("text-lg sm:text-2xl font-bold tracking-tight mb-2", stats.profit >= 0 ? "text-green-600" : "text-red-500")}>
                      {stats.totalGross > 0 ? formatCurrency(stats.profit) : (
                        <span className="text-[9px] sm:text-sm text-brand-slate-400 font-medium tracking-tight">Pending</span>
                      )}
                    </div>
                    <div className="mt-auto pt-2 sm:pt-4 flex items-center justify-between border-t border-green-100/50">
                      <div className="text-[8px] sm:text-[9px] uppercase font-bold tracking-widest text-brand-slate-400">Net Profit</div>
                      <div className="text-xs sm:text-sm font-black text-green-700">
                        {stats.totalGross > 0 ? ((stats.profit / stats.totalGross) * 100).toFixed(1) : 0}% Margin
                      </div>
                    </div>
                  </button>

                  <button onClick={() => setView('revenue')} className="bento-card col-span-2 lg:col-span-1 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer p-3 sm:p-5">
                    <span className="bento-label text-brand-accent">Net Revenue</span>
                    <div className="bento-value text-base sm:text-lg lg:text-2xl text-brand-slate-700">{formatCurrency(stats.netRevenueInOwnerBank)}</div>
                    <div className="mt-auto pt-2 sm:pt-4 flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[8px] sm:text-[9px] font-bold uppercase">
                        <span className="text-brand-slate-400">Gross</span>
                        <span className="text-brand-slate-700">{formatCurrency(stats.totalGross)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[8px] sm:text-[9px] font-bold uppercase border-t border-brand-slate-100 pt-1">
                        <span className="text-brand-slate-400">Fees</span>
                        <span className="text-red-500">-{formatCurrency(stats.totalPlatformFees)}</span>
                      </div>
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
                    <span className="bento-label text-brand-accent">Management Fees</span>
                    <div className="bento-value text-brand-slate-900 text-base sm:text-lg lg:text-2xl">{formatCurrency(stats.totalManagementFees)}</div>
                    <div className="mt-auto pt-2 sm:pt-4 text-[8px] sm:text-[10px] text-brand-slate-400 font-medium uppercase tracking-tight">Atlas Living</div>
                  </div>

                  <button onClick={() => setView('payments')} className="bento-card col-span-1 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer p-3 sm:p-5">
                    <span className="bento-label text-green-600">Payments</span>
                    <div className="bento-value text-green-600 text-base sm:text-lg lg:text-2xl">{formatCurrency(stats.totalPaymentsToAtlas)}</div>
                    <div className="mt-auto pt-2 sm:pt-4 text-[8px] sm:text-[10px] text-brand-slate-400 font-medium uppercase tracking-tight">Reconciled</div>
                  </button>

                  <button onClick={() => setView('payments')} className={cn("bento-card col-span-1 text-left hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer p-3 sm:p-5", stats.balanceRemainingToAtlas > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200")}>
                    <span className="bento-label font-bold text-[8px] sm:text-[10px]">{stats.balanceRemainingToAtlas > 0 ? "Currently Payable" : "Settled"}</span>
                    <div className={cn("text-base sm:text-lg lg:text-3xl font-black tracking-tighter", stats.balanceRemainingToAtlas > 0 ? "text-amber-700" : "text-green-700")}>
                      {formatCurrency(Math.abs(stats.balanceRemainingToAtlas))}
                    </div>
                    <div className="mt-auto pt-2 sm:pt-4 text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 truncate">
                      {stats.balanceRemainingToAtlas > 0 ? "All-Time Balance" : "All-time Balance Settled"}
                    </div>
                  </button>
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
                          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#64748b' }} tickFormatter={(value) => 'R' + value.toLocaleString()} />
                          <Tooltip 
                            cursor={{ fill: '#f8fafc' }}
                            contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: number) => formatCurrency(value)}
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
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                   <h2 className="text-xl font-bold uppercase tracking-tight">Ticketing & Requests</h2>
                   <div className="flex items-center gap-2">
                     <span className="hidden md:inline-block bg-brand-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest mr-2">Property Operations</span>
                     <button
                       onClick={() => setShowNewTicketForm(true)}
                       className="bg-brand-accent hover:bg-brand-accent/90 text-white font-bold px-4 py-2 text-xs rounded-lg uppercase tracking-widest transition-colors"
                     >
                       + New Ticket
                     </button>
                   </div>
                </div>

                {showNewTicketForm && (
                  <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} className="bento-card p-6 border-brand-slate-300 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-brand-accent"></div>
                    <h3 className="font-black text-brand-slate-900 uppercase tracking-tight mb-4">Create New Ticket</h3>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const title = (form.elements.namedItem('title') as HTMLInputElement).value;
                      const description = (form.elements.namedItem('description') as HTMLTextAreaElement).value;
                      const priority = (form.elements.namedItem('priority') as HTMLSelectElement).value as any;
                      const category = (form.elements.namedItem('category') as HTMLInputElement).value;
                      if (!title || !description) return;
                      
                      const newTicket: MaintenanceIssue = {
                        id: `ticket_${Date.now()}`,
                        propertyId: property.id,
                        title,
                        description,
                        status: 'open',
                        priority,
                        category: category || 'general',
                        date: dateFnsFormat(new Date(), 'yyyy-MM-dd'),
                        ownerReported: true,
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                      };
                      
                      try {
                        await setDoc(doc(db, 'maintenance', newTicket.id), newTicket);
                        setShowNewTicketForm(false);
                      } catch (error) {
                        console.error("Error adding ticket:", error);
                        alert("Failed to submit ticket.");
                      }
                    }}>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Title <span className="text-red-500">*</span></label>
                          <input required name="title" type="text" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" placeholder="E.g. Leaking Faucet" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Category</label>
                          <input name="category" type="text" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" placeholder="E.g. Plumbing" />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Description <span className="text-red-500">*</span></label>
                          <textarea required name="description" rows={3} className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" placeholder="Please describe the issue in detail..."></textarea>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Priority</label>
                          <select name="priority" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none bg-white">
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end pt-2 border-t border-brand-slate-100">
                        <button type="button" onClick={() => setShowNewTicketForm(false)} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-brand-slate-500 hover:bg-brand-slate-50 rounded-lg">Cancel</button>
                        <button type="submit" className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-white bg-brand-slate-900 rounded-lg shadow-sm hover:shadow-md hover:bg-brand-slate-800 transition-all">Submit Ticket</button>
                      </div>
                    </form>
                  </motion.div>
                )}

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

            {view === 'payments' && (
              <motion.div
                key="payments-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                   <h2 className="text-xl font-bold uppercase tracking-tight">Payments Reconciled</h2>
                   
                   <div className="flex gap-2">
                     <span className="bg-brand-slate-900 text-white px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest">
                       All-Time Balance: {formatCurrency(Math.max(0, stats.balanceRemainingToAtlas))}
                     </span>
                   </div>
                </div>

                <div className="bento-card p-0 overflow-hidden">
                   <div className="p-6 border-b border-brand-slate-100 flex justify-between items-center bg-white">
                      <span className="bento-label">Payment History</span>
                      <div className="p-2 bg-brand-accent/10 rounded-lg text-brand-accent">
                        <CreditCard size={18} />
                      </div>
                   </div>
                   
                   <div className="p-0 overflow-x-auto">
                     <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-brand-slate-50 border-b border-brand-slate-100">
                             <th className="py-3 px-4 text-[10px] uppercase font-black tracking-widest text-brand-slate-400">Date paid</th>
                             <th className="py-3 px-4 text-[10px] uppercase font-black tracking-widest text-brand-slate-400">Amount</th>
                             <th className="py-3 px-4 text-[10px] uppercase font-black tracking-widest text-brand-slate-400">Ref / Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-slate-100 text-sm">
                          {payments.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-12 text-center text-brand-slate-400 font-bold uppercase tracking-widest text-xs">
                                No payments recorded
                              </td>
                            </tr>
                          ) : (
                            payments.map((p) => (
                               <tr key={p.id} className="hover:bg-brand-slate-50/50 transition-colors">
                                 <td className="py-3 px-4 font-mono text-brand-slate-600 border-r border-brand-slate-100 w-32">{p.date}</td>
                                 <td className="py-3 px-4 font-medium text-green-600">
                                   {formatCurrency(p.amount)}
                                 </td>
                                 <td className="py-3 px-4 text-brand-slate-500 whitespace-pre-wrap">{p.description || '-'}</td>
                               </tr>
                            ))
                          )}
                        </tbody>
                     </table>
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
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => {
                        const csvData = sortedRevLogs.map(log => ({
                          Date: log.paymentDate,
                          Guest: log.guest,
                          Platform: log.platform,
                          Gross: log.gross,
                          Fees: log.fees,
                          Net: log.gross - log.fees
                        }));
                        exportToCSV(csvData, `revenue_${startDate}_${endDate}`);
                      }} 
                      className="text-xs font-bold text-brand-slate-500 hover:text-brand-slate-900 transition-colors uppercase tracking-widest flex items-center gap-1"
                    >
                      <Download size={14} /> Export CSV
                    </button>
                    <button onClick={() => setView('overview')} className="text-xs font-bold text-brand-slate-500 hover:text-brand-slate-900 transition-colors uppercase tracking-widest">Back to Dashboard</button>
                  </div>
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
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => {
                        const csvData = sortedExpLogs.map(log => ({
                          Date: log.date,
                          Description: log.description,
                          Category: log.category,
                          Amount: log.amount,
                          Reimbursable: log.reimbursable ? 'Yes' : 'No'
                        }));
                        exportToCSV(csvData, `expenses_${startDate}_${endDate}`);
                      }} 
                      className="text-xs font-bold text-brand-slate-500 hover:text-brand-slate-900 transition-colors uppercase tracking-widest flex items-center gap-1"
                    >
                      <Download size={14} /> Export CSV
                    </button>
                    <button onClick={() => setView('overview')} className="text-xs font-bold text-brand-slate-500 hover:text-brand-slate-900 transition-colors uppercase tracking-widest">Back to Dashboard</button>
                  </div>
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


            {view === 'info' && (
              <motion.div
                key="info-view"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                  <h2 className="text-xl font-bold uppercase tracking-tight">Property Information</h2>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Property Details */}
                  <div className="lg:col-span-8 space-y-6">
                    <div className="bento-card overflow-hidden p-0 border border-brand-slate-200">
                      {property.imageUrl ? (
                        <div className="w-full h-48 md:h-72 bg-brand-slate-200 relative">
                           <img src={property.imageUrl} alt={property.title || property.name} className="w-full h-full object-cover" />
                           <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] font-black tracking-widest text-brand-slate-900 border border-white/20 uppercase shadow-lg">
                             Verified Listing
                           </div>
                        </div>
                      ) : (
                        <div className="w-full h-48 bg-brand-slate-100 flex items-center justify-center">
                          <Home size={32} className="text-brand-slate-300" />
                        </div>
                      )}
                      
                      <div className="p-6 md:p-8 bg-white">
                        <h3 className="text-2xl md:text-3xl font-black text-brand-slate-900 mb-2 tracking-tight">
                          {property.title || property.name}
                        </h3>
                        <div className="flex items-center gap-2 text-brand-slate-500 mb-6">
                          <div className="w-2 h-2 rounded-full bg-brand-accent"></div>
                          <span className="text-xs font-bold uppercase tracking-widest">{property.location || 'Location Not Set'}</span>
                        </div>
                        
                        <div className="space-y-4">
                           <h4 className="text-[10px] uppercase font-black tracking-widest text-brand-slate-400">About this property</h4>
                           <p className="text-sm md:text-base text-brand-slate-600 leading-relaxed whitespace-pre-wrap">
                             {property.description || 'No description available for this property yet. Please contact your property manager to update these details.'}
                           </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Listings & Links */}
                  <div className="lg:col-span-4 space-y-6">
                    <div className="bento-card bg-white">
                      <span className="bento-label mb-6">Linked Platforms</span>
                      <div className="space-y-3">
                        {(!property.links || property.links.length === 0) ? (
                          <div className="text-center py-8 rounded-xl border border-dashed border-brand-slate-200 bg-brand-slate-50">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-400">No platforms linked</div>
                          </div>
                        ) : (
                          property.links.map((link, idx) => (
                            <a 
                              key={idx} 
                              href={link.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="group flex flex-col p-4 rounded-xl border border-brand-slate-100 bg-brand-slate-50 hover:bg-brand-slate-900 hover:border-brand-slate-900 transition-all cursor-pointer"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-brand-slate-900 group-hover:text-white transition-colors">{link.platform}</span>
                                <ArrowUpRight size={14} className="text-brand-slate-400 group-hover:text-white/50 transition-colors" />
                              </div>
                              <span className="text-[10px] font-medium text-brand-slate-500 truncate group-hover:text-brand-slate-300 transition-colors">{link.url}</span>
                            </a>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="bento-card border-brand-accent/20 bg-brand-accent/5">
                      <span className="bento-label text-brand-accent mb-6">Owner Information</span>
                      <div className="space-y-4">
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-widest text-brand-slate-400">Primary Contact</div>
                          <div className="text-sm font-bold text-brand-slate-900 mt-1">{property.ownerName}</div>
                        </div>
                        {property.companyName && (
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-brand-slate-400">Company</div>
                            <div className="text-sm font-bold text-brand-slate-900 mt-1">{property.companyName}</div>
                          </div>
                        )}
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-widest text-brand-slate-400">Email Address</div>
                          <div className="text-sm font-bold text-brand-slate-900 mt-1">{property.ownerEmail}</div>
                        </div>
                        {property.cellNumber && (
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-brand-slate-400">Cell Number</div>
                            <div className="text-sm font-bold text-brand-slate-900 mt-1">{property.cellNumber}</div>
                          </div>
                        )}
                        {property.vatNumber && (
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-widest text-brand-slate-400">VAT Number</div>
                            <div className="text-sm font-bold text-brand-slate-900 mt-1">{property.vatNumber}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>
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
