const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getData() {
  const { data: matches, error: mError } = await supabase
    .from("matches")
    .select("*")
    .eq("status", "confirmed")
    .order("created_at", { ascending: true });

  if (mError) {
    console.error("Error matches:", mError);
    return;
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, elo");


    let output = '';
    const log = (str) => { output += str + '\n'; };

    console.log('--- PROFILES (Current State) ---');
    log('--- PROFILES (Current State) ---');
    profiles.forEach(p => log(`${p.username} (${p.id.slice(0,4)}): ${p.elo}`));

    console.log('\n--- CONFIRMED MATCHES ---');
    log('\n--- CONFIRMED MATCHES ---');
    matches.forEach(m => {
        log(`\nMatch #${m.id}`);
        log(`Teams: [${m.team1_p1.slice(0,4)}/${m.team1_p2.slice(0,4)}] vs [${m.team2_p1.slice(0,4)}/${m.team2_p2.slice(0,4)}]`);
        log(`Winner Team: ${m.winner_team}`);
        log('Snapshot: ' + JSON.stringify(m.elo_snapshot, null, 2));
    });

    const fs = require('fs');
    fs.writeFileSync('local_debug_out.txt', output);
    console.log('Wrote to local_debug_out.txt');
}


getData();
