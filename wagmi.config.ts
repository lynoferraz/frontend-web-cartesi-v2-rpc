import { defineConfig } from "@wagmi/cli";
import hardhatDeploy from "@sunodo/wagmi-plugin-hardhat-deploy";
// import { sepolia } from "@wagmi/core/chains"
export default defineConfig({
  out: "src/generated/rollups.ts",
  plugins: [
    hardhatDeploy({
      directory: "node_modules/@cartesi/rollups/export/abi",
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
