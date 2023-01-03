# Tokenlon Limit Order

There are three steps for a market maker to integrate Tokenlon limit order.

* Fetch user orders
* Find a fillable order and get coordinator's signature
* Send a transaction to a specific blockchain

We only provide a testnet environment (Goerli) for now.

## Fetch User Orders

You could acess user orders via the GET API below.

```
curl -X GET 'https://api.imdev.works/v5/limit-order/limitorder?chainId=5&status=pending,partialfilled'
```

Here is a order that a user(0xA307D607Ad04622fAF7F3A173314509dC69CAb67) wants to sell 12000000 0xa93Ef9215b907c19e739E2214e1AA5412a0401B5 tokens(6 decimals) for 10000000000000000 0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6 tokens(18 decimals) and the fillable remain amount of the order in taker token units is 10000000000000000. So the pricing is `12 0xa93Ef9215b907c19e739E2214e1AA5412a0401B5 -> 0.01 0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6`

```json
{
  "cancelledAt": "",
  "chainId": 5,
  "createdAt": "2022-12-29T03:50:57Z",
  "expiry": 1672372254,
  "id": 651,
  "maker": "0xA307D607Ad04622fAF7F3A173314509dC69CAb67",
  "makerSig": "0xce2d30b61b07a93162eeff015b6c8650874c8ac9fd083d96a02bd8f40ac392d816b43b71389ee2ee9a2cf0e809ee037074ded2fd493821fec84129caeef9e93b1c000000000000000000000000000000000000000000000000000000000000000002",
  "makerToken": "0xa93Ef9215b907c19e739E2214e1AA5412a0401B5",
  "makerTokenAmount": "12000000",
  "orderHash": "0x33474ad18cab17fd511db7261d12d48adfd324407103f2fd2bf4315c98a71e49",
  "remainQuota": "10000000000000000", // taker token units
  "salt": "81288522724654308173109929826343836162437203565474825798641954992826188088358",
  "status": "pending",
  "taker": "0x0000000000000000000000000000000000000000",
  "takerToken": "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  "takerTokenAmount": "10000000000000000",
  "trades": [
    ...
  ],
  "updatedAt": "2022-12-29T04:08:37Z"
}
```

Each order contains a user target pricing and token addresses. market makers should check these pricing for themselves, in order to make sure they could profit from a order.

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
    /*
    {
      sig: '0xadcaab370e1e2eaba02e491c834bc730d807ded0b8fc4c8a327febdc96d5c2783716bcced54be0125880008c0962dd7ad9cbb36f76124874479a892849beedd81b000000000000000000000000000000000000000000000000000000000000000002',
      expiry: 1672285977,
      salt: '53877022432961262906682897356647888273613148815032923035962179578712288650041'
    }
    */
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