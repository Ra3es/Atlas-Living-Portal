/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, onAuthStateChanged, auth, testConnection } from './lib/firebase';
import AdminPortal from './components/AdminPortal';
import OwnerLogin from './components/OwnerLogin';
import OwnerDashboard from './components/OwnerDashboard';
import { Property } from './types';

interface RouteInfo {
  type: 'owner-login' | 'owner-dashboard' | 'admin';
  propertyId: string | null;
}

export default function App() {
  const [route, setRoute] = useState<RouteInfo>(() => parseCurrentRoute());
  const [loggedProperty, setLoggedProperty] = useState<Property | null>(null);
  const [isVerifyingSession, setIsVerifyingSession] = useState(false);

  // Parse location hash or pathname into structured routes
  function parseCurrentRoute(): RouteInfo {
    const hash = window.location.hash || '';
    const pathname = window.location.pathname || '';

    // Route: Admin
    if (hash === '#/admin' || hash === '#admin' || pathname === '/admin' || pathname === '/admin/') {
      return { type: 'admin', propertyId: null };
    }

    // Route: Owner Dashboard with direct ID (e.g. #/owner/AL001 or /owner/AL001)
    if (hash.startsWith('#/owner/')) {
      const parts = hash.split('/');
      return { type: 'owner-dashboard', propertyId: parts[2] || null };
    }
    if (pathname.startsWith('/owner/')) {
      const parts = pathname.split('/');
      return { type: 'owner-dashboard', propertyId: parts[2] || null };
    }

    // Default route: Owner Login / Property Selector
    return { type: 'owner-login', propertyId: null };
  }

  // Handle Hash and Path shifts
  useEffect(() => {
    testConnection();

    const handleRouteChange = () => {
      setRoute(parseCurrentRoute());
    };

    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('hashchange', handleRouteChange);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.email === 'raeellahi@gmail.com') {
        // Admin logged in
      }
    });

    return () => {
      window.removeEventListener('popstate', handleRouteChange);
      window.removeEventListener('hashchange', handleRouteChange);
      unsubscribe();
    };
  }, []);

  // Sync route shifts (e.g. clicking direct link while active) with loggedIn property context
  useEffect(() => {
    const savedId = localStorage.getItem('atlas_logged_property_id');
    const savedPin = localStorage.getItem('atlas_logged_property_pin');
    const proxyId = sessionStorage.getItem('atlas_admin_proxy_property_id');
    const targetId = route.propertyId;

    if (route.type === 'owner-dashboard' && targetId) {
      if (loggedProperty && loggedProperty.id === targetId) {
        // Already logged in as the correct target property, nothing to do
        return;
      }

      // If we have an active admin proxy session
      if (proxyId === targetId) {
        const fetchProxyProperty = async () => {
          setIsVerifyingSession(true);
          try {
            const docRef = doc(db, 'properties', targetId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const property = { ...docSnap.data(), id: docSnap.id } as Property;
              setLoggedProperty(property);
            } else {
              setLoggedProperty(null);
            }
          } catch (e) {
            console.error('Failed to restore admin proxy session:', e);
            setLoggedProperty(null);
          } finally {
            setIsVerifyingSession(false);
          }
        };
        fetchProxyProperty();
        return;
      }

      // If we have saved credentials that match the requested property, restore session
      if (savedId === targetId && savedPin) {
        const autoAuthenticate = async () => {
          setIsVerifyingSession(true);
          try {
            const docRef = doc(db, 'properties', targetId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const property = { ...docSnap.data(), id: docSnap.id } as Property;
              if (property.pin === savedPin) {
                setLoggedProperty(property);
              } else {
                setLoggedProperty(null);
              }
            } else {
              setLoggedProperty(null);
            }
          } catch (error) {
            console.error('Session verification fail:', error);
            setLoggedProperty(null);
          } finally {
            setIsVerifyingSession(false);
          }
        };

        autoAuthenticate();
      } else {
        // No valid cached credentials matching this ID, force authentication prompt
        setLoggedProperty(null);
      }
    } else if (route.type === 'owner-login') {
      // If we clicked to main portal, check if there's any active cached session to restore
      if (savedId && savedPin) {
        const autoAuthenticate = async () => {
          setIsVerifyingSession(true);
          try {
            const docRef = doc(db, 'properties', savedId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const property = { ...docSnap.data(), id: docSnap.id } as Property;
              if (property.pin === savedPin) {
                setLoggedProperty(property);
                // Sync URL path to show owner dashboard route
                window.location.hash = `#/owner/${property.id}`;
              }
            }
          } catch (e) {
            console.error(e);
          } finally {
            setIsVerifyingSession(false);
          }
        };
        autoAuthenticate();
      } else {
        setLoggedProperty(null);
      }
    } else {
      setLoggedProperty(null);
    }
  }, [route.type, route.propertyId]);

  const handleOwnerLogin = (property: Property) => {
    localStorage.setItem('atlas_logged_property_id', property.id);
    localStorage.setItem('atlas_logged_property_pin', property.pin);
    sessionStorage.removeItem('atlas_admin_proxy_property_id');
    setLoggedProperty(property);
    window.location.hash = `#/owner/${property.id}`;
  };

  const handleOwnerLogout = () => {
    localStorage.removeItem('atlas_logged_property_id');
    localStorage.removeItem('atlas_logged_property_pin');
    sessionStorage.removeItem('atlas_admin_proxy_property_id');
    setLoggedProperty(null);
    window.location.hash = '#/';
    window.history.pushState(null, '', '/');
    window.dispatchEvent(new Event('popstate'));
  };

  const handleViewAsOwner = (property: Property) => {
    // Admin proxy login (we use sessionStorage as a temporary bypass to prevent owner pin sync)
    sessionStorage.setItem('atlas_admin_proxy_property_id', property.id);
    setLoggedProperty(property);
    window.location.hash = `#/owner/${property.id}`;
  };

  const handleReturnToAdmin = () => {
    sessionStorage.removeItem('atlas_admin_proxy_property_id');
    setLoggedProperty(null);
    window.location.hash = '#/admin';
    window.history.pushState(null, '', '/admin');
    window.dispatchEvent(new Event('popstate'));
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {isVerifyingSession ? (
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-brand-slate-100 border-t-brand-accent rounded-full animate-spin" />
            <span className="text-xs uppercase font-mono tracking-widest text-brand-slate-400">Securing Connection...</span>
          </div>
        </div>
      ) : (
        <>
          {/* Admin route */}
          {route.type === 'admin' && (
            <AdminPortal onViewAsOwner={handleViewAsOwner} />
          )}

          {/* Owner Dashboard: requires verified loggedProperty matching correct ID */}
          {route.type === 'owner-dashboard' && loggedProperty && loggedProperty.id === route.propertyId && (
            <OwnerDashboard 
              property={loggedProperty} 
              onLogout={auth.currentUser?.email === 'raeellahi@gmail.com' ? handleReturnToAdmin : handleOwnerLogout} 
            />
          )}

          {/* Owner login: if on owner-dashboard route but not logged in OR if on owner-login route */}
          {((route.type === 'owner-dashboard' && !loggedProperty) || route.type === 'owner-login') && (
            <OwnerLogin 
              propertyId={route.propertyId} 
              onLogin={handleOwnerLogin} 
            />
          )}
        </>
      )}

      {/* Hidden helper for admin access via link overlay */}
      <div className="fixed bottom-4 right-4 opacity-0 hover:opacity-20 transition-opacity">
        <button 
          onClick={() => {
            window.location.hash = route.type === 'admin' ? '#/' : '#/admin';
          }}
          className="text-[10px] text-gray-400 font-mono"
        >
          {route.type === 'admin' ? 'Exit Admin' : 'Admin'}
        </button>
      </div>
    </div>
  );
}
