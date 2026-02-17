import React from 'react';
import Header from './components/Header';
import ShoutFeed from './components/ShoutFeed';
import ProfilePage from './components/ProfilePage';
import { AuthProvider } from './context/AuthContext';
import AuthModal from './components/AuthModal';
import { useRoute } from './hooks/useRoute';

const App: React.FC = () => {
  const route = useRoute();

  return (
    <AuthProvider>
      <div className="min-h-screen font-sans bg-[#131314]">
        <Header />

        <main className="flex justify-center max-w-[1200px] mx-auto px-4 pb-20 pt-6 gap-8">
          <div className="w-full max-w-[700px]">
            {route.page === 'profile' ? (
              <ProfilePage userId={route.userId} />
            ) : (
              <ShoutFeed />
            )}
          </div>
        </main>

        <AuthModal />
      </div>
    </AuthProvider>
  );
};

export default App;
