const SUPABASE_URL = "https://casccwtrogtjxugomvmx.supabase.co";
const SUPABASE_KEY = "sb_publishable_BBwesK6QZpHuVhOlWzJVkg_6YHgWQdb";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function setStatus(message) {
  document.getElementById("status").textContent = message;
}

function showScreens(user) {
  document.getElementById("auth-screen").hidden = !!user;
  document.getElementById("app-screen").hidden = !user;
  if (user) document.getElementById("who").textContent = user.email;
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

document.getElementById("btn-signin").addEventListener("click", signIn);
document.getElementById("btn-signup").addEventListener("click", signUp);
document.getElementById("btn-signout").addEventListener("click", signOut);
start();