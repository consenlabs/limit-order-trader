# Tokenlon Limit Order

There are three steps for a market maker to integrate Tokenlon limit order.

* Fetch user orders
* Find a fillable order and get coordinator's signature
* Send a transaction to a specific blockchain

We only provide a testnet environment (Goerli) for market maker integration.

## Fetch User Orders

You could acess user orders via the GET API below.

```
curl -X GET 'https://api.imdev.works/v5/limit-order/limitorder?chainId=5&status=pending,partialfilled'
```

Each order contains a user target pricing and tokens addresses. market makers should check these pricing for themselves, in order to make sure they could profit from a order.

## Get Coordinator's Signature

Once a market maker found a profitable order, it need to create a trade request to monopolize the order. There's example code [in the script](https://github.com/consenlabs/limit-order-trader/blob/master/test/fillLimitOrderByTrader.ts#L270).

```typescript
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
```

## Sending a Transaction

After getting a coordinator's signature, a market maker could send the transaction to fill the limit order. Check the code snippet to [make a transaction calldata](https://github.com/consenlabs/limit-order-trader/blob/master/test/fillLimitOrderByTrader.ts#L417)

```typescript
export const makeCalldata = (
  limitOrder: LimitOrder,
  traderParams: TraderParams,
  coordinatorParams: CoordinatorParams
) => {
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
...
const payload = makeCalldata(limitOrder, traderParams, coordinatorParams)
const data = await tokenlonContract.interface.encodeFunctionData('toLimitOrder', [ payload ])
// should set a proper gas price in a production environment
const suggestedGasPrice = ethers.utils.parseUnits('10', 'gwei').toString()
const txRequest: TransactionRequest = {
  data: data,
  from: takerWallet.address,
  to: tokenlonContract.address,
  value: '0x0',
  // the gas fee would also be part of the market maker's costs, should adjust the gas fee to maintain the order profits
  gasPrice: ethers.BigNumber.from(suggestedGasPrice.toString()),
  gasLimit: 3000000
}
console.log(txRequest)
const tx = await wallet.sendTransaction(txRequest)
console.log(tx)
const receipt = await tx.wait()
console.log(receipt)
```

## Running tests

The script itself would send a new Tokenlon limit order to Tokenlon service, and fill the limit order right away in a forked mainnet environment. 

```
npx hardhat test test/fillLimitOrderByTrader.ts
```