/* eslint @typescript-eslint/naming-convention: "off" */

import { ContractMeta } from '../version-resolver';

import v0_4_0 from './v0.4.0';
import v0_5_0 from './v0.5.0';

// add more versions as we go, but also please do drop version that we don't
// want to maintain simultaneously
export type PrepaidCard = v0_5_0;

export const prepaidCardMeta = {
  apiVersions: { v0_4_0, v0_5_0 },
  contractName: 'prepaidCardManager',
} as ContractMeta;