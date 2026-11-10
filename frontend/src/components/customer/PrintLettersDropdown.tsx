import { useState } from 'react';
import { Printer, FileText, CreditCard, AlertTriangle, Users } from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu';
import { toast } from '../../hooks/use-toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  PrintDocTypeId,
  buildCompletePrintHtml,
  inlineImageAsDataUri,
  triggerPrintDocument,
} from '../../utils/printTemplates';

interface PrintLettersDropdownProps {
  customerName: string;
  hplNo: string | number;
  customerData?: any;
  baseUrl?: string;
}

const DOC_TITLES: Record<PrintDocTypeId, string> = {
  ledger: 'Ledger Print',
  due_card: 'Due Card Print',
  seizing_letter: 'Seizing Letter Print',
  defaulter_customer: 'Defaulter Notice - Customer',
  defaulter_coapplicant: 'Defaulter Notice - Co-Applicant',
};

const PrintLettersDropdown = ({
  customerName,
  hplNo,
  customerData,
}: PrintLettersDropdownProps) => {
  const { currentFinance } = useAuth();
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintClick = async (docType: PrintDocTypeId) => {
    if (isPrinting) return;
    setIsPrinting(true);

    try {
      const dataToUse = customerData || {
        customer: { cname: customerName, hplno: hplNo },
        guardian: null,
        loan: {},
        vehicle: {},
        payments: [],
      };

      const rawLogoUrl =
        currentFinance?.print_logo_url ||
        currentFinance?.logo_url ||
        currentFinance?.finance_photo ||
        null;
      const logoDataUri = await inlineImageAsDataUri(rawLogoUrl);

      const financeContext = {
        ...currentFinance,
        print_logo_url: logoDataUri,
      };

      const title = `${DOC_TITLES[docType]} - ${customerName || hplNo || 'Customer'}`;
      const { html } = buildCompletePrintHtml(
        [dataToUse],
        financeContext,
        docType,
        { watermark: false, footer: true },
        title
      );

      await triggerPrintDocument(title, html, toast);
    } catch (error) {
      console.error('Print execution error:', error);
      toast({
        title: 'Print Error',
        description: 'Failed to prepare print document. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2" disabled={isPrinting}>
          <Printer className="w-4 h-4" />
          Print Letters
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => handlePrintClick('ledger')}>
          <FileText className="w-4 h-4 mr-2" />
          Ledger Print
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrintClick('due_card')}>
          <CreditCard className="w-4 h-4 mr-2" />
          Due Card Print
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handlePrintClick('seizing_letter')}>
          <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
          Seizing Letter Print
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrintClick('defaulter_customer')}>
          <AlertTriangle className="w-4 h-4 mr-2 text-destructive" />
          Defaulter Notice - Customer
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrintClick('defaulter_coapplicant')}>
          <Users className="w-4 h-4 mr-2 text-destructive" />
          Defaulter Notice - Co-Applicant
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PrintLettersDropdown;
