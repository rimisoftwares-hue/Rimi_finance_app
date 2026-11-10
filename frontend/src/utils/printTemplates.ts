import { invoke } from '@tauri-apps/api/core';

export type PrintDocTypeId =
  | 'ledger'
  | 'due_card'
  | 'seizing_letter'
  | 'defaulter_customer'
  | 'defaulter_coapplicant';

export interface PrintTemplateOptions {
  watermark?: boolean;
  footer?: boolean;
}

export interface PrintDocumentTypeConfig {
  id: PrintDocTypeId;
  name: string;
  description: string;
}

export const PRINT_DOCUMENT_TYPES: PrintDocumentTypeConfig[] = [
  {
    id: 'ledger',
    name: 'Ledger Print',
    description: 'Full ledger account statement & EMI history',
  },
  {
    id: 'due_card',
    name: 'Due Card Print',
    description: 'EMI schedule & installment receipt card',
  },
  {
    id: 'seizing_letter',
    name: 'Seizing Letter Print',
    description: 'Final notice for vehicle seizure',
  },
  {
    id: 'defaulter_customer',
    name: 'Defaulter Notice - Customer',
    description: 'Loan defaulter demand notice to customer',
  },
  {
    id: 'defaulter_coapplicant',
    name: 'Defaulter Notice - Co-Applicant',
    description: 'Loan defaulter notice to guarantor / co-applicant',
  },
];

// Draft wording, must be reviewed by legal counsel.
export const DEFAULTER_CUSTOMER_LEGAL_WORDING = {
  openingParagraph:
    'Under instructions from and on behalf of the Management, this formal Demand Notice is issued to inform you that your hypothecation / vehicle loan account referenced below has fallen into default due to non-payment of scheduled monthly installments despite repeated reminders.',
  demandParagraph:
    'You are hereby called upon to clear the entire overdue installment amount along with applicable late payment charges within 7 (seven) days from the date of receipt of this notice.',
  consequenceParagraph:
    'Please take notice that if you fail to settle the overdue balance within the stipulated 7-day period, the Company reserves the right to initiate further recovery proceedings in accordance with the terms and conditions of the Loan / Hypothecation Agreement executed by you, which may include recalling the entire loan facility and taking possession of the hypothecated vehicle at your cost and consequence.',
  ignoreIfPaidNote:
    'Note: If you have already remitted the above overdue installments prior to receiving this notice, please produce the payment receipt at our office so your account records can be updated accordingly.',
};

// Draft wording, must be reviewed by legal counsel.
export const DEFAULTER_COAPPLICANT_LEGAL_WORDING = {
  openingParagraph:
    'This formal notice is addressed to you in your capacity as Guarantor / Co-Applicant for the vehicle loan facility availed by the Principal Borrower named below under the Loan / Hypothecation Agreement executed with our Company.',
  liabilityParagraph:
    'The Principal Borrower has defaulted in making timely payment of the scheduled monthly installments, resulting in the overdue balance detailed below. Pursuant to the terms of the Loan Agreement, the liability of the Guarantor / Co-Applicant is joint, several, and co-extensive with that of the Principal Borrower.',
  demandParagraph:
    'You are hereby requested and called upon to ensure that the overdue installments and applicable late charges are paid and regularized within 7 (seven) days from the receipt of this notice, failing which the Company shall be constrained to initiate recovery proceedings against both the Principal Borrower and the Guarantor / Co-Applicant, including repossession of the hypothecated vehicle, in accordance with the agreement terms.',
  ignoreIfPaidNote:
    'Note: Please contact our office immediately with payment details if the overdue amount has already been settled.',
};

/**
 * Shared HTML escaping helper. All customer, guardian, vehicle, and finance
 * values interpolated into generated HTML must pass through this function.
 */
export const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Fetches an image URL (such as a presigned S3 print logo URL) once and converts
 * it to an inline base64 data URI so that browser print windows, Tauri print webviews,
 * and Word (.doc) exports can reliably render the image without expiring or failing
 * on remote network loads. Falls back safely to null (no logo) on any failure.
 */
export const inlineImageAsDataUri = async (url?: string | null): Promise<string | null> => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/')) return trimmed;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(trimmed, {
      mode: 'cors',
      credentials: 'omit',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob || blob.size === 0) return null;

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === 'string' ? reader.result : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

const getImageUrl = (photo: any): string | null => {
  if (!photo) return null;
  if (typeof photo === 'string') return photo;
  if (photo.signed_url) return photo.signed_url;
  if (photo.original_url) return photo.original_url;
  return null;
};

const formatDate = (dateString?: string | null): string => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return String(dateString);
  }
};

const computeOverdueSummary = (loan: any, payments: any[]) => {
  const activePayments = Array.isArray(payments) ? payments : [];
  const totalPaid = activePayments.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
  const totalPenaltyPaid = activePayments.reduce((sum, p) => sum + (Number(p?.penalty) || 0), 0);
  const hpAmount = Number(loan?.hpAmount ?? loan?.hp_amount ?? 0);
  const dueMonth = Math.max(0, Number(loan?.dueMonth ?? loan?.due_month ?? 0));
  const dueAmount = Number(loan?.dueAmount ?? loan?.due_amount ?? 0);
  const netPayableRaw = Number(loan?.net_payable ?? 0);
  const totalLoan = netPayableRaw > 0 ? netPayableRaw : dueAmount > 0 && dueMonth > 0 ? dueAmount * dueMonth : hpAmount;
  const emiAmount = dueAmount > 0 ? dueAmount : dueMonth > 0 ? Math.round(totalLoan / dueMonth) : 0;
  const paidEmis = emiAmount > 0 ? Math.floor(totalPaid / emiAmount) : activePayments.filter((p) => Number(p?.amount) > 0).length;

  let expectedEmis = dueMonth;
  const baseDateStr = loan?.hpDate || loan?.hp_date || loan?.dueDate || loan?.due_date;
  if (baseDateStr) {
    const baseDate = new Date(baseDateStr);
    if (!isNaN(baseDate.getTime())) {
      const diffDays = Math.max(0, (Date.now() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      expectedEmis = Math.min(dueMonth, Math.max(0, Math.floor(diffDays / 30)));
    }
  }

  const overdueEmis = Math.max(0, expectedEmis - paidEmis);
  const totalBalance = Math.max(0, totalLoan - totalPaid);
  const overdueAmount = overdueEmis > 0 && emiAmount > 0
    ? Math.min(totalBalance, overdueEmis * emiAmount)
    : totalBalance;
  const loanPenalty = Number(loan?.penaltyAmount ?? loan?.penalty_amount ?? 0);
  const penaltyTotal = Math.max(loanPenalty, totalPenaltyPaid);

  return {
    hpAmount,
    dueMonth,
    emiAmount,
    totalLoan,
    totalPaid,
    paidEmis,
    overdueEmis,
    overdueAmount,
    totalBalance,
    penaltyTotal,
  };
};

const renderWatermarkHtml = (options?: PrintTemplateOptions): string => {
  if (!options?.watermark) return '';
  return `<div class="print-watermark">CONFIDENTIAL</div>`;
};

const renderLogoTag = (finance: any, maxHeight = 44): string => {
  const logoSrc = finance?.print_logo_url || null;
  if (!logoSrc) return '';
  return `<img src="${escapeHtml(logoSrc)}" alt="Logo" class="company-print-logo" style="max-height:${maxHeight}px; max-width:130px; object-fit:contain; display:block;" />`;
};

// ============================================================================
// 1. LEDGER PRINT (Extracted from PrintLettersDropdown.tsx)
// ============================================================================
export const generateLedgerHtml = (
  data: any,
  finance: any,
  options: PrintTemplateOptions = { footer: true }
): string => {
  const customer = data?.customer || {};
  const guardian = data?.guardian || {};
  const loan = data?.loan || {};
  const vehicle = data?.vehicle || {};
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const ccontacts = Array.isArray(customer?.ccontacts) ? customer.ccontacts : [];
  const gcontacts = Array.isArray(guardian?.gcontacts) ? guardian.gcontacts : [];

  const customerPhotoUrl = getImageUrl(customer.cphoto);
  const guardianPhotoUrl = getImageUrl(guardian.gphoto);
  const showFooter = options.footer !== false;

  const calculateTotals = () => {
    const totalAmount = payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
    const totalPenalty = payments.reduce((sum: number, p: any) => sum + (Number(p.penalty) || 0), 0);
    const dueMonthNum = Number(loan.dueMonth ?? loan.due_month) || 0;
    const dueAmountNum = Number(loan.dueAmount ?? loan.due_amount) || 0;
    const totalDue = dueMonthNum * dueAmountNum;
    const balance = totalDue - totalAmount;

    return { totalAmount, totalPenalty, totalDue, balance };
  };

  const totals = calculateTotals();
  const logoHtml = renderLogoTag(finance, 42);

  return `
    <div class="ledger-container">
      ${renderWatermarkHtml(options)}
      <!-- Header -->
      <div class="header">
        ${
          logoHtml
            ? `<div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:4px;">
                 ${logoHtml}
                 <div>
                   <div class="company-name">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
                   ${finance?.address ? `<div class="company-subtitle">${escapeHtml(finance.address)}</div>` : ''}
                 </div>
               </div>`
            : `<div class="company-name">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
               ${finance?.address ? `<div class="company-subtitle">${escapeHtml(finance.address)}</div>` : ''}`
        }
        <div class="document-title">LOAN ACCOUNT LEDGER STATEMENT</div>
      </div>

      <!-- Account Status Bar -->
      <div class="status-bar">
        <div class="status-item">
          <span class="status-label">HPL No : </span>
          <span class="status-value">${escapeHtml(customer.hplno || 'N/A')}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Loan Status : </span>
          <span class="status-badge ${customer.loanStatus === 'active' ? 'status-active' : 'status-closed'}">
            ${escapeHtml(customer.loanStatus ? String(customer.loanStatus).toUpperCase() : 'N/A')}
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">Print Date : </span>
          <span class="status-value">${escapeHtml(new Date().toLocaleDateString('en-IN'))}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Broker : </span>
          <span class="status-value">${escapeHtml(customer.brokerName || 'N/A')}</span>
        </div>
      </div>

      <!-- Main Details Section -->
      <div class="main-grid">
        <!-- Customer Information -->
        <div class="info-card">
          <div class="card-header">
            <h3>CUSTOMER DETAILS</h3>
          </div>
          <div class="card-content">
            <div class="details-and-photo">
              <div class="details-column">
                <div class="detail-row">
                  <span class="detail-label">Name :</span>
                  <span class="detail-value">${escapeHtml(customer.cname || 'N/A')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${escapeHtml(customer.cfname?.unit || 'Father')} :</span>
                  <span class="detail-value">${escapeHtml(customer.cfname?.value || 'N/A')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Address :</span>
                  <span class="detail-value address-text">${escapeHtml(customer.full_address || 'N/A')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Contacts :</span>
                  <span class="detail-value">${
                    ccontacts.map((c: any) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'
                  }</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Work Office :</span>
                  <span class="detail-value">${escapeHtml(customer.work_office_address || 'N/A')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Work Phone :</span>
                  <span class="detail-value">${escapeHtml(customer.work_office_phone || 'N/A')}</span>
                </div>
              </div>
              <div class="photo-column">
                ${
                  customerPhotoUrl
                    ? `<img src="${escapeHtml(customerPhotoUrl)}" class="profile-photo" alt="Customer Photo" onerror="this.style.display='none'" />`
                    : `<div class="photo-placeholder">Customer<br>Photo</div>`
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Guardian Information -->
        <div class="info-card">
          <div class="card-header">
            <h3>GUARDIAN / CO-APPLICANT DETAILS</h3>
          </div>
          <div class="card-content">
            <div class="details-and-photo">
              <div class="details-column">
                <div class="detail-row">
                  <span class="detail-label">Name:</span>
                  <span class="detail-value">${escapeHtml(guardian.gname || 'N/A')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">${escapeHtml(guardian.gfname?.unit || 'Father')}:</span>
                  <span class="detail-value">${escapeHtml(guardian.gfname?.value || 'N/A')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Address:</span>
                  <span class="detail-value address-text">${escapeHtml(guardian.full_address || 'N/A')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Contacts:</span>
                  <span class="detail-value">${
                    gcontacts.map((c: any) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'
                  }</span>
                </div>
              </div>
              <div class="photo-column">
                ${
                  guardianPhotoUrl
                    ? `<img src="${escapeHtml(guardianPhotoUrl)}" class="profile-photo" alt="Guardian Photo" onerror="this.style.display='none'" />`
                    : `<div class="photo-placeholder">Guardian<br>Photo</div>`
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Vehicle & Loan Details -->
      <div class="secondary-grid">
        <!-- Vehicle Details -->
        <div class="info-card">
          <div class="card-header">
            <h3>VEHICLE INFORMATION</h3>
          </div>
          <div class="card-content">
            <div class="compact-grid">
              <div class="detail-row">
                <span class="detail-label">Vehicle Number:</span>
                <span class="detail-value highlight">${escapeHtml(vehicle.vehicle_number || 'N/A')}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Model/Brand:</span>
                <span class="detail-value">${escapeHtml(vehicle.model_name || vehicle.vehicle_modal || 'N/A')} ${escapeHtml(vehicle.brand || '')}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Chassis No:</span>
                <span class="detail-value">${escapeHtml(vehicle.chassis_number || 'N/A')}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Engine No:</span>
                <span class="detail-value">${escapeHtml(vehicle.engine_number || 'N/A')}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Type/Color:</span>
                <span class="detail-value">${escapeHtml(vehicle.body_type || '')} ${escapeHtml(vehicle.type || '')} / ${escapeHtml(vehicle.color || 'N/A')}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Loan Financial Summary -->
        <div class="info-card">
          <div class="card-header">
            <h3>LOAN FINANCIAL DETAILS</h3>
          </div>
          <div class="card-content">
            <div class="compact-grid">
              <div class="detail-row">
                <span class="detail-label">HP Amount:</span>
                <span class="detail-value currency">₹${escapeHtml((Number(loan.hpAmount ?? loan.hp_amount) || 0).toLocaleString('en-IN'))}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">HP Date:</span>
                <span class="detail-value">${escapeHtml(formatDate(loan.hpDate || loan.hp_date))}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Due Date:</span>
                <span class="detail-value">${escapeHtml(formatDate(loan.due_date || loan.dueDate))}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Tenure:</span>
                <span class="detail-value">${escapeHtml(loan.dueMonth ?? loan.due_month ?? 'N/A')} Months</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Interest Rate:</span>
                <span class="detail-value">${escapeHtml(loan.interestRate ?? loan.interest_rate ?? 'N/A')}%</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Monthly EMI:</span>
                <span class="detail-value currency">₹${escapeHtml((Number(loan.dueAmount ?? loan.due_amount) || 0).toLocaleString('en-IN'))}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Net Payable:</span>
                <span class="detail-value currency">₹${escapeHtml(totals.totalDue.toLocaleString('en-IN'))}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Penalty Rate:</span>
                <span class="detail-value currency">₹${escapeHtml((Number(loan.penaltyAmount ?? loan.penalty_amount) || 0).toLocaleString('en-IN'))}/day</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Payment Summary Cards -->
      <div class="summary-cards">
        <div class="summary-card paid">
          <div class="summary-label">Total Paid</div>
          <div class="summary-value">₹${escapeHtml(totals.totalAmount.toLocaleString('en-IN'))}</div>
        </div>
        <div class="summary-card balance">
          <div class="summary-label">Balance Amount</div>
          <div class="summary-value">₹${escapeHtml(totals.balance.toLocaleString('en-IN'))}</div>
        </div>
        <div class="summary-card penalty">
          <div class="summary-label">Total Penalty</div>
          <div class="summary-value">₹${escapeHtml(totals.totalPenalty.toLocaleString('en-IN'))}</div>
        </div>
        <div class="summary-card installments">
          <div class="summary-label">Paid Installments</div>
          <div class="summary-value">${escapeHtml(payments.filter((p: any) => p.amount > 0).length)} / ${escapeHtml(loan.dueMonth ?? loan.due_month ?? 0)}</div>
        </div>
      </div>

      <!-- Payment History Table -->
      <div class="table-section">
        <div class="section-header">
          <h3>PAYMENT TRANSACTION HISTORY</h3>
        </div>
        <table class="payment-table">
          <thead>
            <tr>
              <th width="8%">S.No</th>
              <th width="18%">Due Date</th>
              <th width="18%">Payment Date</th>
              <th width="18%">Bill Number</th>
              <th width="19%">Amount Paid (₹)</th>
              <th width="19%">Penalty (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${
              payments.length > 0
                ? payments
                    .map(
                      (payment: any, index: number) => `
              <tr class="${index % 2 === 0 ? 'even-row' : 'odd-row'}">
                <td class="text-center">${index + 1}</td>
                <td class="text-center">${escapeHtml(formatDate(payment.dueDate))}</td>
                <td class="text-center">${escapeHtml(formatDate(payment.paymentDate))}</td>
                <td class="text-center">${escapeHtml(payment.billNumber || '-')}</td>
                <td class="text-right currency">${payment.amount ? `₹${escapeHtml(Number(payment.amount).toLocaleString('en-IN'))}` : '-'}</td>
                <td class="text-right currency">${payment.penalty ? `₹${escapeHtml(Number(payment.penalty).toLocaleString('en-IN'))}` : '-'}</td>
              </tr>
            `
                    )
                    .join('')
                : `
              <tr>
                <td colspan="6" class="no-data">No payment records available</td>
              </tr>
            `
            }
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="4" class="text-right"><strong>TOTAL</strong></td>
              <td class="text-right currency"><strong>₹${escapeHtml(totals.totalAmount.toLocaleString('en-IN'))}</strong></td>
              <td class="text-right currency"><strong>₹${escapeHtml(totals.totalPenalty.toLocaleString('en-IN'))}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${
        showFooter
          ? `<!-- Footer & Signatures -->
      <div class="footer-section">
        <div class="terms-section">
          <h4>Terms & Conditions:</h4>
          <ul class="terms-list">
            <li>EMI payments must be made on or before the due date every month</li>
            <li>Late payment charges of ₹${escapeHtml(loan.penaltyAmount ?? loan.penalty_amount ?? 0)} per day will be applicable for overdue amounts</li>
            <li>Vehicle documents will be released only after complete loan settlement</li>
          </ul>
        </div>
        
        <div class="signature-grid">
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label">Customer Signature</div>
            <div class="signature-date">Date: _______________</div>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label">Guarantor Signature</div>
            <div class="signature-date">Date: _______________</div>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label">Authorized Signatory</div>
            <div class="signature-date">For ${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
          </div>
        </div>
      </div>`
          : ''
      }
    </div>
  `;
};

// ============================================================================
// 2. DUE CARD PRINT (Extracted from PrintLettersDropdown.tsx)
// ============================================================================
export const generateDueCardHtml = (
  data: any,
  finance: any,
  options: PrintTemplateOptions = { footer: true }
): string => {
  const customer = data?.customer || {};
  const guardian = data?.guardian || {};
  const loan = data?.loan || {};
  const vehicle = data?.vehicle || {};
  const ccontacts = Array.isArray(customer?.ccontacts) ? customer.ccontacts : [];
  const gcontacts = Array.isArray(guardian?.gcontacts) ? guardian.gcontacts : [];
  const showFooter = options.footer !== false;

  const generateScheduleRows = (start: number, end: number) => {
    let rows = '';
    const baseDateStr = loan.hpDate || loan.hp_date;
    const hpDate = baseDateStr ? new Date(baseDateStr) : new Date();

    for (let i = start; i <= end; i++) {
      const dueDate = new Date(hpDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      rows += `
        <tr>
          <td class="serial-cell">${i}</td>
          <td class="date-cell">${escapeHtml(
            dueDate.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })
          )}</td>
          <td class="empty-cell"></td>
          <td class="empty-cell"></td>
          <td class="empty-cell"></td>
          <td class="empty-cell"></td>
          <td class="empty-cell"></td>
        </tr>
      `;
    }
    return rows;
  };

  const phoneDisplay = Array.isArray(finance?.phone_numbers)
    ? finance.phone_numbers.join(', ')
    : finance?.phone_numbers || '';
  const logoHtml = renderLogoTag(finance, 42);
  const logoHtmlSmall = renderLogoTag(finance, 32);

  return `
    <!-- PAGE 1 -->
    <div class="due-card-page">
      ${renderWatermarkHtml(options)}
      <!-- Header -->
      <div class="header">
        <div class="company-info">
          ${
            logoHtml
              ? `<div style="display:flex; align-items:center; justify-content:center; gap:12px;">
                   ${logoHtml}
                   <div>
                     <div class="company-name">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
                     <div class="company-address">${escapeHtml(finance?.address || '')}</div>
                     <div class="company-contact">${escapeHtml(phoneDisplay)}</div>
                   </div>
                 </div>`
              : `<div class="company-name">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
                 <div class="company-address">${escapeHtml(finance?.address || '')}</div>
                 <div class="company-contact">${escapeHtml(phoneDisplay)}</div>`
          }
        </div>
        <div class="card-title">VEHICLE LOAN EMI DUE CARD</div>
      </div>

      <!-- Loan Summary Header -->
      <div class="loan-header">
        <div class="loan-basic-info">
          <div class="info-item">
            <span class="label">HPL No:</span>
            <span class="value highlight">${escapeHtml(customer.hplno || 'N/A')}</span>
          </div>
          <div class="info-item">
            <span class="label">Vehicle No:</span>
            <span class="value highlight">${escapeHtml(vehicle.vehicle_number || 'N/A')}</span>
          </div>
          <div class="info-item">
            <span class="label">Vehicle Model:</span>
            <span class="value">${escapeHtml(vehicle.model_name || vehicle.vehicle_modal || 'N/A')}</span>
          </div>
          <div class="info-item">
            <span class="label">HP Amount:</span>
            <span class="value currency">₹${escapeHtml((Number(loan.hpAmount ?? loan.hp_amount) || 0).toLocaleString('en-IN'))}</span>
          </div>
          <div class="info-item">
            <span class="label">Monthly EMI:</span>
            <span class="value currency">₹${escapeHtml((Number(loan.dueAmount ?? loan.due_amount) || 0).toLocaleString('en-IN'))}</span>
          </div>
          <div class="info-item">
            <span class="label">Tenure:</span>
            <span class="value">${escapeHtml(loan.dueMonth ?? loan.due_month ?? 'N/A')} Months</span>
          </div>
        </div>
      </div>

      <!-- Customer & Guarantor Details -->
      <div class="parties-section">
        <div class="party-card">
          <div class="party-header">BORROWER DETAILS</div>
          <div class="party-content">
            <div class="party-row">
              <span class="party-label">Name:</span>
              <span class="party-value">${escapeHtml(customer.cname || 'N/A')}</span>
            </div>
            <div class="party-row">
              <span class="party-label">${escapeHtml(customer.cfname?.unit || 'Father')}:</span>
              <span class="party-value">${escapeHtml(customer.cfname?.value || 'N/A')}</span>
            </div>
            <div class="party-row">
              <span class="party-label">Address:</span>
              <span class="party-value address">${escapeHtml(customer.full_address || 'N/A')}</span>
            </div>
            <div class="party-row">
              <span class="party-label">Mobile:</span>
              <span class="party-value">${
                ccontacts.map((c: any) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'
              }</span>
            </div>
          </div>
        </div>

        <div class="party-card">
          <div class="party-header">GUARANTOR DETAILS</div>
          <div class="party-content">
            <div class="party-row">
              <span class="party-label">Name:</span>
              <span class="party-value">${escapeHtml(guardian.gname || 'N/A')}</span>
            </div>
            <div class="party-row">
              <span class="party-label">${escapeHtml(guardian.gfname?.unit || 'Father')}:</span>
              <span class="party-value">${escapeHtml(guardian.gfname?.value || 'N/A')}</span>
            </div>
            <div class="party-row">
              <span class="party-label">Address:</span>
              <span class="party-value address">${escapeHtml(guardian.full_address || 'N/A')}</span>
            </div>
            <div class="party-row">
              <span class="party-label">Mobile:</span>
              <span class="party-value">${
                gcontacts.map((c: any) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'
              }</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Important Dates -->
      <div class="dates-bar">
        <div class="date-item">
          <span class="date-label">Agreement Date:</span>
          <span class="date-value">${escapeHtml(formatDate(loan.hpDate || loan.hp_date))}</span>
        </div>
        <div class="date-item">
          <span class="date-label">First EMI Date:</span>
          <span class="date-value">${escapeHtml(
            (() => {
              const bStr = loan.hpDate || loan.hp_date;
              if (!bStr) return 'N/A';
              const firstEmi = new Date(bStr);
              firstEmi.setMonth(firstEmi.getMonth() + 1);
              return formatDate(firstEmi.toISOString());
            })()
          )}</span>
        </div>
        <div class="date-item">
          <span class="date-label">Last EMI Date:</span>
          <span class="date-value">${escapeHtml(
            (() => {
              const bStr = loan.hpDate || loan.hp_date;
              const mNum = Number(loan.dueMonth ?? loan.due_month);
              if (!bStr || !mNum) return 'N/A';
              const lastEmi = new Date(bStr);
              lastEmi.setMonth(lastEmi.getMonth() + mNum);
              return formatDate(lastEmi.toISOString());
            })()
          )}</span>
        </div>
      </div>

      <!-- EMI Schedule Table (1-15) -->
      <div class="schedule-section">
        <table class="schedule-table">
          <thead>
            <tr>
              <th width="8%">EMI No.</th>
              <th width="16%">Due Date</th>
              <th width="16%">Paid Date</th>
              <th width="15%">Receipt No.</th>
              <th width="15%">Amount Paid</th>
              <th width="15%">Balance</th>
              <th width="15%">Signature</th>
            </tr>
          </thead>
          <tbody>
            ${generateScheduleRows(1, 15)}
          </tbody>
        </table>
      </div>

      ${
        showFooter
          ? `<!-- Page 1 Footer -->
      <div class="page-footer">
        <div class="instructions">
          <strong>Instructions:</strong> Bring this card for every payment • Pay on or before due date to avoid penalty
        </div>
        <div class="auth-sign">
          For ${escapeHtml(finance?.name || 'RIMI SOFTWARE')} - Authorized Signatory
        </div>
      </div>`
          : ''
      }
    </div>

    <!-- PAGE BREAK -->
    <div class="page-break"></div>

    <!-- PAGE 2 -->
    <div class="due-card-page">
      ${renderWatermarkHtml(options)}
      <!-- Simplified Header for Page 2 -->
      <div class="page2-header">
        <div class="header-left" style="display:flex; align-items:center; gap:8px;">
          ${logoHtmlSmall}
          <span><strong>${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</strong> - EMI Due Card (Continued)</span>
        </div>
        <div class="header-right">
          <span><strong>HPL No:</strong> ${escapeHtml(customer.hplno || 'N/A')} | <strong>Name:</strong> ${escapeHtml(customer.cname || 'N/A')}</span>
        </div>
      </div>

      <!-- EMI Schedule Table (16-36) -->
      <div class="schedule-section-page2">
        <table class="schedule-table">
          <thead>
            <tr>
              <th width="8%">EMI No.</th>
              <th width="16%">Due Date</th>
              <th width="16%">Paid Date</th>
              <th width="15%">Receipt No.</th>
              <th width="15%">Amount Paid</th>
              <th width="15%">Balance</th>
              <th width="15%">Signature</th>
            </tr>
          </thead>
          <tbody>
            ${generateScheduleRows(16, 36)}
          </tbody>
        </table>
      </div>

      ${
        showFooter
          ? `<!-- Final Settlement Section -->
      <div class="settlement-section">
        <div class="settlement-header">LOAN CLOSURE & FINAL SETTLEMENT</div>
        <div class="settlement-grid">
          <div class="settlement-item">
            <span class="settlement-label">Final Settlement Date:</span>
            <span class="settlement-line">___________________</span>
          </div>
          <div class="settlement-item">
            <span class="settlement-label">Total Amount Paid:</span>
            <span class="settlement-line">₹__________________</span>
          </div>
          <div class="settlement-item">
            <span class="settlement-label">NOC Issued Date:</span>
            <span class="settlement-line">___________________</span>
          </div>
          <div class="settlement-item">
            <span class="settlement-label">Documents Returned:</span>
            <span class="settlement-line">Yes / No</span>
          </div>
        </div>
        
        <div class="final-signatures">
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Borrower Signature</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Guarantor Signature</div>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Manager Signature & Seal</div>
          </div>
        </div>
      </div>`
          : ''
      }
    </div>
  `;
};

// ============================================================================
// 3. SEIZING LETTER PRINT (Extracted from PrintLettersDropdown.tsx)
// ============================================================================
export const generateSeizingLetterHtml = (
  data: any,
  finance: any,
  options: PrintTemplateOptions = { footer: true }
): string => {
  const customer = data?.customer || {};
  const guardian = data?.guardian || {};
  const loan = data?.loan || {};
  const vehicle = data?.vehicle || {};
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const ccontacts = Array.isArray(customer?.ccontacts) ? customer.ccontacts : [];
  const showFooter = options.footer !== false;

  const currentDate = new Date().toLocaleDateString('ta-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const dueMonthNum = Number(loan.dueMonth ?? loan.due_month) || 0;
  const dueAmountNum = Number(loan.dueAmount ?? loan.due_amount) || 0;
  const totalDue = dueMonthNum * dueAmountNum;
  const totalPaid = payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
  const balanceAmount = totalDue - totalPaid;
  const overdueEmis = dueMonthNum - payments.filter((p: any) => p.amount > 0).length;
  const phoneDisplay = Array.isArray(finance?.phone_numbers)
    ? finance.phone_numbers.join(', ')
    : finance?.phone_numbers || '';
  const logoHtml = renderLogoTag(finance, 48);

  return `
    <div class="seizing-letter">
      ${renderWatermarkHtml(options)}
      <!-- Official Letterhead -->
      <div class="letter-header">
        ${
          logoHtml
            ? `<div style="display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:6px;">
                 ${logoHtml}
                 <div>
                   <div class="company-title">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
                   <div class="company-details">
                     ${escapeHtml(finance?.address || '')}<br>
                     Phone: ${escapeHtml(phoneDisplay)}
                   </div>
                 </div>
               </div>`
            : `<div class="company-title">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
               <div class="company-details">
                 ${escapeHtml(finance?.address || '')}<br>
                 Phone: ${escapeHtml(phoneDisplay)}
               </div>`
        }
        <div class="letter-type">FINAL NOTICE - VEHICLE SEIZURE WARNING</div>
      </div>

      <!-- Reference & Date -->
      <div class="ref-section">
        <div class="ref-left">
          <strong>Ref No:</strong> SAC/SEIZE/${escapeHtml(customer.hplno)}/${escapeHtml(new Date().getFullYear())}
        </div>
        <div class="ref-right">
          <strong>Date:</strong> ${escapeHtml(currentDate)}
        </div>
      </div>

      <!-- Recipient Details -->
      <div class="recipient-section">
        <div class="to-label"><strong>பெறுநர் / To:</strong></div>
        <div class="recipient-details">
          <strong>${escapeHtml(customer.cname || 'N/A')}</strong><br>
          ${escapeHtml(customer.cfname?.unit || 'த/பெ')}: ${escapeHtml(customer.cfname?.value || 'N/A')}<br>
          ${escapeHtml(customer.full_address || 'N/A')}<br>
          Mobile: ${ccontacts.map((c: any) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'}
        </div>
      </div>

      <!-- Subject Line -->
      <div class="subject-section">
        <div class="subject-line">
          <strong>பொருள்:</strong> வாகனக் கடன் கணக்கு எண் <strong>${escapeHtml(customer.hplno || 'N/A')}</strong> - 
          வாகன எண் <strong>${escapeHtml(vehicle.vehicle_number || 'N/A')}</strong> - 
          கடன் தொகை செலுத்தாமை - வாகனம் கைப்பற்றுதல் குறித்த இறுதி அறிவிப்பு
        </div>
      </div>

      <!-- Loan Details Box -->
      <div class="loan-summary-box">
        <div class="box-header">LOAN ACCOUNT SUMMARY</div>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="sum-label">HPL Account No:</span>
            <span class="sum-value">${escapeHtml(customer.hplno || 'N/A')}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Vehicle Registration:</span>
            <span class="sum-value">${escapeHtml(vehicle.vehicle_number || 'N/A')}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Vehicle Model:</span>
            <span class="sum-value">${escapeHtml(vehicle.model_name || vehicle.vehicle_modal || 'N/A')}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Loan Amount:</span>
            <span class="sum-value">₹${escapeHtml((Number(loan.hpAmount ?? loan.hp_amount) || 0).toLocaleString('en-IN'))}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Monthly EMI:</span>
            <span class="sum-value">₹${escapeHtml((Number(loan.dueAmount ?? loan.due_amount) || 0).toLocaleString('en-IN'))}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Overdue EMIs:</span>
            <span class="sum-value highlight-red">${escapeHtml(overdueEmis)} Months</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Outstanding Balance:</span>
            <span class="sum-value highlight-red">₹${escapeHtml(balanceAmount.toLocaleString('en-IN'))}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Penalty Charges:</span>
            <span class="sum-value">₹${escapeHtml((Number(loan.penaltyAmount ?? loan.penalty_amount) || 0).toLocaleString('en-IN'))}/day</span>
          </div>
        </div>
      </div>

      <!-- Main Letter Content -->
      <div class="letter-body">
        <p class="salutation"><strong>மதிப்பிற்குரிய ஐயா/அம்மா,</strong></p>

        <p class="body-para">
          மேற்கண்ட பொருள் தொடர்பாக, தாங்கள் எங்கள் நிறுவனமான <strong>${escapeHtml(finance?.name || 'SENTHUR AUTO CONSULTING')}</strong>-ல் 
          <strong>${escapeHtml(formatDate(loan.hpDate || loan.hp_date))}</strong> அன்று <strong>${escapeHtml(vehicle.model_name || vehicle.vehicle_modal || 'வாகனம்')}</strong> 
          (பதிவு எண்: <strong>${escapeHtml(vehicle.vehicle_number || 'N/A')}</strong>) வாங்குவதற்காக 
          <strong>₹${escapeHtml((Number(loan.hpAmount ?? loan.hp_amount) || 0).toLocaleString('en-IN'))}</strong> கடன் பெற்றுள்ளீர்கள் என்பதை நினைவூட்டுகிறோம்.
        </p>

        <p class="body-para">
          கடன் ஒப்பந்தத்தின்படி, தாங்கள் மாதாந்திர தவணையாக <strong>₹${escapeHtml((Number(loan.dueAmount ?? loan.due_amount) || 0).toLocaleString('en-IN'))}</strong> 
          வீதம் <strong>${escapeHtml(loan.dueMonth ?? loan.due_month ?? 'N/A')}</strong> மாதங்களுக்கு தவறாமல் செலுத்த வேண்டும். 
          ஆனால், தாங்கள் கடந்த <strong>${escapeHtml(overdueEmis)}</strong> மாதங்களாக மாதாந்திர தவணைத் தொகையை 
          செலுத்தாமல் நிலுவையில் வைத்துள்ளீர்கள்.
        </p>

        <p class="body-para warning-para">
          <strong>முக்கிய அறிவிப்பு:</strong> இந்த கடிதம் கிடைத்த <strong>7 நாட்களுக்குள்</strong> 
          நிலுவையில் உள்ள மொத்த தொகை <strong>₹${escapeHtml(balanceAmount.toLocaleString('en-IN'))}</strong> மற்றும் 
          தாமதக் கட்டணங்களை உடனடியாக செலுத்த வேண்டும். தவறும்பட்சத்தில், கடன் ஒப்பந்தத்தின் 
          விதிமுறைகளின்படி, எந்தவித முன்னறிவிப்புமின்றி தங்களின் வாகனத்தை (<strong>${escapeHtml(vehicle.vehicle_number || 'N/A')}</strong>) 
          கைப்பற்றவும், சட்ட நடவடிக்கைகள் மேற்கொள்ளவும் எங்கள் நிறுவனம் கட்டாயப்படுத்தப்படும் என்பதை 
          இதன் மூலம் இறுதியாக தெரிவித்துக் கொள்கிறோம்.
        </p>

        <p class="body-para">
          மேலும், வாகனம் கைப்பற்றப்பட்ட பிறகு ஏற்படும் அனைத்து செலவுகளும், சட்ட நடவடிக்கை செலவுகளும், 
          மற்றும் வாகனத்தை ஏலம் விடுவதன் மூலம் ஏற்படும் நஷ்டமும் தாங்களே பொறுப்பாவீர்கள் என்பதையும், 
          உங்களின் ஜாமீன்தாரர் <strong>${escapeHtml(guardian.gname || 'N/A')}</strong> அவர்களும் இதற்கு கூட்டுப் பொறுப்பாவார் 
          என்பதையும் தெரிவித்துக் கொள்கிறோம்.
        </p>

        <p class="body-para">
          எனவே, உடனடியாக எங்கள் அலுவலகத்தை தொடர்பு கொண்டு நிலுவைத் தொகையை செலுத்தி, 
          மேற்கண்ட நடவடிக்கையை தவிர்க்குமாறு கேட்டுக் கொள்கிறோம்.
        </p>

        <p class="closing-note">
          <em>குறிப்பு: இந்த கடிதம் அனுப்பப்பட்ட பிறகு தாங்கள் பணம் செலுத்தியிருந்தால், 
          ரசீதுடன் உடனடியாக எங்கள் அலுவலகத்தை தொடர்பு கொள்ளவும்.</em>
        </p>
      </div>

      <!-- Copy To Section -->
      <div class="copy-section">
        <div class="copy-header"><strong>நகல் / Copy To (Guarantor):</strong></div>
        <div class="guarantor-info">
          <strong>${escapeHtml(guardian.gname || 'N/A')}</strong>, 
          ${escapeHtml(guardian.gfname?.unit || 'த/பெ')}: ${escapeHtml(guardian.gfname?.value || 'N/A')}, 
          ${escapeHtml(guardian.full_address || 'N/A')}
        </div>
      </div>

      ${
        showFooter
          ? `<!-- Signature Section -->
      <div class="letter-footer">
        <div class="footer-left">
          <div class="urgent-stamp">
            <div class="stamp-box">
              <strong>URGENT</strong><br>
              FINAL NOTICE<br>
              ACTION REQUIRED
            </div>
          </div>
        </div>
        <div class="footer-right">
          <div class="company-signature">
            <p><strong>உண்மையுள்ள,</strong></p>
            <p><strong>For ${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</strong></p>
            <div class="sig-space"></div>
            <p class="sig-designation"><strong>Authorized Signatory & Seal</strong></p>
          </div>
        </div>
      </div>`
          : ''
      }
    </div>
  `;
};

// ============================================================================
// 4. DEFAULTER NOTICE - CUSTOMER (Formal Demand Notice)
// ============================================================================
export const generateDefaulterCustomerHtml = (
  data: any,
  finance: any,
  options: PrintTemplateOptions = { footer: true }
): string => {
  const customer = data?.customer || {};
  const guardian = data?.guardian || {};
  const loan = data?.loan || {};
  const vehicle = data?.vehicle || {};
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const ccontacts = Array.isArray(customer?.ccontacts) ? customer.ccontacts : [];
  const gcontacts = Array.isArray(guardian?.gcontacts) ? guardian.gcontacts : [];
  const showFooter = options.footer !== false;

  const summary = computeOverdueSummary(loan, payments);
  const totalDemand = summary.overdueAmount + summary.penaltyTotal;
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const phoneDisplay = Array.isArray(finance?.phone_numbers)
    ? finance.phone_numbers.join(', ')
    : finance?.phone_numbers || '';
  const logoHtml = renderLogoTag(finance, 48);

  return `
    <div class="seizing-letter defaulter-notice">
      ${renderWatermarkHtml(options)}
      <!-- Official Letterhead -->
      <div class="letter-header">
        ${
          logoHtml
            ? `<div style="display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:6px;">
                 ${logoHtml}
                 <div>
                   <div class="company-title">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
                   <div class="company-details">
                     ${escapeHtml(finance?.address || '')}
                     ${phoneDisplay ? `<br>Phone: ${escapeHtml(phoneDisplay)}` : ''}
                   </div>
                 </div>
               </div>`
            : `<div class="company-title">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
               <div class="company-details">
                 ${escapeHtml(finance?.address || '')}
                 ${phoneDisplay ? `<br>Phone: ${escapeHtml(phoneDisplay)}` : ''}
               </div>`
        }
        <div class="letter-type">LOAN DEFAULTER DEMAND NOTICE — BORROWER</div>
      </div>

      <!-- Reference & Date -->
      <div class="ref-section">
        <div class="ref-left">
          <strong>Ref No:</strong> DN/CUST/${escapeHtml(customer.hplno || 'N/A')}/${escapeHtml(new Date().getFullYear())}
        </div>
        <div class="ref-right">
          <strong>Date:</strong> ${escapeHtml(currentDate)}
        </div>
      </div>

      <!-- Recipient Details -->
      <div class="recipient-section">
        <div class="to-label"><strong>TO (PRINCIPAL BORROWER):</strong></div>
        <div class="recipient-details">
          <strong>${escapeHtml(customer.cname || 'N/A')}</strong><br>
          ${escapeHtml(customer.cfname?.unit || 'S/O, D/O, W/O')}: ${escapeHtml(customer.cfname?.value || 'N/A')}<br>
          ${escapeHtml(customer.full_address || 'N/A')}<br>
          Contact: ${ccontacts.map((c: any) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'}
        </div>
      </div>

      <!-- Subject Line -->
      <div class="subject-section">
        <div class="subject-line">
          <strong>SUBJECT:</strong> DEMAND NOTICE FOR OVERDUE INSTALLMENTS — LOAN ACCOUNT HPL NO.
          <strong>${escapeHtml(customer.hplno || 'N/A')}</strong> — VEHICLE NO.
          <strong>${escapeHtml(vehicle.vehicle_number || 'N/A')}</strong>
        </div>
      </div>

      <!-- Account & Default Particulars -->
      <div class="loan-summary-box">
        <div class="box-header">LOAN &amp; OVERDUE PARTICULARS</div>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="sum-label">HPL Account No:</span>
            <span class="sum-value">${escapeHtml(customer.hplno || 'N/A')}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Vehicle No / Model:</span>
            <span class="sum-value">${escapeHtml(vehicle.vehicle_number || 'N/A')} (${escapeHtml(vehicle.model_name || vehicle.vehicle_modal || 'N/A')})</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Total Loan / Net Payable:</span>
            <span class="sum-value">₹${escapeHtml(summary.totalLoan.toLocaleString('en-IN'))}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Monthly EMI:</span>
            <span class="sum-value">₹${escapeHtml(summary.emiAmount.toLocaleString('en-IN'))}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Paid Installments:</span>
            <span class="sum-value">${escapeHtml(summary.paidEmis)} / ${escapeHtml(summary.dueMonth)} Months (₹${escapeHtml(summary.totalPaid.toLocaleString('en-IN'))})</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Overdue EMIs:</span>
            <span class="sum-value highlight-red">${escapeHtml(summary.overdueEmis)} Installment(s)</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Overdue EMI Amount:</span>
            <span class="sum-value highlight-red">₹${escapeHtml(summary.overdueAmount.toLocaleString('en-IN'))}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Penalty / Late Charges:</span>
            <span class="sum-value highlight-red">₹${escapeHtml(summary.penaltyTotal.toLocaleString('en-IN'))}</span>
          </div>
        </div>
      </div>

      <!-- Legal Notice Body -->
      <div class="letter-body">
        <p class="salutation"><strong>Dear Sir / Madam,</strong></p>

        <p class="body-para">
          ${escapeHtml(DEFAULTER_CUSTOMER_LEGAL_WORDING.openingParagraph)}
        </p>

        <p class="body-para warning-para">
          <strong>7-DAY DEMAND FOR PAYMENT:</strong> ${escapeHtml(DEFAULTER_CUSTOMER_LEGAL_WORDING.demandParagraph)}
          <br><br>
          <strong>Total Amount Demanded: ₹${escapeHtml(totalDemand.toLocaleString('en-IN'))}</strong>
          (Overdue EMI: ₹${escapeHtml(summary.overdueAmount.toLocaleString('en-IN'))} + Penalty: ₹${escapeHtml(summary.penaltyTotal.toLocaleString('en-IN'))})
        </p>

        <p class="body-para">
          ${escapeHtml(DEFAULTER_CUSTOMER_LEGAL_WORDING.consequenceParagraph)}
        </p>

        <p class="closing-note">
          <em>${escapeHtml(DEFAULTER_CUSTOMER_LEGAL_WORDING.ignoreIfPaidNote)}</em>
        </p>
      </div>

      <!-- Copy To Guarantor -->
      <div class="copy-section">
        <div class="copy-header"><strong>COPY TO (GUARANTOR / CO-APPLICANT):</strong></div>
        <div class="guarantor-info">
          ${
            guardian?.gname
              ? `<strong>${escapeHtml(guardian.gname)}</strong>, ${escapeHtml(guardian.gfname?.unit || 'Rel')}: ${escapeHtml(guardian.gfname?.value || 'N/A')}, ${escapeHtml(guardian.full_address || 'N/A')}${
                  gcontacts.length > 0
                    ? ` (Phone: ${gcontacts.map((c: any) => escapeHtml(c?.number)).filter(Boolean).join(', ')})`
                    : ''
                }`
              : 'No Co-Applicant / Guarantor on record'
          }
        </div>
      </div>

      ${
        showFooter
          ? `<!-- Signature Section -->
      <div class="letter-footer">
        <div class="footer-left">
          <div class="urgent-stamp">
            <div class="stamp-box">
              <strong>DEMAND NOTICE</strong><br>
              7 DAYS NOTICE<br>
              IMMEDIATE ACTION
            </div>
          </div>
        </div>
        <div class="footer-right">
          <div class="company-signature">
            <p><strong>Yours faithfully,</strong></p>
            <p><strong>For ${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</strong></p>
            <div class="sig-space"></div>
            <p class="sig-designation"><strong>Authorized Signatory &amp; Seal</strong></p>
          </div>
        </div>
      </div>`
          : ''
      }
    </div>
  `;
};

// ============================================================================
// 5. DEFAULTER NOTICE - CO-APPLICANT / GUARANTOR
// ============================================================================
export const generateDefaulterCoApplicantHtml = (
  data: any,
  finance: any,
  options: PrintTemplateOptions = { footer: true }
): string => {
  const customer = data?.customer || {};
  const guardian = data?.guardian || null;
  const loan = data?.loan || {};
  const vehicle = data?.vehicle || {};
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const ccontacts = Array.isArray(customer?.ccontacts) ? customer.ccontacts : [];
  const gcontacts = Array.isArray(guardian?.gcontacts) ? guardian.gcontacts : [];
  const showFooter = options.footer !== false;

  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const phoneDisplay = Array.isArray(finance?.phone_numbers)
    ? finance.phone_numbers.join(', ')
    : finance?.phone_numbers || '';
  const logoHtml = renderLogoTag(finance, 48);

  // If guardian is null or has no name on record, render a clear "No co-applicant on record" page
  if (!guardian || !guardian.gname || !String(guardian.gname).trim()) {
    return `
      <div class="seizing-letter defaulter-notice">
        ${renderWatermarkHtml(options)}
        <div class="letter-header">
          ${
            logoHtml
              ? `<div style="display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:6px;">
                   ${logoHtml}
                   <div>
                     <div class="company-title">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
                     <div class="company-details">${escapeHtml(finance?.address || '')}</div>
                   </div>
                 </div>`
              : `<div class="company-title">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
                 <div class="company-details">${escapeHtml(finance?.address || '')}</div>`
          }
          <div class="letter-type">LOAN DEFAULTER NOTICE — CO-APPLICANT / GUARANTOR</div>
        </div>
        <div style="border: 2px dashed #666; padding: 28px; margin-top: 24px; text-align: center; background: #fafafa;">
          <div style="font-size: 15px; font-weight: bold; margin-bottom: 8px;">NO CO-APPLICANT / GUARANTOR ON RECORD</div>
          <div style="font-size: 12px; color: #333; line-height: 1.6;">
            Loan Account HPL No: <strong>${escapeHtml(customer.hplno || 'N/A')}</strong><br>
            Principal Borrower: <strong>${escapeHtml(customer.cname || 'N/A')}</strong><br>
            Vehicle No: <strong>${escapeHtml(vehicle.vehicle_number || 'N/A')}</strong><br><br>
            No guarantor or co-applicant record is linked to this loan account. Please add guarantor details in Customer Details before generating a Co-Applicant Defaulter Notice.
          </div>
        </div>
      </div>
    `;
  }

  const summary = computeOverdueSummary(loan, payments);
  const totalDemand = summary.overdueAmount + summary.penaltyTotal;

  return `
    <div class="seizing-letter defaulter-notice">
      ${renderWatermarkHtml(options)}
      <!-- Official Letterhead -->
      <div class="letter-header">
        ${
          logoHtml
            ? `<div style="display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:6px;">
                 ${logoHtml}
                 <div>
                   <div class="company-title">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
                   <div class="company-details">
                     ${escapeHtml(finance?.address || '')}
                     ${phoneDisplay ? `<br>Phone: ${escapeHtml(phoneDisplay)}` : ''}
                   </div>
                 </div>
               </div>`
            : `<div class="company-title">${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</div>
               <div class="company-details">
                 ${escapeHtml(finance?.address || '')}
                 ${phoneDisplay ? `<br>Phone: ${escapeHtml(phoneDisplay)}` : ''}
               </div>`
        }
        <div class="letter-type">LOAN DEFAULTER DEMAND NOTICE — GUARANTOR / CO-APPLICANT</div>
      </div>

      <!-- Reference & Date -->
      <div class="ref-section">
        <div class="ref-left">
          <strong>Ref No:</strong> DN/GUAR/${escapeHtml(customer.hplno || 'N/A')}/${escapeHtml(new Date().getFullYear())}
        </div>
        <div class="ref-right">
          <strong>Date:</strong> ${escapeHtml(currentDate)}
        </div>
      </div>

      <!-- Recipient Details (Addressed to Guarantor) -->
      <div class="recipient-section">
        <div class="to-label"><strong>TO (GUARANTOR / CO-APPLICANT):</strong></div>
        <div class="recipient-details">
          <strong>${escapeHtml(guardian.gname)}</strong><br>
          ${escapeHtml(guardian.gfname?.unit || 'S/O, D/O, W/O')}: ${escapeHtml(guardian.gfname?.value || 'N/A')}<br>
          ${escapeHtml(guardian.full_address || 'N/A')}<br>
          Contact: ${gcontacts.map((c: any) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'}
        </div>
      </div>

      <!-- Subject Line -->
      <div class="subject-section">
        <div class="subject-line">
          <strong>SUBJECT:</strong> NOTICE OF DEFAULT &amp; CO-APPLICANT LIABILITY — PRINCIPAL BORROWER:
          <strong>${escapeHtml(customer.cname || 'N/A')}</strong> — HPL NO.
          <strong>${escapeHtml(customer.hplno || 'N/A')}</strong> — VEHICLE NO.
          <strong>${escapeHtml(vehicle.vehicle_number || 'N/A')}</strong>
        </div>
      </div>

      <!-- Principal Borrower & Default Summary Box -->
      <div class="loan-summary-box">
        <div class="box-header">PRINCIPAL BORROWER &amp; DEFAULT SUMMARY</div>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="sum-label">Principal Borrower:</span>
            <span class="sum-value">${escapeHtml(customer.cname || 'N/A')}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Borrower Phone:</span>
            <span class="sum-value">${ccontacts.map((c: any) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">HPL Account No:</span>
            <span class="sum-value">${escapeHtml(customer.hplno || 'N/A')}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Vehicle No / Model:</span>
            <span class="sum-value">${escapeHtml(vehicle.vehicle_number || 'N/A')} (${escapeHtml(vehicle.model_name || vehicle.vehicle_modal || 'N/A')})</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Total Loan / EMI:</span>
            <span class="sum-value">₹${escapeHtml(summary.totalLoan.toLocaleString('en-IN'))} (EMI: ₹${escapeHtml(summary.emiAmount.toLocaleString('en-IN'))})</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Overdue EMIs:</span>
            <span class="sum-value highlight-red">${escapeHtml(summary.overdueEmis)} Installment(s)</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Overdue EMI Amount:</span>
            <span class="sum-value highlight-red">₹${escapeHtml(summary.overdueAmount.toLocaleString('en-IN'))}</span>
          </div>
          <div class="summary-item">
            <span class="sum-label">Penalty / Total Due Now:</span>
            <span class="sum-value highlight-red">₹${escapeHtml(summary.penaltyTotal.toLocaleString('en-IN'))} / ₹${escapeHtml(totalDemand.toLocaleString('en-IN'))}</span>
          </div>
        </div>
      </div>

      <!-- Legal Notice Body -->
      <div class="letter-body">
        <p class="salutation"><strong>Dear Sir / Madam,</strong></p>

        <p class="body-para">
          ${escapeHtml(DEFAULTER_COAPPLICANT_LEGAL_WORDING.openingParagraph)}
        </p>

        <p class="body-para">
          ${escapeHtml(DEFAULTER_COAPPLICANT_LEGAL_WORDING.liabilityParagraph)}
        </p>

        <p class="body-para warning-para">
          <strong>7-DAY SETTLEMENT NOTICE TO GUARANTOR:</strong> ${escapeHtml(DEFAULTER_COAPPLICANT_LEGAL_WORDING.demandParagraph)}
          <br><br>
          <strong>Total Overdue Payable: ₹${escapeHtml(totalDemand.toLocaleString('en-IN'))}</strong>
          (Overdue Installments: ₹${escapeHtml(summary.overdueAmount.toLocaleString('en-IN'))} + Late Penalty: ₹${escapeHtml(summary.penaltyTotal.toLocaleString('en-IN'))})
        </p>

        <p class="closing-note">
          <em>${escapeHtml(DEFAULTER_COAPPLICANT_LEGAL_WORDING.ignoreIfPaidNote)}</em>
        </p>
      </div>

      <!-- Copy To Principal Borrower -->
      <div class="copy-section">
        <div class="copy-header"><strong>COPY TO (PRINCIPAL BORROWER):</strong></div>
        <div class="guarantor-info">
          <strong>${escapeHtml(customer.cname || 'N/A')}</strong>, ${escapeHtml(customer.cfname?.unit || 'Rel')}: ${escapeHtml(customer.cfname?.value || 'N/A')}, ${escapeHtml(customer.full_address || 'N/A')}
        </div>
      </div>

      ${
        showFooter
          ? `<!-- Signature Section -->
      <div class="letter-footer">
        <div class="footer-left">
          <div class="urgent-stamp">
            <div class="stamp-box">
              <strong>GUARANTOR NOTICE</strong><br>
              7 DAYS NOTICE<br>
              JOINT LIABILITY
            </div>
          </div>
        </div>
        <div class="footer-right">
          <div class="company-signature">
            <p><strong>Yours faithfully,</strong></p>
            <p><strong>For ${escapeHtml(finance?.name || 'RIMI SOFTWARE')}</strong></p>
            <div class="sig-space"></div>
            <p class="sig-designation"><strong>Authorized Signatory &amp; Seal</strong></p>
          </div>
        </div>
      </div>`
          : ''
      }
    </div>
  `;
};

// ============================================================================
// SHARED A4 STYLESHEET (Extracted verbatim from PrintLettersDropdown.tsx + watermark)
// ============================================================================
export const PRINT_A4_STYLESHEET = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Tamil:wght@400;500;600;700&display=swap');
  
  @page {
    size: A4;
    margin: 12mm;
  }
  
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  body {
    font-family: 'Inter', 'Noto Sans Tamil', Arial, sans-serif;
    font-size: 11px;
    line-height: 1.4;
    color: #000000;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page-break {
    page-break-before: always;
    break-before: page;
  }

  .print-watermark {
    position: absolute;
    top: 48%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-32deg);
    font-size: 64px;
    font-weight: 800;
    color: rgba(0, 0, 0, 0.06);
    letter-spacing: 8px;
    pointer-events: none;
    user-select: none;
    z-index: 0;
    white-space: nowrap;
  }

  /* ============================================================================
     LEDGER STYLES - Optimized for single A4 page, B&W printing
     ============================================================================ */
  .ledger-container {
    position: relative;
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
  }

  .ledger-container .header {
    text-align: center;
    margin-bottom: 5px;
    border-bottom: 2px solid #000;
    padding-bottom: 8px;
  }

  .ledger-container .company-name {
    font-size: 18px;
    font-weight: 700;
    color: #000;
    letter-spacing: 1px;
    margin-bottom: 1px;
  }

  .ledger-container .company-subtitle {
    font-size: 10px;
    color: #333;
    margin-bottom: 4px;
  }

  .ledger-container .document-title {
    font-size: 13px;
    font-weight: 600;
    color: #000;
    background: #f0f0f0;
    padding: 4px 12px;
    border: 1px solid #000;
    display: inline-block;
  }

  .status-bar {
    display: flex;
    justify-content: space-between;
    background: #f8f8f8;
    border: 1px solid #000;
    padding: 6px 12px;
    margin-bottom: 10px;
    font-size: 10px;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .status-label {
    font-weight: 600;
    color: #333;
  }

  .status-value {
    font-weight: 700;
    color: #000;
  }

  .status-badge {
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
    font-size: 9px;
  }

  .status-active {
    background: #e8f5e8;
    color: #000;
    border: 1px solid #000;
  }

  .status-closed {
    background: #f0f0f0;
    color: #333;
    border: 1px solid #666;
  }

  .main-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
  }

  .secondary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 10px;
  }

  .info-card {
    border: 1px solid #000;
    background: #fff;
  }

  .card-header {
    background: #e8e8e8;
    border-bottom: 1px solid #000;
    padding: 4px 8px;
  }

  .card-header h3 {
    font-size: 10px;
    font-weight: 700;
    color: #000;
    letter-spacing: 0.5px;
  }

  .card-content {
    padding: 8px;
  }

  .details-and-photo {
    display: flex;
    gap: 8px;
  }

  .details-column {
    flex: 1;
  }

  .photo-column {
    width: 60px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  .profile-photo {
    width: 55px;
    height: 65px;
    object-fit: cover;
    border: 1px solid #000;
  }

  .photo-placeholder {
    width: 55px;
    height: 65px;
    border: 1px dashed #666;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    text-align: center;
    color: #666;
    background: #f9f9f9;
  }

  .detail-row {
    display: flex;
    margin-bottom: 3px;
    font-size: 9.5px;
  }

  .detail-label {
    width: 75px;
    font-weight: 600;
    color: #333;
    flex-shrink: 0;
  }

  .detail-value {
    color: #000;
    word-break: break-word;
  }

  .detail-value.highlight {
    font-weight: 700;
  }

  .detail-value.currency {
    font-weight: 600;
    font-family: monospace;
  }

  .address-text {
    font-size: 9px;
    line-height: 1.2;
  }

  .compact-grid .detail-row {
    margin-bottom: 2px;
  }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 10px;
  }

  .summary-card {
    border: 1px solid #000;
    padding: 6px 8px;
    text-align: center;
    background: #f8f8f8;
  }

  .summary-label {
    font-size: 9px;
    font-weight: 600;
    color: #333;
    margin-bottom: 2px;
  }

  .summary-value {
    font-size: 11px;
    font-weight: 700;
    color: #000;
    font-family: monospace;
  }

  .table-section {
    margin-bottom: 12px;
  }

  .section-header {
    background: #e8e8e8;
    border: 1px solid #000;
    border-bottom: none;
    padding: 4px 8px;
  }

  .section-header h3 {
    font-size: 10px;
    font-weight: 700;
    color: #000;
  }

  .payment-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #000;
    font-size: 9px;
  }

  .payment-table th {
    background: #d8d8d8;
    border: 1px solid #000;
    padding: 4px 6px;
    font-weight: 700;
    text-align: center;
    color: #000;
  }

  .payment-table td {
    border: 1px solid #666;
    padding: 3px 6px;
    color: #000;
  }

  .even-row {
    background: #ffffff;
  }

  .odd-row {
    background: #f9f9f9;
  }

  .total-row {
    background: #e8e8e8 !important;
    font-weight: 700;
  }

  .total-row td {
    border-top: 2px solid #000;
    padding: 4px 6px;
  }

  .text-center {
    text-align: center;
  }

  .text-right {
    text-align: right;
  }

  .no-data {
    text-align: center;
    font-style: italic;
    color: #666;
    padding: 12px;
  }

  .footer-section {
    margin-top: 10px;
  }

  .terms-section {
    margin-bottom: 10px;
  }

  .terms-section h4 {
    font-size: 9px;
    font-weight: 700;
    margin-bottom: 3px;
  }

  .terms-list {
    font-size: 8px;
    padding-left: 12px;
    color: #333;
  }

  .terms-list li {
    margin-bottom: 1px;
  }

  .signature-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 15px;
    margin-top: 15px;
  }

  .signature-box {
    text-align: center;
  }

  .signature-line {
    border-bottom: 1px solid #000;
    height: 25px;
    margin-bottom: 4px;
  }

  .signature-label {
    font-size: 9px;
    font-weight: 600;
    margin-bottom: 2px;
  }

  .signature-date {
    font-size: 8px;
    color: #666;
  }

  /* ============================================================================
     DUE CARD STYLES - 2-Page Layout, Print-Friendly
     ============================================================================ */
  .due-card-page {
    position: relative;
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
    min-height: 260mm;
    display: flex;
    flex-direction: column;
  }

  .due-card-page .header {
    text-align: center;
    border: 2px solid #000;
    padding: 8px;
    margin-bottom: 8px;
    background: #f8f8f8;
  }

  .company-info .company-name {
    font-size: 16px;
    font-weight: 700;
    color: #000;
    letter-spacing: 1px;
  }

  .company-info .company-address {
    font-size: 9px;
    color: #333;
    margin: 2px 0;
  }

  .company-info .company-contact {
    font-size: 8px;
    color: #333;
  }

  .card-title {
    font-size: 12px;
    font-weight: 700;
    color: #000;
    background: #e0e0e0;
    padding: 3px 8px;
    border: 1px solid #000;
    margin-top: 4px;
    display: inline-block;
  }

  .loan-header {
    border: 1px solid #000;
    background: #f0f0f0;
    padding: 6px 8px;
    margin-bottom: 8px;
  }

  .loan-basic-info {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    font-size: 9.5px;
  }

  .info-item {
    display: flex;
    gap: 4px;
  }

  .info-item .label {
    font-weight: 600;
    color: #333;
  }

  .info-item .value {
    font-weight: 700;
    color: #000;
  }

  .info-item .value.highlight {
    background: #fff;
    padding: 1px 4px;
    border: 1px solid #666;
  }

  .parties-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
  }

  .party-card {
    border: 1px solid #000;
    background: #fff;
  }

  .party-header {
    background: #e0e0e0;
    border-bottom: 1px solid #000;
    padding: 3px 6px;
    font-size: 9px;
    font-weight: 700;
    text-align: center;
  }

  .party-content {
    padding: 6px;
  }

  .party-row {
    display: flex;
    margin-bottom: 2px;
    font-size: 8.5px;
  }

  .party-label {
    width: 50px;
    font-weight: 600;
    color: #333;
    flex-shrink: 0;
  }

  .party-value {
    color: #000;
    word-break: break-word;
  }

  .party-value.address {
    font-size: 8px;
    line-height: 1.2;
  }

  .dates-bar {
    display: flex;
    justify-content: space-around;
    border: 1px solid #000;
    background: #f8f8f8;
    padding: 4px 8px;
    margin-bottom: 8px;
    font-size: 9px;
  }

  .date-item {
    display: flex;
    gap: 4px;
  }

  .date-label {
    font-weight: 600;
    color: #333;
  }

  .date-value {
    font-weight: 700;
    color: #000;
  }

  .schedule-section {
    flex: 1;
    margin-bottom: 8px;
  }

  .schedule-section-page2 {
    flex: 1;
    margin-bottom: 12px;
  }

  .schedule-table {
    width: 100%;
    border-collapse: collapse;
    border: 2px solid #000;
    font-size: 9px;
  }

  .schedule-table th {
    background: #d0d0d0;
    border: 1px solid #000;
    padding: 4px 3px;
    font-weight: 700;
    text-align: center;
    color: #000;
    font-size: 8.5px;
  }

  .schedule-table td {
    border: 1px solid #666;
    height: 22px;
    padding: 2px 4px;
    vertical-align: middle;
  }

  .serial-cell {
    text-align: center;
    font-weight: 600;
    background: #f8f8f8;
  }

  .date-cell {
    text-align: center;
    font-size: 8px;
  }

  .empty-cell {
    background: #ffffff;
  }

  .page-footer {
    border-top: 1px solid #000;
    padding-top: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 8px;
  }

  .instructions {
    color: #333;
  }

  .auth-sign {
    font-weight: 600;
    color: #000;
  }

  .page2-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding-bottom: 4px;
    margin-bottom: 8px;
    font-size: 10px;
  }

  .settlement-section {
    border: 2px solid #000;
    padding: 8px;
    background: #f8f8f8;
  }

  .settlement-header {
    font-size: 10px;
    font-weight: 700;
    text-align: center;
    background: #e0e0e0;
    padding: 3px;
    border: 1px solid #000;
    margin-bottom: 8px;
  }

  .settlement-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 9px;
  }

  .settlement-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .settlement-label {
    font-weight: 600;
  }

  .settlement-line {
    font-family: monospace;
  }

  .final-signatures {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .sig-box {
    text-align: center;
  }

  .sig-line {
    border-bottom: 1px solid #000;
    height: 20px;
    margin-bottom: 3px;
  }

  .sig-label {
    font-size: 8px;
    font-weight: 600;
  }

  /* ============================================================================
     SEIZING LETTER & DEFAULTER NOTICE STYLES - Official Legal Notice Format
     ============================================================================ */
  .seizing-letter {
    position: relative;
    width: 100%;
    max-width: 186mm;
    margin: 0 auto;
    font-size: 11px;
    line-height: 1.5;
  }

  .letter-header {
    text-align: center;
    border: 2px solid #000;
    padding: 10px;
    margin-bottom: 12px;
    background: #f8f8f8;
  }

  .company-title {
    font-size: 18px;
    font-weight: 700;
    color: #000;
    letter-spacing: 1px;
    margin-bottom: 4px;
  }

  .company-details {
    font-size: 9px;
    color: #333;
    margin-bottom: 6px;
  }

  .letter-type {
    font-size: 12px;
    font-weight: 700;
    color: #000;
    background: #e0e0e0;
    padding: 4px 12px;
    border: 1px solid #000;
    display: inline-block;
  }

  .ref-section {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    font-size: 10px;
    padding: 4px 0;
    border-bottom: 1px solid #ccc;
  }

  .recipient-section {
    margin-bottom: 12px;
  }

  .to-label {
    font-size: 11px;
    margin-bottom: 4px;
  }

  .recipient-details {
    background: #f9f9f9;
    border-left: 3px solid #000;
    padding: 8px 12px;
    font-size: 10.5px;
    line-height: 1.4;
  }

  .subject-section {
    margin-bottom: 12px;
  }

  .subject-line {
    background: #f0f0f0;
    border: 1px solid #000;
    padding: 8px 10px;
    font-size: 10.5px;
    line-height: 1.4;
  }

  .loan-summary-box {
    border: 2px solid #000;
    margin-bottom: 12px;
    background: #fff;
  }

  .box-header {
    background: #d8d8d8;
    border-bottom: 1px solid #000;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 700;
    text-align: center;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
    padding: 8px 12px;
    font-size: 9.5px;
  }

  .summary-item {
    display: flex;
    justify-content: space-between;
    padding: 2px 0;
    border-bottom: 1px dotted #ccc;
  }

  .sum-label {
    font-weight: 600;
    color: #333;
  }

  .sum-value {
    font-weight: 700;
    color: #000;
  }

  .sum-value.highlight-red {
    background: #f0f0f0;
    padding: 1px 4px;
    border: 1px solid #000;
  }

  .letter-body {
    margin-bottom: 12px;
  }

  .salutation {
    margin-bottom: 8px;
    font-size: 11px;
  }

  .body-para {
    margin-bottom: 10px;
    text-align: justify;
    font-size: 10.5px;
    line-height: 1.6;
  }

  .warning-para {
    background: #f5f5f5;
    border: 1px solid #000;
    padding: 8px 10px;
    font-weight: 500;
  }

  .closing-note {
    font-size: 9.5px;
    color: #333;
    border-top: 1px dashed #666;
    padding-top: 6px;
    margin-top: 12px;
  }

  .copy-section {
    background: #f8f8f8;
    border: 1px solid #666;
    padding: 6px 10px;
    margin-bottom: 15px;
    font-size: 9.5px;
  }

  .copy-header {
    margin-bottom: 2px;
  }

  .guarantor-info {
    color: #333;
  }

  .letter-footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 20px;
  }

  .urgent-stamp {
    text-align: center;
  }

  .stamp-box {
    border: 2px solid #000;
    padding: 8px 12px;
    font-size: 9px;
    font-weight: 700;
    background: #f0f0f0;
    transform: rotate(-5deg);
    display: inline-block;
  }

  .company-signature {
    text-align: right;
    font-size: 10px;
  }

  .sig-space {
    height: 35px;
    border-bottom: 1px solid #000;
    width: 150px;
    margin: 8px 0 4px auto;
  }

  .sig-designation {
    font-size: 9px;
  }

  @media print {
    body {
      margin: 0 !important;
      padding: 0 !important;
    }
    
    .page-break {
      page-break-before: always !important;
      break-before: page !important;
    }

    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  }
`;

/**
 * Generates the body HTML for a single customer item and document type.
 */
export const generateSingleCustomerPrintHtml = (
  item: any,
  finance: any,
  docType: PrintDocTypeId,
  options: PrintTemplateOptions = { footer: true }
): string => {
  switch (docType) {
    case 'ledger':
      return generateLedgerHtml(item, finance, options);
    case 'due_card':
      return generateDueCardHtml(item, finance, options);
    case 'seizing_letter':
      return generateSeizingLetterHtml(item, finance, options);
    case 'defaulter_customer':
      return generateDefaulterCustomerHtml(item, finance, options);
    case 'defaulter_coapplicant':
      return generateDefaulterCoApplicantHtml(item, finance, options);
    default:
      return generateLedgerHtml(item, finance, options);
  }
};

export interface BuiltPrintDocument {
  html: string;
  bodyHtml: string;
  pageCount: number;
  pagesHtml: string[];
}

/**
 * Builds the complete multi-customer A4 print HTML document.
 * Joins each customer's pages with `<div class="page-break"></div>`, wraps in the A4
 * `@page` stylesheet, and calculates the exact total page count (`due_card` produces
 * 2 pages per customer; all other document types produce 1 page per customer).
 */
export const buildCompletePrintHtml = (
  items: any[],
  finance: any,
  docType: PrintDocTypeId,
  options: PrintTemplateOptions = { footer: true },
  title = 'Print Document'
): BuiltPrintDocument => {
  const safeItems = Array.isArray(items) ? items : [];
  const pagesHtml: string[] = [];

  for (const item of safeItems) {
    const itemHtml = generateSingleCustomerPrintHtml(item, finance, docType, options);
    if (docType === 'due_card') {
      const splitPages = itemHtml.split('<div class="page-break"></div>');
      for (const p of splitPages) {
        if (p.trim()) pagesHtml.push(p.trim());
      }
    } else {
      pagesHtml.push(itemHtml);
    }
  }

  const bodyHtml = pagesHtml.join('\n<div class="page-break"></div>\n');
  const pageCount = pagesHtml.length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_A4_STYLESHEET}</style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`;

  return {
    html,
    bodyHtml,
    pageCount,
    pagesHtml,
  };
};

/**
 * Reuses the existing Tauri + browser window + hidden-iframe print flow from
 * PrintLettersDropdown.tsx.
 */
export const triggerPrintDocument = async (
  title: string,
  completeHtml: string,
  toast?: (opts: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void
): Promise<void> => {
  const isTauri = typeof window !== 'undefined' && (window as any).__TAURI__ !== undefined;

  if (isTauri) {
    try {
      await invoke('print_document', {
        title,
        htmlContent: completeHtml,
      });

      toast?.({
        title: `${title} - Print Ready`,
        description: 'Document window opened. Wait for content to load, then press Ctrl+P to print.',
        variant: 'default',
      });
      return;
    } catch (tauriError) {
      console.warn('Tauri print command failed, using fallback:', tauriError);
    }
  }

  // Fallback: Open in new browser window with auto-print
  try {
    const printWindow = window.open('', '_blank', 'width=900,height=700,scrollbars=yes,resizable=yes');
    if (printWindow) {
      const htmlWithPrintScript = completeHtml.replace(
        '</body>',
        `
        <script>
          window.addEventListener('load', function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 800);
          });
          document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
              e.preventDefault();
              window.print();
            }
          });
        </script>
        </body>`
      );

      printWindow.document.open();
      printWindow.document.write(htmlWithPrintScript);
      printWindow.document.close();

      toast?.({
        title: `${title} Ready`,
        description: 'Print window opened. If print dialog does not appear automatically, press Ctrl+P.',
        variant: 'default',
      });
    } else {
      // Popup blocked - use hidden iframe method
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(completeHtml);
        iframeDoc.close();

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 2000);
        }, 500);

        toast?.({
          title: `Printing ${title}`,
          description: 'Print dialog will appear shortly...',
          variant: 'default',
        });
      }
    }
  } catch (fallbackError) {
    console.error('Fallback print failed:', fallbackError);
    toast?.({
      title: 'Print Error',
      description: 'Could not open print dialog. Please check popup blocker settings.',
      variant: 'destructive',
    });
  }
};

/**
 * Exports the generated HTML as a Word-compatible `.doc` document using the
 * `xmlns:o/w` Office namespaces and `application/msword` MIME type.
 */
export const exportWordDocument = (filename: string, completeOrBodyHtml: string): void => {
  const safeFilename = filename.endsWith('.doc') ? filename : `${filename}.doc`;

  let wordHtml = completeOrBodyHtml;
  if (!wordHtml.includes('xmlns:w="urn:schemas-microsoft-com:office:word"')) {
    // Wrap or upgrade <html> tag with Office XML namespaces
    if (wordHtml.includes('<html')) {
      wordHtml = wordHtml.replace(
        /<html[^>]*>/i,
        `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">`
      );
    } else {
      wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><style>${PRINT_A4_STYLESHEET}</style></head>
<body>${wordHtml}</body></html>`;
    }
  }

  const blob = new Blob(['\ufeff', wordHtml], {
    type: 'application/msword;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

