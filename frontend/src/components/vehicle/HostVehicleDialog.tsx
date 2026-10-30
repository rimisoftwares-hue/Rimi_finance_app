import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "../lib/utils";
import {
  Info, ClipboardCheck, DollarSign, FileCheck2, Image as ImageIcon,
  Video, Sparkles, FileText, Plus, Trash2, Upload, X,
  Bold, Italic, Heading, List as ListIcon, ListOrdered, Link as LinkIcon, Quote, Eye,
} from "lucide-react";
import type { Vehicle } from "@/types/vehicle";
import { uploadVehicleFiles, saveHostRecord, useUpdateVehicle } from "@/hooks/useVehicles";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Props {
  vehicle: Vehicle | null;
  onOpenChange: (open: boolean) => void;
}

interface DocumentRow { id: string; label: string; available: boolean; status: "original" | "copy" | "duplicate" | "not_available"; }
interface OfferRow {
  id: string; title: string; description: string; down_payment: number;
  interest: number; min_due: number; max_due: number; validity: string;
}
interface MediaAsset { path: string; url: string; }

const DEFAULT_DOCS: DocumentRow[] = [
  { id: "rc", label: "RC Book", available: true, status: "original" },
  { id: "insurance", label: "Insurance", available: false, status: "copy" },
  { id: "fc", label: "FC Certificate", available: false, status: "not_available" },
  { id: "invoice", label: "Invoice", available: false, status: "not_available" },
];

const STATUS_OPTIONS = [
  { value: "original", label: "Original" },
  { value: "copy", label: "Copy" },
  { value: "duplicate", label: "Duplicate" },
  { value: "not_available", label: "Not Available" },
] as const;

function SectionHeader({
  icon: Icon, title, subtitle,
}: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 pb-3">
      <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5 truncate">{value ?? "—"}</p>
    </div>
  );
}

export function HostVehicleDialog({ vehicle, onOpenChange }: Props) {
  const open = !!vehicle;

  // Section 2 — Registration
  const [regEnabled, setRegEnabled] = useState(false);
  const [vehNumber, setVehNumber] = useState("");
  const [fcExpiry, setFcExpiry] = useState("");
  const [insExpiry, setInsExpiry] = useState("");

  // Section 3 — Selling info
  const [numOwners, setNumOwners] = useState(1);
  const [kmDriven, setKmDriven] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [emiFrom, setEmiFrom] = useState(0);
  const [minimumDownPayment, setMinimumDownPayment] = useState(0);
  const [minDueAmount, setMinDueAmount] = useState(0);
  const [minDueMonths, setMinDueMonths] = useState(0);
  const [interestMonthly, setInterestMonthly] = useState(0);
  const [interestYearly, setInterestYearly] = useState(0);

  // Section 4 — Documents
  const [docs, setDocs] = useState<DocumentRow[]>(DEFAULT_DOCS);

  // Section 5 & 6 — Media
  const [images, setImages] = useState<MediaAsset[]>([]);
  const [videos, setVideos] = useState<MediaAsset[]>([]);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingVid, setUploadingVid] = useState(false);

  // Section 7 — Offers
  const [offers, setOffers] = useState<OfferRow[]>([]);

  // Section 8 — Terms
  const [terms, setTerms] = useState("");
  const termsRef = useRef<HTMLTextAreaElement>(null);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (vehicle) {
      setRegEnabled(!!vehicle.vehicle_number);
      setVehNumber(vehicle.vehicle_number ?? "");
      setNumOwners(vehicle.num_owner);
      setKmDriven(vehicle.trip_driven);
      setSellingPrice(vehicle.selling_price || vehicle.final_price);
      setEmiFrom(vehicle.emi_from);
    }
  }, [vehicle]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (regEnabled && !vehNumber.trim()) e.vehNumber = "Vehicle number is required when registration is enabled";
    if (sellingPrice <= 0) e.sellingPrice = "Selling price must be greater than 0";
    if (numOwners < 1) e.numOwners = "At least 1 owner required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const addDoc = () =>
    setDocs((d) => [...d, { id: crypto.randomUUID(), label: "New Document", available: false, status: "not_available" }]);

  const addOffer = () =>
    setOffers((o) => [...o, {
      id: crypto.randomUUID(), title: "", description: "",
      down_payment: 0, interest: 0, min_due: 0, max_due: 0, validity: "",
    }]);

  const updateOffer = (id: string, patch: Partial<OfferRow>) =>
    setOffers((o) => o.map((x) => x.id === id ? { ...x, ...patch } : x));

  const removeOffer = (id: string) =>
    setOffers((o) => o.filter((x) => x.id !== id));

  const onUploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingImg(true);
    try {
      const arr = Array.from(files);
      const uploaded = await uploadVehicleFiles("vehicle-images", arr);
      setImages((i) => [...i, ...uploaded]);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploadingImg(false);
    }
  };

  const onUploadVideos = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploadingVid(true);
    try {
      const uploaded = await uploadVehicleFiles("vehicle-videos", Array.from(files));
      setVideos((v) => [...v, ...uploaded]);
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploadingVid(false);
    }
  };

  // Markdown toolbar helpers
  const wrapSelection = (before: string, after = before) => {
    const ta = termsRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const selected = val.slice(start, end) || "text";
    const next = val.slice(0, start) + before + selected + after + val.slice(end);
    setTerms(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = start + before.length;
      ta.selectionEnd = start + before.length + selected.length;
    });
  };
  const prefixLines = (prefix: string) => {
    const ta = termsRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = ta.value;
    const lineStart = val.lastIndexOf("\n", start - 1) + 1;
    const before = val.slice(0, lineStart);
    const target = val.slice(lineStart, end);
    const after = val.slice(end);
    const replaced = target.split("\n").map((l) => prefix + l).join("\n");
    setTerms(before + replaced + after);
  };

  const updateVehicle = useUpdateVehicle();

  const save = async (mode: "draft" | "host") => {
    if (mode === "host" && !validate()) {
      toast.error("Please fix validation errors");
      return;
    }
    if (!vehicle) return;
    setSaving(true);
    try {
      saveHostRecord({
        vehicle_id: vehicle.id,
        registration_enabled: regEnabled,
        vehicle_number: regEnabled ? vehNumber : null,
        fc_expiry: fcExpiry || null,
        insurance_expiry: insExpiry || null,
        num_owners: numOwners,
        km_driven: kmDriven,
        selling_price: sellingPrice,
        emi_from: emiFrom,
        min_down_payment: minimumDownPayment || 0,
        min_due_amount: minDueAmount,
        min_due_months: minDueMonths,
        interest_monthly: interestMonthly,
        interest_yearly: interestYearly,
        documents: docs,
        offers,
        additional_images: images,
        videos,
        terms_markdown: terms,
        status: mode === "host" ? "hosted" : "draft",
      });
      if (mode === "host") {
        await updateVehicle.mutateAsync({ id: vehicle.id, status: "hosted" });
      }
      toast.success(mode === "host" ? "Vehicle hosted successfully" : "Draft saved");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const existingImage = vehicle?.primary_image_url ?? vehicle?.images?.[0]?.image_url ?? null;

  const errorLine = (name: string) =>
    errors[name] ? <p className="text-xs text-destructive mt-1">{errors[name]}</p> : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[95vw] w-[95vw] h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-card">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Host Vehicle
            {vehicle && (
              <Badge variant="outline" className="ml-2 font-normal">
                {vehicle.brand} · {vehicle.model} · {vehicle.make_year}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {/* SECTION 1 — Vehicle Information (READ ONLY) */}
          <section>
            <SectionHeader icon={Info} title="Vehicle Information" subtitle="Read-only from vehicle master" />
            <Card className="shadow-card">
              <CardContent className="p-4 grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                <InfoCell label="Brand" value={vehicle?.brand} />
                <InfoCell label="Model" value={vehicle?.model} />
                <InfoCell label="Year" value={vehicle?.make_year} />
                <InfoCell label="Fuel Type" value={vehicle?.fuel_type} />
                <InfoCell label="Engine Capacity" value={vehicle?.engine_capacity} />
                <InfoCell label="Fuel Tank" value={vehicle?.fuel_tank_capacity} />
                <InfoCell label="Max Torque" value={vehicle?.max_torque} />
                <InfoCell label="Top Speed" value={vehicle?.top_speed} />
                <InfoCell label="Mileage" value={vehicle?.mileage} />
                <InfoCell label="Transmission" value={vehicle?.transmission} />
                <InfoCell label="Seating" value={vehicle?.seating_capacity} />
                <InfoCell label="Body" value={vehicle?.body_type} />
                <InfoCell label="vehcile number" value={vehNumber} />
                <InfoCell label="Num Owner" value={numOwners} />
                <InfoCell label="Selling Price" value={sellingPrice} />
              </CardContent>
            </Card>
          </section>

          {/* SECTION 3 — Selling Info */}
          <section>
            <SectionHeader icon={DollarSign} title="Vehicle Selling Information" />
            <Card className="shadow-card">
              <CardContent className="p-4 grid md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div>
                  <Label>FC Expiry Date</Label>
                  <DatePicker value={fcExpiry} onChange={(e) => setFcExpiry(e.target.value)} placeholder="FC Expiry Date" />
                </div>
                <div>
                  <Label>Insurance Expiry Date</Label>
                  <DatePicker value={insExpiry} onChange={(e) => setInsExpiry(e.target.value)} placeholder="Insurance Expiry Date" />
                </div>
                <div>
                  <Label>KM Driven</Label>
                  <Input type="number" min={0} value={kmDriven} onChange={(e) => setKmDriven(+e.target.value)} />
                </div>
                <div>
                  <Label>EMI From</Label>
                  <Input type="number" min={0} value={emiFrom} onChange={(e) => setEmiFrom(+e.target.value)} />
                </div>
                <div>
                  <Label>Minimum Downpayment</Label>
                  <Input type="number" min={0} value={minimumDownPayment} onChange={(e) => setMinimumDownPayment(+e.target.value)} />
                </div>
                <div>
                  <Label>Interest % (Monthly)</Label>
                  <Input type="number" step="0.01" min={0} value={interestMonthly} onChange={(e) => setInterestMonthly(+e.target.value)} />
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* SECTION 4 — Documents */}
          <section>
            <SectionHeader icon={FileCheck2} title="Vehicle Documents" subtitle="Original documents available with the vehicle" />
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-2">
                {docs.map((d, i) => (
                  <div key={d.id} className="grid grid-cols-12 gap-3 items-center py-2 border-b last:border-0">
                    <Input
                      className="col-span-5"
                      value={d.label}
                      onChange={(e) => setDocs((prev) => prev.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))}
                    />
                    <div className="col-span-3 flex items-center gap-2">
                      <Switch
                        checked={d.available}
                        onCheckedChange={(v) => setDocs((prev) => prev.map((x, idx) => idx === i ? { ...x, available: v } : x))}
                      />
                      <span className="text-xs text-muted-foreground">{d.available ? "Available" : "Not available"}</span>
                    </div>
                    <div className="col-span-3">
                      <Select
                        value={d.status}
                        onValueChange={(v) => setDocs((prev) => prev.map((x, idx) => idx === i ? { ...x, status: v as any } : x))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="col-span-1 text-destructive"
                      onClick={() => setDocs((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addDoc} className="mt-2">
                  <Plus className="h-4 w-4" /> Add Document
                </Button>
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* SECTION 5 — Images */}
          <section>
            <SectionHeader icon={ImageIcon} title="Vehicle Images" />
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-4">
                {existingImage && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Existing vehicle image</p>
                    <img src={existingImage} alt="existing" className="h-40 rounded-md object-cover border" />
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Upload additional images</p>
                  <label className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed rounded-md p-6 hover:border-primary transition-fast">
                    <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                    <span className="text-sm">{uploadingImg ? "Uploading…" : "Click to upload images"}</span>
                    <input type="file" accept="image/*" multiple hidden onChange={(e) => onUploadImages(e.target.files)} />
                  </label>
                  {images.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-3">
                      {images.map((im, i) => (
                        <div key={im.path} className="relative group">
                          <img src={im.url} className="h-24 w-full object-cover rounded-md border" alt="upload" />
                          <button
                            onClick={() => setImages((arr) => arr.filter((_, idx) => idx !== i))}
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-fast"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* SECTION 6 — Videos */}
          <section>
            <SectionHeader icon={Video} title="Vehicle Videos" />
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-4">
                <label className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed rounded-md p-6 hover:border-primary transition-fast">
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                  <span className="text-sm">{uploadingVid ? "Uploading…" : "Click to upload videos"}</span>
                  <input type="file" accept="video/*" multiple hidden onChange={(e) => onUploadVideos(e.target.files)} />
                </label>
                {videos.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {videos.map((v, i) => (
                      <div key={v.path} className="relative group">
                        <video src={v.url} controls className="w-full rounded-md border" />
                        <button
                          onClick={() => setVideos((arr) => arr.filter((_, idx) => idx !== i))}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <Separator />

          {/* SECTION 7 — Assuring Offers */}
          <section>
            <SectionHeader icon={Sparkles} title="Assuring Offers" subtitle="Finance company offers" />
            <div className="space-y-3">
              {offers.map((o) => (
                <Card key={o.id} className="shadow-card border-primary/20">
                  <CardContent className="p-4 grid md:grid-cols-3 lg:grid-cols-4 gap-3">
                    <div className="md:col-span-2 lg:col-span-2">
                      <Label>Offer Title</Label>
                      <Input value={o.title} onChange={(e) => updateOffer(o.id, { title: e.target.value })} />
                    </div>
                    <div>
                      <Label>Validity</Label>
                      <DatePicker value={o.validity} onChange={(e) => updateOffer(o.id, { validity: e.target.value })} placeholder="Validity Date" />
                    </div>
                    <div className="lg:col-span-1 flex items-end">
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeOffer(o.id)}>
                        <Trash2 className="h-4 w-4" /> Remove
                      </Button>
                    </div>
                    <div className="md:col-span-3 lg:col-span-4">
                      <Label>Description</Label>
                      <Textarea rows={2} value={o.description} onChange={(e) => updateOffer(o.id, { description: e.target.value })} />
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" onClick={addOffer}>
                <Plus className="h-4 w-4" /> Add Offer
              </Button>
            </div>
          </section>

          <Separator />

          {/* SECTION 8 — Terms & Conditions */}
          <section>
            <SectionHeader icon={FileText} title="Terms & Conditions" subtitle="Markdown editor with live preview" />
            <Card className="shadow-card">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-1 flex-wrap border-b pb-2">
                  <Button variant="ghost" size="sm" onClick={() => wrapSelection("**")}><Bold className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => wrapSelection("*")}><Italic className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => prefixLines("## ")}><Heading className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => prefixLines("- ")}><ListIcon className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => prefixLines("1. ")}><ListOrdered className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => wrapSelection("[", "](url)")}><LinkIcon className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => prefixLines("> ")}><Quote className="h-4 w-4" /></Button>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Editor</Label>
                    <Textarea
                      ref={termsRef}
                      value={terms}
                      onChange={(e) => setTerms(e.target.value)}
                      rows={14}
                      className="mt-1 font-mono text-sm"
                      placeholder="## Terms&#10;&#10;- Payment must be made on time&#10;- ..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Live Preview
                    </Label>
                    <div className="mt-1 border rounded-md p-3 bg-muted/20 h-[336px] overflow-y-auto prose prose-sm max-w-none dark:prose-invert">
                      {terms.trim()
                        ? <ReactMarkdown>{terms}</ReactMarkdown>
                        : <p className="text-muted-foreground text-sm italic">Preview will appear here…</p>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-card">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>
            Save Draft
          </Button>
          <Button onClick={() => save("host")} disabled={saving} className="shadow-primary">
            <Sparkles className="h-4 w-4" /> {saving ? "Hosting…" : "Host Vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
