import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Monitor, Smartphone, Clock, MapPin, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
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

interface LoginEntry {
  id: number;
  date: string;
  time: string;
  staffName: string;
  role: string;
  staffCode: string;
  loginDuration: string;
  device: string;
  ipAddress: string;
  financeName: string;
  distanceFromOffice: number;
  userLocation: string;
  lat: number;
  lng: number;
  timeline: { login: string; logout: string; duration: string }[];
}

const mockLogins: LoginEntry[] = [
  { id: 1, date: "2026-03-21", time: "09:00 AM", staffName: "Rajesh Kumar", role: "Collection", staffCode: "STF001", loginDuration: "8h 30m", device: "Mobile", ipAddress: "192.168.1.10", financeName: "ABC Finance", distanceFromOffice: 0.5, userLocation: "Office, Coimbatore", lat: 11.0168, lng: 76.9558, timeline: [{ login: "09:00 AM", logout: "01:00 PM", duration: "4h 00m" }, { login: "02:00 PM", logout: "06:30 PM", duration: "4h 30m" }] },
  { id: 2, date: "2026-03-21", time: "09:15 AM", staffName: "Priya M", role: "Agent", staffCode: "STF002", loginDuration: "7h 45m", device: "Mobile", ipAddress: "192.168.1.25", financeName: "XYZ Finance", distanceFromOffice: 3.2, userLocation: "Gandhipuram, Coimbatore", lat: 11.0180, lng: 76.9570, timeline: [{ login: "09:15 AM", logout: "12:45 PM", duration: "3h 30m" }, { login: "01:30 PM", logout: "05:45 PM", duration: "4h 15m" }] },
  { id: 3, date: "2026-03-21", time: "10:00 AM", staffName: "Suresh V", role: "Staff", staffCode: "STF003", loginDuration: "6h 15m", device: "Desktop", ipAddress: "192.168.1.5", financeName: "ABC Finance", distanceFromOffice: 0.0, userLocation: "Office, Coimbatore", lat: 11.0168, lng: 76.9558, timeline: [{ login: "10:00 AM", logout: "01:00 PM", duration: "3h 00m" }, { login: "02:00 PM", logout: "05:15 PM", duration: "3h 15m" }] },
  { id: 4, date: "2026-03-20", time: "08:45 AM", staffName: "Rajesh Kumar", role: "Collection", staffCode: "STF001", loginDuration: "9h 00m", device: "Mobile", ipAddress: "192.168.1.10", financeName: "ABC Finance", distanceFromOffice: 12.5, userLocation: "Saibaba Colony, Coimbatore", lat: 11.004, lng: 76.961, timeline: [{ login: "08:45 AM", logout: "01:30 PM", duration: "4h 45m" }, { login: "02:15 PM", logout: "06:00 PM", duration: "3h 45m" }] },
  { id: 5, date: "2026-03-20", time: "09:30 AM", staffName: "Priya M", role: "Agent", staffCode: "STF002", loginDuration: "5h 30m", device: "Mobile", ipAddress: "192.168.1.25", financeName: "XYZ Finance", distanceFromOffice: 8.7, userLocation: "Peelamedu, Coimbatore", lat: 11.012, lng: 76.968, timeline: [{ login: "09:30 AM", logout: "03:00 PM", duration: "5h 30m" }] },
];

const staffList = [...new Set(mockLogins.map((d) => d.staffName))];
const roleList = [...new Set(mockLogins.map((d) => d.role))];

export default function StaffLoginReport() {
  const [staffFilter, setStaffFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [fromDate, setFromDate] = useState<Date>();
  const [toDate, setToDate] = useState<Date>();
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const filtered = mockLogins.filter((entry) => {
    if (staffFilter && staffFilter !== "all" && !entry.staffName.toLowerCase().includes(staffFilter.toLowerCase())) return false;
    if (roleFilter && roleFilter !== "all" && entry.role !== roleFilter) return false;
    if (fromDate && new Date(entry.date) < fromDate) return false;
    if (toDate && new Date(entry.date) > toDate) return false;
    return true;
  });

  const openMaps = (lat: number, lng: number) => {
    window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Staff App Login Report</h1>
        <p className="text-sm text-muted-foreground">Monitor staff login activity and session duration</p>
      </motion.div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Select value={staffFilter} onValueChange={setStaffFilter}>
              <SelectTrigger><SelectValue placeholder="Staff Name" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Staff</SelectItem>
                {staffList.map((s) => (<SelectItem key={s} value={s}>{s}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                {roleList.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
              </SelectContent>
            </Select>
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

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[65vh]">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                <TableRow>
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Staff</TableHead>
                  <TableHead className="text-xs">Code</TableHead>
                  <TableHead className="text-xs">Duration</TableHead>
                  <TableHead className="text-xs">Device</TableHead>
                  <TableHead className="text-xs">IP Address</TableHead>
                  <TableHead className="text-xs">Finance</TableHead>
                  <TableHead className="text-xs">Office Dist.</TableHead>
                  <TableHead className="text-xs">Location</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <>
                    <TableRow key={entry.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => setExpandedRow(expandedRow === entry.id ? null : entry.id)}>
                      <TableCell className="p-2">
                        {expandedRow === entry.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="text-xs">{entry.date}</TableCell>
                      <TableCell className="text-xs font-mono">{entry.time}</TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-foreground">{entry.staffName}</p>
                          <Badge variant="outline" className="text-[10px]">{entry.role}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{entry.staffCode}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="h-3 w-3 mr-1" />{entry.loginDuration}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {entry.device === "Mobile" ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                          {entry.device}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{entry.ipAddress}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{entry.financeName}</TableCell>
                      <TableCell>
                        <Badge variant={entry.distanceFromOffice > 10 ? "destructive" : "outline"} className="text-xs">
                          {entry.distanceFromOffice.toFixed(1)} KM
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button onClick={(e) => { e.stopPropagation(); openMaps(entry.lat, entry.lng); }} className="flex items-center gap-1 text-xs text-primary hover:underline">
                          <MapPin className="h-3 w-3" />{entry.userLocation}
                        </button>
                      </TableCell>
                    </TableRow>
                    <AnimatePresence>
                      {expandedRow === entry.id && (
                        <TableRow key={`${entry.id}-timeline`}>
                          <TableCell colSpan={11} className="p-0">
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="p-4 bg-muted/30 border-t border-border">
                                <p className="text-xs font-semibold text-foreground mb-3">Login Timeline</p>
                                <div className="space-y-2">
                                  {entry.timeline.map((t, i) => (
                                    <div key={i} className="flex items-center gap-4 text-xs">
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                        <span className="text-muted-foreground">Login:</span>
                                        <span className="font-mono font-medium text-foreground">{t.login}</span>
                                      </div>
                                      <span className="text-muted-foreground">→</span>
                                      <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-red-500" />
                                        <span className="text-muted-foreground">Logout:</span>
                                        <span className="font-mono font-medium text-foreground">{t.logout}</span>
                                      </div>
                                      <Badge variant="secondary" className="text-[10px]">{t.duration}</Badge>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </motion.div>
                          </TableCell>
                        </TableRow>
                      )}
                    </AnimatePresence>
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
