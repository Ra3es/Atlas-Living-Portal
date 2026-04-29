/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import AdminPortal from './components/AdminPortal';
import OwnerLogin from './components/OwnerLogin';
import OwnerDashboard from './components/OwnerDashboard';
import { Property } from './types';
import { onAuthStateChanged, auth, testConnection } from './lib/firebase';

type Route = 'owner-login' | 'owner-dashboard' | 'admin';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<Route>('owner-login');
  const [loggedProperty, setLoggedProperty] = useState<Property | null>(null);

  useEffect(() => {
    testConnection();
    
    // Check if we are on the admin path
    if (window.location.hash === '#admin') {
      setCurrentRoute('admin');
    }

    const unsubsribe = onAuthStateChanged(auth, (user) => {
      if (user?.email === 'raeellahi@gmail.com') {
        // Admin logged in, but we still respect the hash for UI
      }
    });

    return unsubsribe;
  }, []);

  const handleOwnerLogin = (property: Property) => {
    setLoggedProperty(property);
    setCurrentRoute('owner-dashboard');
  };

  const handleOwnerLogout = () => {
    setLoggedProperty(null);
    setCurrentRoute('owner-login');
  };

  const handleViewAsOwner = (property: Property) => {
    setLoggedProperty(property);
    setCurrentRoute('owner-dashboard');
  };

  const handleReturnToAdmin = () => {
    setLoggedProperty(null);
    setCurrentRoute('admin');
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {currentRoute === 'owner-login' && <OwnerLogin onLogin={handleOwnerLogin} />}
      {currentRoute === 'owner-dashboard' && loggedProperty && (
        <OwnerDashboard 
          property={loggedProperty} 
          onLogout={auth.currentUser?.email === 'raeellahi@gmail.com' ? handleReturnToAdmin : handleOwnerLogout} 
        />
      )}
      {currentRoute === 'admin' && <AdminPortal onViewAsOwner={handleViewAsOwner} />}
      
      {/* Hidden helper for admin access if needed via console or link */}
      <div className="fixed bottom-4 right-4 opacity-0 hover:opacity-10 transition-opacity">
        <button 
          onClick={() => setCurrentRoute(currentRoute === 'admin' ? 'owner-login' : 'admin')}
          className="text-[10px] text-gray-400"
        >
          {currentRoute === 'admin' ? 'Exit Admin' : 'Admin'}
        </button>
      </div>
    </div>
  );
}
