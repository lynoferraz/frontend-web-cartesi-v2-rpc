import React, { useEffect, useRef, useState } from "react";
import { fromHex, isHex } from "viem";
import { Report } from "@cartesi/viem";
import { getL2Client } from "./utils/chain";
import { INodeComponentProps } from "./utils/models";

async function getReports(
  appAddress: string,
  nodeAddress: string,
  filter: Record<string, unknown>,
) {
  if (!nodeAddress) return [];
  const client = await getL2Client(nodeAddress + "/rpc");
  if (!client) return [];
  const reportResponse = await client.listReports({
    ...filter,
    application: appAddress,
  });
  return reportResponse.data;
}

export const Reports: React.FC<INodeComponentProps> = (
  props: INodeComponentProps,
) => {
  const [fetching, setFetching] = useState<boolean>(false);
  const [error, setError] = useState<string>();
  const rpcFilter = useRef<Record<string, unknown>>({});
  const [showFilter, setShowFilter] = useState<boolean>(false);
  const [reports, setReports] = useState<Report[]>([]);
  // const [reportToExecute, setReportToExecute] = useState<ExtendedReport>();

  useEffect(() => {
    setFetching(true);
    getReports(props.appAddress, props.nodeAddress, rpcFilter.current)
      .then((out) => setReports(out))
      .finally(() => setFetching(false));
  }, [props]);

  async function loadReports() {
    if (!props.chain) {
      setError("No connected chain");
      return;
    }
    setFetching(true);
    const out = await getReports(
      props.appAddress,
      props.nodeAddress,
      rpcFilter.current,
    );
    setReports(out);
    setFetching(false);
  }

  if (fetching) return <p>Loading...</p>;
  if (error) return <p>Oh no... {error}</p>;

  if (!reports) return <p>No reports</p>;

  function handleFilterChange(key: string, value: unknown) {
    rpcFilter.current[key] = value;
  }

  const decoder = new TextDecoder("utf8", { fatal: true });

  return (
    <div>
      <button onClick={() => setShowFilter(!showFilter)}>Toggle Filter</button>
      <div hidden={!showFilter}>
        Limit:{" "}
        <input
          type="number"
          value={(rpcFilter.current.limit as number) || ""}
          onChange={(e) => handleFilterChange("limit", e.target.value)}
        />
        <br />
        Offset:{" "}
        <input
          type="number"
          value={(rpcFilter.current.offset as number) || ""}
          onChange={(e) => handleFilterChange("limit", e.target.value)}
        />
        <br />
        Type:{" "}
        <input
          type="text"
          value={(rpcFilter.current.report_type as string) || ""}
          onChange={(e) => handleFilterChange("report_type", e.target.value)}
        />
        <br />
        Epoch:{" "}
        <input
          type="number"
          value={(rpcFilter.current.epoch_index as number) || ""}
          onChange={(e) => handleFilterChange("epoch_index", e.target.value)}
        />
        <br />
        Input:{" "}
        <input
          type="text"
          value={(rpcFilter.current.input_index as number) || ""}
          onChange={(e) => handleFilterChange("input_index", e.target.value)}
        />
        <br />
        Voucher address:{" "}
        <input
          type="text"
          value={(rpcFilter.current.voucher_address as string) || ""}
          onChange={(e) =>
            handleFilterChange("voucher_address", e.target.value)
          }
        />
      </div>
      <br />
      <button onClick={() => loadReports()}>Reload</button>
      <br />
      <table>
        <thead>
          <tr>
            <th>Date</th>
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
          {reports.map((n, index) => {
            let payload: string = n.rawData && n.rawData ? n.rawData : "";
            try {
              if (!isHex(payload)) throw new Error("not hex");
              payload = decoder.decode(fromHex(payload, "bytes"));
            } catch {
              payload = payload + " (hex)";
            }
            return (
              <tr key={`${index}`}>
                <td>{n.updatedAt.toLocaleString()}</td>
                <td>{n.inputIndex}</td>
                <td>{n.index}</td>
                <td>{payload}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
