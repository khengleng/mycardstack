import { module, test } from 'qunit';
import { visit, currentURL } from '@ember/test-helpers';
import { setupApplicationTest } from 'ember-qunit';
import setupBuilder from '../helpers/setup-builder';

import click from '@ember/test-helpers/dom/click';
import fillIn from '@ember/test-helpers/dom/fill-in';
import waitFor from '@ember/test-helpers/dom/wait-for';

import {
  ADDRESS_RAW_CARD,
  PERSON_RAW_CARD,
} from '@cardstack/core/tests/helpers/fixtures';

const PERSON = '[data-test-person]';
const MODAL = '[data-test-modal]';
const NEW = '[data-test-new-button-local]';
const SAVE = '[data-test-modal-save]';

module('Acceptance | Card Creation', function (hooks) {
  setupApplicationTest(hooks);
  setupBuilder(hooks);
  let personURL = PERSON_RAW_CARD.url;

  hooks.beforeEach(async function () {
    await this.builder.createRawCard(ADDRESS_RAW_CARD);
    await this.builder.createRawCard(
      Object.assign(
        {
          data: {
            name: 'Arthur',
            birthdate: '2021-05-17',
            address: {
              street: 'Seasame Place',
            },
          },
        },
        PERSON_RAW_CARD
      )
    );
  });

  test('Creating a card', async function (assert) {
    await visit(`/?url=${personURL}`);
    assert.equal(currentURL(), `/?url=${personURL}`);
    await waitFor(PERSON);
    assert.dom(PERSON).hasText('Hi! I am Arthur');

    await click(NEW);
    assert.dom(MODAL).exists('The modal is opened');
    await waitFor('[data-test-field-name="name"]');
    await fillIn('[data-test-field-name="name"]', 'Bob Barker');
    await fillIn('[data-test-field-name="city"]', 'San Francisco');
    await click(SAVE);
    await waitFor(PERSON);
    assert.dom(MODAL).exists('The modal stays open');
    assert
      .dom(PERSON)
      .hasText(
        'Hi! I am Bob Barker',
        'The original instance of the card is updated'
      );
  });
});
