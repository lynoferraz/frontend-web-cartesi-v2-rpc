import React, { useEffect, useRef, useState } from "react";
import {
  BaseError,
  decodeAbiParameters,
  formatEther,
  fromHex,
  isHex,
  parseAbiItem,
  parseAbiParameters,
  parseEventLogs,
  size,
  slice,
} from "viem";
import { getClient, getWalletClient, getL2Client, chains } from "./utils/chain";
import { INodeComponentProps } from "./utils/models";
import { Output } from "@cartesi/viem";

function inferVoucherPayload(voucherPayload: `0x${string}`): string {
  const selector =
    voucherPayload && size(voucherPayload) > 4
      ? slice(voucherPayload, 0, 4)
      : "";
  const data =
    voucherPayload && size(voucherPayload) > 4
      ? slice(voucherPayload, 4, voucherPayload.length)
      : "0x";

  if (size(data) > 0) {
    switch (selector.toLowerCase()) {
      case "0xa9059cbb": {
        // erc20 transfer;
        const decode = decodeAbiParameters(
          parseAbiParameters("address receiver, uint256 amount"),
          data,
        );
        return `Erc20 Transfer - Amount: ${decode[1]} - Address: ${decode[0]}`;
      }
      case "0x42842e0e": {
        //erc721 safe transfer;
        const decode = decodeAbiParameters(
          parseAbiParameters("address sender, address receiver, uint256 id"),
          data,
        );
        return `Erc721 Transfer - Id: ${decode[2]} - Address: ${decode[1]}`;
      }
      case "0xf242432a": {
        //erc155 single safe transfer;
        const decode = decodeAbiParameters(
          parseAbiParameters(
            "address sender, address receiver, uint256 id, uint256 amount",
          ),
          data,
        );
        return `Erc1155 Single Transfer - Id: ${decode[2]} Amount: ${decode[3]} - Address: ${decode[1]}`;
      }
      case "0x2eb2c2d6": {
        //erc155 Batch safe transfer;
        const decode = decodeAbiParameters(
          parseAbiParameters(
            "address sender, address receiver, uint256[] ids, uint256[] amounts",
          ),
          data,
        );
        return `Erc1155 Batch Transfer - Ids: ${decode[2]} Amounts: ${decode[3]} - Address: ${decode[1]}`;
      }
      case "0xd0def521": {
        //erc721 mint;
        const decode = decodeAbiParameters(
          parseAbiParameters("address receiver, string url"),
          data,
        );
        return `Mint Erc721 - String: ${decode[1]} - Address: ${decode[0]}`;
      }
      case "0x755edd17": {
        //erc721 mintTo;
        const decode = decodeAbiParameters(
          parseAbiParameters("address receiver"),
          data,
        );
        return `Mint Erc721 - Address: ${decode[0]}`;
      }
      case "0x6a627842": {
        //erc721 mint;
        const decode = decodeAbiParameters(
          parseAbiParameters("address receiver"),
          data,
        );
        return `Mint Erc721 - Address: ${decode[0]}`;
      }
      default: {
        return voucherPayload + " (hex)";
      }
    }
  }
  return "(empty)";
}

async function getOutputs(
  appAddress: string,
  nodeAddress: string,
  filter: Record<string, unknown>,
) {
  if (!nodeAddress) return [];
  const client = await getL2Client(nodeAddress + "/rpc");
  if (!client) return [];
  const outputResponse = await client.listOutputs({
    ...filter,
    application: appAddress,
  });
  return outputResponse.data;
}

async function getLastAcceptedEpoch(appAddress: string, nodeAddress: string) {
  if (!nodeAddress) return BigInt(0);
  const client = await getL2Client(nodeAddress + "/rpc");
  if (!client) return BigInt(0);
  const outputResponse = await client.getLastAcceptedEpoch({
    application: appAddress,
  });
  return outputResponse.index;
}

export const Outputs: React.FC<INodeComponentProps> = (
  props: INodeComponentProps,
) => {
  const [fetching, setFetching] = useState<boolean>(false);
  const [error, setError] = useState<string>();
  const rpcFilter = useRef<Record<string, unknown>>({});
  const [showFilter, setShowFilter] = useState<boolean>(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [lastAcceptedEpoch, setLastAcceptedEpoch] = useState<bigint>(BigInt(0));
  const [outputMsg, setOutputMsg] = useState<string>();

  useEffect(() => {
    setFetching(true);
    setOutputMsg(undefined);
    getOutputs(props.appAddress, props.nodeAddress, rpcFilter.current)
      .then((out) => setOutputs(out))
      .finally(() => setFetching(false));
    getLastAcceptedEpoch(props.appAddress, props.nodeAddress).then((epoch) =>
      setLastAcceptedEpoch(epoch),
    );
  }, [props]);

  async function reloadOutputs() {
    if (!props.chain) {
      setError("No connected chain");
      return;
    }
    setFetching(true);
    setOutputMsg(undefined);
    reloadOutputProperties();
    const out = await getOutputs(
      props.appAddress,
      props.nodeAddress,
      rpcFilter.current,
    );
    setOutputs(out);
    setFetching(false);
  }

  async function reloadOutputProperties() {
    const epoch = await getLastAcceptedEpoch(
      props.appAddress,
      props.nodeAddress,
    );
    setLastAcceptedEpoch(epoch);
  }

  if (fetching) return <p>Loading...</p>;
  if (error) return <p>Oh no... {error}</p>;

  if (!outputs) return <p>No outputs</p>;

  function handleFilterChange(key: string, value: unknown) {
    rpcFilter.current[key] = value;
  }

  async function validateOutput(output: Output) {
    setOutputMsg(undefined);
    if (props.chain && props.appAddress) {
      const client = await getClient(props.chain);

      if (!client) return;

      try {
        if (
          await client.validateOutput({
            output: output,
            application: props.appAddress,
          })
        ) {
          setOutputMsg("Output is Valid!");
        } else {
          setOutputMsg("Output is Invalid!");
        }
      } catch (e) {
        console.error(e);
        if (e instanceof BaseError) {
          setOutputMsg(e.walk().message);
        }
      }
    }
  }

  async function executeOutput(output: Output) {
    setOutputMsg(undefined);
    if (props.chain && props.appAddress) {
      const client = await getClient(props.chain);
      const walletClient = await getWalletClient(props.chain);

      if (!client || !walletClient) return;

      const [address] = await walletClient.requestAddresses();
      if (!address) return;

      try {
        if (
          await walletClient.executeOutput({
            application: props.appAddress,
            output: output,
            account: address,
            chain: chains[props.chain],
          })
        ) {
          setOutputMsg("Output executed!");
        } else {
          setOutputMsg("Output not executed!");
        }
      } catch (e) {
        console.error(e);
        if (e instanceof BaseError) {
          setOutputMsg(e.walk().message);
        }
      }
    }
  }

  function renderActionButton(output: Output) {
    const decodedData = output.decodedData as Record<string, unknown>;
    const type: string =
      decodedData && decodedData.type ? (decodedData.type as string) : "";
    let alreadyExecuted: boolean | undefined = undefined;
    const claimAccepted = output.epochIndex <= lastAcceptedEpoch;
    switch (type.toLowerCase()) {
      case "voucher":
      case "delegatecallvoucher":
        alreadyExecuted = output.executionTransactionHash != null;
        return (
          <button
            disabled={alreadyExecuted || !claimAccepted}
            onClick={() => executeOutput(output)}
          >
            {claimAccepted
              ? alreadyExecuted
                ? "Already Executed"
                : "Execute"
              : "Not Ready"}
          </button>
        );
      case "notice":
        return (
          <button
            disabled={!claimAccepted}
            onClick={() => validateOutput(output)}
          >
            {claimAccepted ? "Validate" : "Not Ready"}
          </button>
        );
    }
    return null;
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
          value={(rpcFilter.current.output_type as string) || ""}
          onChange={(e) => handleFilterChange("output_type", e.target.value)}
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
      <button onClick={() => reloadOutputs()}>Reload</button>
      <br />
      <br />
      <span className="text-bold">Message:</span> {outputMsg}
      <br />
      <br />
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Input Id</th>
            <th>Output Index</th>
            <th>Type</th>
            <th>Payload</th>
          </tr>
        </thead>
        <tbody>
          {outputs.length === 0 && (
            <tr>
              <td colSpan={4}>no outputs</td>
            </tr>
          )}
          {outputs.map((n, index) => {
            const decodedData = n.decodedData as Record<string, unknown>;
            const type: string =
              decodedData && decodedData.type
                ? (decodedData.type as string)
                : "";
            let value = "";
            let destination = "";
            let payload: string =
              decodedData && decodedData.payload
                ? (decodedData.payload as string)
                : "";
            switch (type.toLowerCase()) {
              case "voucher":
                payload = inferVoucherPayload(payload as `0x${string}`);
                value =
                  decodedData && decodedData.value
                    ? formatEther(
                        fromHex(decodedData.value as `0x${string}`, "bigint"),
                      )
                    : "";
                destination =
                  decodedData && decodedData.destination
                    ? (decodedData.destination as string)
                    : "";
                break;
              case "notice":
                try {
                  if (!isHex(payload)) throw new Error("not hex");
                  payload = decoder.decode(fromHex(payload, "bytes"));
                } catch {
                  payload = payload + " (hex)";
                }
                break;
              default:
                payload = "unknown";
            }
            return (
              <tr key={`${index}`}>
                <td>{n.updatedAt.toLocaleString()}</td>
                <td>{n.inputIndex}</td>
                <td>{n.index}</td>
                <td>{type}</td>
                {type.toLowerCase() === "voucher" ? <td>{value}</td> : null}
                {type.toLowerCase() === "voucher" ? (
                  <td>{destination}</td>
                ) : null}
                <td>{renderActionButton(n)}</td>
                <td>{payload}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
