import React from 'react';
import Header from './components/Header';
import ShoutFeed from './components/ShoutFeed';
import { AuthProvider } from './context/AuthContext';
import AuthModal from './components/AuthModal';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <div className="min-h-screen font-sans bg-[#131314]">
        <Header />
        
        <main className="flex justify-center max-w-[1200px] mx-auto px-4 pb-20 pt-6 gap-8">
          <div className="w-full max-w-[700px]">
             <ShoutFeed />
          </div>
        </main>
        
        <AuthModal />
      </div>
    </AuthProvider>
  );
};

export default App;