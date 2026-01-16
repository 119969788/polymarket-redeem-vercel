import { useState } from "react";
import { ethers } from "ethers";
import { request, gql } from "graphql-request";

const SUBGRAPH_URL = "https://api.thegraph.com/subgraphs/name/polymarket/ctf-exchange-polygon";

const CONDITIONAL_TOKENS = "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045";
const USDC_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const ABI = [
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] calldata indexSets) external"
];

const QUERY = gql`
  query Positions($user: String!) {
    user(id: $user) {
      positions(where: { balance_gt: "0" }) {
        condition {
          id
          resolved
          outcomeSlotCount
        }
      }
    }
  }
`;

function buildIndexSets(outcomes) {
  const sets = [];
  for (let i = 0; i < outcomes; i++) {
    sets.push(1 << i);
  }
  return sets;
}

export default function App() {
  const [wallet, setWallet] = useState("");
  const [log, setLog] = useState([]);
  const [redeemable, setRedeemable] = useState([]);

  function pushLog(msg) {
    setLog(l => [...l, msg]);
  }

  async function connectWallet() {
    if (!window.ethereum) {
      alert("请安装 MetaMask / Rabby / OKX Wallet");
      return;
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);

    setWallet(accounts[0]);
    pushLog(`钱包已连接: ${accounts[0]}`);

    await scanPositions(accounts[0]);
  }

  async function scanPositions(address) {
    pushLog("扫描仓位中...");

    const data = await request(SUBGRAPH_URL, QUERY, {
      user: address.toLowerCase()
    });

    if (!data.user) {
      pushLog("未发现仓位");
      return;
    }

    const resolved = data.user.positions.filter(p => p.condition.resolved);
    setRedeemable(resolved);

    pushLog(`发现 ${resolved.length} 个可赎回市场`);
  }

  async function redeemAll() {
    if (!window.ethereum) return;

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    const contract = new ethers.Contract(
      CONDITIONAL_TOKENS,
      ABI,
      signer
    );

    for (const pos of redeemable) {
      const conditionId = pos.condition.id;
      const count = parseInt(pos.condition.outcomeSlotCount);
      const indexSets = buildIndexSets(count);

      try {
        pushLog(`赎回中: ${conditionId}`);

        const tx = await contract.redeemPositions(
          USDC_POLYGON,
          ethers.ZeroHash,
          conditionId,
          indexSets
        );

        pushLog(`交易发送: ${tx.hash}`);
        await tx.wait();
        pushLog(`成功: ${conditionId}`);
      } catch (err) {
        pushLog(`失败: ${conditionId}`);
      }
    }

    pushLog("全部处理完成");
  }

  return (
    <div style={{ padding: 30, fontFamily: "sans-serif", maxWidth: 600 }}>
      <h2>Polymarket Polygon 一键全仓赎回</h2>

      {!wallet && (
        <button onClick={connectWallet}>
          连接钱包
        </button>
      )}

      {wallet && (
        <>
          <p>钱包: {wallet}</p>
          <button onClick={redeemAll} disabled={redeemable.length === 0}>
            一键赎回全部仓位
          </button>
        </>
      )}

      <div style={{ marginTop: 20 }}>
        <h4>日志</h4>
        <div style={{ background: "#111", color: "#0f0", padding: 10, minHeight: 200 }}>
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
