import ApplicationSerializer from './application';

export default ApplicationSerializer.extend({
  include: Object.freeze(['colorScheme', 'pattern']),
});
