import React, { useEffect, useState } from "react";
import { BaseError, decodeAbiParameters, decodeFunctionData, parseAbiParameters, size, slice } from 'viem'
import { getGraphqlUrl, getDelegatedCallVoucher, getDelegatedCallVouchers, PartialDelegatedCallVoucher } from './utils/graphql'
import { Outputs__factory, Application__factory } from "@cartesi/rollups";
import { getClient, getWalletClient, INodeComponentProps } from "./utils/chain";

type ExtendedDCVoucher = PartialDelegatedCallVoucher & {
    executed?: boolean;
};

export const DelegateCallVouchers: React.FC<INodeComponentProps> = (props: INodeComponentProps) => {
    const [fetching, setFetching] = useState<boolean>(false);
    const [error, setError] = useState<string>();
    const [reload, setReload] = useState<number>(0);
    const [dCVouchersData, setDCVouchersData] = useState<PartialDelegatedCallVoucher[]>([]);
    const [dCVoucherToExecute, setDCVoucherToExecute] = useState<ExtendedDCVoucher>();
    const [dCVoucherToExecuteMsg, setDCVoucherToExecuteMsg] = useState<string>();

    useEffect(() => {
        if (!props.chain) {
            setError("No connected chain");
            return;
        }
        const url = getGraphqlUrl(props.chain,props.appAddress);
        if (!url) {
            setError("No chain graphql url");
            return;
        }
        setFetching(true);
        setDCVoucherToExecute(undefined);
        setDCVoucherToExecuteMsg(undefined);
        getDelegatedCallVouchers(url).then(n => {
            setDCVouchersData(n);
            setFetching(false);
        });

    }, [props,reload]);

    if (fetching) return <p>Loading...</p>;
    if (error) return <p>Oh no... {error}</p>;

    if (!dCVouchersData) return <p>No delegated vouchers</p>;

    const dcVouchers = dCVouchersData.map<ExtendedDCVoucher>((node) => {
        const n = node;
        let inputPayload = n?.input?.payload;
        if (inputPayload) {
            inputPayload = inputPayload + " (hex)";
        } else {
            inputPayload = "(empty)";
        }
        let payload = n?.payload;
        if (payload) {
            const { args } = decodeFunctionData({
                abi: Outputs__factory.abi,
                data: payload as `0x${string}`
            })
            const selector = args[2] && size(args[2]) > 4 ? slice(args[2] as `0x${string}`,0,4) : "";
            const data = args[2] && size(args[2]) > 4 ? slice(args[2] as `0x${string}`,4,payload.length) : "0x";

            switch(selector.toLowerCase()) {
                case '0xa9059cbb': {
                    // erc20 transfer;
                    const decode = decodeAbiParameters(
                        parseAbiParameters('address receiver, uint256 amount'),
                        data
                    );
                    payload = `Erc20 Transfer - Amount: ${decode[1]} - Address: ${decode[0]}`;
                    break;
                }
                case '0x42842e0e': {
                    //erc721 safe transfer;
                    const decode = decodeAbiParameters(
                        parseAbiParameters('address sender, address receiver, uint256 id'),
                        data
                    );
                    payload = `Erc721 Transfer - Id: ${decode[2]} - Address: ${decode[1]}`;
                    break;
                }
                case '0xf242432a': {
                    //erc155 single safe transfer;
                    const decode = decodeAbiParameters(
                        parseAbiParameters('address sender, address receiver, uint256 id, uint256 amount'),
                        data
                    );
                    payload = `Erc1155 Single Transfer - Id: ${decode[2]} Amount: ${decode[3]} - Address: ${decode[1]}`;
                    break;
                }
                case '0x2eb2c2d6': {
                    //erc155 Batch safe transfer;
                    const decode = decodeAbiParameters(
                        parseAbiParameters('address sender, address receiver, uint256[] ids, uint256[] amounts'),
                        data
                    );
                    payload = `Erc1155 Batch Transfer - Ids: ${decode[2]} Amounts: ${decode[3]} - Address: ${decode[1]}`;
                    break;
                }
                case '0xd0def521': {
                    //erc721 mint;
                    const decode = decodeAbiParameters(
                        parseAbiParameters('address receiver, string url'),
                        data
                    );
                    payload = `Mint Erc721 - String: ${decode[1]} - Address: ${decode[0]}`;
                    break;
                }
                case '0x755edd17': {
                    //erc721 mintTo;
                    const decode = decodeAbiParameters(
                        parseAbiParameters('address receiver'),
                        data
                    );
                    payload = `Mint Erc721 - Address: ${decode[0]}`;
                    break;
                }
                case '0x6a627842': {
                    //erc721 mint;
                    const decode = decodeAbiParameters(
                        parseAbiParameters('address receiver'),
                        data
                    );
                    payload = `Mint Erc721 - Address: ${decode[0]}`;
                    break;
                }
                default: {
                    payload = args[2] + " (hex)";
                    break;
                }
            }
        } else {
            payload = "(empty)";
        }
        return {
            index: n.index,
            payload: `${payload}`,
            destination: `${n?.destination ?? ""}`,
            input: (n && n.input?.id) ? {id:n.input.id,payload: inputPayload} : undefined,
        };
    }).sort((b, a) => b.index - a.index);

    const loadVoucher = async (outputIndex: number) => {
        const url = getGraphqlUrl(props.chain,props.appAddress);
        if (!url) {
            return;
        }
        const delegatedCallVoucher = await getDelegatedCallVoucher(url,outputIndex) as ExtendedDCVoucher;

        if (props.chain && props.appAddress && delegatedCallVoucher) {
            const client = await getClient(props.chain);
            if (client) {
                const executed = await client.readContract({
                    address: props.appAddress,
                    abi: Application__factory.abi,
                    functionName: 'wasOutputExecuted',
                    args: [BigInt(delegatedCallVoucher.index)]
                });
                delegatedCallVoucher.executed = executed;
            }
        }
        setDCVoucherToExecuteMsg(undefined);
        setDCVoucherToExecute(delegatedCallVoucher);
    };


    // TODO: execute voucher function
    const executeDCVoucher = async (voucher: ExtendedDCVoucher) => {
        if (!voucher || !voucher.payload) {
            setDCVoucherToExecuteMsg("no voucher");
            return
        }
        if (!voucher.proof || !voucher.proof.outputHashesSiblings || voucher.proof.outputHashesSiblings.length == 0) {
            setDCVoucherToExecuteMsg("no proof");
            return
        }
        setDCVoucherToExecuteMsg(undefined);
        if (props.chain && props.appAddress && voucher) {
            const client = await getClient(props.chain);
            const walletClient = await getWalletClient(props.chain);

            if (!client || !walletClient) return;

            const [address] = await walletClient.requestAddresses();
            if (!address) return;
            try {

                const outputIndex = voucher.proof.outputIndex;
                const outputHashesSiblings: `0x${string}`[] = voucher.proof.outputHashesSiblings as `0x${string}`[] ;
                const { request } = await client.simulateContract({
                    account: address,
                    address: props.appAddress,
                    abi: Application__factory.abi,
                    functionName: 'executeOutput',
                    args: [voucher.payload as `0x${string}`,{outputIndex,outputHashesSiblings}]
                });
                const txHash = await walletClient.writeContract(request);

                await client.waitForTransactionReceipt(
                    { hash: txHash }
                )
                setDCVoucherToExecuteMsg("Voucher executed!");
                voucher.executed = true;
                setDCVoucherToExecute(voucher);
            } catch (e) {
                console.error(e);
                if (e instanceof BaseError) {
                    setDCVoucherToExecuteMsg(e.shortMessage);
                    // setDCVoucherToExecuteMsg(e?.cause?.shortMessage);
                }

            }
        }

    }

    return (
        <div>
            <p>Voucher to execute</p>
        {dCVoucherToExecute ? <table>
            <thead>
                <tr>
                    <th>Input Id</th>
                    <th>Voucher Output Index</th>
                    <th>Destination</th>
                    <th>Action</th>
                    {/* <th>Payload</th> */}
                    <th>Msg</th>
                </tr>
            </thead>
            <tbody>
                <tr key={`${dCVoucherToExecute.input?.id}-${dCVoucherToExecute.index}`}>
                    <td>{dCVoucherToExecute.input?.id}</td>
                    <td>{dCVoucherToExecute.index}</td>
                    <td>{dCVoucherToExecute.destination}</td>
                    <td>
                        <button disabled={!dCVoucherToExecute.proof || dCVoucherToExecute.executed} onClick={() => executeDCVoucher(dCVoucherToExecute)}>{dCVoucherToExecute.proof ? (dCVoucherToExecute.executed ? "Voucher executed" : "Execute voucher") : "No proof yet"}</button>
                    </td>
                    {/* <td>{voucherToExecute.payload}</td> */}
                    <td>{dCVoucherToExecuteMsg}</td>
                </tr>
            </tbody>
        </table> : <p>Nothing yet</p>}
            <button onClick={() => setReload(reload+1)}>
                Reload
            </button>
            <table>
                <thead>
                    <tr>
                        <th>Input Id</th>
                        <th>Output Index</th>
                        <th>Destination</th>
                        <th>Value</th>
                        <th>Action</th>
                        <th>Payload</th>
                    </tr>
                </thead>
                <tbody>
                    {dcVouchers.length === 0 && (
                        <tr>
                            <td colSpan={4}>no vouchers</td>
                        </tr>
                    )}
                    {dcVouchers.map((n) => (
                        <tr key={`${n.input?.id}-${n.index}`}>
                            <td>{n.input?.id}</td>
                            <td>{n.index}</td>
                            <td>{n.destination}</td>
                            <td>
                                <button onClick={() => loadVoucher(n.index)}>Get Proof</button>
                            </td>
                            <td>{n.payload}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

        </div>
    );
};
