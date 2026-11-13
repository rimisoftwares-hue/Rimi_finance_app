import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, MessageSquare, X, Bot, User, Tag, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { TableSkeletonRows } from "../common";
import { aiApi } from "../../api/aiApi";

interface LogEntry {
  id: number;
  callId?: string;
  logUuid?: string;
  customerId?: string;
  customer: string;
  phone: string;
  hpl: string;
  vehicle: string;
  date: string;
  sentiment: "positive" | "negative" | "neutral";
  status: "Resolved" | "Pending";
  callLifecycleStatus?: string;
  callOutcome?: string;
  summaryText?: string | null;
  messages: { role: "ai" | "customer"; text: string; time: string }[];
  tags: string[];
}

const sentimentBadge = (s: string) => {
  if (s === "positive") return <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Positive</Badge>;
  if (s === "negative") return <Badge className="bg-red-500/15 text-red-700 border-red-500/30">Negative</Badge>;
  return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-500/30">Neutral</Badge>;
};

const statusBadge = (log: LogEntry) => {
  const lifecycle = log.callLifecycleStatus || (log.status === "Resolved" ? "completed" : "pending");
  if (lifecycle === "completed" && log.status === "Resolved") {
    return <Badge className="bg-green-500/15 text-green-700 border-green-500/30">Completed</Badge>;
  }
  if (lifecycle === "failed") {
    return <Badge className="bg-red-500/15 text-red-700 border-red-500/30">Failed</Badge>;
  }
  return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 capitalize">{lifecycle.replace(/_/g, " ")}</Badge>;
};

export default function AILogs() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 10;

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    aiApi
      .getLogs(100)
      .then((res) => {
        if (!mounted) return;
        setLogs(Array.isArray(res?.logs) ? res.logs : []);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.response?.data?.error || err?.message || "Failed to load AI call logs");
        setLogs([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      const q = debouncedSearch.toLowerCase();
      const matchSearch =
        !q ||
        l.customer.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.hpl.toLowerCase().includes(q) ||
        l.vehicle.toLowerCase().includes(q);
      const matchSentiment = sentimentFilter === "all" || l.sentiment === sentimentFilter;
      const matchStatus = statusFilter === "all" || l.status === statusFilter;
      return matchSearch && matchSentiment && matchStatus;
    });
  }, [logs, debouncedSearch, sentimentFilter, statusFilter]);

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const openCallDetails = (log: LogEntry) => {
    const id = log.callId || log.logUuid;
    if (id) {
      navigate(`/ai/calls/${encodeURIComponent(id)}`);
    } else {
      setSelectedLog(log);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-primary" /> Conversation Logs
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Review all verified AI-customer call interactions</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search customer, phone, HPL, vehicle..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={sentimentFilter} onValueChange={(v) => { setSentimentFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Sentiment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sentiment</SelectItem>
                  <SelectItem value="positive">Positive</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                  <SelectItem value="negative">Negative</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                  setSentimentFilter("all");
                  setStatusFilter("all");
                  setPage(1);
                }}
              >
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
                    <TableHead>Lifecycle</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading && (
                    <TableSkeletonRows columns={9} rows={6} />
                  )}
                  {!loading && error && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-red-600">
                        {error}
                      </TableCell>
                    </TableRow>
                  )}
                  {!loading && !error && paginated.map((log) => (
                    <TableRow
                      key={log.logUuid || log.id}
                      className="hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => openCallDetails(log)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {log.customer}
                          {log.tags.includes("Recovery Needed") && <AlertTriangle className="h-4 w-4 text-red-500" />}
                        </div>
                      </TableCell>
                      <TableCell>{log.phone || "—"}</TableCell>
                      <TableCell>{log.hpl}</TableCell>
                      <TableCell>{log.vehicle}</TableCell>
                      <TableCell className="text-sm">{log.date}</TableCell>
                      <TableCell>{sentimentBadge(log.sentiment)}</TableCell>
                      <TableCell>{statusBadge(log)}</TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">
                        {(log.callOutcome || "no_response").replace(/_/g, " ")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                          >
                            Transcript
                          </Button>
                          {(log.callId || log.logUuid) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCallDetails(log);
                              }}
                            >
                              Details <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && !error && paginated.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                        No AI call logs recorded yet for this finance company
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, filtered.length)} of {filtered.length}
                </p>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Prev</Button>
                  <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Quick Transcript Modal */}
      <AnimatePresence>
        {selectedLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 backdrop-blur-[1px] bg-black/25 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedLog(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{selectedLog.customer}</h3>
                  <p className="text-xs text-muted-foreground">{selectedLog.hpl} • {selectedLog.vehicle}</p>
                </div>
                <div className="flex items-center gap-2">
                  {sentimentBadge(selectedLog.sentiment)}
                  {(selectedLog.callId || selectedLog.logUuid) && (
                    <Button size="sm" variant="outline" onClick={() => openCallDetails(selectedLog)}>
                      Full Details <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setSelectedLog(null)}><X className="h-4 w-4" /></Button>
                </div>
              </div>

              {selectedLog.summaryText && (
                <div className="px-4 pt-3">
                  <div className="p-3 rounded-lg bg-muted/40 text-xs text-foreground">
                    <span className="font-semibold">Summary: </span>{selectedLog.summaryText}
                  </div>
                </div>
              )}

              <div className="px-4 pt-3 flex gap-2 flex-wrap">
                {selectedLog.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs capitalize">
                    <Tag className="h-3 w-3 mr-1" />{tag.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {selectedLog.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No transcript turns recorded for this call attempt.
                  </p>
                ) : (
                  selectedLog.messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "customer" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${msg.role === "ai" ? "bg-primary/10 text-foreground rounded-bl-sm" : "bg-muted text-foreground rounded-br-sm"}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          {msg.role === "ai" ? <Bot className="h-3.5 w-3.5 text-primary" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                        </div>
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
