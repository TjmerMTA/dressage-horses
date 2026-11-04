// Admin panel entry: login, the hash router (#/leads, #/horses, #/texts), logout and
// the "unsaved changes" guard.
import { API_CONFIGURED } from "../api-base.js";
import { ApiError, forgetCachedPhotos, isLoggedIn, login, logout, session, setUnauthorizedHandler } from "./api.js";
import { confirmLeaveForm, isHorseFormDirty, markHorseFormClean, renderHorseForm } from "./horse-form.js";
import { renderHorses } from "./horses.js";
import { refreshNewCount, renderLeads, stopLeads } from "./leads.js";
import { hasUnpublished, startPublishWatcher, stopPublishWatcher } from "./publish.js";
import { confirmLeaveTexts, isTextsDirty, renderTexts } from "./texts.js";
import { confirmDialog, h } from "./ui.js";

const $ = (id) => document.getElementById(id);
const view = $("view");
const loginView = $("login-view");
const loginForm = $("login-form");
const password = $("login-password");
const loginError = $("login-error");
const loginReason = $("login-reason");
const loginSubmit = $("login-submit");
const nav = $("adm-nav");
const sessionBox = $("adm-session");

let currentHash = "";
let renderedOnce = false;

function showLogin(reason = "") {
  stopLeads();
  loginView.hidden = false;
  view.hidden = true;
  nav.hidden = true;
  sessionBox.hidden = true;
  loginReason.textContent = reason;
  loginReason.hidden = !reason;
  loginError.textContent = "";
  password.value = "";
  password.focus();
}

function showApp() {
  loginView.hidden = true;
  view.hidden = false;
  nav.hidden = false;
  sessionBox.hidden = false;
  startPublishWatcher();
}

// The Worker answered 401 (session expired or ended elsewhere). Forms keep what was typed:
// after logging in again the same screen is still there and Save can be pressed again.
setUnauthorizedHandler(() => {
  if (!loginView.hidden) return;
  showLogin("Your session has ended (sessions last 12 hours). Please log in again — anything you were typing is still here.");
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  if (!password.value) {
    loginError.textContent = "Please enter the password.";
    password.focus();
    return;
  }
  loginSubmit.disabled = true;
  loginSubmit.textContent = "Logging in…";
  try {
    await login(password.value);
    password.value = "";
    showApp();
    if (!renderedOnce) await route(true);
    else $("main").focus();
    refreshNewCount();
  } catch (err) {
    loginError.textContent = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
    password.select();
  } finally {
    loginSubmit.disabled = false;
    loginSubmit.textContent = "Log in";
  }
});

$("logout").addEventListener("click", async () => {
  const dirty = isHorseFormDirty() || isTextsDirty();
  const pending = hasUnpublished();
  if (dirty || pending) {
    const ok = await confirmDialog({
      title: "Log out?",
      body: [dirty ? "You have changes that are not saved yet; they will be lost." : null,
        pending ? "A saved change is still being published. That continues without you; you just won't see the result here." : null],
      confirmLabel: "Log out", danger: dirty,
    });
    if (!ok) return;
  }
  await logout();
  stopPublishWatcher();
  stopLeads();
  markHorseFormClean();
  forgetCachedPhotos();
  view.replaceChildren(); // nothing of the leads stays on screen
  renderedOnce = false;
  showLogin("You are logged out.");
});

function setActiveNav(section) {
  for (const a of nav.querySelectorAll("a")) {
    if (a.dataset.view === section) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

async function route(force = false) {
  const hash = location.hash || "#/leads";
  if (!force && hash === currentHash) return;
  // Leaving a form with unsaved changes asks first.
  if (currentHash && hash !== currentHash && (isHorseFormDirty() || isTextsDirty())) {
    const ok = isHorseFormDirty() ? await confirmLeaveForm() : await confirmLeaveTexts();
    if (!ok) {
      history.replaceState(null, "", currentHash);
      return;
    }
  }
  currentHash = hash;
  if (!isLoggedIn()) return showLogin();
  renderedOnce = true;
  stopLeads();
  const [, section = "leads", a = "", ...rest] = hash.slice(1).split("/");
  setActiveNav(section);
  const titled = (t) => { document.title = `${t} — Admin — Dressage horses`; };
  if (section === "horses") {
    if (a === "new") { titled("Add a horse"); await renderHorseForm(view, { mode: "new" }); }
    else if ((a === "edit" || a === "duplicate") && rest[0]) { titled(a === "edit" ? "Edit horse" : "Duplicate horse"); await renderHorseForm(view, { mode: a, slug: decodeURIComponent(rest[0]) }); }
    else { titled("Horses"); await renderHorses(view); }
  } else if (section === "texts") {
    titled("Texts");
    await renderTexts(view, [a, ...rest].join("/"));
  } else {
    titled("Leads");
    await renderLeads(view);
  }
  if (!force) $("main").focus({ preventScroll: false });
}

window.addEventListener("hashchange", () => route());
window.addEventListener("beforeunload", (e) => {
  if (isHorseFormDirty() || isTextsDirty()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

if (!API_CONFIGURED) {
  view.replaceChildren(h("p", { class: "adm-err" }, "The panel doesn't know where its server is yet (src/scripts/api-base.js). Ask the developer."));
}
if (isLoggedIn()) {
  showApp();
  route(true);
  refreshNewCount();
} else {
  session.clear();
  showLogin();
}
