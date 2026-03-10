import React from 'react';
import Header from './components/Header';
import ShoutFeed from './components/ShoutFeed';
import ProfilePage from './components/ProfilePage';
import ShoutPage from './components/ShoutPage';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SSEProvider } from './context/SSEContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { ContentPreferencesProvider } from './context/ContentPreferencesContext';
import { IgnoredUsersProvider } from './context/IgnoredUsersContext';
import AuthModal from './components/AuthModal';
import { useRoute } from './hooks/useRoute';

const App: React.FC = () => {
  const route = useRoute();

  return (
    <ThemeProvider>
      <AuthProvider>
      <SSEProvider>
      <ContentPreferencesProvider>
        <IgnoredUsersProvider>
        <NotificationsProvider>
          <div className="min-h-screen font-sans bg-th-page transition-colors">
            <Header />

            <main className="flex justify-center max-w-[1200px] mx-auto px-4 pb-20 pt-6 gap-8">
              <div className="w-full max-w-[700px] px-1 py-6 sm:px-0">
                {route.page === 'profile' ? (
                  <ProfilePage userId={route.userId} />
                ) : route.page === 'shout' ? (
                  <ShoutPage shoutId={route.shoutId} />
                ) : (
                  <ShoutFeed />
                )}
              </div>
            </main>

            <AuthModal />
          </div>
        </NotificationsProvider>
        </IgnoredUsersProvider>
      </ContentPreferencesProvider>
      </SSEProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
