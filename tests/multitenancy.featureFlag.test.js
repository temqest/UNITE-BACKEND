const request = require('supertest');
const app = require('../server');

describe('Multi-tenancy feature flag (smoke)', () => {
  it('exposes health endpoint without tenant context', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

