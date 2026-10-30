import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PhoneCall,
  Phone,
  PhoneOff,
  PhoneMissed,
  CheckCircle2,
  Clock,
  Calendar,
  CalendarClock,
  Search,
  Filter,
  RefreshCw,
  Bot,
  Sparkles,
  Users,
  Volume2,
  SkipForward,
  X,
  AlertCircle,
  Copy,
  Settings as SettingsIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "../../hooks/use-toast";

export type LeadCallStatus =
  | "uncalled"
  | "connecting"
  | "speaking"
  | "not_responded"
  | "completed"
  | "failed"
  | "scheduled";

export interface Lead {
  id: string;
  customerName: string;
  avatarColor: string;
  loanId: string;
  phone: string;
  vehicleModel: string;
  vehiclePlate: string;
  dueAmount: number;
  dueDate: string;
  daysOverdue: number;
  lastCall: string;
  callStatus: LeadCallStatus;
  lastCallDuration?: string;
  notes?: string;
  callOutcomeNote?: string;
  scheduledTime?: string;
}

const INITIAL_LEADS: Lead[] = [
  {
    id: "lead-1",
    customerName: "Arjun Kumar",
    avatarColor: "bg-blue-500",
    loanId: "HPL-2024-001",
    phone: "9876543210",
    vehicleModel: "Honda Activa 6G",
    vehiclePlate: "KA-01-AB-1234",
    dueAmount: 5000,
    dueDate: "12 Sep",
    daysOverdue: 3,
    lastCall: "Never",
    callStatus: "uncalled",
  },
  {
    id: "lead-2",
    customerName: "Priya S",
    avatarColor: "bg-purple-500",
    loanId: "HPL-2024-015",
    phone: "9123456789",
    vehicleModel: "TVS Jupiter 125",
    vehiclePlate: "MH-02-CD-5678",
    dueAmount: 3500,
    dueDate: "10 Sep",
    daysOverdue: 5,
    lastCall: "Yesterday",
    callStatus: "not_responded",
    callOutcomeNote: "Customer did not answer after 4 rings",
  },
  {
    id: "lead-3",
    customerName: "Ravi Kumar",
    avatarColor: "bg-emerald-500",
    loanId: "HPL-2024-032",
    phone: "9988776655",
    vehicleModel: "Yamaha FZ-S V3",
    vehiclePlate: "DL-03-EF-9012",
    dueAmount: 7200,
    dueDate: "08 Sep",
    daysOverdue: 7,
    lastCall: "2 days ago",
    callStatus: "completed",
    lastCallDuration: "1m 42s",
    callOutcomeNote: "Customer confirmed payment via UPI by tomorrow morning",
  },
  {
    id: "lead-4",
    customerName: "Sunita Sharma",
    avatarColor: "bg-amber-500",
    loanId: "HPL-2024-044",
    phone: "9012345678",
    vehicleModel: "Hero Splendor+ XTEC",
    vehiclePlate: "UP-04-GH-3456",
    dueAmount: 4800,
    dueDate: "14 Sep",
    daysOverdue: 1,
    lastCall: "Never",
    callStatus: "uncalled",
  },
  {
    id: "lead-5",
    customerName: "Vikram Singh",
    avatarColor: "bg-rose-500",
    loanId: "HPL-2024-058",
    phone: "9876501234",
    vehicleModel: "Royal Enfield Classic 350",
    vehiclePlate: "RJ-14-IJ-7890",
    dueAmount: 14500,
    dueDate: "01 Sep",
    daysOverdue: 14,
    lastCall: "3 days ago",
    callStatus: "scheduled",
    scheduledTime: "Tomorrow, 10:30 AM",
    callOutcomeNote: "Callback requested during office break",
  },
  {
    id: "lead-6",
    customerName: "Rajesh Patel",
    avatarColor: "bg-indigo-500",
    loanId: "HPL-2024-071",
    phone: "9543216789",
    vehicleModel: "Bajaj Pulsar 150",
    vehiclePlate: "GJ-01-KL-2345",
    dueAmount: 6400,
    dueDate: "05 Sep",
    daysOverdue: 10,
    lastCall: "Yesterday",
    callStatus: "not_responded",
    callOutcomeNote: "Busy tone returned by carrier",
  },
  {
    id: "lead-7",
    customerName: "Deepa Nair",
    avatarColor: "bg-teal-500",
    loanId: "HPL-2024-089",
    phone: "9447123456",
    vehicleModel: "Suzuki Access 125",
    vehiclePlate: "KL-07-MN-6789",
    dueAmount: 3200,
    dueDate: "13 Sep",
    daysOverdue: 2,
    lastCall: "Never",
    callStatus: "uncalled",
  },
  {
    id: "lead-8",
    customerName: "Karthik Reddy",
    avatarColor: "bg-cyan-500",
    loanId: "HPL-2024-102",
    phone: "9848012345",
    vehicleModel: "KTM Duke 200",
    vehiclePlate: "TS-09-OP-1122",
    dueAmount: 11000,
    dueDate: "28 Aug",
    daysOverdue: 18,
    lastCall: "4 days ago",
    callStatus: "completed",
    lastCallDuration: "2m 15s",
    callOutcomeNote: "Partial payment of ₹5,000 promised on Friday",
  },
  {
    id: "lead-9",
    customerName: "Amit Joshi",
    avatarColor: "bg-violet-500",
    loanId: "HPL-2024-118",
    phone: "9765432109",
    vehicleModel: "Honda Shine 125",
    vehiclePlate: "UP-32-QR-3344",
    dueAmount: 5600,
    dueDate: "07 Sep",
    daysOverdue: 8,
    lastCall: "Never",
    callStatus: "uncalled",
  },
  {
    id: "lead-10",
    customerName: "Pooja Verma",
    avatarColor: "bg-pink-500",
    loanId: "HPL-2024-135",
    phone: "9312345678",
    vehicleModel: "Ather 450X Gen 3",
    vehiclePlate: "MP-04-ST-5566",
    dueAmount: 8900,
    dueDate: "03 Sep",
    daysOverdue: 12,
    lastCall: "1 day ago",
    callStatus: "not_responded",
    callOutcomeNote: "No answer - Call scheduled for retry",
  },
  {
    id: "lead-11",
    customerName: "Mohammed Tariq",
    avatarColor: "bg-orange-500",
    loanId: "HPL-2024-149",
    phone: "9820012345",
    vehicleModel: "TVS Apache RTR 160",
    vehiclePlate: "KA-05-UV-7788",
    dueAmount: 6800,
    dueDate: "11 Sep",
    daysOverdue: 4,
    lastCall: "Never",
    callStatus: "uncalled",
  },
  {
    id: "lead-12",
    customerName: "Lakshmi Bai",
    avatarColor: "bg-emerald-600",
    loanId: "HPL-2024-162",
    phone: "9866123456",
    vehicleModel: "Hero Passion Pro",
    vehiclePlate: "AP-16-WX-9900",
    dueAmount: 2900,
    dueDate: "14 Sep",
    daysOverdue: 1,
    lastCall: "Never",
    callStatus: "uncalled",
  },
];

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function VoiceWaveform({ isSpeaking }: { isSpeaking: boolean }) {
  const heights = [40, 80, 55, 95, 70, 85, 45, 90, 60, 75, 50, 65];
  return (
    <div className="flex items-center gap-1 h-8 px-2">
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-primary"
          animate={
            isSpeaking
              ? {
                  height: [`${Math.max(15, h * 0.3)}%`, `${h}%`, `${Math.max(20, h * 0.5)}%`],
                  opacity: [0.7, 1, 0.7],
                }
              : { height: "20%", opacity: 0.3 }
          }
          transition={{
            repeat: Infinity,
            duration: 0.6 + (i % 4) * 0.15,
            ease: "easeInOut",
            delay: (i * 0.05) % 0.4,
          }}
        />
      ))}
    </div>
  );
}

export default function LeadCalling() {
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [aiAgentStatus, setAiAgentStatus] = useState<"ready" | "calling">("ready");

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [amountFilter, setAmountFilter] = useState<string>("all");
  const [overdueFilter, setOverdueFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("dueAmount_desc");

  // Single Call Dialog State
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [callStage, setCallStage] = useState<
    "confirm" | "connecting" | "speaking" | "not_responded" | "completed"
  >("confirm");
  const [callDuration, setCallDuration] = useState(0);
  const [conversationTranscript, setConversationTranscript] = useState<
    { sender: "ai" | "customer"; text: string; time: string }[]
  >([]);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bulk / Multi-Call Queue State
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [queueList, setQueueList] = useState<Lead[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [queueStatus, setQueueStatus] = useState<"running" | "paused" | "completed">("running");
  const [queueItemStage, setQueueItemStage] = useState<"connecting" | "speaking" | "outcome">("connecting");
  const [queueDuration, setQueueDuration] = useState(0);
  const queueTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scheduling Modal State
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulingLeads, setSchedulingLeads] = useState<Lead[]>([]);
  const [selectedSchedulePreset, setSelectedSchedulePreset] = useState("Tomorrow 10:00 AM");
  const [customScheduleDate, setCustomScheduleDate] = useState("");
  const [scheduleNote, setScheduleNote] = useState("");

  // Statistics calculation
  const stats = useMemo(() => {
    const unpaid = leads.length;
    const readyToCall = leads.filter(
      (l) => l.callStatus === "uncalled" || l.callStatus === "scheduled"
    ).length;
    const calledToday = leads.filter(
      (l) => l.callStatus === "completed" || l.lastCall.includes("Yesterday") || l.lastCall.includes("2 days ago")
    ).length;
    const noResponse = leads.filter((l) => l.callStatus === "not_responded").length;

    return { unpaid, readyToCall, calledToday, noResponse };
  }, [leads]);

  // Filtered & Sorted Leads
  const filteredLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = lead.customerName.toLowerCase().includes(q);
          const matchPhone = lead.phone.includes(q);
          const matchVehicle = lead.vehicleModel.toLowerCase().includes(q) || lead.vehiclePlate.toLowerCase().includes(q);
          const matchLoan = lead.loanId.toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchVehicle && !matchLoan) return false;
        }

        // Status Filter
        if (statusFilter !== "all" && lead.callStatus !== statusFilter) {
          return false;
        }

        // Amount Filter
        if (amountFilter === "1000") {
          if (lead.dueAmount < 1000) return false;
        } else if (amountFilter === "5000") {
          if (lead.dueAmount < 5000) return false;
        } else if (amountFilter === "10000") {
          if (lead.dueAmount < 10000) return false;
        }

        // Overdue Filter
        if (overdueFilter === "1-3") {
          if (lead.daysOverdue < 1 || lead.daysOverdue > 3) return false;
        } else if (overdueFilter === "4-7") {
          if (lead.daysOverdue < 4 || lead.daysOverdue > 7) return false;
        } else if (overdueFilter === "8-30") {
          if (lead.daysOverdue < 8 || lead.daysOverdue > 30) return false;
        } else if (overdueFilter === "30+") {
          if (lead.daysOverdue <= 30) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "dueAmount_desc") return b.dueAmount - a.dueAmount;
        if (sortBy === "dueAmount_asc") return a.dueAmount - b.dueAmount;
        if (sortBy === "overdue_desc") return b.daysOverdue - a.daysOverdue;
        if (sortBy === "overdue_asc") return a.daysOverdue - b.daysOverdue;
        if (sortBy === "never_called") {
          if (a.lastCall === "Never" && b.lastCall !== "Never") return -1;
          if (b.lastCall === "Never" && a.lastCall !== "Never") return 1;
        }
        return 0;
      });
  }, [leads, searchQuery, statusFilter, amountFilter, overdueFilter, sortBy]);

  // Handle Multi-Select
  const isAllSelected =
    filteredLeads.length > 0 &&
    filteredLeads.every((l) => selectedLeadIds.includes(l.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(filteredLeads.map((l) => l.id));
    }
  };

  const toggleSelectLead = (id: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const clearSelection = () => {
    setSelectedLeadIds([]);
  };

  // Handle Refresh
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast({
        title: "Leads Refreshed",
        description: "Latest unpaid customer records loaded successfully.",
      });
    }, 600);
  };

  // Copy Phone Number
  const copyPhoneNumber = (phone: string) => {
    navigator.clipboard.writeText(phone);
    toast({
      title: "Phone Copied",
      description: `Copied +91 ${phone} to clipboard.`,
    });
  };

  // ----------------------------------------------------
  // Single Call Lifecycle
  // ----------------------------------------------------
  const handleInitiateSingleCall = (lead: Lead) => {
    setActiveLead(lead);
    setCallStage("confirm");
    setCallDuration(0);
    setConversationTranscript([]);
    setCallModalOpen(true);
  };

  const startSingleCall = () => {
    if (!activeLead) return;
    setCallStage("connecting");
    setAiAgentStatus("calling");

    setLeads((prev) =>
      prev.map((l) =>
        l.id === activeLead.id ? { ...l, callStatus: "connecting" } : l
      )
    );

    setTimeout(() => {
      const customerAnswers = activeLead.id !== "lead-2";

      if (customerAnswers) {
        setCallStage("speaking");
        setLeads((prev) =>
          prev.map((l) =>
            l.id === activeLead.id ? { ...l, callStatus: "speaking" } : l
          )
        );

        setCallDuration(0);
        if (callTimerRef.current) clearInterval(callTimerRef.current);
        callTimerRef.current = setInterval(() => {
          setCallDuration((d) => d + 1);
        }, 1000);

        setConversationTranscript([
          {
            sender: "ai",
            text: `Namaste ${activeLead.customerName} ji! I am AutoFinex AI calling regarding your ${activeLead.vehicleModel} loan EMI of ${formatINR(activeLead.dueAmount)} which was due on ${activeLead.dueDate}.`,
            time: "00:03",
          },
        ]);

        setTimeout(() => {
          setConversationTranscript((prev) => [
            ...prev,
            {
              sender: "customer",
              text: `Yes, hello. I was out of station so I missed the payment. Can I pay tomorrow morning?`,
              time: "00:09",
            },
          ]);
        }, 3200);

        setTimeout(() => {
          setConversationTranscript((prev) => [
            ...prev,
            {
              sender: "ai",
              text: `Certainly! I've marked your promise to pay for tomorrow. I am sending you a secure UPI payment link via WhatsApp and SMS right away.`,
              time: "00:15",
            },
          ]);
        }, 6500);

        setTimeout(() => {
          setConversationTranscript((prev) => [
            ...prev,
            {
              sender: "customer",
              text: `Great, thank you! I will complete it first thing tomorrow.`,
              time: "00:20",
            },
          ]);
        }, 9000);
      } else {
        setCallStage("not_responded");
        setAiAgentStatus("ready");
        setLeads((prev) =>
          prev.map((l) =>
            l.id === activeLead.id
              ? {
                  ...l,
                  callStatus: "not_responded",
                  lastCall: "Just now",
                  callOutcomeNote: "Customer did not answer after 4 rings",
                }
              : l
          )
        );
      }
    }, 2400);
  };

  const endCallManually = (outcome: "completed" | "not_responded") => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setAiAgentStatus("ready");

    if (outcome === "completed") {
      setCallStage("completed");
      const durationStr = `${Math.floor(callDuration / 60)}m ${callDuration % 60}s`;
      setLeads((prev) =>
        prev.map((l) =>
          l.id === activeLead?.id
            ? {
                ...l,
                callStatus: "completed",
                lastCall: "Just now",
                lastCallDuration: durationStr,
                callOutcomeNote: "Promised payment tomorrow via UPI link",
              }
            : l
        )
      );
      toast({
        title: "Call Completed",
        description: `Call with ${activeLead?.customerName} concluded successfully (${durationStr}).`,
      });
    } else {
      setCallStage("not_responded");
      setLeads((prev) =>
        prev.map((l) =>
          l.id === activeLead?.id
            ? {
                ...l,
                callStatus: "not_responded",
                lastCall: "Just now",
                callOutcomeNote: "Call ended with no response",
              }
            : l
        )
      );
    }
  };

  const closeSingleCallModal = () => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setAiAgentStatus("ready");
    setCallModalOpen(false);
    setActiveLead(null);
  };

  // ----------------------------------------------------
  // Multi-Call / Bulk Queue Workflow
  // ----------------------------------------------------
  const handleInitiateBulkCall = () => {
    const selected = leads.filter((l) => selectedLeadIds.includes(l.id));
    if (selected.length === 0) return;

    setQueueList(selected);
    setQueueIndex(0);
    setQueueStatus("running");
    setQueueItemStage("connecting");
    setQueueDuration(0);
    setQueueModalOpen(true);
    setAiAgentStatus("calling");

    processQueueItem(selected, 0);
  };

  const processQueueItem = (items: Lead[], index: number) => {
    if (index >= items.length) {
      setQueueStatus("completed");
      setAiAgentStatus("ready");
      toast({
        title: "Queue Completed",
        description: `All ${items.length} calls processed by the AI Agent.`,
      });
      return;
    }

    const currentLead = items[index];
    setQueueIndex(index);
    setQueueItemStage("connecting");
    setQueueDuration(0);

    setLeads((prev) =>
      prev.map((l) => (l.id === currentLead.id ? { ...l, callStatus: "connecting" } : l))
    );

    setTimeout(() => {
      const isNotResponded = index === 1;

      if (!isNotResponded) {
        setQueueItemStage("speaking");
        setLeads((prev) =>
          prev.map((l) => (l.id === currentLead.id ? { ...l, callStatus: "speaking" } : l))
        );

        if (queueTimerRef.current) clearInterval(queueTimerRef.current);
        queueTimerRef.current = setInterval(() => {
          setQueueDuration((d) => d + 1);
        }, 1000);

        setTimeout(() => {
          if (queueTimerRef.current) clearInterval(queueTimerRef.current);
          setQueueItemStage("outcome");

          setLeads((prev) =>
            prev.map((l) =>
              l.id === currentLead.id
                ? {
                    ...l,
                    callStatus: "completed",
                    lastCall: "Just now",
                    lastCallDuration: "0m 45s",
                    callOutcomeNote: "Customer acknowledged EMI reminder via AI call",
                  }
                : l
            )
          );

          setTimeout(() => {
            processQueueItem(items, index + 1);
          }, 1500);
        }, 5000);
      } else {
        setQueueItemStage("outcome");
        setLeads((prev) =>
          prev.map((l) =>
            l.id === currentLead.id
              ? {
                  ...l,
                  callStatus: "not_responded",
                  lastCall: "Just now",
                  callOutcomeNote: "No response from customer",
                }
              : l
          )
        );

        setTimeout(() => {
          processQueueItem(items, index + 1);
        }, 1800);
      }
    }, 2200);
  };

  const stopQueue = () => {
    if (queueTimerRef.current) clearInterval(queueTimerRef.current);
    setQueueStatus("completed");
    setAiAgentStatus("ready");
    setQueueModalOpen(false);
  };

  // ----------------------------------------------------
  // Scheduling Dialog Workflow
  // ----------------------------------------------------
  const handleOpenScheduleModal = (leadsToSchedule: Lead[]) => {
    setSchedulingLeads(leadsToSchedule);
    setSelectedSchedulePreset("Tomorrow 10:00 AM");
    setCustomScheduleDate("");
    setScheduleNote("");
    setScheduleModalOpen(true);
  };

  const confirmScheduleCall = () => {
    const scheduledTimeText = customScheduleDate || selectedSchedulePreset;
    setLeads((prev) =>
      prev.map((lead) => {
        if (schedulingLeads.some((sl) => sl.id === lead.id)) {
          return {
            ...lead,
            callStatus: "scheduled",
            scheduledTime: scheduledTimeText,
            notes: scheduleNote || lead.notes,
          };
        }
        return lead;
      })
    );

    toast({
      title: "Calls Scheduled",
      description: `${schedulingLeads.length} lead(s) scheduled for ${scheduledTimeText}.`,
    });

    setScheduleModalOpen(false);
    clearSelection();
  };

  useEffect(() => {
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (queueTimerRef.current) clearInterval(queueTimerRef.current);
    };
  }, []);

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  const renderStatusBadge = (status: LeadCallStatus) => {
    switch (status) {
      case "uncalled":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground border border-border">
            <Clock className="h-3 w-3 text-muted-foreground" />
            Uncalled
          </span>
        );
      case "connecting":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-700 border border-blue-500/30 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
            Connecting...
          </span>
        );
      case "speaking":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
            <Volume2 className="h-3 w-3 text-emerald-600 animate-bounce" />
            Speaking
          </span>
        );
      case "not_responded":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-700 border border-amber-500/30">
            <PhoneMissed className="h-3 w-3 text-amber-600" />
            No Response
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-700 border border-green-500/30">
            <CheckCircle2 className="h-3 w-3 text-green-600" />
            Completed
          </span>
        );
      case "scheduled":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/15 text-purple-700 border border-purple-500/30">
            <CalendarClock className="h-3 w-3 text-purple-600" />
            Scheduled
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/15 text-rose-700 border border-rose-500/30">
            <AlertCircle className="h-3 w-3 text-rose-600" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* 1. Header Section */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-sm">
            <PhoneCall className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              Lead Calling
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Reach unpaid customers automatically with AI-powered voice calls.
            </p>
          </div>
        </div>

        {/* Top-Right Controls */}
        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">
          {/* AI Agent Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border shadow-sm">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">AI Agent</span>
            </div>
            <div className="h-3.5 w-px bg-border mx-0.5" />
            {aiAgentStatus === "ready" ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm" />
                Ready
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping" />
                Calling
              </span>
            )}
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-1.5 rounded-xl border-border hover:bg-secondary"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {/* AI Settings Link */}
          <Link to="/ai/settings">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl border-border hover:bg-secondary"
            >
              <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">AI Settings</span>
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Unpaid Leads */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="dashboard-card p-4 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Unpaid Leads
            </span>
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{stats.unpaid}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <span className="text-primary font-medium">100%</span> in collection pool
          </p>
        </motion.div>

        {/* Ready to Call */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="dashboard-card p-4 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Ready to Call
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600">
              <PhoneCall className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{stats.readyToCall}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <span className="text-emerald-600 font-medium">Auto-eligible</span> for AI dialer
          </p>
        </motion.div>

        {/* Called Today */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="dashboard-card p-4 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Called Today
            </span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{stats.calledToday}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <span className="text-blue-600 font-medium">AI voice calls</span> executed
          </p>
        </motion.div>

        {/* No Response */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="dashboard-card p-4 relative overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              No Response
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
              <PhoneMissed className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-foreground mt-2">{stats.noResponse}</p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <span className="text-amber-600 font-medium">Requires retry</span> or schedule
          </p>
        </motion.div>
      </div>

      {/* 3. Filter and Search Controls */}
      <div className="dashboard-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {/* Search Input */}
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customer, phone, vehicle, loan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">Status: All</option>
              <option value="uncalled">Uncalled</option>
              <option value="connecting">Connecting</option>
              <option value="speaking">Speaking</option>
              <option value="not_responded">No Response</option>
              <option value="completed">Completed</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>

          {/* Due Amount Filter */}
          <div>
            <select
              value={amountFilter}
              onChange={(e) => setAmountFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">Due: All</option>
              <option value="1000">₹1,000+</option>
              <option value="5000">₹5,000+</option>
              <option value="10000">₹10,000+</option>
            </select>
          </div>

          {/* Overdue Days Filter */}
          <div>
            <select
              value={overdueFilter}
              onChange={(e) => setOverdueFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="all">Overdue: All</option>
              <option value="1-3">1–3 days</option>
              <option value="4-7">4–7 days</option>
              <option value="8-30">8–30 days</option>
              <option value="30+">30+ days</option>
            </select>
          </div>

          {/* Sort By Filter */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="dueAmount_desc">Highest Due Amount</option>
              <option value="dueAmount_asc">Lowest Due Amount</option>
              <option value="overdue_desc">Most Overdue</option>
              <option value="never_called">Never Called First</option>
            </select>
          </div>
        </div>

        {/* Active Filters / Reset */}
        {(searchQuery ||
          statusFilter !== "all" ||
          amountFilter !== "all" ||
          overdueFilter !== "all" ||
          sortBy !== "dueAmount_desc") && (
          <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs text-muted-foreground">
            <span>
              Showing <strong className="text-foreground">{filteredLeads.length}</strong> of{" "}
              {leads.length} leads
            </span>
            <button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
                setAmountFilter("all");
                setOverdueFilter("all");
                setSortBy("dueAmount_desc");
              }}
              className="text-primary hover:underline font-medium flex items-center gap-1"
            >
              <X className="h-3 w-3" /> Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* 4. Desktop & Tablet Table (Styled identical to ActivityLog) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="dashboard-card p-0 overflow-hidden hidden md:block"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className="w-12 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Customer
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Loan / Vehicle
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Due Amount
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Due Date
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Days Overdue
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Phone
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Last Call
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Call Status
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-12 text-muted-foreground">
                    <div className="max-w-sm mx-auto flex flex-col items-center">
                      <div className="p-3 rounded-full bg-secondary mb-3">
                        <Search className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-base font-semibold text-foreground">No unpaid leads found</p>
                      <p className="text-xs mt-1">
                        Try adjusting your search criteria or clearing active filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead, i) => {
                  const isSelected = selectedLeadIds.includes(lead.id);
                  return (
                    <motion.tr
                      key={lead.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.015 * i }}
                      className={`border-b border-border/50 hover:bg-secondary/30 transition-colors ${
                        isSelected ? "bg-primary/5 hover:bg-primary/10" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectLead(lead.id)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`h-8 w-8 rounded-full ${lead.avatarColor} text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm`}
                          >
                            {lead.customerName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground leading-tight">
                              {lead.customerName}
                            </p>
                            <span className="text-xs font-mono text-muted-foreground">
                              {lead.loanId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Vehicle */}
                      <td className="px-4 py-3.5">
                        <p className="text-sm font-medium text-foreground">{lead.vehicleModel}</p>
                        <span className="text-xs text-muted-foreground font-mono">
                          {lead.vehiclePlate}
                        </span>
                      </td>

                      {/* Due Amount */}
                      <td className="px-4 py-3.5 text-right font-semibold text-sm text-foreground">
                        {formatINR(lead.dueAmount)}
                      </td>

                      {/* Due Date */}
                      <td className="px-4 py-3.5 text-sm text-muted-foreground">{lead.dueDate}</td>

                      {/* Days Overdue */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            lead.daysOverdue > 7
                              ? "bg-rose-500/10 text-rose-700"
                              : lead.daysOverdue > 3
                              ? "bg-amber-500/10 text-amber-700"
                              : "bg-blue-500/10 text-blue-700"
                          }`}
                        >
                          {lead.daysOverdue} {lead.daysOverdue === 1 ? "day" : "days"}
                        </span>
                      </td>

                      {/* Phone */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-mono text-foreground">
                            +91 {lead.phone}
                          </span>
                          <button
                            onClick={() => copyPhoneNumber(lead.phone)}
                            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
                            title="Copy number"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </td>

                      {/* Last Call */}
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-muted-foreground">{lead.lastCall}</span>
                        {lead.lastCallDuration && (
                          <span className="block text-xs font-mono text-muted-foreground/80">
                            ({lead.lastCallDuration})
                          </span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5">{renderStatusBadge(lead.callStatus)}</td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-right">
                        {lead.callStatus === "speaking" ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => endCallManually("completed")}
                            className="h-8 text-xs font-medium gap-1 shadow-sm"
                          >
                            <PhoneOff className="h-3 w-3" /> End Call
                          </Button>
                        ) : lead.callStatus === "connecting" ? (
                          <Button
                            size="sm"
                            disabled
                            className="h-8 text-xs font-medium gap-1.5 bg-blue-600 text-white"
                          >
                            <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                            Dialing...
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleInitiateSingleCall(lead)}
                            className="h-8 text-xs font-medium gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
                          >
                            <PhoneCall className="h-3 w-3" /> Call
                          </Button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* 5. Mobile Cards View (Responsive Alternative) */}
      <div className="md:hidden space-y-3">
        {filteredLeads.length === 0 ? (
          <div className="dashboard-card text-center py-8 text-muted-foreground">
            <p className="text-sm font-semibold">No unpaid leads found</p>
          </div>
        ) : (
          filteredLeads.map((lead) => {
            const isSelected = selectedLeadIds.includes(lead.id);
            return (
              <div
                key={lead.id}
                className={`dashboard-card p-4 space-y-3 transition-colors ${
                  isSelected ? "border-primary bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectLead(lead.id)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                    />
                    <div>
                      <h4 className="font-semibold text-foreground text-sm">
                        {lead.customerName}
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono">{lead.loanId}</p>
                    </div>
                  </div>
                  {renderStatusBadge(lead.callStatus)}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-secondary/40 p-2.5 rounded-lg">
                  <div>
                    <span className="text-muted-foreground block">Vehicle:</span>
                    <span className="font-medium text-foreground">{lead.vehicleModel}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Due Amount:</span>
                    <span className="font-bold text-foreground">{formatINR(lead.dueAmount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Days Overdue:</span>
                    <span className="font-medium text-rose-600">
                      {lead.daysOverdue} days (Due: {lead.dueDate})
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Phone:</span>
                    <span className="font-mono text-foreground">+91 {lead.phone}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    Last call: {lead.lastCall}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleInitiateSingleCall(lead)}
                    className="h-8 text-xs font-medium gap-1.5 bg-primary text-primary-foreground shadow-sm"
                  >
                    <PhoneCall className="h-3 w-3" /> Call
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 6. Multi-Select Sticky Bulk Action Bar */}
      <AnimatePresence>
        {selectedLeadIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-foreground text-background dark:bg-card dark:text-card-foreground shadow-2xl rounded-2xl px-5 py-3.5 border border-border flex items-center gap-4 flex-wrap max-w-[95vw] sm:max-w-2xl"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 rounded-full bg-primary text-primary-foreground font-bold text-xs items-center justify-center">
                {selectedLeadIds.length}
              </span>
              <span className="text-sm font-semibold whitespace-nowrap">
                {selectedLeadIds.length} Lead{selectedLeadIds.length > 1 ? "s" : ""} Selected
              </span>
            </div>

            <div className="h-4 w-px bg-muted-foreground/30 hidden sm:block" />

            <div className="flex items-center gap-2 ml-auto">
              <Button
                size="sm"
                onClick={handleInitiateBulkCall}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs gap-1.5 shadow-md"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                Call Selected
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const selected = leads.filter((l) => selectedLeadIds.includes(l.id));
                  handleOpenScheduleModal(selected);
                }}
                className="text-foreground border-border/50 hover:bg-secondary text-xs gap-1.5 font-medium"
              >
                <Calendar className="h-3.5 w-3.5" />
                Schedule Call
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={clearSelection}
                className="text-muted-foreground hover:text-foreground text-xs p-1 sm:px-2"
                title="Clear Selection"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Clear</span>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------- */}
      {/* 7. Single Call Confirmation & Active Call Modal       */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {callModalOpen && activeLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="dashboard-card w-full max-w-lg p-0 overflow-hidden shadow-2xl border-border bg-card"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-border bg-secondary/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base">
                      {callStage === "confirm" && "Call Customer"}
                      {callStage === "connecting" && "Dialing Customer..."}
                      {callStage === "speaking" && "AI Voice Agent Active"}
                      {callStage === "not_responded" && "Call Outcome"}
                      {callStage === "completed" && "Call Summary"}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      AutoFinex AI Voice Collector v2.4
                    </p>
                  </div>
                </div>

                <button
                  onClick={closeSingleCallModal}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5">
                {/* Customer Snapshot Card */}
                <div className="p-4 rounded-xl bg-secondary/50 border border-border flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-full ${activeLead.avatarColor} text-white flex items-center justify-center font-bold text-sm shadow-sm`}
                    >
                      {activeLead.customerName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground text-base leading-tight">
                        {activeLead.customerName}
                      </h4>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        +91 {activeLead.phone} • {activeLead.loanId}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-muted-foreground block">Overdue Amount</span>
                    <span className="text-base font-bold text-foreground">
                      {formatINR(activeLead.dueAmount)}
                    </span>
                    <span className="block text-[11px] text-rose-600 font-medium">
                      {activeLead.daysOverdue} days overdue
                    </span>
                  </div>
                </div>

                {/* --- STATE 1: CONFIRM --- */}
                {callStage === "confirm" && (
                  <div className="space-y-4">
                    <div className="p-3.5 rounded-lg border border-blue-500/20 bg-blue-500/5 text-xs text-blue-900 dark:text-blue-200 space-y-1">
                      <p className="font-medium flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-blue-600" />
                        AI Agent Script: Overdue EMI Reminder
                      </p>
                      <p className="text-muted-foreground">
                        The AI Voice Agent will greet the customer politely in Hinglish/English,
                        remind them of the ₹{activeLead.dueAmount.toLocaleString()} overdue on their{" "}
                        {activeLead.vehicleModel}, and offer to send an instant UPI link.
                      </p>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <Button
                        variant="outline"
                        onClick={closeSingleCallModal}
                        className="border-border text-foreground"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={startSingleCall}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-2 shadow-md"
                      >
                        <PhoneCall className="h-4 w-4" />
                        Call Now
                      </Button>
                    </div>
                  </div>
                )}

                {/* --- STATE 2: CONNECTING --- */}
                {callStage === "connecting" && (
                  <div className="py-8 text-center space-y-4">
                    <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
                      <motion.div
                        animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute inset-0 rounded-full bg-primary/20"
                      />
                      <motion.div
                        animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0.2, 0.8] }}
                        transition={{ repeat: Infinity, duration: 2, delay: 0.3 }}
                        className="absolute inset-0 rounded-full bg-primary/30"
                      />
                      <div className="relative z-10 p-4 rounded-full bg-primary text-primary-foreground shadow-lg">
                        <PhoneCall className="h-8 w-8 animate-pulse" />
                      </div>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold text-foreground">
                        Connecting to {activeLead.customerName}...
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Dialing carrier network • Waiting for customer answer
                      </p>
                    </div>

                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => endCallManually("not_responded")}
                        className="border-border text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel Call
                      </Button>
                    </div>
                  </div>
                )}

                {/* --- STATE 3: SPEAKING --- */}
                {callStage === "speaking" && (
                  <div className="space-y-4">
                    {/* Real-time Indicator & Waveform */}
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />
                        <div>
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            AI Agent is speaking
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            Live duration: {formatTimer(callDuration)}
                          </p>
                        </div>
                      </div>
                      <VoiceWaveform isSpeaking={true} />
                    </div>

                    {/* Live Conversation Transcript */}
                    <div className="p-3 rounded-xl bg-secondary/40 border border-border max-h-48 overflow-y-auto space-y-2.5 text-xs">
                      {conversationTranscript.map((entry, idx) => (
                        <div
                          key={idx}
                          className={`flex flex-col ${
                            entry.sender === "ai" ? "items-start" : "items-end"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-semibold text-foreground text-[11px]">
                              {entry.sender === "ai" ? "AI Agent" : activeLead.customerName}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {entry.time}
                            </span>
                          </div>
                          <div
                            className={`p-2.5 rounded-xl max-w-[88%] leading-relaxed ${
                              entry.sender === "ai"
                                ? "bg-primary/10 text-foreground border border-primary/20 rounded-tl-none"
                                : "bg-card text-foreground border border-border rounded-tr-none shadow-sm"
                            }`}
                          >
                            {entry.text}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Active Call Controls */}
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground font-mono">
                        Call in progress...
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => endCallManually("completed")}
                          className="gap-1.5 text-xs font-medium shadow-sm"
                        >
                          <PhoneOff className="h-3.5 w-3.5" />
                          End Call & Save
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* --- STATE 4: NOT RESPONDED --- */}
                {callStage === "not_responded" && (
                  <div className="py-4 text-center space-y-4">
                    <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20">
                      <PhoneMissed className="h-7 w-7" />
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-foreground">
                        Customer did not respond
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        The call rang out without answer or line was busy. This is normal and has
                        been logged.
                      </p>
                    </div>

                    <div className="flex items-center justify-center gap-2.5 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={startSingleCall}
                        className="text-xs gap-1.5 border-border"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Call Again
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          closeSingleCallModal();
                          handleOpenScheduleModal([activeLead]);
                        }}
                        className="text-xs gap-1.5 border-border"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        Schedule Later
                      </Button>
                      <Button
                        size="sm"
                        onClick={closeSingleCallModal}
                        className="bg-primary text-primary-foreground text-xs"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                )}

                {/* --- STATE 5: COMPLETED --- */}
                {callStage === "completed" && (
                  <div className="py-4 text-center space-y-4">
                    <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
                      <CheckCircle2 className="h-7 w-7" />
                    </div>

                    <div>
                      <h4 className="text-base font-bold text-foreground">
                        Call Completed Successfully
                      </h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Call duration: {formatTimer(callDuration)} • Outcome: Payment promised
                      </p>
                    </div>

                    <div className="p-3 rounded-lg bg-secondary/50 border border-border text-left text-xs space-y-1.5">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Customer Commitment:</span>
                        <strong className="text-foreground">Payment tomorrow via UPI</strong>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Payment Link Status:</span>
                        <span className="text-emerald-600 font-medium">Sent via WhatsApp</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-2 pt-2">
                      <Button
                        size="sm"
                        onClick={closeSingleCallModal}
                        className="bg-primary text-primary-foreground text-xs"
                      >
                        Done
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------- */}
      {/* 8. Multi-Call Queue Modal / Panel                    */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {queueModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="dashboard-card w-full max-w-xl p-0 overflow-hidden shadow-2xl border-border bg-card"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-border bg-secondary/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base">AI Calling Queue</h3>
                    <p className="text-xs text-muted-foreground">
                      {queueList.length} customers selected for automated sequential calling
                    </p>
                  </div>
                </div>

                <button
                  onClick={stopQueue}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-5">
                {/* Overall Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Queue Progress</span>
                    <span className="font-mono text-muted-foreground">
                      {Math.min(queueIndex, queueList.length)} / {queueList.length} completed
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                    <motion.div
                      className="h-full bg-primary"
                      animate={{
                        width: `${(Math.min(queueIndex, queueList.length) / queueList.length) * 100}%`,
                      }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>

                {/* Currently Calling Spotlight */}
                {queueIndex < queueList.length && queueStatus === "running" ? (
                  <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-primary animate-ping" />
                        Calling Now
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        Duration: {formatTimer(queueDuration)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-foreground text-base">
                          {queueList[queueIndex].customerName}
                        </h4>
                        <p className="text-xs text-muted-foreground font-mono">
                          +91 {queueList[queueIndex].phone} • {queueList[queueIndex].vehicleModel}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-foreground">
                        {formatINR(queueList[queueIndex].dueAmount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      <span className="text-muted-foreground">
                        Status:{" "}
                        <strong className="text-foreground capitalize">
                          {queueItemStage === "connecting"
                            ? "Connecting..."
                            : queueItemStage === "speaking"
                            ? "Speaking with customer"
                            : "Recording Outcome"}
                        </strong>
                      </span>
                      <VoiceWaveform isSpeaking={queueItemStage === "speaking"} />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl border border-green-500/30 bg-green-500/5 text-center space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
                    <h4 className="font-bold text-foreground text-base">Queue Completed</h4>
                    <p className="text-xs text-muted-foreground">
                      All {queueList.length} customers in this batch have been contacted by the AI
                      Voice Agent.
                    </p>
                  </div>
                )}

                {/* Queue Item Breakdown */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Queue Sequence
                  </span>
                  <div className="max-h-44 overflow-y-auto space-y-2 pr-1 text-xs">
                    {queueList.map((item, idx) => {
                      const isPast = idx < queueIndex;
                      const isCurrent = idx === queueIndex && queueStatus === "running";

                      return (
                        <div
                          key={item.id}
                          className={`p-2.5 rounded-lg border flex items-center justify-between transition-colors ${
                            isCurrent
                              ? "border-primary bg-primary/5 font-medium"
                              : isPast
                              ? "border-border bg-secondary/30 text-muted-foreground"
                              : "border-border/60 bg-card text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            {isPast ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                            ) : isCurrent ? (
                              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <div>
                              <span className="font-medium text-foreground">
                                {item.customerName}
                              </span>
                              <span className="text-muted-foreground ml-2 font-mono">
                                {formatINR(item.dueAmount)}
                              </span>
                            </div>
                          </div>

                          <span className="text-[11px] font-medium">
                            {isPast
                              ? idx === 1
                                ? "No Response"
                                : "Completed"
                              : isCurrent
                              ? queueItemStage === "connecting"
                                ? "Connecting..."
                                : "Speaking"
                              : "Waiting"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Queue Controls */}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={stopQueue}
                    className="border-border text-xs text-rose-600 hover:text-rose-700"
                  >
                    Stop Queue
                  </Button>

                  <div className="flex items-center gap-2">
                    {queueIndex < queueList.length - 1 && queueStatus === "running" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => processQueueItem(queueList, queueIndex + 1)}
                        className="text-xs gap-1.5 border-border"
                      >
                        <SkipForward className="h-3.5 w-3.5" /> Skip Lead
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={stopQueue}
                      className="bg-primary text-primary-foreground text-xs"
                    >
                      {queueIndex >= queueList.length ? "Done" : "Close Queue"}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------- */}
      {/* 9. Schedule Call Modal                               */}
      {/* ---------------------------------------------------- */}
      <AnimatePresence>
        {scheduleModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="dashboard-card w-full max-w-md p-0 overflow-hidden shadow-2xl border-border bg-card"
            >
              {/* Header */}
              <div className="p-5 border-b border-border bg-secondary/40 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
                    <CalendarClock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-base">Schedule AI Calls</h3>
                    <p className="text-xs text-muted-foreground">
                      Setting callback appointment for {schedulingLeads.length} lead(s)
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setScheduleModalOpen(false)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                    Quick Time Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      "Today, 06:00 PM",
                      "Tomorrow 10:00 AM",
                      "Tomorrow 02:30 PM",
                      "In 2 Days, 11:00 AM",
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setSelectedSchedulePreset(preset);
                          setCustomScheduleDate("");
                        }}
                        className={`p-2.5 rounded-lg border text-xs font-medium text-left transition-all ${
                          selectedSchedulePreset === preset && !customScheduleDate
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border hover:bg-secondary/60 text-foreground"
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Or Custom Date & Time
                  </label>
                  <Input
                    type="datetime-local"
                    value={customScheduleDate}
                    onChange={(e) => setCustomScheduleDate(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Internal Note / Context (Optional)
                  </label>
                  <Input
                    placeholder="e.g. Customer promised cash salary credit tomorrow"
                    value={scheduleNote}
                    onChange={(e) => setScheduleNote(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                  <Button
                    variant="outline"
                    onClick={() => setScheduleModalOpen(false)}
                    className="text-xs border-border text-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={confirmScheduleCall}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium gap-1.5"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    Confirm Schedule
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
