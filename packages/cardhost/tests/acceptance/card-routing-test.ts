import { module, test } from 'qunit';
import { visit, currentURL } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import setupBuilder from '../helpers/setup-builder';
import {
  ADDRESS_RAW_CARD,
  PERSON_RAW_CARD,
} from '@cardstack/core/tests/helpers/fixtures';
import { LOCAL_REALM } from 'cardhost/lib/builder';

module('Acceptance | card routing', function (hooks) {
  let personURL = PERSON_RAW_CARD.url;
  let routeCardURL = `${LOCAL_REALM}/my-routes`;

  setupApplicationTest(hooks);
  setupBuilder(hooks, { routingCard: routeCardURL });

  hooks.beforeEach(async function () {
    await this.builder.createRawCard({
      url: routeCardURL,
      schema: 'schema.js',
      files: {
        'schema.js': `
          export default class MyRoutes {
            routeTo(path) {
              if (path === '/welcome') {
                return '${personURL}';
              }
            }
          }`,
      },
    });

    await this.builder.createRawCard(ADDRESS_RAW_CARD);
    await this.builder.createRawCard(
      Object.assign({ data: { name: 'Arthur' } }, PERSON_RAW_CARD)
    );
  });

  test('visiting /card-routing', async function (assert) {
    await visit('/welcome');
    assert.equal(currentURL(), '/welcome');
    assert.equal(
      document.head.querySelector(
        `[data-asset-url="@cardstack/local-realm-compiled/https-cardstack.local-person/isolated.css"]`
      )?.innerHTML,
      '.person-isolated { background: red }'
    );
    assert.dom('[data-test-person]').containsText('Hi! I am Arthur');
  });
});
