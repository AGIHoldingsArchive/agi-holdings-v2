import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import { Transfer as TransferEvent } from "../generated/Treasury/ERC20"
import { Treasury, Transfer, FundedAgent, RevenuePayment, DailyStat } from "../generated/schema"

const TREASURY = "0xc2f123b6c04e7950c882df2c90e9c79ea176c91d"
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
const WETH = "0x4200000000000000000000000000000000000006"

// Minimum amount to be considered a funding (100 USDC = 100000000)
const MIN_FUNDING_AMOUNT = BigInt.fromI32(100000000)

function getOrCreateTreasury(): Treasury {
  let treasury = Treasury.load("main")
  if (!treasury) {
    treasury = new Treasury("main")
    treasury.ethBalance = BigInt.fromI32(0)
    treasury.usdcBalance = BigInt.fromI32(0)
    treasury.wethBalance = BigInt.fromI32(0)
    treasury.totalUSD = BigInt.fromI32(0)
    treasury.totalInvested = BigInt.fromI32(0)
    treasury.totalRevenueReceived = BigInt.fromI32(0)
    treasury.agentsFunded = 0
    treasury.lastUpdated = BigInt.fromI32(0)
  }
  return treasury
}

function getDayId(timestamp: BigInt): string {
  let dayTimestamp = timestamp.toI32() / 86400
  return dayTimestamp.toString()
}

export function handleTransfer(event: TransferEvent): void {
  let treasury = getOrCreateTreasury()
  let from = event.params.from.toHexString().toLowerCase()
  let to = event.params.to.toHexString().toLowerCase()
  let amount = event.params.value
  let token = event.address.toHexString().toLowerCase()
  
  // Create transfer record
  let transfer = new Transfer(event.transaction.hash.toHex() + "-" + event.logIndex.toString())
  transfer.from = event.params.from
  transfer.to = event.params.to
  transfer.amount = amount
  transfer.timestamp = event.block.timestamp
  transfer.txHash = event.transaction.hash
  transfer.isIncoming = to == TREASURY
  transfer.isOutgoing = from == TREASURY
  
  // Determine token type
  if (token == USDC) {
    transfer.token = "USDC"
  } else if (token == WETH) {
    transfer.token = "WETH"
  } else {
    transfer.token = "OTHER"
  }
  
  transfer.save()
  
  // Update treasury balances
  if (to == TREASURY) {
    // Incoming transfer - revenue payment
    if (token == USDC) {
      treasury.usdcBalance = treasury.usdcBalance.plus(amount)
      treasury.totalRevenueReceived = treasury.totalRevenueReceived.plus(amount)
      
      // Create revenue payment record
      let payment = new RevenuePayment(event.transaction.hash.toHex())
      payment.from = event.params.from
      payment.amount = amount
      payment.token = "USDC"
      payment.timestamp = event.block.timestamp
      payment.txHash = event.transaction.hash
      
      // Try to link to funded agent
      let agent = FundedAgent.load(from)
      if (agent) {
        payment.agent = agent.id
        agent.totalRevenuePaid = agent.totalRevenuePaid.plus(amount)
        agent.lastPayment = event.block.timestamp
        agent.save()
      }
      payment.save()
    } else if (token == WETH) {
      treasury.wethBalance = treasury.wethBalance.plus(amount)
      treasury.totalRevenueReceived = treasury.totalRevenueReceived.plus(amount)
    }
  }
  
  if (from == TREASURY) {
    // Outgoing transfer - funding
    if (token == USDC) {
      treasury.usdcBalance = treasury.usdcBalance.minus(amount)
      
      // If significant amount, it's likely funding
      if (amount.ge(MIN_FUNDING_AMOUNT)) {
        treasury.totalInvested = treasury.totalInvested.plus(amount)
        
        // Create or update funded agent
        let agent = FundedAgent.load(to)
        if (!agent) {
          agent = new FundedAgent(to)
          agent.wallet = event.params.to
          agent.fundedAmount = BigInt.fromI32(0)
          agent.totalRevenuePaid = BigInt.fromI32(0)
          agent.isActive = true
          treasury.agentsFunded = treasury.agentsFunded + 1
        }
        agent.fundedAmount = agent.fundedAmount.plus(amount)
        agent.fundedAt = event.block.timestamp
        agent.txHash = event.transaction.hash
        agent.save()
      }
    } else if (token == WETH) {
      treasury.wethBalance = treasury.wethBalance.minus(amount)
    }
  }
  
  // Update daily stats
  let dayId = getDayId(event.block.timestamp)
  let dailyStat = DailyStat.load(dayId)
  if (!dailyStat) {
    dailyStat = new DailyStat(dayId)
    dailyStat.date = dayId
    dailyStat.inflow = BigInt.fromI32(0)
    dailyStat.outflow = BigInt.fromI32(0)
    dailyStat.netChange = BigInt.fromI32(0)
    dailyStat.treasuryBalance = BigInt.fromI32(0)
  }
  
  if (to == TREASURY) {
    dailyStat.inflow = dailyStat.inflow.plus(amount)
  }
  if (from == TREASURY) {
    dailyStat.outflow = dailyStat.outflow.plus(amount)
  }
  dailyStat.netChange = dailyStat.inflow.minus(dailyStat.outflow)
  dailyStat.save()
  
  treasury.lastUpdated = event.block.timestamp
  treasury.save()
}

export function handleBlock(block: ethereum.Block): void {
  // Update ETH balance periodically (every ~100 blocks)
  if (block.number.mod(BigInt.fromI32(100)).equals(BigInt.fromI32(0))) {
    let treasury = getOrCreateTreasury()
    treasury.lastUpdated = block.timestamp
    treasury.save()
  }
}
