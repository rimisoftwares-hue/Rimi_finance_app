import {
  escapeHtml,
  formatDate,
  isOptionEnabled,
  renderLogoTag,
  renderWatermarkHtml,
} from '../printHelpers';
import type {
  PrintContactRecord,
  PrintCustomerData,
  PrintFinanceData,
  PrintTemplateOptions,
} from '../types';

// ============================================================================
// 2. DUE CARD PRINT
// ============================================================================
export const generateDueCardHtml = (
  data?: PrintCustomerData | null,
  finance?: PrintFinanceData | null,
  options: PrintTemplateOptions = { footer: true }
): string => {
  const customer = data?.customer || {};
  const guardian = data?.guardian || {};
  const loan = data?.loan || {};
  const vehicle = data?.vehicle || {};
  const ccontacts: PrintContactRecord[] = Array.isArray(customer?.ccontacts) ? customer.ccontacts : [];
  const gcontacts: PrintContactRecord[] = Array.isArray(guardian?.gcontacts) ? guardian.gcontacts : [];
  const showFooter = isOptionEnabled(options.footer);
  const showGuarantor = isOptionEnabled(options.showGuarantor);
  const showDatesBar = isOptionEnabled(options.showDatesBar);
  const showVehicleModel = isOptionEnabled(options.showVehicleModel);
  const showInstructions = isOptionEnabled(options.showInstructions);
  const showSettlementSection = isOptionEnabled(options.showSettlementSection);

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
  const logoHtml = renderLogoTag(finance, 42, options);
  const logoHtmlSmall = renderLogoTag(finance, 32, options);

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
          </div>${
            showVehicleModel
              ? `
          <div class="info-item">
            <span class="label">Vehicle Model:</span>
            <span class="value">${escapeHtml(vehicle.model_name || vehicle.vehicle_modal || 'N/A')}</span>
          </div>`
              : ''
          }
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
      <div class="parties-section"${showGuarantor ? '' : ' style="grid-template-columns: 1fr;"'}>
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
                ccontacts.map((c) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'
              }</span>
            </div>
          </div>
        </div>${
          showGuarantor
            ? `

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
                gcontacts.map((c) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'
              }</span>
            </div>
          </div>
        </div>`
            : ''
        }
      </div>${
        showDatesBar
          ? `

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
      </div>`
          : ''
      }

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
      <div class="page-footer"${showInstructions ? '' : ' style="justify-content: flex-end;"'}>${
        showInstructions
          ? `
        <div class="instructions">
          <strong>Instructions:</strong> Bring this card for every payment • Pay on or before due date to avoid penalty
        </div>`
          : ''
      }
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
        showFooter && showSettlementSection
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
        
        <div class="final-signatures"${showGuarantor ? '' : ' style="grid-template-columns: repeat(2, 1fr);"'}>
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Borrower Signature</div>
          </div>${
            showGuarantor
              ? `
          <div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">Guarantor Signature</div>
          </div>`
              : ''
          }
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
