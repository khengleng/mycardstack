import Koa from 'koa';
import supertest from 'supertest';
import { myOrigin } from '../origin';
import { TestEnv, createTestEnv } from './helpers';
import { testCard } from './test-card';

describe('hub/jsonapi', function() {
  let request: supertest.SuperTest<supertest.Test>;
  let env: TestEnv;

  beforeEach(async function() {
    env = await createTestEnv();
    let app = new Koa();
    let jsonapi = await env.container.lookup('jsonapi-middleware');
    app.use(jsonapi.middleware());
    request = supertest(app.callback());
  });

  afterEach(async function() {
    await env.destroy();
  });

  it('errors correctly for missing post body', async function() {
    let response = await request
      .post('/api/realms/first-ephemeral-realm/cards')
      .set('Content-Type', 'application/vnd.api+json');
    expect(response.status).to.equal(400);
    expect(response.body.errors).has.length(1);
    expect(response.body.errors[0]).property('detail', 'missing resource object');
    expect(response.body.errors[0].source).property('pointer', '/data');
  });

  it('errors correctly for invalid json', async function() {
    let response = await request
      .post('/api/realms/first-ephemeral-realm/cards')
      .set('Content-Type', 'application/vnd.api+json')
      .send('{ data ');
    expect(response.status).to.equal(400);
    expect(response.body.errors).has.length(1);
    expect(response.body.errors[0]).property(
      'detail',
      'error while parsing body: Unexpected token d in JSON at position 2'
    );
  });

  it('errors correctly for local realm on remote-realms endpoint', async function() {
    let response = await request
      .post(`/api/remote-realms/${encodeURIComponent(myOrigin + '/api/realms/first-ephemeral-realm')}/cards`)
      .set('Content-Type', 'application/vnd.api+json')
      .send({
        data: {
          type: 'cards',
        },
      });
    expect(response.status).to.equal(400);
    expect(response.body.errors).has.length(1);
    expect(response.body.errors[0].detail).matches(/is a local realm. You tried to access it/);
  });

  it('can create card', async function() {
    let response = await request
      .post('/api/realms/first-ephemeral-realm/cards')
      .set('Content-Type', 'application/vnd.api+json')
      .send(testCard({ hello: 'world' }).jsonapi);
    expect(response.status).to.equal(201);
    expect(response.header.location).to.match(/http:\/\/[^/]+\/api\/realms\/first-ephemeral-realm\/cards\/[^/]+/);
  });

  it('handles missing card in valid realm', async function() {
    let response = await request
      .get('/api/realms/first-ephemeral-realm/cards/not-a-real-card')
      .set('Accept', 'application/vnd.api+json');
    expect(response.status).to.equal(404);
  });

  it('can get a card from local realm that was created in that realm', async function() {
    let response = await request
      .post('/api/realms/first-ephemeral-realm/cards')
      .set('Content-Type', 'application/vnd.api+json')
      .send(testCard({ hello: 'world' }).jsonapi);
    expect(response.status).to.equal(201);

    response = await request.get(new URL(response.header.location).pathname).set('Accept', 'application/vnd.api+json');
    expect(response.status).to.equal(200);
    expect(response.body?.data?.attributes?.model?.attributes?.hello).to.equal('world');
    expect(response.body?.data?.attributes?.['realm']).to.equal(`${myOrigin}/api/realms/first-ephemeral-realm`);
  });

  it('can get a card from local realm that was created in another realm', async function() {
    let response = await request
      .post('/api/realms/first-ephemeral-realm/cards')
      .set('Content-Type', 'application/vnd.api+json')
      .send(testCard({ originalRealm: 'https://somewhere/else', localId: '432' }, { hello: 'world' }).jsonapi);
    expect(response.status).to.equal(201);

    response = await request.get(new URL(response.header.location).pathname).set('Accept', 'application/vnd.api+json');
    expect(response.status).to.equal(200);
    expect(response.body?.data?.attributes?.model?.attributes?.hello).to.equal('world');
    expect(response.body?.data?.attributes?.['original-realm']).to.equal('https://somewhere/else');
    expect(response.body?.data?.attributes?.['realm']).to.equal(`${myOrigin}/api/realms/first-ephemeral-realm`);
  });

  it('can get a card from remote realm that was created in that realm', async function() {
    let response = await request
      .post(`/api/remote-realms/${encodeURIComponent('http://example.com/api/realms/second-ephemeral-realm')}/cards`)
      .set('Content-Type', 'application/vnd.api+json')
      .send(testCard({ hello: 'world' }).jsonapi);
    expect(response.status).to.equal(201);

    response = await request.get(new URL(response.header.location).pathname).set('Accept', 'application/vnd.api+json');
    expect(response.status).to.equal(200);
    expect(response.body?.data?.attributes?.model?.attributes?.hello).to.equal('world');
    expect(response.body?.data?.attributes?.['realm']).to.equal('http://example.com/api/realms/second-ephemeral-realm');
  });

  it('can get a card from remote realm that was created in another realm', async function() {
    let response = await request
      .post(`/api/remote-realms/${encodeURIComponent('http://example.com/api/realms/second-ephemeral-realm')}/cards`)
      .set('Content-Type', 'application/vnd.api+json')
      .send(testCard({ originalRealm: 'https://somewhere/else', localId: '432' }, { hello: 'world' }).jsonapi);
    expect(response.status).to.equal(201);

    response = await request.get(new URL(response.header.location).pathname).set('Accept', 'application/vnd.api+json');
    expect(response.status).to.equal(200);
    expect(response.body?.data?.attributes?.model?.attributes?.hello).to.equal('world');
    expect(response.body?.data?.attributes?.['original-realm']).to.equal('https://somewhere/else');
    expect(response.body?.data?.attributes?.['realm']).to.equal('http://example.com/api/realms/second-ephemeral-realm');
  });
});