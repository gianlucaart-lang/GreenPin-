
import { createClient } from 'https://esm.sh/@supabase/supabase-js@^2.45.0';

// URL derivato dal riferimento del progetto contenuto nella tua chiave
const SUPABASE_URL = 'https://wrwfqaqbskdfnthfoqqy.supabase.co';

// La tua chiave anonima pubblica
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indyd2ZxYXFic2tkZm50aGZvcXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNzUwMjEsImV4cCI6MjA4Njk1MTAyMX0.NxH2-JQXaxLiKX_vK6elXZBrWNeP3lAe0_lZ-1WBhLA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
