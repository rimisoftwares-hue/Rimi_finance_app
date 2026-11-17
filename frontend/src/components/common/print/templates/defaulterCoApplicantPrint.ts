import {
  computeOverdueSummary,
  escapeHtml,
  isOptionEnabled,
  renderLogoTag,
  renderWatermarkHtml,
} from '../printHelpers';
import { DEFAULTER_COAPPLICANT_LEGAL_WORDING } from '../types';
import type {
  PrintContactRecord,
  PrintCustomerData,
  PrintFinanceData,
  PrintPaymentRecord,
  PrintTemplateOptions,
} from '../types';

// ============================================================================
// 5. DEFAULTER NOTICE - CO-APPLICANT / GUARANTOR
// ============================================================================
export const generateDefaulterCoApplicantHtml = (
  data?: PrintCustomerData | null,
  finance?: PrintFinanceData | null,
  options: PrintTemplateOptions = { footer: true }
): string => {
  const customer = data?.customer || {};
  const guardian = data?.guardian || null;
  const loan = data?.loan || {};
  const vehicle = data?.vehicle || {};
  const payments: PrintPaymentRecord[] = Array.isArray(data?.payments) ? data.payments : [];
  const ccontacts: PrintContactRecord[] = Array.isArray(customer?.ccontacts) ? customer.ccontacts : [];
  const gcontacts: PrintContactRecord[] = Array.isArray(guardian?.gcontacts) ? guardian.gcontacts : [];
  const showFooter = isOptionEnabled(options.footer);
  const showRefNo = isOptionEnabled(options.showRefNo);
  const showLoanSummaryBox = isOptionEnabled(options.showLoanSummaryBox);
  const showBorrowerPhone = isOptionEnabled(options.showBorrowerPhone);
  const showCopyToBorrower = isOptionEnabled(options.showCopyToBorrower);
  const showUrgentStamp = isOptionEnabled(options.showUrgentStamp);

  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const phoneDisplay = Array.isArray(finance?.phone_numbers)
    ? finance.phone_numbers.join(', ')
    : finance?.phone_numbers || '';
  const logoHtml = renderLogoTag(finance, 48, options);

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
      <div class="ref-section"${showRefNo ? '' : ' style="justify-content: flex-end;"'}>${
        showRefNo
          ? `
        <div class="ref-left">
          <strong>Ref No:</strong> DN/GUAR/${escapeHtml(customer.hplno || 'N/A')}/${escapeHtml(new Date().getFullYear())}
        </div>`
          : ''
      }
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
          Contact: ${gcontacts.map((c) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'}
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
      </div>${
        showLoanSummaryBox
          ? `

      <!-- Principal Borrower & Default Summary Box -->
      <div class="loan-summary-box">
        <div class="box-header">PRINCIPAL BORROWER &amp; DEFAULT SUMMARY</div>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="sum-label">Principal Borrower:</span>
            <span class="sum-value">${escapeHtml(customer.cname || 'N/A')}</span>
          </div>${
            showBorrowerPhone
              ? `
          <div class="summary-item">
            <span class="sum-label">Borrower Phone:</span>
            <span class="sum-value">${ccontacts.map((c) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'}</span>
          </div>`
              : ''
          }
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
      </div>`
          : ''
      }

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
      </div>${
        showCopyToBorrower
          ? `

      <!-- Copy To Principal Borrower -->
      <div class="copy-section">
        <div class="copy-header"><strong>COPY TO (PRINCIPAL BORROWER):</strong></div>
        <div class="guarantor-info">
          <strong>${escapeHtml(customer.cname || 'N/A')}</strong>, ${escapeHtml(customer.cfname?.unit || 'Rel')}: ${escapeHtml(customer.cfname?.value || 'N/A')}, ${escapeHtml(customer.full_address || 'N/A')}
        </div>
      </div>`
          : ''
      }

      ${
        showFooter
          ? `<!-- Signature Section -->
      <div class="letter-footer"${showUrgentStamp ? '' : ' style="justify-content: flex-end;"'}>${
        showUrgentStamp
          ? `
        <div class="footer-left">
          <div class="urgent-stamp">
            <div class="stamp-box">
              <strong>GUARANTOR NOTICE</strong><br>
              7 DAYS NOTICE<br>
              JOINT LIABILITY
            </div>
          </div>
        </div>`
          : ''
      }
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
