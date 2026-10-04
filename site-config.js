/*
 * SURUKO — site configuration
 * Edit only this file for business settings.
 * Airtable token is now secure in Cloudflare Worker — do not add it here.
 */
window.SURUKO_CONFIG = {

  /* ── Contact ─────────────────────────────────────────────────── */
  contactEmail:        "hello@suruko.in",
  whatsappNumber:      "919344240701",
  contactPhoneDisplay: "+91 93442 40701",
  proprietorName:      "Sanjay Kumar Ganeshkumar",
  serviceArea:         "Chennai, Tamil Nadu",

  /* ── Social ──────────────────────────────────────────────────── */
  instagramUrl: "https://www.instagram.com/suruko.official/",
  xUrl:         "https://x.com/withsuruko",

  /* ── Worker age range ────────────────────────────────────────── */
  workerAgeMin: 18,
  workerAgeMax: 35,

  /* ── Offline retry ───────────────────────────────────────────── */
  pendingLeadMaxAgeHours: 24
};
