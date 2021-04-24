import { module, test } from 'qunit';
import { visit, currentURL } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import setupCardMocking from '../helpers/card-mocking';
import { setupMirage } from 'ember-cli-mirage/test-support';
import { templateOnlyComponentTemplate } from '@cardstack/core/tests/helpers/templates';

module('Acceptance | card routing', function (hooks) {
  setupApplicationTest(hooks);
  setupMirage(hooks);
  setupCardMocking(hooks);

  hooks.beforeEach(function () {
    // TODO
    this.server.create('space', {
      id: 'home',
      routingCard: 'https://mirage/cards/my-routes',
    });

    this.createCard({
      url: 'https://mirage/cards/my-routes',
      schema: 'schema.js',
      files: {
        'schema.js': `
          export default class MyRoutes {
            routeTo(path) {
              if (path === '/welcome') {
                return 'https://mirage/cards/person';
              }
            }
          }`,
      },
    });

    this.createCard({
      url: 'https://mirage/cards/person',
      schema: 'schema.js',
      isolated: 'isolated.js',
      data: {
        name: 'Arthur',
      },
      files: {
        'schema.js': `
          import { contains } from "@cardstack/types";
          import './isolated.css'
          import string from "https://cardstack.com/base/string";
          export default class Person {
            @contains(string)
            name;
          }`,
        'isolated.js': templateOnlyComponentTemplate(
          `<div class="person-isolated" data-test-person>Hi! I am <@model.name/></div>`
        ),
        'isolated.css': '.person-isolated { background: red }',
      },
    });
  });

  test('visiting /card-routing', async function (assert) {
    await visit('/welcome');
    assert.equal(currentURL(), '/welcome');
    await this.pauseTest();
    assert.dom('[data-test-person]').containsText('Hi! I am Arthur');
  });
});
