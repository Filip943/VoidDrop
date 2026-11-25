import { useCallback, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { Dashboard } from './components/Dashboard';
import type { UserProfile } from './types';

export default function App() {
  // Keep session bearer token strictly in React memory (no localStorage/sessionStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const handleAuthenticated = useCallback((token: string, user: UserProfile) => {
    setAuthToken(token);
    setCurrentUser(user);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthToken(null);
    setCurrentUser(null);
  }, []);

  if (!authToken || !currentUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return <Dashboard token={authToken} user={currentUser} onLogout={handleLogout} />;
}
