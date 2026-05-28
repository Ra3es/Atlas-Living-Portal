import React, { useState, useEffect, useMemo } from 'react';
import { db, auth, googleProvider } from '../lib/firebase';
import { signInWithPopup, signOut } from 'firebase/auth';
import { collection, query, getDocs, setDoc, doc, deleteDoc, writeBatch, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Property, RevenueLog, ExpenseLog, CustomFee, PaymentRecord, OperationType, MaintenanceIssue } from '../types';
import { handleFirestoreError, cn, formatCurrency, exportToCSV } from '../lib/utils';
import { parseRevenueCSV, parseExpenseCSV, parseSettingsCSV, parsePaymentCSV } from '../services/csvService';
import { Upload, Plus, Trash2, Key, LogOut, ChevronRight, ChevronLeft, FileText, Database, Eye, CreditCard, CheckCircle, Clock, AlertTriangle, MessageSquare, Pencil, Check, Calendar, X, Settings, ListFilter, ArrowUpRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format as dateFnsFormat, startOfMonth, endOfMonth, parseISO as dateFnsParseISO, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addDays, addMonths, subMonths } from 'date-fns';

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

const ADMIN_EMAIL = 'raeellahi@gmail.com';

interface AdminPortalProps {
  onViewAsOwner: (property: Property) => void;
}

export default function AdminPortal({ onViewAsOwner }: AdminPortalProps) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [propertyFees, setPropertyFees] = useState<CustomFee[]>([]);
  const [allFees, setAllFees] = useState<CustomFee[]>([]);
  const [revenue, setRevenue] = useState<RevenueLog[]>([]);
  const [allRevenue, setAllRevenue] = useState<RevenueLog[]>([]);
  const [expenses, setExpenses] = useState<ExpenseLog[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceIssue[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPropertySelector, setShowPropertySelector] = useState(false);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'revenue' | 'expenses' | 'payments' | 'fees' | 'operations' | 'calendar'>('config');
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()));
  const [feeView, setFeeView] = useState<'individual' | 'spreadsheet'>('individual');
  const [entryFeeType, setEntryFeeType] = useState<'fixed' | 'percent'>('fixed');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const [revSortField, setRevSortField] = useState<'paymentDate' | 'guest' | 'gross'>('paymentDate');
  const [revSortDirection, setRevSortDirection] = useState<'asc' | 'desc'>('desc');

  const [expSortField, setExpSortField] = useState<'date' | 'description' | 'amount'>('date');
  const [expSortDirection, setExpSortDirection] = useState<'asc' | 'desc'>('desc');

  const [paySortField, setPaySortField] = useState<'date' | 'description' | 'amount'>('date');
  const [paySortDirection, setPaySortDirection] = useState<'asc' | 'desc'>('desc');

  const toggleRevSort = (field: 'paymentDate' | 'guest' | 'gross') => {
    if (revSortField === field) {
      setRevSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setRevSortField(field);
      setRevSortDirection('desc');
    }
  };

  const toggleExpSort = (field: 'date' | 'description' | 'amount') => {
    if (expSortField === field) {
      setExpSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setExpSortField(field);
      setExpSortDirection('desc');
    }
  };

  const togglePaySort = (field: 'date' | 'description' | 'amount') => {
    if (paySortField === field) {
      setPaySortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setPaySortField(field);
      setPaySortDirection('desc');
    }
  };

  const sortedRevenue = useMemo(() => {
    const items = [...revenue];
    return items.sort((a, b) => {
      let comparison = 0;
      if (revSortField === 'paymentDate') {
        comparison = (a.paymentDate || '').localeCompare(b.paymentDate || '');
      } else if (revSortField === 'guest') {
        comparison = (a.guest || '').localeCompare(b.guest || '');
      } else if (revSortField === 'gross') {
        comparison = (a.gross || 0) - (b.gross || 0);
      }
      return revSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [revenue, revSortField, revSortDirection]);

  const sortedExpenses = useMemo(() => {
    const items = [...expenses];
    return items.sort((a, b) => {
      let comparison = 0;
      if (expSortField === 'date') {
        comparison = (a.date || '').localeCompare(b.date || '');
      } else if (expSortField === 'description') {
        comparison = (a.description || '').localeCompare(b.description || '');
      } else if (expSortField === 'amount') {
        comparison = (a.amount || 0) - (b.amount || 0);
      }
      return expSortDirection === 'asc' ? comparison : -comparison;
    });
  }, [expenses, expSortField, expSortDirection]);

  const sortedPayments = useMemo(() => {
    const items = [...payments];
    return items.sort((a, b) => {
      let comparison = 0;
      if (paySortField === 'date') {
        comparison = (a.date || '').localeCompare(b.date || '');
      } else if (paySortField === 'description') {
        comparison = (a.description || '').localeCompare(b.description || '');
      } else if (paySortField === 'amount') {
        comparison = (a.amount || 0) - (b.amount || 0);
      }
      return paySortDirection === 'asc' ? comparison : -comparison;
    });
  }, [payments, paySortField, paySortDirection]);

  useEffect(() => {
    // Real-time Properties
    const qProps = query(collection(db, 'properties'), orderBy('createdAt', 'desc'));
    const unsubProps = onSnapshot(qProps, (snapshot) => {
      const props = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Property));
      setProperties(props);
      setSelectedProperty((prev) => {
        if (!prev) return props[0] || null;
        return props.find(p => p.id === prev.id) || props[0] || null;
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'properties'));

    // Real-time ALL Fees for spreadsheet
    const qAllFees = query(collection(db, 'fees'), orderBy('date', 'desc'));
    const unsubAllFees = onSnapshot(qAllFees, (snapshot) => {
      setAllFees(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CustomFee)));
    });

    // Real-time ALL Revenue for calculations
    const qAllRev = query(collection(db, 'revenue'));
    const unsubAllRev = onSnapshot(qAllRev, (snapshot) => {
      setAllRevenue(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as RevenueLog)));
    });

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user && user.email === ADMIN_EMAIL && user.emailVerified) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => {
      unsubProps();
      unsubAllFees();
      unsubAllRev();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      const propertyId = selectedProperty.id;
      
      // Real-time Revenue
      const qRev = query(collection(db, 'revenue'), where('propertyId', '==', propertyId));
      const unsubRev = onSnapshot(qRev, (snapshot) => {
        setRevenue(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as RevenueLog)).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'revenue'));

      // Real-time Expenses
      const qExp = query(collection(db, 'expenses'), where('propertyId', '==', propertyId));
      const unsubExp = onSnapshot(qExp, (snapshot) => {
        setExpenses(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ExpenseLog)).sort((a, b) => b.date.localeCompare(a.date)));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'expenses'));

      // Real-time Payments
      const qPay = query(collection(db, 'payments'), where('propertyId', '==', propertyId));
      const unsubPay = onSnapshot(qPay, (snapshot) => {
        setPayments(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PaymentRecord)).sort((a, b) => b.date.localeCompare(a.date)));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'payments'));

      // Real-time Fees
      const qFees = query(collection(db, 'fees'), where('propertyId', '==', propertyId));
      const unsubFees = onSnapshot(qFees, (snapshot) => {
        setPropertyFees(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CustomFee)).sort((a, b) => b.date.localeCompare(a.date)));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'fees'));

      // Real-time Maintenance
      const qMaint = query(collection(db, 'maintenance'), where('propertyId', '==', propertyId));
      const unsubMaint = onSnapshot(qMaint, (snapshot) => {
        setMaintenance(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as MaintenanceIssue)).sort((a, b) => b.updatedAt - a.updatedAt));
      }, (error) => handleFirestoreError(error, OperationType.GET, 'maintenance'));

      setSelectedIds(new Set());

      return () => {
        unsubRev();
        unsubExp();
        unsubPay();
        unsubFees();
        unsubMaint();
      };
    }
  }, [selectedProperty]);

  useEffect(() => {
    setSelectedIds(new Set());
    setEditingId(null);
  }, [activeTab]);

  const handleFeeFileUpload = (e: React.ChangeEvent<HTMLInputElement>, feeId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (feeId) {
        // Update existing fee
        await handleUpdateFee(feeId, { documentUrl: base64 });
      } else {
        // We'll handle this in handleAddFee
      }
    };
    reader.readAsDataURL(file);
  };

  async function fetchProperties() {
    try {
      const q = query(collection(db, 'properties'));
      const snapshot = await getDocs(q);
      setProperties(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Property)));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'properties');
    }
  }

  async function fetchFees(propertyId: string) {
    try {
      const q = query(collection(db, 'fees'), where('propertyId', '==', propertyId));
      const snapshot = await getDocs(q);
      setPropertyFees(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as CustomFee)).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchRevenue(propertyId: string) {
    try {
      const q = query(collection(db, 'revenue'), where('propertyId', '==', propertyId));
      const snapshot = await getDocs(q);
      setRevenue(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as RevenueLog)).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)));
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchExpenses(propertyId: string) {
    try {
      const q = query(collection(db, 'expenses'), where('propertyId', '==', propertyId));
      const snapshot = await getDocs(q);
      setExpenses(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ExpenseLog)).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchPayments(propertyId: string) {
    try {
      const q = query(collection(db, 'payments'), where('propertyId', '==', propertyId));
      const snapshot = await getDocs(q);
      setPayments(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as PaymentRecord)).sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchOperations(propertyId: string) {
    try {
      const mq = query(collection(db, 'maintenance'), where('propertyId', '==', propertyId));
      const mSnap = await getDocs(mq);
      setMaintenance(mSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as MaintenanceIssue)).sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (error) {
      console.error(error);
    }
  }

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error(error);
    }
  };

  const handleLogout = () => signOut(auth);

  const generatePin = () => Math.floor(100000 + Math.random() * 900000).toString();

  const handleAddProperty = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const id = (formData.get('id') as string).trim().toUpperCase();
    const name = formData.get('name') as string;
    
    const newProperty: Property = {
      id,
      name,
      ownerName: formData.get('ownerName') as string,
      ownerEmail: formData.get('ownerEmail') as string,
      managementFeePercent: parseFloat(formData.get('feePercent') as string) || 0,
      managementFeeFixed: parseFloat(formData.get('feeFixed') as string) || 0,
      pin: generatePin(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await setDoc(doc(db, 'properties', id), newProperty);
      setMessage({ type: 'success', text: `Property ${id} added successfully.` });
      fetchProperties();
      form.reset();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `properties/${id}`);
    }
  };

  const handleDeleteProperty = async (id: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }
    
    try {
      await deleteDoc(doc(db, 'properties', id));
      setMessage({ type: 'success', text: `Property ${id} deleted.` });
      if (selectedProperty?.id === id) setSelectedProperty(null);
      setDeleteConfirmId(null);
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'revenue' | 'expense' | 'settings' | 'payment') => {
    const file = e.target.files?.[0];
    if (!file || !selectedProperty) return;

    try {
      const text = await file.text();
      const batch = writeBatch(db);

      if (type === 'settings') {
        const settings = parseSettingsCSV(text);
        const updated = { ...selectedProperty, ...settings, updatedAt: Date.now() };
        await setDoc(doc(db, 'properties', selectedProperty.id), updated);
        setSelectedProperty(updated);
        fetchProperties();
        setMessage({ type: 'success', text: 'Settings updated.' });
      } else if (type === 'revenue') {
        const data = parseRevenueCSV(text, selectedProperty.id);
        // Delete existing revenue for this property first (simplified logic)
        // In a real app we might filter by month
        data.forEach((item) => {
          const id = `${item.propertyId}_${item.paymentDate}_${item.guest}`.replace(/[^a-zA-Z0-9]/g, '_');
          const ref = doc(db, 'revenue', id);
          batch.set(ref, { ...item, id, uploadedAt: Date.now() });
        });
        await batch.commit();
        setMessage({ type: 'success', text: `Uploaded ${data.length} revenue records.` });
      } else if (type === 'expense') {
        const data = parseExpenseCSV(text, selectedProperty.id);
        data.forEach((item) => {
          const id = `${item.propertyId}_${item.date}_${item.description}`.replace(/[^a-zA-Z0-9]/g, '_');
          const ref = doc(db, 'expenses', id);
          batch.set(ref, { ...item, id, uploadedAt: Date.now() });
        });
        await batch.commit();
        setMessage({ type: 'success', text: `Uploaded ${data.length} expense records.` });
      } else if (type === 'payment') {
        const data = parsePaymentCSV(text, selectedProperty.id);
        data.forEach((item) => {
          const id = `${item.propertyId}_${item.date}_${item.amount}_${Date.now()}`.replace(/[^a-zA-Z0-9]/g, '_');
          const ref = doc(db, 'payments', id);
          batch.set(ref, { ...item, id, uploadedAt: Date.now() });
        });
        await batch.commit();
        setMessage({ type: 'success', text: `Uploaded ${data.length} payments.` });
        fetchPayments(selectedProperty.id);
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Failed to process file.' });
    }
  };

  const handleUpdateManagementConfig = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProperty) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const updated: Property = {
      ...selectedProperty,
      managementFeePercent: parseFloat(formData.get('feePercent') as string) || 0,
      managementFeeFixed: parseFloat(formData.get('feeFixed') as string) || 0,
      updatedAt: Date.now()
    };

    try {
      await setDoc(doc(db, 'properties', selectedProperty.id), updated);
      setSelectedProperty(updated);
      fetchProperties();
      setMessage({ type: 'success', text: 'Management settings updated.' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `properties/${selectedProperty.id}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !selectedProperty) return;
    
    if (!bulkDeleteConfirm) {
      setBulkDeleteConfirm(true);
      setTimeout(() => setBulkDeleteConfirm(false), 4000);
      return;
    }

    setMessage({ type: 'success', text: 'Processing bulk delete...' });

    try {
      const collectionName = activeTab === 'revenue' ? 'revenue' : 
                           activeTab === 'expenses' ? 'expenses' :
                           activeTab === 'payments' ? 'payments' :
                           activeTab === 'fees' ? 'fees' : null;
      
      if (!collectionName) {
        setMessage({ type: 'error', text: 'Bulk delete not supported for this tab.' });
        return;
      }

      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.delete(doc(db, collectionName, id));
      });

      const count = selectedIds.size;
      await batch.commit();
      
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
      setMessage({ type: 'success', text: `Deleted ${count} records successfully.` });
    } catch (error) {
      console.error('Bulk Delete Error:', error);
      setMessage({ type: 'error', text: `Bulk delete failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = (ids: string[]) => {
    const allSelected = ids.length > 0 && ids.every(id => selectedIds.has(id));
    if (allSelected) {
      const newSet = new Set(selectedIds);
      ids.forEach(id => newSet.delete(id));
      setSelectedIds(newSet);
    } else {
      const newSet = new Set(selectedIds);
      ids.forEach(id => newSet.add(id));
      setSelectedIds(newSet);
    }
  };

  const handleAddRevenue = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProperty) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const item: RevenueLog = {
      id: `${selectedProperty.id}_${Date.now()}`,
      propertyId: selectedProperty.id,
      guest: formData.get('guest') as string,
      platform: formData.get('platform') as string,
      cleanings: 0,
      nights: parseInt(formData.get('nights') as string) || 0,
      gross: parseFloat(formData.get('gross') as string) || 0,
      fees: parseFloat(formData.get('fees') as string) || 0,
      netRevenue: 0, // Calculated below
      paymentDate: formData.get('date') as string,
      uploadedAt: Date.now(),
    };
    item.netRevenue = item.gross - item.fees;

    try {
      await setDoc(doc(db, 'revenue', item.id), item);
      setMessage({ type: 'success', text: 'Revenue item added.' });
      fetchRevenue(selectedProperty.id);
      form.reset();
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdateRevenue = async (id: string, updates: Partial<RevenueLog>) => {
    try {
      const item = revenue.find(r => r.id === id);
      if (!item) return;
      const updatedItem = { ...item, ...updates, netRevenue: (updates.gross ?? item.gross) - (updates.fees ?? item.fees) };
      await setDoc(doc(db, 'revenue', id), updatedItem);
      setRevenue(prev => prev.map(r => r.id === id ? updatedItem : r));
      setMessage({ type: 'success', text: 'Revenue record updated.' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Update failed.' });
    }
  };

  const handleDeleteRevenue = async (id: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    try {
      await deleteDoc(doc(db, 'revenue', id));
      setMessage({ type: 'success', text: 'Revenue record deleted.' });
      setDeleteConfirmId(null);
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  };

  const handleDeleteMaintenance = async (id: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    try {
      await deleteDoc(doc(db, 'maintenance', id));
      setMessage({ type: 'success', text: 'Maintenance issue deleted.' });
      setDeleteConfirmId(null);
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  };

  const handleUpdateMaintenance = async (id: string, updates: Partial<MaintenanceIssue>) => {
    try {
      const ref = doc(db, 'maintenance', id);
      await setDoc(ref, { ...maintenance.find(m => m.id === id), ...updates, updatedAt: Date.now() }, { merge: true });
      fetchOperations(selectedProperty!.id);
      setMessage({ type: 'success', text: 'Maintenance issue updated.' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Update failed.' });
    }
  };

  const handleAddExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProperty) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const item: ExpenseLog = {
      id: `${selectedProperty.id}_${Date.now()}`,
      propertyId: selectedProperty.id,
      description: formData.get('description') as string,
      category: formData.get('category') as string,
      supplier: 'Manual Entry',
      amount: parseFloat(formData.get('amount') as string) || 0,
      date: formData.get('date') as string,
      reimbursable: formData.get('reimbursable') === 'on',
      uploadedAt: Date.now(),
    };

    try {
      await setDoc(doc(db, 'expenses', item.id), item);
      setMessage({ type: 'success', text: 'Expense item added.' });
      fetchExpenses(selectedProperty.id);
      form.reset();
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdateExpense = async (id: string, updates: Partial<ExpenseLog>) => {
    try {
      const item = expenses.find(e => e.id === id);
      if (!item) return;
      const updatedItem = { ...item, ...updates };
      await setDoc(doc(db, 'expenses', id), updatedItem);
      setExpenses(prev => prev.map(e => e.id === id ? updatedItem : e));
      setMessage({ type: 'success', text: 'Expense updated.' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Update failed.' });
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    try {
      await deleteDoc(doc(db, 'expenses', id));
      setMessage({ type: 'success', text: 'Expense deleted.' });
      setDeleteConfirmId(null);
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  };

  const handleAddPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProperty) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    const item: PaymentRecord = {
      id: `${selectedProperty.id}_${Date.now()}`,
      propertyId: selectedProperty.id,
      amount: parseFloat(formData.get('amount') as string) || 0,
      date: formData.get('date') as string,
      description: formData.get('description') as string || 'Manual Payment Entry',
      uploadedAt: Date.now(),
    };

    try {
      await setDoc(doc(db, 'payments', item.id), item);
      setMessage({ type: 'success', text: 'Payment record added.' });
      fetchPayments(selectedProperty.id);
      form.reset();
    } catch (error) {
      console.error(error);
    }
  };

  const handleUpdatePayment = async (id: string, updates: Partial<PaymentRecord>) => {
    try {
      const item = payments.find(p => p.id === id);
      if (!item) return;
      const updatedItem = { ...item, ...updates };
      await setDoc(doc(db, 'payments', id), updatedItem);
      setPayments(prev => prev.map(p => p.id === id ? updatedItem : p));
      setMessage({ type: 'success', text: 'Payment record updated.' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Update failed.' });
    }
  };

  const handleDeletePayment = async (id: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    try {
      await deleteDoc(doc(db, 'payments', id));
      setMessage({ type: 'success', text: 'Payment deleted.' });
      setDeleteConfirmId(null);
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  };

  const handleAddFee = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProperty) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    const feeType = formData.get('feeType') as 'fixed' | 'percent';
    const rawAmount = parseFloat(formData.get('amount') as string);
    const description = formData.get('description') as string;
    const date = formData.get('date') as string;
    const percentage = feeType === 'percent' ? rawAmount : undefined;
    
    let finalAmount = rawAmount;
    if (feeType === 'percent' && selectedProperty) {
      // Calculate amount based on gross revenue for that month
      const monthStart = startOfMonth(parseISO(date)).getTime();
      const monthEnd = endOfMonth(parseISO(date)).getTime();
      const propertyRevenue = allRevenue.filter(r => 
        r.propertyId === selectedProperty.id && 
        r.dateTimestamp >= monthStart && 
        r.dateTimestamp <= monthEnd
      ).reduce((sum, r) => sum + r.grossAmount, 0);
      
      finalAmount = (propertyRevenue * rawAmount) / 100;
    }

    const fileInput = form.querySelector('input[type="file"]') as HTMLInputElement;

    const fee: CustomFee = {
      id: `f_${selectedProperty.id}_${Date.now()}`,
      propertyId: selectedProperty.id,
      amount: finalAmount,
      feeType,
      description,
      date,
      addedAt: Date.now(),
    };

    if (feeType === 'percent') {
      fee.percentage = percentage;
    }

    try {
      await setDoc(doc(db, 'fees', fee.id), fee);
      setMessage({ type: 'success', text: 'Fee added successfully.' });
      form.reset();
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Add fee failed.' });
    }
  };

  const handleUpdateFee = async (id: string, updates: Partial<CustomFee>) => {
    try {
      const item = propertyFees.find(f => f.id === id);
      if (!item) return;
      const updatedItem = { ...item, ...updates };
      await setDoc(doc(db, 'fees', id), updatedItem);
      setPropertyFees(prev => prev.map(f => f.id === id ? updatedItem : f));
      setMessage({ type: 'success', text: 'Fee updated.' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Update failed.' });
    }
  };

  const handleDeleteFee = async (id: string) => {
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId(null), 3000);
      return;
    }

    try {
      await deleteDoc(doc(db, 'fees', id));
      setMessage({ type: 'success', text: 'Fee deleted.' });
      setDeleteConfirmId(null);
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: `Delete failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  };

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (loading) return <div className="flex items-center justify-center h-screen font-sans">Loading...</div>;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#F8F9FA] px-4 font-sans text-[#1A1A1A]">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#E9ECEF] max-w-md w-full text-center">
          <h1 className="text-2xl font-semibold mb-2">Atlas Living Admin</h1>
          <p className="text-[#6C757D] mb-8">Secure portal for staff members only.</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-[#1A1A1A] text-white py-3 rounded-xl font-medium hover:bg-black transition-colors flex items-center justify-center gap-2"
          >
            <Database size={18} />
            Login with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-slate-50 font-sans text-brand-slate-800">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md sticky top-0 px-8 py-3 flex items-center justify-between z-30 border-b border-brand-slate-200">
        <div className="flex items-center gap-8">
          <div className="text-2xl font-serif tracking-[0.12em] text-brand-slate-900 font-light flex items-center gap-1">
            ATLAS <span className="text-brand-accent font-medium">LIVING</span> <span className="text-brand-slate-400 font-bold uppercase tracking-widest text-[10px] ml-4 bg-brand-slate-50 px-2 py-1 rounded-lg">Admin</span>
          </div>

          <div className="h-6 w-[1px] bg-brand-slate-200 hidden md:block" />

          {/* Property Selector Dropdown */}
          <div className="relative">
            <button 
              onClick={() => setShowPropertySelector(!showPropertySelector)}
              className="flex items-center gap-3 bg-brand-slate-100 hover:bg-brand-slate-200 px-4 py-2 rounded-xl text-xs font-bold transition-all border border-brand-slate-200/50 min-w-[200px]"
            >
              <div className={cn("w-2 h-2 rounded-full", selectedProperty ? "bg-brand-accent" : "bg-brand-slate-300")} />
              <span className="flex-1 text-left">{selectedProperty ? selectedProperty.name : 'Select Property'}</span>
              <ChevronRight className={cn("transition-transform", showPropertySelector ? "rotate-90" : "rotate-0")} size={14} />
            </button>

            <AnimatePresence>
              {showPropertySelector && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowPropertySelector(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full left-0 mt-2 w-[320px] bg-white border border-brand-slate-200 rounded-2xl shadow-2xl z-20 overflow-hidden"
                  >
                    <div className="p-3 border-b border-brand-slate-100 bg-brand-slate-50">
                      <div className="text-[10px] font-black text-brand-slate-400 uppercase tracking-widest pl-2">Portfolio Inventory ({properties.length})</div>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto divide-y divide-brand-slate-50">
                      {properties.map(p => (
                        <div 
                          key={p.id}
                          onClick={() => {
                            setSelectedProperty(p);
                            setShowPropertySelector(false);
                          }}
                          className={cn(
                            "flex items-center justify-between p-4 hover:bg-brand-slate-50 cursor-pointer transition-all",
                            selectedProperty?.id === p.id && "bg-brand-slate-100/50"
                          )}
                        >
                          <div>
                            <div className="font-bold text-xs uppercase tracking-tight">{p.name}</div>
                            <div className="text-[9px] text-brand-slate-400 font-mono">{p.id}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteProperty(p.id); }}
                              className={cn(
                                "p-1.5 rounded-lg transition-all relative group shadow-sm border",
                                deleteConfirmId === p.id 
                                  ? "text-white bg-red-600 border-red-600 scale-110" 
                                  : "text-brand-slate-300 bg-white border-brand-slate-100 hover:text-red-500"
                              )}
                              title={deleteConfirmId === p.id ? "Click again to confirm" : "Delete Property"}
                            >
                              <Trash2 size={12} />
                            </button>
                            {selectedProperty?.id === p.id && <Check size={14} className="text-brand-accent" />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Add Property Button */}
          <div className="relative">
            <button 
              onClick={() => setShowAddProperty(!showAddProperty)}
              className="px-4 py-2 bg-brand-slate-900 text-white rounded-xl flex items-center gap-2 hover:bg-black transition-all shadow-lg shadow-brand-slate-900/10"
            >
              <Plus size={18} />
              <span className="text-[10px] font-bold uppercase tracking-widest hidden lg:block">Add Property</span>
            </button>

            <AnimatePresence>
              {showAddProperty && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowAddProperty(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full left-0 mt-2 w-[400px] bg-white border border-brand-slate-200 rounded-2xl shadow-2xl z-20 overflow-hidden"
                  >
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                          <span className="bento-label flex items-center gap-2 text-brand-accent">
                            <Plus size={14} />
                            Property Onboarding
                          </span>
                          <button onClick={() => setShowAddProperty(false)} className="text-brand-slate-400 hover:text-brand-slate-900">
                            <X size={16} />
                          </button>
                        </div>
                        <form onSubmit={async (e) => {
                        await handleAddProperty(e);
                        setShowAddProperty(false);
                      }} className="space-y-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest">Property ID</label>
                          <input name="id" required className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-brand-slate-900 focus:bg-white outline-none" placeholder="AL001" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest">Internal Name</label>
                          <input name="name" required className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-brand-slate-900 focus:bg-white outline-none" placeholder="Main St Apartment" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest">Owner</label>
                            <input name="ownerName" required className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest">Email</label>
                            <input name="ownerEmail" type="email" required className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold" />
                          </div>
                        </div>

                        <button type="submit" className="w-full bg-brand-slate-900 text-white py-3 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-black transition-all shadow-lg">
                          Register Property
                        </button>
                      </form>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button 
            onClick={() => {
              if (selectedProperty) {
                fetchFees(selectedProperty.id);
                fetchRevenue(selectedProperty.id);
                fetchExpenses(selectedProperty.id);
                fetchPayments(selectedProperty.id);
                fetchOperations(selectedProperty.id);
                fetchProperties();
                setMessage({ type: 'success', text: 'Database synced and refreshed.' });
              } else {
                fetchProperties();
                setMessage({ type: 'success', text: 'Properties refreshed.' });
              }
            }}
            className="flex items-center gap-2 bg-brand-slate-100 text-brand-slate-600 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-brand-slate-900 hover:text-white transition-all shadow-sm"
          >
            <Clock size={14} />
            Sync
          </button>
          <div className="text-right hidden xl:block">
            <div className="text-[9px] font-black text-brand-slate-400 uppercase tracking-widest">Admin Control</div>
            <div className="text-[11px] font-bold text-brand-slate-900">{auth.currentUser?.email}</div>
          </div>
          <button onClick={handleLogout} className="w-10 h-10 rounded-full bg-brand-slate-50 flex items-center justify-center text-brand-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="max-w-none px-8 py-6 md:py-8">
        <div className="w-full">
          <AnimatePresence mode="wait">
            {selectedProperty ? (
              <motion.div
                key={selectedProperty.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Property Detail Header */}
                <div className="bento-card">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
                    <div className="w-full">
                      <div className="flex items-center justify-between mb-2">
                        <h1 className="text-2xl font-extrabold tracking-tight uppercase">{selectedProperty.name}</h1>
                        <button 
                          onClick={() => setSelectedProperty(null)}
                          className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-400 hover:text-brand-slate-900 flex items-center gap-1 bg-brand-slate-100 px-3 py-1.5 rounded-lg opacity-60 hover:opacity-100 transition-all"
                        >
                          <ChevronRight className="rotate-180" size={12} />
                          Back to Portfolio
                        </button>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5 bg-brand-slate-100 px-2 py-1 rounded-lg">
                          <Database size={10} className="text-brand-slate-500" />
                          <span className="text-[10px] font-bold text-brand-slate-600 uppercase font-mono tracking-tighter">{selectedProperty.id}</span>
                        </div>
                        <span className="text-[10px] font-bold text-brand-slate-400 uppercase tracking-widest">•</span>
                        <div className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest">Owner: {selectedProperty.ownerName}</div>
                        <button 
                          onClick={() => onViewAsOwner(selectedProperty)}
                          className="flex items-center gap-1.5 bg-brand-slate-900 text-white px-2 py-1 rounded-lg hover:bg-black transition-all"
                        >
                          <Eye size={10} />
                          <span className="text-[10px] font-bold uppercase tracking-tight">View Dashboard</span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="bg-brand-slate-900 p-5 rounded-2xl text-center min-w-[160px] shadow-xl shadow-brand-slate-900/20">
                      <div className="text-[9px] font-bold text-brand-slate-400 uppercase tracking-widest mb-1.5">Owner Access PIN</div>
                      <input 
                        type="text" 
                        defaultValue={selectedProperty.pin}
                        className="text-3xl font-mono font-bold text-white tracking-[0.2em] bg-transparent border-none text-center w-full focus:ring-0 outline-none"
                        onBlur={async (e) => {
                          const newPin = e.target.value;
                          if (newPin && newPin !== selectedProperty.pin) {
                            try {
                              await setDoc(doc(db, 'properties', selectedProperty.id), { ...selectedProperty, pin: newPin, updatedAt: Date.now() });
                              setMessage({ type: 'success', text: 'PIN updated successfully.' });
                            } catch (err) {
                              handleFirestoreError(err, OperationType.WRITE, `properties/${selectedProperty.id}`);
                            }
                          }
                        }}
                      />
                      <div className="mt-2 h-1 w-8 bg-brand-accent mx-auto rounded-full"></div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="bg-brand-slate-50 p-4 rounded-2xl border border-brand-slate-100">
                      <span className="bento-label text-[9px] opacity-60">Management Fee</span>
                      <div className="text-xl font-black text-brand-slate-800">{selectedProperty.managementFeePercent}%</div>
                    </div>
                    <div className="bg-brand-slate-50 p-4 rounded-2xl border border-brand-slate-100">
                      <span className="bento-label text-[9px] opacity-60">Fixed Surcharge</span>
                      <div className="text-xl font-black text-brand-slate-800">R{selectedProperty.managementFeeFixed}</div>
                    </div>
                    <div className="bg-brand-slate-50 p-4 rounded-2xl border border-brand-slate-100">
                      <span className="bento-label text-[9px] opacity-60">Last Data Sync</span>
                      <div className="text-[11px] font-bold text-brand-slate-700 mt-1 uppercase">{new Date(selectedProperty.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                    </div>
                  </div>

                  </div>

                {/* Navigation */}
                <div className="flex flex-col gap-4">
                  <div className="hidden lg:flex gap-1 bg-brand-slate-100 p-1 rounded-xl w-fit">
                    {[
                      { id: 'config', label: 'Info' },
                      { id: 'fees', label: 'Management Fees' },
                      { id: 'operations', label: 'Ops Center' },
                      { id: 'calendar', label: 'Calendar' },
                      { id: 'revenue', label: 'Revenue' },
                      { id: 'expenses', label: 'Expenses' },
                      { id: 'payments', label: 'Payments' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={cn(
                          "px-4 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-tight transition-all",
                          activeTab === tab.id 
                            ? "bg-white text-brand-slate-900 shadow-sm" 
                            : "text-brand-slate-500 hover:text-brand-slate-700"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="lg:hidden">
                    <select 
                      value={activeTab}
                      onChange={(e) => setActiveTab(e.target.value as any)}
                      className="w-full bg-brand-slate-100 border-none rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-widest text-brand-slate-900 outline-none"
                    >
                      <option value="config">Info</option>
                      <option value="fees">Management Fees</option>
                      <option value="operations">Ops Center</option>
                      <option value="calendar">Calendar</option>
                      <option value="revenue">Revenue</option>
                      <option value="expenses">Expenses</option>
                      <option value="payments">Payments</option>
                    </select>
                  </div>
                </div>

                {activeTab === 'config' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="bento-card">
                        <span className="bento-label mb-6 text-brand-accent">Property Information</span>
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.target as HTMLFormElement;
                          const title = (form.elements.namedItem('title') as HTMLInputElement).value;
                          const location = (form.elements.namedItem('location') as HTMLInputElement).value;
                          const description = (form.elements.namedItem('description') as HTMLTextAreaElement).value;
                          const imageUrl = (form.elements.namedItem('imageUrl') as HTMLInputElement).value;
                          
                          const updated = {
                            ...selectedProperty,
                            title,
                            location,
                            description,
                            imageUrl,
                            updatedAt: Date.now()
                          };
                          
                          try {
                            await setDoc(doc(db, 'properties', selectedProperty.id), updated);
                            setSelectedProperty(updated);
                            setMessage({ type: 'success', text: 'Property information updated' });
                          } catch (err) {
                            setMessage({ type: 'error', text: 'Failed to update property info' });
                          }
                        }} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Property Title</label>
                            <input name="title" defaultValue={selectedProperty.title || ''} type="text" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" placeholder="E.g. Beachside Villa" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Location</label>
                            <input name="location" defaultValue={selectedProperty.location || ''} type="text" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" placeholder="E.g. Cape Town, SA" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Image URL</label>
                            <input name="imageUrl" defaultValue={selectedProperty.imageUrl || ''} type="url" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" placeholder="https://..." />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Description</label>
                            <textarea name="description" defaultValue={selectedProperty.description || ''} rows={4} className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" placeholder="Property details..."></textarea>
                          </div>
                          <div className="pt-2">
                            <button type="submit" className="w-full py-3 bg-brand-slate-900 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-black transition-colors">
                              Save Information
                            </button>
                          </div>
                        </form>
                      </div>

                      <div className="bento-card">
                        <span className="bento-label mb-6 text-brand-accent">Resource Links & Documents</span>
                        <div className="space-y-6">
                          <form onSubmit={async (e) => {
                            e.preventDefault();
                            const form = e.target as HTMLFormElement;
                            const platform = (form.elements.namedItem('platform') as HTMLInputElement).value;
                            const url = (form.elements.namedItem('url') as HTMLInputElement).value;
                            if (!platform || !url) return;
                            
                            const newLinks = [...(selectedProperty.links || []), { platform, url }];
                            const updated = { ...selectedProperty, links: newLinks, updatedAt: Date.now() };
                            
                            try {
                              await setDoc(doc(db, 'properties', selectedProperty.id), updated);
                              setSelectedProperty(updated);
                              form.reset();
                            } catch (err) {
                              setMessage({ type: 'error', text: 'Failed to add link' });
                            }
                          }} className="flex gap-2">
                            <input required name="platform" type="text" className="flex-1 text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" placeholder="Title (e.g. Airbnb, Google Sheet)" />
                            <input required name="url" type="url" className="flex-[2] text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" placeholder="URL Link" />
                            <button type="submit" className="px-4 py-3 bg-brand-slate-100 text-brand-slate-900 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-brand-slate-200 transition-colors">Add</button>
                          </form>

                          <div className="space-y-2">
                            {(!selectedProperty.links || selectedProperty.links.length === 0) ? (
                              <div className="text-center py-6 text-xs font-bold uppercase tracking-widest text-brand-slate-400">No links or resources added</div>
                            ) : (
                              selectedProperty.links.map((link, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-brand-slate-100 bg-brand-slate-50/50">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-bold text-brand-slate-900">{link.platform}</span>
                                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-brand-slate-500 hover:text-brand-accent truncate max-w-[200px] sm:max-w-xs">{link.url}</a>
                                  </div>
                                  <button onClick={async () => {
                                    const newLinks = selectedProperty.links!.filter((_, i) => i !== idx);
                                    const updated = { ...selectedProperty, links: newLinks, updatedAt: Date.now() };
                                    try {
                                      await setDoc(doc(db, 'properties', selectedProperty.id), updated);
                                      setSelectedProperty(updated);
                                    } catch (err) {}
                                  }} className="p-2 text-brand-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="bento-card">
                        <span className="bento-label mb-6 text-brand-accent">Owner Information</span>
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.target as HTMLFormElement;
                          const ownerName = (form.elements.namedItem('ownerName') as HTMLInputElement).value;
                          const companyName = (form.elements.namedItem('companyName') as HTMLInputElement).value;
                          const ownerEmail = (form.elements.namedItem('ownerEmail') as HTMLInputElement).value;
                          const cellNumber = (form.elements.namedItem('cellNumber') as HTMLInputElement).value;
                          const vatNumber = (form.elements.namedItem('vatNumber') as HTMLInputElement).value;
                          
                          const updated = {
                            ...selectedProperty,
                            ownerName,
                            companyName,
                            ownerEmail,
                            cellNumber,
                            vatNumber,
                            updatedAt: Date.now()
                          };
                          
                          try {
                            await setDoc(doc(db, 'properties', selectedProperty.id), updated);
                            setSelectedProperty(updated);
                            setMessage({ type: 'success', text: 'Owner information updated' });
                          } catch (err) {
                            setMessage({ type: 'error', text: 'Failed to update owner info' });
                          }
                        }} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Owner Name</label>
                            <input name="ownerName" required defaultValue={selectedProperty.ownerName || ''} type="text" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Company Name (Optional)</label>
                            <input name="companyName" defaultValue={selectedProperty.companyName || ''} type="text" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Email Address</label>
                            <input name="ownerEmail" required defaultValue={selectedProperty.ownerEmail || ''} type="email" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">Cell Number</label>
                            <input name="cellNumber" defaultValue={selectedProperty.cellNumber || ''} type="text" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" placeholder="+27..." />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-slate-500">VAT Number</label>
                            <input name="vatNumber" defaultValue={selectedProperty.vatNumber || ''} type="text" className="w-full text-sm p-3 rounded-lg border border-brand-slate-200 focus:border-brand-accent focus:ring-1 focus:ring-brand-accent outline-none" />
                          </div>
                          <div className="pt-2">
                            <button type="submit" className="w-full py-3 bg-brand-slate-900 text-white rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-black transition-colors">
                              Save Owner Details
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'operations' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      <div className="lg:col-span-4 bento-card">
                        <span className="bento-label mb-6 text-brand-accent">Log Department Ticket</span>
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          const f = e.currentTarget;
                          const fd = new FormData(f);
                          const item: MaintenanceIssue = {
                            id: `m_${Date.now()}`,
                            propertyId: selectedProperty!.id,
                            title: fd.get('title') as string,
                            description: fd.get('description') as string,
                            category: fd.get('category') as any,
                            priority: fd.get('priority') as any,
                            status: 'open',
                            date: new Date().toISOString().split('T')[0],
                            updatedAt: Date.now()
                          };
                          await setDoc(doc(db, 'maintenance', item.id), item);
                          fetchOperations(selectedProperty!.id);
                          f.reset();
                        }} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest pl-1">Ticket Title</label>
                            <input name="title" required placeholder="Short summary" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest pl-1">Details</label>
                            <textarea name="description" placeholder="Provide full context..." className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold min-h-[80px]" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest pl-1">Category</label>
                              <select name="category" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold font-black uppercase">
                                <option value="maintenance">Maintenance</option>
                                <option value="cleaning">Cleaning</option>
                                <option value="block-request">Date Block</option>
                                <option value="general">General</option>
                                <option value="other">Other</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest pl-1">Priority</label>
                              <select name="priority" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold font-black uppercase">
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                                <option value="urgent">Urgent</option>
                              </select>
                            </div>
                          </div>
                          <button type="submit" className="w-full bg-brand-slate-900 text-white py-3 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-black transition-all">Submit Ticket</button>
                        </form>
                      </div>

                      <div className="lg:col-span-8 bento-card p-0 whitespace-normal overflow-hidden">
                        <div className="p-4 border-b border-brand-slate-100 flex justify-between items-center">
                          <span className="bento-label">Ticket Tracker</span>
                          <span className="text-[10px] font-bold text-brand-slate-400 uppercase tracking-widest">{maintenance.length} Active Request(s)</span>
                        </div>
                        <div className="divide-y divide-brand-slate-50 overflow-y-auto max-h-[600px]">
                          {maintenance.length === 0 ? (
                            <div className="p-12 text-center text-brand-slate-400">
                              <CheckCircle size={32} className="mx-auto mb-4 text-green-500 opacity-20" />
                              <p className="text-[10px] font-black uppercase tracking-widest">No Active Portfolio Tickets</p>
                            </div>
                          ) : (
                            maintenance.map(m => (
                              <div key={m.id} className="p-6 hover:bg-brand-slate-50 transition-all group">
                                <div className="flex flex-col md:flex-row gap-6">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <span className={cn(
                                        "text-[8px] font-black uppercase px-2 py-1 rounded text-white tracking-widest",
                                        m.priority === 'urgent' ? "bg-red-600 shadow-lg shadow-red-500/20" : 
                                        m.priority === 'high' ? "bg-amber-600" : 
                                        m.priority === 'medium' ? "bg-blue-600" : "bg-brand-slate-400"
                                      )}>
                                        {m.priority}
                                      </span>
                                      <span className="text-[9px] font-black uppercase text-brand-slate-400 border border-brand-slate-200 px-2 py-0.5 rounded tracking-tighter">
                                        {m.category || 'General'}
                                      </span>
                                      <h3 className="font-black text-brand-slate-900 uppercase tracking-tight text-sm">{m.title}</h3>
                                    </div>
                                    <p className="text-xs text-brand-slate-500 mb-4 leading-relaxed">{m.description}</p>
                                    
                                    <div className="bg-brand-slate-100/50 p-4 rounded-xl mb-4 border border-brand-slate-200/50">
                                       <div className="text-[9px] font-black uppercase text-brand-slate-400 mb-2 tracking-widest">Owner-Facing Updates</div>
                                       <textarea 
                                         defaultValue={m.notes}
                                         onBlur={(e) => handleUpdateMaintenance(m.id, { notes: e.target.value })}
                                         placeholder="Add comments or status updates..."
                                         className="w-full bg-transparent border-0 text-xs font-bold text-brand-slate-700 outline-none resize-none min-h-[60px]"
                                       />
                                    </div>

                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-4 text-[10px] font-bold text-brand-slate-400 uppercase tracking-tighter">
                                        <span>Logged: {m.date}</span>
                                        <span>•</span>
                                        <div className="flex items-center gap-2">
                                          <label className="text-[8px] font-black uppercase text-brand-slate-300">Status</label>
                                          <select 
                                            value={m.status}
                                            onChange={(e) => handleUpdateMaintenance(m.id, { status: e.target.value as any })}
                                            className="bg-brand-slate-100 px-2 py-1 rounded border-0 text-[10px] font-black uppercase cursor-pointer"
                                          >
                                            <option value="open">Open</option>
                                            <option value="fixing">Fixing</option>
                                            <option value="resolved">Resolved</option>
                                            <option value="deferred">Deferred</option>
                                          </select>
                                        </div>
                                      </div>
                                       <div className="flex items-center gap-2">
                                          <button 
                                           onClick={() => handleDeleteMaintenance(m.id)}
                                           className={cn(
                                             "p-2 rounded-lg transition-all relative group",
                                             deleteConfirmId === m.id 
                                               ? "text-white bg-red-600 scale-110 shadow-lg shadow-red-500/40" 
                                               : "text-red-400 hover:text-red-600 hover:bg-red-50"
                                           )}
                                           title={deleteConfirmId === m.id ? "Click again to confirm delete" : "Delete Ticket"}
                                          >
                                           <Trash2 size={16} />
                                           {deleteConfirmId === m.id && (
                                             <motion.div 
                                               layoutId="confirm-hint-maint"
                                               className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] font-black uppercase px-2 py-1 rounded whitespace-nowrap"
                                             >
                                               Confirm?
                                             </motion.div>
                                           )}
                                          </button>
                                       </div>
                                    </div>
                                  </div>
                                  
                                  <div className="w-full md:w-48 space-y-4">
                                     <div className="space-y-1">
                                       <label className="text-[9px] font-black text-brand-slate-400 uppercase tracking-widest pl-1">Category</label>
                                       <select 
                                         value={m.category || 'general'}
                                         onChange={(e) => handleUpdateMaintenance(m.id, { category: e.target.value as any })}
                                         className="w-full bg-brand-slate-100 px-3 py-2 rounded-xl border-0 text-xs font-bold uppercase"
                                       >
                                         <option value="maintenance">Maintenance</option>
                                         <option value="cleaning">Cleaning</option>
                                         <option value="block-request">Date Block</option>
                                         <option value="general">General</option>
                                         <option value="other">Other</option>
                                       </select>
                                     </div>
                                     <div className="space-y-1">
                                       <label className="text-[9px] font-black text-brand-slate-400 uppercase tracking-widest pl-1">Priority</label>
                                       <select 
                                         value={m.priority}
                                         onChange={(e) => handleUpdateMaintenance(m.id, { priority: e.target.value as any })}
                                         className="w-full bg-brand-slate-100 px-3 py-2 rounded-xl border-0 text-xs font-bold uppercase"
                                       >
                                         <option value="low">Low</option>
                                         <option value="medium">Medium</option>
                                         <option value="high">High</option>
                                         <option value="urgent">Urgent</option>
                                       </select>
                                     </div>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'calendar' && (
                  <div className="space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <h2 className="text-xl font-bold uppercase tracking-tight">Booking Calendar</h2>
                      <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-brand-slate-200">
                        <button 
                          onClick={() => setCalendarMonth(prev => subMonths(prev, 1))}
                          className="p-1 hover:bg-brand-slate-100 rounded-lg text-brand-slate-500 transition-colors"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <div className="text-sm font-black uppercase tracking-widest text-brand-slate-900 w-32 text-center">
                          {dateFnsFormat(calendarMonth, 'MMMM yyyy')}
                        </div>
                        <button 
                          onClick={() => setCalendarMonth(prev => addMonths(prev, 1))}
                          className="p-1 hover:bg-brand-slate-100 rounded-lg text-brand-slate-500 transition-colors"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </div>

                    <div className="bento-card p-0 overflow-hidden bg-brand-slate-50 border border-brand-slate-200">
                      <div className="grid grid-cols-7 border-b border-brand-slate-200 bg-white">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                          <div key={day} className="py-3 text-center text-[10px] font-black uppercase tracking-widest text-brand-slate-400 border-r border-brand-slate-100 last:border-0">
                            {day}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-px bg-brand-slate-200">
                        {eachDayOfInterval({
                          start: startOfWeek(calendarMonth),
                          end: endOfWeek(endOfMonth(calendarMonth))
                        }).map((day, idx) => {
                          const isCurrentMonth = isSameMonth(day, calendarMonth);
                          
                          const dayBookings = revenue.filter(r => {
                            const start = dateFnsParseISO(r.paymentDate);
                            const end = addDays(start, r.nights || 1); 
                            return day >= start && day < end;
                          });

                          return (
                            <div 
                              key={idx} 
                              className={cn(
                                "min-h-[100px] sm:min-h-[140px] bg-white p-1 sm:p-2 flex flex-col",
                                !isCurrentMonth && "bg-brand-slate-50/80 text-brand-slate-300"
                              )}
                            >
                              <span className={cn(
                                "text-xs font-bold mb-1 sm:mb-2",
                                isSameDay(day, new Date()) ? "w-6 h-6 rounded-full bg-brand-accent text-white flex items-center justify-center text-[10px] shadow-sm ml-1 mt-1" : "ml-1"
                              )}>
                                {dateFnsFormat(day, 'd')}
                              </span>
                              <div className="flex-1 space-y-1 overflow-y-auto no-scrollbar">
                                {dayBookings.map((b, i) => {
                                  const start = dateFnsParseISO(b.paymentDate);
                                  const isStart = isSameDay(day, start);
                                  const end = addDays(start, b.nights || 1);
                                  const isEnd = isSameDay(addDays(day, 1), end);
                                  
                                  let platformColor = "bg-blue-50 text-blue-700 border-blue-200";
                                  if (b.platform?.toLowerCase().includes('airbnb')) {
                                    platformColor = "bg-pink-50 text-pink-700 border-pink-200";
                                  } else if (b.platform?.toLowerCase().includes('direct')) {
                                    platformColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                  }

                                  return (
                                    <div 
                                      key={`${b.id}-${i}`} 
                                      className={cn(
                                        "px-1.5 py-1 text-[9px] font-bold truncate leading-tight border-b sm:border border-transparent relative z-10",
                                        platformColor,
                                        isStart ? "sm:rounded-l-md sm:ml-1" : "sm:border-l-0 -ml-2",
                                        isEnd ? "sm:border-r sm:rounded-r-md sm:mr-1" : "sm:border-r-0 -mr-2"
                                      )}
                                      title={`${b.guest} (${b.platform}) - ${b.nights || 1} nights`}
                                    >
                                      {(isStart || day.getDay() === 0) && (
                                        <span className="uppercase tracking-tight whitespace-nowrap">
                                          {b.guest} <span className="opacity-70 font-medium">({b.platform})</span>
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'revenue' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 space-y-6">
                      <div className="bento-card">
                        <span className="bento-label mb-4 flex items-center gap-2">
                          <Upload size={14} className="text-brand-accent" />
                          CSV Upload
                        </span>
                        <label className="w-full cursor-pointer bg-brand-slate-100 py-3 rounded-xl text-brand-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-brand-slate-200 transition-all flex items-center justify-center gap-2">
                          <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, 'revenue')} />
                          <Upload size={14} /> Import CSV
                        </label>
                      </div>
                      <div className="bento-card">
                        <span className="bento-label mb-6">Manual Entry</span>
                        <form onSubmit={handleAddRevenue} className="space-y-4">
                          <input name="guest" required placeholder="Guest Name" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          <div className="grid grid-cols-2 gap-2">
                            <input name="platform" required placeholder="Platform (Airbnb...)" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                            <input name="nights" type="number" required placeholder="Nights" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input name="gross" type="number" step="0.01" required placeholder="Gross" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                            <input name="fees" type="number" step="0.01" required placeholder="Fees" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          </div>
                          <input name="date" type="date" required className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          <button type="submit" className="w-full bg-brand-slate-900 text-white py-2.5 rounded-xl font-bold uppercase text-[10px]">Add Record</button>
                        </form>
                      </div>
                    </div>
                    <div className="lg:col-span-8 bento-card p-0 overflow-hidden">
                      <div className="p-4 border-b border-brand-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <span className="bento-label">Revenue Ledger</span>
                          {selectedIds.size > 0 && (
                            <button 
                              onClick={handleBulkDelete}
                              className={cn(
                                "px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-tight flex items-center gap-1.5 transition-all shadow-lg",
                                bulkDeleteConfirm 
                                  ? "bg-amber-600 text-white shadow-amber-500/20 scale-105" 
                                  : "bg-red-600 text-white shadow-red-500/20 hover:bg-red-700"
                              )}
                            >
                              <Trash2 size={14} /> 
                              {bulkDeleteConfirm ? "Delete All Selected?" : `Delete Selected (${selectedIds.size})`}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => {
                              const csvData = sortedRevenue.map(log => ({
                                Date: log.paymentDate,
                                Guest: log.guest,
                                Platform: log.platform,
                                Gross: log.gross,
                                Fees: log.fees,
                                Net: log.gross - log.fees
                              }));
                              exportToCSV(csvData, `revenue-${selectedProperty.id}`);
                            }}
                            className="text-[10px] font-bold text-brand-slate-500 hover:text-brand-slate-900 border border-brand-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 uppercase tracking-widest transition-colors"
                          >
                            <FileText size={12} /> Export
                          </button>
                          <span className="text-[10px] font-bold text-brand-slate-400">{revenue.length} items</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-[500px]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-brand-slate-50 border-b border-brand-slate-100 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 w-10">
                                <input 
                                  type="checkbox" 
                                  className="rounded"
                                  checked={revenue.length > 0 && revenue.every(r => selectedIds.has(r.id))}
                                  onChange={() => toggleSelectAll(sortedRevenue.map(r => r.id))}
                                />
                              </th>
                              <th 
                                onClick={() => toggleRevSort('paymentDate')} 
                                className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                              >
                                Date {revSortField === 'paymentDate' ? (revSortDirection === 'asc' ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => toggleRevSort('guest')} 
                                className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                              >
                                Guest / Platform {revSortField === 'guest' ? (revSortDirection === 'asc' ? '▲' : '▼') : ''}
                              </th>
                              <th className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 text-center">Nights</th>
                              <th 
                                onClick={() => toggleRevSort('gross')} 
                                className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 text-right cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                              >
                                Gross {revSortField === 'gross' ? (revSortDirection === 'asc' ? '▲' : '▼') : ''}
                              </th>
                              <th className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 text-right"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-slate-50">
                            {sortedRevenue.map(r => {
                              const isEditing = editingId === r.id;
                              return (
                                <tr key={r.id} className={cn("hover:bg-brand-slate-50/50", (selectedIds.has(r.id) || isEditing) && "bg-brand-slate-50")}>
                                  <td className="px-4 py-3">
                                    <input 
                                      type="checkbox" 
                                      className="rounded" 
                                      checked={selectedIds.has(r.id)}
                                      onChange={() => toggleSelect(r.id)}
                                    />
                                  </td>
                                  <td className="px-4 py-3 font-bold text-brand-slate-500">
                                    {isEditing ? (
                                      <input 
                                        type="date" 
                                        defaultValue={r.paymentDate}
                                        className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-full"
                                        onBlur={(e) => handleUpdateRevenue(r.id, { paymentDate: e.target.value })}
                                      />
                                    ) : (r.paymentDate ? format(parseISO(r.paymentDate), 'MMM dd, yyyy') : '-')}
                                  </td>
                                  <td className="px-4 py-3">
                                    {isEditing ? (
                                      <div className="space-y-1">
                                        <input 
                                          defaultValue={r.guest}
                                          className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-full font-bold"
                                          onBlur={(e) => handleUpdateRevenue(r.id, { guest: e.target.value })}
                                        />
                                        <input 
                                          defaultValue={r.platform}
                                          className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[9px] w-full"
                                          onBlur={(e) => handleUpdateRevenue(r.id, { platform: e.target.value })}
                                        />
                                      </div>
                                    ) : (
                                      <>
                                        <div className="font-bold text-brand-slate-900 uppercase tracking-tight">{r.guest}</div>
                                        <div className="text-[9px] text-brand-slate-400 font-bold">{r.platform}</div>
                                      </>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-center text-[10px] font-bold">
                                    {isEditing ? (
                                      <input 
                                        type="number" 
                                        defaultValue={r.nights || 0}
                                        className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-12 text-center"
                                        onBlur={(e) => handleUpdateRevenue(r.id, { nights: parseInt(e.target.value) || 0 })}
                                      />
                                    ) : (
                                      <div className="text-brand-slate-700">{r.nights || 0} nts</div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right font-black">
                                    {isEditing ? (
                                      <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-1">
                                          <span className="text-[8px] text-brand-slate-400">GROSS:</span>
                                          <input 
                                            type="number" 
                                            step="0.01"
                                            defaultValue={r.gross}
                                            className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-20 text-right"
                                            onBlur={(e) => handleUpdateRevenue(r.id, { gross: parseFloat(e.target.value) })}
                                          />
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <span className="text-[8px] text-brand-slate-400">FEES:</span>
                                          <input 
                                            type="number" 
                                            step="0.01"
                                            defaultValue={r.fees}
                                            className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-20 text-right text-red-500"
                                            onBlur={(e) => handleUpdateRevenue(r.id, { fees: parseFloat(e.target.value) })}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div>R{r.gross}</div>
                                        <div className="text-[9px] text-brand-slate-400 font-bold">-R{r.fees}</div>
                                      </>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-1">
                                      <button 
                                        onClick={() => setEditingId(isEditing ? null : r.id)}
                                        className={cn(
                                          "p-2 rounded-lg transition-all",
                                          isEditing ? "text-green-600 bg-green-50" : "text-brand-slate-300 hover:text-brand-slate-900 hover:bg-brand-slate-100"
                                        )}
                                      >
                                        {isEditing ? <Check size={16} /> : <Pencil size={16} />}
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteRevenue(r.id)} 
                                        className={cn(
                                          "p-2 rounded-lg transition-all relative group",
                                          deleteConfirmId === r.id 
                                            ? "text-white bg-red-600 scale-110 shadow-lg shadow-red-500/40" 
                                            : "text-red-400 hover:text-red-600 hover:bg-red-50"
                                        )}
                                        title={deleteConfirmId === r.id ? "Click again to confirm delete" : "Delete Record"}
                                      >
                                        <Trash2 size={16}/>
                                        {deleteConfirmId === r.id && (
                                          <motion.div 
                                            layoutId="confirm-hint"
                                            className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] font-black uppercase px-2 py-1 rounded whitespace-nowrap"
                                          >
                                            Confirm?
                                          </motion.div>
                                        )}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'expenses' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 space-y-6">
                      <div className="bento-card">
                        <span className="bento-label mb-4 flex items-center gap-2 text-red-500">
                          <Upload size={14}/> CSV Upload
                        </span>
                        <label className="w-full cursor-pointer bg-brand-slate-100 py-3 rounded-xl text-brand-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-brand-slate-200 transition-all flex items-center justify-center gap-2">
                          <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, 'expense')} />
                          <Upload size={14} /> Import CSV
                        </label>
                      </div>
                      <div className="bento-card">
                        <span className="bento-label mb-6 text-red-500">Manual Entry</span>
                        <form onSubmit={handleAddExpense} className="space-y-4">
                          <input name="description" required placeholder="Description" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          <input name="category" list="categories" required placeholder="Category (e.g. Maintenance)" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          <datalist id="categories">
                            <option value="Maintenance" />
                            <option value="Utilities" />
                            <option value="Repairs" />
                            <option value="Cleaning" />
                            <option value="Insurance" />
                            <option value="Other" />
                          </datalist>
                          <input name="amount" type="number" step="0.01" required placeholder="Amount" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          <input name="date" type="date" required className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          <label className="flex items-center gap-2 px-2 pb-2">
                            <input name="reimbursable" type="checkbox" className="rounded" />
                            <span className="text-[10px] font-bold uppercase text-brand-slate-500">Reimbursable by Owner</span>
                          </label>
                          <button type="submit" className="w-full bg-brand-slate-900 text-white py-2.5 rounded-xl font-bold uppercase text-[10px]">Add Record</button>
                        </form>
                      </div>
                    </div>
                    <div className="lg:col-span-8 bento-card p-0 overflow-hidden">
                      <div className="p-4 border-b border-brand-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <span className="bento-label text-red-600">Expenses Ledger</span>
                          {selectedIds.size > 0 && (
                            <button 
                              onClick={handleBulkDelete}
                              className={cn(
                                "px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-tight flex items-center gap-1.5 transition-all shadow-lg",
                                bulkDeleteConfirm 
                                  ? "bg-amber-600 text-white shadow-amber-500/20 scale-105" 
                                  : "bg-red-600 text-white shadow-red-500/20 hover:bg-red-700"
                              )}
                            >
                              <Trash2 size={14} /> 
                              {bulkDeleteConfirm ? "Click to Confirm" : `Delete Selected (${selectedIds.size})`}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => {
                              const csvData = sortedExpenses.map(log => ({
                                Date: log.date,
                                Description: log.description,
                                Category: log.category,
                                Supplier: log.supplier,
                                Amount: log.amount,
                                Reimbursable: log.reimbursable ? 'Yes' : 'No'
                              }));
                              exportToCSV(csvData, `expenses-${selectedProperty.id}`);
                            }}
                            className="text-[10px] font-bold text-brand-slate-500 hover:text-brand-slate-900 border border-brand-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 uppercase tracking-widest transition-colors"
                          >
                            <FileText size={12} /> Export
                          </button>
                          <span className="text-[10px] font-bold text-brand-slate-400">{expenses.length} items</span>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-[500px]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-brand-slate-50 border-b border-brand-slate-100 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 w-10">
                                <input 
                                  type="checkbox" 
                                  className="rounded"
                                  checked={expenses.length > 0 && expenses.every(e => selectedIds.has(e.id))}
                                  onChange={() => toggleSelectAll(sortedExpenses.map(e => e.id))}
                                />
                              </th>
                              <th 
                                onClick={() => toggleExpSort('date')} 
                                className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                              >
                                Date {expSortField === 'date' ? (expSortDirection === 'asc' ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => toggleExpSort('description')} 
                                className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                              >
                                Description {expSortField === 'description' ? (expSortDirection === 'asc' ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => toggleExpSort('amount')} 
                                className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 text-right cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                              >
                                Amount {expSortField === 'amount' ? (expSortDirection === 'asc' ? '▲' : '▼') : ''}
                              </th>
                              <th className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 text-right"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-slate-50">
                            {sortedExpenses.map(e => {
                              const isEditing = editingId === e.id;
                              return (
                                <tr key={e.id} className={cn("hover:bg-brand-slate-50/50", (selectedIds.has(e.id) || isEditing) && "bg-brand-slate-50")}>
                                  <td className="px-4 py-3">
                                    <input 
                                      type="checkbox" 
                                      className="rounded" 
                                      checked={selectedIds.has(e.id)}
                                      onChange={() => toggleSelect(e.id)}
                                    />
                                  </td>
                                  <td className="px-4 py-3 font-bold text-brand-slate-500">
                                    {isEditing ? (
                                      <input 
                                        type="date" 
                                        defaultValue={e.date}
                                        className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-full"
                                        onBlur={(val) => handleUpdateExpense(e.id, { date: val.target.value })}
                                      />
                                    ) : (e.date ? format(parseISO(e.date), 'MMM dd, yyyy') : '-')}
                                  </td>
                                  <td className="px-4 py-3">
                                    {isEditing ? (
                                      <div className="space-y-1">
                                        <input 
                                          defaultValue={e.description}
                                          className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-full font-bold"
                                          onBlur={(val) => handleUpdateExpense(e.id, { description: val.target.value })}
                                        />
                                        <div className="flex gap-2">
                                          <select 
                                            defaultValue={e.category}
                                            className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[9px]"
                                            onBlur={(val) => handleUpdateExpense(e.id, { category: val.target.value })}
                                          >
                                            <option>Maintenance</option>
                                            <option>Utilities</option>
                                            <option>Repairs</option>
                                            <option>Other</option>
                                          </select>
                                          <label className="flex items-center gap-1 text-[9px] font-bold text-brand-slate-400">
                                            <input 
                                              type="checkbox" 
                                              defaultChecked={e.reimbursable}
                                              onChange={(val) => handleUpdateExpense(e.id, { reimbursable: val.target.checked })}
                                            />
                                            REIMB
                                          </label>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="font-bold text-brand-slate-900 uppercase tracking-tight">{e.description}</div>
                                        <div className="flex items-center gap-2">
                                          <span className="text-[9px] text-brand-slate-400 font-bold uppercase">{e.category}</span>
                                          {e.reimbursable && <span className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded uppercase font-black">REIMBURSABLE</span>}
                                        </div>
                                      </>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right font-black text-red-600">
                                    {isEditing ? (
                                      <input 
                                        type="number" 
                                        step="0.01"
                                        defaultValue={e.amount}
                                        className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-20 text-right font-black text-red-600"
                                        onBlur={(val) => handleUpdateExpense(e.id, { amount: parseFloat(val.target.value) })}
                                      />
                                    ) : `R${e.amount}`}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-1">
                                      <button 
                                        onClick={() => setEditingId(isEditing ? null : e.id)}
                                        className={cn(
                                          "p-2 rounded-lg transition-all",
                                          isEditing ? "text-green-600 bg-green-50" : "text-brand-slate-300 hover:text-brand-slate-900 hover:bg-brand-slate-100"
                                        )}
                                      >
                                        {isEditing ? <Check size={16} /> : <Pencil size={16} />}
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteExpense(e.id)} 
                                        className={cn(
                                          "p-2 rounded-lg transition-all relative group",
                                          deleteConfirmId === e.id 
                                            ? "text-white bg-red-600 scale-110 shadow-lg shadow-red-500/40" 
                                            : "text-red-400 hover:text-red-600 hover:bg-red-50"
                                        )}
                                        title={deleteConfirmId === e.id ? "Click again to confirm delete" : "Delete Expense"}
                                      >
                                        <Trash2 size={16}/>
                                        {deleteConfirmId === e.id && (
                                          <motion.div 
                                            layoutId="confirm-hint-exp"
                                            className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] font-black uppercase px-2 py-1 rounded whitespace-nowrap"
                                          >
                                            Confirm?
                                          </motion.div>
                                        )}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'payments' && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-4 space-y-6">
                      <div className="bento-card">
                        <span className="bento-label mb-4 flex items-center gap-2 text-green-600">
                          <CreditCard size={14}/> CSV Upload
                        </span>
                        <label className="w-full cursor-pointer bg-brand-slate-100 py-3 rounded-xl text-brand-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-brand-slate-200 transition-all flex items-center justify-center gap-2">
                          <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, 'payment')} />
                          <Upload size={14} /> Import CSV
                        </label>
                      </div>
                      <div className="bento-card">
                        <span className="bento-label mb-6 text-green-600">Manual Entry</span>
                        <form onSubmit={handleAddPayment} className="space-y-4">
                          <input name="description" placeholder="Payment Reference / Memo" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          <input name="amount" type="number" step="0.01" required placeholder="Amount Paid" className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          <input name="date" type="date" required className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" />
                          <button type="submit" className="w-full bg-brand-slate-900 text-white py-2.5 rounded-xl font-bold uppercase text-[10px]">Add Payment</button>
                        </form>
                      </div>
                    </div>
                    <div className="lg:col-span-8 bento-card p-0 overflow-hidden">
                      <div className="p-4 border-b border-brand-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <span className="bento-label text-green-600">Payment Ledger</span>
                          {selectedIds.size > 0 && (
                            <button 
                              onClick={handleBulkDelete}
                              className={cn(
                                "px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-tight flex items-center gap-1.5 transition-all shadow-lg",
                                bulkDeleteConfirm 
                                  ? "bg-amber-600 text-white shadow-amber-500/20 scale-105" 
                                  : "bg-red-600 text-white shadow-red-500/20 hover:bg-red-700"
                              )}
                            >
                              <Trash2 size={14} /> 
                              {bulkDeleteConfirm ? "Confirm Bulk Delete" : `Delete Selected (${selectedIds.size})`}
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-brand-slate-400">{payments.length} items</span>
                      </div>
                      <div className="overflow-x-auto max-h-[500px]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-brand-slate-50 border-b border-brand-slate-100 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 w-10">
                                <input 
                                  type="checkbox" 
                                  className="rounded"
                                  checked={payments.length > 0 && payments.every(p => selectedIds.has(p.id))}
                                  onChange={() => toggleSelectAll(sortedPayments.map(p => p.id))}
                                />
                              </th>
                              <th 
                                onClick={() => togglePaySort('date')} 
                                className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                              >
                                Date {paySortField === 'date' ? (paySortDirection === 'asc' ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => togglePaySort('description')} 
                                className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                              >
                                Description {paySortField === 'description' ? (paySortDirection === 'asc' ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => togglePaySort('amount')} 
                                className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 text-right cursor-pointer select-none hover:text-brand-slate-900 transition-colors"
                              >
                                Amount {paySortField === 'amount' ? (paySortDirection === 'asc' ? '▲' : '▼') : ''}
                              </th>
                              <th className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 text-right"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-slate-50">
                            {sortedPayments.map(p => {
                              const isEditing = editingId === p.id;
                              return (
                                <tr key={p.id} className={cn("hover:bg-brand-slate-50/50", (selectedIds.has(p.id) || isEditing) && "bg-brand-slate-50")}>
                                  <td className="px-4 py-3">
                                    <input 
                                      type="checkbox" 
                                      className="rounded" 
                                      checked={selectedIds.has(p.id)}
                                      onChange={() => toggleSelect(p.id)}
                                    />
                                  </td>
                                  <td className="px-4 py-3 font-bold text-brand-slate-500">
                                    {isEditing ? (
                                      <input 
                                        type="date" 
                                        defaultValue={p.date}
                                        className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-full font-bold"
                                        onBlur={(e) => handleUpdatePayment(p.id, { date: e.target.value })}
                                      />
                                    ) : (p.date ? format(parseISO(p.date), 'MMM dd, yyyy') : '-')}
                                  </td>
                                  <td className="px-4 py-3">
                                    {isEditing ? (
                                      <input 
                                        defaultValue={p.description}
                                        className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-full font-bold"
                                        onBlur={(e) => handleUpdatePayment(p.id, { description: e.target.value })}
                                      />
                                    ) : (
                                      <div className="font-bold text-brand-slate-900 uppercase tracking-tight line-clamp-1">{p.description}</div>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right font-black text-green-600">
                                    {isEditing ? (
                                      <input 
                                        type="number" 
                                        step="0.01"
                                        defaultValue={p.amount}
                                        className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-24 text-right font-black text-green-600"
                                        onBlur={(e) => handleUpdatePayment(p.id, { amount: parseFloat(e.target.value) })}
                                      />
                                    ) : `R${p.amount}`}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex justify-end gap-1">
                                      <button 
                                        onClick={() => setEditingId(isEditing ? null : p.id)}
                                        className={cn(
                                          "p-2 rounded-lg transition-all",
                                          isEditing ? "text-green-600 bg-green-50" : "text-brand-slate-300 hover:text-brand-slate-900 hover:bg-brand-slate-100"
                                        )}
                                      >
                                        {isEditing ? <Check size={16} /> : <Pencil size={16} />}
                                      </button>
                                      <button 
                                        onClick={() => handleDeletePayment(p.id)} 
                                        className={cn(
                                          "p-2 rounded-lg transition-all relative group",
                                          deleteConfirmId === p.id 
                                            ? "text-white bg-red-600 scale-110 shadow-lg shadow-red-500/40" 
                                            : "text-red-400 hover:text-red-600 hover:bg-red-50"
                                        )}
                                        title={deleteConfirmId === p.id ? "Click again to confirm delete" : "Delete Payment"}
                                      >
                                        <Trash2 size={16}/>
                                        {deleteConfirmId === p.id && (
                                          <motion.div 
                                            layoutId="confirm-hint-pay"
                                            className="absolute -top-8 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[8px] font-black uppercase px-2 py-1 rounded whitespace-nowrap"
                                          >
                                            Confirm?
                                          </motion.div>
                                        )}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'fees' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                       <h2 className="text-xl font-bold uppercase tracking-tight">Management Fees & Adjustments</h2>
                       <div className="flex gap-2">
                         <button 
                           onClick={() => setFeeView('individual')} 
                           className={cn("px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all", feeView === 'individual' ? "bg-brand-slate-900 text-white" : "bg-white text-brand-slate-400 border border-brand-slate-200")}
                         >
                           Individual Entry
                         </button>
                         <button 
                           onClick={() => setFeeView('spreadsheet')} 
                           className={cn("px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all", feeView === 'spreadsheet' ? "bg-brand-slate-900 text-white" : "bg-white text-brand-slate-400 border border-brand-slate-200")}
                         >
                           Spreadsheet Mode
                         </button>
                       </div>
                    </div>

                    {feeView === 'individual' ? (
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-4 space-y-6">
                          <div className="bento-card">
                            <span className="bento-label mb-4">Base Management Config</span>
                            <form onSubmit={handleUpdateManagementConfig} className="space-y-4">
                               <div className="space-y-1">
                                 <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest">Management Fee %</label>
                                 <input 
                                  name="feePercent" 
                                  type="number" 
                                  step="0.1" 
                                  defaultValue={selectedProperty.managementFeePercent}
                                  className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" 
                                 />
                               </div>
                               <div className="space-y-1">
                                 <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest">Fixed Surcharge</label>
                                 <input 
                                  name="feeFixed" 
                                  type="number" 
                                  step="1" 
                                  defaultValue={selectedProperty.managementFeeFixed}
                                  className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2 text-xs font-bold" 
                                 />
                               </div>
                               <button type="submit" className="w-full bg-brand-slate-900 text-white py-2.5 rounded-xl font-bold uppercase text-[10px]">Update Config</button>
                            </form>
                          </div>

                          <div className="bento-card">
                            <span className="bento-label mb-6 flex items-center gap-2 text-brand-accent">
                              <Plus size={14} />
                              Add Individual Fee
                            </span>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-brand-slate-100 rounded-xl mb-4">
                              <button 
                                type="button" 
                                onClick={() => setEntryFeeType('fixed')}
                                className={cn("py-2 rounded-lg text-[10px] font-black uppercase transition-all", entryFeeType === 'fixed' ? "bg-white shadow-sm text-brand-slate-900" : "text-brand-slate-400")}
                              >
                                Fixed Fee
                              </button>
                              <button 
                                type="button" 
                                onClick={() => setEntryFeeType('percent')}
                                className={cn("py-2 rounded-lg text-[10px] font-black uppercase transition-all", entryFeeType === 'percent' ? "bg-white shadow-sm text-brand-slate-900" : "text-brand-slate-400")}
                              >
                                % of Gross
                              </button>
                            </div>
                            <form onSubmit={handleAddFee} className="space-y-4">
                              <input type="hidden" name="feeType" value={entryFeeType} />
                              <div>
                                <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest">{entryFeeType === 'fixed' ? 'Amount' : 'Percentage (%)'}</label>
                                <input name="amount" type="number" step="0.01" required className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-brand-slate-900 focus:bg-white outline-none" placeholder={entryFeeType === 'fixed' ? "0.00" : "15"} />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest">Description</label>
                                <input name="description" required className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-brand-slate-900 focus:bg-white outline-none" placeholder={entryFeeType === 'fixed' ? "e.g. Special Maintenance Fee" : "e.g. Mgmt Fee Override"} />
                              </div>
                              <div>
                                 <label className="text-[10px] font-bold text-brand-slate-500 uppercase tracking-widest">Billing Month</label>
                                 <input name="date" type="date" required className="w-full bg-brand-slate-50 border border-brand-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-brand-slate-900 focus:bg-white outline-none" />
                              </div>
                              <button type="submit" className="w-full bg-brand-slate-900 text-white py-3 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-black transition-all shadow-lg shadow-brand-slate-900/10">
                                Add Fee
                              </button>
                            </form>
                          </div>
                        </div>
                    
                    <div className="lg:col-span-8 bento-card p-0 overflow-hidden">
                      <div className="p-4 border-b border-brand-slate-100 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <span className="bento-label">Recorded Monthly Fees</span>
                          {selectedIds.size > 0 && (
                            <button 
                              onClick={handleBulkDelete}
                              className={cn(
                                "px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-tight flex items-center gap-1.5 transition-all shadow-lg",
                                bulkDeleteConfirm 
                                  ? "bg-amber-600 text-white shadow-amber-500/20 scale-105" 
                                  : "bg-red-600 text-white shadow-red-500/20 hover:bg-red-700"
                              )}
                            >
                              <Trash2 size={14} /> 
                              {bulkDeleteConfirm ? "Confirm Delete?" : `Delete Selected (${selectedIds.size})`}
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-brand-slate-400">{propertyFees.length} items</span>
                      </div>
                      <div className="overflow-x-auto max-h-[500px]">
                        {propertyFees.length === 0 ? (
                          <div className="p-8 text-center text-xs text-brand-slate-400 font-bold uppercase tracking-widest">No custom fees recorded.</div>
                        ) : (
                          <table className="w-full text-left text-xs">
                             <thead className="bg-brand-slate-50 border-b border-brand-slate-100 sticky top-0">
                               <tr>
                                 <th className="px-4 py-3 w-10">
                                    <input 
                                      type="checkbox" 
                                      className="rounded"
                                      checked={propertyFees.length > 0 && propertyFees.every(f => selectedIds.has(f.id))}
                                      onChange={() => toggleSelectAll(propertyFees.map(f => f.id))}
                                    />
                                 </th>
                                 <th className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400">Date</th>
                                 <th className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400">Description</th>
                                 <th className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 text-right">Amount</th>
                                 <th className="px-4 py-3 font-bold uppercase text-[9px] text-brand-slate-400 text-right"></th>
                               </tr>
                             </thead>
                             <tbody className="divide-y divide-brand-slate-50">
                               {propertyFees.map(f => {
                                 const isEditing = editingId === f.id;
                                 return (
                                   <tr key={f.id} className={cn("hover:bg-brand-slate-50/50", (selectedIds.has(f.id) || isEditing) && "bg-brand-slate-50")}>
                                     <td className="px-4 py-3">
                                        <input 
                                          type="checkbox" 
                                          className="rounded" 
                                          checked={selectedIds.has(f.id)}
                                          onChange={() => toggleSelect(f.id)}
                                        />
                                     </td>
                                     <td className="px-4 py-3 font-bold text-brand-slate-500">
                                       {isEditing ? (
                                         <input 
                                           type="date" 
                                           defaultValue={f.date}
                                           className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-full font-bold"
                                           onBlur={(e) => handleUpdateFee(f.id, { date: e.target.value })}
                                         />
                                       ) : (f.date ? format(parseISO(f.date), 'MMM dd, yyyy') : '-')}
                                     </td>
                                     <td className="px-4 py-3 font-bold text-brand-slate-900 uppercase tracking-tight">
                                       {isEditing ? (
                                         <input 
                                           defaultValue={f.description}
                                           className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-full font-bold"
                                           onBlur={(e) => handleUpdateFee(f.id, { description: e.target.value })}
                                         />
                                       ) : f.description}
                                     </td>
                                     <td className="px-4 py-3 text-right font-black text-red-600">
                                       {isEditing ? (
                                         <input 
                                           type="number" 
                                           step="0.01"
                                           defaultValue={f.amount}
                                           className="bg-white border border-brand-slate-200 rounded px-2 py-1 text-[10px] w-24 text-right font-black text-red-600"
                                           onBlur={(e) => handleUpdateFee(f.id, { amount: parseFloat(e.target.value) })}
                                         />
                                       ) : (
                                         <div className="flex flex-col items-end">
                                           <span>{formatCurrency(f.amount)}</span>
                                           {f.feeType === 'percent' && (
                                             <span className="text-[8px] text-brand-slate-400 font-bold uppercase">({f.percentage}%)</span>
                                           )}
                                         </div>
                                       )}
                                     </td>
                                     <td className="px-4 py-3 text-right">
                                       <div className="flex justify-end gap-1">
                                         <button 
                                          onClick={() => setEditingId(isEditing ? null : f.id)}
                                          className={cn(
                                            "p-2 rounded-lg transition-all",
                                            isEditing ? "text-green-600 bg-green-50" : "text-brand-slate-300 hover:text-brand-slate-900 hover:bg-brand-slate-100"
                                          )}
                                         >
                                          {isEditing ? <Check size={16} /> : <Pencil size={16} />}
                                         </button>
                                         <button 
                                          onClick={() => handleDeleteFee(f.id)} 
                                          className={cn(
                                            "p-2 rounded-lg transition-all relative group",
                                            deleteConfirmId === f.id 
                                              ? "text-white bg-red-600 scale-110 shadow-lg shadow-red-500/40" 
                                              : "text-red-400 hover:text-red-600 hover:bg-red-50"
                                          )}
                                          title={deleteConfirmId === f.id ? "Click again to confirm delete" : "Delete Fee"}
                                         >
                                          <Trash2 size={16}/>
                                         </button>
                                       </div>
                                     </td>
                                   </tr>
                                 )
                               })}
                             </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bento-card p-0 overflow-hidden">
                    <div className="p-4 border-b border-brand-slate-100 bg-brand-slate-50/50 flex justify-between items-center">
                      <div className="text-[10px] font-black uppercase text-brand-slate-500 tracking-widest flex items-center gap-2">
                        <ListFilter size={14} />
                        Portfolio Fee Ledger
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left whitespace-nowrap">
                        <thead className="bg-white border-b border-brand-slate-200">
                          <tr>
                            <th className="px-6 py-4 font-black uppercase text-[10px] text-brand-slate-400 tracking-widest">Date</th>
                            <th className="px-6 py-4 font-black uppercase text-[10px] text-brand-slate-400 tracking-widest text-right">Fee/Ratio</th>
                            <th className="px-6 py-4 font-black uppercase text-[10px] text-brand-slate-400 tracking-widest">Property ID</th>
                            <th className="px-6 py-4 font-black uppercase text-[10px] text-brand-slate-400 tracking-widest">Description</th>
                            <th className="px-6 py-4 font-black uppercase text-[10px] text-brand-slate-400 tracking-widest text-right">Calculated</th>
                            <th className="px-6 py-4"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-slate-100">
                          <tr className="bg-brand-accent/5">
                            <td className="px-6 py-3">
                              <input type="date" id="speed-date" defaultValue={new Date().toISOString().split('T')[0]} className="bg-transparent border-0 text-xs font-bold w-32 focus:ring-0 p-0" />
                            </td>
                            <td className="px-6 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <input type="number" id="speed-amount" placeholder="0.00" className="bg-transparent border-0 text-xs font-black w-20 text-right focus:ring-0 p-0" />
                                <select id="speed-type" className="bg-transparent border-0 text-[10px] font-black uppercase focus:ring-0 p-0 appearance-none underline">
                                  <option value="fixed">$</option>
                                  <option value="percent">%</option>
                                </select>
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <select id="speed-property" className="bg-transparent border-0 text-xs font-black uppercase focus:ring-0 p-0">
                                {properties.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                              </select>
                            </td>
                            <td className="px-6 py-3">
                              <input type="text" id="speed-desc" placeholder="Summary..." className="bg-transparent border-0 text-xs font-bold w-full focus:ring-0 p-0" />
                            </td>
                            <td className="px-6 py-3 text-right text-[10px] text-brand-slate-300 font-bold italic">auto-calc</td>
                            <td className="px-6 py-3 text-right">
                              <button 
                                onClick={async () => {
                                  const date = (document.getElementById('speed-date') as HTMLInputElement).value;
                                  const amt = parseFloat((document.getElementById('speed-amount') as HTMLInputElement).value);
                                  const type = (document.getElementById('speed-type') as HTMLSelectElement).value as 'fixed' | 'percent';
                                  const pid = (document.getElementById('speed-property') as HTMLSelectElement).value;
                                  const desc = (document.getElementById('speed-desc') as HTMLInputElement).value;
                                  
                                  if (pid && date && desc && !isNaN(amt)) {
                                    const targetP = properties.find(p => p.id === pid);
                                    let finalAmt = amt;
                                    if (type === 'percent' && targetP) {
                                       const ms = startOfMonth(parseISO(date)).getTime();
                                       const me = endOfMonth(parseISO(date)).getTime();
                                       const rev = (allRevenue || []).filter(r => r.propertyId === pid && r.dateTimestamp >= ms && r.dateTimestamp <= me).reduce((s, r) => s + r.grossAmount, 0);
                                       finalAmt = (rev * amt) / 100;
                                    }
                                    const fee: CustomFee = {
                                      id: `${pid}_${Date.now()}`,
                                      propertyId: pid,
                                      amount: finalAmt,
                                      feeType: type,
                                      description: desc,
                                      date,
                                      addedAt: Date.now(),
                                    };
                                    if (type === 'percent') {
                                      fee.percentage = amt;
                                    }
                                    await setDoc(doc(db, 'fees', fee.id), fee);
                                    (document.getElementById('speed-amount') as HTMLInputElement).value = '';
                                    (document.getElementById('speed-desc') as HTMLInputElement).value = '';
                                  }
                                }}
                                className="p-2 bg-brand-slate-900 text-white rounded-lg hover:bg-black"
                              >
                                <Plus size={14} />
                              </button>
                            </td>
                          </tr>
                          {allFees.map(f => (
                            <tr key={f.id} className="group hover:bg-brand-slate-50 transition-colors">
                              <td className="px-6 py-4 text-xs font-bold text-brand-slate-600">{f.date ? format(parseISO(f.date), 'MMM dd, yyyy') : '-'}</td>
                              <td className="px-6 py-4 text-right text-xs font-black text-brand-slate-900">
                                {f.feeType === 'percent' ? `${f.percentage}%` : formatCurrency(f.amount)}
                              </td>
                              <td className="px-6 py-4 text-xs font-black text-brand-accent uppercase">{f.propertyId}</td>
                              <td className="px-6 py-4 text-xs font-bold text-brand-slate-700 uppercase tracking-tight">{f.description}</td>
                              <td className="px-6 py-4 text-right text-xs font-black text-red-600">{formatCurrency(f.amount)}</td>
                              <td className="px-6 py-4 text-right">
                                 <button onClick={() => handleDeleteFee(f.id)} className="text-brand-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <Trash2 size={14} />
                                 </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {message && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.98 }} 
                animate={{ opacity: 1, scale: 1 }} 
                className={cn(
                  "p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest text-center mt-6",
                  message.type === 'success' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                )}
              >
                {message.text}
              </motion.div>
            )}
          </motion.div>
        ) : (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-white border-2 border-dashed border-brand-slate-200 rounded-[2rem] p-12 text-center">
              <div className="w-20 h-20 bg-brand-slate-50 rounded-full flex items-center justify-center mb-6 text-brand-slate-200">
                <Database size={40} />
              </div>
              <h2 className="text-xl font-extrabold text-brand-slate-800 uppercase tracking-tight mb-2">Central Management</h2>
              <p className="text-sm font-medium text-brand-slate-400 max-w-xs mx-auto mb-8">Select an active property from the inventory list to begin data reconciliation & management.</p>
              <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-slate-200 animate-pulse"></div>
                <div className="w-2 h-2 rounded-full bg-brand-slate-200 animate-pulse delay-100"></div>
                <div className="w-2 h-2 rounded-full bg-brand-slate-200 animate-pulse delay-200"></div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </main>
  </div>
  );
}
