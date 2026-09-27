// src/services/statementExport.ts
// Luxury fintech statement export generator with PDF rendering and native sharing
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Transaction } from '../types/database';

export interface StatementExportOptions {
  userEmail: string;
  userId?: string;
  dateFilterLabel: string;
  accountFilterLabel: string;
  typeFilterLabel: string;
  categoriesFilterLabel: string;
  searchQuery?: string;
  transactions: Transaction[];
  accountMap: Record<string, string>;
}

export function generateStatementHtml(options: StatementExportOptions): string {
  const {
    userEmail,
    userId,
    dateFilterLabel,
    accountFilterLabel,
    typeFilterLabel,
    categoriesFilterLabel,
    searchQuery,
    transactions,
    accountMap,
  } = options;

  // Calculate totals
  let totalIncome = 0;
  let totalExpense = 0;
  let totalLent = 0;
  let totalBorrowed = 0;

  transactions.forEach((tx) => {
    const amt = Number(tx.amount || 0);
    if (tx.type === 'income') totalIncome += amt;
    else if (tx.type === 'expense') totalExpense += amt;
    else if (tx.type === 'borrow_given') totalLent += amt;
    else if (tx.type === 'borrow_taken') totalBorrowed += amt;
  });

  const netCashFlow = totalIncome - totalExpense;
  const netLentBorrowed = totalLent - totalBorrowed;

  const now = new Date();
  const downloadTimestamp = now.toLocaleString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const statementRef = `STMT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Generate table rows
  const rowsHtml = transactions.length === 0
    ? `<tr><td colspan="7" style="text-align: center; padding: 32px; color: #64748B;">No transactions match the selected filter criteria.</td></tr>`
    : transactions
        .map((tx, idx) => {
          const amt = Number(tx.amount || 0);
          const isIncome = tx.type === 'income';
          const isLent = tx.type === 'borrow_given';
          const isBorrowed = tx.type === 'borrow_taken';

          let typeBadgeBg = '#F1F5F9';
          let typeBadgeColor = '#475569';
          let typeLabel = 'Expense';
          let sign = '−';
          let amountColor = '#E11D48';

          if (isIncome) {
            typeBadgeBg = '#ECFDF5';
            typeBadgeColor = '#059669';
            typeLabel = 'Income';
            sign = '+';
            amountColor = '#059669';
          } else if (isLent) {
            typeBadgeBg = '#FFFBEB';
            typeBadgeColor = '#D97706';
            typeLabel = 'Lent';
            sign = '+';
            amountColor = '#D97706';
          } else if (isBorrowed) {
            typeBadgeBg = '#F0F9FF';
            typeBadgeColor = '#0284C7';
            typeLabel = 'Borrowed';
            sign = '−';
            amountColor = '#0284C7';
          }

          const accountName = (tx as any).account?.name || accountMap[tx.account_id] || 'Source Account';
          const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA';

          // Extract time if available in created_at
          let timeString = '';
          if (tx.created_at) {
            try {
              const d = new Date(tx.created_at);
              timeString = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
            } catch {
              timeString = '';
            }
          }

          return `
            <tr style="background-color: ${rowBg}; border-bottom: 1px solid #E2E8F0;">
              <td style="padding: 10px 12px; font-size: 11px; color: #94A3B8; text-align: center;">${idx + 1}</td>
              <td style="padding: 10px 12px; font-size: 12px; color: #1E293B; white-space: nowrap;">
                <div style="font-weight: 600;">${tx.date}</div>
                ${timeString ? `<div style="font-size: 10px; color: #94A3B8;">${timeString}</div>` : ''}
              </td>
              <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: #0F172A;">
                ${tx.note || 'Unspecified'}
              </td>
              <td style="padding: 10px 12px; font-size: 11px; color: #475569;">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: #F1F5F9; border: 1px solid #E2E8F0; font-weight: 500;">
                  ${tx.category || 'General'}
                </span>
              </td>
              <td style="padding: 10px 12px; font-size: 11px; color: #475569; font-weight: 500;">
                ${accountName}
              </td>
              <td style="padding: 10px 12px; text-align: center;">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; background: ${typeBadgeBg}; color: ${typeBadgeColor}; font-size: 10px; font-weight: 700; border: 1px solid ${typeBadgeColor}30;">
                  ${typeLabel}
                </span>
              </td>
              <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: ${amountColor}; text-align: right; font-variant-numeric: tabular-nums;">
                ${sign}${formatCurrency(amt)}
              </td>
            </tr>
          `;
        })
        .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Account Statement - ${statementRef}</title>
  <style>
    @page {
      margin: 15mm 15mm 15mm 15mm;
      size: A4 portrait;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0F172A;
      background-color: #FFFFFF;
      margin: 0;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      border-bottom: 2px solid #0F172A;
      padding-bottom: 16px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #0F172A;
      margin: 0;
    }
    .brand-subtitle {
      font-size: 11px;
      color: #64748B;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-top: 2px;
    }
    .ref-badge {
      text-align: right;
    }
    .ref-number {
      font-size: 14px;
      font-weight: 800;
      font-family: monospace;
      color: #334155;
    }
    .timestamp-text {
      font-size: 10px;
      color: #94A3B8;
      margin-top: 2px;
    }
    .meta-grid {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      background-color: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
    }
    .meta-cell {
      padding: 10px 14px;
      vertical-align: top;
      border-right: 1px solid #E2E8F0;
      width: 25%;
    }
    .meta-cell:last-child {
      border-right: none;
    }
    .meta-label {
      font-size: 9px;
      font-weight: 700;
      color: #64748B;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 3px;
    }
    .meta-value {
      font-size: 12px;
      font-weight: 700;
      color: #0F172A;
      word-break: break-all;
    }
    .filters-box {
      background-color: #F1F5F9;
      border: 1px dashed #CBD5E1;
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 20px;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 11px;
    }
    .filter-item {
      display: inline-block;
      margin-right: 16px;
    }
    .filter-item strong {
      color: #475569;
    }
    .filter-item span {
      color: #0F172A;
      font-weight: 600;
    }
    .summary-cards-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 8px;
      margin-left: -8px;
      margin-right: -8px;
      margin-bottom: 24px;
    }
    .summary-card {
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      padding: 12px 14px;
      vertical-align: top;
      width: 25%;
    }
    .summary-card-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748B;
      margin-bottom: 4px;
    }
    .summary-card-value {
      font-size: 16px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .data-table th {
      background-color: #0F172A;
      color: #FFFFFF;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      padding: 10px 12px;
      text-align: left;
    }
    .data-table tr {
      page-break-inside: avoid;
    }
    .totals-box {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      border: 1px solid #CBD5E1;
      background: #F8FAFC;
      border-radius: 6px;
    }
    .totals-box td {
      padding: 10px 14px;
      font-size: 12px;
    }
    .totals-box .totals-label {
      font-weight: 600;
      color: #475569;
    }
    .totals-box .totals-value {
      text-align: right;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .footer {
      border-top: 1px solid #E2E8F0;
      padding-top: 12px;
      color: #94A3B8;
      font-size: 10px;
      text-align: center;
      line-height: 1.6;
    }
  </style>
</head>
<body>

  <!-- Top Header Table -->
  <table class="header-table">
    <tr>
      <td style="vertical-align: middle;">
        <h1 class="brand-title">EXPENSE TRACKER</h1>
        <div class="brand-subtitle">Official Statement of Transactions</div>
      </td>
      <td class="ref-badge" style="vertical-align: middle;">
        <div class="ref-number">${statementRef}</div>
        <div class="timestamp-text">Exported: ${downloadTimestamp}</div>
      </td>
    </tr>
  </table>

  <!-- Personal & Session Metadata -->
  <table class="meta-grid">
    <tr>
      <td class="meta-cell">
        <div class="meta-label">Account Holder</div>
        <div class="meta-value">${userEmail}</div>
      </td>
      <td class="meta-cell">
        <div class="meta-label">Account / User ID</div>
        <div class="meta-value">${userId ? userId.substring(0, 16) + '...' : 'Direct Session'}</div>
      </td>
      <td class="meta-cell">
        <div class="meta-label">Statement Scope</div>
        <div class="meta-value">${dateFilterLabel}</div>
      </td>
      <td class="meta-cell">
        <div class="meta-label">Total Records</div>
        <div class="meta-value">${transactions.length} Transactions</div>
      </td>
    </tr>
  </table>

  <!-- Active Filter Settings Applied -->
  <div class="filters-box">
    <div class="filter-item"><strong>Date Range:</strong> <span>${dateFilterLabel}</span></div>
    <div class="filter-item"><strong>Money Source:</strong> <span>${accountFilterLabel}</span></div>
    <div class="filter-item"><strong>Type Filter:</strong> <span>${typeFilterLabel}</span></div>
    <div class="filter-item"><strong>Category Filter:</strong> <span>${categoriesFilterLabel}</span></div>
    ${searchQuery ? `<div class="filter-item"><strong>Search Query:</strong> <span>"${searchQuery}"</span></div>` : ''}
  </div>

  <!-- Summary KPI Cards -->
  <table class="summary-cards-table">
    <tr>
      <td class="summary-card" style="border-left: 3px solid #059669;">
        <div class="summary-card-label">Total Inflow (Income)</div>
        <div class="summary-card-value" style="color: #059669;">+${formatCurrency(totalIncome)}</div>
      </td>
      <td class="summary-card" style="border-left: 3px solid #E11D48;">
        <div class="summary-card-label">Total Outflow (Spent)</div>
        <div class="summary-card-value" style="color: #E11D48;">−${formatCurrency(totalExpense)}</div>
      </td>
      <td class="summary-card" style="border-left: 3px solid ${netCashFlow >= 0 ? '#059669' : '#E11D48'};">
        <div class="summary-card-label">Net Movement</div>
        <div class="summary-card-value" style="color: ${netCashFlow >= 0 ? '#059669' : '#E11D48'};">
          ${netCashFlow >= 0 ? '+' : '−'}${formatCurrency(Math.abs(netCashFlow))}
        </div>
      </td>
      <td class="summary-card" style="border-left: 3px solid #3B82F6;">
        <div class="summary-card-label">Net Lent / Borrowed</div>
        <div class="summary-card-value" style="color: ${netLentBorrowed >= 0 ? '#D97706' : '#0284C7'};">
          ${netLentBorrowed >= 0 ? '+' : '−'}${formatCurrency(Math.abs(netLentBorrowed))}
        </div>
      </td>
    </tr>
  </table>

  <!-- Main Transactions Table -->
  <table class="data-table">
    <thead>
      <tr>
        <th style="width: 32px; text-align: center;">#</th>
        <th style="width: 80px;">Date & Time</th>
        <th>Description / Note</th>
        <th style="width: 100px;">Category</th>
        <th style="width: 120px;">Source Account</th>
        <th style="width: 70px; text-align: center;">Type</th>
        <th style="width: 110px; text-align: right;">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <!-- Grand Total Summary Box -->
  <table class="totals-box">
    <tr>
      <td class="totals-label">Total Income / Gains:</td>
      <td class="totals-value" style="color: #059669;">+${formatCurrency(totalIncome)}</td>
    </tr>
    <tr style="border-top: 1px solid #E2E8F0;">
      <td class="totals-label">Total Expenses / Losses:</td>
      <td class="totals-value" style="color: #E11D48;">−${formatCurrency(totalExpense)}</td>
    </tr>
    ${totalLent > 0 ? `
    <tr style="border-top: 1px solid #E2E8F0;">
      <td class="totals-label">Total Lent (Asset Receivable):</td>
      <td class="totals-value" style="color: #D97706;">+${formatCurrency(totalLent)}</td>
    </tr>` : ''}
    ${totalBorrowed > 0 ? `
    <tr style="border-top: 1px solid #E2E8F0;">
      <td class="totals-label">Total Borrowed (Payable Due):</td>
      <td class="totals-value" style="color: #0284C7;">−${formatCurrency(totalBorrowed)}</td>
    </tr>` : ''}
    <tr style="border-top: 2px solid #0F172A; background-color: #F1F5F9; font-size: 13px;">
      <td class="totals-label" style="font-weight: 800; color: #0F172A;">Net Balance Impact:</td>
      <td class="totals-value" style="font-size: 15px; color: ${netCashFlow >= 0 ? '#059669' : '#E11D48'};">
        ${netCashFlow >= 0 ? '+' : '−'}${formatCurrency(Math.abs(netCashFlow))}
      </td>
    </tr>
  </table>

  <!-- Official Footer & Certification Note -->
  <div class="footer">
    <div>This official transaction ledger was generated electronically by <strong>Expense Tracker</strong> on ${downloadTimestamp}.</div>
    <div>All values are computed from locally verified, encrypted records. Offline-First Financial Architecture.</div>
    <div style="margin-top: 4px; font-weight: 600;">Statement ID: ${statementRef} • Page 1 of 1</div>
  </div>

</body>
</html>
  `;
}

export async function exportTransactionsStatement(options: StatementExportOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const html = generateStatementHtml(options);

    if (Platform.OS === 'web') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        return { success: true };
      }
      return { success: false, error: 'Popup blocked by browser' };
    }

    // Generate local PDF file via expo-print
    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    // Check if sharing is available on device
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Save Transaction Statement',
        UTI: 'com.adobe.pdf',
      });
      return { success: true };
    } else {
      // Fallback: direct print dialog
      await Print.printAsync({ uri });
      return { success: true };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to export statement' };
  }
}
