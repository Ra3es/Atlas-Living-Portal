import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { Property, OperationType } from '../types';
import { handleFirestoreError } from '../lib/utils';
import { ShieldCheck, ArrowRight, Key, Sparkles, Building2, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OwnerLoginProps {
  propertyId?: string | null;
  onLogin: (property: Property) => void;
}

export default function OwnerLogin({ propertyId, onLogin }: OwnerLoginProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetProperty, setTargetProperty] = useState<Property | null>(null);
  const [fetchingTarget, setFetchingTarget] = useState(false);

  useEffect(() => {
    if (!propertyId) {
      setTargetProperty(null);
      return;
    }

    const fetchProperty = async () => {
      setFetchingTarget(true);
      setError(null);
      try {
        const docRef = doc(db, 'properties', propertyId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setTargetProperty({ ...docSnap.data(), id: docSnap.id } as Property);
        } else {
          setError(`Property with ID "${propertyId}" was not found.`);
        }
      } catch (err) {
        console.error(err);
        setError('Failed to fetch property details.');
      } finally {
        setFetchingTarget(false);
      }
    };

    fetchProperty();
  }, [propertyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return;
    
    setLoading(true);
    setError(null);
    
    try {
      if (targetProperty) {
        if (targetProperty.pin === pin) {
          onLogin(targetProperty);
        } else {
          setError('Verification failed. Invalid access code.');
        }
      } else {
        const q = query(collection(db, 'properties'), where('pin', '==', pin), limit(1));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setError('Verification failed. Invalid access code.');
        } else {
          const property = snapshot.docs[0].data() as Property;
          onLogin(property);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'properties');
      setError('System connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex items-center justify-center p-4 font-sans text-brand-slate-800 relative overflow-hidden">
      {/* Abstract Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-brand-accent/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-slate-900/5 rounded-full blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-[420px] w-full relative px-2 sm:px-0"
      >
        <div className="text-center mb-8 sm:mb-12">
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 bg-brand-slate-900 rounded-2xl mb-6 sm:mb-8 shadow-2xl shadow-brand-slate-900/20"
          >
            <ShieldCheck className="text-brand-accent" size={24} sm:size={32} strokeWidth={1.5} />
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl sm:text-3xl font-serif tracking-[0.15em] mb-2 sm:mb-3 text-brand-slate-900 font-light"
          >
            ATLAS <span className="text-brand-accent font-medium">LIVING</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-brand-slate-400 font-bold uppercase text-[9px] sm:text-[10px] tracking-[0.4em]"
          >
            Owner Portfolio Access
          </motion.p>
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[2.5rem] border border-brand-slate-100 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] relative"
        >
          {fetchingTarget ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-4 border-brand-slate-100 border-t-brand-accent rounded-full animate-spin" />
              <div className="text-[10px] font-black uppercase text-brand-slate-400 tracking-widest">Locating Property...</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
              {targetProperty && (
                <div className="bg-brand-slate-50 border border-brand-slate-100 p-4 rounded-2xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-brand-slate-900 flex items-center justify-center text-brand-accent shrink-0">
                    <Building2 size={16} />
                  </div>
                  <div className="text-left leading-tight">
                    <div className="text-[9px] font-black uppercase tracking-widest text-brand-slate-400">Linked Property</div>
                    <div className="text-xs font-bold text-brand-slate-950">{targetProperty.name}</div>
                  </div>
                </div>
              )}

              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center justify-between px-1">
                  <label className="text-[9px] sm:text-[10px] font-black text-brand-slate-900 uppercase tracking-widest opacity-30">Access PIN</label>
                  <div className="flex items-center gap-1.5 text-[8px] sm:text-[9px] font-bold text-brand-slate-400 uppercase tracking-tighter">
                    <Key size={9} sm:size={10} />
                    Encrypted
                  </div>
                </div>
                
                <div className="relative group">
                  <input 
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="••••••"
                    className="w-full text-center text-3xl sm:text-4xl font-mono tracking-[0.4em] py-4 sm:py-6 bg-brand-slate-50 border border-brand-slate-100 rounded-2xl sm:rounded-3xl focus:border-brand-accent focus:bg-white focus:ring-4 focus:ring-brand-accent/5 outline-none transition-all placeholder:text-brand-slate-200"
                    maxLength={8}
                    autoFocus
                  />
                  <div className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-brand-accent/50 to-transparent scale-x-0 group-focus-within:scale-x-100 transition-transform duration-500" />
                </div>
              </div>

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-red-50 border border-red-100 p-3 rounded-2xl flex items-center gap-3"
                  >
                    <div className="w-6 h-6 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                      <Sparkles className="text-red-600" size={12} />
                    </div>
                    <p className="text-[11px] font-bold text-red-600 uppercase tracking-tight">
                      {error}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <button 
                type="submit"
                disabled={loading || pin.length < 4 || (!!propertyId && !targetProperty)}
                className="w-full bg-brand-slate-900 text-white py-4 sm:py-5 rounded-2xl sm:rounded-3xl font-black uppercase tracking-widest text-[11px] sm:text-xs flex items-center justify-center gap-4 hover:bg-black hover:shadow-xl hover:shadow-brand-slate-900/20 active:scale-[0.98] transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying</span>
                  </div>
                ) : (
                  <>
                    <span>Initialize Dashboard</span>
                    <ArrowRight size={16} sm:size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {propertyId && (
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = '#/';
                    window.dispatchEvent(new Event('popstate'));
                  }}
                  className="w-full flex items-center justify-center gap-1 text-brand-slate-400 hover:text-brand-slate-600 border border-dashed border-brand-slate-200 hover:border-brand-slate-300 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all"
                >
                  <ChevronLeft size={10} />
                  Main Login Portal
                </button>
              )}
            </form>
          )}
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="mt-8 sm:mt-12 text-center"
        >
          <p className="text-[9px] sm:text-[10px] text-brand-slate-400 uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-3">
            <span className="w-6 sm:w-8 h-px bg-brand-slate-200" />
            Atlas Core v2.4
            <span className="w-6 sm:w-8 h-px bg-brand-slate-200" />
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
