import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Search, ExternalLink, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { CapitalizedInput } from "../common/CapitalizedInput";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { format } from "date-fns";

interface TrackingEntry {
  id: number;
  dateTime: string;
  staffName: string;
  role: string;
  staffCode: string;
  hplNo: string;
  customerName: string;
  vehicleNumber: string;
  financeName: string;
  meetDistance: number;
  customerLat: number;
  customerLng: number;
  meetingLat: number;
  meetingLng: number;
  customerLocation: string;
  meetingLocation: string;
}

const mockData: TrackingEntry[] = [
  { id: 1, dateTime: "2026-03-21 09:30", staffName: "Rajesh Kumar", role: "Collection", staffCode: "STF001", hplNo: "HPL 931", customerName: "SELVA PRABU", vehicleNumber: "TN38 DP 7000", financeName: "ABC Finance", meetDistance: 2.5, customerLat: 11.0168, customerLng: 76.9558, meetingLat: 11.0180, meetingLng: 76.9570, customerLocation: "Gandhipuram, Coimbatore", meetingLocation: "RS Puram, Coimbatore" },
  { id: 2, dateTime: "2026-03-21 10:15", staffName: "Rajesh Kumar", role: "Collection", staffCode: "STF001", hplNo: "HPL 845", customerName: "MURUGAN S", vehicleNumber: "TN38 AK 5432", financeName: "ABC Finance", meetDistance: 8.3, customerLat: 11.0040, customerLng: 76.9610, meetingLat: 11.0120, meetingLng: 76.9680, customerLocation: "Saibaba Colony, Coimbatore", meetingLocation: "Peelamedu, Coimbatore" },
  { id: 3, dateTime: "2026-03-21 11:00", staffName: "Priya M", role: "Agent", staffCode: "STF002", hplNo: "HPL 720", customerName: "KARTHIK R", vehicleNumber: "TN43 BC 1234", financeName: "XYZ Finance", meetDistance: 15.7, customerLat: 11.0300, customerLng: 76.9400, meetingLat: 11.0500, meetingLng: 76.9200, customerLocation: "Ukkadam, Coimbatore", meetingLocation: "Singanallur, Coimbatore" },
  { id: 4, dateTime: "2026-03-21 14:30", staffName: "Suresh V", role: "Staff", staffCode: "STF003", hplNo: "HPL 612", customerName: "LAKSHMI N", vehicleNumber: "TN38 CD 9876", financeName: "ABC Finance", meetDistance: 3.1, customerLat: 11.0250, customerLng: 76.9500, meetingLat: 11.0270, meetingLng: 76.9520, customerLocation: "Town Hall, Coimbatore", meetingLocation: "Oppanakara St, Coimbatore" },
  { id: 5, dateTime: "2026-03-20 09:00", staffName: "Priya M", role: "Agent", staffCode: "STF002", hplNo: "HPL 503", customerName: "ANAND K", vehicleNumber: "TN43 EF 5678", financeName: "XYZ Finance", meetDistance: 22.4, customerLat: 11.0100, customerLng: 76.9700, meetingLat: 11.0600, meetingLng: 76.9100, customerLocation: "Vadavalli, Coimbatore", meetingLocation: "Thudiyalur, Coimbatore" },
  { id: 6, dateTime: "2026-03-20 11:45", staffName: "Rajesh Kumar", role: "Collection", staffCode: "STF001", hplNo: "HPL 489", customerName: "DEEPA S", vehicleNumber: "TN38 GH 3210", financeName: "ABC Finance", meetDistance: 5.6, customerLat: 11.0200, customerLng: 76.9550, meetingLat: 11.0260, meetingLng: 76.9600, customerLocation: "Race Course, Coimbatore", meetingLocation: "Avinashi Rd, Coimbatore" },
];

const staffList = [...new Set(mockData.map((d) => d.staffName))];

export default function StaffLocationReport() {
  const [staffFilter, setStaffFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [hplFilter, setHplFilter] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState("");
  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();

  const filtered = mockData.filter((entry) => {
    if (staffFilter && !entry.staffName.toLowerCase().includes(staffFilter.toLowerCase())) return false;
    if (customerFilter && !entry.customerName.toLowerCase().includes(customerFilter.toLowerCase())) return false;
    if (hplFilter && !entry.hplNo.toLowerCase().includes(hplFilter.toLowerCase())) return false;
    if (vehicleFilter && !entry.vehicleNumber.toLowerCase().includes(vehicleFilter.toLowerCase())) return false;
    if (fromDate && new Date(entry.dateTime) < fromDate) return false;
    if (toDate && new Date(entry.dateTime) > toDate) return false;
    return true;
  });

  const staffDistances = filtered.reduce((acc, e) => {
    acc[e.staffName] = (acc[e.staffName] || 0) + e.meetDistance;
    return acc;
  }, {} as Record<string, number>);

  const openMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Staff Location Report</h1>
        <p className="text-sm text-muted-foreground">Track staff visits and meeting locations</p>
      </motion.div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger><SelectValue placeholder="Staff Name" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffList.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
              </SelectContent>
            </Select>
            <CapitalizedInput casing="words" placeholder="Customer Name" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} />
            <CapitalizedInput casing="upper" placeholder="HPL No" value={hplFilter} onChange={(e) => setHplFilter(e.target.value)} />
            <CapitalizedInput casing="upper" placeholder="Vehicle No" value={vehicleFilter} onChange={(e) => setVehicleFilter(e.target.value)} />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  {fromDate ? format(fromDate, "dd/MM/yyyy") : "From Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={fromDate} onSelect={setFromDate} className="pointer-events-auto" /></PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal">
                  {toDate ? format(toDate, "dd/MM/yyyy") : "To Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={toDate} onSelect={setToDate} className="pointer-events-auto" /></PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Staff Distance Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(staffDistances).map(([name, dist]) => (
          <Card key={name}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">{name}</p>
              <p className="text-lg font-bold text-foreground">{dist.toFixed(1)} KM</p>
              <p className="text-[10px] text-muted-foreground">Total Distance</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[60vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                <TableRow>
                  <TableHead className="text-xs">Date & Time</TableHead>
                  <TableHead className="text-xs">Staff</TableHead>
                  <TableHead className="text-xs">Code</TableHead>
                  <TableHead className="text-xs">Customer</TableHead>
                  <TableHead className="text-xs">Vehicle</TableHead>
                  <TableHead className="text-xs">Finance</TableHead>
                  <TableHead className="text-xs">Distance</TableHead>
                  <TableHead className="text-xs">Customer Location</TableHead>
                  <TableHead className="text-xs">Meeting Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <TableRow key={entry.id} className="hover:bg-muted/50">
                    <TableCell className="text-xs whitespace-nowrap">{entry.dateTime}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{entry.staffName}</p>
                        <Badge variant="outline" className="text-[10px] mt-0.5">{entry.role}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{entry.staffCode}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-xs font-mono text-primary">{entry.hplNo}</p>
                        <p className="text-sm font-semibold text-foreground">{entry.customerName}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-foreground">{entry.vehicleNumber}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{entry.financeName}</TableCell>
                    <TableCell>
                      <Badge variant={entry.meetDistance > 15 ? "destructive" : entry.meetDistance > 8 ? "secondary" : "outline"} className="text-xs">
                        {entry.meetDistance > 15 && <AlertTriangle className="h-3 w-3 mr-1" />}
                        {entry.meetDistance.toFixed(1)} KM
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => openMaps(entry.customerLat, entry.customerLng)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <MapPin className="h-3 w-3" />{entry.customerLocation}<ExternalLink className="h-3 w-3" />
                      </button>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => openMaps(entry.meetingLat, entry.meetingLng)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <MapPin className="h-3 w-3" />{entry.meetingLocation}<ExternalLink className="h-3 w-3" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
