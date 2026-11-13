import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Calendar, MessageSquare, Bell, ShieldAlert, Save, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { Input } from "../ui/input";
import { DatePicker } from "../ui/date-picker";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { toast } from '../../hooks/use-toast';
import { aiApi } from "../../api/aiApi";

export default function AISettings() {

  const [companyRules, setCompanyRules] = useState({
    leaveDate: "2026-03-26",
    leaveReason: "Holi Festival",
    notificationsEnabled: true,
  });

  const [aiInstructions, setAiInstructions] = useState(
    "Tomorrow is holiday (Holi). Inform customers politely and reschedule payments to next working day. Be warm and professional."
  );

  const [behavior, setBehavior] = useState({
    autoReply: true,
    paymentReminder: true,
    followUpReminder: true,
    escalationAlerts: true,
  });

  const [escalation, setEscalation] = useState({
    negativeAction: "notify_admin",
    noResponseHours: "24",
    autoFollowUp: true,
  });

  useEffect(() => {
    let mounted = true;
    aiApi
      .getSettings()
      .then((res) => {
        if (!mounted || !res?.settings) return;
        setCompanyRules(res.settings.companyRules);
        setAiInstructions(res.settings.aiInstructions);
        setBehavior(res.settings.behavior);
        setEscalation(res.settings.escalation);
      })
      .catch(() => {
        /* preserve initial UI defaults when offline */
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    try {
      const res = await aiApi.updateSettings({
        companyRules,
        aiInstructions,
        behavior,
        escalation,
      });
      toast({
        title: "Settings saved",
        description: `AI Assistant settings updated (v${res.settings?.configVersion ?? 1}).`,
      });
    } catch {
      toast({ title: "Settings saved locally", description: "Backend unavailable; kept current changes in view." });
    }
  };

  const handleReset = () => {
    setAiInstructions("");
    toast({ title: "Instructions reset", description: "AI instructions have been cleared." });
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="h-7 w-7 text-primary" /> AI Settings
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Configure AI behavior, rules & escalation policies</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Rules */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Company Rules</CardTitle>
              <CardDescription>Set holidays and notification preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Leave Date</Label>
                <DatePicker value={companyRules.leaveDate} onChange={(e) => setCompanyRules({ ...companyRules, leaveDate: e.target.value })} placeholder="Leave Date" />
              </div>
              <div className="space-y-2">
                <Label>Leave Reason</Label>
                <Input value={companyRules.leaveReason} onChange={(e) => setCompanyRules({ ...companyRules, leaveReason: e.target.value })} placeholder="e.g. Holi Festival" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="text-sm font-medium text-foreground">Enable Notifications</p>
                  <p className="text-xs text-muted-foreground">Send holiday alerts to customers</p>
                </div>
                <Switch checked={companyRules.notificationsEnabled} onCheckedChange={(v) => setCompanyRules({ ...companyRules, notificationsEnabled: v })} />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* AI Instructions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> AI Instructions</CardTitle>
              <CardDescription>Custom instructions for the AI assistant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea value={aiInstructions} onChange={(e) => setAiInstructions(e.target.value)} rows={6} placeholder="Enter instructions for the AI..." className="resize-none" />
              <div className="flex gap-2">
                <Button onClick={handleSave} className="flex-1"><Save className="h-4 w-4 mr-1" /> Save</Button>
                <Button variant="outline" onClick={handleReset}><RotateCcw className="h-4 w-4 mr-1" /> Reset</Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Payment Reminder", "Holiday Notice", "Follow-up", "Escalation"].map((t) => (
                  <Badge key={t} variant="outline" className="cursor-pointer hover:bg-primary/10 transition-colors text-xs">{t}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Behavior Settings */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Bell className="h-4 w-4" /> Behavior Settings</CardTitle>
              <CardDescription>Toggle AI capabilities</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { key: "autoReply" as const, label: "Auto Reply", desc: "Automatically respond to customer messages" },
                { key: "paymentReminder" as const, label: "Payment Reminder", desc: "Send automated payment due reminders" },
                { key: "followUpReminder" as const, label: "Follow-up Reminder", desc: "Auto follow-up on unresolved conversations" },
                { key: "escalationAlerts" as const, label: "Escalation Alerts", desc: "Notify admin on negative interactions" },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch checked={behavior[item.key]} onCheckedChange={(v) => setBehavior({ ...behavior, [item.key]: v })} />
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>

        {/* Escalation Rules */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Escalation Rules</CardTitle>
              <CardDescription>Define auto-escalation policies</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>On Negative Sentiment</Label>
                <Select value={escalation.negativeAction} onValueChange={(v) => setEscalation({ ...escalation, negativeAction: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notify_admin">Notify Admin</SelectItem>
                    <SelectItem value="assign_agent">Assign to Agent</SelectItem>
                    <SelectItem value="escalate_manager">Escalate to Manager</SelectItem>
                    <SelectItem value="do_nothing">Do Nothing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>No Response Timeout (hours)</Label>
                <Input type="number" value={escalation.noResponseHours} onChange={(e) => setEscalation({ ...escalation, noResponseHours: e.target.value })} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div>
                  <p className="text-sm font-medium text-foreground">Auto Follow-up</p>
                  <p className="text-xs text-muted-foreground">Automatically follow up after timeout</p>
                </div>
                <Switch checked={escalation.autoFollowUp} onCheckedChange={(v) => setEscalation({ ...escalation, autoFollowUp: v })} />
              </div>
              <Button onClick={handleSave} className="w-full"><Save className="h-4 w-4 mr-1" /> Save Escalation Rules</Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
