import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationDropdown from './NotificationDropdown';

const Header: React.FC = () => {
  const { user, openModal, logout } = useAuth();
  const { theme, toggle } = useTheme();

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const hash = window.location.hash;
    if (!hash || hash === '#/' || hash === '#') {
      window.location.reload();
    } else {
      window.location.hash = '#/';
    }
  };

  return (
    <header className="bg-th-page h-[52px] border-b border-th-border-2 sticky top-0 z-50 flex items-center justify-center transition-colors">
      <div className="w-full max-w-[1100px] px-4 flex items-center justify-between">
        {/* Logo */}
        <a href="#/" onClick={handleLogoClick} className="flex items-center">
          <div className="text-th-text font-bold text-2xl tracking-tighter">
            ВОПЛИ
          </div>
        </a>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-th-text-3">
            {/* Notifications */}
            {user && <NotificationDropdown />}

            {/* Theme Toggle */}
            <button onClick={toggle} className="p-2 hover:text-th-text transition-colors" title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
              {theme === 'dark' ? (
                /* Sun icon — shown in dark mode */
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd" d="M8.99997 1C8.99997 1.55228 9.44768 2 9.99997 2C10.5523 2 11 1.55228 11 1C11 0.447715 10.5523 0 9.99997 0C9.44768 0 8.99997 0.447715 8.99997 1ZM2.92894 4.34312C3.31946 4.73365 3.95263 4.73365 4.34315 4.34312C4.73368 3.9526 4.73368 3.31943 4.34315 2.92891C3.95263 2.53838 3.31946 2.53838 2.92894 2.92891C2.53842 3.31943 2.53842 3.9526 2.92894 4.34312ZM10 6.5C8.067 6.5 6.5 8.067 6.5 10C6.5 11.933 8.067 13.5 10 13.5C11.933 13.5 13.5 11.933 13.5 10C13.5 8.067 11.933 6.5 10 6.5ZM4.5 10C4.5 6.96243 6.96243 4.5 10 4.5C13.0376 4.5 15.5 6.96243 15.5 10C15.5 13.0376 13.0376 15.5 10 15.5C6.96243 15.5 4.5 13.0376 4.5 10ZM20 10C20 10.5523 19.5523 11 19 11C18.4477 11 18 10.5523 18 10C18 9.44771 18.4477 9 19 9C19.5523 9 20 9.44771 20 10ZM1 11C1.55228 11 2 10.5523 2 10C2 9.44771 1.55228 9 1 9C0.447715 9 0 9.44771 0 10C0 10.5523 0.447715 11 1 11ZM17.0711 17.071C16.6805 17.4616 16.0474 17.4616 15.6568 17.071C15.2663 16.6805 15.2663 16.0473 15.6568 15.6568C16.0474 15.2663 16.6805 15.2663 17.0711 15.6568C17.4616 16.0473 17.4616 16.6805 17.0711 17.071ZM9.99997 20C9.44768 20 8.99997 19.5523 8.99997 19C8.99997 18.4477 9.44768 18 9.99997 18C10.5523 18 11 18.4477 11 19C11 19.5523 10.5523 20 9.99997 20ZM2.92891 17.0711C2.53839 16.6806 2.53839 16.0474 2.92891 15.6569C3.31944 15.2664 3.9526 15.2664 4.34312 15.6569C4.73365 16.0474 4.73365 16.6806 4.34312 17.0711C3.9526 17.4616 3.31944 17.4616 2.92891 17.0711ZM15.657 2.92888C15.2665 3.3194 15.2665 3.95257 15.657 4.34309C16.0475 4.73362 16.6807 4.73362 17.0712 4.34309C17.4617 3.95257 17.4617 3.3194 17.0712 2.92888C16.6807 2.53836 16.0475 2.53835 15.657 2.92888Z"></path>
                </svg>
              ) : (
                /* Crescent moon icon — shown in light mode */
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>

             {/* User Profile */}
             {user ? (
                 <div className="flex items-center gap-3 pl-2 border-l border-th-border ml-2">
                    <a href={`#/profile/${user.id}`} title="Мой профиль" className="hover:ring-2 hover:ring-th-border rounded-full transition-all">
                      <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full bg-th-input" />
                    </a>
                    <button
                        onClick={logout}
                        className="text-xs font-bold text-th-text-3 hover:text-th-text transition-colors"
                    >
                        ВЫЙТИ
                    </button>
                 </div>
             ) : (
                 <button
                    onClick={openModal}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-th-border hover:border-th-text-3 text-sm transition-all"
                 >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
                       <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                    <span>Войти</span>
                 </button>
             )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
