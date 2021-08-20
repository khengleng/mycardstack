import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { find, render, waitUntil } from '@ember/test-helpers';
import hbs from 'htmlbars-inline-precompile';

import { PrepaidCardSafe } from '@cardstack/cardpay-sdk/sdk/safes';
import { setupMirage } from 'ember-cli-mirage/test-support';
import { MirageTestContext } from 'ember-cli-mirage/test-support';
import { Response as MirageResponse } from 'ember-cli-mirage';

interface Context extends MirageTestContext {}

module(
  'Integration | Component | card-pay/prepaid-card-safe',
  function (hooks) {
    setupRenderingTest(hooks);
    setupMirage(hooks);

    const PREPAID_CARD_SAFE = {
      address: '0xF848D5873Df8FFaedae778f9F090140B667A2aD7',
      createdAt: 1627981520,
      tokens: [
        {
          balance: '1000000000000000000',
          tokenAddress: '0xB236ca8DbAB0644ffCD32518eBF4924ba866f7Ee',
          token: {
            name: 'CARD Token Kovan.CPXD',
            symbol: 'CARD',
            decimals: 2,
          },
        },
        {
          balance: '4990019960079840419',
          tokenAddress: '0xFeDc0c803390bbdA5C4C296776f4b574eC4F30D1',
          token: {
            name: 'Dai Stablecoin.CPXD',
            symbol: 'DAI',
            decimals: 2,
          },
        },
      ],
      owners: [
        '0xc9Cdb5EeD1c27fCc64DA096CA3b0bcc02c1d45C2',
        '0xEba6d63dDf30174B87272D5cF566D63547e60119',
      ],
      type: 'prepaid-card',
      customizationDID:
        'did:cardstack:1ph2NRppy5eeszY4j8H9Tud520052ce6211bd3a9',
      spendFaceValue: 500,
      issuingToken: '0xFeDc0c803390bbdA5C4C296776f4b574eC4F30D1',
      owner: {
        id: '0xc9Cdb5EeD1c27fCc64DA096CA3b0bcc02c1d45C2',
      },
      reloadable: false,
      spendBalance: '500',
      prepaidCardOwner: '0xc9Cdb5EeD1c27fCc64DA096CA3b0bcc02c1d45C2',
      hasBeenUsed: false,
      issuer: '0xc9Cdb5EeD1c27fCc64DA096CA3b0bcc02c1d45C2',
      transferrable: true,
    } as PrepaidCardSafe;

    const JSON_API = {
      data: {
        id: '81d2d5f4-ec30-4ccc-9a6e-dc728c0d0784',
        type: 'prepaid-card-customizations',
        attributes: {
          did: 'did:cardstack:1ph2NRppy5eeszY4j8H9Tud520052ce6211bd3a9',
          'issuer-name': 'Luke and Michael',
          'owner-address': '0xc9Cdb5EeD1c27fCc64DA096CA3b0bcc02c1d45C2',
        },
        relationships: {
          pattern: {
            data: {
              id: '7b93fae4-843d-409a-87e0-b065b63c1156',
              type: 'prepaid-card-patterns',
            },
          },
          'color-scheme': {
            data: {
              id: '5c2276be-fddd-49dd-9693-d7b3b3e91a1f',
              type: 'prepaid-card-color-schemes',
            },
          },
        },
      },
      included: [
        {
          id: '5c2276be-fddd-49dd-9693-d7b3b3e91a1f',
          type: 'prepaid-card-color-schemes',
          attributes: {
            background: 'linear-gradient(139.27deg, #c3fc33 16%, #0069f9 100%)',
            'pattern-color': 'white',
            'text-color': 'black',
            description: 'Green to Blue Gradient',
          },
        },
        {
          id: '7b93fae4-843d-409a-87e0-b065b63c1156',
          type: 'prepaid-card-patterns',
          attributes: {
            'pattern-url': '/images/backgrounds/mock-theme-1.svg',
            description: 'Overlapping Dots',
          },
        },
      ],
    };

    test('it displays the correct data', async function (this: Context, assert) {
      this.server.get(
        'https://storage.cardstack.com/prepaid-card-customization/h2NRppy5eeszY4j8H9Tud5.json',
        () => {
          return JSON_API;
        }
      );
      this.set('prepaidCardSafe', PREPAID_CARD_SAFE);
      await render(hbs`
        <CardPay::PrepaidCardSafe
          @safe={{this.prepaidCardSafe}}
        />
      `);
      await waitUntil(() => {
        let issuerNameEl = find('[data-test-prepaid-card-issuer-name]');
        return (
          issuerNameEl && issuerNameEl.textContent!.includes('Luke and Michael')
        );
      });
      assert.dom('.prepaid-card__address').containsText('0xF848...2aD7');
      assert.dom('[data-test-prepaid-card-balance]').containsText('§500');
      assert
        .dom('[data-test-prepaid-card-usd-balance]')
        .containsText('$5.00 USD');
      assert
        .dom(
          '[data-test-prepaid-card-pattern="/images/backgrounds/mock-theme-1.svg"]'
        )
        .exists();
      assert
        .dom(
          '[data-test-prepaid-card-background="linear-gradient(139.27deg, #c3fc33 16%, #0069f9 100%)"]'
        )
        .exists();
    });

    test('it retries the card customization service if it fails when @waitForCustomization is true', async function (this: Context, assert) {
      let attemptNum = 0;
      this.server.get(
        'https://storage.cardstack.com/prepaid-card-customization/h2NRppy5eeszY4j8H9Tud5.json',
        () => {
          attemptNum++;
          if (attemptNum < 3) {
            return new MirageResponse(404, {}, 'Not found');
          }
          return JSON_API;
        }
      );
      this.set('prepaidCardSafe', PREPAID_CARD_SAFE);
      await render(hbs`
        <CardPay::PrepaidCardSafe
          @safe={{this.prepaidCardSafe}}
          @waitForCustomization={{true}}
        />
      `);
      await waitUntil(() => {
        let issuerNameEl = find('[data-test-prepaid-card-issuer-name]');
        return (
          issuerNameEl && issuerNameEl.textContent!.includes('Luke and Michael')
        );
      });
      assert
        .dom('[data-test-prepaid-card-issuer-name]')
        .containsText('Luke and Michael');
      assert.dom('.prepaid-card__address').containsText('0xF848...2aD7');
      assert.dom('[data-test-prepaid-card-balance]').containsText('§500');
      assert
        .dom('[data-test-prepaid-card-usd-balance]')
        .containsText('$5.00 USD');
      assert
        .dom(
          '[data-test-prepaid-card-pattern="/images/backgrounds/mock-theme-1.svg"]'
        )
        .exists();
      assert
        .dom(
          '[data-test-prepaid-card-background="linear-gradient(139.27deg, #c3fc33 16%, #0069f9 100%)"]'
        )
        .exists();
    });
  }
);
