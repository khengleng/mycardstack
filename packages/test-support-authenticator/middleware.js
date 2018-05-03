const { declareInjections } = require('@cardstack/di');

module.exports = declareInjections({
  searcher: 'hub:searchers',
  sessions: 'hub:sessions'
},

class TestAuthenticator {
  constructor() {
    this.userId = 'the-default-test-user';
  }
  get category() {
    return 'authentication';
  }
  middleware() {
    let self = this;
    return async (ctxt, next) => {
      if (self.userId != null) {
        ctxt.state.cardstackSession = this.sessions.create('test-users', self.userId);
      }
      await next();
    };
  }
});
