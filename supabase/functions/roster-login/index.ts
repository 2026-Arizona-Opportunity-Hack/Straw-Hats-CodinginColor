import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { rosterLogin } from './handler.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const server = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
Deno.serve(request => {
  // verifyOtp mutates client auth state; never reuse that client across learners.
  const sessionClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options);
  return rosterLogin(request, {
    prepare: async (code, passcode) => await server.rpc('prepare_roster_login', { p_class_code: code, p_passcode: passcode }),
    create: (email, rosterId) => server.auth.admin.createUser({ email, email_confirm: true, app_metadata: { cic_roster_id: rosterId } }),
    bind: async (rosterId, code, passcode, profileId) => await server.rpc('bind_roster_login', { p_roster_id: rosterId, p_class_code: code, p_passcode: passcode, p_profile_id: profileId }),
    link: email => server.auth.admin.generateLink({ type: 'magiclink', email }),
    verify: token => sessionClient.auth.verifyOtp({ token_hash: token, type: 'email' }),
    revoke: token => server.auth.admin.signOut(token, 'local'),
  });
});
