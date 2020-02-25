import Service from '@ember/service';

import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { restartableTask, enqueueTask } from 'ember-concurrency-decorators';
import { timeout } from 'ember-concurrency';
import ENV from '@cardstack/cardhost/config/environment';

const { autosaveDebounce, autosaveDisabled, environment } = ENV;
const AUTOSAVE_DEBOUNCE = 5000;

export default class AutosaveService extends Service {
  @service data;
  @tracked model;
  @tracked hasError;

  // These are properties of the service so that we can change them to true for service-specific tests.
  autosaveDisabled = autosaveDisabled;
  autosaveDebounce = autosaveDebounce || AUTOSAVE_DEBOUNCE;

  @enqueueTask
  *setCardModel(model) {
    if (this.debounceAndSave.isRunning && this.saveCard.isIdle) {
      this.debounceAndSave.last.cancel();
      yield this.saveCard.perform();
      this.model = model;
    } else if (this.debounceAndSave.isRunning && this.saveCard.isRunning) {
      yield this.saveCard.last.then();
      this.model = model;
    } else {
      this.model = model;
    }
  }

  bindCardUpdated(cardUpdatedFn) {
    this.cardUpdated = cardUpdatedFn;
  }

  get isDirty() {
    return this.model ? this.model.isDirty : undefined;
  }

  get card() {
    return this.model ? this.model.card : undefined;
  }

  // This task needs to be queued, otherwise we will get
  // 409 conflicts with the `/meta/version`
  @enqueueTask
  *saveCard() {
    this.statusMsg = null;

    try {
      if (!this.card) {
        throw new Error(`autosave service was never initialized with a card model when card route was entered`);
      }
      let savedCard = yield this.data.save(this.card);
      this.cardUpdated(savedCard, false);
    } catch (e) {
      console.error(e); // eslint-disable-line no-console
      this.hasError = true;
      this.statusMsg = `card ${this.card.csTitle} was NOT successfully created: ${e.message}`;
      return;
    }
  }

  @restartableTask
  *debounceAndSave() {
    yield this.setCardModel.last.then();
    // The maximum frequency of save requests is enforced here
    yield timeout(this.autosaveDebounce);
    yield this.saveCard.perform();
  }

  @action
  kickoff() {
    this.hasError = false; // if there's an error and a user switches cards, wipe out error state

    if (environment === 'test' && this.autosaveDisabled) {
      return;
    }

    if (this.cardUpdated && this.card && this.isDirty && !this.autosaveDisabled) {
      this.debounceAndSave.perform();
    }
  }
}