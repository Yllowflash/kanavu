/* ============================================================
   Kanavu: Connecting Dreams — backend configuration
   ------------------------------------------------------------
   PHASE 2: auth + invite-code pairing are wired up in index.html
   against this Supabase project. Everything else still runs offline.

   KANAVU_CONFIG.backendReady is now true. The publishable key is
   public by design (it ships in the game's code); Row Level Security
   in the database protects the data. The service_role key must NEVER
   go here or in the repo.
   ============================================================ */

const SUPABASE_URL = "https://ersejxowxutsefalyjaf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lGEyfvUYZqa5B5l5uwNizQ_APQcmK8i";

// Read-only view used by later phases (auth, realtime, storage).
window.KANAVU_CONFIG = Object.freeze({
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  get backendReady() {
    return Boolean(this.SUPABASE_URL && this.SUPABASE_ANON_KEY);
  },
});
