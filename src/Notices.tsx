import React, { useEffect, useState } from "react";
import { BaseError, decodeFunctionData, fromHex, isHex } from 'viem'
import { getGraphqlUrl, getNotice, getNotices, PartialNotice } from './utils/graphql'
import { getClient, INodeComponentProps } from "./utils/chain";
import { applicationFactoryAbi, outputsAbi } from "./generated/rollups";


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
                console.warn(e);
                inputPayload = inputPayload + " (hex)";
            }
        } else {
            inputPayload = "(empty)";
        }
        const payload_data = n?.payload;
        let payload: string;
        if (isHex(payload_data)) {
            const { args } = decodeFunctionData({
                abi: outputsAbi,
                data: payload_data
            })
            payload = args[0];
            const decoder = new TextDecoder("utf8", { fatal: true });
            try {
                if(!isHex(payload)) throw new Error("not hex");
                payload = decoder.decode(fromHex(payload, 'bytes'));
            } catch (e) {
                console.warn(e);
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
    }).sort((b, a) => {
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
                    abi: applicationFactoryAbi,
                    functionName: 'validateOutput',
                    args: [notice.payload as `0x${string}`,{outputIndex,outputHashesSiblings}]
                });
                setValidateNoticeMsg("Notice is Valid!");
            } catch (e) {
                console.error(e);
                if (e instanceof BaseError) {
                    setValidateNoticeMsg(e.walk().message);
                }
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
                    {notices.map((n) => (
                        <tr key={`${n.input?.id}-${n.index}`}>
                            <td>{n.input?.id}</td>
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
