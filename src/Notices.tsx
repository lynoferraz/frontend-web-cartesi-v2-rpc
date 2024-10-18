import React, { useEffect, useState } from "react";
import { decodeFunctionData, fromHex } from 'viem'
import { getGraphqlUrl, getNotices, PartialNotice } from './utils/graphql'
import { Outputs__factory } from "@cartesi/rollups";
import { INodeComponentProps } from "./utils/chain";


export const Notices: React.FC<INodeComponentProps> = (props: INodeComponentProps) => {
    const [fetching, setFetching] = useState<boolean>(false);
    const [error, setError] = useState<string>();
    const [reload, setReload] = useState<number>(0);
    const [noticesData, setNoticesData] = useState<PartialNotice[]>([]);

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
        getNotices(url).then(n => {
            setNoticesData(n);
            setFetching(false);
        });

    }, [props,reload]);

    
    if (fetching) return <p>Loading...</p>;
    if (error) return <p>Oh no... {error}</p>;

    if (!noticesData) return <p>No notices</p>;

    const notices: PartialNotice[] = noticesData.map((node: PartialNotice) => {
        const n = node;
        let inputPayload = n?.input?.payload;
        if (inputPayload) {
            try {
                inputPayload = fromHex(inputPayload as `0x${string}`, 'string');
            } catch (e) {
                inputPayload = inputPayload + " (hex)";
            }
        } else {
            inputPayload = "(empty)";
        }
        let payload_data = n?.payload;
        let payload: string;
        if (payload_data) {
            const { args } = decodeFunctionData({
                abi: Outputs__factory.abi,
                data: payload_data as `0x${string}`
            })
            payload = args[0];
            let decoder = new TextDecoder("utf8", { fatal: true });
            try {
                payload = decoder.decode(fromHex(payload as `0x${string}`, 'bytes'));
            } catch (e) {
                payload = payload + " (hex)";
            }
        } else {
            payload = "(empty)";
        }
        return {
            index: n.index,
            payload: `${payload}`,
            input: (n && n.input?.id) ? {id:n.input.id,payload: inputPayload} : undefined,
        };
    }).sort((b: any, a: any) => {
        return b.index - a.index;
    });

    // const forceUpdate = useForceUpdate();
    return (
        <div>
            <button onClick={() => setReload(reload+1)}>
                Reload
            </button>
            <table>
                <thead>
                    <tr>
                        <th>Input Id</th>
                        <th>Notice Output Index</th>
                        {/* <th>Input Payload</th> */}
                        <th>Payload</th>
                    </tr>
                </thead>
                <tbody>
                    {notices.length === 0 && (
                        <tr>
                            <td colSpan={4}>no notices</td>
                        </tr>
                    )}
                    {notices.map((n: any) => (
                        <tr key={`${n.input.id}-${n.index}`}>
                            <td>{n.input.id}</td>
                            <td>{n.index}</td>
                            {/* <td>{n.input.payload}</td> */}
                            <td>{n.payload}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

        </div>
    );
};
