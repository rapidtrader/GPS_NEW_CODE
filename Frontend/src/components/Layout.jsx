import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar, { MobileMenuButton } from './Sidebar';

export default function Layout({
  user,
  onLogout,
  title,
  children,
  fullBleed,
  headerContent,
  hideVehicleBanner = false,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const openMobileMenu = useCallback(() => setMobileOpen(true), []);
  const closeMobileMenu = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  const showAccess =
    !hideVehicleBanner &&
    user?.role === 'user' &&
    Array.isArray(user.vehicleAccess) &&
    user.vehicleAccess.length > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu overlay"
          className="fixed inset-0 z-[1990] bg-black/40 lg:hidden"
          onClick={closeMobileMenu}
        />
      )}

      <Sidebar
        user={user}
        onLogout={onLogout}
        mobileOpen={mobileOpen}
        onClose={closeMobileMenu}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!fullBleed && (
          <header className="border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex items-start gap-3">
              <MobileMenuButton onOpen={openMobileMenu} />
              <div className="min-w-0 flex-1">
                {headerContent || <h2 className="text-xl font-bold text-black">{title}</h2>}
              </div>
            </div>
          </header>
        )}

        {fullBleed && (
          <MobileMenuButton
            onOpen={openMobileMenu}
            className="fixed left-4 top-4 z-[600] shadow-md lg:hidden"
          />
        )}

        {showAccess && (
          <div className={`shrink-0 border-b border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 sm:px-6 ${fullBleed ? '' : ''}`}>
            <span className="font-semibold">Your vehicles:</span>{' '}
            {user.vehicleAccess.join(', ')}
          </div>
        )}

        <main className={`min-w-0 flex-1 min-h-0 overflow-hidden ${fullBleed ? 'flex flex-col' : 'overflow-y-auto p-4 sm:p-6'}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
