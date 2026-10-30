// Shared mock data & types for Customer Locator module

export interface CustomerLocation {
  id: number;
  customerId: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  address: string;
  isHomeLocation: boolean;
  distanceFromHome: number;
  durationStayed?: string;
}

export interface Customer {
  id: number;
  name: string;
  hplNumber: string;
  phone: string;
  vehicleNumber: string;
  financeName: string;
  homeLatitude: number;
  homeLongitude: number;
  homeAddress: string;
  currentLatitude: number;
  currentLongitude: number;
  currentAddress: string;
  distanceFromHome: number;
  overdueAmount: number;
  overdueDays: number;
  lastSeenHome: string;
  riskLevel: "safe" | "warning" | "high" | "critical";
  riskScore: number;
  assignedAgent?: string;
}

export interface Agent {
  id: number;
  name: string;
  phone: string;
  assignedZone: string;
  currentLatitude: number;
  currentLongitude: number;
  lastUpdate: string;
  assignedCustomers: number[];
  status: "online" | "offline";
}

export interface Payment {
  id: number;
  loanId: number;
  amount: number;
  dueDate: string;
  paymentDate: string | null;
  mode: string;
  collectedBy: string;
  status: "paid" | "missed" | "late";
}

export interface Loan {
  id: number;
  customerId: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  emiAmount: number;
  interestType: string;
  nextDueDate: string;
  overdueDays: number;
  penaltyAmount: number;
}

export function getRiskLevel(distance: number): Customer["riskLevel"] {
  if (distance > 50) return "critical";
  if (distance > 25) return "high";
  if (distance > 10) return "warning";
  return "safe";
}

export function getRiskColor(level: Customer["riskLevel"]) {
  switch (level) {
    case "safe": return "text-green-600 bg-green-100 border-green-300";
    case "warning": return "text-yellow-700 bg-yellow-100 border-yellow-300";
    case "high": return "text-red-600 bg-red-100 border-red-300";
    case "critical": return "text-red-800 bg-red-200 border-red-500";
  }
}

export function getRiskBadgeVariant(level: Customer["riskLevel"]) {
  switch (level) {
    case "safe": return "bg-green-500/15 text-green-700 border-green-300";
    case "warning": return "bg-yellow-500/15 text-yellow-700 border-yellow-300";
    case "high": return "bg-red-500/15 text-red-700 border-red-300";
    case "critical": return "bg-red-600/20 text-red-800 border-red-500";
  }
}

export function calculateRiskScore(distanceKm: number, overdueDays: number, longStayAway: boolean): number {
  const distRisk = Math.min(distanceKm / 50, 1) * 40;
  const payRisk = Math.min(overdueDays / 90, 1) * 40;
  const dwellRisk = longStayAway ? 20 : 0;
  return Math.round(distRisk + payRisk + dwellRisk);
}

export const mockCustomers: Customer[] = [
  { id: 1, name: "Rajesh Kumar", hplNumber: "HPL-2024-001", phone: "9876543210", vehicleNumber: "TN-01-AB-1234", financeName: "RIM Finance", homeLatitude: 13.0827, homeLongitude: 80.2707, homeAddress: "T. Nagar, Chennai", currentLatitude: 13.0500, currentLongitude: 80.2100, currentAddress: "Guindy, Chennai", distanceFromHome: 8.2, overdueAmount: 15000, overdueDays: 5, lastSeenHome: "2026-03-23 09:30 AM", riskLevel: "safe", riskScore: 18, assignedAgent: "Suresh M" },
  { id: 2, name: "Priya Sharma", hplNumber: "HPL-2024-002", phone: "9876543211", vehicleNumber: "TN-02-CD-5678", financeName: "RIM Finance", homeLatitude: 12.9716, homeLongitude: 77.5946, homeAddress: "MG Road, Bangalore", currentLatitude: 13.3500, currentLongitude: 77.1200, currentAddress: "Tumkur, Karnataka", distanceFromHome: 52.4, overdueAmount: 45000, overdueDays: 32, lastSeenHome: "2026-03-10 06:15 PM", riskLevel: "critical", riskScore: 85, assignedAgent: "Arun K" },
  { id: 3, name: "Mohammed Ali", hplNumber: "HPL-2024-003", phone: "9876543212", vehicleNumber: "KA-03-EF-9012", financeName: "Star Finance", homeLatitude: 17.3850, homeLongitude: 78.4867, homeAddress: "Ameerpet, Hyderabad", currentLatitude: 17.4500, currentLongitude: 78.3800, currentAddress: "Kukatpally, Hyderabad", distanceFromHome: 12.1, overdueAmount: 8500, overdueDays: 12, lastSeenHome: "2026-03-21 11:00 AM", riskLevel: "warning", riskScore: 35 },
  { id: 4, name: "Anitha Devi", hplNumber: "HPL-2024-004", phone: "9876543213", vehicleNumber: "AP-04-GH-3456", financeName: "RIM Finance", homeLatitude: 11.0168, homeLongitude: 76.9558, homeAddress: "RS Puram, Coimbatore", currentLatitude: 10.7905, currentLongitude: 78.7047, currentAddress: "Trichy, Tamil Nadu", distanceFromHome: 32.8, overdueAmount: 28000, overdueDays: 45, lastSeenHome: "2026-03-05 08:45 AM", riskLevel: "high", riskScore: 72 },
  { id: 5, name: "Vikram Singh", hplNumber: "HPL-2024-005", phone: "9876543214", vehicleNumber: "TN-05-IJ-7890", financeName: "Star Finance", homeLatitude: 9.9252, homeLongitude: 78.1198, homeAddress: "Anna Nagar, Madurai", currentLatitude: 9.9300, currentLongitude: 78.1100, currentAddress: "KK Nagar, Madurai", distanceFromHome: 2.3, overdueAmount: 0, overdueDays: 0, lastSeenHome: "2026-03-24 07:00 AM", riskLevel: "safe", riskScore: 5 },
  { id: 6, name: "Lakshmi Narayanan", hplNumber: "HPL-2024-006", phone: "9876543215", vehicleNumber: "KA-06-KL-2345", financeName: "RIM Finance", homeLatitude: 12.2958, homeLongitude: 76.6394, homeAddress: "Vijayanagar, Mysore", currentLatitude: 12.9716, currentLongitude: 77.5946, currentAddress: "MG Road, Bangalore", distanceFromHome: 78.5, overdueAmount: 62000, overdueDays: 60, lastSeenHome: "2026-02-28 04:00 PM", riskLevel: "critical", riskScore: 95 },
  { id: 7, name: "Karthik Rajan", hplNumber: "HPL-2024-007", phone: "9876543216", vehicleNumber: "TN-07-MN-6789", financeName: "RIM Finance", homeLatitude: 13.0827, homeLongitude: 80.2707, homeAddress: "Adyar, Chennai", currentLatitude: 12.8700, currentLongitude: 80.2200, currentAddress: "Chengalpattu", distanceFromHome: 24.1, overdueAmount: 12000, overdueDays: 18, lastSeenHome: "2026-03-18 10:30 AM", riskLevel: "warning", riskScore: 42 },
  { id: 8, name: "Deepa Venkatesh", hplNumber: "HPL-2024-008", phone: "9876543217", vehicleNumber: "AP-08-OP-0123", financeName: "Star Finance", homeLatitude: 17.6868, homeLongitude: 83.2185, homeAddress: "MVP Colony, Vizag", currentLatitude: 16.5062, currentLongitude: 80.6480, currentAddress: "Vijayawada", distanceFromHome: 135.2, overdueAmount: 75000, overdueDays: 75, lastSeenHome: "2026-02-15 09:00 AM", riskLevel: "critical", riskScore: 98 },
];

export const mockAgents: Agent[] = [
  { id: 1, name: "Suresh M", phone: "9988776601", assignedZone: "Chennai South", currentLatitude: 13.0400, currentLongitude: 80.2400, lastUpdate: "2026-03-24 10:15 AM", assignedCustomers: [1, 7], status: "online" },
  { id: 2, name: "Arun K", phone: "9988776602", assignedZone: "Bangalore", currentLatitude: 12.9800, currentLongitude: 77.5700, lastUpdate: "2026-03-24 10:12 AM", assignedCustomers: [2], status: "online" },
  { id: 3, name: "Meena R", phone: "9988776603", assignedZone: "Hyderabad", currentLatitude: 17.4000, currentLongitude: 78.4500, lastUpdate: "2026-03-24 09:58 AM", assignedCustomers: [3], status: "online" },
  { id: 4, name: "Ravi P", phone: "9988776604", assignedZone: "Coimbatore", currentLatitude: 11.0200, currentLongitude: 76.9600, lastUpdate: "2026-03-24 10:05 AM", assignedCustomers: [4], status: "offline" },
];

export const mockLocationHistory: CustomerLocation[] = [
  { id: 1, customerId: 2, latitude: 13.3500, longitude: 77.1200, timestamp: "2026-03-24 09:00 AM", address: "Tumkur, Karnataka", isHomeLocation: false, distanceFromHome: 52.4, durationStayed: "2h 15m" },
  { id: 2, customerId: 2, latitude: 13.2000, longitude: 77.3000, timestamp: "2026-03-23 04:30 PM", address: "Dabaspet, Karnataka", isHomeLocation: false, distanceFromHome: 38.7, durationStayed: "5h 30m" },
  { id: 3, customerId: 2, latitude: 12.9716, longitude: 77.5946, timestamp: "2026-03-22 08:00 AM", address: "MG Road, Bangalore", isHomeLocation: true, distanceFromHome: 0, durationStayed: "12h" },
  { id: 4, customerId: 2, latitude: 13.0100, longitude: 77.5500, timestamp: "2026-03-21 02:00 PM", address: "Yeshwanthpur, Bangalore", isHomeLocation: false, distanceFromHome: 6.2, durationStayed: "3h" },
  { id: 5, customerId: 2, latitude: 12.9716, longitude: 77.5946, timestamp: "2026-03-20 07:00 AM", address: "MG Road, Bangalore", isHomeLocation: true, distanceFromHome: 0, durationStayed: "14h" },
];

export const mockPayments: Payment[] = [
  { id: 1, loanId: 1, amount: 5000, dueDate: "2026-03-01", paymentDate: "2026-03-02", mode: "UPI", collectedBy: "Suresh M", status: "late" },
  { id: 2, loanId: 1, amount: 5000, dueDate: "2026-02-01", paymentDate: "2026-02-01", mode: "Cash", collectedBy: "Suresh M", status: "paid" },
  { id: 3, loanId: 2, amount: 8000, dueDate: "2026-03-01", paymentDate: null, mode: "-", collectedBy: "-", status: "missed" },
  { id: 4, loanId: 2, amount: 8000, dueDate: "2026-02-01", paymentDate: null, mode: "-", collectedBy: "-", status: "missed" },
  { id: 5, loanId: 2, amount: 8000, dueDate: "2026-01-01", paymentDate: "2026-01-15", mode: "UPI", collectedBy: "Arun K", status: "late" },
];

export const mockLoans: Loan[] = [
  { id: 1, customerId: 1, totalAmount: 300000, paidAmount: 180000, pendingAmount: 120000, emiAmount: 5000, interestType: "Flat", nextDueDate: "2026-04-01", overdueDays: 5, penaltyAmount: 500 },
  { id: 2, customerId: 2, totalAmount: 500000, paidAmount: 150000, pendingAmount: 350000, emiAmount: 8000, interestType: "Reducing", nextDueDate: "2026-03-01", overdueDays: 32, penaltyAmount: 4800 },
  { id: 3, customerId: 4, totalAmount: 400000, paidAmount: 100000, pendingAmount: 300000, emiAmount: 7000, interestType: "Flat", nextDueDate: "2026-02-01", overdueDays: 45, penaltyAmount: 6300 },
  { id: 4, customerId: 6, totalAmount: 600000, paidAmount: 80000, pendingAmount: 520000, emiAmount: 10000, interestType: "Reducing", nextDueDate: "2026-01-01", overdueDays: 60, penaltyAmount: 12000 },
  { id: 5, customerId: 8, totalAmount: 800000, paidAmount: 50000, pendingAmount: 750000, emiAmount: 12000, interestType: "Flat", nextDueDate: "2025-12-01", overdueDays: 75, penaltyAmount: 18000 },
];
