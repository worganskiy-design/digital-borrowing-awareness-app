// ------------------------------------------------------------
// Digital Borrowing Awareness App: app.js
// ------------------------------------------------------------

// 1. Connection to Supabase (the publishable key is safe in browser code)
const SUPABASE_URL = "https://casccwtrogtjxugomvmx.supabase.co";
const SUPABASE_KEY = "sb_publishable_BBwesK6QZpHuVhOlWzJVkg_6YHgWQdb";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. Small helper functions used everywhere

function setStatus(message) {
  document.getElementById("status").textContent = message;
  window.scrollTo(0, 0);
}

function money(n) {
  return "KES " + Math.round(n).toLocaleString("en-KE");
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeBar(percent, colourClass) {
  const bar = el("div", "bar");
  const fill = el("div", "bar-fill " + colourClass);
  fill.style.width = Math.max(0, Math.min(100, percent)) + "%";
  bar.appendChild(fill);
  return bar;
}

// 3. Sign in, sign up, consent and sign out

// NEW: show the sign-in box, the terms, or the app, depending on who is signed in
// and whether they have accepted the terms
async function showScreens(user) {
  document.getElementById("auth-screen").hidden = true;
  document.getElementById("terms-screen").hidden = true;
  document.getElementById("app-screen").hidden = true;

  if (!user) {
    document.getElementById("auth-screen").hidden = false;
    return;
  }

  // Row Level Security returns only this student's own profile row, if it exists
  const { data: profile } = await db.from("profiles").select("consent_accepted").maybeSingle();

  if (profile && profile.consent_accepted) {
    document.getElementById("who").textContent = user.email;
    document.getElementById("app-screen").hidden = false;
    loadLoans();
  } else {
    document.getElementById("consent-check").checked = false;
    document.getElementById("terms-screen").hidden = false;
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

// NEW: save the student's consent and its date in the profiles table
async function acceptTerms() {
  if (!document.getElementById("consent-check").checked) {
    setStatus("Please tick the box to accept the terms.");
    return;
  }
  const { data: userData } = await db.auth.getUser();
  const { error } = await db.from("profiles").upsert({
    user_id: userData.user.id,
    consent_accepted: true,
    consent_date: new Date().toISOString()
  });
  if (error) { setStatus(error.message); return; }
  setStatus("");
  showScreens(userData.user);
}

// NEW: a student who declines is signed out and sees no app screens
async function declineTerms() {
  await signOut();
  setStatus("You need to accept the terms to use the app.");
}

// NEW: delete the account and all stored data
async function deleteAccount() {
  const sure = confirm("Delete your account and all your loans, repayments and expected funds? This cannot be undone.");
  if (!sure) return;
  const { error } = await db.rpc("delete_my_account");
  if (error) { setStatus(error.message); return; }
  await db.auth.signOut({ scope: "local" }); // clear the saved login on this phone
  showScreens(null);
  setStatus("Your account and data have been deleted.");
}

// Runs when the page opens: keeps the student signed in after a refresh
async function start() {
  const { data } = await db.auth.getSession();
  showScreens(data.session ? data.session.user : null);
}

// 4. Saving data

async function addLoan() {
  const loan = {
    lender: document.getElementById("lender").value,
    amount_borrowed: Number(document.getElementById("amount").value),
    fee: Number(document.getElementById("fee").value),
    date_borrowed: document.getElementById("date-borrowed").value,
    due_date: document.getElementById("due-date").value || null
  };

  if (!loan.amount_borrowed || !loan.date_borrowed) {
    setStatus("Please enter the amount and the date borrowed.");
    return;
  }

  const { error } = await db.from("loans").insert(loan);
  setStatus(error ? error.message : "Loan saved.");

  if (!error) {
    loadLoans();
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
    loadLoans();
  }
}

// 5. Showing the loans and the summary

async function loadLoans() {
  const { data: loans, error } = await db.from("loans").select("*").order("date_borrowed", { ascending: false });
  if (error) { setStatus(error.message); return; }
  const { data: repayments } = await db.from("repayments").select("loan_id, amount");

  const today = new Date().toLocaleDateString("en-CA");
  const { data: funds } = await db.from("funding").select("*")
    .gte("expected_date", today).order("expected_date", { ascending: true }).limit(1);
  const next = funds && funds.length ? funds[0] : null;

  const list = document.getElementById("loan-list");
  const dropdown = document.getElementById("repay-loan");
  list.innerHTML = "";
  dropdown.innerHTML = "";
  const rows = [];

  loans.forEach(loan => {
    const repaid = (repayments || [])
      .filter(r => r.loan_id === loan.loan_id)
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const amount = Number(loan.amount_borrowed);
    const fee = Number(loan.fee);
    const owed = amount + fee - repaid;
    const repaidPct = (amount + fee) ? (repaid / (amount + fee)) * 100 : 0;
    const costPct = amount ? (fee / amount) * 100 : 0;
    rows.push({ amount, fee, owed, due: loan.due_date });

    let tagText = "No due date", tagClass = "tag-neutral";
    if (owed <= 0) { tagText = "Fully repaid"; tagClass = "tag-ok"; }
    else if (loan.due_date && next) {
      if (loan.due_date <= next.expected_date) { tagText = "Due before funds"; tagClass = "tag-before"; }
      else { tagText = "Due after funds"; tagClass = "tag-after"; }
    } else if (loan.due_date) { tagText = "Due " + loan.due_date; }

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

  const hero = el("div", "hero");
  hero.appendChild(el("p", "hero-label", "Total owed"));
  hero.appendChild(el("p", "hero-number", money(totalOwed)));
  hero.appendChild(el("p", "hero-sub", `Cost so far ${money(totalCost)} (${costPct.toFixed(1)}% of the amount borrowed)`));
  box.appendChild(hero);

  const card = el("div", "card");
  card.appendChild(el("p", "card-title", "Next expected funds"));
  if (!next) {
    card.appendChild(el("p", "small", "No expected funds recorded. Add them to see how much is already due."));
  } else {
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
document.getElementById("btn-accept").addEventListener("click", acceptTerms);
document.getElementById("btn-decline").addEventListener("click", declineTerms);
document.getElementById("btn-delete").addEventListener("click", deleteAccount);
start();