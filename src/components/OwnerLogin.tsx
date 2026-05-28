import React, { useState, useEffect } from 'react';
import { auth, googleProvider, db } from '../lib/firebase';
import { signInWithPopup } from 'firebase/auth';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { Property, OperationType } from '../types';
import { handleFirestoreError } from '../lib/utils';
import { ShieldCheck, ArrowRight, Building2, ChevronLeft, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OwnerLoginProps {
  propertyId?: string | null;
  onLogin: (property: Property) => void;
}

export default function OwnerLogin({ propertyId, onLogin }: OwnerLoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetProperty, setTargetProperty] = useState<Property | null>(null);
  const [fetchingTarget, setFetchingTarget] = useState(false);
  const [matchingProperties, setMatchingProperties] = useState<Property[]>([]);
  const [selectingProperty, setSelectingProperty] = useState(false);

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

  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleGoogleLogin = async () => {
    if (loading || isLoggingIn) return;
    setIsLoggingIn(true);
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      if (!user.email) {
        setError('Could not retrieve email from Google Account.');
        setLoading(false);
        return;
      }

      if (targetProperty) {
        // If we are logging into a specific property
        if (targetProperty.ownerEmail.toLowerCase() === user.email.toLowerCase()) {
          onLogin(targetProperty);
        } else {
          setError(`Account ${user.email} is not authorized for this portfolio.`);
        }
      } else {
        // Logging into main portal, find their properties
        const q = query(
          collection(db, 'properties'), 
          where('ownerEmail', '==', user.email)
        );
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setError(`No portfolios found for ${user.email}.`);
        } else if (snapshot.docs.length === 1) {
          const property = snapshot.docs[0].data() as Property;
          onLogin(property);
        } else {
          const properties = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Property));
          setMatchingProperties(properties);
          setSelectingProperty(true);
        }
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        handleFirestoreError(err, OperationType.GET, 'properties');
        setError('Authentication failed. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
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
            <ShieldCheck className="text-brand-accent" size={24} strokeWidth={1.5} />
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
          ) : selectingProperty ? (
            <div className="space-y-6 sm:space-y-8">
              <div className="text-center">
                <div className="text-[10px] font-black uppercase tracking-widest text-brand-slate-400 mb-2">Multiple Properties Found</div>
                <h3 className="text-sm font-bold text-brand-slate-900">Select Portfolio</h3>
              </div>
              <div className="space-y-3">
                {matchingProperties.map(prop => (
                  <button
                    key={prop.id}
                    onClick={() => onLogin(prop)}
                    className="w-full bg-brand-slate-50 border border-brand-slate-100 hover:border-brand-slate-900 p-4 rounded-2xl flex items-center justify-between group transition-all"
                  >
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-10 h-10 rounded-xl bg-brand-slate-900 flex items-center justify-center text-brand-accent shrink-0 group-hover:scale-105 transition-transform">
                        <Building2 size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-brand-slate-950">{prop.name}</div>
                        <div className="text-[9px] font-bold uppercase tracking-widest text-brand-slate-400 mt-0.5">{prop.id}</div>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-brand-slate-300 group-hover:text-brand-slate-900 group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectingProperty(false);
                }}
                className="w-full flex items-center justify-center gap-1 text-brand-slate-400 hover:text-brand-slate-600 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all"
              >
                <ChevronLeft size={10} />
                Back to Login
              </button>
            </div>
          ) : (
            <div className="space-y-6 sm:space-y-8">
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

              <AnimatePresence mode="wait">
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-red-50 border border-red-100 p-3 rounded-2xl flex items-center gap-3 overflow-hidden"
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
                onClick={handleGoogleLogin}
                disabled={loading || (!!propertyId && !targetProperty)}
                className="w-full bg-brand-slate-900 text-white py-4 sm:py-5 rounded-2xl sm:rounded-3xl font-black uppercase tracking-widest text-[11px] sm:text-xs flex items-center justify-center gap-4 hover:bg-black hover:shadow-xl hover:shadow-brand-slate-900/20 active:scale-[0.98] transition-all disabled:opacity-20 disabled:cursor-not-allowed group"
              >
                {loading ? (
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-5 h-5 bg-white rounded-full p-1 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                      <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0112 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z"/>
                      <path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 01-6.723-4.823l-4.04 3.067A11.965 11.965 0 0012 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987z"/>
                      <path fill="#4A90E2" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21z"/>
                      <path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 014.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 000 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067z"/>
                    </svg>
                    <span>Sign in with Google</span>
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
            </div>
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
