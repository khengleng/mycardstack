import { AddressableCard } from '@cardstack/core/lib/card';
import { BatchIndexUpdate } from './batch';
import { UpstreamDocument, UpstreamIdentity, upstreamIdToCardId } from '@cardstack/core/lib/document';
import { CardInstantiator } from './card-instantiator';

export interface IndexerFactory<Meta> {
  new (realmCard: AddressableCard): Indexer<Meta>;
}

export interface Indexer<Meta> {
  update(meta: Meta, ops: IndexingOperations): Promise<Meta | void>;
}

export class IndexingOperations {
  constructor(private realmCard: AddressableCard, private batch: BatchIndexUpdate, private cards: CardInstantiator) {}

  async save(upstreamId: UpstreamIdentity, doc: UpstreamDocument) {
    let id = upstreamIdToCardId(upstreamId, this.realmCard.csId);
    let card = await this.cards.instantiate(doc.jsonapi, id);
    return await this.batch.save(card);
  }

  async delete(upstreamId: UpstreamIdentity) {
    let id = upstreamIdToCardId(upstreamId, this.realmCard.csId);
    return await this.batch.delete(id);
  }

  async beginReplaceAll() {
    this.batch.createGeneration(this.realmCard.csId);
  }

  async finishReplaceAll() {
    await this.batch.deleteOlderGenerations(this.realmCard.csId);
  }
}