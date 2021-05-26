import { transformSync } from '@babel/core';
// @ts-ignore
import decoratorsPlugin from '@babel/plugin-proposal-decorators';
// @ts-ignore
import classPropertiesPlugin from '@babel/plugin-proposal-class-properties';
import difference from 'lodash/difference';
import intersection from 'lodash/intersection';
import reduce from 'lodash/reduce';
import md5 from 'md5';

import cardSchemaPlugin, {
  FieldsMeta,
  getMeta,
  PluginMeta,
} from './babel/card-schema-plugin';
import cardTemplatePlugin, {
  Options as CardTemplateOptions,
} from './babel/card-template-plugin';
import type { TemplateUsageMeta } from './glimmer/card-template-plugin';
import {
  assertValidCompiledCard,
  assertValidDeserializationMap,
  Asset,
  Builder,
  CompiledCard,
  ComponentInfo,
  Format,
  FORMATS,
  RawCard,
} from './interfaces';
import { getBasenameAndExtension, getFieldForPath } from './utils';

export const baseCardURL = 'https://cardstack.com/base/base';

function getNonAssetFilePaths(sourceCard: RawCard): (string | undefined)[] {
  return [sourceCard.schema, sourceCard.isolated, sourceCard.embedded].filter(
    Boolean
  );
}

export class Compiler {
  builder: Builder;
  compiledBaseCard?: CompiledCard;

  // returns the module identifier that can be used to get this module back.
  // It's exactly meaning depends on the environment. In node it's a path you
  // can actually `require`.
  define: (
    cardURL: string,
    localModule: string,
    source: string
  ) => Promise<string>;

  constructor(params: { builder: Builder; define: Compiler['define'] }) {
    this.builder = params.builder;
    this.define = params.define;
  }

  async compile(cardSource: RawCard): Promise<CompiledCard> {
    let card: Partial<CompiledCard> = {
      url: cardSource.url,
      data: cardSource.data,
    };

    if (cardSource.deserializer) {
      card.deserializer = cardSource.deserializer;
    }

    let options = {};
    card.schemaModule = await this.prepareSchema(cardSource, options);
    let meta = getMeta(options);

    card.fields = await this.lookupFieldsForCard(meta.fields);
    card.assets = this.buildAssetsList(cardSource);

    if (!isBaseCard(cardSource.url)) {
      let parentCard = await this.getParentCard(cardSource, meta);

      if (!parentCard) {
        throw new Error(
          `${cardSource.url} does not have a parent card. This is wrong and should not happen.`
        );
      }

      card.fields = this.adoptFields(card.fields, parentCard);
      card.adoptsFrom = parentCard;

      if (!card.schemaModule) {
        card.schemaModule = parentCard.schemaModule;
      }
      if (parentCard.deserializer) {
        if (
          card.deserializer &&
          parentCard.deserializer !== card.deserializer
        ) {
          throw new Error(
            `Your card declares a different deserializer than your parent. Thats not allowed. Card: ${card.url}:${card.deserializer} Parent: ${parentCard.url}:${parentCard.deserializer}`
          );
        }
        card.deserializer = parentCard.deserializer;
      }
    }

    if (!card.schemaModule) {
      throw new Error(
        `${cardSource.url} does not have a schema. This is wrong and should not happen.`
      );
    }

    for (const format of FORMATS) {
      card[format] = await this.prepareComponent(
        cardSource,
        card.fields,
        card.adoptsFrom,
        format
      );
    }

    assertValidCompiledCard(card);

    return card;
  }

  private buildAssetsList(sourceCard: RawCard): Asset[] {
    let assets: Asset[] = [];

    if (!sourceCard.files) {
      return assets;
    }

    let assetPaths = difference(
      Object.keys(sourceCard.files),
      getNonAssetFilePaths(sourceCard)
    );

    for (const p of assetPaths) {
      if (!p) {
        continue;
      }

      assets.push({
        type: getAssetType(p),
        path: p,
      });
    }

    return assets;
  }

  private getCardParentPath(
    cardSource: RawCard,
    meta: PluginMeta
  ): string | undefined {
    let parentPath;
    let { url, adoptsFrom } = cardSource;

    if (adoptsFrom) {
      if (adoptsFrom === url) {
        throw new Error(
          `BUG: ${url} provides itself as its parent. That should not happen.`
        );
      }
      parentPath = cardSource.adoptsFrom;
    }

    if (meta.parent && meta.parent.cardURL) {
      if (parentPath && parentPath !== meta.parent.cardURL) {
        throw new Error(
          `${url} provides conflicting parent URLs in card.json and schema.js`
        );
      }
      parentPath = meta.parent.cardURL;
    }

    return parentPath;
  }

  private async getParentCard(
    cardSource: RawCard,
    meta: PluginMeta
  ): Promise<CompiledCard> {
    let parentCardPath = this.getCardParentPath(cardSource, meta);

    if (parentCardPath) {
      // TODO: Confirm the path correctly depthed
      let url = new URL(parentCardPath, cardSource.url).href;
      return await this.builder.getCompiledCard(url);
    } else {
      // the base card from which all other cards derive
      return await this.builder.getCompiledCard(baseCardURL);
    }
  }

  private getSource(cardSource: RawCard, path: string): string {
    let schemaSrc = cardSource.files && cardSource.files[path];
    if (!schemaSrc) {
      throw new Error(
        `${cardSource.url} refers to ${path} in its card.json but that file does not exist`
      );
    }
    return schemaSrc;
  }

  // returns the module name of our own compiled schema, if we have one. Does
  // not recurse into parent, because we don't necessarily know our parent until
  // after we've tried to compile our own
  private async prepareSchema(
    cardSource: RawCard,
    options: Object
  ): Promise<string | undefined> {
    let schemaLocalFilePath = cardSource.schema;
    if (!schemaLocalFilePath) {
      if (cardSource.files && cardSource.files['schema.js']) {
        console.warn(
          `You did not specify what is your schema file, but a schema.js file exists. Using schema.js. url = ${cardSource.url}`
        );
      }

      return undefined;
    }
    let schemaSrc = this.getSource(cardSource, schemaLocalFilePath);
    let out = transformSync(schemaSrc, {
      plugins: [
        [cardSchemaPlugin, options],
        [decoratorsPlugin, { decoratorsBeforeExport: false }],
        classPropertiesPlugin,
      ],
    });

    let code = out!.code!;
    return await this.define(cardSource.url, schemaLocalFilePath, code);
  }

  private async lookupFieldsForCard(
    metaFields: FieldsMeta
  ): Promise<CompiledCard['fields']> {
    let fields: CompiledCard['fields'] = {};
    for (let [name, { cardURL, type }] of Object.entries(metaFields)) {
      fields[name] = {
        card: await this.builder.getCompiledCard(cardURL),
        type,
        name,
      };
    }

    return fields;
  }

  private adoptFields(
    fields: CompiledCard['fields'],
    parentCard: CompiledCard
  ): CompiledCard['fields'] {
    let cardFieldNames = Object.keys(fields);
    let parentFieldNames = Object.keys(parentCard.fields);
    let fieldNameCollisions = intersection(cardFieldNames, parentFieldNames);

    if (fieldNameCollisions.length) {
      throw Error(
        `Field collision on ${fieldNameCollisions.join()} with parent card ${
          parentCard.url
        }`
      );
    }

    return Object.assign({}, parentCard.fields, fields);
  }

  private async prepareComponent(
    cardSource: RawCard,
    fields: CompiledCard['fields'],
    parentCard: CompiledCard | undefined,
    which: Format
  ): Promise<ComponentInfo> {
    let localFilePath = cardSource[which];

    if (!localFilePath) {
      // we don't have an implementation of our own
      if (!parentCard) {
        throw new Error(
          `${cardSource.url} doesn't have a ${which} component OR a parent card. This is not right.`
        );
      }

      if (cardSource.schema) {
        // recompile parent component because we extend the schema
        let originalRawCard = await this.builder.getRawCard(
          parentCard[which].sourceCardURL
        );
        let srcLocalPath = originalRawCard[which];
        if (!srcLocalPath) {
          throw new Error(
            `bug: ${parentCard.url} says it got ${which} from ${parentCard[which].sourceCardURL}, but that card does not have a ${which} component`
          );
        }
        let src = this.getSource(originalRawCard, srcLocalPath);
        return await this.compileComponent(
          src,
          fields,
          originalRawCard.url,
          srcLocalPath,
          which
        );
      } else {
        // directly reuse existing parent component because we didn't extend
        // anything
        return parentCard[which];
      }
    }

    let src = this.getSource(cardSource, localFilePath);
    return await this.compileComponent(
      src,
      fields,
      cardSource.url,
      localFilePath,
      which
    );
  }

  private async compileComponent(
    templateSource: string,
    fields: CompiledCard['fields'],
    cardURL: string,
    localFile: string,
    format: Format
  ): Promise<ComponentInfo> {
    let options: CardTemplateOptions = {
      fields,
      cardURL,
      inlineHBS: undefined,
      usageMeta: { model: new Set(), fields: new Map() },
    };

    let out = transformSync(templateSource, {
      plugins: [[cardTemplatePlugin, options]],
    });

    let moduleName = await this.define(
      cardURL,
      hashFilenameFromFields(localFile, fields),
      out!.code!
    );

    let usedFields = buildUsedFieldsListFromUsageMeta(
      fields,
      options.usageMeta,
      defaultFieldFormat(format)
    );

    let componentInfo: ComponentInfo = {
      moduleName,
      usedFields,
      inlineHBS: options.inlineHBS,
      sourceCardURL: cardURL,
    };

    let deserialize = getDeserializationMap(fields, usedFields);
    if (deserialize) {
      componentInfo.deserialize = deserialize;
    }

    return componentInfo;
  }
}

function getAssetType(filename: string): Asset['type'] {
  if (filename.endsWith('.css')) {
    return 'css';
  }

  return 'unknown';
}

function hashFilenameFromFields(
  localFile: string,
  fields: CompiledCard['fields']
): string {
  let { basename, extension } = getBasenameAndExtension(localFile);
  let hash = md5(
    reduce(
      fields,
      (result, f, name) => {
        return (result += name + f.card.url);
      },
      ''
    )
  );
  return `${basename}-${hash}${extension}`;
}

function isBaseCard(url: string): boolean {
  return url === baseCardURL;
}

function getDeserializationMap(
  fields: CompiledCard['fields'],
  usedFields: string[]
): ComponentInfo['deserialize'] {
  let map: any = {};

  for (const fieldPath of usedFields) {
    let field = getFieldForPath(fields, fieldPath);
    if (!field || !field.card.deserializer) {
      continue;
    }

    if (!map[field.card.deserializer]) {
      map[field.card.deserializer] = [];
    }

    map[field.card.deserializer].push(fieldPath);
  }

  if (!Object.keys(map).length) {
    return;
  }

  assertValidDeserializationMap(map);

  return map;
}
function buildUsedFieldsListFromUsageMeta(
  fields: CompiledCard['fields'],
  usageMeta: TemplateUsageMeta,
  defaultFormat: Format
): ComponentInfo['usedFields'] {
  let usedFields: Set<string> = new Set();

  if (usageMeta.model && usageMeta.model !== 'self') {
    for (const fieldPath of usageMeta.model) {
      buildUsedFieldListFromData(usedFields, fieldPath, fields);
    }
  }

  for (const [fieldPath, fieldFormat] of usageMeta.fields.entries()) {
    buildUsedFieldListFromComponents(
      usedFields,
      fieldPath,
      fields,
      fieldFormat === 'default' ? defaultFormat : fieldFormat
    );
  }

  return [...usedFields];
}

function buildUsedFieldListFromData(
  usedFields: Set<string>,
  fieldPath: string,
  fields: CompiledCard['fields'],
  prefix?: string
) {
  let field = getFieldForPath(fields, fieldPath);
  if (field && Object.keys(field.card.fields).length) {
    for (const nestedFieldPath of Object.keys(field.card.fields)) {
      buildUsedFieldListFromComponents(
        usedFields,
        nestedFieldPath,
        field.card.fields,
        'embedded',
        fieldPath
      );
    }
  } else {
    if (prefix) {
      usedFields.add(`${prefix}.${fieldPath}`);
    } else {
      usedFields.add(fieldPath);
    }
  }
}

function buildUsedFieldListFromComponents(
  usedFields: Set<string>,
  fieldPath: string,
  fields: CompiledCard['fields'],
  format: Format,
  prefix?: string
): void {
  let field = getFieldForPath(fields, fieldPath);
  if (field && field.card[format].usedFields.length) {
    for (const nestedFieldPath of field.card[format].usedFields) {
      buildUsedFieldListFromComponents(
        usedFields,
        nestedFieldPath,
        field.card.fields,
        'embedded',
        fieldPath
      );
    }
  } else {
    if (prefix) {
      usedFields.add(`${prefix}.${fieldPath}`);
    } else {
      usedFields.add(fieldPath);
    }
  }
}

// we expect this to expand when we add edit format
function defaultFieldFormat(format: Format): Format {
  switch (format) {
    case 'isolated':
    case 'embedded':
      return 'embedded';
  }
}
