import { intToHex } from 'ethereumjs-util'
import log from 'electron-log'

import { RawTransaction } from './index'

const oneGwei = 1e9

// TODO: move these to a declaration file?
interface GasEstimateResponse {
  error?: string,
  result: string
}

interface FeeHistoryResponse {
  baseFeePerGas: string[],
  gasUsedRatio: number[],
  reward: Array<string[]>
}

interface ProviderRequest {
  method: string,
  params: any[],
  id: number,
  jsonrpc: '2.0'
}

interface Block {
  baseFee: number,
  rewards: number[],
  gasUsedRatio: number
}

interface Eip1559GasFees {
  maxBaseFeePerGas: string,
  maxPriorityFeePerGas: string,
  maxFeePerGas: string
}

function rpcPayload (method: string, params: any[], id = 1): ProviderRequest {
  return {
    method,
    params,
    id,
    jsonrpc: '2.0'
  }
}

export default class GasCalculator {
  private connection
  private defaultGasLevel

  constructor (connection: any  /* Chains */, defaultGasLevel: string) {
    this.connection = connection
    this.defaultGasLevel = defaultGasLevel
  }

  getGasPrice (rawTx: RawTransaction) {
    return this.defaultGasLevel
  }
  
  async getGasEstimate (rawTx: RawTransaction) {

    const targetChain = {
      type: 'ethereum',
      id: parseInt(rawTx.chainId, 16)
    }

    return new Promise<string>((resolve, reject) => {
      const payload = rpcPayload('eth_estimateGas', [rawTx])

      this.connection.send(payload, (response: GasEstimateResponse) => {
        if (response.error) {
          reject(response.error)
        } else {
          resolve(response.result)
        }
      }, targetChain)
    })
  }

  async _getFeeHistory(numBlocks: number, rewardPercentiles: number[], newestBlock = 'latest'): Promise<Block[]> {
    const payload = rpcPayload('eth_feeHistory', [numBlocks, newestBlock, rewardPercentiles])

    const feeHistory: FeeHistoryResponse = await this.connection.send(payload)

    const feeHistoryBlocks = feeHistory.baseFeePerGas.map((baseFee, i) => {
      return {
        baseFee: parseInt(baseFee, 16),
        gasUsedRatio: feeHistory.gasUsedRatio[i],
        rewards: (feeHistory.reward[i] || []).map(reward => parseInt(reward, 16))
      }
    })

    return feeHistoryBlocks
  }
  
  async getFeePerGas (): Promise<Eip1559GasFees> {
    // fetch the last 10 blocks and the bottom 10% of priority fees paid for each block
    try {
      const blocks = await this._getFeeHistory(10, [10])
      
      // plan for max fee of 2 full blocks, each one increasing the fee by 12.5%
      const nextBlockFee = blocks[blocks.length - 1].baseFee // base fee for next block
      const calculatedFee = Math.ceil(nextBlockFee * 1.125 * 1.125)

      // only consider priority fees from blocks that aren't almost empty or almost full
      const eligibleRewardsBlocks = blocks.filter(block => block.gasUsedRatio >= 0.1 && block.gasUsedRatio <= 0.9).map(block => block.rewards[0])
      const medianReward = eligibleRewardsBlocks.sort()[Math.floor(eligibleRewardsBlocks.length / 2)] || oneGwei

      return {
        maxBaseFeePerGas: intToHex(calculatedFee),
        maxPriorityFeePerGas: intToHex(medianReward),
        maxFeePerGas: intToHex(calculatedFee + medianReward)
      }
    } catch (e) {
      const defaultGas = {
        maxBaseFeePerGas: this.defaultGasLevel,
        maxPriorityFeePerGas: intToHex(oneGwei),
        maxFeePerGas: intToHex(parseInt(this.defaultGasLevel) + oneGwei)
      }

      log.warn('could not load fee history, using default', defaultGas)
      return defaultGas
    }
  }
}
