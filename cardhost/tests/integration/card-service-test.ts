import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import type Cards from 'cardhost/services/cards';
import setupCardMocking, { createCard } from '../helpers/card-mocking';
import { Compiler } from '@cardstack/core';

module('Integration | card-service', function (hooks) {
  setupRenderingTest(hooks);
  setupCardMocking(hooks);

  let cards: Cards;
  hooks.beforeEach(function () {
    cards = this.owner.lookup('service:cards');
  });

  test('compiled-cards dynamic import example', async function (assert) {
    let target = 'hello';
    this.set('hello', (await import(`@cardstack/compiled/${target}`)).default);

    await render(
      hbs`{{#let (ensure-safe-component this.hello) as |Hello|}} <Hello /> {{/let}}`
    );
    assert.dom(this.element).containsText('Hello world');
  });

  module('hello world', function (hooks) {
    hooks.beforeEach(function () {
      createCard({
        url: 'http://mirage/cards/hello',
        'schema.js': `
          import { contains } from "@cardstack/types";
          import string from "https://cardstack.com/base/models/string";
          export default class Hello {
            @contains(string)
            greeting;
          }
        `,
        'isolated.hbs': `<h1>{{this.greeting}}</h1>`,
      });
    });

    test(`load an isolated card's component`, async function (assert) {
      this.server.get('cards/hello?format=isolated', (schema, request) => {
        debugger;
      });
      let { component } = await cards.load(
        'http://mirage/cards/hello',
        'isolated'
      );
      this.set('component', component);
      await render(hbs`<this.component/>`);
      assert.dom(this.element).containsText('Hello world');
    });

    test(`load an isolated card's model`, async function (assert) {
      let { model } = await cards.load('http://mirage/cards/hello', 'isolated');
      assert.deepEqual(model, { title: 'Hello world' });
    });
  });
});
