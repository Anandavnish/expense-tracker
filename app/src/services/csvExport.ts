// src/services/csvExport.ts
// RFC 4180 compliant CSV export engine for transaction data with custom filters and native sharing
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Transaction, TransactionType } from '../types/database';

export interface CsvExportFilterOptions {
  datePreset: 'all' | 'this_month' | 'this_year' | 'last_30_days' | 'custom';
  customFrom?: string; // YYYY-MM-DD
  customTo?: string;   // YYYY-MM-DD
  selectedAccountId?: string | null;
  selectedTypes?: TransactionType[];
  selectedCategories?: string[];
  transactions: Transaction[];
  accountMap: Record<string, string>;
}

export function filterTransactionsForCsv(options: CsvExportFilterOptions): Transaction[] {
  const {
    datePreset,
    customFrom,
    customTo,
    selectedAccountId,
    selectedTypes = [],
    selectedCategories = [],
    transactions,
  } = options;

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentYearStr = `${now.getFullYear()}`;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const thirtyDaysAgoStr = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`;

  return transactions.filter((tx) => {
    // 1. Date Range Filter
    if (datePreset === 'this_month') {
      if (!tx.date.startsWith(currentMonthStr)) return false;
    } else if (datePreset === 'this_year') {
      if (!tx.date.startsWith(currentYearStr)) return false;
    } else if (datePreset === 'last_30_days') {
      if (tx.date < thirtyDaysAgoStr) return false;
    } else if (datePreset === 'custom') {
      if (customFrom && tx.date < customFrom) return false;
      if (customTo && tx.date > customTo) return false;
    }

    // 2. Account / Money Source Filter
    if (selectedAccountId && tx.account_id !== selectedAccountId) {
      return false;
    }

    // 3. Transaction Type Filter
    if (selectedTypes.length > 0 && !selectedTypes.includes(tx.type)) {
      return false;
    }

    // 4. Category Filter
    if (selectedCategories.length > 0 && !selectedCategories.includes(tx.category)) {
      return false;
    }

    return true;
  });
}

function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  // RFC 4180: If string contains comma, quote, or newline, escape quotes with "" and wrap in ""
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

export function generateCsvContent(transactions: Transaction[], accountMap: Record<string, string>): string {
  const headers = [
    'Transaction ID',
    'Date',
    'Time',
    'Type',
    'Category',
    'Amount (INR)',
    'Description / Note',
    'Money Source Account',
    'Person / Counterparty',
    'Created At',
  ];

  const rows = transactions.map((tx) => {
    let timeString = '';
    if (tx.created_at) {
      try {
        const d = new Date(tx.created_at);
        timeString = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      } catch {
        timeString = '';
      }
    }

    const accountName = (tx as any).account?.name || accountMap[tx.account_id] || 'Unknown Account';
    const personName = (tx as any).person_name || '';

    return [
      escapeCsvCell(tx.id),
      escapeCsvCell(tx.date),
      escapeCsvCell(timeString),
      escapeCsvCell(tx.type),
      escapeCsvCell(tx.category || 'General'),
      escapeCsvCell(tx.amount),
      escapeCsvCell(tx.note || ''),
      escapeCsvCell(accountName),
      escapeCsvCell(personName),
      escapeCsvCell(tx.created_at || ''),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
}

export async function exportTransactionsCsv(options: CsvExportFilterOptions): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const filtered = filterTransactionsForCsv(options);
    if (filtered.length === 0) {
      return { success: false, count: 0, error: 'No transactions match the selected filter criteria.' };
    }

    const csvContent = generateCsvContent(filtered, options.accountMap);

    // Save to sandboxed cache directory (safe for expo-sharing on Android & iOS)
    const now = new Date();
    const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const filename = `ExpenseTracker_Export_${dateStamp}.csv`;
    const localUri = `${FileSystem.cacheDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(localUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(localUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Transactions CSV',
        UTI: 'public.comma-separated-values-text',
      });
      return { success: true, count: filtered.length };
    } else {
      return { success: false, count: filtered.length, error: 'Sharing is not available on this device' };
    }
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || 'Failed to export CSV' };
  }
}
