import { useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Moon, Sun, Bell } from "lucide-react";
import { Button } from "./ui/button";
import { Sidebar } from "./Sidebar";
import { useOwnerAuth } from "../contexts/OwnerAuthContext";
import { useAuth } from "../contexts/AuthContext";
import { UserProfile } from './UserProfile';
import { useNotifications } from '../hooks/useNotifications';

export function Layout() {
  const [isDark, setIsDark] = useState(false);
  const { owner, isLoading } = useOwnerAuth();
  const { currentFinance } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle("dark");
  };

  // Display finance name or fallback
  const displayName = currentFinance?.name || owner?.username || "RIMI Software";

  return (
    <div className={`min-h-screen bg-background transition-colors duration-300 ${isDark ? "dark" : ""}`}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header 
            className="h-10 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40 flex items-center justify-between"
            data-tauri-drag-region
          >
            {/* Left side with draggable area */}
            <div 
              className="flex items-center h-full px-6 flex-1 cursor-default"
              data-tauri-drag-region
            >
              <div data-tauri-drag-region>
                <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-bold text-foreground">
                    {isLoading ? "Loading..." : displayName}
                  </h1>
                </div>
              </div>
            </div>
            
            {/* Right side with controls - spaced for window controls (minimize/maximize/close) */}
            <div className="flex items-center h-full space-x-2 pl-4 pr-36" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              {/* Notification Bell */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/notification')}
                className="relative hover:bg-secondary transition-colors"
                title="Notifications"
                aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              >
                <Bell className="h-4 w-4 text-foreground/80 hover:text-foreground transition-colors" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-sm">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                <span className="sr-only">Notifications</span>
              </Button>

              {/* Theme Toggle Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={toggleTheme}
                className="relative"
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                <span className="sr-only">Toggle theme</span>
              </Button>
              
              {/* User Profile Dropdown */}
              <UserProfile />
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-auto bg-background">
            <div className="p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default Layout;
