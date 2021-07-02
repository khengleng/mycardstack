/*global fetch */

import Web3 from 'web3';
import PrepaidCardManagerABI from '../../contracts/abi/v0.6.2/prepaid-card-manager';
import MerchantManagerABI from '../../contracts/abi/v0.6.2/merchant-manager';
import SupplierManagerABI from '../../contracts/abi/v0.6.2/supplier-manager';
import SpendABI from '../../contracts/abi/v0.6.2/spend';
import ERC20ABI from '../../contracts/abi/erc-20';
import { AbiItem } from 'web3-utils';
import { getAddress } from '../../contracts/addresses';
import { getConstant, ZERO_ADDRESS } from '../constants';
import { Contract, ContractOptions } from 'web3-eth-contract';
import { GnosisExecTx, gasEstimate, executeTransaction } from '../utils/safe-utils';
import { signSafeTxAsRSV } from '../utils/signing-utils';
import { getSDK } from '../version-resolver';
import BN from 'bn.js';
import { ExchangeRate } from '../exchange-rate';
const { toBN, fromWei } = Web3.utils;

export type Safe = DepotSafe | PrepaidCardSafe | MerchantSafe | ExternalSafe;
interface BaseSafe {
  address: string;
  tokens: TokenInfo[];
}
export interface DepotSafe extends BaseSafe {
  type: 'depot';
  infoDID?: string;
}
export interface MerchantSafe extends BaseSafe {
  type: 'merchant';
  accumulatedSpendValue: number;
  infoDID?: string;
}
export interface ExternalSafe extends BaseSafe {
  type: 'external';
}
export interface PrepaidCardSafe extends BaseSafe {
  type: 'prepaid-card';
  issuingToken: string;
  spendFaceValue: number;
  issuer: string;
  reloadable: boolean;
  customizationDID?: string;
}
export interface TokenInfo {
  tokenAddress: string;
  token: {
    name: string;
    symbol: string;
    decimals: number;
  };
  balance: string; // balance is in wei
}

interface Context {
  transactionServiceURL: string;
  spendContract: Contract;
  merchantManager: Contract;
  prepaidCardManager: Contract;
  supplierManager: Contract;
  exchangeRate: ExchangeRate;
}

export default class Safes {
  constructor(private layer2Web3: Web3) {}

  async viewSafe(safeAddress: string, context?: Context): Promise<Safe> {
    let transactionServiceURL: string;
    let spendContract: Contract;
    let merchantManager: Contract;
    let supplierManager: Contract;
    let prepaidCardManager: Contract;
    let exchangeRate: ExchangeRate;
    if (context) {
      ({
        prepaidCardManager,
        transactionServiceURL,
        spendContract,
        merchantManager,
        supplierManager,
        exchangeRate,
      } = context);
    } else {
      transactionServiceURL = await getConstant('transactionServiceURL', this.layer2Web3);
      prepaidCardManager = new this.layer2Web3.eth.Contract(
        PrepaidCardManagerABI as AbiItem[],
        await getAddress('prepaidCardManager', this.layer2Web3)
      );
      spendContract = new this.layer2Web3.eth.Contract(
        SpendABI as AbiItem[],
        await getAddress('spend', this.layer2Web3)
      );
      merchantManager = new this.layer2Web3.eth.Contract(
        MerchantManagerABI as AbiItem[],
        await getAddress('merchantManager', this.layer2Web3)
      );
      supplierManager = new this.layer2Web3.eth.Contract(
        SupplierManagerABI as AbiItem[],
        await getAddress('supplierManager', this.layer2Web3)
      );
      exchangeRate = await getSDK('ExchangeRate', this.layer2Web3);
    }

    let balanceResponse = await fetch(`${transactionServiceURL}/v1/safes/${safeAddress}/balances/`);
    if (!balanceResponse?.ok) {
      throw new Error(`Error retrieving safe ${safeAddress}: ${await balanceResponse.text()}`);
    }
    let balances: TokenInfo[] = await balanceResponse.json();
    let tokens = balances.filter((balanceItem) => balanceItem.tokenAddress);
    let safeInfo = { address: safeAddress, tokens };
    let {
      issuer,
      issueToken: issuingToken,
      reloadable,
      customizationDID,
    } = await prepaidCardManager.methods.cardDetails(safeAddress).call();

    // prepaid card safe
    if (issuer !== ZERO_ADDRESS) {
      let issuingTokenBalance =
        tokens.find((t) => t.tokenAddress.toLowerCase() === issuingToken.toLowerCase())?.balance ?? '0';
      return {
        ...safeInfo,
        type: 'prepaid-card' as 'prepaid-card',
        issuer,
        issuingToken,
        reloadable,
        customizationDID: customizationDID ? customizationDID : undefined, // cleanse the empty strings (which solidity uses for unspecified DID's)
        spendFaceValue: await exchangeRate.convertToSpend(issuingToken, issuingTokenBalance),
      };
    }
    let supplier = await supplierManager.methods.safes(safeAddress).call();
    if (supplier !== ZERO_ADDRESS) {
      let { infoDID } = await supplierManager.methods.suppliers(supplier).call();
      return {
        ...safeInfo,
        type: 'depot' as 'depot',
        infoDID: infoDID ? infoDID : undefined, // cleanse empty strings
      };
    }
    let merchant = await merchantManager.methods.merchantSafes(safeAddress).call();
    if (merchant !== ZERO_ADDRESS) {
      let { infoDID } = await merchantManager.methods.merchants(merchant).call();
      return {
        ...safeInfo,
        type: 'merchant' as 'merchant',
        infoDID: infoDID ? infoDID : undefined, // cleanse empty strings
        accumulatedSpendValue: await spendContract.methods.balanceOf(safeInfo.address).call(),
      };
    }
    return {
      ...safeInfo,
      type: 'external' as 'external',
    };
  }

  async view(owner?: string): Promise<Safe[]> {
    owner = owner ?? (await this.layer2Web3.eth.getAccounts())[0];
    let transactionServiceURL = await getConstant('transactionServiceURL', this.layer2Web3);
    let response = await fetch(`${transactionServiceURL}/v1/owners/${owner}/`);
    let { safes } = (await response.json()) as { safes: string[] };
    let prepaidCardManager = new this.layer2Web3.eth.Contract(
      PrepaidCardManagerABI as AbiItem[],
      await getAddress('prepaidCardManager', this.layer2Web3)
    );
    let spendContract = new this.layer2Web3.eth.Contract(
      SpendABI as AbiItem[],
      await getAddress('spend', this.layer2Web3)
    );
    let merchantManager = new this.layer2Web3.eth.Contract(
      MerchantManagerABI as AbiItem[],
      await getAddress('merchantManager', this.layer2Web3)
    );
    let supplierManager = new this.layer2Web3.eth.Contract(
      SupplierManagerABI as AbiItem[],
      await getAddress('supplierManager', this.layer2Web3)
    );

    let exchangeRate = await getSDK('ExchangeRate', this.layer2Web3);

    // The transaction server can get overwhelmed and return 500's if too many
    // calls are executed in parallel, so we'll batch up the requests
    const batchSize = 20;
    let result: Safe[] = [];
    while (safes.length > 0) {
      let batch = safes.slice(0, batchSize);
      safes = safes.slice(batchSize);
      result.push(
        ...(await Promise.all(
          batch.map((safeAddress: string) =>
            this.viewSafe(safeAddress, {
              transactionServiceURL,
              prepaidCardManager,
              spendContract,
              merchantManager,
              supplierManager,
              exchangeRate,
            })
          )
        ))
      );
    }
    return result;
  }

  async sendTokens(
    safeAddress: string,
    tokenAddress: string,
    recipient: string,
    amount: string,
    options?: ContractOptions
  ): Promise<GnosisExecTx> {
    let from = options?.from ?? (await this.layer2Web3.eth.getAccounts())[0];
    let token = new this.layer2Web3.eth.Contract(ERC20ABI as AbiItem[], tokenAddress);
    let safeBalance = new BN(await token.methods.balanceOf(safeAddress).call());
    if (safeBalance.lt(new BN(amount))) {
      throw new Error(
        `Safe does not have enough balance to transfer tokens. The token ${tokenAddress} balance of safe ${safeAddress} is ${fromWei(
          safeBalance.toString()
        )}, amount to transfer ${fromWei(amount)}`
      );
    }
    let payload = this.transferTokenPayload(tokenAddress, recipient, amount);
    let estimate = await gasEstimate(this.layer2Web3, safeAddress, tokenAddress, '0', payload, 0, tokenAddress);
    if (estimate.lastUsedNonce == null) {
      estimate.lastUsedNonce = -1;
    }
    let signatures = await signSafeTxAsRSV(
      this.layer2Web3,
      tokenAddress,
      0,
      payload,
      0,
      estimate.safeTxGas,
      estimate.dataGas,
      estimate.gasPrice,
      estimate.gasToken,
      ZERO_ADDRESS,
      toBN(estimate.lastUsedNonce + 1),
      from,
      safeAddress
    );
    let result = await executeTransaction(
      this.layer2Web3,
      safeAddress,
      tokenAddress,
      0,
      payload,
      0,
      estimate.safeTxGas,
      estimate.dataGas,
      estimate.gasPrice,
      toBN(estimate.lastUsedNonce + 1).toString(),
      signatures,
      estimate.gasToken,
      ZERO_ADDRESS
    );
    return result;
  }

  async setSupplierInfoDID(
    safeAddress: string,
    infoDID: string,
    gasToken: string,
    options?: ContractOptions
  ): Promise<GnosisExecTx> {
    let from = options?.from ?? (await this.layer2Web3.eth.getAccounts())[0];
    let supplierManager = await getAddress('supplierManager', this.layer2Web3);
    let payload = await this.setSupplierInfoDIDPayload(infoDID);
    let estimate = await gasEstimate(this.layer2Web3, safeAddress, supplierManager, '0', payload, 0, gasToken);
    if (estimate.lastUsedNonce == null) {
      estimate.lastUsedNonce = -1;
    }
    let signatures = await signSafeTxAsRSV(
      this.layer2Web3,
      supplierManager,
      0,
      payload,
      0,
      estimate.safeTxGas,
      estimate.dataGas,
      estimate.gasPrice,
      estimate.gasToken,
      ZERO_ADDRESS,
      toBN(estimate.lastUsedNonce + 1),
      from,
      safeAddress
    );
    let result = await executeTransaction(
      this.layer2Web3,
      safeAddress,
      supplierManager,
      0,
      payload,
      0,
      estimate.safeTxGas,
      estimate.dataGas,
      estimate.gasPrice,
      toBN(estimate.lastUsedNonce + 1).toString(),
      signatures,
      estimate.gasToken,
      ZERO_ADDRESS
    );
    return result;
  }

  private transferTokenPayload(tokenAddress: string, recipient: string, amount: string): string {
    let token = new this.layer2Web3.eth.Contract(ERC20ABI as AbiItem[], tokenAddress);
    return token.methods.transfer(recipient, amount).encodeABI();
  }

  private async setSupplierInfoDIDPayload(infoDID: string): Promise<string> {
    let supplierManager = new this.layer2Web3.eth.Contract(
      SupplierManagerABI as AbiItem[],
      await getAddress('supplierManager', this.layer2Web3)
    );
    return supplierManager.methods.setSupplierInfoDID(infoDID).encodeABI();
  }
}
