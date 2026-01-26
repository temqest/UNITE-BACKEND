const { validateExecuteAction } = require('../src/validators/v2.0_eventValidators');

function makeMockReq(body) {
  return { body };
}

function makeMockRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      console.log('Response:', this.statusCode, JSON.stringify(payload));
    }
  };
}

async function runCase(name, body) {
  console.log(`\n[Case] ${name}`);
  const req = makeMockReq(body);
  const res = makeMockRes();
  const next = () => console.log('Next() called, validatedData =', req.validatedData);
  await validateExecuteAction(req, res, next);
}

(async () => {
  await runCase('ACCEPT with empty note', { action: 'accept', note: '' });
  await runCase('CONFIRM without note', { action: 'confirm' });
  await runCase('REJECT with empty note', { action: 'reject', note: '' });
  await runCase('REJECT with note', { action: 'reject', note: 'Not suitable' });
  await runCase('RESCHEDULE missing proposedDate', { action: 'reschedule', note: 'Suggest change' });
  await runCase('RESCHEDULE with proposedDate', { action: 'reschedule', note: 'Suggest change', proposedDate: new Date().toISOString() });
})();
