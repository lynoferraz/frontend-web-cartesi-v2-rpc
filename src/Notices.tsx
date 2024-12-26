import React, { useEffect, useState } from "react";
import { decodeFunctionData, fromHex } from 'viem'
import { getGraphqlUrl, getNotice, getNotices, PartialNotice } from './utils/graphql'
import { Application__factory, Outputs__factory } from "@cartesi/rollups";
import { getClient, INodeComponentProps } from "./utils/chain";


export const Notices: React.FC<INodeComponentProps> = (props: INodeComponentProps) => {
    const [fetching, setFetching] = useState<boolean>(false);
    const [error, setError] = useState<string>();
    const [reload, setReload] = useState<number>(0);
    const [noticesData, setNoticesData] = useState<PartialNotice[]>([]);
    const [noticeToValidate, setNoticeToValidate] = useState<PartialNotice>();
    const [validateNoticeMsg, setValidateNoticeMsg] = useState<string>();

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
        setNoticeToValidate(undefined);
        setValidateNoticeMsg(undefined);
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
        const payload_data = n?.payload;
        let payload: string;
        if (payload_data) {
            const { args } = decodeFunctionData({
                abi: Outputs__factory.abi,
                data: payload_data as `0x${string}`
            })
            payload = args[0];
            const decoder = new TextDecoder("utf8", { fatal: true });
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

    const loadNotice = async (outputIndex: number) => {
        const url = getGraphqlUrl(props.chain,props.appAddress);
        if (!url) {
            return;
        }
        const notice = await getNotice(url,outputIndex);

        setNoticeToValidate(notice);
        setValidateNoticeMsg(undefined);
    };


    const validateNotice = async (notice: PartialNotice) => {
        if (!notice || !notice.payload) {
            setValidateNoticeMsg("no notice");
            return
        }
        if (!notice.proof || !notice.proof.outputHashesSiblings || notice.proof.outputHashesSiblings.length == 0) {
            setValidateNoticeMsg("no proof");
            return
        }
        setValidateNoticeMsg(undefined);
        if (props.chain && props.appAddress && notice) {
            const client = await getClient(props.chain);

            if (!client) return;

            try {
                const outputIndex = notice.proof.outputIndex;
                const outputHashesSiblings: `0x${string}`[] = notice.proof.outputHashesSiblings as `0x${string}`[] ;
                await client.readContract({
                    address: props.appAddress,
                    abi: Application__factory.abi,
                    functionName: 'validateOutput',
                    args: [notice.payload as `0x${string}`,{outputIndex,outputHashesSiblings}]
                });
                setValidateNoticeMsg("Notice is Valid!");
            } catch (e: any) {
                console.log(e);
                setValidateNoticeMsg(e?.cause?.data?.errorName ? e?.cause?.data?.errorName : e?.cause?.shortMessage);
            }
        }

    }

    // const forceUpdate = useForceUpdate();
    return (
        <div>
            <p>Notice to Validate</p>
            {noticeToValidate ? <table>
                <thead>
                    <tr>
                        <th>Input Id</th>
                        <th>Notice Output Index</th>
                        <th>Action</th>
                        {/* <th>Payload</th> */}
                        <th>Msg</th>
                    </tr>
                </thead>
                <tbody>
                    <tr key={`${noticeToValidate.input?.id}-${noticeToValidate.index}`}>
                        <td>{noticeToValidate.input?.id}</td>
                        <td>{noticeToValidate.index}</td>
                        <td>
                            <button disabled={!noticeToValidate.proof} onClick={() => validateNotice(noticeToValidate)}>{noticeToValidate.proof ? "Validate Notice" : "No proof yet"}</button>
                        </td>
                        {/* <td>{voucherToExecute.payload}</td> */}
                        <td>{validateNoticeMsg}</td>
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
                        <th>Notice Output Index</th>
                        {/* <th>Input Payload</th> */}
                        <th>Action</th>
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
                            <td>
                                <button onClick={() => loadNotice(n.index)}>Get Proof</button>
                            </td>
                            <td>{n.payload}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

        </div>
    );
};
