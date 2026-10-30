// import { useState } from 'react';
// import { Calendar, Phone, FileText, Send } from 'lucide-react';
// import { Button } from '../ui/button';
// import { Textarea } from '../ui/textarea';
// import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
// import { Calendar as CalendarComponent } from '../ui/calendar';
// import { format } from 'date-fns';
// import { cn } from '../lib/utils';
// import { HistoryEntry } from '../../types/customer';

// interface HistoryInputSectionProps {
//   onAddEntry: (entry: Omit<HistoryEntry, 'id' | 'created_at' | 'created_by'>) => void;
// }

// const HistoryInputSection = ({ onAddEntry }: HistoryInputSectionProps) => {
//   const [callMessage, setCallMessage] = useState('');
//   const [callDate, setCallDate] = useState<Date | undefined>(new Date());
//   const [rcMessage, setRcMessage] = useState('');
//   const [rcDate, setRcDate] = useState<Date | undefined>(new Date());

//   const handleAddCallHistory = () => {
//     if (!callMessage.trim() || !callDate) return;
//     onAddEntry({
//       type: 'call',
//       message: callMessage.trim(),
//       date: format(callDate, 'yyyy-MM-dd'),
//     });
//     setCallMessage('');
//     setCallDate(new Date());
//   };

//   const handleAddRcHistory = () => {
//     if (!rcMessage.trim() || !rcDate) return;
//     onAddEntry({
//       type: 'rc_book',
//       message: rcMessage.trim(),
//       date: format(rcDate, 'yyyy-MM-dd'),
//     });
//     setRcMessage('');
//     setRcDate(new Date());
//   };

//   return (
//     <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//       {/* Call History Input */}
//       <div className="card-elevated p-5 space-y-4">
//         <div className="flex items-center gap-2 text-primary">
//           <Phone className="w-5 h-5" />
//           <h3 className="font-semibold">Add Call History</h3>
//         </div>
        
//         <Textarea
//           value={callMessage}
//           onChange={(e) => setCallMessage(e.target.value)}
//           placeholder="Enter call notes..."
//           className="min-h-[100px] resize-none"
//         />
        
//         <div className="flex flex-wrap items-center gap-3">
//           <Popover>
//             <PopoverTrigger asChild>
//               <Button
//                 variant="outline"
//                 className={cn(
//                   'justify-start text-left font-normal',
//                   !callDate && 'text-muted-foreground'
//                 )}
//               >
//                 <Calendar className="mr-2 h-4 w-4" />
//                 {callDate ? format(callDate, 'PPP') : 'Pick date'}
//               </Button>
//             </PopoverTrigger>
//             <PopoverContent className="w-auto p-0" align="start">
//               <CalendarComponent
//                 mode="single"
//                 selected={callDate}
//                 onSelect={setCallDate}
//                 initialFocus
//               />
//             </PopoverContent>
//           </Popover>
          
//           <Button
//             onClick={handleAddCallHistory}
//             disabled={!callMessage.trim()}
//             className="btn-accent gap-2"
//           >
//             <Send className="w-4 h-4" />
//             Submit Call History
//           </Button>
//         </div>
//       </div>

//       {/* RC Book History Input */}
//       <div className="card-elevated p-5 space-y-4">
//         <div className="flex items-center gap-2 text-accent">
//           <FileText className="w-5 h-5" />
//           <h3 className="font-semibold">Add RC Book History</h3>
//         </div>
        
//         <Textarea
//           value={rcMessage}
//           onChange={(e) => setRcMessage(e.target.value)}
//           placeholder="Enter RC book notes..."
//           className="min-h-[100px] resize-none"
//         />
        
//         <div className="flex flex-wrap items-center gap-3">
//           <Popover>
//             <PopoverTrigger asChild>
//               <Button
//                 variant="outline"
//                 className={cn(
//                   'justify-start text-left font-normal',
//                   !rcDate && 'text-muted-foreground'
//                 )}
//               >
//                 <Calendar className="mr-2 h-4 w-4" />
//                 {rcDate ? format(rcDate, 'PPP') : 'Pick date'}
//               </Button>
//             </PopoverTrigger>
//             <PopoverContent className="w-auto p-0" align="start">
//               <CalendarComponent
//                 mode="single"
//                 selected={rcDate}
//                 onSelect={setRcDate}
//                 initialFocus
//               />
//             </PopoverContent>
//           </Popover>
          
//           <Button
//             onClick={handleAddRcHistory}
//             disabled={!rcMessage.trim()}
//             className="btn-accent gap-2"
//           >
//             <Send className="w-4 h-4" />
//             Submit RC History
//           </Button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default HistoryInputSection;

import { useState } from 'react';
import { Calendar, Phone, FileText, Send } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar as CalendarComponent } from '../ui/calendar';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import axios from 'axios';
import { toast } from '../../hooks/use-toast';

interface HistoryInputSectionProps {
  customerId: string;
  hplNo: string | number;
  onHistoryAdded: () => void; // Callback to refresh history list
}

const HistoryInputSection = ({ customerId, hplNo, onHistoryAdded }: HistoryInputSectionProps) => {
  const [callMessage, setCallMessage] = useState('');
  const [callDate, setCallDate] = useState<Date | undefined>(new Date());
  const [rcMessage, setRcMessage] = useState('');
  const [rcDate, setRcDate] = useState<Date | undefined>(new Date());
  const [submitting, setSubmitting] = useState(false);

  const BASE_URL = `${import.meta.env.VITE_API_URL}`;
  const handleAddCallHistory = async () => {
    if (!callMessage.trim() || !callDate) return;
    
    try {
      setSubmitting(true);
      const response = await axios.post(
        `${BASE_URL}/api/customers/${customerId}/history`,
        {
          type: 'call',
          message: callMessage.trim(),
          date: format(callDate, 'yyyy-MM-dd'),
          hplno: hplNo
        }
      );

      if (response.data.success) {
        toast({
          title: 'Success',
          description: 'Call history added successfully'
        });
        setCallMessage('');
        setCallDate(new Date());
        onHistoryAdded(); // Refresh the history list
      }
    } catch (error) {
      console.error('Error adding call history:', error);
      toast({
        title: 'Error',
        description: 'Failed to add call history',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddRcHistory = async () => {
    if (!rcMessage.trim() || !rcDate) return;
    
    try {
      setSubmitting(true);
      const response = await axios.post(
        `${BASE_URL}/api/customers/${customerId}/history`,
        {
          type: 'rc_book',
          message: rcMessage.trim(),
          date: format(rcDate, 'yyyy-MM-dd'),
          hplno: hplNo
        }
      );

      if (response.data.success) {
        toast({
          title: 'Success',
          description: 'RC book history added successfully'
        });
        setRcMessage('');
        setRcDate(new Date());
        onHistoryAdded(); // Refresh the history list
      }
    } catch (error) {
      console.error('Error adding RC history:', error);
      toast({
        title: 'Error',
        description: 'Failed to add RC book history',
        variant: 'destructive'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Call History Input */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Phone className="w-5 h-5" />
          <h3 className="font-semibold">Add Call History</h3>
        </div>
        
        <Textarea
          value={callMessage}
          onChange={(e) => setCallMessage(e.target.value)}
          placeholder="Enter call notes..."
          className="min-h-[100px] resize-none"
          disabled={submitting}
        />
        
        <div className="flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'justify-start text-left font-normal',
                  !callDate && 'text-muted-foreground'
                )}
                disabled={submitting}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {callDate ? format(callDate, 'PPP') : 'Pick date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={callDate}
                onSelect={setCallDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <Button
            onClick={handleAddCallHistory}
            disabled={!callMessage.trim() || submitting}
            className="btn-accent gap-2"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting...' : 'Submit Call History'}
          </Button>
        </div>
      </div>

      {/* RC Book History Input */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-center gap-2 text-accent">
          <FileText className="w-5 h-5" />
          <h3 className="font-semibold">Add RC Book History</h3>
        </div>
        
        <Textarea
          value={rcMessage}
          onChange={(e) => setRcMessage(e.target.value)}
          placeholder="Enter RC book notes..."
          className="min-h-[100px] resize-none"
          disabled={submitting}
        />
        
        <div className="flex flex-wrap items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'justify-start text-left font-normal',
                  !rcDate && 'text-muted-foreground'
                )}
                disabled={submitting}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {rcDate ? format(rcDate, 'PPP') : 'Pick date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={rcDate}
                onSelect={setRcDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <Button
            onClick={handleAddRcHistory}
            disabled={!rcMessage.trim() || submitting}
            className="btn-accent gap-2"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Submitting...' : 'Submit RC History'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HistoryInputSection;