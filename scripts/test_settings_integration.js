/*
  Simple integration test script for settings persistence and validation.

  Usage (PowerShell):
    $env:API_BASE='http://localhost:3000'
    $env:ADMIN_EMAIL='admin@example.com'
    $env:ADMIN_PASSWORD='password'
    node .\scripts\test_settings_integration.js

  The script will:
    - Login as admin to /api/auth/login (expects JSON { email, password })
    - POST /api/settings to update settings (block a specific date)
    - POST /api/requests/validate with a request having Start_Date equal to the blocked date
    - Print results and exit with non-zero code on failure

  Note: Ensure the server is running and accessible, and the admin credentials are valid.
*/

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Please set ADMIN_EMAIL and ADMIN_PASSWORD environment variables');
  process.exit(2);
}

(async () => {
  try {
    console.log('[test] logging in...');
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const loginBody = await loginRes.json();
    if (!loginRes.ok) {
      console.error('[test] login failed', loginBody);
      process.exit(3);
    }
    const token = loginBody.token;
    console.log('[test] login OK, token length=', token ? token.length : 0);

    // Prepare a blocked date (tomorrow)
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(0,0,0,0);
    const iso = d.toISOString().slice(0,10);

    console.log('[test] blocking date', iso);

    // Update settings
    const payload = { blockedDates: [iso] };
    const setRes = await fetch(`${API_BASE}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload)
    });
    const setBody = await setRes.json();
    if (!setRes.ok) {
      console.error('[test] failed to update settings', setBody);
      process.exit(4);
    }
    console.log('[test] settings updated on server');

    // Now validate a request that uses the blocked date
    const eventData = {
      Start_Date: iso,
      Location: 'Test Location',
      categoryType: 'Advocacy'
    };

    const valRes = await fetch(`${API_BASE}/api/requests/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ coordinatorId: 'ADMIN_TEST', eventData })
    });
    const valBody = await valRes.json();
    console.log('[test] validate response:', valRes.status, valBody);

    if (valRes.ok) {
      if (valBody && valBody.validation && valBody.validation.isValid === false) {
        console.log('[test] validation failed as expected for blocked date');
        process.exit(0);
      } else if (valBody && valBody.validation && valBody.validation.isValid === true) {
        console.error('[test] validation unexpectedly passed for blocked date');
        process.exit(5);
      } else {
        // Fallback: if API returns generic object with errors
        if (Array.isArray(valBody.errors) && valBody.errors.length > 0) {
          console.log('[test] validation returned errors as expected', valBody.errors);
          process.exit(0);
        }
        console.warn('[test] validation response unexpected', valBody);
        process.exit(6);
      }
    } else {
      console.error('[test] validate request failed', valBody);
      process.exit(7);
    }

  } catch (e) {
    console.error('[test] unexpected error', e);
    process.exit(1);
  }
})();
