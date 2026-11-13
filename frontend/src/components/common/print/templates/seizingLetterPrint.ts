import {
  escapeHtml,
  formatDate,
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
// 3. SEIZING LETTER PRINT
// ============================================================================
export const generateSeizingLetterHtml = (
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
  const showFooter = options.footer !== false;

  const currentDate = new Date().toLocaleDateString('ta-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const dueMonthNum = Number(loan.dueMonth ?? loan.due_month) || 0;
  const dueAmountNum = Number(loan.dueAmount ?? loan.due_amount) || 0;
  const totalDue = dueMonthNum * dueAmountNum;
  const totalPaid = payments.reduce((sum: number, p: PrintPaymentRecord) => sum + (Number(p.amount) || 0), 0);
  const balanceAmount = totalDue - totalPaid;
  const overdueEmis = dueMonthNum - payments.filter((p) => Number(p.amount) > 0).length;
  const phoneDisplay = Array.isArray(finance?.phone_numbers)
    ? finance.phone_numbers.join(', ')
    : finance?.phone_numbers || '';
  const logoHtml = renderLogoTag(finance, 48, options);

  return `
    <div class="seizing-letter">
      ${renderWatermarkHtml(options)}
      <!-- Official Letterhead -->
      <div class="letter-header">
        ${logoHtml
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
          Mobile: ${ccontacts.map((c) => escapeHtml(c?.number)).filter(Boolean).join(', ') || 'N/A'}
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

      ${showFooter
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
