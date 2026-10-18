// Copies lib/logic.js into the alert server (Supabase Edge Function) so the
// app screen and phone alerts always run the exact same logic.
// Run after changing lib/logic.js:  npm run sync:edge
// Then redeploy the function (see README, "Phone alerts server").
import { copyFileSync } from 'node:fs';

copyFileSync('lib/logic.js', 'supabase/functions/check-overdue/logic.js');
console.log('Copied lib/logic.js -> supabase/functions/check-overdue/logic.js');
