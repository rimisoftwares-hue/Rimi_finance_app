// src/components/dashboard/RecentHistoryAlerts.tsx
import { useEffect, useState } from "react";
import { MessageSquare, Phone, FileText, ChevronRight, Eye, Calendar, Clock, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import apiClient from "../../api/apiClient";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "../ui/dialog";
import { Button } from "../ui/button";

interface HistoryAlert {
  id: number;
  finance_id: number;
  customer_hplno: number;
  entry_type: 'call' | 'rc_book';
  message: string;
  entry_date: string;
  created_by: string;
  created_at: string;
  customer_name?: string;
}

export function RecentHistoryAlerts() {
  const [alerts, setAlerts] = useState<HistoryAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllDialog, setShowAllDialog] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const BASE_URL = `${import.meta.env.VITE_API_URL}`;

  useEffect(() => {
    fetchRecentHistoryAlerts();
  }, []);

  const fetchRecentHistoryAlerts = async () => {
    try {
      const response = await apiClient.get('/dashboard/recent-history');
      if (response.data.success) {
        setAlerts(response.data.alerts);
      }
    } catch (error) {
      console.error("Error fetching recent history alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAlertClick = (alert: HistoryAlert) => {
    const userType = user?.role === 'owner' ? 'owner' : 'agent';
    navigate(`/${userType}/customers/${alert.customer_hplno}`);
  };

  const handleDeleteAlert = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.delete(`/dashboard/alerts/${id}`);
      setAlerts(alerts.filter(alert => alert.id !== id));
    } catch (error) {
      console.error("Error deleting alert:", error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = parseISO(dateString);
    
    if (isToday(date)) {
      return `Today ${format(date, 'h:mm a')}`;
    }
    
    if (isYesterday(date)) {
      return `Yesterday ${format(date, 'h:mm a')}`;
    }
    
    return format(date, 'MMM d, h:mm a');
  };

  const getTypeIcon = (type: 'call' | 'rc_book') => {
    return type === 'call' ? Phone : FileText;
  };

  const getTypeColor = (type: 'call' | 'rc_book') => {
    return type === 'call' 
      ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400'
      : 'text-purple-500 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400';
  };

  const displayedAlerts = alerts.slice(0, 4);
  const hasMoreAlerts = alerts.length > 4;

  if (loading) {
    return (
      <div className="dashboard-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Today Call/RC alerts</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="dashboard-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Today Call/RC alerts</h3>
        </div>
        <div className="text-center py-6">
          <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Today Call/RC alerts</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Today Call/RC alerts</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {alerts.length} total alerts
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchRecentHistoryAlerts}
            className="h-8 px-3"
          >
            Refresh
          </Button>
        </div>

        <div className="space-y-3">
          {displayedAlerts.map((alert) => {
            const Icon = getTypeIcon(alert.entry_type);
            return (
              <div
                key={alert.id}
                onClick={() => handleAlertClick(alert)}
                className="group p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800/50 
                  cursor-pointer transition-colors flex items-start gap-3"
              >
                <div className={`p-2 rounded-lg ${getTypeColor(alert.entry_type)}`}>
                  <Icon className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">
                      {alert.customer_name || `Customer ${alert.customer_hplno}`}
                    </p>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                    {alert.message}
                  </p>
                  
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>{alert.created_by || 'System'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatTime(alert.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {hasMoreAlerts && (
          <Button
            onClick={() => setShowAllDialog(true)}
            variant="ghost"
            className="w-full mt-4 text-sm"
          >
            <Eye className="w-4 h-4 mr-2" />
            View All ({alerts.length})
          </Button>
        )}
      </div>

      {/* All Alerts Dialog */}
      <Dialog open={showAllDialog} onOpenChange={setShowAllDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              All Activity Alerts ({alerts.length})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            {alerts.map((alert) => {
              const Icon = getTypeIcon(alert.entry_type);
              return (
                <div
                  key={alert.id}
                  className="p-4 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800/50 
                    cursor-pointer transition-colors"
                  onClick={() => handleAlertClick(alert)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${getTypeColor(alert.entry_type)}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {alert.customer_name || `Customer ${alert.customer_hplno}`}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                            HPL: {alert.customer_hplno}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(parseISO(alert.entry_date), 'MMM d, yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                    {alert.message}
                  </p>
                  
                  <div className="flex items-center justify-between mt-3 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span>{alert.created_by || 'System'}</span>
                      </div>
                      <span>•</span>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatTime(alert.created_at)}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAlert(alert.id, e);
                      }}
                      className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Click on any alert to view customer details
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAllDialog(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}