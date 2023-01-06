import { ethers, BigNumber, Wallet } from 'ethers'
import dotenv from'dotenv'
import axios from 'axios'
import crypto from 'crypto'
import BN from 'bignumber.js'
import { _TypedDataEncoder } from 'ethers/lib/utils'
dotenv.config()

const chainId = 5
const providerUrl = process.env.JSON_RPC_PROVIDER
const makerPrivateKey = process.env.TEST_MAKER_PRIVATE_KEY
const provider = new ethers.providers.JsonRpcProvider(providerUrl)
const maker = new ethers.Wallet(makerPrivateKey)
const limitOrderContractAddress = `0xe2E5e33aEc661241b3853a4460F7AabA65e950c3`
const usdtAddress = `0xa93Ef9215b907c19e739E2214e1AA5412a0401B5`
const wethAddress = `0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6`
const newOrderAPI = `https://api.imdev.works/v5/limit-order/limitorder`
const limitOrderListAPI = `https://api.imdev.works/v5/limit-order/limitorder?chainId=5&status=pending,partialfilled&maker=${maker.address}`
const binancePriceAPI = `https://api.binance.com/api/v3/ticker/bookTicker?symbol=ETHUSDT`

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

const getLimitOrderHash = (chainId: number, order): string => {
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

export const generatePseudoRandomSalt = () => {
  return BigNumber.from(crypto.randomBytes(32)).toString()
}

const signLimitOrder = async (signer: Wallet, chainId: number, order) => {
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

export const makerSign = async (maker: Wallet, limitOrderRequest): Promise<any> => {
  limitOrderRequest.taker = limitOrderRequest.taker ? limitOrderRequest.taker : ethers.constants.AddressZero
  limitOrderRequest.salt = limitOrderRequest.salt ? limitOrderRequest.salt : generatePseudoRandomSalt()
  const orderHash = getLimitOrderHash(chainId, limitOrderRequest)
  const makerSig = await signLimitOrder(maker, chainId, limitOrderRequest)
  const limitOrder = {
    ...limitOrderRequest,
    chainId,
    orderHash: orderHash,
    makerSig: makerSig,
    status: 'Pending'
  }
  return limitOrder
}

const cancelAndPlaceNewOrder = async () => {
  const resp = await axios.get(limitOrderListAPI)
  const orders = resp.data
  console.log(orders)
  if (orders.length > 0) {
    // cancel all orders
    const orderHashes = orders.map(order => {
      return order.orderHash
    })
    const message = orderHashes.join(",")
    const cancelSig = await maker.signMessage(message)
    const resp = await axios.put(newOrderAPI, {
      chainId: chainId,
      orderHashes: orderHashes,
      cancelSig: cancelSig
    })
    const result = resp.data
    console.log(result)
    console.log(`cancelled all orders`)
  }

  // new order
  const priceResp = await axios.get(binancePriceAPI)
  const prices = priceResp.data
  const bidPrice = prices.bidPrice
  const usd = 5
  const etherAmount = new BN(usd).div(bidPrice).toFixed(8)
  console.log(`etherAmount: ${etherAmount}`)
  const newOrder = {
    maker: maker.address,
    taker: ethers.constants.AddressZero,
    makerToken: usdtAddress,
    takerToken: wethAddress,
    makerTokenAmount: ethers.utils.parseUnits(usd.toString(), 6).toString(),
    takerTokenAmount: ethers.utils.parseEther(etherAmount).toString(),
    expiry: Math.floor(Date.now() / 1000) + 86400,
    salt: generatePseudoRandomSalt()
  }
  const signedOrder = await makerSign(maker, newOrder)
  console.log(signedOrder)
  const newOrderResult = await axios.post(newOrderAPI, signedOrder)
  const newLimitOrder = newOrderResult.data
  console.log(newLimitOrder)
  console.log(`new order: ${newLimitOrder.orderHash}`)
}

const main = async () => {
  try {
    await cancelAndPlaceNewOrder()
  } catch (e) {
    console.error(e)
  }
  setInterval(async () => {
    let inProgress = false
    if (!inProgress) {
      inProgress = true
      try {
        await cancelAndPlaceNewOrder()
      } catch (e) {
        console.error(e)
      }
      inProgress = false
    }
  }, 15000)
}

main()