import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, MessageSquare, X, Bot, User, Tag, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

interface LogEntry {
  id: number; customer: string; phone: string; hpl: string; vehicle: string;
  date: string; sentiment: "positive" | "negative" | "neutral"; status: "Resolved" | "Pending";
  messages: { role: "ai" | "customer"; text: string; time: string }[];
  tags: string[];
}

const dummyLogs: LogEntry[] = [
  {
    id: 1, customer: "Rajesh Kumar", phone: "9876543210", hpl: "HPL-2024-001", vehicle: "KA-01-AB-1234", date: "2026-03-23 10:30", sentiment: "positive", status: "Resolved", tags: ["Payment Reminder"], messages: [
      { role: "ai", text: "Hello Rajesh! This is a reminder that your EMI of ₹8,500 is due on 25th March. Would you like to make the payment now?", time: "10:30 AM" },
      { role: "customer", text: "Yes, I'll pay today evening. Thank you for the reminder.", time: "10:32 AM" },
      { role: "ai", text: "Great! I've noted that. You'll receive a payment link shortly. Have a good day! 😊", time: "10:32 AM" },
    ]
  },
  {
    id: 2, customer: "Priya Sharma", phone: "9123456789", hpl: "HPL-2024-015", vehicle: "MH-02-CD-5678", date: "2026-03-23 09:15", sentiment: "negative", status: "Pending", tags: ["Overdue", "Complaint"], messages: [
      { role: "ai", text: "Hi Priya, we noticed your EMI payment of ₹12,000 is overdue by 5 days. Please clear it to avoid late charges.", time: "9:15 AM" },
      { role: "customer", text: "I already told your agent I need more time. Stop calling me!", time: "9:18 AM" },
      { role: "ai", text: "I understand your concern, Priya. Let me connect you with our team to discuss a revised schedule. We're here to help.", time: "9:18 AM" },
    ]
  },
  {
    id: 3, customer: "Anil Verma", phone: "9988776655", hpl: "HPL-2024-032", vehicle: "DL-03-EF-9012", date: "2026-03-22 14:45", sentiment: "neutral", status: "Resolved", tags: ["Inquiry"], messages: [
      { role: "customer", text: "What is my current outstanding balance?", time: "2:45 PM" },
      { role: "ai", text: "Your current outstanding balance is ₹1,45,000 with 12 EMIs remaining. Next EMI due: April 1st.", time: "2:45 PM" },
    ]
  },
  {
    id: 4, customer: "Sunita Devi", phone: "9012345678", hpl: "HPL-2024-044", vehicle: "UP-04-GH-3456", date: "2026-03-22 11:20", sentiment: "positive", status: "Resolved", tags: ["Payment Reminder"], messages: [
      { role: "ai", text: "Namaste Sunita ji! Your monthly EMI of ₹6,200 is due in 3 days.", time: "11:20 AM" },
      { role: "customer", text: "Thank you. I will pay tomorrow.", time: "11:25 AM" },
    ]
  },
  {
    id: 5, customer: "Mohit Singh", phone: "9876501234", hpl: "HPL-2024-058", vehicle: "RJ-05-IJ-7890", date: "2026-03-21 16:00", sentiment: "negative", status: "Pending", tags: ["Overdue", "Recovery Needed"], messages: [
      { role: "ai", text: "Hi Mohit, your EMI is overdue by 15 days. Please clear ₹9,800 immediately to avoid further penalties.", time: "4:00 PM" },
      { role: "customer", text: "I don't have money right now. Do whatever you want.", time: "4:05 PM" },
      { role: "ai", text: "I understand the difficulty. Our recovery team will contact you to discuss options. Please cooperate for the best resolution.", time: "4:06 PM" },
    ]
  },
  {
    id: 6, customer: "Kavita Patel", phone: "9543216789", hpl: "HPL-2024-071", vehicle: "GJ-06-KL-2345", date: "2026-03-21 08:50", sentiment: "positive", status: "Resolved", tags: ["Payment Reminder"], messages: [
      { role: "ai", text: "Good morning Kavita! Quick reminder: EMI of ₹7,100 is due on 24th March.", time: "8:50 AM" },
      { role: "customer", text: "Already paid via UPI. Please check.", time: "8:55 AM" },
      { role: "ai", text: "Payment confirmed! ₹7,100 received. Thank you! 🙏", time: "8:56 AM" },
    ]
  },
];

const sentimentBadge = (s: string) => {
  if (s === "positive") return <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Positive</Badge>;
  if (s === "negative") return <Badge className="bg-red-500/15 text-red-700 border-red-500/30">Negative</Badge>;
  return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30">Neutral</Badge>;
};

const statusBadge = (s: string) => s === "Resolved"
  ? <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Resolved</Badge>
  : <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">Pending</Badge>;

export default function AILogs() {
  const [search, setSearch] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 10;

  const debounceTimer = useState<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    if (debounceTimer[0]) clearTimeout(debounceTimer[0]);
    debounceTimer[0] = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  const filtered = useMemo(() => {
    return dummyLogs.filter((l) => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch = !q || l.customer.toLowerCase().includes(q) || l.phone.includes(q) || l.hpl.toLowerCase().includes(q) || l.vehicle.toLowerCase().includes(q);
      const matchSentiment = sentimentFilter === "all" || l.sentiment === sentimentFilter;
      const matchStatus = statusFilter === "all" || l.status === statusFilter;
      return matchSearch && matchSentiment && matchStatus;
    });
  }, [debouncedSearch, sentimentFilter, statusFilter]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="h-7 w-7 text-primary" /> Conversation Logs
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Review all AI-customer interactions</p>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search customer, phone, HPL, vehicle..." value={search} onChange={(e) => handleSearch(e.target.value)} className="pl-9" />
                </div>
              </div>
              <Select value={sentimentFilter} onValueChange={setSentimentFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Sentiment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sentiment</SelectItem>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); setDebouncedSearch(""); setSentimentFilter("all"); setStatusFilter("all"); }}>
                <Filter className="h-4 w-4 mr-1" /> Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="hover:shadow-lg transition-shadow">
          <CardContent className="p-0">
            <div className="overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>HPL No</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setSelectedLog(log)}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {log.customer}
                          {log.tags.includes("Recovery Needed") && <AlertTriangle className="h-4 w-4 text-red-500" />}
                        </div>
                      </TableCell>
                      <TableCell>{log.phone}</TableCell>
                      <TableCell>{log.hpl}</TableCell>
                      <TableCell>{log.vehicle}</TableCell>
                      <TableCell className="text-sm">{log.date}</TableCell>
                      <TableCell>{sentimentBadge(log.sentiment)}</TableCell>
                      <TableCell>{statusBadge(log.status)}</TableCell>
                      <TableCell><Button variant="ghost" size="sm">View</Button></TableCell>
                    </TableRow>
                  ))}
                  {paginated.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No logs found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t">
                <p className="text-sm text-muted-foreground">Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, filtered.length)} of {filtered.length}</p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Chat Detail Modal */}
      <AnimatePresence>
        {selectedLog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedLog(null)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{selectedLog.customer}</h3>
                  <p className="text-xs text-muted-foreground">{selectedLog.hpl} • {selectedLog.vehicle}</p>
                </div>
                <div className="flex items-center gap-2">
                  {sentimentBadge(selectedLog.sentiment)}
                  <Button variant="ghost" size="sm" onClick={() => setSelectedLog(null)}><X className="h-4 w-4" /></Button>
                </div>
              </div>

              {/* Tags */}
              <div className="px-4 pt-3 flex gap-2 flex-wrap">
                {selectedLog.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs"><Tag className="h-3 w-3 mr-1" />{tag}</Badge>
                ))}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedLog.messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "customer" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === "ai" ? "bg-primary/10 text-foreground rounded-bl-sm" : "bg-muted text-foreground rounded-br-sm"}`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        {msg.role === "ai" ? <Bot className="h-3.5 w-3.5 text-primary" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                      </div>
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
