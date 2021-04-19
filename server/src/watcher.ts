import Builder from './builder';
import { glob } from 'glob';
import { rmSync } from 'fs';
import { join } from 'path';
import walkSync from 'walk-sync';
import sane from 'sane';
import { sep } from 'path';
import { RealmConfig } from '@cardstack/core/src/interfaces';

export function cleanCache(dir: string): void {
  console.debug('Cleaning cardCache dir: ' + dir);
  for (let file of glob.sync('**/http*', { cwd: dir })) {
    rmSync(join(dir, file));
  }
}

export async function primeCache(
  realms: RealmConfig[],
  builder: Builder
): Promise<void> {
  let promises = [];

  for (let realm of realms) {
    let cards = walkSync(realm.directory, { globs: ['**/card.json'] });
    for (let cardPath of cards) {
      let fullCardUrl = new URL(cardPath.replace('card.json', ''), realm.url)
        .href;
      console.debug(`--> Priming cache for ${fullCardUrl}`);
      promises.push(builder.buildCard(fullCardUrl));
    }
  }

  await Promise.all(promises);
  console.debug(`--> Cache primed`);
}

export function setupWatchers(realms: RealmConfig[], builder: Builder) {
  return realms.map((realm) => {
    let watcher = sane(realm.directory);
    const handler = (filepath: string /* root: string, stat?: Stats */) => {
      let segments = filepath.split(sep);
      if (segments.length < 2) {
        // top-level files in the realm are not cards, we're assuming all
        // cards are directories under the realm.
        return;
      }
      let url = new URL(segments[0] + '/', realm.url).href;

      console.debug(`!-> rebuilding card ${url}`);

      (async () => {
        try {
          await builder.buildCard(url);
        } catch (err) {
          console.log(err);
        }
      })();
    };
    watcher.on('add', handler);
    watcher.on('change', handler);
    watcher.on('delete', handler);
    return watcher;
  });
}
