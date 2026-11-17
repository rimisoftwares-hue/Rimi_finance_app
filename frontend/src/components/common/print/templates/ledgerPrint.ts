import {
  escapeHtml,
  formatDate,
  getImageUrl,
  isOptionEnabled,
  renderLogoTag,
  renderWatermarkHtml,
} from '../printHelpers';
import type {
  PrintContactRecord,
  PrintCustomerData,
  PrintFinanceData,
  PrintPaymentRecord,
  PrintTemplateOptions,
} from '../types';

// ============================================================================
// 1. LEDGER PRINT
// ============================================================================
export const generateLedgerHtml = (
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

  const customerPhotoUrl = getImageUrl(customer.cphoto);
  const guardianPhotoUrl = getImageUrl(guardian.gphoto);
  const showFooter = isOptionEnabled(options.footer);
  const showInterestRate = isOptionEnabled(options.showInterestRate);
  const showPenalty = isOptionEnabled(options.showPenalty);
  const showBroker = isOptionEnabled(options.showBroker);
  const showGuardian = isOptionEnabled(options.showGuardian);
  const showPhotos = isOptionEnabled(options.showPhotos);
  const showWorkDetails = isOptionEnabled(options.showWorkDetails);
  const showVehicleChassisEngine = isOptionEnabled(options.showVehicleChassisEngine);
  const showTerms = isOptionEnabled(options.showTerms);

  const calculateTotals = () => {
    const totalAmount = payments.reduce((sum: number, p: PrintPaymentRecord) => sum + (Number(p.amount) || 0), 0);
    const totalPenalty = payments.reduce((sum: number, p: PrintPaymentRecord) => sum + (Number(p.penalty) || 0), 0);
    const dueMonthNum = Number(loan.dueMonth ?? loan.due_month) || 0;
    const dueAmountNum = Number(loan.dueAmount ?? loan.due_amount) || 0;
    const totalDue = dueMonthNum * dueAmountNum;
    const balance = totalDue - totalAmount;

    return { totalAmount, totalPenalty, totalDue, balance };
  };

  const totals = calculateTotals();
  const logoHtml = renderLogoTag(finance, 42, options);

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
        </div>${
          showBroker
            ? `
        <div class="status-item">
          <span class="status-label">Broker : </span>
          <span class="status-value">${escapeHtml(customer.brokerName || 'N/A')}</span>
        </div>`
            : ''
        }
      </div>

      <!-- Main Details Section -->
      <div class="main-grid"${showGuardian ? '' : ' style="grid-template-columns: 1fr;"'}>
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
                    ccontacts.map((c) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'
                  }</span>
                </div>${
                  showWorkDetails
                    ? `
                <div class="detail-row">
                  <span class="detail-label">Work Office :</span>
                  <span class="detail-value">${escapeHtml(customer.work_office_address || 'N/A')}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Work Phone :</span>
                  <span class="detail-value">${escapeHtml(customer.work_office_phone || 'N/A')}</span>
                </div>`
                    : ''
                }
              </div>${
                showPhotos
                  ? `
              <div class="photo-column">
                ${
                  customerPhotoUrl
                    ? `<img src="${escapeHtml(customerPhotoUrl)}" class="profile-photo" alt="Customer Photo" onerror="this.style.display='none'" />`
                    : `<div class="photo-placeholder">Customer<br>Photo</div>`
                }
              </div>`
                  : ''
              }
            </div>
          </div>
        </div>${
          showGuardian
            ? `

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
                    gcontacts.map((c) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'
                  }</span>
                </div>
              </div>${
                showPhotos
                  ? `
              <div class="photo-column">
                ${
                  guardianPhotoUrl
                    ? `<img src="${escapeHtml(guardianPhotoUrl)}" class="profile-photo" alt="Guardian Photo" onerror="this.style.display='none'" />`
                    : `<div class="photo-placeholder">Guardian<br>Photo</div>`
                }
              </div>`
                  : ''
              }
            </div>
          </div>
        </div>`
            : ''
        }
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
              </div>${
                showVehicleChassisEngine
                  ? `
              <div class="detail-row">
                <span class="detail-label">Chassis No:</span>
                <span class="detail-value">${escapeHtml(vehicle.chassis_number || 'N/A')}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Engine No:</span>
                <span class="detail-value">${escapeHtml(vehicle.engine_number || 'N/A')}</span>
              </div>`
                  : ''
              }
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
              </div>${
                showInterestRate
                  ? `
              <div class="detail-row">
                <span class="detail-label">Interest Rate:</span>
                <span class="detail-value">${escapeHtml(loan.interestRate ?? loan.interest_rate ?? 'N/A')}%</span>
              </div>`
                  : ''
              }
              <div class="detail-row">
                <span class="detail-label">Monthly EMI:</span>
                <span class="detail-value currency">₹${escapeHtml((Number(loan.dueAmount ?? loan.due_amount) || 0).toLocaleString('en-IN'))}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Net Payable:</span>
                <span class="detail-value currency">₹${escapeHtml(totals.totalDue.toLocaleString('en-IN'))}</span>
              </div>${
                showPenalty
                  ? `
              <div class="detail-row">
                <span class="detail-label">Penalty Rate:</span>
                <span class="detail-value currency">₹${escapeHtml((Number(loan.penaltyAmount ?? loan.penalty_amount) || 0).toLocaleString('en-IN'))}/day</span>
              </div>`
                  : ''
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Payment Summary Cards -->
      <div class="summary-cards"${showPenalty ? '' : ' style="grid-template-columns: repeat(3, 1fr);"'}>
        <div class="summary-card paid">
          <div class="summary-label">Total Paid</div>
          <div class="summary-value">₹${escapeHtml(totals.totalAmount.toLocaleString('en-IN'))}</div>
        </div>
        <div class="summary-card balance">
          <div class="summary-label">Balance Amount</div>
          <div class="summary-value">₹${escapeHtml(totals.balance.toLocaleString('en-IN'))}</div>
        </div>${
          showPenalty
            ? `
        <div class="summary-card penalty">
          <div class="summary-label">Total Penalty</div>
          <div class="summary-value">₹${escapeHtml(totals.totalPenalty.toLocaleString('en-IN'))}</div>
        </div>`
            : ''
        }
        <div class="summary-card installments">
          <div class="summary-label">Paid Installments</div>
          <div class="summary-value">${escapeHtml(payments.filter((p) => Number(p.amount) > 0).length)} / ${escapeHtml(loan.dueMonth ?? loan.due_month ?? 0)}</div>
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
              <th width="${showPenalty ? '18%' : '22%'}">Due Date</th>
              <th width="${showPenalty ? '18%' : '22%'}">Payment Date</th>
              <th width="${showPenalty ? '18%' : '23%'}">Bill Number</th>
              <th width="${showPenalty ? '19%' : '25%'}">Amount Paid (₹)</th>${
                showPenalty
                  ? `
              <th width="19%">Penalty (₹)</th>`
                  : ''
              }
            </tr>
          </thead>
          <tbody>
            ${
              payments.length > 0
                ? payments
                    .map(
                      (payment, index: number) => `
              <tr class="${index % 2 === 0 ? 'even-row' : 'odd-row'}">
                <td class="text-center">${index + 1}</td>
                <td class="text-center">${escapeHtml(formatDate(payment.dueDate))}</td>
                <td class="text-center">${escapeHtml(formatDate(payment.paymentDate))}</td>
                <td class="text-center">${escapeHtml(payment.billNumber || '-')}</td>
                <td class="text-right currency">${payment.amount ? `₹${escapeHtml(Number(payment.amount).toLocaleString('en-IN'))}` : '-'}</td>${
                  showPenalty
                    ? `
                <td class="text-right currency">${payment.penalty ? `₹${escapeHtml(Number(payment.penalty).toLocaleString('en-IN'))}` : '-'}</td>`
                    : ''
                }
              </tr>
            `
                    )
                    .join('')
                : `
              <tr>
                <td colspan="${showPenalty ? 6 : 5}" class="no-data">No payment records available</td>
              </tr>
            `
            }
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td colspan="4" class="text-right"><strong>TOTAL</strong></td>
              <td class="text-right currency"><strong>₹${escapeHtml(totals.totalAmount.toLocaleString('en-IN'))}</strong></td>${
                showPenalty
                  ? `
              <td class="text-right currency"><strong>₹${escapeHtml(totals.totalPenalty.toLocaleString('en-IN'))}</strong></td>`
                  : ''
              }
            </tr>
          </tfoot>
        </table>
      </div>

      ${
        showFooter
          ? `<!-- Footer & Signatures -->
      <div class="footer-section">${
        showTerms
          ? `
        <div class="terms-section">
          <h4>Terms & Conditions:</h4>
          <ul class="terms-list">
            <li>EMI payments must be made on or before the due date every month</li>
            <li>Late payment charges of ₹${escapeHtml(loan.penaltyAmount ?? loan.penalty_amount ?? 0)} per day will be applicable for overdue amounts</li>
            <li>Vehicle documents will be released only after complete loan settlement</li>
          </ul>
        </div>
        `
          : ''
      }
        <div class="signature-grid"${showGuardian ? '' : ' style="grid-template-columns: repeat(2, 1fr);"'}>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label">Customer Signature</div>
            <div class="signature-date">Date: _______________</div>
          </div>${
            showGuardian
              ? `
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label">Guarantor Signature</div>
            <div class="signature-date">Date: _______________</div>
          </div>`
              : ''
          }
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
