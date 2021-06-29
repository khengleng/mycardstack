import Web3 from 'web3';
import { getConstant, getSDK } from '@cardstack/cardpay-sdk';
import { getWeb3 } from './utils';

const { fromWei } = Web3.utils;

export async function priceForFaceValue(
  network: string,
  tokenAddress: string,
  spendFaceValue: number,
  mnemonic?: string
): Promise<void> {
  let web3 = await getWeb3(network, mnemonic);
  let prepaidCard = await getSDK('PrepaidCard', web3);
  let weiAmount = await prepaidCard.priceForFaceValue(tokenAddress, spendFaceValue);
  console.log(
    `To achieve a SPEND face value of §${spendFaceValue} you must send ${fromWei(weiAmount)} units of this token`
  );
}

export async function gasFee(network: string, tokenAddress: string, mnemonic?: string): Promise<void> {
  let web3 = await getWeb3(network, mnemonic);
  let prepaidCard = await getSDK('PrepaidCard', web3);
  let weiAmount = await prepaidCard.gasFee(tokenAddress);
  console.log(`The gas fee for a new prepaid card in units of this token is ${fromWei(weiAmount)}`);
}

export async function createPrepaidCard(
  network: string,
  safe: string,
  faceValues: number[],
  tokenAddress: string,
  customizationDID: string | undefined,
  mnemonic?: string
): Promise<void> {
  let web3 = await getWeb3(network, mnemonic);

  let prepaidCard = await getSDK('PrepaidCard', web3);
  let blockExplorer = await getConstant('blockExplorer', web3);

  console.log('Creating prepaid card');
  let result = await prepaidCard.create(safe, tokenAddress, faceValues, customizationDID, (prepaidCardAddresses) =>
    console.log(`Created new prepaid card: ${prepaidCardAddresses.join(', ')}`)
  );
  console.log(`Transaction hash: ${blockExplorer}/tx/${result.gnosisTxn.ethereumTx.txHash}/token-transfers`);
}

export async function payMerchant(
  network: string,
  merchantSafe: string,
  prepaidCardAddress: string,
  amount: number,
  mnemonic?: string
): Promise<void> {
  let web3 = await getWeb3(network, mnemonic);
  let prepaidCard = await getSDK('PrepaidCard', web3);
  let blockExplorer = await getConstant('blockExplorer', web3);

  console.log(
    `Paying merchant safe address ${merchantSafe} the amount §${amount} SPEND from prepaid card address ${prepaidCardAddress}...`
  );
  let result = await prepaidCard.payMerchant(merchantSafe, prepaidCardAddress, amount);
  console.log(`Transaction hash: ${blockExplorer}/tx/${result?.ethereumTx.txHash}/token-transfers`);
}
