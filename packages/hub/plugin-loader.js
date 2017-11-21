const {
  declareInjections,
  getOwner,
  setOwner
} = require('@cardstack/di');
const path = require('path');
const log = require('@cardstack/plugin-utils/logger')('plugin-loader');
const denodeify = require('denodeify');
const resolve = denodeify(require('resolve'));
const fs = require('fs');
const realpath = denodeify(fs.realpath);
const readdir = denodeify(fs.readdir);
const Error = require('@cardstack/plugin-utils/error');

// provides "%t" in debug logger
require('./table-log-formatter');

const featureTypes = [
  'constraint-types',
  'field-types',
  'writers',
  'searchers',
  'indexers',
  'authenticators',
  'middleware',
  'messengers',
  'code-generators'
];
const javascriptPattern = /(.*)\.js$/;

module.exports = declareInjections({
  project: 'config:project'
},

class PluginLoader {
  static create(opts) {
    return new this(opts);
  }

  constructor({ project }) {
    if (!project) {
      throw new Error("Missing configuration `config:project`");
    }

    if (!project.path) {
      throw new Error("`config:project` must have a `path`");
    }
    this.project = project;
    this._installedPlugins = null;
    this._installedFeatures = null;
  }

  async installedPlugins() {
    if (!this._installedPlugins) {
      let output = [];
      let seen = Object.create(null);

      // during a test suite, we include devDependencies of the top-level project under test.
      let includeDevDependencies = this.project.allowDevDependencies;
      let projectPath = path.resolve(this.project.path);
      log.info("starting from path %s", projectPath);
      log.info("allowed in devDependencies: %s", !!includeDevDependencies);
      await this._crawlPlugins(projectPath, output, seen, includeDevDependencies, []);
      this._installedPlugins = output;

      let features = [];
      for (let plugin of output) {
        features = features.concat(await discoverFeatures(plugin.attributes.dir, plugin.id));
        plugin.relationships = {
          features: {
            data: features.map(({ type, id }) => ({ type, id }))
          }
        };
      }
      this._installedFeatures = features;
      log.info("=== found installed plugins===\n%t", () => summarize(output, features));
    }
    return this._installedPlugins;
  }

  async installedFeatures() {
    if (!this._installedFeatures) {
      await this.installedPlugins();
    }
    return this._installedFeatures;
  }

  async activePlugins(configModels) {
    let configs = new Map();
    for (let model of configModels) {
      configs.set(model.id, model);
    }
    let installed = await this.installedPlugins();

    let missing = missingPlugins(installed, configs);
    if (missing.length > 0) {
      log.warn("Plugins are configured but not installed: %j", missing);
    }
    activateRecursively(installed, configs);
    let a = new ActivePlugins(installed, await this.installedFeatures(), configs);
    setOwner(a, getOwner(this));
    return a;
  }

  async _crawlPlugins(dir, outputPlugins, seen, includeDevDependencies, breadcrumbs) {
    log.trace("plugin crawl dir=%s, includeDevDependencies=%s, breadcrumbs=%j", dir, includeDevDependencies, breadcrumbs);
    if (seen[dir]) {
      if (seen[dir].attributes && seen[dir].attributes.includedFrom) {
        // if we've seen this dir before *and* it's a cardstack
        // plugin, we should update its includedFrom to include the
        // new path that we arrived by
        seen[dir].attributes.includedFrom.push(breadcrumbs);
      }
      return;
    }
    seen[dir] = true;
    let realdir = await realpath(dir);
    let packageJSON = path.join(realdir, 'package.json');
    let moduleRoot = path.dirname(await resolve(packageJSON, { basedir: this.project.path }));

    let json = require(packageJSON);

    if (!json.keywords || !json.keywords.includes('cardstack-plugin') || !json['cardstack-plugin']) {
      // top-level app doesn't need to be a cardstack-plugin, but when
      // crawling any deeper dependencies we only care about them if
      // they are cardstack-plugins.
      if (breadcrumbs.length > 0) {
        log.trace(`%s does not appear to contain a cardstack plugin`, realdir);
        return;
      }
    } else {
      if (json['cardstack-plugin']['api-version'] !== 1) {
        log.warn(`%s has some fancy cardstack-plugin.version I don't understand. Trying anyway.`, realdir);
      }
      let customSource = json['cardstack-plugin'].src;
      if (customSource) {
        moduleRoot = path.join(moduleRoot, customSource);
      }
    }

    seen[dir] = {
      id: json.name,
      type: 'plugins',
      attributes: {
        dir: moduleRoot,
        includedFrom: [breadcrumbs]
      }
    };

    outputPlugins.push(seen[dir]);

    let deps = json.dependencies ? Object.keys(json.dependencies).map(dep => ({ dep, type: 'dependencies' })) : [];
    if (includeDevDependencies && json.devDependencies) {
      deps = deps.concat(Object.keys(json.devDependencies).map(dep => ({ dep, type: 'devDependencies' })));
    }

    if (json['cardstack-plugin']) {
      let dirs = json['cardstack-plugin']['in-repo-plugins'];
      if (dirs) {
        deps = deps.concat(dirs.map(dir => ({ dep: path.resolve(moduleRoot + '/' + dir), type: 'in-repo-plugins' })));
      }
    }

    for (let { dep, type } of deps) {
      let childDir = path.dirname(await resolve(dep + '/package.json', { basedir: realdir }));

      // we never include devDependencies of second level dependencies
      await this._crawlPlugins(childDir, outputPlugins, seen, false, breadcrumbs.concat({ id: json.name, type }));
    }
  }

  static types() {
    return featureTypes;
  }

});

async function discoverFeatures(moduleRoot, pluginName) {
  let features = [];
  for (let featureType of featureTypes) {
    try {
      let files = await readdir(path.join(moduleRoot, featureType));
      for (let file of files) {
        let m = javascriptPattern.exec(file);
        if (m) {
          features.push({
            id: `${pluginName}::${m[1]}`,
            type: featureType,
            attributes: {
              'load-path': path.join(moduleRoot, featureType, file)
            },
            relationships: {
              plugin: {
                data: { type: 'plugins', id: pluginName }
              }
            }
          });
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        throw err;
      }
    }

    let filename = path.join(moduleRoot, singularize(featureType) + '.js');
    if (fs.existsSync(filename)) {
      features.push({
        id: pluginName,
        type: featureType,
        attributes: {
          'load-path': filename
        },
        relationships: {
          plugin: {
            data: { type: 'plugins', id: pluginName }
          }
        }
      });
    }
  }
  return features;
}

function singularize(name) {
  return name.replace(/s$/, '');
}


class ActivePlugins {
  constructor(installedPlugins, installedFeatures, configs) {
    this._installedPlugins = installedPlugins;
    this._installedFeatures = installedFeatures;
    this._configs = configs;
    this._plugins = null;
    this._features = null;
  }

  all() {
    if (!this._plugins) {
      this._plugins = this._installedPlugins.map(plugin => {
        let config = this._configs.get(plugin.id);
        if (config) {
          let copied = Object.assign({}, plugin);
          copied.attributes = Object.assign({}, plugin.attributes, config.attributes);
          copied.attributes.enabled = true;
          copied.relationships = Object.assign({}, plugin.relationships, config.relationships);
          return copied;
        }
      }).filter(Boolean);
    }
    return this._plugins;
  }

  features() {
    if (!this._features) {
      this._features = this._installedFeatures.filter(feature => {
        return this._configs.get(feature.relationships.plugin.data.id);
      });
    }
    return this._features;
  }

  lookup(pluginName) {
    return this.all().find(p => p.id === pluginName);
  }

  lookupFeature(featureType, fullyQualifiedName)  {
    return this._instance(this._lookupFeature(featureType, fullyQualifiedName));
  }

  lookupFeatureFactory(featureType, fullyQualifiedName)  {
    return this._factory(this._lookupFeature(featureType, fullyQualifiedName));
  }

  lookupFeatureAndAssert(featureType, fullyQualifiedName)  {
    return this._instance(this._lookupFeatureAndAssert(featureType, fullyQualifiedName));
  }

  lookupFeatureFactoryAndAssert(featureType, fullyQualifiedName)  {
    return this._factory(this._lookupFeatureAndAssert(featureType, fullyQualifiedName));
  }

  featuresOfType(featureType) {
    return this.features().filter(f => f.type === featureType);
  }

  _instance(resolverName) {
    if (resolverName) {
      return getOwner(this).lookup(resolverName);
    }
  }

  _factory(resolverName) {
    if (resolverName) {
      return getOwner(this).factoryFor(resolverName);
    }
  }

  _lookupFeature(featureType, fullyQualifiedName)  {
    let feature = this._findFeature(featureType, fullyQualifiedName);
    if (feature) {
      if (this._configs.get(feature.relationships.plugin.data.id)) {
        return resolverName(feature);
      }
    }
  }

  _lookupFeatureAndAssert(featureType, fullyQualifiedName)  {
    let feature = this._findFeature(featureType, fullyQualifiedName);
    if (feature) {
      if (this._configs.get(feature.relationships.plugin.data.id)) {
        return resolverName(feature);
      }
      throw new Error(`You're trying to use ${featureType} ${fullyQualifiedName} but the plugin ${feature.relationships.plugin.data.id} is not activated`);
    }
    let [moduleName] = fullyQualifiedName.split('::');
    let plugin = this._installedPlugins.find(p => p.id === moduleName);
    if (plugin) {
      throw new Error(`You're trying to use ${featureType} ${fullyQualifiedName} but no such feature exists in plugin ${moduleName}`);
    } else {
      throw new Error(`You're trying to use ${featureType} ${fullyQualifiedName} but the plugin ${moduleName} is not installed. Make sure it appears in the dependencies section of package.json`);
    }
  }

  _findFeature(type, id) {
    if (!featureTypes.includes(type)) {
      throw new Error(`No such feature type "${type}"`);
    }
    return this._installedFeatures.find(
      f => f.type === type && f.id === id
    );
  }

}

function resolverName(feature) {
  let attrs = feature.attributes;
  return `plugin-${feature.type}:${attrs['load-path']}`;
}


function missingPlugins(installed, configs) {
  let missing = [];
  for (let pluginName of configs.keys()) {
    if (!installed.find(p => p.id === pluginName)) {
      missing.push(pluginName);
    }
  }
  return missing;
}

function summarize(plugins, features) {
  return plugins.map(p => {
    let pluginFeatures = features.filter(f => f.relationships.plugin.data.id === p.id);
    if (pluginFeatures.length > 0){
      return pluginFeatures.map(f => [p.id, f.type, f.id]);
    } else {
      return [[p.id, '']];
    }
  }).reduce((a,b) => a.concat(b), []);
}


function activateRecursively(installed, configs) {
  // The hub is always active, it doesn't really make sense to be here
  // if it isn't.
  if (!configs.get('@cardstack/hub')) {
    configs.set('@cardstack/hub', { moduleName: '@cardstack/hub' });
  }

  let dependsOn = dependencyGraph(installed);
  let queue = [...configs.keys()];
  let seen = Object.create(null);
  while (queue.length > 0) {
    let pluginName = queue.shift();
    if (seen[pluginName]) { continue; }
    seen[pluginName] = true;
    let deps = dependsOn[pluginName];
    if (deps) {
      for (let dep of deps) {
        if (!configs.get(dep)) {
          log.debug('Activating plugin %s because its used by %s', dep, pluginName);
          configs.set(dep, { moduleName: dep });
          queue.push(dep);
        }
      }
    }
  }
}

// This only includes "dependencies", not "devDependencies" or
// "in-repo-plugins" (only "dependencies" are things that must always
// be both installed and active when you are active).
function dependencyGraph(installed) {
  let dependsOn = Object.create(null);
  for (let plugin of installed) {
    for (let breadcrumbs of plugin.attributes.includedFrom) {
      let parent = breadcrumbs[breadcrumbs.length - 1];
      if (!parent || parent.type !== 'dependencies') { continue; }
      if (!dependsOn[parent.id]) {
        dependsOn[parent.id] = [ plugin.id ];
      } else {
        dependsOn[parent.id].push(plugin.id);
      }
    }
  }
  log.debug('=== plugin dependency graph ===\n%t', () => Object.keys(dependsOn).map(k => dependsOn[k].map(v => [k,v])).reduce((a,b) => a.concat(b)));
  return dependsOn;
}
