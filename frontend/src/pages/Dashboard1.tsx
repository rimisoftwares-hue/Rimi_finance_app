
import { Users, UserX, Car, DollarSign } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { SummaryCard } from "../components/dashboard/SummaryCard";
import { MonthlyChart, IncomeOutcomeChart } from "../components/dashboard/Charts1";
import { RecentActivity } from "../components/dashboard/RecentActivity1";
import { RecentHistoryAlerts } from "../components/dashboard/RecentHistoryAlerts";
import { useEffect, useState } from "react";
import apiClient from "../api/apiClient";

interface DashboardStats {
  totalCustomers: number;
  unpaidCustomers: number;
  totalVehicles: number;
  salesAmount: number;
  trends: {
    customersTrend: number;
    unpaidTrend: number;
    vehiclesTrend: number;
    salesTrend: number;
  };
}

export default function Dashboard1() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const response = await apiClient.get('/dashboard/stats');
        if (response.data.success) {
          setStats(response.data.data);
        }
      } catch (error) {
        console.error("Error fetching dashboard stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardStats();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Loading dashboard data...
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="dashboard-card h-24 animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Welcome back! Here's what's happening with your finance business.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryCard
          title="Total Customers"
          value={stats?.totalCustomers || 0}
          subtitle="Active customers"
          icon={Users}
          trend={stats?.trends.customersTrend ? {
            value: Math.abs(stats.trends.customersTrend),
            isPositive: stats.trends.customersTrend >= 0
          } : undefined}
          variant="default"
          onClick={() => navigate("/customers")} 
        />
        
        <SummaryCard
          title="Unpaid Customers"
          value={stats?.unpaidCustomers || 0}
          subtitle="Pending payments"
          icon={UserX}
          trend={stats?.trends.unpaidTrend ? {
            value: Math.abs(stats.trends.unpaidTrend),
            isPositive: stats.trends.unpaidTrend >= 0
          } : undefined}
          variant="expense"
          onClick={() => navigate("/unpaidloans")} 
        />
        
        <SummaryCard
          title="Total Vehicles"
          value={stats?.totalVehicles || 0}
          subtitle="In inventory"
          icon={Car}
          trend={stats?.trends.vehiclesTrend ? {
            value: Math.abs(stats.trends.vehiclesTrend),
            isPositive: stats.trends.vehiclesTrend >= 0
          } : undefined}
          variant="pending"
          onClick={() => navigate("/vehicle")} 
        />
        
        <SummaryCard
          title="Sales Amount"
          value={`₹${((stats?.salesAmount || 0) / 100000).toFixed(1)}L`}
          subtitle="This month"
          icon={DollarSign}
          trend={stats?.trends.salesTrend ? {
            value: Math.abs(stats.trends.salesTrend),
            isPositive: stats.trends.salesTrend >= 0
          } : undefined}
          variant="income"
          onClick={() => navigate("/paymentReport")} 
        />
      </div>

      {/* Charts Section */}
      {/* Additional Charts and Activity */}
      {/* <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IncomeVsPenaltyChart />
        <MonthlyChart />
      </div>

      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PlannedVsActualChart />
        </div>
        <div>
          <RecentActivity />
        </div>
      </div> */}
        {/* New Alerts Section */}
      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MonthlyChart />
        <IncomeOutcomeChart />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div >
          <RecentHistoryAlerts />
        </div>
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}