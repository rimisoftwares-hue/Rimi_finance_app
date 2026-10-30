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
import { useAuth } from "../../contexts/AuthContext";
import { invoke } from "@tauri-apps/api/core";

interface PrintLettersDropdownProps {
  customerName: string;
  hplNo: string | number;
  customerData?: any;
  baseUrl: string;
}

type PhotoUrl = {
  signed_url?: string;
  original_url?: string;
};

const PrintLettersDropdown = ({ customerName, hplNo, customerData, baseUrl = `${import.meta.env.VITE_API_URL}` }: PrintLettersDropdownProps) => {
  const { currentFinance } = useAuth();
  const [isPrinting, setIsPrinting] = useState(false);
  const formatCurrency = (amount: number | string) => {
    if (!amount) return '';
    const num = Number(amount);
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB'); // DD/MM/YYYY
  };

  const getFutureDate = (monthsToAdd: number, startDate?: string) => {
    const date = startDate ? new Date(startDate) : new Date();
    date.setMonth(date.getMonth() + monthsToAdd);
    return formatDate(date.toISOString());
  };
  const generateLedgerHtml = (data: any) => {
    const customer = data?.customer || {};
    const guardian = data?.guardian || {};
    const loan = data?.loan || {};
    const vehicle = data?.vehicle || {};
    const payments = data?.payments || [];
    console.log("customer:", customer.ccontacts?.number)
    const resolvePhotoUrl = (
      photo: string | PhotoUrl | File | null | undefined,
      fallback = './profile.png'
    ): string => {
      if (!photo) return fallback;

      // For newly uploaded files
      if (photo instanceof File) {
        return URL.createObjectURL(photo);
      }

      let url = '';

      // If backend sends object
      if (typeof photo === 'object') {
        url = photo.signed_url ?? photo.original_url ?? '';
      } else {
        url = photo;
      }

      if (!url) return fallback;

      // Already full URL
      if (url.startsWith('http')) return url;

      // Relative path
      return `${baseUrl}${url}`;
    };
    // Format customer and guardian photos
    const customerPhoto = resolvePhotoUrl(customer?.cphoto);
    const guardianPhoto = resolvePhotoUrl(guardian?.gphoto);

    // Generate payment rows for first 15 payments
    const firstHalfPayments = payments.slice(0, 15);
    const secondHalfPayments = payments.slice(15, 30);


    // Calculate penalty function
    const calculatePenaltyAmount = (dueDate: string, paymentDate: string) => {
      if (!dueDate || !paymentDate) return 0;
      const due = new Date(dueDate);
      const payment = new Date(paymentDate);
      const lateDays = Math.ceil((payment.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));

      if (payment > due) {
        return lateDays * (loan.penaltyAmount || 0);
      }
      return 0;
    };

    const generatePaymentRows = (paymentList: any[], startIndex: number = 0) => {
      return paymentList.map((payment: any, index: number) => {
        const PenaltyAmount = calculatePenaltyAmount(payment.dueDate, payment.paymentDate)
        return `
        <tr>
          <td>${startIndex + index + 1}</td>
          <td>${formatDate(payment.dueDate)}</td>
          <td>${payment.paymentDate ? formatDate(payment.paymentDate) : ''}</td>
          <td>${payment.billNumber || ''}</td>
          <td>${formatCurrency(payment.amount)}</td>
          <td>${formatCurrency(PenaltyAmount)}</td>
          <td>${formatCurrency(loan.dueAmount - payment.amount)}</td>
        </tr>
      `;
      }).join('');
    };

    const Intersest = ((parseFloat(loan.hpAmount) * parseFloat(loan.interestRate) * 12) / 100)
    const NetPayable = (Intersest + parseFloat(loan.hpAmount));

    // Generate future EMI rows for first half
    const totalMonths = parseInt(loan.dueMonth || '0');
    const paidMonths = payments.length;
    const firstHalfFutureRows = [];
    const secondHalfFutureRows = [];

    // First half future rows (up to row 15)
    for (let i = paidMonths; i < 15 && i < totalMonths; i++) {
      firstHalfFutureRows.push(`
      <tr>
        <td>${i + 1}</td>
        <td>${getFutureDate(i, loan.hpDate)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `);
    }

    // Second half future rows (row 16-30, starting from index 15)
    for (let i = Math.max(paidMonths, 15); i < 30 && i < totalMonths; i++) {
      secondHalfFutureRows.push(`
      <tr>
        <td>${i + 1}</td>
        <td>${getFutureDate(i, loan.hpDate)}</td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    `);
    }

    return `
    <div class="ledger-container">
      <!-- Header -->
      <div class="header">
        <div class="company-info">
          <h1>${currentFinance?.name.toUpperCase()}</h1>
          <p class="address">${currentFinance?.address}</p>
          <p class="contact">
            Phone: ${currentFinance?.phone_numbers
        ?.slice(0, 2)
        .join(' / ')} | 
            Email: ${currentFinance?.emails?.[0] || 'N/A'}
          </p>
        </div>
        <div class="print-info">
          <p><strong>Printed:</strong> ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
          <p><strong>HPL No:</strong> ${hplNo}</p>
        </div>
      </div>

      <!-- Title -->
      <div class="title-section">
        <h2>LEDGER ACCOUNT STATEMENT</h2>
      </div>

      <!-- Main Content Grid -->
      <div class="main-grid">
        <!-- Left Column: Photos & Basic Info -->
        <div class="left-column">
          <!-- Customer Photo & Info -->
          <div class="photo-card">
            <div class="photo-container">
              <img src= ${customerPhoto} alt="Customer Photo" class="photo" />
              <div class="photo-label">CUSTOMER</div>
            </div>
            <div class="basic-info">
              <p><strong>Name:</strong> ${customer.cname || 'N/A'}</p>
              <p><strong>${customer.cfname?.unit || 'Father/Husband'}:</strong> ${customer.cfname?.value || 'N/A'}</p>
              ${customer.ccontacts.map((value: { type: string, number: string }) =>
          `<p><strong>${value.type}:</strong> ${value.number}</p>`
        ).join('')}
              <p><strong>Work Phone:</strong> ${customer.work_office_phone || ''}</p>
            </div>
          </div>

          <!-- Guardian Photo & Info -->
          <div class="photo-card">
            <div class="photo-container">
              <img src= ${guardianPhoto} alt="Guardian Photo" class="photo" />
              <div class="photo-label">GUARANTOR</div>
            </div>
            <div class="basic-info">
              <p><strong>Name:</strong> ${guardian.gname || 'N/A'}</p>
              <p><strong> ${guardian.gfname?.unit || 'Father/Husband'}:</strong> ${guardian.gfname?.value || 'N/A'}</p>
              ${guardian.gcontacts.map((value: { type: string, number: string }) =>
          `<p><strong>${value.type}:</strong> ${value.number}</p>`
        ).join('')}
              <p><strong>Work Pho:</strong> ${guardian.work_office_phone || ''}</p>
            </div>
          </div>

          <!-- Vehicle Info -->
          <div class="info-box">
            <h3>VEHICLE DETAILS</h3>
            <p><strong>Vehicle No :</strong> ${vehicle.vehicle_number || 'N/A'}</p>
            <p><strong>Vehicle Name :</strong> ${vehicle.model_name || ''} </p>
            <p><strong>Model :</strong> ${vehicle.vehicle_modal ? vehicle.vehicle_modal : ''}</p>
            <p><strong>Chassis No :</strong> ${vehicle.chassis_number || ''}</p>
            <p><strong>Engine No :</strong> ${vehicle.engine_number || ''}</p>
          </div>
        </div>

        <!-- Right Column: Detailed Info -->
        <div class="right-column">
          <!-- Loan Information -->
          <div class="info-box detailed">
            <h3>LOAN INFORMATION</h3>
            <div class="info-grid-2">
              <div>
                <p><strong>HP Date:</strong> ${formatDate(loan.hpDate)}</p>
                <p><strong>Loan Type:</strong> ${loan.loan_type || 'Vehicle Loan'}</p>
                <p><strong>HP Amount:</strong> ₹${formatCurrency(loan.hpAmount)}</p>
                <p><strong>Interest Rate:</strong> ${loan.interestRate || '0'}%</p>
                <p><strong>Down Payment:</strong> ₹${formatCurrency(loan.down_payment)}</p>
                <p><strong>Penalty Amount (per day):</strong> ₹${formatCurrency(loan.penaltyAmount)}</p>
              </div>
              <div>
                <p><strong>Interest Amount :</strong> ₹${formatCurrency(Intersest) || '0'}</p>
                <p><strong>Due Amount (Monthly):</strong> ₹${formatCurrency(loan.dueAmount)}</p>
                <p><strong>Due Months:</strong> ${loan.dueMonth || '0'}</p>
                <p><strong>Net Payable:</strong> ₹${formatCurrency(NetPayable)}</p>
                <p><strong>DC :</strong>${loan.documentation_charge || ''}</p>
              </div>
            </div>
          </div>

          <!-- Address Information -->
          <div class="info-box address-info">
            <h3>ADDRESS DETAILS</h3>
            <div class="address-grid">
              <div>
                <p><strong>Customer Address:</strong></p>
                <p>${customer.full_address || ''}</p>
                <p><strong>Customer Office/Business:</strong></p>
                <p>${customer.work_office_address || ''}</p>
              </div>
              <div>
                <p><strong>Guarantor Address:</strong></p>
                <p>${guardian.full_address || ''}</p>
                <p><strong>Guarantor Office/Business:</strong></p>
                <p>${guardian.work_office_address || ''}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Payment Tables (Split into two halves) -->
      <div class="payment-tables-container">
        <!-- First Half (1-15) -->
        <div class="payment-section">
          <h3>PAYMENT HISTORY (1-15)</h3>
          <table class="payment-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Due Date</th>
                <th>Paid Date</th>
                <th>Rec.No</th>
                <th>Amount</th>
                <th>Penalty</th>
                <th>Bal. Amt</th>

              </tr>
            </thead>
            <tbody>
              ${generatePaymentRows(firstHalfPayments, 0)}
              ${firstHalfFutureRows.join('')}
              ${firstHalfPayments.length + firstHalfFutureRows.length < 15 ?
        Array(15 - firstHalfPayments.length - firstHalfFutureRows.length).fill(null).map((_, i) => `
                  <tr>
                    <td>${firstHalfPayments.length + firstHalfFutureRows.length + i + 1}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                `).join('') : ''}
            </tbody>
          </table>
        </div>

        <!-- Second Half (16-30) -->
        <div class="payment-section">
          <h3>PAYMENT HISTORY (16-30)</h3>
          <table class="payment-table">
            <thead>
              <tr>
                <th>S.No</th>
                <th>Due Date</th>
                <th>Paid Date</th>
                <th>Rec.No</th>
                <th>Amount</th>
                <th>Penalty</th>
                <th>Bal. Amt</th>
              </tr>
            </thead>
            <tbody>
              ${generatePaymentRows(secondHalfPayments, 15)}
              ${secondHalfFutureRows.join('')}
              ${secondHalfPayments.length + secondHalfFutureRows.length < 15 ?
        Array(15 - secondHalfPayments.length - secondHalfFutureRows.length).fill(null).map((_, i) => `
                  <tr>
                    <td>${15 + secondHalfPayments.length + secondHalfFutureRows.length + i + 1}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                `).join('') : ''}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <div class="signature">
          <p>_________________________</p>
          <p><strong>Customer Signature</strong></p>
        </div>
        <div class="signature">
          <p>_________________________</p>
          <p><strong>Authorized Signatory</strong></p>
          <p>${currentFinance?.name.toUpperCase()}</p>
        </div>
        <div class="footer-notes">
          <p><strong>Note:</strong> This is a computer generated statement.</p>
          <p>Please contact office for any discrepancies.</p>
        </div>
      </div>
    </div>
  `;
  };

  const generateDueCardHtml = (data: any) => {
    const loan = data?.loan || {};
    const dueAmount = loan.dueAmount || 0;
    const totalMonths = parseInt(loan.dueMonth || '12');
    const startDate = loan.hpDate || new Date().toISOString();

    // Generate 12 months per page
    const rows = [];
    for (let i = 0; i < totalMonths; i += 12) {
      const monthRows = [];
      for (let j = 0; j < 12 && (i + j) < totalMonths; j++) {
        const emiNo = i + j + 1;
        monthRows.push(`
          <tr>
            <td>${emiNo}</td>
            <td>₹${formatCurrency(dueAmount)}</td>
            <td>${getFutureDate(emiNo - 1, startDate)}</td>
            <td></td>
            <td></td>
            <td>${emiNo + 12}</td>
            <td>₹${formatCurrency(dueAmount)}</td>
            <td>${getFutureDate(emiNo + 11, startDate)}</td>
            <td></td>
            <td></td>
          </tr>
        `);
      }
      rows.push(monthRows.join(''));
    }

    return `
      <div class="duecard-container">
        <!-- Header -->
        <div class="duecard-header">
          <h1>${currentFinance?.name.toUpperCase()}</h1>
          <h2>DUE CARD</h2>
        </div>

        <!-- Customer Info -->
        <div class="duecard-info">
          <div class="customer-details">
            <p><strong>Customer Name:</strong> ${customerName}</p>
            <p><strong>HPL No:</strong> ${hplNo}</p>
            <p><strong>Vehicle No:</strong> ${data?.vehicle?.vehicle_number || 'N/A'}</p>
          </div>
          <div class="loan-details">
            <p><strong>Loan Amount:</strong> ₹${formatCurrency(loan.hpAmount)}</p>
            <p><strong>Due Amount:</strong> ₹${formatCurrency(dueAmount)}</p>
            <p><strong>Due Months:</strong> ${totalMonths}</p>
          </div>
        </div>

        <!-- Due Card Table -->
        <div class="duecard-table">
          <table>
            <thead>
              <tr>
                <th colspan="5">LEFT SIDE</th>
                <th colspan="5">RIGHT SIDE</th>
              </tr>
              <tr>
                <th>No</th>
                <th>Amount</th>
                <th>Due On</th>
                <th>Rcpt No</th>
                <th>Rcpt Date</th>
                <th>No</th>
                <th>Amount</th>
                <th>Due On</th>
                <th>Rcpt No</th>
                <th>Rcpt Date</th>
              </tr>
            </thead>
            <tbody>
              ${rows[0] || ''}
            </tbody>
          </table>
        </div>

        <!-- Second Page (if more than 12 months) -->
        ${rows.length > 1 ? `
          <div class="page-break"></div>
          <div class="duecard-container">
            <div class="duecard-header">
              <h1>SENTHUR AUTO CONSULTING</h1>
              <h2>DUE CARD (Page 2)</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th colspan="5">LEFT SIDE</th>
                  <th colspan="5">RIGHT SIDE</th>
                </tr>
                <tr>
                  <th>No</th>
                  <th>Amount</th>
                  <th>Due On</th>
                  <th>Rcpt No</th>
                  <th>Rcpt Date</th>
                  <th>No</th>
                  <th>Amount</th>
                  <th>Due On</th>
                  <th>Rcpt No</th>
                  <th>Rcpt Date</th>
                </tr>
              </thead>
              <tbody>
                ${rows[1] || ''}
              </tbody>
            </table>
          </div>
        ` : ''}

        <!-- Footer -->
        <div class="duecard-footer">
          <p><strong>Instructions:</strong></p>
          <p>1. Please pay your EMI before the due date to avoid penalty.</p>
          <p>2. Keep this card safe and bring it while making payments.</p>
          <p>3. Contact office for any changes in payment schedule.</p>
          <div class="signature">
            <p>_________________________</p>
            <p>Authorized Signatory</p>
          </div>
        </div>
      </div>
    `;
  };

  const generateSeizingLetterHtml = (data: any) => {
    const customer = data?.customer || {};
    const loan = data?.loan || {};
    const dueAmount = loan.dueAmount || 0;
    const overdueMonths = Math.floor(dueAmount / (loan.dueAmount || 1));
    const currentDate = new Date();
    const warningDate = new Date(currentDate);
    warningDate.setDate(warningDate.getDate() + 7);

    return `
      <div class="seizing-letter">
        <!-- Letterhead -->
        <div class="letterhead">
          <h1>${currentFinance?.name.toUpperCase()}</h1>
          <p class="address">${currentFinance?.address}</p>
          <p class="contact">
            Phone: ${currentFinance?.phone_numbers
        ?.slice(0, 2)
        .join(' / ')} | 
            Email: ${currentFinance?.emails?.[0] || 'N/A'}
          </p>
        </div>

        <!-- Date -->
        <div class="letter-date">
          <p>Date: <strong>${currentDate.toLocaleDateString('en-GB')}</strong></p>
        </div>

        <!-- Recipient -->
        <div class="recipient">
          <p><strong>To,</strong></p>
          <p><strong>${customer.cname || customerName}</strong></p>
          <p>${customer.full_address || 'Address not specified'}</p>
          <p>Mobile: ${customer.ccontacts?.[0]?.number || 'N/A'}</p>
        </div>

        <!-- Subject -->
        <div class="subject">
          <h3>SUBJECT: FINAL NOTICE FOR VEHICLE SEIZURE - ACCOUNT NO: ${hplNo}</h3>
        </div>

        <!-- Content -->
        <div class="content">
          <p>Dear Sir/Madam,</p>
          
          <p>
            This letter serves as a <strong>FINAL NOTICE</strong> regarding your outstanding loan account 
            <strong>${hplNo}</strong> with Senthur Auto Consulting.
          </p>

          <p>
            Despite our repeated reminders and notices, you have failed to make the EMI payments for 
            <strong>${overdueMonths} months</strong>. The total outstanding amount as on date is 
            <strong>₹${formatCurrency(dueAmount)}</strong>.
          </p>

          <div class="notice-box">
            <h4>IMPORTANT NOTICE:</h4>
            <p>
              As per the loan agreement signed by you, we hereby give you <strong>7 DAYS FINAL NOTICE</strong> 
              to clear all outstanding dues. If the full payment is not received by 
              <strong>${warningDate.toLocaleDateString('en-GB')}</strong>, we will be compelled to:
            </p>
            <ol>
              <li>Seize the financed vehicle (${data?.vehicle?.vehicle_number || 'N/A'})</li>
              <li>Initiate legal proceedings for recovery</li>
              <li>Sell the vehicle to recover the outstanding amount</li>
            </ol>
          </div>

          <p>
            Please note that all costs incurred for seizure, transportation, and storage of the vehicle 
            will be added to your outstanding amount.
          </p>

          <div class="payment-details">
            <h4>PAYMENT DETAILS:</h4>
            <table>
              <tr>
                <td><strong>Total Outstanding:</strong></td>
                <td>₹${formatCurrency(dueAmount)}</td>
              </tr>
              <tr>
                <td><strong>Last Date for Payment:</strong></td>
                <td>${warningDate.toLocaleDateString('en-GB')}</td>
              </tr>
              <tr>
                <td><strong>Payment Methods:</strong></td>
                <td>Cash / Bank Transfer / UPI</td>
              </tr>
            </table>
          </div>

          <p>
            We urge you to settle the dues immediately to avoid legal action and additional costs. 
            You can contact our recovery department at 044-87654321 for payment arrangements.
          </p>

          <p class="closing">
            This is your final opportunity to settle the account amicably.
          </p>
        </div>

        <!-- Signatures -->
        <div class="signatures">
          <div class="signature-box">
            <p>_________________________</p>
            <p><strong>${currentFinance?.name.toUpperCase()}</strong></p>
            <p>Authorized Signatory</p>
            <p>Legal & Recovery Department</p>
          </div>
        </div>

        <!-- Copy to -->
        <div class="copy-to">
          <p><strong>Copy to:</strong></p>
          <p>1. Guarantor: ${data?.guardian?.gname || 'N/A'}</p>
          <p>2. Legal Department Records</p>
        </div>

        <!-- Footer -->
        <div class="letter-footer">
          <p><em>This is a computer generated legal notice. No signature required.</em></p>
        </div>
      </div>
    `;
  };

  const handlePrint = async (type: string, htmlContent: string) => {
    if (isPrinting) return;

    setIsPrinting(true);

    try {
      // Create complete HTML document with CSS
      const completeHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${type} - ${customerName}</title>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            /* Reset and base styles */
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }

            html, body {
              height: 100%;
              margin: 0;
              padding: 0;
            }

            body {
              font-family: 'Arial', sans-serif;
              font-size: 12px;
              line-height: 1.4;
              color: #000;
              background: #fff;
            }

            /* A4 Page Settings */
            @page {
              size: A4;
              margin: 10mm;
            }

            @media print {
              body {
                margin: 0;
                padding: 0;
                width: 210mm;
                height: 297mm;
              }
              
              .page-break {
                page-break-before: always;
                margin-top: 20mm;
              }
            }

            /* LEDGER SPECIFIC STYLES - UPDATED */
            .ledger-container {
              padding: 5mm;
              max-width: 210mm;
              height: 100%;
              margin: 0 auto;
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              display: flex;
              flex-direction: column;
              box-sizing: border-box;
            }

            .ledger-container .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 15px;
              padding-bottom: 15px;
              border-bottom: 2px solid #1a237e;
            }

            .ledger-container .company-info h1 {
              font-size: 22px;
              margin-bottom: 5px;
              color: #1a237e;
              font-weight: bold;
            }

            .ledger-container .company-info .address {
              font-size: 11px;
              color: #666;
              margin: 2px 0;
            }

            .ledger-container .company-info .contact {
              font-size: 10px;
              color: #666;
            }

            .ledger-container .print-info {
              text-align: right;
              font-size: 11px;
              color: #666;
            }

            .ledger-container .print-info p {
              margin: 2px 0;
            }

            .ledger-container .title-section {
              text-align: center;
              margin: 6px 0;
            }

            .ledger-container .title-section h2 {
              font-size: 18px;
              color: #1a237e;
              font-weight: 600;
              padding-bottom: 5px;
              border-bottom: 1px solid #e0e0e0;
              display: inline-block;
            }

            /* Main Grid Layout */
            .ledger-container .main-grid {
              display: grid;
              grid-template-columns: 1fr 1.5fr;
              gap: 10px;
              margin: 6px 0 0 0;
            }

            /* Left Column Styles */
            .ledger-container .left-column {
              display: flex;
              flex-direction: column;
              gap: 15px;
            }

            .ledger-container .photo-card {
              display: flex;
              border: 1px solid #e0e0e0;
              border-radius: 6px;
              overflow: hidden;
              background: #fafafa;
            }

            .ledger-container .photo-container {
              width: 100px;
              padding: 10px;
              background: #f5f5f5;
              text-align: center;
              border-right: 1px solid #e0e0e0;
            }

            .ledger-container .photo {
              width: 70px;
              height: 70px;
              object-fit: cover;
              border-radius: 4px;
              border: 1px solid #ddd;
              background: white;
            }

            .ledger-container .photo-label {
              font-size: 10px;
              font-weight: bold;
              color: #1a237e;
              margin-top: 5px;
              text-transform: uppercase;
            }

            .ledger-container .basic-info {
              flex: 1;
              padding: 10px;
              font-size: 11px;
            }

            .ledger-container .basic-info p {
              margin: 4px 0;
              line-height: 1.4;
            }

            /* Right Column Styles */
            .ledger-container .right-column {
              display: flex;
              flex-direction: column;
              gap: 15px;
            }

            .ledger-container .info-box {
              border: 1px solid #e0e0e0;
              border-radius: 6px;
              padding: 8px;
              background: #fff;
            }

            .ledger-container .info-box.detailed {
              background: #f8f9fa;
            }

            .ledger-container .info-box.address-info {
              background: #f0f7ff;
              height : 100%
            }

            .ledger-container .info-box h3 {
              font-size: 12px;
              background: #1a237e;
              color: white;
              padding: 4px 8px;
              margin: -8px -8px 8px -8px;
              border-radius: 6px 6px 0 0;
              font-weight: 600;
            }

            .ledger-container .info-grid-2 {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
              font-size: 11px;
            }

            .ledger-container .info-grid-2 p {
              margin: 5px 0;
              line-height: 1.4;
            }

            .ledger-container .address-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
              font-size: 11px;
              height:100%
            }

            .ledger-container .address-grid p {
              margin: 5px 0;
              line-height: 1.4;
              
            }

            /* Payment Summary */
            .ledger-container .payment-summary {
              display: flex;
              justify-content: space-between;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              padding: 12px 20px;
              border-radius: 6px;
              margin: 10px 0;
            }

            .ledger-container .payment-summary .summary-item {
              text-align: center;
              color: white;
            }

            .ledger-container .payment-summary .summary-item span {
              display: block;
              font-size: 11px;
              opacity: 0.9;
              margin-bottom: 3px;
            }

            .ledger-container .payment-summary .summary-item strong {
              font-size: 14px;
              font-weight: 600;
            }

            /* Payment Tables */
            .ledger-container .payment-tables-container {
              display: flex;
              flex-direction: row;
              gap: 12px;
              margin: 6px 0 0 0;
              flex: 1;
              min-height: 0;
            }

            .ledger-container .payment-section {
              flex: 1;
              min-width: 0;
              border: 1px solid #e0e0e0;
              border-radius: 6px;
              background: #fafafa;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              overflow: hidden;
            }

            .ledger-container .payment-section h3 {
              font-size: 11px;
              background: #1a237e;
              color: white;
              padding: 4px;
              text-align: center;
              border-radius: 0;
              font-weight: 600;
            }

            .ledger-container .payment-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 10px;
              flex: 1;
            }

            .ledger-container .payment-table th {
              background: #e3f2fd;
              border: 1px solid #1a237e;
              padding: 6px 4px;
              text-align: center;
              font-weight: 600;
              font-size: 10px;
            }

            .ledger-container .payment-table td {
              border: 1px solid #ddd;
              padding: 2px 3px;
              text-align: center;
              height: 20px;
            }
            
            .ledger-container .payment-table td:first-child {
              border: 1px solid #ddd;
              padding: 2px 3px;
              text-align: center;
              height: 20px;
            }

            .ledger-container .payment-table tbody tr:nth-child(even) {
              background: #f8f9fa;
            }

            .ledger-container .payment-table tbody tr:hover {
              background: #e8f4fd;
            }

            /* Footer */
            .ledger-container .footer {
              margin-top: 6px;
              padding-top: 6px;
              border-top: 1px solid #1a237e;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
            }

            .ledger-container .signature {
              text-align: center;
              width: 200px;
            }

            .ledger-container .signature p {
              margin: 3px 0;
              font-size: 11px;
            }

            .ledger-container .signature p:first-child {
              margin-bottom: 6px;
              color: #333;
            }

            .ledger-container .footer-notes {
              font-size: 10px;
              color: #666;
              text-align: center;
              width: 300px;
            }



            /* DUE CARD STYLES */
            .duecard-container {
              padding: 5mm;
              max-width: 210mm;
              margin: 0 auto;
            }

            .duecard-header {
              text-align: center;
              margin-bottom: 15px;
              padding-bottom: 10px;
              border-bottom: 3px double #000;
            }

            .duecard-header h1 {
              font-size: 22px;
              color: #1a237e;
              margin-bottom: 5px;
            }

            .duecard-header h2 {
              font-size: 20px;
              color: #d32f2f;
            }

            .duecard-info {
              display: flex;
              justify-content: space-between;
              margin: 15px 0;
              padding: 10px;
              background: #f0f8ff;
              border: 1px solid #b3e5fc;
              border-radius: 4px;
            }

            .duecard-info p {
              margin: 4px 0;
              font-size: 12px;
            }

            .duecard-table table {
              width: 100%;
              border-collapse: collapse;
              margin: 15px 0;
              font-size: 10px;
            }

            .duecard-table th {
              background: #e3f2fd;
              border: 1px solid #000;
              padding: 4px;
              text-align: center;
              font-weight: bold;
            }

            .duecard-table td {
              border: 1px solid #000;
              padding: 4px;
              text-align: center;
            }

            .duecard-table tbody tr:nth-child(even) {
              background: #f5f5f5;
            }

            .duecard-footer {
              margin-top: 20px;
              padding: 10px;
              border-top: 1px solid #ddd;
              font-size: 11px;
            }

            .duecard-footer p {
              margin: 3px 0;
            }

            /* SEIZING LETTER STYLES */
            .seizing-letter {
              padding: 10mm;
              max-width: 210mm;
              margin: 0 auto;
            }

            .letterhead {
              text-align: center;
              margin-bottom: 20px;
              padding-bottom: 15px;
              border-bottom: 2px solid #c62828;
            }

            .letterhead h1 {
              font-size: 26px;
              color: #b71c1c;
              margin-bottom: 5px;
            }

            .letterhead .address {
              font-size: 12px;
              color: #666;
              margin: 3px 0;
            }

            .letterhead .contact {
              font-size: 11px;
              color: #666;
            }

            .letter-date {
              text-align: right;
              margin: 15px 0;
              font-size: 12px;
            }

            .recipient {
              margin: 15px 0;
              font-size: 12px;
              line-height: 1.5;
            }

            .subject {
              margin: 20px 0;
              padding: 8px;
              background: #ffebee;
              border-left: 4px solid #c62828;
            }

            .subject h3 {
              font-size: 14px;
              color: #b71c1c;
            }

            .content {
              font-size: 12px;
              line-height: 1.6;
              text-align: justify;
              margin: 20px 0;
            }

            .content p {
              margin: 8px 0;
            }

            .notice-box {
              margin: 15px 0;
              padding: 15px;
              border: 2px solid #c62828;
              background: #ffebee;
              border-radius: 4px;
            }

            .notice-box h4 {
              color: #b71c1c;
              margin-bottom: 10px;
            }

            .notice-box ol {
              margin: 10px 0 10px 20px;
            }

            .payment-details {
              margin: 20px 0;
              padding: 15px;
              background: #f5f5f5;
              border-radius: 4px;
            }

            .payment-details table {
              width: 100%;
              margin-top: 10px;
            }

            .payment-details td {
              padding: 6px;
              border-bottom: 1px solid #ddd;
            }

            .closing {
              font-weight: bold;
              margin: 20px 0;
              color: #b71c1c;
            }

            .signatures {
              margin: 40px 0 20px 0;
              text-align: right;
            }

            .signature-box {
              display: inline-block;
              text-align: center;
              margin-left: 50px;
            }

            .signature-box p {
              margin: 5px 0;
              font-size: 12px;
            }

            .copy-to {
              margin: 20px 0;
              padding: 10px;
              border-top: 1px solid #ddd;
              font-size: 11px;
            }

            .letter-footer {
              margin-top: 30px;
              padding-top: 10px;
              border-top: 1px solid #ddd;
              font-size: 10px;
              color: #666;
              text-align: center;
            }

            /* Print-specific optimizations */
            @media print {
              .ledger-container,
              .duecard-container,
              .seizing-letter {
                padding: 0;
                margin: 0;
              }

              .ledger-container .payment-table td {
                height: 20px !important;
                padding: 3px 2px !important;
              }
              
              .ledger-container .photo {
                width: 70px !important;
                height: 70px !important;
              }
              
              .ledger-container .main-grid {
                gap: 10px !important;
              }
              
              .ledger-container .payment-tables-container {
                gap: 15px !important;
              }
              
              /* Ensure tables don't break across pages */
              table {
                page-break-inside: avoid;
              }
              
              /* Ensure sections don't break awkwardly */
              .info-grid {
                page-break-inside: avoid;
              }
              
              /* Hide non-essential elements */
              .no-print {
                display: none !important;
              }
            }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
        </html>
      `;
      const isTauri = typeof window !== 'undefined' &&
        (window as any).__TAURI__ !== undefined;
      // Check if running in Tauri
      if (isTauri) {
        try {
          // Call Tauri backend command
          await invoke('print_document', {
            title: `${type} - ${customerName}`,
            htmlContent: completeHtml
          });

          toast({
            title: `${type} Generated`,
            description: `${type} is ready for printing`,
          });
        } catch (error) {
          console.error('Tauri print error:', error);
          // Fallback to browser printing
          fallbackBrowserPrint(type, completeHtml);
        }
      } else {
        // Running in browser
        fallbackBrowserPrint(type, completeHtml);
      }
    } catch (error) {
      console.error('Print error:', error);
      toast({
        title: 'Error',
        description: 'Failed to print document',
        variant: 'destructive'
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const fallbackBrowserPrint = (type: string, htmlContent: string) => {
    try {
      // Create a new window or iframe for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        setTimeout(() => {
          printWindow.focus();
          printWindow.print();

          // Try to close after printing
          setTimeout(() => {
            if (!printWindow.closed) {
              printWindow.close();
            }
          }, 1000);
        }, 300);

        toast({
          title: `${type} Generated`,
          description: `Opening print dialog for ${customerName}...`,
        });
      } else {
        // If popup is blocked, try iframe method
        printUsingIframe(type, htmlContent);
      }
    } catch (error) {
      console.error('Browser print error:', error);
      printUsingIframe(type, htmlContent);
    }
  };

  const printUsingIframe = (type: string, htmlContent: string) => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.opacity = '0';

      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(htmlContent);
        iframeDoc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }, 300);

        toast({
          title: `${type} Generated`,
          description: `Printing ${type} for ${customerName}...`,
        });
      }
    } catch (error) {
      console.error('Iframe print error:', error);
      toast({
        title: 'Error',
        description: 'Could not print document. Please check browser settings.',
        variant: 'destructive'
      });
    }
  };

  const handlePrintClick = (type: string) => {
    const dataToUse = customerData || {};
    let htmlContent = '';

    switch (type) {
      case 'Ledger':
        htmlContent = generateLedgerHtml(dataToUse);
        break;
      case 'Due Card':
        htmlContent = generateDueCardHtml(dataToUse);
        break;
      case 'Seizing Letter':
        htmlContent = generateSeizingLetterHtml(dataToUse);
        break;
      default:
        htmlContent = `
          <div style="padding: 20mm; text-align: center;">
            <h2>${type}</h2>
            <p>Document for: ${customerName}</p>
            <p>HPL No: ${hplNo}</p>
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
          </div>
        `;
    }

    handlePrint(type, htmlContent);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Printer className="w-4 h-4" />
          Print Letters
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => handlePrintClick('Ledger')}>
          <FileText className="w-4 h-4 mr-2" />
          Ledger Print
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrintClick('Due Card')}>
          <CreditCard className="w-4 h-4 mr-2" />
          Due Card Print
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handlePrintClick('Seizing Letter')}>
          <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
          Seizing Letter Print
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrintClick('Loan Defaulter Notice - Customer')}>
          <AlertTriangle className="w-4 h-4 mr-2 text-destructive" />
          Defaulter Notice - Customer
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePrintClick('Loan Defaulter Notice - Co-Applicant')}>
          <Users className="w-4 h-4 mr-2 text-destructive" />
          Defaulter Notice - Co-Applicant
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default PrintLettersDropdown;