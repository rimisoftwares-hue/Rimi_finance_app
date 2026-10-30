import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "../ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "../ui/popover";
import { Calendar } from "../ui/calendar";
import { Label } from "../ui/label";

type TransactionType = "income" | "expense";

export interface TransactionFormData {
  id?: number;
  type: TransactionType;
  date: Date;
  category: string;
  description: string;
  amount: number;
  paymentMode: string;
  enteredBy: string;
}

interface TransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: TransactionFormData) => void;
  editData?: TransactionFormData | null;
}

const categories = [
  "Office Rent", "Electricity Bill", "Internet", "Stationery",
  "Loan EMI Collection", "Processing Fee", "Late Fee", "Commission",
  "Salary", "Maintenance", "Travel", "Other",
];

export function TransactionDialog({ open, onOpenChange, onSave, editData }: TransactionDialogProps) {
  const [type, setType] = useState<TransactionType>("expense");
  const [date, setDate] = useState<Date>(new Date());
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [enteredBy, setEnteredBy] = useState("");

  useEffect(() => {
    if (editData) {
      setType(editData.type);
      setDate(editData.date);
      setCategory(editData.category);
      setDescription(editData.description);
      setAmount(String(editData.amount));
      setPaymentMode(editData.paymentMode);
      setEnteredBy(editData.enteredBy);
    } else {
      setType("expense");
      setDate(new Date());
      setCategory("");
      setDescription("");
      setAmount("");
      setPaymentMode("");
      setEnteredBy("");
    }
  }, [editData, open]);

  const handleSave = () => {
    if (!category || !amount || !enteredBy) return;
    onSave({
      id: editData?.id,
      type, date, category, description,
      amount: parseFloat(amount),
      paymentMode, enteredBy,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 rounded-xl overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="text-lg font-semibold">
            {editData ? "Edit Transaction" : "Add Transaction"}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Transaction Type Toggle */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Transaction Type</Label>
            <div className="flex bg-secondary rounded-lg p-1">
              {(["income", "expense"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex-1 py-2.5 text-sm font-medium rounded-md transition-all duration-200 capitalize",
                    type === t
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Date <span className="text-destructive">*</span></Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal bg-background">
                  <CalendarDays className="w-4 h-4 mr-2 text-muted-foreground" />
                  {format(date, "dd MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Category <span className="text-destructive">*</span></Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              placeholder="Enter description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-background resize-none min-h-[80px]"
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Amount <span className="text-destructive">*</span></Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium text-sm">₹</span>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8 bg-background"
              />
            </div>
          </div>

          {/* Payment Mode & Entered By - side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Entered By <span className="text-destructive">*</span></Label>
              <Select value={enteredBy} onValueChange={setEnteredBy}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Rahul">Rahul</SelectItem>
                  <SelectItem value="Priya">Priya</SelectItem>
                  <SelectItem value="Vikram">Vikram</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!category || !amount || !enteredBy}>
            Save Transaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
