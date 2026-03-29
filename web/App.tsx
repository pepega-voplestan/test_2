import React, { useEffect } from 'react';
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
import { useRoute, navigateTo } from './hooks/useRoute';

const App: React.FC = () => {
  const route = useRoute();

  // Reset scroll position when navigating between pages
  const routeKey = route.page === 'profile' ? route.userId : route.page === 'shout' ? route.shoutId : '';
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.page, routeKey]);

  // Intercept clicks on internal <a> links for SPA navigation
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      // Skip if modifier keys (new tab), external links, or non-left clicks
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (anchor.target === '_blank') return;
      const href = anchor.getAttribute('href');
      if (!href || !href.startsWith('/')) return;
      // Skip API/media paths
      if (href.startsWith('/api') || href.startsWith('/media') || href.startsWith('/admin') || href.startsWith('/workers')) return;
      e.preventDefault();
      navigateTo(href);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

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
                  <ShoutPage shoutId={route.shoutId} focusCommentId={route.commentId} />
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
