// ------------------------------------------------------------
// Digital Borrowing Awareness App: app.js
// ------------------------------------------------------------

// 1. Connection to Supabase (the publishable key is safe in browser code)
const SUPABASE_URL = "https://casccwtrogtjxugomvmx.supabase.co";
const SUPABASE_KEY = "sb_publishable_BBwesK6QZpHuVhOlWzJVkg_6YHgWQdb";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Small helper functions used everywhere

// Show a message under the heading and jump to the top so it is seen
function setStatus(message) {
  document.getElementById("status").textContent = message;
  window.scrollTo(0, 0);
}

// Format a number as shillings, e.g. 12000 becomes "KES 12,000"
function money(n) {
  return "KES " + Math.round(n).toLocaleString("en-KE");
}

// Make an element with a CSS class and some text
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Make a progress bar. percent runs from 0 to 100, colourClass picks the colour
function makeBar(percent, colourClass) {
  const bar = el("div", "bar");
  const fill = el("div", "bar-fill " + colourClass);
  fill.style.width = Math.max(0, Math.min(100, percent)) + "%"; // keep between 0 and 100
  bar.appendChild(fill);
  return bar;
}

// 3. Sign in, sign up and sign out

// Show either the sign-in box or the signed-in page
function showScreens(user) {
  document.getElementById("auth-screen").hidden = !!user;
  document.getElementById("app-screen").hidden = !user;
  if (user) {
    document.getElementById("who").textContent = user.email;
    loadLoans(); // show the student's loans as soon as they sign in
  }
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

// Runs when the page opens: keeps the student signed in after a refresh
async function start() {
  const { data } = await db.auth.getSession();
  showScreens(data.session ? data.session.user : null);
}

// 4. Saving data

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
    loadLoans(); // refresh the list so the new loan appears at once
    document.getElementById("amount").value = "";
    document.getElementById("fee").value = 0;
    document.getElementById("date-borrowed").value = "";
    document.getElementById("due-date").value = "";
  }
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

// 5. Showing the loans and the summary

async function loadLoans() {
  // Row Level Security means each query returns only this student's rows
  const { data: loans, error } = await db.from("loans").select("*").order("date_borrowed", { ascending: false });
  if (error) { setStatus(error.message); return; }
  const { data: repayments } = await db.from("repayments").select("loan_id, amount");

  // the soonest expected funds from today onwards
  const today = new Date().toLocaleDateString("en-CA"); // gives YYYY-MM-DD
  const { data: funds } = await db.from("funding").select("*")
    .gte("expected_date", today).order("expected_date", { ascending: true }).limit(1);
  const next = funds && funds.length ? funds[0] : null;

  const list = document.getElementById("loan-list");
  const dropdown = document.getElementById("repay-loan");
  list.innerHTML = "";
  dropdown.innerHTML = "";
  const rows = []; // the numbers for each loan, used by the summary

  loans.forEach(loan => {
    // add up the repayments that belong to this loan
    const repaid = (repayments || [])
      .filter(r => r.loan_id === loan.loan_id)
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const amount = Number(loan.amount_borrowed);
    const fee = Number(loan.fee);
    const owed = amount + fee - repaid;
    const repaidPct = (amount + fee) ? (repaid / (amount + fee)) * 100 : 0;
    const costPct = amount ? (fee / amount) * 100 : 0;
    rows.push({ amount, fee, owed, due: loan.due_date });

    // choose the neutral due tag
    let tagText = "No due date", tagClass = "tag-neutral";
    if (owed <= 0) { tagText = "Fully repaid"; tagClass = "tag-ok"; }
    else if (loan.due_date && next) {
      if (loan.due_date <= next.expected_date) { tagText = "Due before funds"; tagClass = "tag-before"; }
      else { tagText = "Due after funds"; tagClass = "tag-after"; }
    } else if (loan.due_date) { tagText = "Due " + loan.due_date; }

    // build the card piece by piece
    const card = el("div", "loan-card");
    const top = el("div", "row");
    top.appendChild(el("span", "lender", loan.lender));
    top.appendChild(el("span", "tag " + tagClass, tagText));
    card.appendChild(top);
    card.appendChild(el("p", "owed", money(Math.max(owed, 0)) + " owed"));
    card.appendChild(makeBar(repaidPct, "fill-green"));
    card.appendChild(el("p", "small", `Repaid ${Math.round(repaidPct)}% · Cost ${money(fee)} (${costPct.toFixed(1)}% of the amount)`));
    card.appendChild(el("p", "small", `Borrowed ${money(amount)} on ${loan.date_borrowed}`));
    list.appendChild(card);

    // add the loan to the repayment dropdown
    const option = document.createElement("option");
    option.value = loan.loan_id;
    option.textContent = `${loan.lender} ${loan.date_borrowed} (${money(owed)} owed)`;
    dropdown.appendChild(option);
  });

  if (loans.length === 0) list.appendChild(el("p", "small", "No loans recorded yet."));
  renderSummary(rows, next);
}

function renderSummary(rows, next) {
  const box = document.getElementById("summary");
  box.innerHTML = "";

  const active = rows.filter(r => r.owed > 0);
  const totalOwed = active.reduce((sum, r) => sum + r.owed, 0);
  const totalBorrowed = rows.reduce((sum, r) => sum + r.amount, 0);
  const totalCost = rows.reduce((sum, r) => sum + r.fee, 0);
  const costPct = totalBorrowed ? (totalCost / totalBorrowed) * 100 : 0;

  // the large blue card at the top
  const hero = el("div", "hero");
  hero.appendChild(el("p", "hero-label", "Total owed"));
  hero.appendChild(el("p", "hero-number", money(totalOwed)));
  hero.appendChild(el("p", "hero-sub", `Cost so far ${money(totalCost)} (${costPct.toFixed(1)}% of the amount borrowed)`));
  box.appendChild(hero);

  // the next funds card with its bar
  const card = el("div", "card");
  card.appendChild(el("p", "card-title", "Next expected funds"));
  if (!next) {
    card.appendChild(el("p", "small", "No expected funds recorded. Add them to see how much is already due."));
  } else {
    // loans with no due date, or due on or before the funds date, count as already due
    const committed = active
      .filter(r => !r.due || r.due <= next.expected_date)
      .reduce((sum, r) => sum + r.owed, 0);
    const fundsAmount = Number(next.expected_amount);
    const pct = fundsAmount ? (committed / fundsAmount) * 100 : 0;
    const left = fundsAmount - committed;

    card.appendChild(el("p", "small", `${next.source}, ${next.expected_date}: ${money(fundsAmount)}`));
    card.appendChild(makeBar(pct, "fill-blue"));
    const row = el("div", "row");
    row.appendChild(el("span", "small", "Due by then " + money(committed)));
    row.appendChild(el("span", "small", left >= 0 ? "Left " + money(left) : "Short by " + money(-left)));
    card.appendChild(row);
  }
  box.appendChild(card);
  box.appendChild(el("p", "notice", "These figures are estimates from the details you entered. They are not the lender's statement and not financial advice."));
}

// 6. Connect the buttons to the functions (keep start() last)
document.getElementById("btn-signin").addEventListener("click", signIn);
document.getElementById("btn-signup").addEventListener("click", signUp);
document.getElementById("btn-signout").addEventListener("click", signOut);
document.getElementById("btn-save-loan").addEventListener("click", addLoan);
document.getElementById("btn-save-repayment").addEventListener("click", addRepayment);
document.getElementById("btn-save-funding").addEventListener("click", addFunding);
start();