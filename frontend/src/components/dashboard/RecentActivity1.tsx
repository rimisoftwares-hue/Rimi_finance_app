// import { useEffect, useState } from "react";
// import { Clock, User, CreditCard, Car } from "lucide-react";
// import { liveStore, Activity } from "../../store/liveStore.tsx";

// export function RecentActivity() {
//   const [activities, setActivities] = useState<Activity[]>([]);

//   // WebSocket connection
//   useEffect(() => {
//     const socket = new WebSocket("ws://autofinex-desktop-api.rimio.in");

//     socket.onmessage = async (event) => {
//       try {
//         const data = JSON.parse(event.data);
//         if (data.type === "activity") {
//           const newActivity: Activity = data.payload;
//           await liveStore.add(newActivity);
//           setActivities((prev) => [newActivity, ...prev].slice(0, 20));
//         }
//       } catch (error) {
//         console.error("Error processing WebSocket message:", error);
//       }
//     };

//     socket.onerror = (error) => {
//       console.error("WebSocket error:", error);
//     };

//     socket.onopen = () => {
//       console.log("WebSocket connected");
//     };

//     socket.onclose = () => {
//       console.log("WebSocket disconnected");
//     };

//     // On mount: load cached activities
//     (async () => {
//       try {
//         const cached = await liveStore.getAll();
//         setActivities(cached.slice(0, 20)); // Limit to 20 most recent
//       } catch (error) {
//         console.error("Error loading cached activities:", error);
//       }
//     })();

//     return () => {
//       if (socket.readyState === WebSocket.OPEN) {
//         socket.close();
//       }
//     };
//   }, []);

//   const iconMap: Record<string, React.ComponentType<any>> = {
//     customer: User,
//     payment: CreditCard,
//     vehicle: Car
//   };

//   const formatTime = (dateString: string) => {
//     const date = new Date(dateString);
//     const now = new Date();
//     const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
//     if (diffInMinutes < 1) return "Just now";
//     if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
//     if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
//     return date.toLocaleDateString();
//   };

//   return (
//     <div className="dashboard-card">
//       <div className="flex items-center justify-between mb-4">
//         <h3 className="text-lg font-semibold">Recent Activity</h3>
//         {activities.length > 0 && (
//           <button 
//             className="text-sm text-primary hover:text-primary/80 transition-colors"
//             onClick={async () => {
//               await liveStore.clear();
//               setActivities([]);
//             }}
//           >
//             Clear All
//           </button>
//         )}
//       </div>

//       <div className="space-y-4 max-h-96 overflow-y-auto">
//         {activities.length === 0 ? (
//           <p className="text-muted-foreground text-sm text-center py-4">
//             No recent activity.
//           </p>
//         ) : (
//           activities.map((activity) => {
//             const Icon = iconMap[activity.type] || Clock;
//             const isOverdue = activity.description.toLowerCase().includes("overdue");
            
//             return (
//               <div 
//                 key={`${activity.id}-${activity.created_at}`} 
//                 className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors border border-border/50"
//               >
//                 <div className={`p-2 rounded-lg bg-muted ${
//                   isOverdue ? "text-destructive" : "text-primary"
//                 }`}>
//                   <Icon className="h-4 w-4" />
//                 </div>
                
//                 <div className="flex-1 min-w-0">
//                   <div className="flex items-center justify-between">
//                     <p className="text-sm font-medium text-foreground truncate">
//                       {activity.created_by || "System"}
//                     </p>
//                     {activity.amount && (
//                       <span className={`text-sm font-medium ${
//                         isOverdue ? "text-destructive" : "text-success"
//                       }`}>
//                         ₹{activity.amount.toLocaleString()}
//                       </span>
//                     )}
//                   </div>
                  
//                   <p className="text-sm text-muted-foreground mt-1">
//                     {activity.description}
//                   </p>
                  
//                   <div className="flex items-center gap-1 mt-2">
//                     <Clock className="h-3 w-3 text-muted-foreground" />
//                     <span className="text-xs text-muted-foreground">
//                       {formatTime(activity.created_at)}
//                     </span>
//                   </div>
//                 </div>
//               </div>
//             );
//           })
//         )}
//       </div>
//     </div>
//   );
// }

// src/components/dashboard/RecentActivity.tsx
// src/components/dashboard/RecentActivity.tsx
import { useEffect, useState } from "react";
import { Clock, User, CreditCard, Car, AlertCircle, Eye, ChevronRight } from "lucide-react";
import apiClient from "../../api/apiClient";
import { format } from "date-fns";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "../ui/dialog";
import { Button } from "../ui/button";

interface Activity {
  id: number;
  type: string;
  description: string;
  amount?: number;
  created_by: string;
  created_at: string;
  reference_id?: string;
}

export function RecentActivity() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllDialog, setShowAllDialog] = useState(false);
  const BASE_URL = `${import.meta.env.VITE_API_URL}`;
  useEffect(() => {
    fetchRecentActivities();
  }, []);

  const fetchRecentActivities = async () => {
    try {
      const response = await apiClient.get('/dashboard/recent-activities');
      if (response.data.success) {
        setActivities(response.data.activities);
      }
    } catch (error) {
      console.error("Error fetching recent activities:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteActivity = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.delete(`/dashboard/activities/${id}`);
      setActivities(activities.filter(activity => activity.id !== id));
    } catch (error) {
      console.error("Error deleting activity:", error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
    return format(date, 'MMM d, h:mm a');
  };

  const getActivityIcon = (type: string) => {
    const iconMap: Record<string, React.ComponentType<any>> = {
      payment: CreditCard,
      customer: User,
      vehicle: Car,
      default: AlertCircle
    };
    return iconMap[type] || AlertCircle;
  };

  const getActivityColor = (type: string) => {
    const colorMap: Record<string, string> = {
      payment: 'text-green-500 bg-green-50 dark:bg-green-900/20 dark:text-green-400',
      customer: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
      vehicle: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400',
      default: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400'
    };
    return colorMap[type] || colorMap.default;
  };

  const getActivityTypeLabel = (type: string) => {
    const labelMap: Record<string, string> = {
      payment: 'Payment',
      customer: 'Customer',
      vehicle: 'Vehicle',
      default: 'Activity'
    };
    return labelMap[type] || labelMap.default;
  };

  const displayedActivities = activities.slice(0, 4);
  const hasMoreActivities = activities.length > 4;

  if (loading) {
    return (
      <div className="dashboard-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
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

  if (activities.length === 0) {
    return (
      <div className="dashboard-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
        </div>
        <div className="text-center py-6">
          <AlertCircle className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">No recent activity</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="dashboard-card p-5 ">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Recent Activity</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {activities.length} total activities
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchRecentActivities}
            className="h-8 px-3"
          >
            Refresh
          </Button>
        </div>

        <div className="space-y-3">
          {displayedActivities.map((activity) => {
            const Icon = getActivityIcon(activity.type);
            const isOverdue = activity.description.toLowerCase().includes("overdue");
            
            return (
              <div
                key={`${activity.id}-${activity.created_at}`}
                className="group p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800/50 
                  cursor-pointer transition-colors flex items-start gap-3"
              >
                <div className={`p-2 rounded-lg ${
                  isOverdue 
                    ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                    : getActivityColor(activity.type)
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">
                      {activity.created_by || "System"}
                    </p>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                    {activity.description}
                  </p>
                  
                  <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{formatTime(activity.created_at)}</span>
                    </div>
                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                      {getActivityTypeLabel(activity.type)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {hasMoreActivities && (
          <Button
            onClick={() => setShowAllDialog(true)}
            variant="ghost"
            className="w-full mt-4 text-sm"
          >
            <Eye className="w-4 h-4 mr-2" />
            View All ({activities.length})
          </Button>
        )}
      </div>

      {/* All Activities Dialog */}
      <Dialog open={showAllDialog} onOpenChange={setShowAllDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              All Recent Activities ({activities.length})
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            {activities.map((activity) => {
              const Icon = getActivityIcon(activity.type);
              const isOverdue = activity.description.toLowerCase().includes("overdue");
              
              return (
                <div
                  key={`${activity.id}-${activity.created_at}`}
                  className="p-4 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800/50 
                    transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${
                        isOverdue 
                          ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                          : getActivityColor(activity.type)
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {activity.created_by || "System"}
                        </p>
                        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                            {getActivityTypeLabel(activity.type)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(activity.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {activity.reference_id && (
                      <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                        Ref: {activity.reference_id}
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                    {activity.description}
                  </p>
                  
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {activity.amount && (
                        <span className={`font-medium ${
                          isOverdue ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                        }`}>
                          ₹{activity.amount.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDeleteActivity(activity.id, e)}
                        className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Showing {activities.length} recent activities
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAllDialog(false)}
              >
                Close
              </Button>
              <Button
                onClick={fetchRecentActivities}
                variant="default"
              >
                Refresh
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}