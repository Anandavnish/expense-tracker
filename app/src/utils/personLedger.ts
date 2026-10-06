// src/utils/personLedger.ts
import { Borrow, Transaction, Account } from '../types/database';
import { parseBorrowDetails } from '../store/financeStore';

export interface PersonLedgerEntry {
  id: string;
  sourceType: 'borrow' | 'transaction';
  borrowId?: string | null;
  transactionId?: string | null;
  type: 'lent' | 'borrowed' | 'repayment_received' | 'repayment_paid' | 'paid_by_friend';
  amount: number;
  direction: '+' | '−'; // '+' = you gave / they owe; '−' = they gave / you owe / repaid
  date: string;
  note?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  status: 'pending' | 'settled';
  createdAt: string;
}

export interface PersonLedger {
  personName: string;
  avatarColor: string;
  pendingLent: number;
  pendingBorrowed: number;
  totalHistoricalLent: number;
  totalHistoricalBorrowed: number;
  totalRepaidToMe: number;
  totalRepaidByMe: number;
  netBalance: number; // > 0: they owe you; < 0: you owe them; === 0: settled
  pendingCount: number;
  settledCount: number;
  status: 'pending' | 'settled';
  lastActivityDate: string;
  entries: PersonLedgerEntry[];
}

export const normalizePersonName = (name: string): string => {
  return name
    .replace(/^\[(BORROWED|LENT)\]\s*/i, '')
    .trim();
};

const AVATAR_COLORS = [
  '#6366F1', '#EC4899', '#10B981', '#F59E0B', '#3B82F6',
  '#8B5CF6', '#14B8A6', '#F97316', '#06B6D4', '#84CC16',
];

export const getAvatarColorForName = (name: string): string => {
  const clean = normalizePersonName(name).toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index] || '#6366F1';
};

/**
 * Extracts normalized person name from a transaction if it relates to a borrow/lent/friend.
 */
export const getPersonNameFromTransaction = (
  tx: Transaction,
  borrows: Borrow[] = []
): string | null => {
  if (tx.friend_name && tx.friend_name.trim()) {
    return normalizePersonName(tx.friend_name);
  }

  // Check if linked to a borrow
  const linkedBorrow = borrows.find((b) => b.linked_transaction_id === tx.id);
  if (linkedBorrow) {
    const details = parseBorrowDetails(linkedBorrow);
    return details.displayName;
  }

  // Check transaction notes for borrow/lent patterns
  const note = (tx.note || '').trim();
  if (!note) return null;

  const lentMatch = note.match(/^Lent to\s+([^,]+)/i);
  if (lentMatch && lentMatch[1]) return normalizePersonName(lentMatch[1]);

  const borrowMatch = note.match(/^Borrowed from\s+([^,]+)/i);
  if (borrowMatch && borrowMatch[1]) return normalizePersonName(borrowMatch[1]);

  const repayReceivedMatch = note.match(/^Repayment received from\s+([^,]+)/i);
  if (repayReceivedMatch && repayReceivedMatch[1]) return normalizePersonName(repayReceivedMatch[1]);

  const repayPaidMatch = note.match(/^Repayment paid to\s+([^,]+)/i);
  if (repayPaidMatch && repayPaidMatch[1]) return normalizePersonName(repayPaidMatch[1]);

  return null;
};

/**
 * Builds unified person ledgers from borrows, transactions, and accounts.
 */
export const buildPersonLedgers = (
  borrows: Borrow[],
  transactions: Transaction[] = [],
  accounts: Account[] = []
): PersonLedger[] => {
  const accountMap = new Map<string, Account>();
  accounts.forEach((a) => accountMap.set(a.id, a));

  const personMap = new Map<
    string,
    {
      canonicalName: string;
      pendingLent: number;
      pendingBorrowed: number;
      totalHistoricalLent: number;
      totalHistoricalBorrowed: number;
      totalRepaidToMe: number;
      totalRepaidByMe: number;
      pendingCount: number;
      settledCount: number;
      entries: PersonLedgerEntry[];
      dates: string[];
    }
  >();

  const getOrCreatePerson = (rawName: string) => {
    const canonical = normalizePersonName(rawName);
    const key = canonical.toLowerCase();
    if (!personMap.has(key)) {
      personMap.set(key, {
        canonicalName: canonical,
        pendingLent: 0,
        pendingBorrowed: 0,
        totalHistoricalLent: 0,
        totalHistoricalBorrowed: 0,
        totalRepaidToMe: 0,
        totalRepaidByMe: 0,
        pendingCount: 0,
        settledCount: 0,
        entries: [],
        dates: [],
      });
    }
    return personMap.get(key)!;
  };

  const processedTxIds = new Set<string>();

  // 1. Process all borrow records
  borrows.forEach((borrow) => {
    const { type, displayName } = parseBorrowDetails(borrow, transactions);
    if (!displayName) return;

    const person = getOrCreatePerson(displayName);
    const amt = Number(borrow.amount || 0);

    const linkedTx = borrow.linked_transaction_id
      ? transactions.find((t) => t.id === borrow.linked_transaction_id)
      : null;

    if (linkedTx) {
      processedTxIds.add(linkedTx.id);
    }

    const effectiveDate = linkedTx?.date || borrow.date || borrow.created_at.substring(0, 10);
    const accountId = linkedTx?.account_id || null;
    const accountName = accountId ? accountMap.get(accountId)?.name || 'Account' : null;

    if (borrow.status === 'pending') {
      person.pendingCount += 1;
      if (type === 'lent') {
        person.pendingLent += amt;
      } else {
        person.pendingBorrowed += amt;
      }
    } else {
      person.settledCount += 1;
    }

    if (type === 'lent') {
      person.totalHistoricalLent += amt;
    } else {
      person.totalHistoricalBorrowed += amt;
    }

    person.dates.push(effectiveDate);

    person.entries.push({
      id: `borrow_${borrow.id}`,
      sourceType: 'borrow',
      borrowId: borrow.id,
      transactionId: borrow.linked_transaction_id,
      type: type === 'lent' ? 'lent' : 'borrowed',
      amount: amt,
      direction: type === 'lent' ? '+' : '−',
      date: effectiveDate,
      note: linkedTx?.note || (type === 'lent' ? `Lent to ${person.canonicalName}` : `Borrowed from ${person.canonicalName}`),
      accountId,
      accountName,
      status: borrow.status,
      createdAt: borrow.created_at,
    });
  });

  // 2. Process transactions that represent repayments or friend payments not already linked
  transactions.forEach((tx) => {
    if (processedTxIds.has(tx.id)) return;

    const personName = getPersonNameFromTransaction(tx, borrows);
    if (!personName) return;

    const person = getOrCreatePerson(personName);
    const amt = Number(tx.amount || 0);
    const accountId = tx.account_id || null;
    const accountName = accountId ? accountMap.get(accountId)?.name || 'Account' : null;

    person.dates.push(tx.date);

    if (tx.category === 'Repayment' || (tx.note && /repayment/i.test(tx.note))) {
      const isReceived = tx.type === 'income' || /received/i.test(tx.note || '');
      if (isReceived) {
        person.totalRepaidToMe += amt;
        person.entries.push({
          id: `tx_${tx.id}`,
          sourceType: 'transaction',
          transactionId: tx.id,
          type: 'repayment_received',
          amount: amt,
          direction: '−', // repayment received reduces the debt they owe you
          date: tx.date,
          note: tx.note || `Repayment received from ${person.canonicalName}`,
          accountId,
          accountName,
          status: 'settled',
          createdAt: tx.created_at,
        });
      } else {
        person.totalRepaidByMe += amt;
        person.entries.push({
          id: `tx_${tx.id}`,
          sourceType: 'transaction',
          transactionId: tx.id,
          type: 'repayment_paid',
          amount: amt,
          direction: '+', // repayment you paid reduces debt you owe them
          date: tx.date,
          note: tx.note || `Repayment paid to ${person.canonicalName}`,
          accountId,
          accountName,
          status: 'settled',
          createdAt: tx.created_at,
        });
      }
    } else if (tx.paid_by_friend) {
      person.totalHistoricalBorrowed += amt;
      person.entries.push({
        id: `tx_${tx.id}`,
        sourceType: 'transaction',
        transactionId: tx.id,
        type: 'paid_by_friend',
        amount: amt,
        direction: '−', // debt you owe friend
        date: tx.date,
        note: tx.note || `Expense paid by ${person.canonicalName}`,
        accountId,
        accountName,
        status: 'pending',
        createdAt: tx.created_at,
      });
    }
  });

  // 3. Assemble and calculate net balances
  const result: PersonLedger[] = [];

  personMap.forEach((data) => {
    // Sort entries chronologically: newest first
    data.entries.sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return b.createdAt.localeCompare(a.createdAt);
    });

    const net = data.pendingLent - data.pendingBorrowed;
    const isSettled = data.pendingCount === 0;

    const latestDate = data.dates.length > 0
      ? data.dates.sort().reverse()[0]
      : new Date().toISOString().substring(0, 10);

    result.push({
      personName: data.canonicalName,
      avatarColor: getAvatarColorForName(data.canonicalName),
      pendingLent: data.pendingLent,
      pendingBorrowed: data.pendingBorrowed,
      totalHistoricalLent: data.totalHistoricalLent,
      totalHistoricalBorrowed: data.totalHistoricalBorrowed,
      totalRepaidToMe: data.totalRepaidToMe,
      totalRepaidByMe: data.totalRepaidByMe,
      netBalance: net,
      pendingCount: data.pendingCount,
      settledCount: data.settledCount,
      status: isSettled ? 'settled' : 'pending',
      lastActivityDate: latestDate,
      entries: data.entries,
    });
  });

  // Sort by pending first, then by last activity date descending
  result.sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;
    return b.lastActivityDate.localeCompare(a.lastActivityDate);
  });

  return result;
};

/**
 * Finds a specific person's ledger by name.
 */
export const getPersonLedgerByName = (
  name: string,
  borrows: Borrow[],
  transactions: Transaction[] = [],
  accounts: Account[] = []
): PersonLedger | null => {
  const norm = normalizePersonName(name).toLowerCase();
  if (!norm) return null;
  const ledgers = buildPersonLedgers(borrows, transactions, accounts);
  return ledgers.find((l) => l.personName.toLowerCase() === norm) || null;
};
