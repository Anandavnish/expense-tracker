// app/test_ai_overview_gating.mjs
// Test suite for AI Overview Trigger Gating, Prompt Tuning, Word Capping, and Budget Omission

import assert from 'assert';

function cleanAndCapOverviewText(rawText, maxWords = 120) {
  const trimmed = rawText.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return trimmed;
  }

  const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
  let accumulated = '';
  for (const sentence of sentences) {
    const candidate = (accumulated + ' ' + sentence).trim();
    const count = candidate.split(/\s+/).filter(Boolean).length;
    if (count <= maxWords) {
      accumulated = candidate;
    } else {
      break;
    }
  }

  if (accumulated.trim().length > 0) {
    return accumulated.trim();
  }

  return words.slice(0, maxWords).join(' ') + '...';
}

function checkTriggerGate(transactions, selectedMonth) {
  const monthTransactions = transactions.filter(
    (t) => t.date && t.date.startsWith(selectedMonth)
  );

  const distinctCategories = new Set(
    monthTransactions.map((t) => t.category?.trim()).filter(Boolean)
  );

  const isGated = monthTransactions.length < 5 || distinctCategories.size < 2;

  return {
    isGated,
    txCount: monthTransactions.length,
    catCount: distinctCategories.size,
    emptyStateMessage: isGated ? 'Log a few more transactions this month to unlock an overview' : null,
  };
}

function buildCompactAiSummary(monthTransactions, categories, budgetLimit, budgetSpent, isHistorical, monthLabel) {
  let totalIncome = 0;
  let totalExpense = 0;
  const categoryMap = {};

  monthTransactions.forEach((t) => {
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      totalIncome += amt;
    } else if (t.type === 'expense') {
      totalExpense += amt;
      categoryMap[t.category] = (categoryMap[t.category] || 0) + amt;
    }
  });

  const distinctCategories = new Set(
    monthTransactions.map((t) => t.category?.trim()).filter(Boolean)
  );

  const summary = {
    month: monthLabel,
    isHistorical,
    periodStatus: isHistorical
      ? `Historical closed and finalized period for ${monthLabel}`
      : `Active in-progress period for ${monthLabel}`,
    totalIncome,
    totalExpense,
    netSavings: totalIncome - totalExpense,
    transactionCount: monthTransactions.length,
    distinctCategoriesCount: distinctCategories.size,
  };

  // STRICT: Omit budget-variance data entirely if no budget is set!
  if (budgetLimit > 0) {
    summary.budgetLimit = budgetLimit;
    summary.budgetSpent = budgetSpent;
    summary.budgetRemaining = budgetLimit - budgetSpent;
    summary.budgetPercentUsed = Math.round((budgetSpent / budgetLimit) * 100);
  }

  return summary;
}

console.log('--- RUNNING AI OVERVIEW GATING & LOGIC VERIFICATION ---');

// Test 1: Gating with < 5 transactions
const txFew = [
  { date: '2026-09-05', category: 'Food & Dining', amount: 200, type: 'expense' },
  { date: '2026-09-08', category: 'Shopping', amount: 500, type: 'expense' },
  { date: '2026-09-12', category: 'Groceries', amount: 300, type: 'expense' },
];
const gateResult1 = checkTriggerGate(txFew, '2026-09');
assert.strictEqual(gateResult1.isGated, true, 'Should be gated with 3 transactions');
assert.strictEqual(gateResult1.emptyStateMessage, 'Log a few more transactions this month to unlock an overview');
console.log('✅ Test 1 Passed: Gated when transactionCount < 5');

// Test 2: Gating with >= 5 transactions but ONLY 1 category
const txOneCat = [
  { date: '2026-09-01', category: 'Food & Dining', amount: 100, type: 'expense' },
  { date: '2026-09-02', category: 'Food & Dining', amount: 150, type: 'expense' },
  { date: '2026-09-03', category: 'Food & Dining', amount: 120, type: 'expense' },
  { date: '2026-09-04', category: 'Food & Dining', amount: 180, type: 'expense' },
  { date: '2026-09-05', category: 'Food & Dining', amount: 210, type: 'expense' },
];
const gateResult2 = checkTriggerGate(txOneCat, '2026-09');
assert.strictEqual(gateResult2.isGated, true, 'Should be gated with only 1 category');
console.log('✅ Test 2 Passed: Gated when distinctCategories < 2');

// Test 3: Unlocked when >= 5 transactions AND >= 2 categories
const txValid = [
  { date: '2026-09-01', category: 'Food & Dining', amount: 100, type: 'expense' },
  { date: '2026-09-02', category: 'Transport', amount: 150, type: 'expense' },
  { date: '2026-09-03', category: 'Food & Dining', amount: 120, type: 'expense' },
  { date: '2026-09-04', category: 'Transport', amount: 180, type: 'expense' },
  { date: '2026-09-05', category: 'Food & Dining', amount: 210, type: 'expense' },
];
const gateResult3 = checkTriggerGate(txValid, '2026-09');
assert.strictEqual(gateResult3.isGated, false, 'Should be unlocked with 5 transactions and 2 categories');
assert.strictEqual(gateResult3.emptyStateMessage, null);
console.log('✅ Test 3 Passed: Unlocked when >= 5 transactions AND >= 2 categories');

// Test 4: Budget variance omission when budgetLimit <= 0
const summaryNoBudget = buildCompactAiSummary(txValid, ['Food & Dining', 'Transport'], 0, 0, false, 'September 2026');
assert.strictEqual('budgetLimit' in summaryNoBudget, false, 'budgetLimit must be omitted when 0');
assert.strictEqual('budgetSpent' in summaryNoBudget, false, 'budgetSpent must be omitted when budgetLimit is 0');
assert.strictEqual('budgetRemaining' in summaryNoBudget, false, 'budgetRemaining must be omitted when budgetLimit is 0');
assert.strictEqual('budgetPercentUsed' in summaryNoBudget, false, 'budgetPercentUsed must be omitted when budgetLimit is 0');
console.log('✅ Test 4 Passed: Budget fields strictly omitted when no budget set');

// Test 5: Budget variance inclusion when budgetLimit > 0
const summaryWithBudget = buildCompactAiSummary(txValid, ['Food & Dining', 'Transport'], 10000, 760, false, 'September 2026');
assert.strictEqual(summaryWithBudget.budgetLimit, 10000);
assert.strictEqual(summaryWithBudget.budgetSpent, 760);
assert.strictEqual(summaryWithBudget.budgetRemaining, 9240);
assert.strictEqual(summaryWithBudget.budgetPercentUsed, 8);
console.log('✅ Test 5 Passed: Budget fields included when budget set');

// Test 6: Historical framing
const summaryHist = buildCompactAiSummary(txValid, ['Food & Dining', 'Transport'], 0, 0, true, 'August 2026');
assert.strictEqual(summaryHist.isHistorical, true);
assert.strictEqual(summaryHist.periodStatus.includes('Historical closed and finalized period'), true);
console.log('✅ Test 6 Passed: Historical period status correctly set');

// Test 7: Word capping at sentence boundaries <= 120 words
const shortText = 'SNAPSHOT: You spent ₹760 saving 0% of income. PATTERN: Food and Dining made up 57% of expenses. NEXT STEP: Consider setting a monthly food budget.';
assert.strictEqual(cleanAndCapOverviewText(shortText, 120), shortText);

const longSentenceList = [];
for (let i = 1; i <= 20; i++) {
  longSentenceList.push(`Sentence number ${i} contains exactly eight words here.`);
}
const longText = longSentenceList.join(' ');
const capped = cleanAndCapOverviewText(longText, 120);
const cappedWords = capped.split(/\s+/).filter(Boolean);
assert(cappedWords.length <= 120, `Capped length ${cappedWords.length} should be <= 120`);
assert(capped.endsWith('.'), 'Should end cleanly on a sentence boundary');
console.log(`✅ Test 7 Passed: Word capping enforced (resulted in ${cappedWords.length} words ending with period)`);

console.log('\n--- ALL AI OVERVIEW TESTS PASSED SUCCESSFULLY! ---');
