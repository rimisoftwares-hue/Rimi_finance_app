import { useEffect, useState } from "react";
import apiClient from "../../api/apiClient";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, XAxis, YAxis, LineChart, Line
} from "recharts";
import { useNavigate } from "react-router-dom";

// 🧾 Interfaces
interface IncomeVsPenalty {
  name: string;
  value: number;
  color: string;
  [key: string]: string | number;
}

interface MonthlyIncome {
  month: string;
  income: number;
  [key: string]: string | number;
}

interface IncomeOutcomeData {
  month: string;
  income: number;
  outcome: number;
  [key: string]: string | number;
}

// New interfaces for Income/Outcome charts
interface MonthlyIncomeBreakdown {
  month: string;
  principal: number;
  interest: number;
  penalty: number;
  total: number;
  [key: string]: string | number;
}

interface MonthlyOutcomeBreakdown {
  month: string;
  loanDisbursed: number;
  otherExpenses: number;
  total: number;
  [key: string]: string | number;
}

// 🥧 Income vs Penalty Chart
export function IncomeVsPenaltyChart() {
  const [data, setData] = useState<IncomeVsPenalty[]>([]);
  
  useEffect(() => {
    apiClient.get('/payments/paymentDeteils')
      .then((res) => {
        if (res.data.success) {
          setData(res.data.incomeVsPenaltyData);
        }
      }).catch((err) => {
      console.error("Error fetching income vs penalty data:", err);
      // Fallback data
      setData([
        { name: "Income", value: 78, color: "#22c55e" },
        { name: "Penalty", value: 22, color: "#ef4444" },
        { name: "Interest Rate", value: 8.5, color: "#3b82f6" }
      ]);
    });
  }, []);

  return (
    <div className="dashboard-card">
      <h3 className="text-lg font-semibold mb-4">Collection vs Penalty</h3>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie 
              data={data.filter(d => d.name !== "Interest Rate")} 
              dataKey="value" 
              innerRadius={60} 
              outerRadius={100}
              paddingAngle={2}
            >
              {data.filter(d => d.name !== "Interest Rate").map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value) => [`${value}%`, ""]}
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                color: "hsl(var(--popover-foreground))",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6 mt-4">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm text-muted-foreground">
              {item.name} ({item.value.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 📊 Monthly Chart with Income/Outcome Toggle
export function MonthlyChart() {
  const navigate = useNavigate();
  const [viewType, setViewType] = useState<'income' | 'outcome'>('income');
  const [incomeData, setIncomeData] = useState<MonthlyIncomeBreakdown[]>([]);
  const [outcomeData, setOutcomeData] = useState<MonthlyOutcomeBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeComponents, setActiveComponents] = useState<string[]>([
    'principal', 'interest', 'penalty', 'loanDisbursed', 'otherExpenses'
  ]);

  // Beautiful blue gradient colors
  const blueGradientColors = {
    primary: '#3B82F6', // Blue-500
    primaryLight: '#60A5FA', // Blue-400
    primaryDark: '#1D4ED8', // Blue-700
    teal: '#0D9488', // Teal-600
    sky: '#0EA5E9', // Sky-500
    cyan: '#06B6D4', // Cyan-500
    slate: '#64748B', // Slate-500
    emerald: '#10B981' // Emerald-500
  };

  useEffect(() => {
    setLoading(true);
    
    // Fetch both income and outcome data from new endpoints via apiClient
    Promise.all([
      apiClient.get('/dashboard/monthly-income-breakdown'),
      apiClient.get('/dashboard/monthly-outcome-breakdown')
    ]).then(([incomeRes, outcomeRes]) => {
      if (incomeRes.data.success) {
        const incomeData = incomeRes.data.data.map((item: any) => ({
          month: item.month,
          principal: Number(item.principal) || 0,
          interest: Number(item.interest) || 0,
          penalty: Number(item.penalty) || 0,
          total: Number(item.total) || 0
        }));
        setIncomeData(incomeData);
      }
      if (outcomeRes.data.success) {
        const outcomeData = outcomeRes.data.data.map((item: any) => ({
          month: item.month,
          loanDisbursed: Number(item.loanDisbursed) || 0,
          otherExpenses: Number(item.otherExpenses) || 0,
          total: Number(item.total) || 0
        }));
        setOutcomeData(outcomeData);
      }
    }).catch((err) => {
      console.error("Error fetching chart data:", err);
      // Fallback to mock data if API fails
      const mockIncomeData = getMockIncomeData();
      setIncomeData(mockIncomeData.map(item => ({
        ...item,
        total: item.principal + item.interest + item.penalty
      })));
      
      const mockOutcomeData = getMockOutcomeData();
      setOutcomeData(mockOutcomeData.map(item => ({
        ...item,
        total: item.loanDisbursed + item.otherExpenses
      })));
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const handleMonthClick = (month: string) => {
    const year = new Date().getFullYear();
    const monthIndex = new Date(`${month} 1, ${year}`).getMonth();
    const start = new Date(year, monthIndex, 1).toISOString().split("T")[0];
    const end = new Date(year, monthIndex + 1, 0).toISOString().split("T")[0];
    navigate(`/paymentReport?type=custom&startDate=${start}&endDate=${end}`);
  };

  const handleComponentToggle = (component: string) => {
    setActiveComponents(prev => 
      prev.includes(component) 
        ? prev.filter(c => c !== component)
        : [...prev, component]
    );
  };

  // Mock data for demonstration
  const getMockIncomeData = (): MonthlyIncomeBreakdown[] => [
    { month: "Jan", principal: 35000, interest: 8000, penalty: 2000, total: 45000 },
    { month: "Feb", principal: 38000, interest: 9000, penalty: 2500, total: 49500 },
    { month: "Mar", principal: 42000, interest: 9500, penalty: 3000, total: 54500 },
    { month: "Apr", principal: 45000, interest: 10000, penalty: 3200, total: 58200 },
    { month: "May", principal: 47000, interest: 11000, penalty: 3500, total: 61500 },
    { month: "Jun", principal: 50000, interest: 12000, penalty: 4000, total: 66000 },
    { month: "Jul", principal: 52000, interest: 12500, penalty: 4200, total: 68700 },
    { month: "Aug", principal: 53000, interest: 13000, penalty: 4500, total: 70500 },
    { month: "Sep", principal: 55000, interest: 13500, penalty: 4800, total: 73300 },
    { month: "Oct", principal: 58000, interest: 14000, penalty: 5000, total: 77000 },
    { month: "Nov", principal: 60000, interest: 14500, penalty: 5200, total: 79700 },
    { month: "Dec", principal: 62000, interest: 15000, penalty: 5500, total: 82500 },
  ];

  const getMockOutcomeData = (): MonthlyOutcomeBreakdown[] => [
    { month: "Jan", loanDisbursed: 80000, otherExpenses: 15000, total: 95000 },
    { month: "Feb", loanDisbursed: 85000, otherExpenses: 16000, total: 101000 },
    { month: "Mar", loanDisbursed: 90000, otherExpenses: 17000, total: 107000 },
    { month: "Apr", loanDisbursed: 92000, otherExpenses: 18000, total: 110000 },
    { month: "May", loanDisbursed: 95000, otherExpenses: 19000, total: 114000 },
    { month: "Jun", loanDisbursed: 100000, otherExpenses: 20000, total: 120000 },
    { month: "Jul", loanDisbursed: 105000, otherExpenses: 21000, total: 126000 },
    { month: "Aug", loanDisbursed: 110000, otherExpenses: 22000, total: 132000 },
    { month: "Sep", loanDisbursed: 115000, otherExpenses: 23000, total: 138000 },
    { month: "Oct", loanDisbursed: 120000, otherExpenses: 24000, total: 144000 },
    { month: "Nov", loanDisbursed: 125000, otherExpenses: 25000, total: 150000 },
    { month: "Dec", loanDisbursed: 130000, otherExpenses: 26000, total: 156000 },
  ];

  // Handle bar click for navigation
  const handleBarClick = (data: any) => {
    if (data?.activePayload?.[0]?.payload?.month) {
      handleMonthClick(data.activePayload[0].payload.month);
    }
  };

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, entry: any) => sum + entry.value, 0);
      
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{label}</p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-sm" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">{entry.name}</span>
                </div>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  ₹{entry.value.toLocaleString()}
                </span>
              </div>
            ))}
            <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-900 dark:text-gray-100">Total</span>
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  ₹{total.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="dashboard-card bg-gradient-to-br from-white  dark:from-gray-900 border border-blue-100 dark:border-blue-800/30 shadow-lg">
      {/* Header with Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Monthly Dashboard</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {viewType === 'income' ? 'Income breakdown by category' : 'Outcome breakdown by category'}
          </p>
        </div>
        
        {/* Income/Outcome Toggle - Beautiful blue toggle */}
        <div className="flex rounded-xl p-1 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border border-blue-100 dark:border-blue-800">
          <button
            type="button"
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
              viewType === 'income'
                ? 'bg-gradient-to-r from-blue-500 to-sky-500 text-white shadow-lg shadow-blue-500/30'
                : 'text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100'
            }`}
            onClick={() => setViewType('income')}
          >
            Income
          </button>
          <button
            type="button"
            className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
              viewType === 'outcome'
                ? 'bg-gradient-to-r from-blue-500 to-sky-500 text-white shadow-lg shadow-blue-500/30'
                : 'text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100'
            }`}
            onClick={() => setViewType('outcome')}
          >
            Outcome
          </button>
        </div>
      </div>

      {/* Chart Container */}
      <div className="chart-container h-80">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
            <div className="text-gray-500 dark:text-gray-400">Loading chart data...</div>
          </div>
        ) : viewType === 'income' ? (
          // Income View: Beautiful stacked bar chart
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={incomeData}
              onClick={handleBarClick}
              margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
            >
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="#E5E7EB"
                strokeOpacity={0.5}
                vertical={false}
              />
              <XAxis 
                dataKey="month" 
                stroke="#6B7280"
                fontSize={13}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
              />
              <YAxis 
                stroke="#6B7280"
                fontSize={13}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
                tickFormatter={(v) => `₹${v / 1000}k`}
              />
              <Tooltip 
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
              />
              
              {/* Stacked bars with blue gradient colors */}
              <Bar 
                dataKey="principal" 
                stackId="a"
                fill={blueGradientColors.primary}
                name="Principal"
                hide={!activeComponents.includes('principal')}
                radius={[0, 0, 0, 0]}
                maxBarSize={45}
              />
              <Bar 
                dataKey="interest" 
                stackId="a"
                fill={blueGradientColors.primaryLight}
                name="Interest"
                hide={!activeComponents.includes('interest')}
                radius={[0, 0, 0, 0]}
                maxBarSize={45}
              />
              <Bar 
                dataKey="penalty" 
                stackId="a"
                fill={blueGradientColors.primaryDark}
                name="Penalty"
                hide={!activeComponents.includes('penalty')}
                radius={[0, 0, 0, 0]}
                maxBarSize={45}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          // Outcome View: Beautiful stacked bar chart
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={outcomeData}
              onClick={handleBarClick}
              margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
            >
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="#E5E7EB"
                strokeOpacity={0.5}
                vertical={false}
              />
              <XAxis 
                dataKey="month" 
                stroke="#6B7280"
                fontSize={13}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
              />
              <YAxis 
                stroke="#6B7280"
                fontSize={13}
                tickLine={false}
                axisLine={{ stroke: "#E5E7EB" }}
                tickFormatter={(v) => `₹${v / 1000}k`}
              />
              <Tooltip 
                content={<CustomTooltip />}
                cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
              />
              
              {/* Stacked bars with blue gradient colors */}
              <Bar 
                dataKey="loanDisbursed" 
                stackId="b"
                fill={blueGradientColors.primaryDark}
                name="Loan Disbursed"
                hide={!activeComponents.includes('loanDisbursed')}
                radius={[4, 4, 0, 0]}
                maxBarSize={45}
              />
              <Bar 
                dataKey="otherExpenses" 
                stackId="b"
                fill={blueGradientColors.primaryLight}
                name="Other Expenses"
                hide={!activeComponents.includes('otherExpenses')}
                radius={[0, 0, 4, 4]}
                maxBarSize={45}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      
      {/* Footer Stats */}
      <div className="flex items-center justify-between mb-6">
        {/* Legend */}
        {viewType === 'income' ? (
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            <button
              onClick={() => handleComponentToggle('principal')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeComponents.includes('principal') 
                  ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                  : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 opacity-60'
              }`}
            >
              <div 
                className="w-3 h-3 rounded-sm" 
                style={{ backgroundColor: blueGradientColors.primary }}
              />
              <span className={`text-sm font-medium ${
                activeComponents.includes('principal') 
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                Principal
              </span>
            </button>
            <button
              onClick={() => handleComponentToggle('interest')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeComponents.includes('interest') 
                  ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                  : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 opacity-60'
              }`}
            >
              <div 
                className="w-3 h-3 rounded-sm" 
                style={{ backgroundColor: blueGradientColors.primaryLight }}
              />
              <span className={`text-sm font-medium ${
                activeComponents.includes('interest') 
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                Interest
              </span>
            </button>
            <button
              onClick={() => handleComponentToggle('penalty')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeComponents.includes('penalty') 
                  ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                  : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 opacity-60'
              }`}
            >
              <div 
                className="w-3 h-3 rounded-sm" 
                style={{ backgroundColor: blueGradientColors.primaryDark }}
              />
              <span className={`text-sm font-medium ${
                activeComponents.includes('penalty') 
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                Penalty
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-4 mt-6">
            <button
              onClick={() => handleComponentToggle('loanDisbursed')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeComponents.includes('loanDisbursed') 
                  ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                  : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 opacity-60'
              }`}
            >
              <div 
                className="w-3 h-3 rounded-sm" 
                style={{ backgroundColor: blueGradientColors.primaryDark }}
              />
              <span className={`text-sm font-medium ${
                activeComponents.includes('loanDisbursed') 
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                Loan Disbursed
              </span>
            </button>
            <button
              onClick={() => handleComponentToggle('otherExpenses')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                activeComponents.includes('otherExpenses') 
                  ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
                  : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 opacity-60'
              }`}
            >
              <div 
                className="w-3 h-3 rounded-sm" 
                style={{ backgroundColor: blueGradientColors.primaryLight }}
              />
              <span className={`text-sm font-medium ${
                activeComponents.includes('otherExpenses') 
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}>
                Other Expenses
              </span>
            </button>
          </div>
        )}
   
        {/* <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700"> */}
          <div className="flex flex-wrap justify-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {viewType === 'income' 
                  ? `₹${incomeData.reduce((sum, item) => sum + item.total, 0).toLocaleString()}`
                  : `₹${outcomeData.reduce((sum, item) => sum + item.total, 0).toLocaleString()}`
                }
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total {viewType}</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                {viewType === 'income' ? incomeData.length : outcomeData.length}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Months</div>
            </div>
          </div>
        {/* </div> */}
      </div>
    </div>

  );
}


// 📈 Income vs Outcome Chart 
export function IncomeOutcomeChart() {
  const [data, setData] = useState<IncomeOutcomeData[]>([]);
  
  useEffect(() => {
    apiClient.get('/payments/paymentDeteils').then((res) => {
      if (res.data.success) {
        // Transform the data if needed
        const transformedData = res.data.plannedVsActualData?.map((item : any) => ({
          month: item.month,
          outcome: item.outcome || 0, // Use outcome instead of planned
          income: item.income || 0,    // Use income instead of actual
        })) || [];
        setData(transformedData);
      }
    }).catch((err) => {
      console.error("Error fetching income vs outcome data:", err);
      // Fallback mock data
      setData([
        { month: "Jan", income: 45000, outcome: 40000 },
        { month: "Feb", income: 52000, outcome: 45000 },
        { month: "Mar", income: 48000, outcome: 42000 },
        { month: "Apr", income: 61000, outcome: 55000 },
        { month: "May", income: 55000, outcome: 50000 },
        { month: "Jun", income: 67000, outcome: 60000 },
        { month: "Jul", income: 71000, outcome: 65000 },
        { month: "Aug", income: 69000, outcome: 63000 },
        { month: "Sep", income: 73000, outcome: 68000 },
        { month: "Oct", income: 76000, outcome: 70000 },
        { month: "Nov", income: 82000, outcome: 75000 },
        { month: "Dec", income: 75000, outcome: 70000 },
      ]);
    });
  }, []);

  return (

    <div className="dashboard-card bg-gradient-to-br from-white  dark:from-gray-900 border border-blue-100 dark:border-blue-800/30 shadow-lg">
      <h3 className="text-lg font-semibold mb-4">Incomne vs Outcome</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(v) => `₹${v / 1000}k`} />
          <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
          <Line type="monotone" dataKey="income" stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
          <Line type="monotone" dataKey="outcome" stroke="hsl(var(--primary))" strokeWidth={3} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Export all chart components
export default function Charts() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <IncomeVsPenaltyChart />
      <MonthlyChart />
      <div className="md:col-span-2">
        <IncomeOutcomeChart />
      </div>
    </div>
  );
}