import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  FileAudio,
  FileText,
  History,
  IndianRupee,
  Loader2,
  MessageSquare,
  Phone,
  Play,
  RefreshCw,
  ShieldCheck,
  User,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { aiApi, LiveCallSession } from "../api/aiApi";

function formatInr(amount: number | null | undefined): string {
  const num = Number(amount ?? 0);
  if (!Number.isFinite(num)) return "₹0";
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatIstDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatOutcomeLabel(outcome: string | null | undefined): string {
  const raw = String(outcome || "no_response")
    .trim()
    .replace(/_/g, " ");
  return raw.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatBytes(bytes: number | undefined): string {
  const b = Number(bytes || 0);
  if (!Number.isFinite(b) || b <= 0) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function renderLifecycleBadge(lifecycle: string) {
  const lc = String(lifecycle || "initiated").toLowerCase();
  if (lc === "completed") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
        Session Completed
      </Badge>
    );
  }
  if (lc === "failed") {
    return (
      <Badge className="bg-red-500/15 text-red-700 border-red-500/30">
        Session Failed
      </Badge>
    );
  }
  if (lc === "cancelled") {
    return (
      <Badge className="bg-slate-500/15 text-slate-700 border-slate-500/30">
        Cancelled
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30">
      Live ({formatOutcomeLabel(lc)})
    </Badge>
  );
}

function renderBusinessOutcomeBadge(outcome: string | undefined) {
  const oc = String(outcome || "no_response").toLowerCase();
  if (oc.includes("ptp") || oc.includes("promise") || oc.includes("paid")) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
        Outcome: {formatOutcomeLabel(oc)}
      </Badge>
    );
  }
  if (oc === "in_progress") {
    return (
      <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30">
        Outcome: In Progress
      </Badge>
    );
  }
  if (["unanswered", "no_response", "busy", "call_failed", "failed"].includes(oc)) {
    return (
      <Badge className="bg-amber-500/15 text-amber-800 border-amber-500/30">
        Outcome: {formatOutcomeLabel(oc)}
      </Badge>
    );
  }
  return (
    <Badge className="bg-indigo-500/15 text-indigo-700 border-indigo-500/30">
      Outcome: {formatOutcomeLabel(oc)}
    </Badge>
  );
}

function renderRiskBadge(level: string | undefined, score: number | undefined) {
  const lv = String(level || "safe").toLowerCase();
  const sc = Number(score ?? 0);
  if (lv === "critical") {
    return (
      <Badge className="bg-red-600/15 text-red-700 border-red-600/30">
        Critical ({sc}/100)
      </Badge>
    );
  }
  if (lv === "high") {
    return (
      <Badge className="bg-orange-500/15 text-orange-700 border-orange-500/30">
        High ({sc}/100)
      </Badge>
    );
  }
  if (lv === "warning") {
    return (
      <Badge className="bg-amber-500/15 text-amber-800 border-amber-500/30">
        Warning ({sc}/100)
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
      Safe ({sc}/100)
    </Badge>
  );
}

export default function CallDetailsPage() {
  const { callId } = useParams<{ callId: string }>();
  const navigate = useNavigate();

  const [call, setCall] = useState<LiveCallSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState<boolean>(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDetails = useCallback(
    async (silent = false) => {
      if (!callId) {
        setError("Missing call session ID.");
        setLoading(false);
        return;
      }
      if (!silent) setRefreshing(true);
      try {
        const res = await aiApi.getCallStatus(callId);
        setCall(res.call);
        setError(null);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data
            ?.message ||
          (err instanceof Error ? err.message : "Failed to load call details.");
        setError(msg);
      } finally {
        setLoading(false);
        if (!silent) setRefreshing(false);
      }
    },
    [callId]
  );

  useEffect(() => {
    setLoading(true);
    setAudioUrl(null);
    setAudioError(null);
    void fetchDetails(true);
  }, [fetchDetails]);

  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (call && !call.isTerminal) {
      pollTimerRef.current = setInterval(() => {
        void fetchDetails(true);
      }, 2500);
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [call?.isTerminal, fetchDetails]);

  const handleLoadRecording = async () => {
    if (!call) return;
    setAudioLoading(true);
    setAudioError(null);
    try {
      const res = await aiApi.getCallRecordingUrl(call.callId);
      setAudioUrl(res.playbackUrl);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ||
        (err instanceof Error ? err.message : "Unable to load recording playback URL.");
      setAudioError(msg);
    } finally {
      setAudioLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          <span className="text-sm font-medium">Loading call session details...</span>
        </div>
      </div>
    );
  }

  if (error || !call) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/ai/lead-calling")}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back to Lead Calling
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate("/ai/logs")}>
            All Call Logs
          </Button>
        </div>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-red-900">
                Unable to load call details
              </h2>
              <p className="text-sm text-red-700">{error || "Call session not found."}</p>
              <Button size="sm" variant="outline" onClick={() => void fetchDetails(false)}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cust = call.details?.customer;
  const ledger = call.details?.loanLedger;
  const summary = call.details?.summary;
  const ptps = call.details?.ptpCommitments || [];
  const callbacks = call.details?.callbacks || [];
  const previousSummaries = call.details?.previousSummaries || [];
  const resolvedOutcome =
    call.callOutcome ||
    (call.answered && call.customerSpoke
      ? call.outcome || call.disposition || "completed_general"
      : call.answered
        ? "no_response"
        : "unanswered");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 1. Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/ai/lead-calling")}
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Lead Calling
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/ai/logs")}>
              Call Logs
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/customers/${encodeURIComponent(call.customerId)}`)}
            >
              Customer Profile
              <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <h1 className="text-2xl font-bold text-slate-900">{call.customerName}</h1>
            <Badge variant="outline" className="font-mono text-xs">
              {cust?.loanRef || (call.hplno != null ? `HPL-${call.hplno}` : "N/A")}
            </Badge>
            {renderLifecycleBadge(call.callLifecycleStatus)}
            {renderBusinessOutcomeBadge(resolvedOutcome)}
            {summary?.requestedHuman && (
              <Badge className="bg-rose-600/15 text-rose-700 border-rose-600/30">
                Human Agent Requested
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500 font-mono">
            Call ID: {call.callId}
            {call.providerCallId ? ` • Provider Run: ${call.providerCallId}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!call.isTerminal && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              Auto-updating live
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchDetails(false)}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {call.errorDetail && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3.5 flex items-start gap-2.5 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Call Error Detail: </span>
            {call.errorDetail}
          </div>
        </div>
      )}

      {/* Top Grid: 2. Customer & Risk Profile + 3. Authoritative Loan Ledger + 4. Call Metadata & Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 2. Customer & Verified Risk Profile */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <User className="h-4 w-4 text-indigo-600" />
              Customer & Verified Risk Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Customer Name</span>
              <span className="font-medium text-slate-900">{call.customerName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Masked Phone</span>
              <span className="font-mono text-slate-800">
                {call.maskedPhone || cust?.maskedPhone || "—"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Vehicle</span>
              <span className="font-medium text-slate-800 text-right">
                {cust?.vehicleModel || "Two Wheeler"} ({cust?.vehiclePlate || "—"})
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Loan Status</span>
              <Badge variant="outline" className="capitalize">
                {cust?.loanStatus || "active"}
              </Badge>
            </div>
            <div className="pt-2 border-t flex justify-between items-center">
              <span className="text-slate-500">Delinquency Risk</span>
              {renderRiskBadge(cust?.riskLevel, cust?.riskScore)}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Credit Score</span>
              <span className="font-semibold text-slate-900">
                {cust?.creditScore ?? 75}/100 ({cust?.creditBand || "Good"})
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 3. Authoritative Loan Ledger */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <IndianRupee className="h-4 w-4 text-emerald-600" />
              Authoritative Loan Ledger
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Current Overdue EMI</span>
              <span className="font-bold text-red-600">
                {formatInr(ledger?.overdueAmount)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Pending Penalty</span>
              <span className="font-medium text-amber-700">
                {formatInr(ledger?.pendingPenaltyAmount)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Total Overdue (incl. Penalty)</span>
              <span className="font-semibold text-slate-900">
                {formatInr(ledger?.totalOverdueWithPenalty)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Total Outstanding Balance</span>
              <span className="font-bold text-slate-900">
                {formatInr(ledger?.totalBalanceAmount)}
              </span>
            </div>
            <div className="pt-2 border-t flex justify-between items-center text-xs">
              <span className="text-slate-500">Monthly EMI / Paid EMI</span>
              <span className="font-medium text-slate-800">
                {formatInr(ledger?.installmentAmount)} / {formatInr(ledger?.validEmiPaid)}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Overdue Days / Pending EMIs</span>
              <span className="font-semibold text-slate-900">
                {ledger?.daysOverdue ?? 0} days ({ledger?.pendingEmiCount ?? 0} EMIs)
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Earliest Unpaid / Next Due</span>
              <span className="font-mono text-slate-700">
                {ledger?.earliestUnpaidDueDate || "—"} / {ledger?.nextEmiDueDate || "—"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 4. Call Metadata & AI Telemetry */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <Cpu className="h-4 w-4 text-purple-600" />
              Call Session & AI Telemetry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Started (IST)</span>
              <span className="text-xs font-medium text-slate-800">
                {formatIstDateTime(call.startedAt)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Ended (IST)</span>
              <span className="text-xs font-medium text-slate-800">
                {formatIstDateTime(call.endedAt)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Duration & Language</span>
              <span className="font-medium text-slate-900">
                {call.durationLabel} • {call.languageUsed || "ta-IN"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Badge
                variant="outline"
                className={
                  call.answered
                    ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                    : "border-slate-300 text-slate-600"
                }
              >
                {call.answered ? (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                ) : (
                  <XCircle className="h-3 w-3 mr-1" />
                )}
                {call.answered ? "Answered" : "Unanswered"}
              </Badge>
              <Badge
                variant="outline"
                className={
                  call.customerSpoke
                    ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                    : "border-slate-300 text-slate-600"
                }
              >
                {call.customerSpoke ? "Customer Spoke" : "No Speech"}
              </Badge>
              <Badge
                variant="outline"
                className={
                  call.identityVerified
                    ? "border-indigo-300 text-indigo-700 bg-indigo-50"
                    : "border-slate-300 text-slate-600"
                }
              >
                <ShieldCheck className="h-3 w-3 mr-1" />
                {call.identityVerified ? "ID Verified" : "ID Unverified"}
              </Badge>
            </div>
            <div className="pt-2 border-t text-xs space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>Models (LLM / TTS / STT)</span>
                <span className="font-mono text-slate-800">
                  {call.telemetry.llmModel || "—"} / {call.telemetry.ttsModel || "bulbul:v4"} /{" "}
                  {call.telemetry.sttModel || "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Tokens (Total / Prompt / Comp / Mem)</span>
                <span className="font-mono text-slate-800">
                  {call.telemetry.totalTokens} ({call.telemetry.promptTokens}/
                  {call.telemetry.completionTokens}/{call.telemetry.memoryTokens})
                </span>
              </div>
              <div className="flex justify-between">
                <span>Voice Usage (TTS Chars / STT Sec)</span>
                <span className="font-mono text-slate-800">
                  {call.telemetry.ttsCharacters} chars / {call.telemetry.sttSeconds.toFixed(1)}s
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Row: 5. AI Call Summary + 6. S3 Call Recording Player */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 5. Current AI Call Summary */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <FileText className="h-4 w-4 text-indigo-600" />
              Structured AI Call Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3.5 text-slate-800">
              {summary?.summaryShort ||
                call.summaryText ||
                (call.answered && call.customerSpoke
                  ? "Summary pending post-call processing."
                  : "No conversation summary recorded because the customer did not speak on this call.")}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              <div className="rounded-md border p-2.5">
                <div className="text-xs text-slate-500">Customer Stated Reason</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {summary?.customerStatedReason || "—"}
                </div>
              </div>
              <div className="rounded-md border p-2.5">
                <div className="text-xs text-slate-500">Commitment Summary</div>
                <div className="font-medium text-slate-900 mt-0.5">
                  {summary?.commitmentSummary ||
                    (call.promisedAmount
                      ? `${formatInr(call.promisedAmount)} by ${call.promisedDate || "—"}`
                      : "—")}
                </div>
              </div>
              <div className="rounded-md border p-2.5">
                <div className="text-xs text-slate-500">Observable Tone & Sentiment</div>
                <div className="font-medium text-slate-900 mt-0.5 capitalize">
                  {summary?.observableTone || call.sentiment || "neutral"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 6. S3 Call Recording Playback */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <FileAudio className="h-4 w-4 text-indigo-600" />
              Call Recording (S3 Private)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Recording Status</span>
              <Badge variant="outline" className="capitalize">
                {call.recordingStatus || "not_recorded"}
              </Badge>
            </div>
            <div className="flex justify-between text-xs text-slate-600">
              <span>Audio Duration / Size</span>
              <span className="font-mono">
                {call.recordingDurationSec}s • {formatBytes(call.recordingSizeBytes)}
              </span>
            </div>

            {call.hasRecording ? (
              <div className="space-y-2 pt-1">
                {!audioUrl ? (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => void handleLoadRecording()}
                    disabled={audioLoading}
                  >
                    {audioLoading ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-1.5" />
                    )}
                    Load & Play Recording
                  </Button>
                ) : (
                  <audio controls autoPlay src={audioUrl} className="w-full h-10" />
                )}
                {audioError && <p className="text-xs text-red-600">{audioError}</p>}
              </div>
            ) : (
              <div className="rounded-md bg-slate-50 border border-dashed border-slate-200 p-3 text-xs text-slate-500 text-center">
                No audio recording available in S3 for this call session.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 7. Full Conversation Transcript */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
            <MessageSquare className="h-4 w-4 text-indigo-600" />
            Full Conversation Transcript ({call.transcript.length} turns)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {call.transcript.length === 0 ? (
            <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              <Phone className="h-6 w-6 mx-auto mb-2 text-slate-400" />
              No spoken dialogue turns recorded for this call.
            </div>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
              {call.transcript.map((turn, idx) => {
                const isCustomer = turn.speaker === "customer";
                return (
                  <div
                    key={`${idx}-${turn.time}`}
                    className={`flex items-start gap-2.5 ${
                      isCustomer ? "justify-end" : "justify-start"
                    }`}
                  >
                    {!isCustomer && (
                      <div className="h-7 w-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={`max-w-[78%] rounded-xl px-3.5 py-2.5 text-sm ${
                        isCustomer
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-900 border border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1 text-[11px] opacity-75">
                        <span className="font-semibold">
                          {isCustomer ? call.customerName : "AutoFinex Voice AI"}
                        </span>
                        {turn.time && <span>{turn.time}</span>}
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{turn.text}</p>
                    </div>
                    {isCustomer && (
                      <div className="h-7 w-7 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom Grid: 8. Promise-to-Pay Commitments + 9. Callbacks & L2 Previous Call Memory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 8. Promise-to-Pay (PTP) Commitments & Scheduled Callbacks */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
                <Calendar className="h-4 w-4 text-emerald-600" />
                Promise-to-Pay (PTP) Commitments ({ptps.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {ptps.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  No Promise-to-Pay commitments recorded for this customer.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Promised Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ptps.map((p) => (
                      <TableRow
                        key={p.ptpId}
                        className={p.isCurrentCall ? "bg-emerald-50/60" : undefined}
                      >
                        <TableCell className="text-xs font-medium">
                          {p.promisedDate || "—"}
                          {p.isCurrentCall && (
                            <Badge className="ml-1.5 bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                              This Call
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-semibold">
                          {p.promisedAmount != null ? formatInr(p.promisedAmount) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px] capitalize">
                            {p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {p.reason || p.note || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
                <Clock className="h-4 w-4 text-blue-600" />
                Scheduled Callbacks ({callbacks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {callbacks.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  No scheduled callbacks recorded for this customer.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {callbacks.map((cb) => (
                    <div
                      key={cb.callbackId}
                      className={`rounded-lg border p-3 text-xs flex items-start justify-between gap-3 ${
                        cb.isCurrentCall ? "border-blue-300 bg-blue-50/50" : "border-slate-200"
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900">
                          {formatIstDateTime(cb.scheduledAt)}
                          {cb.isCurrentCall && (
                            <span className="ml-2 text-[10px] text-blue-700 font-semibold">
                              (Scheduled on this call)
                            </span>
                          )}
                        </div>
                        <div className="text-slate-600">
                          Source: <span className="capitalize">{cb.source}</span>
                          {cb.note ? ` • Note: ${cb.note}` : ""}
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize shrink-0">
                        {cb.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 9. Previous Call Memory Context (L2 — Last up to 6 prior summaries) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-slate-800">
              <History className="h-4 w-4 text-indigo-600" />
              Previous Conversation Memory (Last {previousSummaries.length} Prior Calls)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {previousSummaries.length === 0 ? (
              <p className="text-xs text-slate-500 py-2">
                No prior completed conversation summaries existed before this call.
              </p>
            ) : (
              <div className="space-y-3">
                {previousSummaries.map((ps) => (
                  <div
                    key={ps.summaryId}
                    className="rounded-lg border border-slate-200 p-3.5 space-y-1.5 hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-600">
                        {formatIstDateTime(ps.callDate)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[11px] capitalize">
                          {formatOutcomeLabel(ps.outcome)}
                        </Badge>
                        {ps.callLogId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-indigo-600"
                            onClick={() =>
                              navigate(`/ai/calls/${encodeURIComponent(ps.callLogId!)}`)
                            }
                          >
                            Open Call
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-slate-900">{ps.summaryShort}</p>
                    {(ps.customerStatedReason || ps.commitmentSummary) && (
                      <div className="text-xs text-slate-600 pt-1 flex flex-wrap gap-x-4 gap-y-1">
                        {ps.customerStatedReason && (
                          <span>
                            <strong>Reason:</strong> {ps.customerStatedReason}
                          </span>
                        )}
                        {ps.commitmentSummary && (
                          <span>
                            <strong>Commitment:</strong> {ps.commitmentSummary}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

