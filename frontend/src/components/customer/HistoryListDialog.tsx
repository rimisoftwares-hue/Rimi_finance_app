// import { useState } from 'react';
// import { Eye, Edit2, Trash2, Phone, FileText, X } from 'lucide-react';
// import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
// import { Button } from '../ui/button';
// import { Badge } from '../ui/badge';
// import { Textarea } from '../ui/textarea';
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
// import { HistoryEntry } from '../../types/customer';
// import { format } from 'date-fns';
// import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';

// interface HistoryListDialogProps {
//   isOpen: boolean;
//   onClose: () => void;
//   entries: HistoryEntry[];
//   onEdit: (entry: HistoryEntry) => void;
//   onDelete: (id: number) => void;
// }

// const HistoryListDialog = ({ isOpen, onClose, entries, onEdit, onDelete }: HistoryListDialogProps) => {
//   const [viewEntry, setViewEntry] = useState<HistoryEntry | null>(null);
//   const [editEntry, setEditEntry] = useState<HistoryEntry | null>(null);
//   const [editMessage, setEditMessage] = useState('');
//   const [deleteId, setDeleteId] = useState<number | null>(null);

//   const handleEditSave = () => {
//     if (editEntry && editMessage.trim()) {
//       onEdit({ ...editEntry, message: editMessage.trim() });
//       setEditEntry(null);
//       setEditMessage('');
//     }
//   };

//   const handleDeleteConfirm = () => {
//     if (deleteId !== null) {
//       onDelete(deleteId);
//       setDeleteId(null);
//     }
//   };

//   return (
//     <>
//       <Dialog open={isOpen} onOpenChange={onClose}>
//         <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
//           <DialogHeader>
//             <DialogTitle className="text-xl font-display">Call / RC History</DialogTitle>
//           </DialogHeader>

//           {entries.length === 0 ? (
//             <div className="text-center py-12 text-muted-foreground">
//               No history entries found.
//             </div>
//           ) : (
//             <div className="overflow-x-auto">
//               <Table>
//                 <TableHeader>
//                   <TableRow>
//                     <TableHead className="w-16">S.No</TableHead>
//                     <TableHead className="w-24">Type</TableHead>
//                     <TableHead>Message</TableHead>
//                     <TableHead className="w-32">Date</TableHead>
//                     <TableHead className="w-32 text-right">Actions</TableHead>
//                   </TableRow>
//                 </TableHeader>
//                 <TableBody>
//                   {entries.map((entry, index) => (
//                     <TableRow key={entry.id}>
//                       <TableCell className="font-medium">{index + 1}</TableCell>
//                       <TableCell>
//                         <Badge 
//                           variant={entry.type === 'call' ? 'default' : 'secondary'}
//                           className="gap-1"
//                         >
//                           {entry.type === 'call' ? (
//                             <Phone className="w-3 h-3" />
//                           ) : (
//                             <FileText className="w-3 h-3" />
//                           )}
//                           {entry.type === 'call' ? 'Call' : 'RC'}
//                         </Badge>
//                       </TableCell>
//                       <TableCell className="max-w-xs truncate">{entry.message}</TableCell>
//                       <TableCell>{format(new Date(entry.date), 'dd MMM yyyy')}</TableCell>
//                       <TableCell>
//                         <div className="flex items-center justify-end gap-1">
//                           <Button
//                             variant="ghost"
//                             size="icon"
//                             onClick={() => setViewEntry(entry)}
//                             className="h-8 w-8"
//                           >
//                             <Eye className="w-4 h-4" />
//                           </Button>
//                           <Button
//                             variant="ghost"
//                             size="icon"
//                             onClick={() => {
//                               setEditEntry(entry);
//                               setEditMessage(entry.message);
//                             }}
//                             className="h-8 w-8"
//                           >
//                             <Edit2 className="w-4 h-4" />
//                           </Button>
//                           <Button
//                             variant="ghost"
//                             size="icon"
//                             onClick={() => setDeleteId(entry.id)}
//                             className="h-8 w-8 text-destructive hover:text-destructive"
//                           >
//                             <Trash2 className="w-4 h-4" />
//                           </Button>
//                         </div>
//                       </TableCell>
//                     </TableRow>
//                   ))}
//                 </TableBody>
//               </Table>
//             </div>
//           )}
//         </DialogContent>
//       </Dialog>

//       {/* View Entry Dialog */}
//       <Dialog open={!!viewEntry} onOpenChange={() => setViewEntry(null)}>
//         <DialogContent>
//           <DialogHeader>
//             <DialogTitle className="flex items-center gap-2">
//               {viewEntry?.type === 'call' ? (
//                 <Phone className="w-5 h-5 text-primary" />
//               ) : (
//                 <FileText className="w-5 h-5 text-accent" />
//               )}
//               {viewEntry?.type === 'call' ? 'Call History' : 'RC Book History'}
//             </DialogTitle>
//           </DialogHeader>
//           <div className="space-y-4">
//             <div>
//               <span className="text-sm text-muted-foreground">Date:</span>
//               <p className="font-medium">
//                 {viewEntry && format(new Date(viewEntry.date), 'PPP')}
//               </p>
//             </div>
//             <div>
//               <span className="text-sm text-muted-foreground">Message:</span>
//               <p className="whitespace-pre-wrap mt-1">{viewEntry?.message}</p>
//             </div>
//           </div>
//         </DialogContent>
//       </Dialog>

//       {/* Edit Entry Dialog */}
//       <Dialog open={!!editEntry} onOpenChange={() => setEditEntry(null)}>
//         <DialogContent>
//           <DialogHeader>
//             <DialogTitle>Edit Entry</DialogTitle>
//           </DialogHeader>
//           <div className="space-y-4">
//             <Textarea
//               value={editMessage}
//               onChange={(e) => setEditMessage(e.target.value)}
//               className="min-h-[150px]"
//             />
//             <div className="flex justify-end gap-3">
//               <Button variant="outline" onClick={() => setEditEntry(null)}>
//                 Cancel
//               </Button>
//               <Button onClick={handleEditSave}>Save Changes</Button>
//             </div>
//           </div>
//         </DialogContent>
//       </Dialog>

//       {/* Delete Confirmation */}
//       <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
//         <AlertDialogContent>
//           <AlertDialogHeader>
//             <AlertDialogTitle>Delete Entry</AlertDialogTitle>
//             <AlertDialogDescription>
//               Are you sure you want to delete this history entry? This action cannot be undone.
//             </AlertDialogDescription>
//           </AlertDialogHeader>
//           <AlertDialogFooter>
//             <AlertDialogCancel>Cancel</AlertDialogCancel>
//             <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
//               Delete
//             </AlertDialogAction>
//           </AlertDialogFooter>
//         </AlertDialogContent>
//       </AlertDialog>
//     </>
//   );
// };

// export default HistoryListDialog;

import { useState, useEffect } from 'react';
import { Eye, Edit2, Trash2, Phone, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { HistoryEntry } from '../../types/customer';
import { format } from 'date-fns';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import axios from 'axios';
import { toast } from '../../hooks/use-toast';

interface HistoryListDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
}

const HistoryListDialog = ({ isOpen, onClose, customerId }: HistoryListDialogProps) => {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewEntry, setViewEntry] = useState<HistoryEntry | null>(null);
  const [editEntry, setEditEntry] = useState<HistoryEntry | null>(null);
  const [editMessage, setEditMessage] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const BASE_URL = `${import.meta.env.VITE_API_URL}`;

  const fetchHistoryEntries = async () => {
    if (!customerId) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`${BASE_URL}/api/customers/${customerId}/history`);
      
      if (response.data.success) {
        const formattedEntries = response.data.history.map((entry: any) => ({
          ...entry,
          type: entry.type as 'call' | 'rc_book',
          date: entry.date,
          created_at: entry.created_at,
          created_by: entry.created_by
        }));
        setEntries(formattedEntries);
      } else {
        toast({
          title: 'Error',
          description: response.data.error || 'Failed to fetch history entries',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error fetching history entries:', error);
      toast({
        title: 'Error',
        description: 'Failed to load history entries',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && customerId) {
      fetchHistoryEntries();
    }
  }, [isOpen, customerId]);

  const handleEditSave = async () => {
    if (editEntry && editMessage.trim()) {
      try {
        const response = await axios.put(
          `${BASE_URL}/api/history/${editEntry.id}`,
          { message: editMessage.trim() }
        );

        if (response.data.success) {
          setEntries(entries.map(e => 
            e.id === editEntry.id 
              ? { ...e, message: editMessage.trim() } 
              : e
          ));
          await fetchHistoryEntries();
          toast({
            title: 'Success',
            description: 'History entry updated successfully'
          });
          setEditEntry(null);
          setEditMessage('');
        }
      } catch (error) {
        console.error('Error updating history entry:', error);
        toast({
          title: 'Error',
          description: 'Failed to update history entry',
          variant: 'destructive'
        });
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (deleteId !== null) {
      try {
        const response = await axios.delete(`${BASE_URL}/api/history/${deleteId}`);

        if (response.data.success) {
          setEntries(entries.filter(e => e.id !== deleteId));
          await fetchHistoryEntries();
          toast({
            title: 'Success',
            description: 'History entry deleted successfully'
          });
        }
      } catch (error) {
        console.error('Error deleting history entry:', error);
        toast({
          title: 'Error',
          description: 'Failed to delete history entry',
          variant: 'destructive'
        });
      } finally {
        setDeleteId(null);
      }
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-display">Call / RC History</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              Loading history entries...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No history entries found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">S.No</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-32">Date</TableHead>
                    <TableHead className="w-32">Created By</TableHead>
                    <TableHead className="w-32 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, index) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={entry.type === 'call' ? 'default' : 'secondary'}
                          className="gap-1"
                        >
                          {entry.type === 'call' ? (
                            <Phone className="w-3 h-3" />
                          ) : (
                            <FileText className="w-3 h-3" />
                          )}
                          {entry.type === 'call' ? 'Call' : 'RC'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{entry.message}</TableCell>
                      <TableCell>{format(new Date(entry.date), 'dd MMM yyyy')}</TableCell>
                      <TableCell>{entry.created_by || 'System'}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewEntry(entry)}
                            className="h-8 w-8"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditEntry(entry);
                              setEditMessage(entry.message);
                            }}
                            className="h-8 w-8"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteId(entry.id)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Entry Dialog */}
      <Dialog open={!!viewEntry} onOpenChange={() => setViewEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewEntry?.type === 'call' ? (
                <Phone className="w-5 h-5 text-primary" />
              ) : (
                <FileText className="w-5 h-5 text-accent" />
              )}
              {viewEntry?.type === 'call' ? 'Call History' : 'RC Book History'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-sm text-muted-foreground">Date:</span>
                <p className="font-medium">
                  {viewEntry && format(new Date(viewEntry.date), 'PPP')}
                </p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Created By:</span>
                <p className="font-medium">
                  {viewEntry?.created_by || 'System'}
                </p>
              </div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Message:</span>
              <p className="whitespace-pre-wrap mt-1 p-3 bg-muted rounded-md">
                {viewEntry?.message}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={!!editEntry} onOpenChange={() => setEditEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit History Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <span className="text-sm text-muted-foreground">Type:</span>
              <p className="font-medium">
                {editEntry?.type === 'call' ? 'Call History' : 'RC Book History'}
              </p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Date:</span>
              <p className="font-medium">
                {editEntry && format(new Date(editEntry.date), 'PPP')}
              </p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Message:</span>
              <Textarea
                value={editMessage}
                onChange={(e) => setEditMessage(e.target.value)}
                className="min-h-[150px] mt-1"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditEntry(null)}>
                Cancel
              </Button>
              <Button 
                onClick={handleEditSave}
                disabled={!editMessage.trim()}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete History Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this history entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm} 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default HistoryListDialog;