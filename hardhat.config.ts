import * as dotenv from 'dotenv'
import { HardhatUserConfig } from 'hardhat/config'
import '@nomiclabs/hardhat-waffle'
import "@nomiclabs/hardhat-ethers"
import 'solidity-coverage'

dotenv.config()
const chainId = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 5
const providerUrl = process.env.JSON_RPC_PROVIDER as string
console.log(`providerUrl: ${providerUrl}`)

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  solidity: '0.8.4',
  networks: {
    hardhat: {
      chainId: chainId,
      blockGasLimit: 1000000000,
      forking: {
        blockNumber: 8218812,
        url: providerUrl,
      }
    },
  },
}

export default config
