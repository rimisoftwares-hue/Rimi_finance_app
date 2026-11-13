import { useState, useEffect } from 'react';
import { Clock, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface LoginTimeData {
  message: string;
  allowed_from?: string;
  allowed_to?: string;
}

const formatTime12h = (time: string | undefined): string => {
  if (!time) return '';
  const parts = time.split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${m} ${ampm}`;
};

export default function SessionExpiredModal() {
  const [isVisible, setIsVisible] = useState(false);
  const [data, setData] = useState<LoginTimeData | null>(null);
  const { userLogout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as LoginTimeData;
      setData(detail);
      setIsVisible(true);
    };

    window.addEventListener('autofinex:login-time-restricted', handler);
    return () => {
      window.removeEventListener('autofinex:login-time-restricted', handler);
    };
  }, []);

  const handleLogout = () => {
    setIsVisible(false);
    userLogout();
    navigate('/user-login');
  };

  if (!isVisible || !data) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-[1px] bg-black/25 flex items-center justify-center z-[100] p-4">
      <div className="bg-card rounded-2xl shadow-2xl max-w-md w-full border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header gradient */}
        <div
          className="px-6 py-8 text-center"
          style={{ background: 'var(--gradient-primary, linear-gradient(135deg, hsl(220, 70%, 50%), hsl(260, 70%, 50%)))' }}
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-foreground/20 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-bold text-primary-foreground">
            Working Hours Concluded
          </h2>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            {data.message || 'Your authorized working hours have ended. Access is restricted outside your permitted login window.'}
          </p>

          {data.allowed_from && data.allowed_to && (
            <div className="flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-secondary/50 border border-border">
              <Clock className="h-5 w-5 text-primary flex-shrink-0" />
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Permitted Hours
                </p>
                <p className="text-base font-semibold text-card-foreground">
                  {formatTime12h(data.allowed_from)} – {formatTime12h(data.allowed_to)}
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Please contact your administrator if you believe this is an error.
          </p>

          <button
            onClick={handleLogout}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-sm font-medium rounded-xl"
          >
            <LogOut className="h-4 w-4" />
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
