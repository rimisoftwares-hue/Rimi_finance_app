import { useState } from "react";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, Shield, Palette, Hash, DollarSign, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { Label } from "../ui/label";
import { Separator } from "../ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Checkbox } from "../ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";

const roles = ["Super Admin", "Admin", "Staff", "Agent", "Collection"];
const pages = ["Dashboard", "Collections", "Reports", "Accounts", "Loans", "Notices", "Agent Mgmt", "Master", "Profile"];
const actions = ["View", "Create", "Edit", "Delete"];

export default function Settings() {
  const [loanSettings, setLoanSettings] = useState({ interestRate: "24", penaltyPerDay: "50", penaltyGradeDays: "7" });
  const [charges, setCharges] = useState({ documentCharges: "500", brokerCommission: "2" });
  const [numbering, setNumbering] = useState({ loanPrefix: "OWN", loanRangeFrom: "1", loanRangeTo: "9999", billPrefix: "BILL", billRangeFrom: "1", billRangeTo: "9999" });
  const [theme, setTheme] = useState("system");
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean[]>>>(() => {
    const p: Record<string, Record<string, boolean[]>> = {};
    roles.forEach((role) => {
      p[role] = {};
      pages.forEach((page) => {
        if (role === "Super Admin" || role === "Admin") p[role][page] = [true, true, true, true];
        else if (role === "Agent") p[role][page] = [page === "Dashboard" || page === "Collections", false, false, false];
        else if (role === "Collection") p[role][page] = [page !== "Master" && page !== "Profile", false, false, false];
        else p[role][page] = [true, true, false, false];
      });
    });
    return p;
  });
  const [selectedRole, setSelectedRole] = useState("Staff");

  const togglePermission = (page: string, actionIdx: number) => {
    setPermissions((prev) => {
      const updated = { ...prev };
      updated[selectedRole] = { ...updated[selectedRole] };
      updated[selectedRole][page] = [...updated[selectedRole][page]];
      updated[selectedRole][page][actionIdx] = !updated[selectedRole][page][actionIdx];
      return updated;
    });
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">System configuration and access control</p>
        </div>
        <Button size="sm"><Save className="h-4 w-4 mr-1" />Save All</Button>
      </motion.div>

      <Tabs defaultValue="loan" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="loan" className="text-xs"><DollarSign className="h-3 w-3 mr-1" />Loan</TabsTrigger>
          <TabsTrigger value="charges" className="text-xs"><DollarSign className="h-3 w-3 mr-1" />Charges</TabsTrigger>
          <TabsTrigger value="numbering" className="text-xs"><Hash className="h-3 w-3 mr-1" />Numbering</TabsTrigger>
          <TabsTrigger value="theme" className="text-xs"><Palette className="h-3 w-3 mr-1" />Theme</TabsTrigger>
          <TabsTrigger value="access" className="text-xs"><Shield className="h-3 w-3 mr-1" />Access</TabsTrigger>
        </TabsList>

        <TabsContent value="loan">
          <Card>
            <CardHeader><CardTitle className="text-base">Loan Settings</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Interest Rate (%)</Label>
                  <Input value={loanSettings.interestRate} onChange={(e) => setLoanSettings({ ...loanSettings, interestRate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Penalty per Day (₹)</Label>
                  <Input value={loanSettings.penaltyPerDay} onChange={(e) => setLoanSettings({ ...loanSettings, penaltyPerDay: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Penalty Grace Days</Label>
                  <Input value={loanSettings.penaltyGradeDays} onChange={(e) => setLoanSettings({ ...loanSettings, penaltyGradeDays: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="charges">
          <Card>
            <CardHeader><CardTitle className="text-base">Charges</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Document Charges (₹)</Label>
                  <Input value={charges.documentCharges} onChange={(e) => setCharges({ ...charges, documentCharges: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Broker Commission (%)</Label>
                  <Input value={charges.brokerCommission} onChange={(e) => setCharges({ ...charges, brokerCommission: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="numbering">
          <Card>
            <CardHeader><CardTitle className="text-base">Numbering Configuration</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Loan Number Prefix</Label>
                  <Select value={numbering.loanPrefix} onValueChange={(v) => setNumbering({ ...numbering, loanPrefix: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OWN">OWN</SelectItem>
                      <SelectItem value="FR">FR</SelectItem>
                      <SelectItem value="HPL">HPL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input value={numbering.loanRangeFrom} onChange={(e) => setNumbering({ ...numbering, loanRangeFrom: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input value={numbering.loanRangeTo} onChange={(e) => setNumbering({ ...numbering, loanRangeTo: e.target.value })} />
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Bill Prefix</Label>
                  <Input value={numbering.billPrefix} onChange={(e) => setNumbering({ ...numbering, billPrefix: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input value={numbering.billRangeFrom} onChange={(e) => setNumbering({ ...numbering, billRangeFrom: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input value={numbering.billRangeTo} onChange={(e) => setNumbering({ ...numbering, billRangeTo: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="theme">
          <Card>
            <CardHeader><CardTitle className="text-base">UI Theme</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {["light", "dark", "system"].map((t) => (
                  <button key={t} onClick={() => setTheme(t)} className={`p-4 rounded-lg border-2 transition-all text-center ${theme === t ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                    <p className="text-sm font-medium text-foreground capitalize">{t}</p>
                  </button>
                ))}
                <button onClick={() => setTheme("custom")} className={`p-4 rounded-lg border-2 transition-all text-center ${theme === "custom" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                  <div className="flex gap-1 justify-center mb-1">
                    <div className="w-4 h-4 rounded-full bg-blue-500" />
                    <div className="w-4 h-4 rounded-full bg-green-500" />
                    <div className="w-4 h-4 rounded-full bg-purple-500" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Custom</p>
                </button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="access">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Access Control</CardTitle>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{roles.map((r) => (<SelectItem key={r} value={r}>{r}</SelectItem>))}</SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Page</TableHead>
                    {actions.map((a) => (<TableHead key={a} className="text-xs text-center">{a}</TableHead>))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page) => (
                    <TableRow key={page}>
                      <TableCell className="text-sm font-medium text-foreground">{page}</TableCell>
                      {actions.map((_, idx) => (
                        <TableCell key={idx} className="text-center">
                          <Checkbox checked={permissions[selectedRole]?.[page]?.[idx] ?? false} onCheckedChange={() => togglePermission(page, idx)} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
