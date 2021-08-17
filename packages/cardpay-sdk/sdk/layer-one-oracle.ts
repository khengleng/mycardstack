import BN from 'bn.js';
import Web3 from 'web3';
import { AbiItem } from 'web3-utils';
import CHAINLINK_PRICEFEED_ABI from '../contracts/abi/chainlink-aggregator-v3';
import { getAddress } from '../contracts/addresses';
import { safeFloatConvert } from './utils/general-utils';

export interface ILayerOneOracle {
  ethToUsd(ethAmount: string): Promise<number>;
  getEthToUsdUpdatedAt(): Promise<Date>;
}

const ethDecimals = new BN('18');
const ten = new BN('10');

export default class LayerOneOracle implements ILayerOneOracle {
  constructor(private layer1Web3: Web3) {}

  async ethToUsd(ethAmount: string): Promise<number> {
    let ethToUsdAddress = await getAddress('chainlinkEthToUsd', this.layer1Web3);
    let oracle = new this.layer1Web3.eth.Contract(CHAINLINK_PRICEFEED_ABI as AbiItem[], ethToUsdAddress);
    let roundData = await oracle.methods.latestRoundData().call();
    let usdRawRate = new BN(roundData.answer);
    let oracleDecimals = Number(await oracle.methods.decimals().call());
    let rawAmount = usdRawRate.mul(new BN(ethAmount)).div(ten.pow(ethDecimals));
    return safeFloatConvert(rawAmount, oracleDecimals);
  }

  async getEthToUsdUpdatedAt(): Promise<Date> {
    let ethToUsdAddress = await getAddress('chainlinkEthToUsd', this.layer1Web3);
    let oracle = new this.layer1Web3.eth.Contract(CHAINLINK_PRICEFEED_ABI as AbiItem[], ethToUsdAddress);
    let roundData = await oracle.methods.latestRoundData().call();
    return new Date(roundData.updatedAt * 1000);
  }
}
