/* eslint-disable @typescript-eslint/naming-convention */
import { TemplateUsageMeta } from './glimmer-plugin-card-template';
// import ETC from 'ember-source/dist/ember-template-compiler';
// const { preprocess, print } = ETC._GlimmerSyntax;

// @ts-ignore
import classPropertiesPlugin from '@babel/plugin-proposal-class-properties';

import { NodePath, transformSync } from '@babel/core';
import * as t from '@babel/types';

import { CompiledCard, SerializerName, Format } from './interfaces';

import { getObjectKey, error } from './utils/babel';
import glimmerCardTemplateTransform from './glimmer-plugin-card-template';
import { buildSerializerMapFromUsedFields, buildUsedFieldsListFromUsageMeta } from './utils/fields';
import { augmentBadRequest } from './utils/errors';
export interface CardComponentPluginOptions {
  cardURL: string;
  componentFile?: string;
  fields: CompiledCard['fields'];
  defaultFieldFormat: Format;
  // these are for gathering output
  usedFields: string[];
  inlineHBS: string | undefined;
}

interface State {
  opts: CardComponentPluginOptions;
  insideExportDefault: boolean;

  // keys are local names in this module that we have chosen.
  neededImports: Map<string, { moduleSpecifier: string; exportedName: string }>;
}

const BASE_MODEL_VAR_NAME = 'BaseModel';

export default function (templateSource: string, options: CardComponentPluginOptions): string {
  try {
    let out = transformSync(templateSource, {
      plugins: [[babelPluginCardTemplate, options], classPropertiesPlugin],
      // HACK: The / resets the relative path setup, removing the cwd of the hub.
      // This allows the error module to look a lot more like the card URL.
      filename: `/${options.cardURL}/${options.componentFile}`,
    });
    return out!.code!;
  } catch (e: any) {
    throw augmentBadRequest(e);
  }
}

export function babelPluginCardTemplate() {
  return {
    visitor: {
      Program: {
        enter(_path: NodePath, state: State) {
          state.insideExportDefault = false;
          state.neededImports = new Map();
          state.neededImports.set(BASE_MODEL_VAR_NAME, {
            moduleSpecifier: '@cardstack/core/src/card-model',
            exportedName: 'default',
          });
        },
        exit(path: NodePath<t.Program>, state: State) {
          addImports(state.neededImports, path);
          addModelClass(path, state);
        },
      },

      ExportDefaultDeclaration: {
        enter(_path: NodePath, state: State) {
          state.insideExportDefault = true;
        },
        exit(_path: NodePath, state: State) {
          state.insideExportDefault = false;
        },
      },

      CallExpression: callExpressionEnter,
    },
  };
}

function addImports(neededImports: State['neededImports'], path: NodePath<t.Program>) {
  for (let [localName, { moduleSpecifier, exportedName }] of neededImports) {
    path.node.body.push(
      t.importDeclaration(
        [
          exportedName === 'default'
            ? t.importDefaultSpecifier(t.identifier(localName))
            : t.importSpecifier(t.identifier(localName), t.identifier(exportedName)),
        ],
        t.stringLiteral(moduleSpecifier)
      )
    );
  }
}

function addModelClass(path: NodePath<t.Program>, state: State) {
  let serializerMapPropertyDefinition = buildSerializerMapProp(state.opts.fields, state.opts.usedFields);
  let classBody = t.classBody([serializerMapPropertyDefinition]);

  path.node.body.push(
    t.exportNamedDeclaration(
      t.classDeclaration(
        t.identifier(findVariableName('Model', path, state.neededImports)),
        t.identifier(BASE_MODEL_VAR_NAME),
        classBody
      )
    )
  );
}

function buildSerializerMapProp(
  fields: CompiledCard['fields'],
  usedFields: CardComponentPluginOptions['usedFields']
): t.ClassProperty {
  let serializerMap = buildSerializerMapFromUsedFields(fields, usedFields);
  let props: t.ObjectExpression['properties'] = [];

  for (let serializer in serializerMap) {
    let fieldList = serializerMap[serializer as SerializerName];
    if (!fieldList) {
      continue;
    }

    let fieldListElements: t.ArrayExpression['elements'] = [];
    for (let field of fieldList) {
      fieldListElements.push(t.stringLiteral(field));
    }
    props.push(t.objectProperty(t.identifier(serializer), t.arrayExpression(fieldListElements)));
  }
  return t.classProperty(
    t.identifier('serializerMap'),
    t.objectExpression(props),
    undefined,
    undefined,
    undefined,
    true
  );
}

function callExpressionEnter(path: NodePath<t.CallExpression>, state: State) {
  if (shouldSkipExpression(path, state)) {
    return;
  }

  let { options, template: inputTemplate } = handleArguments(path);

  let { template, neededScope } = transformTemplate(inputTemplate, path, state.opts, state.neededImports);
  path.node.arguments[0] = t.stringLiteral(template);

  if (shouldInlineHBS(options, neededScope)) {
    state.opts.inlineHBS = template;
  }

  updateScope(options, neededScope);
}

function shouldSkipExpression(path: NodePath<t.CallExpression>, state: State): boolean {
  return (
    !state.insideExportDefault ||
    !path.get('callee').referencesImport('@ember/template-compilation', 'precompileTemplate')
  );
}

function shouldInlineHBS(options: NodePath<t.ObjectExpression>, neededScope: Set<string>) {
  // TODO: this also needs to depend on whether they have a backing class other than templateOnlyComponent
  return !getObjectKey(options, 'scope') && neededScope.size == 0;
}

function handleArguments(path: NodePath<t.CallExpression>): {
  options: NodePath<t.ObjectExpression>;
  template: string;
} {
  let args = path.get('arguments');
  if (args.length < 2) {
    throw error(path, 'precompileTemplate needs two arguments');
  }
  let template = args[0];
  let templateString: string;
  if (template.isStringLiteral()) {
    templateString = template.node.value;
  } else if (template.isTemplateLiteral()) {
    if (template.node.quasis.length > 1) {
      throw error(template, 'must not contain expressions');
    }
    let str = template.node.quasis[0].value.cooked;
    if (!str) {
      throw error(template, 'bug: no cooked value');
    }
    templateString = str;
  } else {
    throw error(template, 'must be a sting literal or template literal');
  }

  let options = args[1];
  if (!options.isObjectExpression()) {
    throw error(options, 'must be an object expression');
  }

  let strictMode = getObjectKey(options, 'strictMode');

  if (!strictMode?.isBooleanLiteral() || !strictMode.node.value) {
    throw error(options as NodePath<any>, 'Card Template precompileOptions requires strictMode to be true');
  }
  return { options, template: templateString };
}

function transformTemplate(
  source: string,
  path: NodePath<t.CallExpression>,
  opts: CardComponentPluginOptions,
  importNames: State['neededImports']
): { template: string; neededScope: Set<string> } {
  let neededScope = new Set<string>();

  function importAndChooseName(desiredName: string, moduleSpecifier: string, importedName: string): string {
    let name = findVariableName(`${desiredName}Field`, path, importNames);
    importNames.set(name, {
      moduleSpecifier,
      exportedName: importedName,
    });
    neededScope.add(name);
    return name;
  }

  let usageMeta: TemplateUsageMeta = { model: new Set(), fields: new Map() };

  let template = glimmerCardTemplateTransform(source, {
    fields: opts.fields,
    usageMeta,
    defaultFieldFormat: opts.defaultFieldFormat,
    moduleName: `${opts.cardURL}/${opts.componentFile}`,
    importAndChooseName,
  });

  opts.usedFields = buildUsedFieldsListFromUsageMeta(opts.fields, usageMeta);

  return { template, neededScope };
}

function findVariableName(
  desiredName: string,
  path: NodePath<t.CallExpression> | NodePath<t.Program>,
  importNames: State['neededImports']
) {
  let candidate = desiredName;
  let counter = 0;
  while (path.scope.getBinding(candidate) || importNames.has(candidate)) {
    candidate = `${desiredName}${counter++}`;
  }
  return candidate;
}

function updateScope(options: NodePath<t.ObjectExpression>, names: Set<string>): void {
  let scopeVars: t.ObjectExpression['properties'] = [];

  for (let name of names) {
    scopeVars.push(t.objectProperty(t.identifier(name), t.identifier(name), undefined, true));
  }

  let scope = getObjectKey(options, 'scope');

  if (!scope) {
    options.node.properties.push(
      t.objectProperty(t.identifier('scope'), t.arrowFunctionExpression([], t.objectExpression(scopeVars)))
    );
    return;
  }

  if (!scope.isArrowFunctionExpression() || scope.node.body.type !== 'ObjectExpression') {
    throw new Error('BUG: component scope is not a function and it should be');
  }

  scope.node.body.properties = scope.node.body.properties.concat(scopeVars);
}
