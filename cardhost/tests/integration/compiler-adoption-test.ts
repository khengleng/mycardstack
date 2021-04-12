import { module, test } from 'qunit';
import { setupRenderingTest } from 'ember-qunit';
import { setupMirage } from 'ember-cli-mirage/test-support';
import setupCardMocking from '../helpers/card-mocking';
import Builder from 'cardhost/lib/builder';
import { CompiledCard, RawCard } from '@cardstack/core/src/interfaces';
import { templateOnlyComponentTemplate } from '../helpers/template-compiler';

module('Integration | compiler-adoption', function (hooks) {
  setupRenderingTest(hooks);
  setupMirage(hooks);
  setupCardMocking(hooks);

  let builder: Builder;
  let parentCard: CompiledCard;

  let PERSON_CARD: RawCard = {
    url: 'http://mirage/cards/person',
    files: {
      'schema.js': `
        import { contains } from "@cardstack/types";
        import date from "https://cardstack.com/base/date";
        import string from "https://cardstack.com/base/string";
        export default class Person {
          @contains(string)
          name;

          @contains(date)
          birthdate;
        }`,
      'embedded.js': templateOnlyComponentTemplate(
        `<@model.name/> was born on <@model.birthdate/>`
      ),
    },
  };

  hooks.beforeEach(async function () {
    builder = new Builder({});

    this.createCard(PERSON_CARD);

    parentCard = await builder.getCompiledCard('http://mirage/cards/person');
  });

  module('fields', async function (/*hooks*/) {
    test('a blank card can adopt fields from a card', async function (assert) {
      let card = {
        url: 'http://mirage/cards/user',
        files: {
          'schema.js': `
          import { adopts } from "@cardstack/types";
          import Person from "http://mirage/cards/person";

          export default @adopts(Person) class User {}
      `,
        },
      };
      this.createCard(card);

      let compiled = await builder.getCompiledCard(card.url);
      assert.deepEqual(Object.keys(compiled.fields), ['name', 'birthdate']);
      assert.deepEqual(compiled.adoptsFrom, parentCard);
      assert.equal(
        compiled.templateModules.embedded.moduleName,
        parentCard.templateModules.embedded.moduleName,
        'It reports the module name for the template that it adopts'
      );
    });

    test('A child card can add a field', async function (assert) {
      let card = {
        url: 'http://mirage/cards/user',
        files: {
          'schema.js': `
          import { adopts, contains } from "@cardstack/types";
          import Person from "http://mirage/cards/person";
          import string from "https://cardstack.com/base/string";

          export default @adopts(Person) class User {
            @contains(string)
            username
          }
      `,
        },
      };
      this.createCard(card);

      let compiled = await builder.getCompiledCard(card.url);
      assert.deepEqual(Object.keys(compiled.fields), [
        'username',
        'name',
        'birthdate',
      ]);
    });

    test('A child card can NOT overwrite an existing field', async function (assert) {
      let card = {
        url: 'http://mirage/cards/user',
        files: {
          'schema.js': `
          import { adopts, contains } from "@cardstack/types";
          import Person from "http://mirage/cards/person";
          import string from "https://cardstack.com/base/string";

          export default @adopts(Person) class User {
            @contains(string)
            birthdate
          }
      `,
        },
      };

      this.createCard(card);
      assert.expect(1);
      try {
        await builder.getCompiledCard(card.url);
      } catch (err) {
        assert.equal(
          'Field collision on birthdate with parent card http://mirage/cards/person',
          err.message
        );
      }
    });

    test('A child card can NOT overwrite an existing field, even from a grandparent', async function (assert) {
      this.createCard({
        url: 'http://mirage/cards/user',
        files: {
          'schema.js': `
          import { adopts, contains } from "@cardstack/types";
          import Person from "http://mirage/cards/person";
          import string from "https://cardstack.com/base/string";

          export default @adopts(Person) class User {
            @contains(string)
            username
          }`,
        },
      });

      let card = {
        url: 'http://mirage/cards/admin',
        files: {
          'schema.js': `
          import { adopts, contains } from "@cardstack/types";
          import User from "http://mirage/cards/user";
          import string from "https://cardstack.com/base/string";

          export default @adopts(User) class Admin {
            @contains(string)
            name
          }
      `,
        },
      };

      this.createCard(card);
      assert.expect(1);
      try {
        await builder.getCompiledCard(card.url);
      } catch (err) {
        assert.equal(
          'Field collision on name with parent card http://mirage/cards/user',
          err.message
        );
      }
    });
  });

  module('templates', async function (/*hooks*/) {
    test('a child card inherits a parent card template', async function (assert) {
      let card = {
        url: 'http://mirage/cards/user',
        files: {
          'schema.js': `
            import { adopts } from "@cardstack/types";
            import Person from "http://mirage/cards/person";

            export default @adopts(Person) class User {}
        `,
        },
      };
      this.createCard(card);

      let compiledCard = await builder.getCompiledCard(card.url);
      assert.equal(
        compiledCard.templateModules.embedded.moduleName,
        `${PERSON_CARD.url}/embedded`
      );
    });

    test('a child card inherits a grandparent card template, when it and parent do not have templates', async function (assert) {
      this.createCard({
        url: 'http://mirage/cards/user',
        files: {
          'schema.js': `
          import { adopts, contains } from "@cardstack/types";
          import Person from "http://mirage/cards/person";
          import string from "https://cardstack.com/base/string";

          export default @adopts(Person) class User {
            @contains(string)
            username
          }`,
        },
      });
      let card = {
        url: 'http://mirage/cards/admin',
        files: {
          'schema.js': `
            import { adopts } from "@cardstack/types";
            import User from "http://mirage/cards/user";

            export default @adopts(User) class Admin {}
        `,
        },
      };
      this.createCard(card);

      let compiledCard = await builder.getCompiledCard(card.url);
      assert.equal(
        compiledCard.templateModules.embedded.moduleName,
        `${PERSON_CARD.url}/embedded`
      );
    });
  });

  module('errors', function () {
    test('@adopts cannot be used on a class property', async function (assert) {
      assert.expect(1);
      let card = {
        url: 'http://mirage/cards/admin',
        files: {
          'schema.js': `
            import { adopts } from "@cardstack/types";
            import Person from "http://mirage/cards/person";

            export default class Admin {
              @adopts(Person)
              user
            }
        `,
        },
      };

      this.createCard(card);
      try {
        await builder.getCompiledCard(card.url);
      } catch (err) {
        assert.ok(
          /@adopts decorator can only be used on a class/.test(err.message),
          err.message
        );
      }
    });

    test('@adopts only accepts 1 argument', async function (assert) {
      assert.expect(1);
      let card = {
        url: 'http://mirage/cards/admin',
        files: {
          'schema.js': `
            import { adopts } from "@cardstack/types";
            import Person from "http://mirage/cards/person";

            export default @adopts(Person, true) class Admin {}
        `,
        },
      };
      this.createCard(card);

      try {
        await builder.getCompiledCard(card.url);
      } catch (err) {
        assert.ok(
          /@adopts decorator accepts exactly one argument/.test(err.message),
          err.message
        );
      }
    });

    test('@adopts with wrong argument syntax', async function (assert) {
      assert.expect(1);
      let card = {
        url: 'http://mirage/cards/admin',
        files: {
          'schema.js': `
            import { adopts } from "@cardstack/types";

            export default @adopts('Person') class Admin {}
        `,
        },
      };
      this.createCard(card);

      try {
        await builder.getCompiledCard(card.url);
      } catch (err) {
        assert.ok(
          /@adopts argument must be an identifier/.test(err.message),
          err.message
        );
      }
    });

    test('@adopts doesnt accept undefined arguments', async function (assert) {
      assert.expect(1);
      let card = {
        url: 'http://mirage/cards/admin',
        files: {
          'schema.js': `
            import { adopts } from "@cardstack/types";

            export default @adopts(Person) class Admin {}
        `,
        },
      };
      this.createCard(card);

      try {
        await builder.getCompiledCard(card.url);
      } catch (err) {
        assert.ok(
          /@adopts argument is not defined/.test(err.message),
          err.message
        );
      }
    });

    test('@adopts argument must be imported', async function (assert) {
      assert.expect(1);
      let card = {
        url: 'http://mirage/cards/admin',
        files: {
          'schema.js': `
            import { adopts } from "@cardstack/types";
            const Person = 'person'

            export default @adopts(Person) class Admin {}
        `,
        },
      };
      this.createCard(card);

      try {
        await builder.getCompiledCard(card.url);
      } catch (err) {
        assert.ok(
          /@adopts argument must come from a module default export/.test(
            err.message
          ),
          err.message
        );
      }
    });
  });
});
