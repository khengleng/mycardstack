export const fieldTypeMappings = {
  string: '@cardstack/core-types::string',
  'case-insensitive string': '@cardstack/core-types::case-insensitive',
  boolean: '@cardstack/core-types::boolean',
  date: '@cardstack/core-types::date',
  integer: '@cardstack/core-types::integer',
  'related card': '@cardstack/core-types::belongs-to',
  'related cards': '@cardstack/core-types::has-many',
  'decorative image': '@cardstack/core-types::decorative-image',
  cta: '@cardstack/core-types::cta',
  link: '@cardstack/core-types::link',

  // Probably want to omit these types as they could probably be better
  // handled as related cards:
  // '@cardstack/core-types::string-array',
  // '@cardstack/core-types::object',
};

export const fieldComponents = [
  {
    id: 'text-field',
    coreType: '@cardstack/core-types::string',
    title: 'Text',
    description: 'All-purpose text field',
    type: 'string',
    icon: `/assets/images/field-types/text-field-icon.svg`,
  },
  {
    id: 'text-field-case-insensitive',
    coreType: '@cardstack/core-types::case-insensitive',
    title: 'Text (case-insensitive)',
    description: 'Case-insensitive text field',
    type: 'case-insensitive string',
    icon: `/assets/images/field-types/text-field-icon.svg`,
  },
  {
    id: 'checkbox',
    coreType: '@cardstack/core-types::boolean',
    title: 'Checkbox',
    description: 'True/false (boolean) values',
    type: 'boolean',
    icon: `/assets/images/field-types/checkbox-field-icon.svg`,
  },
  {
    id: 'date-field',
    coreType: '@cardstack/core-types::date',
    title: 'Date',
    description: 'Date field',
    type: 'date',
    icon: `/assets/images/field-types/date-field-icon.svg`,
  },
  {
    id: 'number',
    coreType: '@cardstack/core-types::integer',
    title: 'Number',
    description: 'Integer number field',
    type: 'integer',
    icon: `/assets/images/field-types/number.png`,
  },
  {
    id: 'dropdown',
    coreType: '@cardstack/core-types::belongs-to',
    title: 'Single-select',
    description: 'Single select dropdown',
    type: 'related card',
    icon: `/assets/images/field-types/dropdown-field-icon.svg`,
  },
  {
    id: 'dropdown-multi',
    coreType: '@cardstack/core-types::has-many',
    title: 'Multi-select',
    description: 'Multiple select dropdown',
    type: 'related cards',
    icon: `/assets/images/field-types/has-many-field-icon.svg`,
  },
  {
    id: 'decorative-image',
    coreType: '@cardstack/core-types::decorative-image',
    title: 'Decorative image',
    description: 'Use this for hero images',
    type: 'decorative image',
    icon: `/assets/images/field-types/image-field-icon.svg`,
  },
  {
    id: 'cta',
    coreType: '@cardstack/core-types::cta',
    title: 'Button link',
    description: 'Call to action',
    type: 'cta',
    icon: `/assets/images/field-types/cta-field-icon.svg`,
  },
  {
    id: 'link',
    coreType: '@cardstack/core-types::link',
    title: 'Link',
    description: 'Link to another website',
    type: 'link',
    icon: `/assets/images/field-types/link-field-icon.svg`,
  },
  // We'll need to figure out how to deal with the other types of ui-components, ex:
  // {
  //   id: 'text-area',
  //   title: 'Text Area',
  //   description: 'Multi-line text field',
  //   type: 'string',
  //   icon: `/assets/images/field-types/textarea.png`
  // },
  // {
  //   id: 'phone-number-field',
  //   title: 'Phone Number',
  //   description: 'Description',
  //   type: 'string',
  //   icon: `/assets/images/field-types/phone-field-icon.svg`
  // },
];