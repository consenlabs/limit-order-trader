import { _TypedDataEncoder } from "@ethersproject/hash"
import { Token } from "@uniswap/sdk-core"
import axios from "axios"
import dotenv from "dotenv"
import { BigNumber, Wallet } from "ethers"
import LimitOrderArtifact from "./abi/limitOrder.json"
import UserProxyArtifact from "./abi/UserProxy.json"
import { TransactionRequest } from '@ethersproject/abstract-provider'
import { ethers } from "hardhat"
import crypto from 'crypto'
dotenv.config()

const targetOrderHash = `0x74864050244b9237eebee6149642e34eaa394237cf5d8fd070ca3419ed98f12e`
const usdtAddress = `0xa93Ef9215b907c19e739E2214e1AA5412a0401B5`
const wethAddress = `0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6`
const tokenlonContractAddress = `0x085966eE3E32A0Da16467569512535D38626B547`
const allowanceTargetAddress = `0x63dD46f09C2Eab341b6affa8261024e85CDF4531`
const limitOrderContractAddress = `0xe2E5e33aEc661241b3853a4460F7AabA65e950c3`
const newOrderAPI = `https://api.imdev.works/v5/limit-order/limitorder`
const limitOrderListAPI = `https://api.imdev.works/v5/limit-order/limitorder?chainId=5&status=pending,partialfilled`
const createTradeAPI = `https://api.imdev.works/v5/limit-order/trade`
const privateKey = process.env.TEST_MAKER_PRIVATE_KEY
let chainId
let tokenlonContract
let limitOrderContract
let wallet: Wallet
let newLimitOrder

export enum SignatureType {
  Illegal = '00', // 0x00, default value
  Invalid = '01', // 0x01
  EIP712 = '02', // 0x02
  EthSign = '03', // 0x03
  WalletBytes = '04', // 0x04  standard 1271 wallet type
  WalletBytes32 = '05', // 0x05  standard 1271 wallet type
  Wallet = '06', // 0x06  0x wallet type for signature compatibility
  NSignatureTypes = '07', // 0x07, number of signature types. Always leave at end.
}

export interface LimitOrderRequest {
  maker: string
  taker?: string
  makerToken: string
  takerToken: string
  makerTokenAmount: string
  takerTokenAmount: string
  expiry: number
  salt?: string
}

export interface SignedLimitOrder {
  id?: number
  maker: string
  taker?: string
  makerToken: string
  takerToken: string
  makerTokenAmount: string
  takerTokenAmount: string
  expiry: number
  salt?: string
  status?: string
  orderHash: string
  chainId: number
  makerSig: string
  createdAt?: string
  updatedAt?: string
}

export interface LimitOrder {
  id?: number
  makerToken: string
  takerToken: string
  makerTokenAmount: string
  takerTokenAmount: string
  maker: string
  taker?: string
  expiry: number
  salt: string
  trades?: LimitOrderTrade[]
  status: string
  orderHash: string
  remainQuota?: string
  makerSig: string
  chainId: number
  isValid?: boolean
  score?: string | number
  toToken?: Token
  fromToken?: Token
  estimatedMarketRate?: string
  diffPercentage?: BigNumber
  scoreTime?: string
  createdAt?: string
  cancelledAt?: string
  updatedAt?: string
}

export interface LimitOrderTrade {
  makerTokenFilledAmount: string
  takerTokenFilledAmount: string
  makerTokenFee: string
  takerTokenFee: string
  expiry: number
  salt: string
  recipient: string
  takerSig: string
  mustFillExactly: boolean
  type: string
  relayer: string
  protocol: string
  data: string
  profitRecipient: string
  takerTokenProfit: string
  takerTokenProfitFee: string
  takerTokenProfitBackToMaker: string
  txid: string
  status: string
}

export type TraderParams = {
  taker: string
  recipient: string
  takerTokenAmount: string
  salt: string
  expiry: string | number
  takerSig?: string
}

export type CoordinatorParams = {
  sig: string
  expiry: number
  salt: string
}

const generatePseudoRandomSalt = () => {
  return BigNumber.from(crypto.randomBytes(32)).toString()
}

const getFillHash = (chainId: number, limitOrder: LimitOrder, traderParams: TraderParams): string => {
  const domain = {
    name: 'Tokenlon',
    version: 'v5',
    chainId: chainId,
    verifyingContract: limitOrderContractAddress,
  }

  const types = {
    Fill: [
      { name: 'orderHash', type: 'bytes32' },
      { name: 'taker', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'takerTokenAmount', type: 'uint256' },
      { name: 'takerSalt', type: 'uint256' },
      { name: 'expiry', type: 'uint64' },
    ],
  }

  const value = {
    orderHash: limitOrder.orderHash,
    taker: traderParams.taker,
    recipient: traderParams.recipient,
    takerTokenAmount: traderParams.takerTokenAmount,
    takerSalt: traderParams.salt,
    expiry: traderParams.expiry,
  }

  return _TypedDataEncoder.hash(domain, types, value)
}

const getLimitOrderHash = (chainId: number, order: LimitOrderRequest): string => {
  const domain = {
    name: 'Tokenlon',
    version: 'v5',
    chainId: chainId,
    verifyingContract: limitOrderContractAddress,
  }

  const types = {
    Order: [
      { name: 'makerToken', type: 'address' },
      { name: 'takerToken', type: 'address' },
      { name: 'makerTokenAmount', type: 'uint256' },
      { name: 'takerTokenAmount', type: 'uint256' },
      { name: 'maker', type: 'address' },
      { name: 'taker', type: 'address' },
      { name: 'salt', type: 'uint256' },
      { name: 'expiry', type: 'uint64' },
    ],
  }

  const value = {
    makerToken: order.makerToken,
    takerToken: order.takerToken,
    makerTokenAmount: order.makerTokenAmount,
    takerTokenAmount: order.takerTokenAmount,
    maker: order.maker,
    taker: order.taker,
    salt: order.salt ? order.salt : generatePseudoRandomSalt(),
    expiry: order.expiry,
  }

  return _TypedDataEncoder.hash(domain, types, value)
}

const signFill = async (signer: Wallet, chainId: number, limitOrder: LimitOrder, traderParams: TraderParams) => {
  const domain = {
      name: "Tokenlon",
      version: "v5",
      chainId: chainId,
      verifyingContract: limitOrderContractAddress,
  }

  const types = {
    Fill: [
      { name: 'orderHash', type: 'bytes32' },
      { name: 'taker', type: 'address' },
      { name: 'recipient', type: 'address' },
      { name: 'takerTokenAmount', type: 'uint256' },
      { name: 'takerSalt', type: 'uint256' },
      { name: 'expiry', type: 'uint64' },
    ],
  }

  const fill = {
    orderHash: limitOrder.orderHash,
    taker: traderParams.taker,
    recipient: traderParams.recipient,
    takerTokenAmount: traderParams.takerTokenAmount,
    takerSalt: traderParams.salt,
    expiry: traderParams.expiry,
  }

  const signatureTypedData = await signer._signTypedData(domain, types, fill)

  const paddedNonce = "00".repeat(32)
  const composedSig = signatureTypedData + paddedNonce + SignatureType.EIP712

  return composedSig
}

const signLimitOrder = async (signer: Wallet, chainId: number, order: LimitOrderRequest) => {
  console.log(`LIMIT_ORDER[chainId] ${limitOrderContractAddress}`)
  const domain = {
      name: "Tokenlon",
      version: "v5",
      chainId: chainId,
      verifyingContract: limitOrderContractAddress,
  }

  const types = {
      Order: [
          { name: "makerToken", type: "address" },
          { name: "takerToken", type: "address" },
          { name: "makerTokenAmount", type: "uint256" },
          { name: "takerTokenAmount", type: "uint256" },
          { name: "maker", type: "address" },
          { name: "taker", type: "address" },
          { name: "salt", type: "uint256" },
          { name: "expiry", type: "uint64" },
      ],
  }

  const signatureTypedData = await signer._signTypedData(domain, types, order)

  const paddedNonce = "00".repeat(32)
  const composedSig = signatureTypedData + paddedNonce + SignatureType.EIP712

  return composedSig
}

export const createTrade = async (relayerAddress: string, limitOrder: LimitOrder, traderParams: TraderParams) => {
  const createTradeRequest = {
    chainId: chainId,
    tradeType: 'FilledByTrader',
    relayer: relayerAddress,
    orderHash: limitOrder.orderHash,
    traderParams: traderParams
  }

  try {
    const resp = await axios.post(createTradeAPI, createTradeRequest)
    const result = resp.data
    return result
  } catch (e) {
    console.error(e)
  }
}

export const makeCalldata = (
  limitOrder: LimitOrder,
  traderParams: TraderParams,
  coordinatorParams: CoordinatorParams
) => {
  console.log(limitOrder)
  console.log(traderParams)
  console.log(coordinatorParams)
  const tradePayload = limitOrderContract.interface.encodeFunctionData('fillLimitOrderByTrader', [
    [
      limitOrder.makerToken,
      limitOrder.takerToken,
      limitOrder.makerTokenAmount,
      limitOrder.takerTokenAmount,
      limitOrder.maker,
      limitOrder.taker,
      limitOrder.salt,
      limitOrder.expiry,
    ],
    limitOrder.makerSig,
    [
      traderParams.taker,
      traderParams.recipient,
      traderParams.takerTokenAmount,
      traderParams.salt,
      traderParams.expiry,
      traderParams.takerSig,
    ],
    [
      coordinatorParams.sig,
      coordinatorParams.salt,
      coordinatorParams.expiry
    ],
  ])

  return tradePayload
}

function getTraderParams(taker: Wallet, limitOrder: LimitOrder) {
  const traderParams: TraderParams = {
    taker: taker.address,
    recipient: taker.address,
    // fill the rest of tokerTokenAmount
    takerTokenAmount: limitOrder.remainQuota,
    salt: generatePseudoRandomSalt(),
    expiry: (Math.floor(Date.now() / 1000) + 86400)
  }

  return traderParams
}

const makerSign = async (maker: Wallet, limitOrderRequest: LimitOrderRequest): Promise<SignedLimitOrder> => {
  limitOrderRequest.taker = limitOrderRequest.taker ? limitOrderRequest.taker : ethers.constants.AddressZero
  limitOrderRequest.salt = limitOrderRequest.salt ? limitOrderRequest.salt : generatePseudoRandomSalt()
  const orderHash = getLimitOrderHash(chainId, limitOrderRequest)
  const makerSig = await signLimitOrder(maker, chainId, limitOrderRequest)
  const limitOrder: SignedLimitOrder = {
    ...limitOrderRequest,
    chainId,
    orderHash: orderHash,
    makerSig: makerSig,
    status: 'Pending'
  }
  return limitOrder
}

const takerSign = async (taker: Wallet, limitOrder: LimitOrder, traderParams: TraderParams): Promise<TraderParams> => {
  const fillHash = getFillHash(chainId, limitOrder, traderParams)
  console.log(`fillHash: ${fillHash}`)
  const takerSig = await signFill(taker, chainId, limitOrder, traderParams)
  traderParams.takerSig = takerSig
  return traderParams
}

describe('Limit Order', async () => {
  before(async () => {
    const network = await ethers.provider.getNetwork()
    chainId = network.chainId
    wallet = new ethers.Wallet(privateKey, ethers.provider)
    tokenlonContract = new ethers.Contract(tokenlonContractAddress, UserProxyArtifact.abi, ethers.provider)
    limitOrderContract = new ethers.Contract(limitOrderContractAddress, LimitOrderArtifact.abi, ethers.provider)
  })

  it(`Should create a new limit order`, async () => {
    const makerWallet = wallet
    console.log(privateKey)
    console.log(`chainId: ${chainId}`)
    console.log(wallet)
    console.log(ethers.constants.MaxUint256.toHexString())
    const newOrder: LimitOrderRequest = {
      maker: wallet.address,
      taker: ethers.constants.AddressZero,
      makerToken: usdtAddress,
      takerToken: wethAddress,
      makerTokenAmount: ethers.utils.parseUnits('12', 6).toString(),
      takerTokenAmount: ethers.utils.parseEther('0.01').toString(),
      expiry: Math.floor(Date.now() / 1000) + 86400,
      salt: generatePseudoRandomSalt()
    }
    const signedOrder = await makerSign(makerWallet, newOrder)
    console.log(signedOrder)
    const newOrderResult = await axios.post(newOrderAPI, signedOrder)
    console.log(newOrderResult)
    const limitOrder = newOrderResult.data
    newLimitOrder = limitOrder
    console.log(`newLimitOrder: ${JSON.stringify(newLimitOrder)}`)
  })

  it(`Should fill limit order by trader`, async () => {
    const result = await axios.get(limitOrderListAPI)
    const limitOrders = result.data
    console.log(JSON.stringify(limitOrders))
    console.log(typeof limitOrders)
    for (let i = 0; i < limitOrders.length; i++) {
      const limitOrder = limitOrders[i]
      if (limitOrder.orderHash === newLimitOrder.orderHash) {
        console.log(limitOrder)
        // takerWallet should be OneBit's wallet
        const takerWallet = wallet
        let traderParams = getTraderParams(takerWallet, limitOrder)
        traderParams = await takerSign(takerWallet, limitOrder, traderParams)
        console.log(`traderParams: ${JSON.stringify(traderParams)}`)
        const coordinatorResp = await createTrade(takerWallet.address, limitOrder, traderParams)
        console.log(`coordinatorResp: ${JSON.stringify(coordinatorResp)}`)
        const coordinatorParams: CoordinatorParams = {
          sig: coordinatorResp.sig,
          expiry: coordinatorResp.expiry,
          salt: coordinatorResp.salt
        }
        const payload = makeCalldata(limitOrder, traderParams, coordinatorParams)
        const data = await tokenlonContract.interface.encodeFunctionData('toLimitOrder', [ payload ])
        const suggestedGasPrice = ethers.utils.parseUnits('10', 'gwei').toString()
        const txRequest: TransactionRequest = {
          data: data,
          from: takerWallet.address,
          to: tokenlonContract.address,
          value: '0x0',
          gasPrice: ethers.BigNumber.from(suggestedGasPrice.toString()),
          gasLimit: 3000000
        }
        console.log(txRequest)
        const tx = await wallet.sendTransaction(txRequest)
        console.log(tx)
        const receipt = await tx.wait()
        console.log(receipt)
      }
    }
  })
})