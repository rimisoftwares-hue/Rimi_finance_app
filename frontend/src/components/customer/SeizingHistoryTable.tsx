import { useState } from 'react';
import { Edit, Trash2, Eye } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import axios from 'axios';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../ui/table';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { DatePicker } from '../ui/date-picker';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { AppSelect } from '../common/AppSelect';

const SEIZING_STATUS_OPTIONS = [
    { value: 'Pending', label: 'Pending' },
    { value: 'Paid', label: 'Paid' },
    { value: 'Cancelled', label: 'Cancelled' },
];
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '../ui/alert-dialog';
import { toast } from '../../hooks/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import { API_ORIGIN } from '../../api/apiClient';

const BASE_URL = API_ORIGIN;

export interface SeizingRecord {
    id: number | string;
    finance_id: number | string;
    customer_id: number | string;
    vehicle_id: number | string;
    seizing_charge: number;
    description: string | null;
    godown: string;
    godown_id?: string | null;
    godown_name?: string | null;
    seized_by: string;
    seizing_date: string;
    status: 'Pending' | 'Paid' | 'Cancelled';
    release_date: string | null;
    created_at: string;
}

interface SeizingHistoryTableProps {
    records: SeizingRecord[];
    customerId: string;
    onRefresh: () => void;
}

const statusVariant = (status: string) => {
    if (status === 'Pending') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    if (status === 'Paid') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    return 'bg-muted text-muted-foreground';
};

const formatDate = (d: string | null | undefined) => {
    if (!d || d === '-') return '-';
    try { return format(parseISO(d), 'dd/MM/yyyy'); } catch { return d; }
};

const defaultEdit: Omit<SeizingRecord, 'id' | 'finance_id' | 'customer_id' | 'vehicle_id' | 'created_at' | 'godown_id' | 'godown_name'> = {
    seizing_charge: 0,
    description: '',
    godown: '',
    seized_by: '',
    seizing_date: '',
    status: 'Pending',
    release_date: null,
};

const SeizingHistoryTable = ({ records, customerId, onRefresh }: SeizingHistoryTableProps) => {
    const { user } = useAuth();
    const isOwner = user?.role === 'owner';

    const [viewRecord, setViewRecord] = useState<SeizingRecord | null>(null);
    const [editRecord, setEditRecord] = useState<SeizingRecord | null>(null);
    const [editForm, setEditForm] = useState(defaultEdit);
    const [deleteId, setDeleteId] = useState<number | string | null>(null);
    const [loading, setLoading] = useState(false);

    const openEdit = (r: SeizingRecord) => {
        setEditRecord(r);
        setEditForm({
            seizing_charge: r.seizing_charge,
            description: r.description || '',
            godown: r.godown || (r as any).godown_name || '',
            seized_by: r.seized_by,
            seizing_date: r.seizing_date?.split('T')[0] || '',
            status: r.status,
            release_date: r.release_date?.split('T')[0] || null,
        });
    };

    const handleSaveEdit = async () => {
        if (!editRecord) return;
        try {
            setLoading(true);
            const res = await axios.put(
                `${BASE_URL}/api/customers/${customerId}/seizing/${editRecord.id}`,
                editForm
            );
            if (res.data.success) {
                toast({ title: 'Record updated successfully' });
                setEditRecord(null);
                onRefresh();
            }
        } catch {
            toast({ title: 'Error', description: 'Failed to update record', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteId) return;
        try {
            setLoading(true);
            const res = await axios.delete(
                `${BASE_URL}/api/customers/${customerId}/seizing/${deleteId}`
            );
            if (res.data.success) {
                toast({ title: 'Record deleted' });
                setDeleteId(null);
                onRefresh();
            }
        } catch {
            toast({ title: 'Error', description: 'Failed to delete record', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    if (records.length === 0) {
        return (
            <div className="text-center py-12 bg-muted/30 rounded-lg border border-border/50">
                <p className="text-muted-foreground">No seizing records found</p>
            </div>
        );
    }

    return (
        <>
            {/* ── Table ── */}
            <div className="rounded-xl border border-border overflow-hidden bg-card">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="table-header bg-muted/80 hover:bg-muted/50">
                                <TableHead className="w-[50px]">No</TableHead>
                                <TableHead>Seizing Date</TableHead>
                                <TableHead>Charge (₹)</TableHead>
                                <TableHead className="hidden sm:table-cell">Godown</TableHead>
                                <TableHead className="hidden md:table-cell">Seized By</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="hidden lg:table-cell">Release Date</TableHead>
                                {isOwner && (
                                    <TableHead className="w-[130px] text-center">Actions</TableHead>
                                )}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {records.map((r, idx) => (
                                <TableRow key={r.id} className="table-row-hover">
                                    <TableCell className="font-medium">{idx + 1}</TableCell>
                                    <TableCell>{formatDate(r.seizing_date)}</TableCell>
                                    <TableCell className="font-semibold text-amber-600 dark:text-amber-400">
                                        ₹{Number(r.seizing_charge).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                                        {r.godown || '-'}
                                    </TableCell>
                                    <TableCell className="hidden md:table-cell text-muted-foreground">
                                        {r.seized_by || '-'}
                                    </TableCell>
                                    <TableCell>
                                        <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusVariant(r.status)}`}>
                                            {r.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                                        {formatDate(r.release_date)}
                                    </TableCell>
                                    {isOwner && (
                                        <TableCell>
                                            <div className="flex items-center justify-center gap-1">
                                                <Button
                                                    variant="ghost" size="icon"
                                                    onClick={() => setViewRecord(r)}
                                                    className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                    title="View Details"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    onClick={() => openEdit(r)}
                                                    className="h-8 w-8 text-primary hover:bg-primary/10"
                                                    title="Edit Record"
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    onClick={() => setDeleteId(r.id)}
                                                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                                    title="Delete Record"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* ── View Dialog ── */}
            <Dialog open={!!viewRecord} onOpenChange={() => setViewRecord(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Seizing Record Details</DialogTitle>
                        <DialogDescription>Full details of this seizure record</DialogDescription>
                    </DialogHeader>
                    {viewRecord && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    ['Seizing Date', formatDate(viewRecord.seizing_date)],
                                    ['Release Date', formatDate(viewRecord.release_date)],
                                    ['Seized By', viewRecord.seized_by || '-'],
                                    ['Godown', viewRecord.godown || '-'],
                                ].map(([label, val]) => (
                                    <div key={label} className="space-y-1">
                                        <p className="text-xs font-medium text-muted-foreground">{label}</p>
                                        <p className="font-medium">{val}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">Seizing Charge</p>
                                    <p className="font-semibold text-amber-600 text-lg">
                                        ₹{Number(viewRecord.seizing_charge).toLocaleString()}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">Status</p>
                                    <span className={`px-2 py-1 text-xs rounded-full font-medium ${statusVariant(viewRecord.status)}`}>
                                        {viewRecord.status}
                                    </span>
                                </div>
                            </div>
                            {viewRecord.description && (
                                <div className="space-y-1">
                                    <p className="text-xs font-medium text-muted-foreground">Description</p>
                                    <div className="bg-muted/50 p-3 rounded-lg text-sm">{viewRecord.description}</div>
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setViewRecord(null)}>Close</Button>
                        {isOwner && viewRecord && (
                            <Button onClick={() => { setViewRecord(null); openEdit(viewRecord); }}>Edit Record</Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Edit Dialog ── */}
            <Dialog open={!!editRecord} onOpenChange={() => setEditRecord(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit Seizing Record</DialogTitle>
                        <DialogDescription>Update the seizing record details</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="ez_charge">Charge (₹) <span className="text-destructive">*</span></Label>
                                <Input
                                    id="ez_charge" type="number" min="0" step="0.01"
                                    value={editForm.seizing_charge}
                                    onChange={e => setEditForm(p => ({ ...p, seizing_charge: parseFloat(e.target.value) || 0 }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="ez_date">Seizing Date</Label>
                                <DatePicker
                                    id="ez_date"
                                    value={editForm.seizing_date}
                                    onChange={e => setEditForm(p => ({ ...p, seizing_date: e.target.value }))}
                                    placeholder="Seizing Date"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="ez_by">Seized By</Label>
                                <Input
                                    id="ez_by"
                                    value={editForm.seized_by}
                                    onChange={e => setEditForm(p => ({ ...p, seized_by: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="ez_godown">Godown</Label>
                                <Input
                                    id="ez_godown"
                                    value={editForm.godown}
                                    onChange={e => setEditForm(p => ({ ...p, godown: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="ez_status">Status</Label>
                                <AppSelect
                                    id="ez_status"
                                    value={editForm.status}
                                    onValueChange={val => setEditForm(p => ({ ...p, status: val as any }))}
                                    options={SEIZING_STATUS_OPTIONS}
                                    triggerClassName="w-full"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="ez_release">Release Date</Label>
                                <DatePicker
                                    id="ez_release"
                                    value={editForm.release_date || ''}
                                    onChange={e => setEditForm(p => ({ ...p, release_date: e.target.value || null }))}
                                    placeholder="Release Date"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="ez_desc">Description</Label>
                            <Textarea
                                id="ez_desc" rows={3}
                                value={editForm.description || ''}
                                onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                                placeholder="Additional notes..."
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditRecord(null)} disabled={loading}>Cancel</Button>
                        <Button onClick={handleSaveEdit} disabled={loading}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Delete Confirmation ── */}
            <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Seizing Record</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this seizing record? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={loading}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {loading ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

export default SeizingHistoryTable;
