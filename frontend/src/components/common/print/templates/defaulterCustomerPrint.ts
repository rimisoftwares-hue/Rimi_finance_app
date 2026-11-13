import {
  computeOverdueSummary,
  escapeHtml,
  renderLogoTag,
  renderWatermarkHtml,
} from '../printHelpers';
import { DEFAULTER_CUSTOMER_LEGAL_WORDING } from '../types';
import type {
  PrintContactRecord,
  PrintCustomerData,
  PrintFinanceData,
  PrintPaymentRecord,
  PrintTemplateOptions,
} from '../types';

// ============================================================================
// 4. DEFAULTER NOTICE - CUSTOMER (Formal Demand Notice)
// ============================================================================
export const generateDefaulterCustomerHtml = (
  data?: PrintCustomerData | null,
  finance?: PrintFinanceData | null,
  options: PrintTemplateOptions = { footer: true }
): string => {
  const customer = data?.customer || {};
  const guardian = data?.guardian || {};
  const loan = data?.loan || {};
  const vehicle = data?.vehicle || {};
  const payments: PrintPaymentRecord[] = Array.isArray(data?.payments) ? data.payments : [];
  const ccontacts: PrintContactRecord[] = Array.isArray(customer?.ccontacts) ? customer.ccontacts : [];
  const gcontacts: PrintContactRecord[] = Array.isArray(guardian?.gcontacts) ? guardian.gcontacts : [];
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
  const logoHtml = renderLogoTag(finance, 48, options);

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
          Contact: ${ccontacts.map((c) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'}
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
                    ? ` (Phone: ${gcontacts.map((c) => escapeHtml(c?.number)).filter(Boolean).join(', ')})`
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
