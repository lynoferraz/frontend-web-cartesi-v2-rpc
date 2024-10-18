
import React, { useEffect, useState } from "react";
import { fromHex } from 'viem'
import { getGraphqlUrl, getReports, PartialReport } from './utils/graphql'
import { INodeComponentProps } from "./utils/chain";


export const Reports: React.FC<INodeComponentProps> = (props: INodeComponentProps) => {
    const [fetching, setFetching] = useState<boolean>(false);
    const [error, setError] = useState<string>();
    const [reload, setReload] = useState<number>(0);
    const [reportsData, setReportsData] = useState<PartialReport[]>([]);

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
        getReports(url).then(n => {
            setReportsData(n);
            setFetching(false);
        });

    }, [props,reload]);

    if (fetching) return <p>Loading...</p>;
    if (error) return <p>Oh no... {error}</p>;

    if (!reportsData) return <p>No reports</p>;

    const reports: PartialReport[] = reportsData.map((node: PartialReport) => {
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
        let payload = n?.payload;
        if (payload) {
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
                        <th>Report Index</th>
                        <th>Payload</th>
                    </tr>
                </thead>
                <tbody>
                    {reports.length === 0 && (
                        <tr>
                            <td colSpan={4}>no reports</td>
                        </tr>
                    )}
                    {reports.map((n: any) => (
                        <tr key={`${n.input.id}-${n.index}`}>
                            <td>{n.input.id}</td>
                            <td>{n.index}</td>
                            <td>{n.payload}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

        </div>
    );
};
