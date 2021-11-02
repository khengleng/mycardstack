import { join } from 'path';
import { encodeCardURL } from '@cardstack/core/src/utils';
import { templateOnlyComponentTemplate } from '@cardstack/core/tests/helpers/templates';
import { existsSync } from 'fs-extra';
import { expect } from 'chai';
import { setupServer } from '../../helpers/server';

const REALM = 'https://my-realm';

if (process.env.COMPILER) {
  describe('DELETE /cards/<card-id>', function () {
    function getCard(cardURL: string) {
      return request().get(`/cards/${encodeURIComponent(cardURL)}`);
    }

    function deleteCard(cardURL: string) {
      return request().del(`/cards/${encodeURIComponent(cardURL)}`);
    }

    let { getContainer, getCardService, getCardCache, request } = setupServer(this, { testRealm: REALM });

    this.beforeEach(async function () {
      let cards = await getCardService();
      await cards.create({
        url: `${REALM}/post`,
        schema: 'schema.js',
        isolated: 'isolated.js',
        files: {
          'schema.js': `
            import { contains } from "@cardstack/types";
            import string from "https://cardstack.com/base/string";
            export default class Post {
              @contains(string)
              title;
              @contains(string)
              body;
            }
          `,
          'isolated.js': templateOnlyComponentTemplate('<h1><@fields.title/></h1><article><@fields.body/></article>'),
        },
      });

      await cards.create({
        url: `${REALM}/post0`,
        adoptsFrom: '../post',
        data: {
          title: 'Hello World',
          body: 'First post.',
        },
      });
    });

    it('returns a 404 when trying to delete from a card that doesnt exist', async function () {
      await deleteCard('https://my-realm/car0').expect(404);
    });

    it('can delete an existing card that has no children', async function () {
      await getCard('https://my-realm/post0').expect(200);

      await deleteCard('https://my-realm/post0').expect(204);
      await getCard('https://my-realm/post0').expect(404);

      expect(
        existsSync(join(getCardCache().dir, 'node', encodeCardURL('https://my-realm/post0'))),
        'Cache for card is deleted'
      ).to.be.false;

      // TODO: Can we make getRealm return the corrent realm type?
      let realm = (await getContainer().lookup('realm-manager')).getRealm(REALM);

      expect(existsSync(join(realm.directory, 'post0')), 'card is deleted from realm').to.be.false;
    });
  });
}
