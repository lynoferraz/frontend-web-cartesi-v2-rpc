// Copyright 2022 Cartesi Pte. Ltd.

// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License. You may obtain a copy
// of the license at http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations
// under the License.

import React, { useState } from "react";
import { ethers } from "ethers";
import { useRollups } from "./useRollups";
import { useWallets } from "@web3-onboard/react";
import { useSetChain } from "@web3-onboard/react";
import { IERC1155__factory, IERC20__factory, IERC721__factory } from "./generated/rollups";
import configFile from "./config.json";

import { createWalletClient, custom, keccak256, encodeAbiParameters, encodePacked, decodeAbiParameters, fromHex } from "viem";
import { sepolia } from "viem/chains";

interface IInputPropos {
    dappAddress: string
}

export const Input: React.FC<IInputPropos> = (propos) => {
    const rollups = useRollups(propos.dappAddress);
    const [connectedWallet] = useWallets();
    const [{ connectedChain }] = useSetChain();
    const provider = new ethers.providers.Web3Provider(
        connectedWallet.provider
    );

    const sendAddress = async (str: string) => {
        if (rollups) {
            try {
                await rollups.relayContract.relayDAppAddress(propos.dappAddress);
            } catch (e) {
                console.log(`${e}`);
            }
        }
    };

    const addInput = async (str: string) => {
        if (rollups) {
            try {
                let payload = ethers.utils.toUtf8Bytes(str);
                if (hexInput) {
                    payload = ethers.utils.arrayify('0x' + str);
                }
                await rollups.inputContract.addInput(propos.dappAddress, payload);
            } catch (e) {
                console.log(`${e}`);
            }
        }
    };

    const espressoUrl = "https://query.cappuccino.testnet.espresso.network/v0/submit/submit"
    const nonodoPaioUrl = "http://localhost:8080/transactions"
    // const paioDevSendTransactionUrl = "https://cartesi-paio-avail-turing.fly.dev/transaction"
    // const paioDevNonceUrl = "https://cartesi-paio-avail-turing.fly.dev/nonce"
    const paioDevNonceUrl = "http://localhost:8080/nonce"
    const paioDevSendTransactionUrl = "http://localhost:8080/transaction"

    let typedData = {
        account: "0x" as any,
        domain: {
            name: "CartesiDomain",
            version: "0.0.1",
            chainId: 11155111, // Paio's fixed value for Anvil and Hardhat
            verifyingContract:
                "0x0000000000000000000000000000000000000000",
        } as const,
        types: {
            EIP712Domain: [
                { name: "name", type: "string" },
                { name: "version", type: "string" },
                { name: "chainId", type: "uint256" },
                { name: "verifyingContract", type: "address" },
            ],
            CartesiMessage: [
                { name: "app", type: "address" },
                { name: "nonce", type: "uint64" },
                { name: "max_gas_price", type: "uint128" },
                { name: "data", type: "bytes" },
            ],
        } as const,
        primaryType: "CartesiMessage" as const,
        message: { nonce: BigInt(0), data: "0x" },
    }

    const fetchPaioNonce = async (user: any, application: any) => {
        console.log({user, application})
        const response = await fetch(paioDevNonceUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ msg_sender: user, app_contract: application })
        });

        const responseData = await response.json();
        const nextNonce = responseData.nonce;
        return BigInt(nextNonce)
    }

    const fetchNonce = async (sender: string) => {
        const config: any = configFile;
        const url = `${config[connectedChain!.id].graphqlAPIURL}/graphql`;

        const query = `
            {inputs(where: {msgSender: "${sender}" type: "Espresso"}) {
                totalCount
        }}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query })
        });

        const responseData = await response.json();
        const nextNonce = responseData.data.inputs.totalCount + 1;
        return nextNonce
    }

    const createSigObj = (signature: string) => {
        const without0x = signature.replace(/^0x/, '')
        return {
            r: `0x${without0x.substring(0, 64)}`,
            s: `0x${without0x.substring(64, 128)}`,
            yParity: `0x${parseInt(without0x.substring(128, 130), 16) - 27}`
        }
    }

    const submitToPaioDev = async (signature: string, message: any) => {
        const body = JSON.stringify({
            signature,
            message,
        })
        console.log(`curl -d '${body}' -H "Content-Type: application/json" -X POST ${paioDevSendTransactionUrl}`)
        const response = await fetch(paioDevSendTransactionUrl, {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/json' }
        });
        // console.log(await response.text())
        if (!response.ok) { 
            console.log("submit to Paio failed")
            throw new Error("submit to Paio failed: " + response.text())
        } else {
            return response.json()
        }
    }

    const submitToPaio = async (submitToAvail: any) => {
        const response = await fetch(nonodoPaioUrl, {
            method: 'POST',
            body: JSON.stringify(submitToAvail),
            headers: { 'Content-Type': 'application/json' }
        });
        console.log(await response.text())
        if (!response.ok) { console.log("submit to Paio failed") }
    }

    const addPaioInput = async (namespace: string, payload: string) => {
        if (rollups && provider) {
            const walletClient: any = createWalletClient({
                chain: sepolia,
                transport: custom(window.ethereum!),
            })
            const [account] = await walletClient.getAddresses()
            typedData.account = account

            if (hexCartesiInput) {
                payload = '0x' + payload
            }
            const app = namespace || "0xab7528bb862fb57e8a2bcd567a2e929a0be56a5e"
            const user = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
            const nonce = await fetchPaioNonce(user, app)
            console.log({nonce})
            const message = {
                app,
                nonce: BigInt(nonce), //(await fetchNonce(account.toString())).toString(),
                data: payload,
                max_gas_price: BigInt(10),
            }
            typedData.message = message

            const signature = await walletClient.signTypedData(typedData);
            // const signedMessage = {
            //     signature,
            //     typedData: btoa(JSON.stringify(typedData)),
            // }
            // console.log(signedMessage)
            // Milton request us to use the id from backend
            // const sig = fromHex(signature, "bytes")
            // setCartesiTxId(keccak256(sig))

            const signingMessageAbi = [
                {
                    type: 'address',
                    name: 'app'
                },
                {
                    type: 'uint64',
                    name: 'nonce'
                },
                {
                    type: 'uint128',
                    name: 'max_gas_price'
                },
                {
                    type: 'bytes',
                    name: 'data'
                }
            ];
            // await submitToPaio(signedMessage)
            // const abiEncoder = encodePacked as any
            const abiEncoder = encodeAbiParameters as any
            const hexData = abiEncoder(signingMessageAbi, [
                message.app,
                message.nonce,
                message.max_gas_price,
                message.data
            ]);
            const abiDecoder = decodeAbiParameters as any
            const decoded = abiDecoder(signingMessageAbi, hexData)
            console.log(...decoded)
            console.log({hexData})
            const res = await submitToPaioDev(signature, hexData)
            setCartesiTxId(res.id)
            // await submitToEspresso(namespace, signedMessage)
        }
    };

    const depositErc20ToPortal = async (token: string, amount: number) => {
        try {
            if (rollups && provider) {
                const data = ethers.utils.toUtf8Bytes(`Deposited (${amount}) of ERC20 (${token}).`);
                //const data = `Deposited ${args.amount} tokens (${args.token}) for DAppERC20Portal(${portalAddress}) (signer: ${address})`;
                const signer = provider.getSigner();
                const signerAddress = await signer.getAddress()

                const erc20PortalAddress = rollups.erc20PortalContract.address;
                const tokenContract = signer ? IERC20__factory.connect(token, signer) : IERC20__factory.connect(token, provider);

                // query current allowance
                const currentAllowance = await tokenContract.allowance(signerAddress, erc20PortalAddress);
                if (ethers.utils.parseEther(`${amount}`) > currentAllowance) {
                    // Allow portal to withdraw `amount` tokens from signer
                    const tx = await tokenContract.approve(erc20PortalAddress, ethers.utils.parseEther(`${amount}`));
                    const receipt = await tx.wait(1);
                    const event = (await tokenContract.queryFilter(tokenContract.filters.Approval(), receipt.blockHash)).pop();
                    if (!event) {
                        throw Error(`could not approve ${amount} tokens for DAppERC20Portal(${erc20PortalAddress})  (signer: ${signerAddress}, tx: ${tx.hash})`);
                    }
                }

                await rollups.erc20PortalContract.depositERC20Tokens(token, propos.dappAddress, ethers.utils.parseEther(`${amount}`), data);
            }
        } catch (e) {
            console.log(`${e}`);
        }
    };

    const depositEtherToPortal = async (amount: number) => {
        try {
            if (rollups && provider) {
                const data = ethers.utils.toUtf8Bytes(`Deposited (${amount}) ether.`);
                const txOverrides = { value: ethers.utils.parseEther(`${amount}`) }

                // const tx = await ...
                rollups.etherPortalContract.depositEther(propos.dappAddress, data, txOverrides);
            }
        } catch (e) {
            console.log(`${e}`);
        }
    };

    const transferNftToPortal = async (contractAddress: string, nftid: number) => {
        try {
            if (rollups && provider) {
                const data = ethers.utils.toUtf8Bytes(`Deposited (${nftid}) of ERC721 (${contractAddress}).`);
                //const data = `Deposited ${args.amount} tokens (${args.token}) for DAppERC20Portal(${portalAddress}) (signer: ${address})`;
                const signer = provider.getSigner();
                const signerAddress = await signer.getAddress()

                const erc721PortalAddress = rollups.erc721PortalContract.address;

                const tokenContract = signer ? IERC721__factory.connect(contractAddress, signer) : IERC721__factory.connect(contractAddress, provider);

                // query current approval
                const currentApproval = await tokenContract.getApproved(nftid);
                if (currentApproval !== erc721PortalAddress) {
                    // Allow portal to withdraw `amount` tokens from signer
                    const tx = await tokenContract.approve(erc721PortalAddress, nftid);
                    const receipt = await tx.wait(1);
                    const event = (await tokenContract.queryFilter(tokenContract.filters.Approval(), receipt.blockHash)).pop();
                    if (!event) {
                        throw Error(`could not approve ${nftid} for DAppERC721Portal(${erc721PortalAddress})  (signer: ${signerAddress}, tx: ${tx.hash})`);
                    }
                }

                // Transfer
                rollups.erc721PortalContract.depositERC721Token(contractAddress, propos.dappAddress, nftid, "0x", data);
            }
        } catch (e) {
            console.log(`${e}`);
        }
    };

    const transferErc1155SingleToPortal = async (contractAddress: string, id: number, amount: number) => {
        try {
            if (rollups && provider) {
                const data = ethers.utils.toUtf8Bytes(`Deposited (${amount}) tokens from id (${id}) of ERC1155 (${contractAddress}).`);
                //const data = `Deposited ${args.amount} tokens (${args.token}) for DAppERC20Portal(${portalAddress}) (signer: ${address})`;
                const signer = provider.getSigner();
                const signerAddress = await signer.getAddress()

                const erc1155SinglePortalAddress = rollups.erc1155SinglePortalContract.address;

                const tokenContract = signer ? IERC1155__factory.connect(contractAddress, signer) : IERC1155__factory.connect(contractAddress, provider);

                // query current approval
                const currentApproval = await tokenContract.isApprovedForAll(signerAddress, erc1155SinglePortalAddress);
                if (!currentApproval) {
                    // Allow portal to withdraw `amount` tokens from signer
                    const tx = await tokenContract.setApprovalForAll(erc1155SinglePortalAddress, true);
                    const receipt = await tx.wait(1);
                    const event = (await tokenContract.queryFilter(tokenContract.filters.ApprovalForAll(), receipt.blockHash)).pop();
                    if (!event) {
                        throw Error(`could set approval for DAppERC1155Portal(${erc1155SinglePortalAddress})  (signer: ${signerAddress}, tx: ${tx.hash})`);
                    }
                }

                // Transfer
                rollups.erc1155SinglePortalContract.depositSingleERC1155Token(contractAddress, propos.dappAddress, id, amount, "0x", data);
            }
        } catch (e) {
            console.log(`${e}`);
        }
    };

    const transferErc1155BatchToPortal = async (contractAddress: string, ids: number[], amounts: number[]) => {
        try {
            if (rollups && provider) {
                const data = ethers.utils.toUtf8Bytes(`Deposited (${amounts}) tokens from ids (${ids}) of ERC1155 (${contractAddress}).`);
                //const data = `Deposited ${args.amount} tokens (${args.token}) for DAppERC20Portal(${portalAddress}) (signer: ${address})`;
                const signer = provider.getSigner();
                const signerAddress = await signer.getAddress()

                const erc1155BatchPortalAddress = rollups.erc1155BatchPortalContract.address;

                const tokenContract = signer ? IERC1155__factory.connect(contractAddress, signer) : IERC1155__factory.connect(contractAddress, provider);

                // query current approval
                const currentApproval = await tokenContract.isApprovedForAll(signerAddress, erc1155BatchPortalAddress);
                if (!currentApproval) {
                    // Allow portal to withdraw `amount` tokens from signer
                    const tx = await tokenContract.setApprovalForAll(erc1155BatchPortalAddress, true);
                    const receipt = await tx.wait(1);
                    const event = (await tokenContract.queryFilter(tokenContract.filters.ApprovalForAll(), receipt.blockHash)).pop();
                    if (!event) {
                        throw Error(`could set approval for DAppERC1155Portal(${erc1155BatchPortalAddress})  (signer: ${signerAddress}, tx: ${tx.hash})`);
                    }
                }

                // Transfer
                rollups.erc1155BatchPortalContract.depositBatchERC1155Token(contractAddress, propos.dappAddress, ids, amounts, "0x", data);
            }
        } catch (e) {
            console.log(`${e}`);
        }
    };

    const AddTo1155Batch = () => {
        const newIds = erc1155Ids;
        newIds.push(erc1155Id);
        setErc1155Ids(newIds);
        const newAmounts = erc1155Amounts;
        newAmounts.push(erc1155Amount);
        setErc1155Amounts(newAmounts);
        setErc1155IdsStr("[" + erc1155Ids.join(',') + "]");
        setErc1155AmountsStr("[" + erc1155Amounts.join(',') + "]");
    };

    const Clear1155Batch = () => {
        setErc1155IdsStr("[]");
        setErc1155AmountsStr("[]");
        setErc1155Ids([]);
        setErc1155Amounts([]);
    };

    const [input, setInput] = useState<string>("");
    const [hexInput, setHexInput] = useState<boolean>(false);
    const [hexCartesiInput, setHexCartesiInput] = useState<boolean>(false);
    const [dappAddress, setDappAddress] = useState<string>("");
    const [paioData, setPaioData] = useState<string>("");
    const [erc20Amount, setErc20Amount] = useState<number>(0);
    const [erc20Token, setErc20Token] = useState<string>("");
    const [erc721Id, setErc721Id] = useState<number>(0);
    const [erc721, setErc721] = useState<string>("");
    const [etherAmount, setEtherAmount] = useState<number>(0);
    const [erc1155, setErc1155] = useState<string>("");
    const [erc1155Id, setErc1155Id] = useState<number>(0);
    const [erc1155Amount, setErc1155Amount] = useState<number>(0);
    const [erc1155Ids, setErc1155Ids] = useState<number[]>([]);
    const [erc1155Amounts, setErc1155Amounts] = useState<number[]>([]);
    const [erc1155IdsStr, setErc1155IdsStr] = useState<string>("[]");
    const [erc1155AmountsStr, setErc1155AmountsStr] = useState<string>("[]");
    const [cartesiTxId, setCartesiTxId] = useState<string>("");

    return (
        <div>
            <div>
                Send Address (send relay dapp address) <br />
                <button onClick={() => sendAddress(input)} disabled={!rollups}>
                    Send
                </button>
                <br /><br />
            </div>
            <div>
                Send L1 Input <br />
                Input: <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                />
                <input type="checkbox" checked={hexInput} onChange={(e) => setHexInput(!hexInput)} /><span>Raw Hex </span>
                <button onClick={() => addInput(input)} disabled={!rollups}>
                    Send
                </button>
                <br /><br />
            </div>
            <div>
                Send L2 EIP-712 Input <br />
                App: <input
                    type="text"
                    value={dappAddress}
                    onChange={(e) => setDappAddress(e.target.value)}
                />
                Payload: <input
                    type="text"
                    value={paioData}
                    onChange={(e) => setPaioData(e.target.value)}
                />
                <input type="checkbox" checked={hexCartesiInput} onChange={(e) => setHexCartesiInput(!hexCartesiInput)} /><span>Raw Hex </span>
                <button onClick={() => addPaioInput(dappAddress, paioData)} disabled={!rollups}>
                    Send
                </button>
                <br />
                {cartesiTxId && <div>Input ID: {cartesiTxId}</div>}
                <br />
            </div>
            <div>
                Deposit Ether <br />
                Amount: <input
                    type="number"
                    value={etherAmount}
                    onChange={(e) => setEtherAmount(Number(e.target.value))}
                />
                <button onClick={() => depositEtherToPortal(etherAmount)} disabled={!rollups}>
                    Deposit Ether
                </button>
                <br /><br />
            </div>
            <div>
                Deposit ERC20 <br />
                Address: <input
                    type="text"
                    value={erc20Token}
                    onChange={(e) => setErc20Token(e.target.value)}
                />
                Amount: <input
                    type="number"
                    value={erc20Amount}
                    onChange={(e) => setErc20Amount(Number(e.target.value))}
                />
                <button onClick={() => depositErc20ToPortal(erc20Token, erc20Amount)} disabled={!rollups}>
                    Deposit ERC20
                </button>
                <br /><br />
            </div>
            <div>
                Transfer ERC721 <br />
                Address: <input
                    type="text"
                    value={erc721}
                    onChange={(e) => setErc721(e.target.value)}
                />
                id: <input
                    type="number"
                    value={erc721Id}
                    onChange={(e) => setErc721Id(Number(e.target.value))}
                />
                <button onClick={() => transferNftToPortal(erc721, erc721Id)} disabled={!rollups}>
                    Transfer NFT
                </button>
                <br /><br />
            </div>
            <div>
                Transfer Single ERC1155 <br />
                Address: <input
                    type="text"
                    value={erc1155}
                    onChange={(e) => setErc1155(e.target.value)}
                />
                id: <input
                    type="number"
                    value={erc1155Id}
                    onChange={(e) => setErc1155Id(Number(e.target.value))}
                />
                Amount: <input
                    type="number"
                    value={erc1155Amount}
                    onChange={(e) => setErc1155Amount(Number(e.target.value))}
                />
                <button onClick={() => AddTo1155Batch()} disabled={!rollups}>
                    Add to Batch
                </button>
                <button onClick={() => transferErc1155SingleToPortal(erc1155, erc1155Id, erc1155Amount)} disabled={!rollups}>
                    Transfer Single 1155
                </button>
                <br />
                Transfer ERC1155 Batch <br />
                <span>Ids: {erc1155IdsStr} - Amounts: {erc1155AmountsStr}  </span>
                <button onClick={() => Clear1155Batch()} disabled={!rollups}>
                    Clear Batch
                </button>
                <button onClick={() => transferErc1155BatchToPortal(erc1155, erc1155Ids, erc1155Amounts)} disabled={!rollups}>
                    Transfer Batch 1155
                </button>
            </div>
        </div>
    );
};
