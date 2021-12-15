import { TokenBalance } from '.'

export interface TokensByChain {
  [chainId: number]: TokenDefinition[]
}

export function groupByChain (grouped: TokensByChain, token: TokenDefinition) {
  return {
    ...grouped,
    [token.chainId]: [...(grouped[token.chainId] || []), token]
  }
}

export function relevantBalances (balances: TokenBalance[], tokenBalances: TokenBalance[]) {
  const positiveBalances = tokenBalances.filter(t => parseInt(t.balance) > 0)

  return [...balances, ...positiveBalances]
}