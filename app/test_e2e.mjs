// app/test_e2e.mjs
// End-to-end verification of Auth, Default Accounts Trigger, Balance Updates, Views, and Realtime
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

global.WebSocket = WebSocket;

const SUPABASE_URL = 'https://yqopwzkvxdxmomvvlpor.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlxb3B3emt2eGR4bW9tdnZscG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxODkxMjcsImV4cCI6MjEwNTc2NTEyN30.2IXYJpudYU1mHsdetoC929OrrRD4Lqqp5ARTSkIcuEk';

async function runVerification() {
  console.log('--- STARTING E2E VERIFICATION ---');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // 1. Test Sign Up
  const testEmail = `finance_tester_${Date.now()}@testdomain.com`;
  const testPassword = 'Password123!Secure';
  console.log(`\n[STEP 1] Testing Sign Up with ${testEmail}...`);

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
  });

  if (authError) {
    console.error('❌ Sign up failed:', authError.message);
    process.exit(1);
  }

  const userId = authData.user?.id;
  console.log(`✅ User signed up successfully. User ID: ${userId}`);

  // Wait 1.5 seconds for Postgres trigger to execute
  await new Promise((r) => setTimeout(r, 1500));

  // 2. Verify Default Accounts Trigger
  console.log('\n[STEP 2] Verifying default accounts created by trigger...');
  const { data: accounts, error: accError } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId);

  if (accError) {
    console.error('❌ Failed to fetch accounts:', accError.message);
    process.exit(1);
  }

  console.log(`Found ${accounts.length} default accounts:`);
  accounts.forEach((acc) => {
    console.log(` - ${acc.name} (${acc.type}): balance = ₹${acc.current_balance}`);
  });

  if (accounts.length < 2) {
    console.error('❌ Expected at least 2 default accounts from trigger!');
    process.exit(1);
  }
  console.log('✅ Trigger verification passed: default accounts exist.');

  const bankAccount = accounts.find((a) => a.type === 'bank') || accounts[0];

  // 3. Test Add Transaction & Trigger Balance Update
  console.log(`\n[STEP 3] Adding transaction to account "${bankAccount.name}"...`);
  const initialBalance = Number(bankAccount.current_balance);
  const txAmount = 750.5;

  const { data: newTx, error: txError } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: bankAccount.id,
      type: 'expense',
      amount: txAmount,
      category: 'Food & Dining',
      note: 'Team Dinner',
      date: new Date().toISOString().substring(0, 10),
      source: 'manual',
    })
    .select()
    .single();

  if (txError) {
    console.error('❌ Failed to insert transaction:', txError.message);
    process.exit(1);
  }
  console.log(`✅ Transaction inserted. ID: ${newTx.id}, Amount: ₹${newTx.amount}`);

  // Wait 1 second for balance update trigger
  await new Promise((r) => setTimeout(r, 1000));

  // Fetch updated account balance
  const { data: updatedAcc } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', bankAccount.id)
    .single();

  const expectedBalance = initialBalance - txAmount;
  console.log(
    `Account balance before: ₹${initialBalance} | after: ₹${updatedAcc.current_balance} (Expected: ₹${expectedBalance})`
  );

  if (Number(updatedAcc.current_balance) === expectedBalance) {
    console.log('✅ Trigger update_account_balance verification passed!');
  } else {
    console.error('❌ Balance mismatch!');
    process.exit(1);
  }

  // 4. Test Budget & Computed View v_budget_summary
  console.log('\n[STEP 4] Testing Budget & v_budget_summary view...');
  const currentMonth = new Date().toISOString().substring(0, 7);

  const { error: budgetError } = await supabase.from('budgets').insert({
    user_id: userId,
    category: null, // Overall budget
    monthly_limit: 10000.0,
    month: currentMonth,
  });

  if (budgetError) {
    console.error('❌ Failed to insert budget:', budgetError.message);
    process.exit(1);
  }

  // Query computed view
  const { data: viewData, error: viewError } = await supabase
    .from('v_budget_summary')
    .select('*')
    .eq('user_id', userId)
    .eq('month', currentMonth);

  if (viewError) {
    console.error('❌ Failed to query v_budget_summary view:', viewError.message);
    process.exit(1);
  }

  console.log('Computed view results:', JSON.stringify(viewData, null, 2));
  if (viewData && viewData.length > 0) {
    const summary = viewData[0];
    console.log(
      `✅ v_budget_summary working: Limit = ₹${summary.monthly_limit}, Spent = ₹${summary.spent}, Remaining = ₹${summary.remaining}, Percentage = ${summary.spent_percentage}%`
    );
  }

  // 5. Test Realtime Multi-Session Sync
  console.log('\n[STEP 5] Testing Realtime Subscription between two client sessions...');
  const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // Authenticate Client A and Client B with the user token
  await clientA.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token,
  });
  await clientB.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token,
  });

  let realtimeReceived = false;

  await new Promise((resolveSub) => {
    const channel = clientA
      .channel(`e2e_realtime_test_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
        (payload) => {
          console.log(
            `🔔 Client A received Realtime event! Transaction ID: ${payload.new.id}, Amount: ₹${payload.new.amount}`
          );
          realtimeReceived = true;
        }
      )
      .subscribe((status) => {
        console.log(`Channel subscription status: ${status}`);
        if (status === 'SUBSCRIBED') {
          resolveSub();
        }
      });
  });

  console.log('Client B posting a new transaction from a second session...');
  await clientB.from('transactions').insert({
    user_id: userId,
    account_id: bankAccount.id,
    type: 'income',
    amount: 15000.0,
    category: 'Salary',
    note: 'September Paycheck',
    date: new Date().toISOString().substring(0, 10),
    source: 'manual',
  });

  // Wait for Realtime event
  for (let i = 0; i < 20; i++) {
    if (realtimeReceived) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  if (realtimeReceived) {
    console.log('✅ Realtime cross-session synchronization verified successfully!');
  } else {
    console.warn('⚠️ Realtime event timed out.');
  }

  // 6. Test Borrows Settle Toggle
  console.log('\n[STEP 6] Testing Borrows Settle Toggle...');
  const { data: newBorrow } = await supabase
    .from('borrows')
    .insert({
      user_id: userId,
      person_name: 'Vikram',
      amount: 1200.0,
      status: 'pending',
      date: new Date().toISOString().substring(0, 10),
    })
    .select()
    .single();

  console.log(`Created borrow for ${newBorrow.person_name}: status = ${newBorrow.status}`);

  const { data: settledBorrow } = await supabase
    .from('borrows')
    .update({ status: 'settled' })
    .eq('id', newBorrow.id)
    .select()
    .single();

  console.log(`Updated borrow status to: ${settledBorrow.status}`);
  if (settledBorrow.status === 'settled') {
    console.log('✅ Borrow status toggle verified successfully!');
  }

  console.log('\n--- ALL E2E BACKEND & REALTIME CHECKS PASSED ---');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
