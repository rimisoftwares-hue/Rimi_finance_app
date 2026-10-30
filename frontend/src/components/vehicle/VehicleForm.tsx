import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Loader2, Car, Info, DollarSign, Palette, Cog } from "lucide-react";
import type { VehicleInput } from "@/types/vehicle";

export const vehicleSchema = z.object({
  vehicle_name: z.string().min(1, "Required").max(100),
  vehicle_number: z.string().max(50).optional().nullable(),
  vehicle_modal: z.string().optional().nullable(),
  chassis_number: z.string().optional().nullable(),
  engine_number: z.string().optional().nullable(),
  brand: z.string().min(1, "Required"),
  model: z.string().min(1, "Required"),
  make_year: z.coerce.number().min(1900).max(new Date().getFullYear() + 1),
  fuel_type: z.enum(["petrol", "diesel", "electric", "cng", "hybrid"]).optional().nullable(),
  engine_capacity: z.string().optional().nullable(),
  fuel_tank_capacity: z.string().optional().nullable(),
  max_torque: z.string().optional().nullable(),
  top_speed: z.string().optional().nullable(),
  mileage: z.string().optional().nullable(),
  transmission: z.string().optional().nullable(),
  seating_capacity: z.coerce.number().optional().nullable(),
  body_type: z.enum(["bike", "car", "scooter", "sedan", "hatchback", "suv", "muv", "coupe", "convertible"]).optional().nullable(),
  num_owner: z.coerce.number().min(1).default(1),
  trip_driven: z.coerce.number().min(0).default(0),
  color: z.string().optional().nullable(),
  variant: z.string().optional().nullable(),
  base_price: z.coerce.number().min(0).default(0),
  final_price: z.coerce.number().min(0).default(0),
  selling_price: z.coerce.number().min(0).default(0),
  emi_from: z.coerce.number().min(0).default(0),
  deal_type: z.enum(["consulting", "finance"]).default("consulting"),
  status: z.enum(["available", "sold", "hosted", "sales", "seized"]).default("available"),
  primary_image_url: z.string().optional().nullable(),
});

export type VehicleFormValues = z.input<typeof vehicleSchema>;

interface Props {
  defaultValues?: Partial<VehicleFormValues>;
  onSubmit: (values: VehicleInput) => Promise<void> | void;
  submitting?: boolean;
  submitLabel?: string;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <div className="grid md:grid-cols-3 gap-3">{children}</div>
      </CardContent>
    </Card>
  );
}

export function VehicleForm({ defaultValues, onSubmit, submitting, submitLabel = "Save" }: Props) {
  const {
    register, handleSubmit, setValue, watch,
    formState: { errors },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: {
      make_year: new Date().getFullYear(),
      num_owner: 1,
      trip_driven: 0,
      base_price: 0, final_price: 0, selling_price: 0, emi_from: 0,
      deal_type: "consulting",
      status: "available",
      ...defaultValues,
    } as any,
  });

  const submit = handleSubmit(async (v) => {
    await onSubmit(v as unknown as VehicleInput);
  });

  const Sel = ({ name, options }: { name: keyof VehicleFormValues; options: { v: string; l: string }[] }) => (
    <Select value={(watch(name) as string) ?? ""} onValueChange={(val) => setValue(name, val as any)}>
      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section icon={Info} title="Basic Information">
        <Field label="Vehicle Name *" error={errors.vehicle_name?.message}>
          <Input {...register("vehicle_name")} />
        </Field>
        <Field label="Vehicle Number" error={errors.vehicle_number?.message}>
          <Input {...register("vehicle_number")} placeholder="TN 01 AB 1234" />
        </Field>
        <Field label="Model Variant" error={errors.vehicle_modal?.message}>
          <Input {...register("vehicle_modal")} />
        </Field>
        <Field label="Chassis Number"><Input {...register("chassis_number")} /></Field>
        <Field label="Engine Number"><Input {...register("engine_number")} /></Field>
        <Field label="Deal Type">
          <Sel name="deal_type" options={[{ v: "consulting", l: "Consulting" }, { v: "finance", l: "Finance" }]} />
        </Field>
      </Section>

      <Section icon={Car} title="Vehicle Details">
        <Field label="Brand *" error={errors.brand?.message}><Input {...register("brand")} /></Field>
        <Field label="Model *" error={errors.model?.message}><Input {...register("model")} /></Field>
        <Field label="Year *" error={errors.make_year?.message}><Input type="number" {...register("make_year")} /></Field>
        <Field label="Fuel Type">
          <Sel name="fuel_type" options={[
            { v: "petrol", l: "Petrol" }, { v: "diesel", l: "Diesel" }, { v: "electric", l: "Electric" },
            { v: "cng", l: "CNG" }, { v: "hybrid", l: "Hybrid" },
          ]} />
        </Field>
        <Field label="Body Type">
          <Sel name="body_type" options={[
            { v: "bike", l: "Bike" }, { v: "scooter", l: "Scooter" }, { v: "car", l: "Car" },
            { v: "sedan", l: "Sedan" }, { v: "hatchback", l: "Hatchback" }, { v: "suv", l: "SUV" },
            { v: "muv", l: "MUV" }, { v: "coupe", l: "Coupe" }, { v: "convertible", l: "Convertible" },
          ]} />
        </Field>
        <Field label="Transmission"><Input {...register("transmission")} placeholder="Manual / Automatic" /></Field>
      </Section>

      <Section icon={Cog} title="Specifications">
        <Field label="Engine Capacity"><Input {...register("engine_capacity")} placeholder="1197 cc" /></Field>
        <Field label="Fuel Tank Capacity"><Input {...register("fuel_tank_capacity")} placeholder="35 L" /></Field>
        <Field label="Max Torque"><Input {...register("max_torque")} placeholder="113 Nm" /></Field>
        <Field label="Top Speed"><Input {...register("top_speed")} placeholder="180 km/h" /></Field>
        <Field label="Mileage"><Input {...register("mileage")} placeholder="18 kmpl" /></Field>
        <Field label="Seating Capacity"><Input type="number" {...register("seating_capacity")} /></Field>
      </Section>

      <Section icon={Palette} title="Ownership & Appearance">
        <Field label="Number of Owners"><Input type="number" min={1} {...register("num_owner")} /></Field>
        <Field label="KM Driven"><Input type="number" min={0} {...register("trip_driven")} /></Field>
        <Field label="Color"><Input {...register("color")} /></Field>
        <Field label="Variant"><Input {...register("variant")} /></Field>
        <Field label="Primary Image URL"><Input {...register("primary_image_url")} placeholder="https://..." /></Field>
        <Field label="Status">
          <Sel name="status" options={[
            { v: "available", l: "Available" }, { v: "sold", l: "Sold" }, { v: "hosted", l: "Hosted" },
            { v: "sales", l: "Sales" }, { v: "seized", l: "Seized" },
          ]} />
        </Field>
      </Section>

      <Section icon={DollarSign} title="Pricing">
        <Field label="Base Price"><Input type="number" {...register("base_price")} /></Field>
        <Field label="Final Price"><Input type="number" {...register("final_price")} /></Field>
        <Field label="Selling Price"><Input type="number" {...register("selling_price")} /></Field>
        <Field label="EMI From"><Input type="number" {...register("emi_from")} /></Field>
      </Section>

      <Separator />

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={submitting} className="shadow-primary">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
