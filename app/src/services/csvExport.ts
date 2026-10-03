// src/services/csvExport.ts
// RFC 4180 compliant CSV export engine for transaction data with custom filters and native sharing
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
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

    const accountName =
      (tx as any).account?.name ||
      (tx.account_id ? accountMap[tx.account_id] : '') ||
      (tx.paid_by_friend ? `Paid by ${tx.friend_name || 'Friend'}` : 'Unknown Account');
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

export async function exportTransactionsCsv(options: CsvExportFilterOptions): Promise<{ success: boolean; count: number; copiedToClipboard?: boolean; error?: string }> {
  try {
    const filtered = filterTransactionsForCsv(options);
    if (filtered.length === 0) {
      return { success: false, count: 0, error: 'No transactions match the selected filter criteria.' };
    }

    const csvContent = generateCsvContent(filtered, options.accountMap);

    const now = new Date();
    const dateStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const filename = `ExpenseTracker_Export_${dateStamp}.csv`;

    // 1. Web Platform: Native browser blob download
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', filename);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          return { success: true, count: filtered.length };
        }
      } catch (webErr: any) {
        console.warn('Web CSV download failed, falling back to clipboard:', webErr);
      }
      // Web clipboard fallback
      try {
        await Clipboard.setStringAsync(csvContent);
        return { success: true, count: filtered.length, copiedToClipboard: true };
      } catch {
        return { success: false, count: 0, error: 'Failed to download or copy CSV on web.' };
      }
    }

    // 2. Native Mobile: Write to sandboxed cache/document directory and open system share dialog
    let localUri: string | null = null;
    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;

    if (cacheDir) {
      try {
        const dir = cacheDir.endsWith('/') ? cacheDir : `${cacheDir}/`;
        localUri = `${dir}${filename}`;
        await FileSystem.writeAsStringAsync(localUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } catch (writeErr) {
        console.warn('Failed to write CSV file to native cache:', writeErr);
      }
    }

    if (localUri) {
      const canShare = await Sharing.isAvailableAsync().catch(() => false);
      if (canShare) {
        await Sharing.shareAsync(localUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Transactions CSV',
          UTI: 'public.comma-separated-values-text',
        });
        return { success: true, count: filtered.length };
      }
    }

    // 3. Fallback: If sharing is unavailable or file write was prevented, copy CSV to clipboard
    try {
      await Clipboard.setStringAsync(csvContent);
      return { success: true, count: filtered.length, copiedToClipboard: true };
    } catch {
      return { success: false, count: filtered.length, error: 'Unable to share or save CSV file on this device.' };
    }
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || 'Failed to export CSV' };
  }
}
