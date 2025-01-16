import { defineConfig } from "@wagmi/cli";
import hardhatDeploy from "@sunodo/wagmi-plugin-hardhat-deploy";
import { Application__factory, Outputs__factory, IERC1155__factory } from "@cartesi/rollups";

// import { sepolia } from "@wagmi/core/chains"

const BASE = "node_modules/@cartesi/rollups/export";

export default defineConfig({
  out: "src/generated/rollups.ts",
  contracts: [
    {
      abi: IERC1155__factory.abi,
      name: "IERC1155",
    },
    {
      abi: Outputs__factory.abi,
      name: "Outputs",
    },
    {
      abi: Application__factory.abi,
      name: "ApplicationFactory",
    },
  ],
  plugins: [
    hardhatDeploy({
      directory: `${BASE}/abi`,
      includes: [
        /InputBox/,
        /CartesiDApp/,
        /DAppAddressRelay/,
        /ERC1155SinglePortal/,
        /ERC1155BatchPortal/,
        /ERC20Portal/,
        /ERC721Portal/,
        /EtherPortal/,
      ],
    }),
    // react(),
  ],
});
