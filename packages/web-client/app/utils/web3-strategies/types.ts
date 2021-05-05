/* eslint-disable no-unused-vars */
import { WalletProvider } from '../wallet-providers';
import { BigNumber } from '@ethersproject/bignumber';
import { TransactionReceipt } from 'web3-core';
import { AbiItem } from 'web3-utils';
import { ERC20ABI } from '@cardstack/cardpay-sdk/index.js';

export interface Web3Strategy {
  chainName: string;
  isConnected: boolean;
  walletConnectUri: string | undefined;
  disconnect(): Promise<void>;
}

export interface Layer1Web3Strategy extends Web3Strategy {
  defaultTokenBalance: BigNumber | undefined;
  currentProviderId: string | undefined;
  daiBalance: BigNumber | undefined;
  cardBalance: BigNumber | undefined;
  connect(walletProvider: WalletProvider): Promise<void>;
  waitForAccount: Promise<void>;
  approve(amountInWei: BigNumber, token: string): Promise<TransactionReceipt>;
  relayTokens(
    token: ChainAddress,
    destinationAddress: ChainAddress,
    amountInWei: BigNumber
  ): Promise<TransactionReceipt>;
  blockExplorerUrl(txnHash: TransactionHash): string;
  bridgeExplorerUrl(txnHash: TransactionHash): string;
}

export interface Layer2Web3Strategy extends Web3Strategy {
  defaultTokenBalance: BigNumber | undefined;
  blockExplorerUrl(txnHash: TransactionHash): string;
  getBlockHeight(): Promise<BigNumber>;
  awaitBridged(
    fromBlock: number,
    receiver: ChainAddress
  ): Promise<TransactionReceipt>;
}

export type TransactionHash = string;
export type ChainAddress = string;

export class Token {
  symbol: string;
  name: string;
  address: ChainAddress;
  abi = ERC20ABI as AbiItem[];

  constructor(symbol: string, name: string, address: string) {
    this.symbol = symbol;
    this.name = name;
    this.address = address;
  }
}
