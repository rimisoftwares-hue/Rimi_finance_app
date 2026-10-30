import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Info, DollarSign, FileCheck2, Image as ImageIcon,
  Video, Sparkles, FileText, Plus, Trash2, Upload, X,
  Bold, Italic, Heading, List as ListIcon, ListOrdered, Link as LinkIcon, Quote, Eye, Car,
} from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "../lib/utils";
import type { Vehicle } from "@/types/vehicle";
import { uploadVehicleFiles, saveHostRecord, useUpdateVehicle } from "@/hooks/useVehicles";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Props {
  vehicle: Vehicle;
  onBack: () => void;
  onSuccess?: () => void;
}

interface DocumentRow {
  id: string;
  label: string;
  available: boolean;
  status: "original" | "copy" | "duplicate" | "not_available";
}

interface OfferRow {
  id: string;
  title: string;
  description: string;
  down_payment: number;
  interest: number;
  min_due: number;
  max_due: number;
  validity: string;
}

interface MediaAsset {
  path: string;
  url: string;
}

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
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 pb-3">
      <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
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

export function HostVehiclePage({ vehicle, onBack, onSuccess }: Props) {
  const [regEnabled, setRegEnabled] = useState(false);
  const [vehNumber, setVehNumber] = useState("");
  const [fcExpiry, setFcExpiry] = useState("");
  const [insExpiry, setInsExpiry] = useState("");

  const [numOwners, setNumOwners] = useState(1);
  const [kmDriven, setKmDriven] = useState(0);
  const [sellingPrice, setSellingPrice] = useState(0);
  const [emiFrom, setEmiFrom] = useState(0);
  const [minimumDownPayment, setMinimumDownPayment] = useState(0);
  const [minDueAmount, setMinDueAmount] = useState(0);
  const [minDueMonths, setMinDueMonths] = useState(0);
  const [interestMonthly, setInterestMonthly] = useState(0);
  const [interestYearly, setInterestYearly] = useState(0);

  const [docs, setDocs] = useState<DocumentRow[]>(DEFAULT_DOCS);
  const [images, setImages] = useState<MediaAsset[]>([]);
  const [videos, setVideos] = useState<MediaAsset[]>([]);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingVid, setUploadingVid] = useState(false);

  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [terms, setTerms] = useState("");
  const termsRef = useRef<HTMLTextAreaElement>(null);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (vehicle) {
      setRegEnabled(!!vehicle.vehicle_number);
      setVehNumber(vehicle.vehicle_number ?? "");
      setNumOwners(vehicle.num_owner || 1);
      setKmDriven(vehicle.trip_driven || 0);
      setSellingPrice(vehicle.selling_price || vehicle.final_price || 0);
      setEmiFrom(vehicle.emi_from || 0);
      if (vehicle.fc_expriry_date) setFcExpiry(vehicle.fc_expriry_date);
      if (vehicle.insurance_expriry_date) setInsExpiry(vehicle.insurance_expriry_date);
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
    setDocs((d) => [
      ...d,
      { id: crypto.randomUUID(), label: "New Document", available: false, status: "not_available" },
    ]);

  const addOffer = () =>
    setOffers((o) => [
      ...o,
      {
        id: crypto.randomUUID(),
        title: "",
        description: "",
        down_payment: 0,
        interest: 0,
        min_due: 0,
        max_due: 0,
        validity: "",
      },
    ]);

  const updateOffer = (id: string, patch: Partial<OfferRow>) =>
    setOffers((o) => o.map((x) => (x.id === id ? { ...x, ...patch } : x)));

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
      await saveHostRecord({
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
      if (onSuccess) {
        onSuccess();
      } else {
        onBack();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const existingImage = vehicle.primary_image_url ?? vehicle.images?.[0]?.image_url ?? null;
  const displayName =
    vehicle.vehicle_name ||
    [vehicle.brand, vehicle.model_name].filter(Boolean).join(" ") ||
    vehicle.vehicle_modal ||
    "Vehicle";

  return (
    <div className="p-6 space-y-8 max-w-[1500px] mx-auto animate-fade-in pb-16">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                Host Vehicle
              </h1>
              <Badge variant="outline" className="text-sm font-medium">
                {displayName}
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {vehicle.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Configure hosting terms, selling price, financing options, and documents.
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={onBack} disabled={saving}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>
            Save Draft
          </Button>
          <Button onClick={() => save("host")} disabled={saving} className="shadow-primary">
            <Sparkles className="h-4 w-4 mr-2" />
            {saving ? "Hosting…" : "Host Vehicle"}
          </Button>
        </div>
      </div>

      {/* SECTION 1 — Vehicle Information (READ ONLY) */}
      <section className="space-y-3">
        <SectionHeader icon={Info} title="Vehicle Overview" subtitle="Read-only details from vehicle master" />
        <Card className="shadow-card">
          <CardContent className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <InfoCell label="Brand" value={vehicle.brand} />
            <InfoCell label="Model" value={vehicle.model_name || vehicle.model} />
            <InfoCell label="Year" value={vehicle.make_year} />
            <InfoCell label="Fuel Type" value={vehicle.fuel_type} />
            <InfoCell label="Engine Capacity" value={vehicle.engine_capacity} />
            <InfoCell label="Fuel Tank" value={vehicle.fuel_tank_capacity} />
            <InfoCell label="Max Torque" value={vehicle.max_torque} />
            <InfoCell label="Top Speed" value={vehicle.top_speed} />
            <InfoCell label="Mileage" value={vehicle.mileage} />
            <InfoCell label="Transmission" value={vehicle.transmission} />
            <InfoCell label="Seating" value={vehicle.seating_capacity} />
            <InfoCell label="Body Type" value={vehicle.body_type} />
            <InfoCell label="Vehicle Number" value={vehicle.vehicle_number || "—"} />
            <InfoCell label="Num Owners" value={vehicle.num_owner} />
            <InfoCell label="Deal Type" value={vehicle.deal_type} />
          </CardContent>
        </Card>
      </section>

      {/* SECTION 2 — Selling & Financing Info */}
      <section className="space-y-3">
        <SectionHeader icon={DollarSign} title="Vehicle Selling & Financing" subtitle="Set pricing, EMIs, and interest parameters" />
        <Card className="shadow-card">
          <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="sellingPrice">Selling Price (₹) *</Label>
              <Input
                id="sellingPrice"
                type="number"
                min={0}
                value={sellingPrice || ""}
                onChange={(e) => setSellingPrice(+e.target.value)}
                placeholder="0"
                className={errors.sellingPrice ? "border-destructive" : ""}
              />
              {errors.sellingPrice && (
                <p className="text-xs text-destructive mt-1">{errors.sellingPrice}</p>
              )}
            </div>

            <div>
              <Label htmlFor="kmDriven">KM Driven</Label>
              <Input
                id="kmDriven"
                type="number"
                min={0}
                value={kmDriven || ""}
                onChange={(e) => setKmDriven(+e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <Label htmlFor="numOwners">Number of Owners *</Label>
              <Input
                id="numOwners"
                type="number"
                min={1}
                value={numOwners || ""}
                onChange={(e) => setNumOwners(+e.target.value)}
                placeholder="1"
                className={errors.numOwners ? "border-destructive" : ""}
              />
              {errors.numOwners && (
                <p className="text-xs text-destructive mt-1">{errors.numOwners}</p>
              )}
            </div>

            <div>
              <Label htmlFor="emiFrom">EMI From (₹/month)</Label>
              <Input
                id="emiFrom"
                type="number"
                min={0}
                value={emiFrom || ""}
                onChange={(e) => setEmiFrom(+e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <Label htmlFor="minDownPayment">Minimum Downpayment (₹)</Label>
              <Input
                id="minDownPayment"
                type="number"
                min={0}
                value={minimumDownPayment || ""}
                onChange={(e) => setMinimumDownPayment(+e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <Label htmlFor="interestMonthly">Interest % (Monthly)</Label>
              <Input
                id="interestMonthly"
                type="number"
                step="0.01"
                min={0}
                value={interestMonthly || ""}
                onChange={(e) => setInterestMonthly(+e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label htmlFor="fcExpiry">FC Expiry Date</Label>
              <DatePicker
                id="fcExpiry"
                value={fcExpiry}
                onChange={(e) => setFcExpiry(e.target.value)}
                placeholder="FC Expiry Date"
              />
            </div>

            <div>
              <Label htmlFor="insExpiry">Insurance Expiry Date</Label>
              <DatePicker
                id="insExpiry"
                value={insExpiry}
                onChange={(e) => setInsExpiry(e.target.value)}
                placeholder="Insurance Expiry Date"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SECTION 3 — Documents */}
      <section className="space-y-3">
        <SectionHeader icon={FileCheck2} title="Vehicle Documents" subtitle="Track original and duplicate documents available" />
        <Card className="shadow-card">
          <CardContent className="p-5 space-y-3">
            {docs.map((d, i) => (
              <div key={d.id} className="grid grid-cols-12 gap-3 items-center py-2.5 border-b last:border-0">
                <div className="col-span-12 sm:col-span-5">
                  <Input
                    value={d.label}
                    onChange={(e) =>
                      setDocs((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x))
                      )
                    }
                    placeholder="Document Name"
                  />
                </div>
                <div className="col-span-6 sm:col-span-3 flex items-center gap-2">
                  <Switch
                    checked={d.available}
                    onCheckedChange={(v) =>
                      setDocs((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, available: v } : x))
                      )
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {d.available ? "Available" : "Not available"}
                  </span>
                </div>
                <div className="col-span-5 sm:col-span-3">
                  <Select
                    value={d.status}
                    onValueChange={(v) =>
                      setDocs((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, status: v as any } : x))
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive/80"
                    onClick={() => setDocs((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addDoc} className="mt-2">
              <Plus className="h-4 w-4 mr-1.5" /> Add Document
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* SECTION 4 — Images */}
      <section className="space-y-3">
        <SectionHeader icon={ImageIcon} title="Vehicle Images" subtitle="Upload additional vehicle photos for host listing" />
        <Card className="shadow-card">
          <CardContent className="p-5 space-y-4">
            {existingImage && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Primary Vehicle Image</p>
                <img src={existingImage} alt="existing" className="h-44 rounded-md object-cover border" />
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Upload Additional Images</p>
              <label className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 hover:border-primary transition-colors bg-muted/20 hover:bg-muted/40">
                <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                <span className="text-sm font-medium">
                  {uploadingImg ? "Uploading…" : "Click to upload images"}
                </span>
                <span className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP up to 10MB</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => onUploadImages(e.target.files)}
                />
              </label>
              {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 mt-4">
                  {images.map((im, i) => (
                    <div key={im.path} className="relative group rounded-md overflow-hidden border">
                      <img src={im.url} className="h-28 w-full object-cover" alt="upload" />
                      <button
                        type="button"
                        onClick={() => setImages((arr) => arr.filter((_, idx) => idx !== i))}
                        className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
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

      {/* SECTION 5 — Videos */}
      <section className="space-y-3">
        <SectionHeader icon={Video} title="Vehicle Videos" subtitle="Upload walkaround or engine sound videos" />
        <Card className="shadow-card">
          <CardContent className="p-5 space-y-4">
            <label className="cursor-pointer flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 hover:border-primary transition-colors bg-muted/20 hover:bg-muted/40">
              <Upload className="h-6 w-6 text-muted-foreground mb-2" />
              <span className="text-sm font-medium">
                {uploadingVid ? "Uploading…" : "Click to upload videos"}
              </span>
              <span className="text-xs text-muted-foreground mt-1">MP4, WEBM, MOV</span>
              <input
                type="file"
                accept="video/*"
                multiple
                hidden
                onChange={(e) => onUploadVideos(e.target.files)}
              />
            </label>
            {videos.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {videos.map((v, i) => (
                  <div key={v.path} className="relative group rounded-md overflow-hidden border bg-black">
                    <video src={v.url} controls className="w-full h-48 object-contain" />
                    <button
                      type="button"
                      onClick={() => setVideos((arr) => arr.filter((_, idx) => idx !== i))}
                      className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1"
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

      {/* SECTION 6 — Assuring Offers */}
      <section className="space-y-3">
        <SectionHeader icon={Sparkles} title="Assuring Offers" subtitle="Special finance company offers or perks" />
        <div className="space-y-3">
          {offers.map((o) => (
            <Card key={o.id} className="shadow-card border-primary/20">
              <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <Label>Offer Title</Label>
                  <Input
                    value={o.title}
                    onChange={(e) => updateOffer(o.id, { title: e.target.value })}
                    placeholder="e.g. Free Insurance for 1 Year"
                  />
                </div>
                <div>
                  <Label>Validity</Label>
                  <DatePicker
                    value={o.validity}
                    onChange={(e) => updateOffer(o.id, { validity: e.target.value })}
                    placeholder="Validity Date"
                  />
                </div>
                <div className="flex items-end justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive/80"
                    onClick={() => removeOffer(o.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Remove
                  </Button>
                </div>
                <div className="col-span-full">
                  <Label>Description</Label>
                  <Textarea
                    rows={2}
                    value={o.description}
                    onChange={(e) => updateOffer(o.id, { description: e.target.value })}
                    placeholder="Offer details and conditions..."
                  />
                </div>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" onClick={addOffer}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Offer
          </Button>
        </div>
      </section>

      {/* SECTION 7 — Terms & Conditions */}
      <section className="space-y-3">
        <SectionHeader icon={FileText} title="Terms & Conditions" subtitle="Markdown formatted terms with live preview" />
        <Card className="shadow-card">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-1 flex-wrap border-b pb-2">
              <Button variant="ghost" size="sm" onClick={() => wrapSelection("**")}>
                <Bold className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => wrapSelection("*")}>
                <Italic className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => prefixLines("## ")}>
                <Heading className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => prefixLines("- ")}>
                <ListIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => prefixLines("1. ")}>
                <ListOrdered className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => wrapSelection("[", "](url)")}>
                <LinkIcon className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => prefixLines("> ")}>
                <Quote className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Editor</Label>
                <Textarea
                  ref={termsRef}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  rows={14}
                  className="mt-1 font-mono text-sm"
                  placeholder="## Terms and Conditions&#10;&#10;- Payment must be made on time&#10;- Vehicle handover terms..."
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" /> Live Preview
                </Label>
                <div className="mt-1 border rounded-md p-4 bg-muted/20 h-[336px] overflow-y-auto prose prose-sm max-w-none dark:prose-invert">
                  {terms.trim() ? (
                    <ReactMarkdown>{terms}</ReactMarkdown>
                  ) : (
                    <p className="text-muted-foreground text-sm italic">
                      Preview will appear here…
                    </p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Bottom Sticky Action Bar */}
      <div className="sticky bottom-4 z-20 bg-card/95 backdrop-blur border rounded-lg p-4 shadow-lg flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onBack} disabled={saving}>
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>
          <span className="text-sm text-muted-foreground hidden sm:inline">
            Review changes before hosting
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={onBack} disabled={saving}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>
            Save Draft
          </Button>
          <Button onClick={() => save("host")} disabled={saving} className="shadow-primary">
            <Sparkles className="h-4 w-4 mr-2" />
            {saving ? "Hosting…" : "Host Vehicle"}
          </Button>
        </div>
      </div>
    </div>
  );
}
