import { networkIds } from '@cardstack/cardpay-sdk';
import Layer1ChainWeb3Strategy from './layer1-chain';

export default class KovanWeb3Strategy extends Layer1ChainWeb3Strategy {
  constructor() {
    super(networkIds['kovan'], 'kovan', 'Kovan testnet');
  }
}
