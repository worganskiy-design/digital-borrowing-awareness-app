const SUPABASE_URL = "https://casccwtrogtjxugomvmx.supabase.co";
const SUPABASE_KEY = "sb_publishable_BBwesK6QZpHuVhOlWzJVkg_6YHgWQdb";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function setStatus(message) {
  document.getElementById("status").textContent = message;
  window.scrollTo(0, 0); // jump to the top so the message is seen
}

function showScreens(user) {
  document.getElementById("auth-screen").hidden = !!user;
  document.getElementById("app-screen").hidden = !user;
  if (user) document.getElementById("who").textContent = user.email;
  if (user) loadLoans(); // NEW: show the student's loans as soon as they sign in
}

async function signUp() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const { error } = await db.auth.signUp({ email, password });
  setStatus(error ? error.message : "Account created. You can now sign in.");
}

async function signIn() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) { setStatus(error.message); return; }
  setStatus("");
  showScreens(data.user);
}

async function signOut() {
  await db.auth.signOut();
  showScreens(null);
  setStatus("You have signed out.");
}

async function start() {
  const { data } = await db.auth.getSession();
  showScreens(data.session ? data.session.user : null);
}

async function addLoan() {
  // Read each box on the form into one object that matches the loans table
  const loan = {
    lender: document.getElementById("lender").value,
    amount_borrowed: Number(document.getElementById("amount").value),
    fee: Number(document.getElementById("fee").value),
    date_borrowed: document.getElementById("date-borrowed").value,
    due_date: document.getElementById("due-date").value || null // empty date becomes null
  };

  if (!loan.amount_borrowed || !loan.date_borrowed) {
    setStatus("Please enter the amount and the date borrowed.");
    return;
  }

  // user_id is not sent: the database fills it in with the signed-in student's id
  const { error } = await db.from("loans").insert(loan);
  setStatus(error ? error.message : "Loan saved.");

    if (!error) {
    loadLoans(); // NEW: refresh the list so the new loan appears at once
    document.getElementById("amount").value = "";
    document.getElementById("fee").value = 0;
    document.getElementById("date-borrowed").value = "";
    document.getElementById("due-date").value = "";
  }
}

async function loadLoans() {
  // Row Level Security means this returns only the signed-in student's loans
  const { data: loans, error } = await db
    .from("loans").select("*").order("date_borrowed", { ascending: false });
  if (error) { setStatus(error.message); return; }
  const { data: repayments } = await db.from("repayments").select("loan_id, amount");

  const list = document.getElementById("loan-list");
  const dropdown = document.getElementById("repay-loan");
  const rows = [];
  list.innerHTML = "";
  dropdown.innerHTML = "";

  if (loans.length === 0) { list.textContent = "No loans recorded yet."; showSummary([]); return; }

  loans.forEach(loan => {
    // add up the repayments that belong to this loan
    const repaid = (repayments || [])
      .filter(r => r.loan_id === loan.loan_id)
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const owed = Number(loan.amount_borrowed) + Number(loan.fee) - repaid;
    rows.push({ amount: Number(loan.amount_borrowed), fee: Number(loan.fee), owed, due: loan.due_date });

    const card = document.createElement("div");
    card.className = "loan-card";
    const costPct = (Number(loan.fee) / Number(loan.amount_borrowed)) * 100;
card.textContent = `${loan.lender}, borrowed ${loan.date_borrowed}: ${money(loan.amount_borrowed)} + fee ${money(loan.fee)} (${costPct.toFixed(1)}% of the amount) - repaid ${money(repaid)} = ${money(owed)} owed`;
    list.appendChild(card);

    const option = document.createElement("option");
    option.value = loan.loan_id;
    option.textContent = `${loan.lender} ${loan.date_borrowed} (KES ${owed} owed)`;
    dropdown.appendChild(option);
  });
  showSummary(rows);
}

async function addRepayment() {
  const repayment = {
    loan_id: document.getElementById("repay-loan").value,
    amount: Number(document.getElementById("repay-amount").value),
    repayment_date: document.getElementById("repay-date").value
  };
  if (!repayment.loan_id || !repayment.amount || !repayment.repayment_date) {
    setStatus("Please choose a loan and enter the amount and the date.");
    return;
  }
  const { error } = await db.from("repayments").insert(repayment);
  setStatus(error ? error.message : "Repayment saved.");
  if (!error) {
    document.getElementById("repay-amount").value = "";
    document.getElementById("repay-date").value = "";
    loadLoans();
  }
}
// Format a number as shillings, e.g. 12000 becomes "KES 12,000"
function money(n) {
  return "KES " + Math.round(n).toLocaleString("en-KE");
}

async function addFunding() {
  const funding = {
    source: document.getElementById("fund-source").value,
    expected_amount: Number(document.getElementById("fund-amount").value),
    expected_date: document.getElementById("fund-date").value
  };
  if (!funding.expected_amount || !funding.expected_date) {
    setStatus("Please enter the expected amount and the date.");
    return;
  }
  const { error } = await db.from("funding").insert(funding);
  setStatus(error ? error.message : "Expected funds saved.");
  if (!error) {
    document.getElementById("fund-amount").value = "";
    document.getElementById("fund-date").value = "";
    loadLoans(); // reloading also refreshes the summary
  }
}

async function showSummary(rows) {
  const box = document.getElementById("summary");
  box.innerHTML = "";
  const addLine = (text, cls) => {
    const p = document.createElement("p");
    p.textContent = text;
    if (cls) p.className = cls;
    box.appendChild(p);
  };

  // Loans that still have a balance
  const active = rows.filter(r => r.owed > 0);
  const totalOwed = active.reduce((sum, r) => sum + r.owed, 0);
  const totalBorrowed = rows.reduce((sum, r) => sum + r.amount, 0);
  const totalCost = rows.reduce((sum, r) => sum + r.fee, 0);
  const costPct = totalBorrowed ? (totalCost / totalBorrowed) * 100 : 0;

  addLine("Total owed: " + money(totalOwed));
  addLine(`Cost of borrowing so far: ${money(totalCost)} (${costPct.toFixed(1)}% of the amount borrowed)`);

  // The next expected funds are the soonest ones from today onwards
  const today = new Date().toLocaleDateString("en-CA"); // gives YYYY-MM-DD in local time
  const { data: funds } = await db.from("funding").select("*")
    .gte("expected_date", today).order("expected_date", { ascending: true }).limit(1);

  if (!funds || funds.length === 0) {
    addLine("No expected funds recorded. Add the next expected funds to see how much is already due.");
  } else {
    const next = funds[0];
    // Loans with no due date, or a due date on or before the funds date, count as due
    const committed = active
      .filter(r => !r.due || r.due <= next.expected_date)
      .reduce((sum, r) => sum + r.owed, 0);
    const left = Number(next.expected_amount) - committed;

    addLine(`Next expected funds: ${money(next.expected_amount)} from ${next.source} on ${next.expected_date}`);
    addLine("Already due to lenders by then: " + money(committed));
    addLine(left >= 0
      ? "Left after those loans: " + money(left)
      : "The loans due are " + money(-left) + " more than the expected funds.");
  }
  addLine("These figures are estimates from the details you entered. They are not the lender's statement and not financial advice.", "notice");
}

document.getElementById("btn-signin").addEventListener("click", signIn);
document.getElementById("btn-signup").addEventListener("click", signUp);
document.getElementById("btn-signout").addEventListener("click", signOut);
document.getElementById("btn-save-loan").addEventListener("click", addLoan);
document.getElementById("btn-save-repayment").addEventListener("click", addRepayment); // NEW
document.getElementById("btn-save-funding").addEventListener("click", addFunding);
start();