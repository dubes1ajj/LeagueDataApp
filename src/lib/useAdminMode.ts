import { useState } from 'react';

// Set VITE_ADMIN_PIN in your .env file or Netlify environment variables.
// Falls back to '1234' if not set.
const ADMIN_PIN: string = (import.meta.env.VITE_ADMIN_PIN as string | undefined) ?? '1234';

export function useAdminMode() {
  const [isAdmin, setIsAdmin] = useState<boolean>(() =>
    sessionStorage.getItem('golf_admin') === '1'
  );

  function tryUnlock(pin: string): boolean {
    if (pin === ADMIN_PIN) {
      sessionStorage.setItem('golf_admin', '1');
      setIsAdmin(true);
      return true;
    }
    return false;
  }

  function lock() {
    sessionStorage.removeItem('golf_admin');
    setIsAdmin(false);
  }

  return { isAdmin, tryUnlock, lock };
}
